import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { randomUUID } from 'crypto';

export const artifactsRoutes = Router({ mergeParams: true });

const createArtifactSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
});

const updateArtifactSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
});

const copyArtifactSchema = z.object({
  targetDocumentId: z.string().min(1),
  moveInsteadOfCopy: z.boolean().optional().default(false),
});

const convertToDocumentSchema = z.object({
  title: z.string().min(1),
});

interface DocumentParams {
  documentId: string;
}

interface ArtifactParams extends DocumentParams {
  artifactId: string;
}

// Get all artifacts for a document
artifactsRoutes.get('/', (req: Request<DocumentParams>, res: Response) => {
  const { documentId } = req.params;
  const db = getDatabase();

  // If no documentId in params, return all artifacts (library view)
  if (!documentId) {
    const artifacts = db.prepare(`
      SELECT a.id, a.document_id as documentId, a.title, a.content, 
             a.created_at as createdAt, a.updated_at as updatedAt,
             d.title as documentTitle, d.slug as documentSlug
      FROM artifacts a
      LEFT JOIN documents d ON a.document_id = d.id
      ORDER BY a.created_at DESC
    `).all();

    res.json({ artifacts });
    return;
  }

  // Otherwise return artifacts for specific document
  const artifacts = db.prepare(`
    SELECT id, document_id as documentId, title, content, 
           created_at as createdAt, updated_at as updatedAt
    FROM artifacts
    WHERE document_id = ?
    ORDER BY created_at DESC
  `).all(documentId);

  res.json({ artifacts });
});

// Get a single artifact
artifactsRoutes.get('/:artifactId', (req: Request<ArtifactParams>, res: Response) => {
  const { documentId, artifactId } = req.params;
  const db = getDatabase();

  const artifact = db.prepare(`
    SELECT id, document_id as documentId, title, content,
           created_at as createdAt, updated_at as updatedAt
    FROM artifacts
    WHERE id = ? AND document_id = ?
  `).get(artifactId, documentId);

  if (!artifact) {
    throw new AppError(404, 'Artifact not found');
  }

  res.json({ artifact });
});

// Create a new artifact
artifactsRoutes.post('/', (req: Request<DocumentParams>, res: Response) => {
  const { documentId } = req.params;
  const data = createArtifactSchema.parse(req.body);
  const db = getDatabase();

  // Verify document exists
  const document = db.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
  if (!document) {
    throw new AppError(404, 'Document not found');
  }

  const id = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO artifacts (id, document_id, title, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, documentId, data.title, data.content, now, now);

  const artifact = db.prepare(`
    SELECT id, document_id as documentId, title, content,
           created_at as createdAt, updated_at as updatedAt
    FROM artifacts
    WHERE id = ?
  `).get(id);

  res.json({ artifact });
});

// Update an artifact
artifactsRoutes.put('/:artifactId', async (req: Request<ArtifactParams>, res: Response) => {
  const { documentId, artifactId } = req.params;
  const data = updateArtifactSchema.parse(req.body);
  const db = getDatabase();

  // Verify artifact exists and belongs to document
  const existing = db.prepare(`
    SELECT id FROM artifacts WHERE id = ? AND document_id = ?
  `).get(artifactId, documentId);

  if (!existing) {
    throw new AppError(404, 'Artifact not found');
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (data.title !== undefined) {
    updates.push('title = ?');
    values.push(data.title);
  }

  if (data.content !== undefined) {
    updates.push('content = ?');
    values.push(data.content);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(artifactId);

    db.prepare(`
      UPDATE artifacts
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    // If content was updated, sync to all documents with embedded instances
    if (data.content !== undefined) {
      await syncArtifactToDocuments(artifactId, data.content);
    }
  }

  const artifact = db.prepare(`
    SELECT id, document_id as documentId, title, content,
           created_at as createdAt, updated_at as updatedAt
    FROM artifacts
    WHERE id = ?
  `).get(artifactId);

  res.json({ artifact });
});

/**
 * Helper: Sync artifact content to all documents with embedded instances
 */
async function syncArtifactToDocuments(artifactId: string, newContent: string) {
  const db = getDatabase();
  const { parseEmbeddedArtifacts, updateEmbeddedArtifact } = await import('../services/artifact-embed.js');
  
  // Get all documents
  const documents = db.prepare('SELECT id, slug, content FROM documents').all() as any[];
  
  for (const doc of documents) {
    // Parse document to find embedded artifacts
    const embeddedArtifacts = parseEmbeddedArtifacts(doc.content);
    
    // Check if this artifact is embedded
    if (embeddedArtifacts.has(artifactId)) {
      // Update the embedded content
      const updatedContent = updateEmbeddedArtifact(doc.content, artifactId, newContent);
      
      // Save updated document
      const now = Date.now();
      db.prepare(`
        UPDATE documents 
        SET content = ?, updated_at = ?
        WHERE id = ?
      `).run(updatedContent, now, doc.id);
      
      // Save to git
      const { saveDocument } = await import('../services/git.js');
      await saveDocument(doc.slug, updatedContent, `Sync embedded artifact: ${artifactId}`);
    }
  }
}


// Delete an artifact
artifactsRoutes.delete('/:artifactId', (req: Request<ArtifactParams>, res: Response) => {
  const { documentId, artifactId } = req.params;
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM artifacts
    WHERE id = ? AND document_id = ?
  `).run(artifactId, documentId);

  if (result.changes === 0) {
    throw new AppError(404, 'Artifact not found');
  }

  res.json({ success: true });
});

// Copy or move artifact to another document
artifactsRoutes.post('/:artifactId/copy', (req: Request<ArtifactParams>, res: Response) => {
  const { documentId, artifactId } = req.params;
  const data = copyArtifactSchema.parse(req.body);
  const db = getDatabase();

  // Verify source artifact exists
  const sourceArtifact = db.prepare(`
    SELECT id, title, content FROM artifacts WHERE id = ? AND document_id = ?
  `).get(artifactId, documentId) as { id: string; title: string; content: string } | undefined;

  if (!sourceArtifact) {
    throw new AppError(404, 'Source artifact not found');
  }

  // Verify target document exists
  const targetDocument = db.prepare('SELECT id FROM documents WHERE id = ?').get(data.targetDocumentId);
  if (!targetDocument) {
    throw new AppError(404, 'Target document not found');
  }

  if (data.moveInsteadOfCopy) {
    // Move: Update document_id and updated_at
    const now = Date.now();
    db.prepare(`
      UPDATE artifacts
      SET document_id = ?, updated_at = ?
      WHERE id = ?
    `).run(data.targetDocumentId, now, artifactId);

    const artifact = db.prepare(`
      SELECT id, document_id as documentId, title, content,
             created_at as createdAt, updated_at as updatedAt
      FROM artifacts
      WHERE id = ?
    `).get(artifactId);

    res.json({ artifact, moved: true });
  } else {
    // Copy: Create new artifact in target document
    const newId = randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO artifacts (id, document_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newId, data.targetDocumentId, sourceArtifact.title, sourceArtifact.content, now, now);

    const artifact = db.prepare(`
      SELECT id, document_id as documentId, title, content,
             created_at as createdAt, updated_at as updatedAt
      FROM artifacts
      WHERE id = ?
    `).get(newId);

    res.json({ artifact, moved: false });
  }
});

// Convert artifact to a new document
artifactsRoutes.post('/:artifactId/convert-to-document', authMiddleware, (req: AuthRequest, res: Response) => {
  const { documentId, artifactId } = req.params;
  const data = convertToDocumentSchema.parse(req.body);
  const db = getDatabase();

  // Verify artifact exists
  const artifact = db.prepare(`
    SELECT id, title, content FROM artifacts WHERE id = ? AND document_id = ?
  `).get(artifactId, documentId) as { id: string; title: string; content: string } | undefined;

  if (!artifact) {
    throw new AppError(404, 'Artifact not found');
  }

  // Create new document from artifact content
  const newDocId = randomUUID();
  const now = Date.now();

  // Generate unique slug from title
  const baseSlug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let slug = baseSlug;
  let counter = 1;
  while (db.prepare('SELECT id FROM documents WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  db.prepare(`
    INSERT INTO documents (id, title, slug, content, owner_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(newDocId, data.title, slug, artifact.content, req.user!.id, now, now);

  const document = db.prepare(`
    SELECT id, title, slug, content, created_at as createdAt, updated_at as updatedAt
    FROM documents
    WHERE id = ?
  `).get(newDocId);

  res.json({ document });
});
