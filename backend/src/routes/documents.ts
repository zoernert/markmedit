import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { saveDocument, getDocumentHistory } from '../services/git.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { getDocumentTitle, generateChangeSummary, detectLanguage } from '../services/document-helpers.js';
import { randomUUID } from 'crypto';
import { authMiddleware, optionalAuthMiddleware, type AuthRequest } from '../middleware/auth.js';
import { PermissionService } from '../services/permissions.js';
import { config } from '../config/index.js';

// Import vector store services
import { jobQueue } from '../services/job-queue.js';

const router = Router();

// Note: indexDocument is now handled by job queue, no longer directly imported
// The lazy import below is kept for backward compatibility but not actively used
if (config.features.enableVectorStore) {
  import('../services/document-indexer.js').then(_module => {
    // Indexing now handled by job queue
  }).catch(err => {
    console.warn('⚠️ Failed to import document-indexer:', err);
  });
}

export const documentRoutes = Router();

const createDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(), // Now optional - will be auto-generated
  content: z.string(),
  parent_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * GET /api/documents/jobs
 * Get background job statistics
 */
documentRoutes.get('/jobs', (_req, res) => {
  const stats = jobQueue.getStats();
  const recentJobs = jobQueue.getJobs().slice(-20); // Last 20 jobs
  
  return res.json({
    stats,
    recentJobs: recentJobs.map(job => ({
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      attempts: job.attempts,
      error: job.error,
    })),
  });
});

/**
 * GET /api/documents/jobs/:jobId
 * Get specific job status
 */
documentRoutes.get('/jobs/:jobId', (req, res) => {
  const job = jobQueue.getJob(req.params.jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  return res.json({ job });
});

/**
 * DELETE /api/documents/jobs/:jobId
 * Cancel a queued job
 */
documentRoutes.delete('/jobs/:jobId', (req, res) => {
  const cancelled = jobQueue.cancelJob(req.params.jobId);
  
  if (!cancelled) {
    return res.status(404).json({ error: 'Job not found or cannot be cancelled' });
  }
  
  return res.json({ success: true });
});

// List all documents - show only documents the user has access to
documentRoutes.get('/', optionalAuthMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const includeArchived = req.query.include_archived === 'true';
  
  // Filter by archived status unless explicitly requested
  const query = includeArchived 
    ? 'SELECT * FROM documents ORDER BY is_pinned DESC, position, created_at DESC'
    : 'SELECT * FROM documents WHERE (is_archived IS NULL OR is_archived = 0) ORDER BY is_pinned DESC, position, created_at DESC';
  
  const allDocuments = db.prepare(query).all() as any[];
  
  // Filter documents by permission
  const documents = allDocuments.filter(doc => 
    PermissionService.checkPermission(doc.id, req.user?.id || null, 'read')
  );
  
  res.json({ documents });
});

// Get single document - check read permission
documentRoutes.get('/:id', optionalAuthMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check read permission
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user?.id || null,
    'read'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied');
  }
  
  res.json({ document });
});

// Create document - requires authentication, set owner
documentRoutes.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const data = createDocumentSchema.parse(req.body);
  const db = getDatabase();
  
  // Auto-generate title if not provided
  const title = await getDocumentTitle(data.content, data.title);
  
  const id = randomUUID();
  const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  
  // Ensure slug is unique by appending a counter if needed
  let slug = baseSlug;
  let counter = 1;
  while (db.prepare('SELECT id FROM documents WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  const now = Date.now();
  
  // Set owner to current user
  db.prepare(`
    INSERT INTO documents (id, title, slug, content, parent_id, owner_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, slug, data.content, data.parent_id || null, req.user!.id, now, now);
  
  // Save initial version with language-specific creation message
  const detectedLang = data.content ? detectLanguage(data.content) : 'de';
  const creationMessages: Record<string, string> = {
    de: 'Dokument erstellt',
    en: 'Document created',
    fr: 'Document créé',
    es: 'Documento creado',
  };
  const creationMessage = creationMessages[detectedLang] || creationMessages.de;
  
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, title, content, change_summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), id, 1, title, data.content, creationMessage, now);
  
  await saveDocument(slug, data.content, `Create ${title}`);
  
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  res.status(201).json({ document });
});

// Update document - requires write permission
documentRoutes.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const data = updateDocumentSchema.parse(req.body);
  const db = getDatabase();
  
  const existing: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check write permission
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user!.id,
    'write'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied');
  }
  
  const updates: string[] = [];
  const values: any[] = [];
  
  // Auto-update title if content changed
  let newTitle = existing.title;
  let newContent = existing.content;
  
  if (data.content !== undefined) {
    newContent = data.content;
    
    // Auto-generate new title from updated content
    newTitle = await getDocumentTitle(data.content, data.title);
    
    updates.push('title = ?');
    values.push(newTitle);
    updates.push('content = ?');
    values.push(data.content);
  } else if (data.title) {
    newTitle = data.title;
    updates.push('title = ?');
    values.push(data.title);
  }
  
  if (updates.length === 0) {
    res.json({ document: existing });
    return;
  }
  
  updates.push('updated_at = ?');
  const now = Date.now();
  values.push(now);
  values.push(req.params.id);
  
  db.prepare(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  
  // Create new version
  const lastVersion: any = db.prepare(`
    SELECT version FROM document_versions 
    WHERE document_id = ? 
    ORDER BY version DESC 
    LIMIT 1
  `).get(req.params.id);
  
  const nextVersion = lastVersion ? lastVersion.version + 1 : 1;
  
  // Insert version immediately with placeholder summary (non-blocking)
  const versionId = randomUUID();
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, title, content, change_summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(versionId, req.params.id, nextVersion, newTitle, newContent, '⏳ Wird generiert...', now);
  
  // Generate change summary asynchronously (don't block response)
  generateChangeSummary(existing.content, newContent).then((changeSummary) => {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE document_versions 
        SET change_summary = ? 
        WHERE id = ?
      `).run(changeSummary, versionId);
      console.log(`[version] Generated summary for version ${nextVersion} (${versionId}): ${changeSummary}`);
    } catch (error) {
      console.error(`[version] Failed to update summary for version ${versionId}:`, error);
    }
  }).catch((error) => {
    console.error(`[version] Failed to generate summary for version ${versionId}:`, error);
  });
  
  const updated: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  
  // Check if embedded artifacts have been modified and sync back
  if (newContent !== undefined) {
    await syncDocumentToArtifacts(req.params.id, newContent);
  }
  
  await saveDocument(updated.slug, updated.content, `Update ${updated.title}`);
  
  // Queue document indexing as background job (non-blocking)
  if (config.features.enableVectorStore) {
    const jobId = jobQueue.addJob('index-document', {
      documentId: req.params.id,
      title: newTitle,
      content: newContent,
      version: nextVersion,
    }, {
      priority: 5, // Normal priority
      maxAttempts: 3,
    });
    
    console.log(`📋 Document indexing queued as job ${jobId}`);
  }
  
  res.json({ document: updated });
});

/**
 * Helper: Sync document changes back to artifacts
 */
async function syncDocumentToArtifacts(documentId: string, newContent: string) {
  const db = getDatabase();
  const { parseEmbeddedArtifacts } = await import('../services/artifact-embed.js');
  
  // Parse document to find all embedded artifacts
  const embeddedArtifacts = parseEmbeddedArtifacts(newContent);
  
  // Update each artifact if content has changed
  for (const [artifactId, instances] of embeddedArtifacts.entries()) {
    // Get current artifact content
    const artifact: any = db.prepare('SELECT content FROM artifacts WHERE id = ?').get(artifactId);
    
    if (!artifact) {
      console.warn(`Artifact ${artifactId} not found, skipping sync`);
      continue;
    }
    
    // Use first instance (if multiple embeds of same artifact)
    const embeddedContent = instances[0].content;
    
    // Check if content has changed
    if (embeddedContent.trim() !== artifact.content.trim()) {
      console.log(`Syncing artifact ${artifactId} from document ${documentId}`);
      
      const now = Date.now();
      db.prepare(`
        UPDATE artifacts 
        SET content = ?, updated_at = ?
        WHERE id = ?
      `).run(embeddedContent, now, artifactId);
      
      // Note: We don't trigger syncArtifactToDocuments here to avoid circular updates
      // The current document already has the new content, other documents will be updated
      // when those artifacts are next edited or when we implement conflict resolution
    }
  }
}


// PATCH document card customization - update background color and pin status
documentRoutes.patch('/:id/customize', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  
  const existing: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check write permission
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user!.id,
    'write'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied');
  }
  
  const updates: string[] = [];
  const values: any[] = [];
  
  // Validate and update background_color (hex color code or null)
  if (req.body.background_color !== undefined) {
    const color = req.body.background_color;
    if (color === null || color === '') {
      updates.push('background_color = NULL');
    } else if (typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)) {
      updates.push('background_color = ?');
      values.push(color);
    } else {
      throw new AppError(400, 'Invalid color format - must be hex color (#RRGGBB) or null');
    }
  }
  
  // Update is_pinned (boolean)
  if (req.body.is_pinned !== undefined) {
    updates.push('is_pinned = ?');
    values.push(req.body.is_pinned ? 1 : 0);
  }
  
  if (updates.length === 0) {
    res.json({ document: existing });
    return;
  }
  
  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(req.params.id);
  
  db.prepare(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  
  const updated: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  res.json({ document: updated });
});

// Archive document - soft delete
documentRoutes.patch('/:id/archive', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  
  const existing: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check write permission
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user!.id,
    'write'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied');
  }
  
  const now = Date.now();
  db.prepare(`
    UPDATE documents 
    SET is_archived = 1, archived_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, now, req.params.id);
  
  const updated: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  res.json({ document: updated });
});

// Unarchive document - restore from archive
documentRoutes.patch('/:id/unarchive', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  
  const existing: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check write permission
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user!.id,
    'write'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied');
  }
  
  const now = Date.now();
  db.prepare(`
    UPDATE documents 
    SET is_archived = 0, archived_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(now, req.params.id);
  
  const updated: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  res.json({ document: updated });
});

// Delete document - requires admin permission
documentRoutes.delete('/:id', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  
  // Check if document exists
  const document = db.prepare('SELECT id FROM documents WHERE id = ?').get(req.params.id);
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check admin permission
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user!.id,
    'admin'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied - admin permission required');
  }
  
  const result = db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    throw new AppError(404, 'Document not found');
  }
  
  res.json({ success: true });
});

// Get document history - requires read permission
documentRoutes.get('/:id/history', optionalAuthMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();
  const document = db.prepare('SELECT slug FROM documents WHERE id = ?').get(req.params.id) as any;
  
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check read permission
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user?.id || null,
    'read'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied');
  }
  
  const history = await getDocumentHistory(document.slug);
  res.json({ history });
});

// Get document versions (from database) - requires read permission
documentRoutes.get('/:id/versions', optionalAuthMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const document = db.prepare('SELECT id FROM documents WHERE id = ?').get(req.params.id);
  
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check read permission
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user?.id || null,
    'read'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied');
  }
  
  const versions = db.prepare(`
    SELECT id, version, title, change_summary as changeSummary, created_at as createdAt,
           LENGTH(content) as contentLength
    FROM document_versions
    WHERE document_id = ?
    ORDER BY version DESC
  `).all(req.params.id);
  
  res.json({ versions });
});

// Get specific version content - requires read permission
documentRoutes.get('/:id/versions/:versionId', optionalAuthMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  
  // Check if document exists
  const document = db.prepare('SELECT id FROM documents WHERE id = ?').get(req.params.id);
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check read permission
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user?.id || null,
    'read'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied');
  }
  
  const version = db.prepare(`
    SELECT id, document_id as documentId, version, title, content, 
           change_summary as changeSummary, created_at as createdAt
    FROM document_versions
    WHERE id = ? AND document_id = ?
  `).get(req.params.versionId, req.params.id);
  
  if (!version) {
    throw new AppError(404, 'Version not found');
  }
  
  res.json({ version });
});

// Restore a specific version - requires write permission
documentRoutes.post('/:id/versions/:versionId/restore', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();
  
  // Check write permission first
  const hasPermission = PermissionService.checkPermission(
    req.params.id,
    req.user!.id,
    'write'
  );
  
  if (!hasPermission) {
    throw new AppError(403, 'Access denied - write permission required');
  }
  
  const version: any = db.prepare(`
    SELECT title, content FROM document_versions
    WHERE id = ? AND document_id = ?
  `).get(req.params.versionId, req.params.id);
  
  if (!version) {
    throw new AppError(404, 'Version not found');
  }
  
  const existing: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) {
    throw new AppError(404, 'Document not found');
  }
  
  const now = Date.now();
  
  // Update document
  db.prepare(`
    UPDATE documents 
    SET title = ?, content = ?, updated_at = ?
    WHERE id = ?
  `).run(version.title, version.content, now, req.params.id);
  
  // Create new version entry
  const lastVersion: any = db.prepare(`
    SELECT version FROM document_versions 
    WHERE document_id = ? 
    ORDER BY version DESC 
    LIMIT 1
  `).get(req.params.id);
  
  const nextVersion = lastVersion ? lastVersion.version + 1 : 1;
  
  // Language-specific restore message
  const detectedLang = detectLanguage(version.content);
  const restoreMessages: Record<string, string> = {
    de: 'Version wiederhergestellt',
    en: 'Version restored',
    fr: 'Version restaurée',
    es: 'Versión restaurada',
  };
  const restoreMessage = restoreMessages[detectedLang] || restoreMessages.de;
  
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, title, content, change_summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), req.params.id, nextVersion, version.title, version.content, restoreMessage, now);
  
  const updated: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  await saveDocument(updated.slug, updated.content, `Restore version ${updated.title}`);
  
  res.json({ document: updated });
});

// Get documents accessed via share links
documentRoutes.get('/shared/viewed', authMiddleware, (req: AuthRequest, res) => {
  const db = getDatabase();
  const userId = req.user!.id;

  // Get documents that the user has accessed via share links
  const sharedDocs = db.prepare(`
    SELECT DISTINCT 
      d.*,
      dal.accessed_at,
      dal.share_id,
      u.email as shared_by_email
    FROM document_access_log dal
    INNER JOIN documents d ON dal.document_id = d.id
    LEFT JOIN users u ON d.owner_id = u.id
    WHERE dal.user_id = ?
      AND dal.access_type = 'share_link'
    ORDER BY dal.accessed_at DESC
  `).all(userId) as any[];

  res.json({ documents: sharedDocs });
});

/**
 * Import a document from Markdown with frontmatter
 * Creates a read-only document linked to the source
 */
documentRoutes.post('/import', authMiddleware, async (req: AuthRequest, res) => {
  const { content, sourceUrl } = req.body;
  
  if (!content) {
    throw new AppError(400, 'Content is required');
  }

  const db = getDatabase();
  const now = Date.now();

  // Parse YAML frontmatter
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  let metadata: any = {};
  let markdownContent = content;
  
  if (match) {
    const yamlContent = match[1];
    markdownContent = match[2];
    
    // Simple YAML parser for our specific format
    yamlContent.split('\n').forEach((line: string) => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        const value = valueParts.join(':').trim();
        metadata[key.trim()] = value;
      }
    });
  }

  // Validate this is a MarkMEdit import
  if (!metadata.markmedit_import || metadata.markmedit_import !== 'true') {
    throw new AppError(400, 'Invalid MarkMEdit import file');
  }

  const title = metadata.title || getDocumentTitle(markdownContent);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  
  // Check for existing import from same source
  const existing: any = db.prepare(`
    SELECT d.id 
    FROM documents d
    INNER JOIN document_relationships dr ON d.id = dr.target_document_id
    WHERE dr.source_document_id = ? AND dr.relationship_type = 'import'
  `).get(metadata.source_id);

  if (existing) {
    throw new AppError(409, 'Document already imported from this source');
  }

  const documentId = randomUUID();
  
  // Create read-only document
  db.prepare(`
    INSERT INTO documents (id, title, slug, content, is_readonly, source_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `).run(documentId, title, slug, markdownContent, metadata.source_url || sourceUrl, now, now);

  // Create initial version
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, title, content, change_summary, created_at)
    VALUES (?, ?, 1, ?, ?, 'Importiert', ?)
  `).run(randomUUID(), documentId, title, markdownContent, now);

  // Create import relationship if we have source info
  if (metadata.source_id) {
    db.prepare(`
      INSERT INTO document_relationships (
        id, source_document_id, target_document_id, relationship_type, 
        auto_sync, status, created_at, updated_at
      )
      VALUES (?, ?, ?, 'import', 1, 'active', ?, ?)
    `).run(randomUUID(), metadata.source_id, documentId, now, now);
  }

  await saveDocument(slug, markdownContent, `Import ${title}`);

  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
  res.json({ document });
});

/**
 * Fork a document (create editable copy)
 */
documentRoutes.post('/:id/fork', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();
  const now = Date.now();

  const source: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  
  if (!source) {
    throw new AppError(404, 'Document not found');
  }

  const forkId = randomUUID();
  const forkTitle = `${source.title} (Fork)`;
  const forkSlug = `${source.slug}-fork-${Date.now()}`;

  // Create editable fork
  db.prepare(`
    INSERT INTO documents (id, title, slug, content, is_readonly, source_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?)
  `).run(forkId, forkTitle, forkSlug, source.content, source.source_url, now, now);

  // Create initial version
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, title, content, change_summary, created_at)
    VALUES (?, ?, 1, ?, ?, 'Geforkt', ?)
  `).run(randomUUID(), forkId, forkTitle, source.content, now);

  // Create fork relationship
  db.prepare(`
    INSERT INTO document_relationships (
      id, source_document_id, target_document_id, relationship_type, 
      auto_sync, status, created_at, updated_at
    )
    VALUES (?, ?, ?, 'fork', 0, 'active', ?, ?)
  `).run(randomUUID(), req.params.id, forkId, now, now);

  await saveDocument(forkSlug, source.content, `Fork ${forkTitle}`);

  const fork = db.prepare('SELECT * FROM documents WHERE id = ?').get(forkId);
  res.json({ document: fork });
});

/**
 * Check for upstream updates
 */
documentRoutes.get('/:id/upstream/check', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();

  // Get import relationship
  const relationship: any = db.prepare(`
    SELECT dr.*, d.content as source_content, d.updated_at as source_updated_at,
           d.title as source_title
    FROM document_relationships dr
    INNER JOIN documents d ON dr.source_document_id = d.id
    WHERE dr.target_document_id = ? AND dr.relationship_type = 'import'
  `).get(req.params.id);

  if (!relationship) {
    return res.json({ hasUpdates: false });
  }

  const target: any = db.prepare('SELECT updated_at FROM documents WHERE id = ?').get(req.params.id);
  
  const hasUpdates = relationship.source_updated_at > target.updated_at;

  return res.json({
    hasUpdates,
    sourceTitle: relationship.source_title,
    sourceUpdatedAt: relationship.source_updated_at,
    targetUpdatedAt: target.updated_at
  });
});

/**
 * Sync with upstream document
 */
documentRoutes.post('/:id/sync', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();
  const now = Date.now();

  const target: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  
  if (!target) {
    throw new AppError(404, 'Document not found');
  }

  if (!target.is_readonly) {
    throw new AppError(400, 'Only read-only documents can be synced');
  }

  // Get source document
  const relationship: any = db.prepare(`
    SELECT dr.*, d.content as source_content, d.title as source_title
    FROM document_relationships dr
    INNER JOIN documents d ON dr.source_document_id = d.id
    WHERE dr.target_document_id = ? AND dr.relationship_type = 'import'
  `).get(req.params.id);

  if (!relationship) {
    throw new AppError(404, 'No upstream source found');
  }

  // Get latest version number
  const lastVersion: any = db.prepare(`
    SELECT version 
    FROM document_versions 
    WHERE document_id = ? 
    ORDER BY version DESC 
    LIMIT 1
  `).get(req.params.id);
  
  const nextVersion = lastVersion ? lastVersion.version + 1 : 1;

  // Update document
  db.prepare(`
    UPDATE documents 
    SET content = ?, title = ?, updated_at = ?
    WHERE id = ?
  `).run(relationship.source_content, relationship.source_title, now, req.params.id);

  // Create new version
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, title, content, change_summary, created_at)
    VALUES (?, ?, ?, ?, ?, 'Synchronisiert mit Original', ?)
  `).run(randomUUID(), req.params.id, nextVersion, relationship.source_title, relationship.source_content, now);

  // Update relationship status
  db.prepare(`
    UPDATE document_relationships 
    SET status = 'active', updated_at = ?
    WHERE target_document_id = ? AND relationship_type = 'import'
  `).run(now, req.params.id);

  await saveDocument(target.slug, relationship.source_content, `Sync ${relationship.source_title}`);

  const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  res.json({ document: updated });
});

/**
 * Create pull request (propose changes back to source)
 */
documentRoutes.post('/:id/pull-request', authMiddleware, async (req: AuthRequest, res) => {
  const { message } = req.body;
  const db = getDatabase();
  const now = Date.now();

  const fork: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  
  if (!fork) {
    throw new AppError(404, 'Document not found');
  }

  if (fork.is_readonly) {
    throw new AppError(400, 'Cannot create pull request from read-only document');
  }

  // Get fork relationship
  const forkRelationship: any = db.prepare(`
    SELECT source_document_id 
    FROM document_relationships 
    WHERE target_document_id = ? AND relationship_type = 'fork'
  `).get(req.params.id);

  if (!forkRelationship) {
    throw new AppError(404, 'This is not a forked document');
  }

  const source: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(forkRelationship.source_document_id);

  // Simple diff: just store both contents
  const diff = JSON.stringify({
    source: source.content,
    fork: fork.content
  });

  const prId = randomUUID();

  // Create pull request relationship
  db.prepare(`
    INSERT INTO document_relationships (
      id, source_document_id, target_document_id, relationship_type, 
      auto_sync, status, pull_request_diff, pull_request_message, created_at, updated_at
    )
    VALUES (?, ?, ?, 'pull_request', 0, 'pending', ?, ?, ?, ?)
  `).run(prId, forkRelationship.source_document_id, req.params.id, diff, message, now, now);

  res.json({ pullRequestId: prId, status: 'pending' });
});

/**
 * Get pull requests for a document
 */
documentRoutes.get('/:id/pull-requests', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();

  const pullRequests = db.prepare(`
    SELECT dr.*, d.title as fork_title, d.slug as fork_slug
    FROM document_relationships dr
    INNER JOIN documents d ON dr.target_document_id = d.id
    WHERE dr.source_document_id = ? AND dr.relationship_type = 'pull_request'
    ORDER BY dr.created_at DESC
  `).all(req.params.id);

  res.json({ pullRequests });
});

/**
 * Accept pull request
 */
documentRoutes.post('/pull-requests/:prId/accept', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();
  const now = Date.now();

  const pr: any = db.prepare(`
    SELECT * FROM document_relationships WHERE id = ? AND relationship_type = 'pull_request'
  `).get(req.params.prId);

  if (!pr) {
    throw new AppError(404, 'Pull request not found');
  }

  if (pr.status !== 'pending') {
    throw new AppError(400, 'Pull request already processed');
  }

  // Parse diff
  const diff = JSON.parse(pr.pull_request_diff);
  
  // Get source document
  const source: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(pr.source_document_id);

  // Get latest version number
  const lastVersion: any = db.prepare(`
    SELECT version 
    FROM document_versions 
    WHERE document_id = ? 
    ORDER BY version DESC 
    LIMIT 1
  `).get(pr.source_document_id);
  
  const nextVersion = lastVersion ? lastVersion.version + 1 : 1;

  // Update source document with fork content
  db.prepare(`
    UPDATE documents 
    SET content = ?, updated_at = ?
    WHERE id = ?
  `).run(diff.fork, now, pr.source_document_id);

  // Create new version
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version, title, content, change_summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), 
    pr.source_document_id, 
    nextVersion, 
    source.title, 
    diff.fork, 
    `Pull Request akzeptiert: ${pr.pull_request_message || 'Änderungen übernommen'}`, 
    now
  );

  // Mark PR as merged
  db.prepare(`
    UPDATE document_relationships 
    SET status = 'merged', updated_at = ?
    WHERE id = ?
  `).run(now, req.params.prId);

  await saveDocument(source.slug, diff.fork, `Merge PR: ${pr.pull_request_message || 'Changes from fork'}`);

  res.json({ status: 'merged' });
});

/**
 * Reject pull request
 */
documentRoutes.post('/pull-requests/:prId/reject', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();
  const now = Date.now();

  const pr: any = db.prepare(`
    SELECT * FROM document_relationships WHERE id = ? AND relationship_type = 'pull_request'
  `).get(req.params.prId);

  if (!pr) {
    throw new AppError(404, 'Pull request not found');
  }

  if (pr.status !== 'pending') {
    throw new AppError(400, 'Pull request already processed');
  }

  // Mark PR as rejected
  db.prepare(`
    UPDATE document_relationships 
    SET status = 'rejected', updated_at = ?
    WHERE id = ?
  `).run(now, req.params.prId);

  res.json({ status: 'rejected' });
});

/**
 * Embed artifact in document
 * POST /api/documents/:id/embed-artifact
 */
documentRoutes.post('/:id/embed-artifact', authMiddleware, async (req: AuthRequest, res) => {
  const db = getDatabase();
  const documentId = req.params.id;
  
  const schema = z.object({
    artifactId: z.string(),
    position: z.union([
      z.literal('start'),
      z.literal('end'),
      z.number()
    ]).optional().default('end')
  });

  const { artifactId, position } = schema.parse(req.body);

  // Get document - check write permission
  const document: any = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
  if (!document) {
    throw new AppError(404, 'Document not found');
  }

  if (!PermissionService.checkPermission(documentId, req.user!.id, 'write')) {
    throw new AppError(403, 'No write access to this document');
  }

  // Get artifact - check it belongs to this document
  const artifact: any = db.prepare('SELECT * FROM artifacts WHERE id = ? AND document_id = ?')
    .get(artifactId, documentId);
  
  if (!artifact) {
    throw new AppError(404, 'Artifact not found or does not belong to this document');
  }

  // Import embed service
  const { embedArtifactInContent } = await import('../services/artifact-embed.js');

  // Embed artifact in content
  const updatedContent = embedArtifactInContent(
    document.content,
    artifactId,
    artifact.content,
    position
  );

  // Update document
  const now = Date.now();
  db.prepare(`
    UPDATE documents 
    SET content = ?, updated_at = ?
    WHERE id = ?
  `).run(updatedContent, now, documentId);

  // Save to git
  await saveDocument(document.slug, updatedContent, `Embed artifact: ${artifact.title}`);

  res.json({ 
    success: true,
    content: updatedContent
  });
});

export default router;
