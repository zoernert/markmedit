import { Router } from 'express';
import { getActiveUsers, getCollaborationStats } from '../services/collaboration.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { PermissionService } from '../services/permissions.js';
import { AppError } from '../middleware/errorHandler.js';

export const collaborationRoutes = Router();

/**
 * GET /api/collaboration/stats
 * Get collaboration statistics (requires auth)
 */
collaborationRoutes.get('/stats', authMiddleware, (_req: AuthRequest, res) => {
  const stats = getCollaborationStats();
  res.json(stats);
});

/**
 * GET /api/collaboration/documents/:documentId/users
 * Get active users for a specific document
 */
collaborationRoutes.get('/documents/:documentId/users', authMiddleware, (req: AuthRequest, res) => {
  const { documentId } = req.params;

  // Check if user has read permission
  const hasPermission = PermissionService.checkPermission(
    documentId,
    req.user!.id,
    'read'
  );

  if (!hasPermission) {
    throw new AppError(403, 'Access denied');
  }

  const users = getActiveUsers(documentId);
  res.json({ users });
});
