import { getDatabase } from '../db/index.js';
import type { DocumentPermission } from '../db/schema.js';
import { randomUUID } from 'crypto';

export type PermissionLevel = 'read' | 'write' | 'admin';

export interface Permission {
  user_id?: string;
  group_id?: string;
  permission_level: PermissionLevel;
}

export interface DocumentPermissions {
  owner_id: string;
  user_permissions: Array<{ user_id: string; username: string; permission_level: PermissionLevel }>;
  group_permissions: Array<{ group_id: string; group_name: string; permission_level: PermissionLevel }>;
}

export class PermissionService {
  /**
   * Check if user has permission to access document
   */
  static checkPermission(
    documentId: string,
    userId: string | null,
    requiredLevel: PermissionLevel
  ): boolean {
    const db = getDatabase();

    // Get document owner
    const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(documentId) as { owner_id: string } | undefined;

    if (!doc) {
      return false;
    }

    // Owner has full access
    if (userId && doc.owner_id === userId) {
      return true;
    }

    // Permission level hierarchy
    const levels: Record<PermissionLevel, number> = {
      read: 1,
      write: 2,
      admin: 3,
    };

    const required = levels[requiredLevel];

    // Check user-specific permissions
    if (userId) {
      const userPerm = db.prepare(
        'SELECT permission_level FROM document_permissions WHERE document_id = ? AND user_id = ?'
      ).get(documentId, userId) as DocumentPermission | undefined;

      if (userPerm && levels[userPerm.permission_level] >= required) {
        return true;
      }
    }

    // Check group permissions
    const groupQuery = userId
      ? `SELECT dp.permission_level 
         FROM document_permissions dp
         INNER JOIN user_groups ug ON dp.group_id = ug.group_id
         WHERE dp.document_id = ? AND ug.user_id = ?`
      : `SELECT permission_level 
         FROM document_permissions 
         WHERE document_id = ? AND group_id = '_EVERYONE'`;

    const params = userId ? [documentId, userId] : [documentId];

    const groupPerms = db.prepare(groupQuery).all(...params) as DocumentPermission[];

    for (const perm of groupPerms) {
      if (levels[perm.permission_level] >= required) {
        return true;
      }
    }

    // Check EVERYONE group if not logged in
    if (!userId) {
      const everyonePerm = db.prepare(
        `SELECT permission_level 
         FROM document_permissions 
         WHERE document_id = ? AND group_id = '_EVERYONE'`
      ).get(documentId) as DocumentPermission | undefined;

      if (everyonePerm && levels[everyonePerm.permission_level] >= required) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all permissions for a document
   */
  static getDocumentPermissions(documentId: string): DocumentPermissions {
    const db = getDatabase();

    // Get owner
    const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(documentId) as { owner_id: string } | undefined;

    if (!doc) {
      throw new Error('Document not found');
    }

    // Get user permissions
    const userPerms = db.prepare(
      `SELECT dp.user_id, u.username, dp.permission_level
       FROM document_permissions dp
       INNER JOIN users u ON dp.user_id = u.id
       WHERE dp.document_id = ? AND dp.user_id IS NOT NULL`
    ).all(documentId) as Array<{
      user_id: string;
      username: string;
      permission_level: PermissionLevel;
    }>;

    // Get group permissions
    const groupPerms = db.prepare(
      `SELECT dp.group_id, g.name as group_name, dp.permission_level
       FROM document_permissions dp
       INNER JOIN groups g ON dp.group_id = g.id
       WHERE dp.document_id = ? AND dp.group_id IS NOT NULL`
    ).all(documentId) as Array<{
      group_id: string;
      group_name: string;
      permission_level: PermissionLevel;
    }>;

    return {
      owner_id: doc.owner_id,
      user_permissions: userPerms,
      group_permissions: groupPerms,
    };
  }

  /**
   * Set permission for a user
   */
  static setUserPermission(
    documentId: string,
    userId: string,
    permissionLevel: PermissionLevel
  ): void {
    const db = getDatabase();

    // Check if permission already exists
    const existing = db.prepare(
      'SELECT id FROM document_permissions WHERE document_id = ? AND user_id = ?'
    ).get(documentId, userId);

    if (existing) {
      db.prepare(
        'UPDATE document_permissions SET permission_level = ? WHERE document_id = ? AND user_id = ?'
      ).run(permissionLevel, documentId, userId);
    } else {
      db.prepare(
        `INSERT INTO document_permissions (id, document_id, user_id, permission_level, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(randomUUID(), documentId, userId, permissionLevel, new Date().toISOString());
    }
  }

  /**
   * Set permission for a group
   */
  static setGroupPermission(
    documentId: string,
    groupId: string,
    permissionLevel: PermissionLevel
  ): void {
    const db = getDatabase();

    const existing = db.prepare(
      'SELECT id FROM document_permissions WHERE document_id = ? AND group_id = ?'
    ).get(documentId, groupId);

    if (existing) {
      db.prepare(
        'UPDATE document_permissions SET permission_level = ? WHERE document_id = ? AND group_id = ?'
      ).run(permissionLevel, documentId, groupId);
    } else {
      db.prepare(
        `INSERT INTO document_permissions (id, document_id, group_id, permission_level, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(randomUUID(), documentId, groupId, permissionLevel, new Date().toISOString());
    }
  }

  /**
   * Remove user permission
   */
  static removeUserPermission(documentId: string, userId: string): void {
    const db = getDatabase();
    db.prepare(
      'DELETE FROM document_permissions WHERE document_id = ? AND user_id = ?'
    ).run(documentId, userId);
  }

  /**
   * Remove group permission
   */
  static removeGroupPermission(documentId: string, groupId: string): void {
    const db = getDatabase();
    db.prepare(
      'DELETE FROM document_permissions WHERE document_id = ? AND group_id = ?'
    ).run(documentId, groupId);
  }

  /**
   * Transfer document ownership
   */
  static transferOwnership(documentId: string, newOwnerId: string): void {
    const db = getDatabase();
    db.prepare('UPDATE documents SET owner_id = ? WHERE id = ?').run(newOwnerId, documentId);
  }
}
