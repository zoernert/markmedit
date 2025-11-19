import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance with auth interceptor
const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface Permission {
  user_id?: string;
  group_id?: string;
  permission_level: 'read' | 'write' | 'admin';
}

export interface UserPermission {
  user_id: string;
  username: string;
  permission_level: 'read' | 'write' | 'admin';
}

export interface GroupPermission {
  group_id: string;
  group_name: string;
  permission_level: 'read' | 'write' | 'admin';
}

export interface DocumentPermissions {
  owner_id: string;
  user_permissions: UserPermission[];
  group_permissions: GroupPermission[];
}

export const permissionsApi = {
  /**
   * Get all permissions for a document
   */
  async getDocumentPermissions(documentId: string): Promise<DocumentPermissions> {
    const response = await client.get(`/permissions/${documentId}`);
    return response.data;
  },

  /**
   * Set permission for a specific user
   */
  async setUserPermission(
    documentId: string,
    userId: string,
    permissionLevel: 'read' | 'write' | 'admin'
  ): Promise<void> {
    await client.post(`/permissions/${documentId}/user`, {
      userId,
      permissionLevel,
    });
  },

  /**
   * Set permission for a group
   */
  async setGroupPermission(
    documentId: string,
    groupId: string,
    permissionLevel: 'read' | 'write' | 'admin'
  ): Promise<void> {
    await client.post(`/permissions/${documentId}/group`, {
      groupId,
      permissionLevel,
    });
  },

  /**
   * Remove permission for a specific user
   */
  async removeUserPermission(documentId: string, userId: string): Promise<void> {
    await client.delete(`/permissions/${documentId}/user/${userId}`);
  },

  /**
   * Remove permission for a group
   */
  async removeGroupPermission(documentId: string, groupId: string): Promise<void> {
    await client.delete(`/permissions/${documentId}/group/${groupId}`);
  },

  /**
   * Transfer ownership to another user
   */
  async transferOwnership(documentId: string, newOwnerId: string): Promise<void> {
    await client.post(`/permissions/${documentId}/transfer`, {
      newOwnerId,
    });
  },

  /**
   * Enable public sharing (grant read access to everyone)
   */
  async enablePublicSharing(documentId: string): Promise<{ publicUrl: string }> {
    const response = await client.post(`/permissions/${documentId}/public`);
    return response.data;
  },

  /**
   * Disable public sharing
   */
  async disablePublicSharing(documentId: string): Promise<void> {
    await client.delete(`/permissions/${documentId}/public`);
  },

  /**
   * Check if document has public sharing enabled
   */
  async isPubliclyShared(documentId: string): Promise<boolean> {
    try {
      const permissions = await client.get(`/permissions/${documentId}`);
      const groupPerms = permissions.data.group_permissions || [];
      return groupPerms.some((gp: GroupPermission) => gp.group_id === '_EVERYONE');
    } catch {
      return false;
    }
  },

  /**
   * Enable public share link (new share system)
   */
  async enableShare(documentId: string): Promise<{ shareId: string; shareUrl: string }> {
    const response = await client.post(`/share/${documentId}/enable`);
    return response.data;
  },

  /**
   * Disable public share link
   */
  async disableShare(documentId: string): Promise<void> {
    await client.post(`/share/${documentId}/disable`);
  },

  /**
   * Get share status for a document
   */
  async getShareStatus(documentId: string): Promise<{
    shareId: string | null;
    shareEnabled: boolean;
    shareUrl: string | null;
  }> {
    const response = await client.get(`/share/${documentId}/status`);
    return response.data;
  },
};
