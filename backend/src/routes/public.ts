import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { PermissionService } from '../services/permissions.js';

export const publicRoutes = Router();

// Get public document - check if _EVERYONE has read permission
publicRoutes.get('/documents/:id', (req, res) => {
  const db = getDatabase();
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  
  if (!document) {
    throw new AppError(404, 'Document not found');
  }
  
  // Check if document is publicly accessible (has _EVERYONE permission)
  const hasPublicAccess = PermissionService.checkPermission(
    req.params.id,
    null, // no user (public access)
    'read'
  );
  
  if (!hasPublicAccess) {
    throw new AppError(403, 'This document is not publicly accessible');
  }
  
  res.json({ document });
});
