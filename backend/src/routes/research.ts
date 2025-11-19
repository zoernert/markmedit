import { Router, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { PermissionService } from '../services/permissions.js';
import { getResearchToolsService, type TransformationType } from '../services/research-tools.js';
import { AppError } from '../middleware/errorHandler.js';
import { getDatabase } from '../db/index.js';

export const researchRoutes = Router();

// All research routes require authentication
researchRoutes.use(authMiddleware);

const transformRequestSchema = z.object({
  type: z.enum([
    'summary',
    'outline',
    'questions',
    'key-points',
    'expand',
    'simplify',
    'academic',
    'podcast-script',
  ]),
  content: z.string().min(1),
  customPrompt: z.string().optional(),
  targetLength: z.enum(['short', 'medium', 'long']).optional(),
  targetAudience: z.string().optional(),
});

const documentTransformRequestSchema = z.object({
  type: z.enum([
    'summary',
    'outline',
    'questions',
    'key-points',
    'expand',
    'simplify',
    'academic',
    'podcast-script',
  ]),
  customPrompt: z.string().optional(),
  targetLength: z.enum(['short', 'medium', 'long']).optional(),
  targetAudience: z.string().optional(),
});

const podcastRequestSchema = z.object({
  content: z.string().min(1),
  hosts: z.number().min(1).max(5).default(2),
});

const citationRequestSchema = z.object({
  content: z.string().min(1),
  style: z.enum(['apa', 'mla', 'chicago']).default('apa'),
});

/**
 * POST /api/research/transform
 * Transform content using AI
 */
researchRoutes.post('/transform', async (req: AuthRequest, res: Response) => {
  try {
    const data = transformRequestSchema.parse(req.body);
    const service = getResearchToolsService();

    const result = await service.transform({
      type: data.type as TransformationType,
      content: data.content,
      customPrompt: data.customPrompt,
      targetLength: data.targetLength,
      targetAudience: data.targetAudience,
    });

    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'Invalid request data');
    }
    throw error;
  }
});

/**
 * POST /api/research/documents/:documentId/transform
 * Transform a document's content and save as artifact
 */
researchRoutes.post('/documents/:documentId/transform', async (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const data = documentTransformRequestSchema.parse(req.body);

    // Check read permission
    const hasPermission = PermissionService.checkPermission(
      documentId,
      req.user!.id,
      'read'
    );

    if (!hasPermission) {
      throw new AppError(403, 'Access denied');
    }

    // Get document content
    const db = getDatabase();
    const doc = db.prepare('SELECT content FROM documents WHERE id = ?').get(documentId) as any;

    if (!doc) {
      throw new AppError(404, 'Document not found');
    }

    const service = getResearchToolsService();
    const result = await service.transform({
      type: data.type as TransformationType,
      content: doc.content,
      customPrompt: data.customPrompt,
      targetLength: data.targetLength,
      targetAudience: data.targetAudience,
    });

    // Save result as artifact
    const artifactTitles: Record<TransformationType, string> = {
      'summary': 'Zusammenfassung',
      'outline': 'Gliederung',
      'questions': 'Forschungsfragen',
      'key-points': 'Kernpunkte',
      'expand': 'Erweiterter Text',
      'simplify': 'Vereinfachter Text',
      'academic': 'Akademische Version',
      'podcast-script': 'Podcast-Skript',
    };

    const artifactId = randomUUID();
    const now = Date.now();
    const artifactTitle = artifactTitles[data.type as TransformationType];

    db.prepare(`
      INSERT INTO artifacts (id, document_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(artifactId, documentId, artifactTitle, result.output, now, now);

    return res.json({
      ...result,
      artifactId,
      artifactTitle,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'Invalid request data');
    }
    throw error;
  }
});

/**
 * POST /api/research/podcast
 * Generate podcast script from content
 */
researchRoutes.post('/podcast', async (req: AuthRequest, res: Response) => {
  try {
    const data = podcastRequestSchema.parse(req.body);
    const service = getResearchToolsService();

    const script = await service.generatePodcastScript(data.content, data.hosts);

    return res.json({
      script,
      hosts: data.hosts,
      timestamp: Date.now(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'Invalid request data');
    }
    throw error;
  }
});

/**
 * POST /api/research/documents/:documentId/podcast
 * Generate podcast script from a document
 */
researchRoutes.post('/documents/:documentId/podcast', async (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const { hosts = 2 } = req.body;

    // Check read permission
    const hasPermission = PermissionService.checkPermission(
      documentId,
      req.user!.id,
      'read'
    );

    if (!hasPermission) {
      throw new AppError(403, 'Access denied');
    }

    // Get document content
    const db = getDatabase();
    const doc = db.prepare('SELECT content, title FROM documents WHERE id = ?').get(documentId) as any;

    if (!doc) {
      throw new AppError(404, 'Document not found');
    }

    const service = getResearchToolsService();
    const script = await service.generatePodcastScript(doc.content, hosts);

    return res.json({
      script,
      hosts,
      documentTitle: doc.title,
      timestamp: Date.now(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'Invalid request data');
    }
    throw error;
  }
});

/**
 * POST /api/research/citations
 * Generate citations for content
 */
researchRoutes.post('/citations', async (req: AuthRequest, res: Response) => {
  try {
    const data = citationRequestSchema.parse(req.body);
    const service = getResearchToolsService();

    const citations = await service.generateCitations(data.content, data.style);

    return res.json({
      citations,
      style: data.style,
      count: citations.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(400, 'Invalid request data');
    }
    throw error;
  }
});

/**
 * POST /api/research/questions
 * Generate research questions from content
 */
researchRoutes.post('/questions', async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      throw new AppError(400, 'Content is required');
    }

    const service = getResearchToolsService();
    const questions = await service.generateResearchQuestions(content);

    return res.json({
      questions,
      count: questions.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    throw error;
  }
});
