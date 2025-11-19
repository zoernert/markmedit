import { Router, type Response } from 'express';
import { PermissionService, type PermissionLevel } from '../services/permissions.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// All permission routes require authentication
router.use(authMiddleware);

/**
 * GET /api/permissions/:documentId
 * Get all permissions for a document
 */
router.get('/:documentId', (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const userId = req.user!.id;

    // Check if user has admin permission
    const hasPermission = PermissionService.checkPermission(documentId, userId, 'admin');

    if (!hasPermission) {
      return res.status(403).json({ error: 'Not authorized to view permissions' });
    }

    const permissions = PermissionService.getDocumentPermissions(documentId);
    return res.json(permissions);
  } catch (error) {
    console.error('Error getting permissions:', error);
    return res.status(500).json({ error: 'Failed to get permissions' });
  }
});

/**
 * POST /api/permissions/:documentId/user
 * Set permission for a user
 */
router.post('/:documentId/user', (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const { userId, permissionLevel } = req.body as { userId: string; permissionLevel: PermissionLevel };
    const requestingUserId = req.user!.id;

    // Validate input
    if (!userId || !permissionLevel) {
      return res.status(400).json({ error: 'userId and permissionLevel are required' });
    }

    if (!['read', 'write', 'admin'].includes(permissionLevel)) {
      return res.status(400).json({ error: 'Invalid permission level' });
    }

    // Check if user has admin permission
    const hasPermission = PermissionService.checkPermission(documentId, requestingUserId, 'admin');

    if (!hasPermission) {
      return res.status(403).json({ error: 'Not authorized to modify permissions' });
    }

    PermissionService.setUserPermission(documentId, userId, permissionLevel);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error setting user permission:', error);
    return res.status(500).json({ error: 'Failed to set permission' });
  }
});

/**
 * POST /api/permissions/:documentId/group
 * Set permission for a group
 */
router.post('/:documentId/group', (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const { groupId, permissionLevel } = req.body as { groupId: string; permissionLevel: PermissionLevel };
    const requestingUserId = req.user!.id;

    // Validate input
    if (!groupId || !permissionLevel) {
      return res.status(400).json({ error: 'groupId and permissionLevel are required' });
    }

    if (!['read', 'write', 'admin'].includes(permissionLevel)) {
      return res.status(400).json({ error: 'Invalid permission level' });
    }

    // Check if user has admin permission
    const hasPermission = PermissionService.checkPermission(documentId, requestingUserId, 'admin');

    if (!hasPermission) {
      return res.status(403).json({ error: 'Not authorized to modify permissions' });
    }

    PermissionService.setGroupPermission(documentId, groupId, permissionLevel);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error setting group permission:', error);
    return res.status(500).json({ error: 'Failed to set permission' });
  }
});

/**
 * DELETE /api/permissions/:documentId/user/:userId
 * Remove user permission
 */
router.delete('/:documentId/user/:userId', (req: AuthRequest, res: Response) => {
  try {
    const { documentId, userId } = req.params;
    const requestingUserId = req.user!.id;

    // Check if user has admin permission
    const hasPermission = PermissionService.checkPermission(documentId, requestingUserId, 'admin');

    if (!hasPermission) {
      return res.status(403).json({ error: 'Not authorized to modify permissions' });
    }

    PermissionService.removeUserPermission(documentId, userId);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error removing user permission:', error);
    return res.status(500).json({ error: 'Failed to remove permission' });
  }
});

/**
 * DELETE /api/permissions/:documentId/group/:groupId
 * Remove group permission
 */
router.delete('/:documentId/group/:groupId', (req: AuthRequest, res: Response) => {
  try {
    const { documentId, groupId } = req.params;
    const requestingUserId = req.user!.id;

    // Check if user has admin permission
    const hasPermission = PermissionService.checkPermission(documentId, requestingUserId, 'admin');

    if (!hasPermission) {
      return res.status(403).json({ error: 'Not authorized to modify permissions' });
    }

    PermissionService.removeGroupPermission(documentId, groupId);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error removing group permission:', error);
    return res.status(500).json({ error: 'Failed to remove permission' });
  }
});

/**
 * POST /api/permissions/:documentId/transfer
 * Transfer document ownership
 */
router.post('/:documentId/transfer', (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const { newOwnerId } = req.body as { newOwnerId: string };
    const requestingUserId = req.user!.id;

    // Validate input
    if (!newOwnerId) {
      return res.status(400).json({ error: 'newOwnerId is required' });
    }

    // Check if user has admin permission
    const hasPermission = PermissionService.checkPermission(documentId, requestingUserId, 'admin');

    if (!hasPermission) {
      return res.status(403).json({ error: 'Not authorized to transfer ownership' });
    }

    PermissionService.transferOwnership(documentId, newOwnerId);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error transferring ownership:', error);
    return res.status(500).json({ error: 'Failed to transfer ownership' });
  }
});

/**
 * POST /api/permissions/:documentId/public
 * Enable public sharing (grant read access to _EVERYONE group)
 */
router.post('/:documentId/public', (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const requestingUserId = req.user!.id;

    // Check if user has admin permission
    const hasPermission = PermissionService.checkPermission(documentId, requestingUserId, 'admin');

    if (!hasPermission) {
      return res.status(403).json({ error: 'Not authorized to modify permissions' });
    }

    // Grant read permission to _EVERYONE group
    PermissionService.setGroupPermission(documentId, '_EVERYONE', 'read');
    return res.json({ success: true, publicUrl: `/public/${documentId}` });
  } catch (error) {
    console.error('Error enabling public sharing:', error);
    return res.status(500).json({ error: 'Failed to enable public sharing' });
  }
});

/**
 * DELETE /api/permissions/:documentId/public
 * Disable public sharing (remove _EVERYONE group permission)
 */
router.delete('/:documentId/public', (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const requestingUserId = req.user!.id;

    // Check if user has admin permission
    const hasPermission = PermissionService.checkPermission(documentId, requestingUserId, 'admin');

    if (!hasPermission) {
      return res.status(403).json({ error: 'Not authorized to modify permissions' });
    }

    // Remove _EVERYONE group permission
    PermissionService.removeGroupPermission(documentId, '_EVERYONE');
    return res.json({ success: true });
  } catch (error) {
    console.error('Error disabling public sharing:', error);
    return res.status(500).json({ error: 'Failed to disable public sharing' });
  }
});

export default router;
