import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { convertToPresentation, generateRevealHTML } from '../services/document-converter.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { jobQueue } from '../services/job-queue.js';
import { indexUploadedFile } from '../services/file-indexer.js';
import pdfParse from 'pdf-parse';

export const converterRoutes = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const convertToPresentationSchema = z.object({
  content: z.string().min(1),
  userPrompt: z.string().optional(),
  maxSlidesPerSection: z.number().min(1).max(10).optional(),
  includeImages: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'corporate', 'modern']).optional(),
});

/**
 * POST /api/converter/to-presentation
 * Converts document content to presentation
 */
converterRoutes.post('/to-presentation', async (req, res) => {
  try {
    console.log('[Converter Route] Received conversion request');
    console.log('[Converter Route] Content length:', req.body.content?.length || 0);
    
    const data = convertToPresentationSchema.parse(req.body);

    const presentation = await convertToPresentation({
      sourceContent: data.content,
      userPrompt: data.userPrompt,
      maxSlidesPerSection: data.maxSlidesPerSection || 4,
      includeImages: data.includeImages ?? true,
      theme: data.theme || 'modern',
    });

    const html = generateRevealHTML(presentation);

    console.log('[Converter Route] Conversion successful');

    res.json({
      presentation,
      html,
    });
  } catch (error: any) {
    console.error('[Converter Route] Conversion failed:', error);
    res.status(500).json({
      error: error.message || 'Conversion failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * POST /api/converter/upload
 * Upload file and convert to markdown document
 */
converterRoutes.post('/upload', authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const file = req.file;
    const userId = req.user?.id;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log('[Converter Upload] File:', file.originalname, 'Size:', file.size, 'User:', userId);

    // Extract text based on file type
    let content = '';
    let title = file.originalname.replace(/\.[^/.]+$/, ''); // Remove extension

    const ext = file.originalname.toLowerCase().split('.').pop();

    if (ext === 'txt' || ext === 'md') {
      // Plain text or markdown
      content = file.buffer.toString('utf-8');
    } else if (ext === 'pdf') {
      // Extract text from PDF
      try {
        const pdfData = await pdfParse(file.buffer);
        content = `# ${title}\n\n`;
        content += pdfData.text;
        
        // Add metadata as footnote
        content += `\n\n---\n\n`;
        content += `*PDF-Metadaten:*\n`;
        content += `- Seiten: ${pdfData.numpages}\n`;
        content += `- Dateiname: ${file.originalname}\n`;
        content += `- Größe: ${(file.size / 1024).toFixed(2)} KB\n`;
        
        console.log(`[PDF Extract] Extracted ${pdfData.text.length} characters from ${pdfData.numpages} pages`);
      } catch (error) {
        console.error('[PDF Extract] Failed:', error);
        // Fallback to placeholder
        content = `# ${title}\n\n> **Fehler**: PDF-Text konnte nicht extrahiert werden.\n\n`;
        content += `Dateiname: ${file.originalname}\n`;
        content += `Größe: ${(file.size / 1024).toFixed(2)} KB\n\n`;
        content += `Möglicherweise ist das PDF beschädigt oder verschlüsselt.\n`;
      }
    } else if (ext === 'docx' || ext === 'doc') {
      // For DOCX, similar placeholder
      content = `# ${title}\n\n> **Hinweis**: Word-Dokument hochgeladen. Vollständige Textextraktion erfordert zusätzliche Bibliotheken.\n\n`;
      content += `Dateiname: ${file.originalname}\n`;
      content += `Größe: ${(file.size / 1024).toFixed(2)} KB\n\n`;
      content += `Für die vollständige Textextraktion können Sie den Text aus Word kopieren und hier einfügen.\n`;
    } else {
      return res.status(400).json({ 
        error: 'Unsupported file type',
        supported: ['txt', 'md', 'pdf', 'doc', 'docx']
      });
    }

    // If markdown starts with heading, use that as title
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].trim();
    }

    // Create document in database
    const db = getDatabase();
    const documentId = randomUUID();
    const now = Date.now();

    // Generate unique slug from title
    const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug;
    let counter = 1;
    while (db.prepare('SELECT id FROM documents WHERE slug = ?').get(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    db.prepare(`
      INSERT INTO documents (id, title, slug, content, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(documentId, title, slug, content, userId, now, now);

    // Create initial version
    const versionId = randomUUID();
    db.prepare(`
      INSERT INTO document_versions (id, document_id, version, title, content, change_summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(versionId, documentId, 1, title, content, `Dokument hochgeladen: ${file.originalname}`, now);

    console.log('[Converter Upload] Document created:', documentId);

    // Queue document indexing as background job (non-blocking)
    if (config.features.enableVectorStore) {
      const jobId = jobQueue.addJob('index-document', {
        documentId,
        title,
        content,
        version: 1,
      }, {
        priority: 5, // Normal priority
        maxAttempts: 3,
      });
      
      console.log(`📋 Uploaded document indexing queued as job ${jobId}`);
    }

    // Also index the file separately if it's TXT/MD for upload-specific search
    if (ext === 'txt' || ext === 'md') {
      indexUploadedFile(
        documentId,
        {
          buffer: file.buffer,
          fileName: file.originalname,
          fileType: 'txt' as const,
        },
        userId
      )
        .then(result => {
          console.log(`✅ Indexed uploaded file: ${result.chunksIndexed} chunks`);
        })
        .catch(error => {
          console.error('⚠️ Failed to index file separately:', error);
        });
    }

    return res.json({
      success: true,
      document: {
        id: documentId,
        title,
        content,
        created_at: now,
        updated_at: now,
      }
    });
  } catch (error: any) {
    console.error('[Converter Upload] Upload failed:', error);
    return res.status(500).json({
      error: error.message || 'Upload failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});
