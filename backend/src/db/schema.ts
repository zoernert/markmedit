/**
 * Database Schema Definitions for MarkMEdit
 * Extended with User Management and Permissions
 */

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface UserGroup {
  user_id: string;
  group_id: string;
  added_at: string;
}

export interface Document {
  id: string;
  title: string;
  slug: string;
  content: string;
  parent_id: string | null;
  position: number;
  owner_id: string;
  share_id?: string; // Public sharing identifier (separate from internal ID)
  share_enabled: boolean; // Whether public sharing is enabled
  background_color?: string; // Card background color (hex code)
  is_pinned: boolean; // Whether document is pinned to top
  created_at: string;
  updated_at: string;
  last_edited_by?: string;
  metadata?: string;
}

export interface DocumentPermission {
  id: string;
  document_id: string;
  user_id?: string;
  group_id?: string;
  permission_level: 'read' | 'write' | 'admin';
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

// Database initialization
export const initSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_groups (
    user_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, group_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    parent_id TEXT,
    position INTEGER DEFAULT 0,
    owner_id TEXT NOT NULL,
    share_id TEXT UNIQUE,
    share_enabled INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_edited_by TEXT,
    metadata TEXT,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS document_permissions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    user_id TEXT,
    group_id TEXT,
    permission_level TEXT CHECK(permission_level IN ('read', 'write', 'admin')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CHECK ((user_id IS NOT NULL AND group_id IS NULL) OR (user_id IS NULL AND group_id IS NOT NULL))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Create special groups
  INSERT OR IGNORE INTO groups (id, name, description, created_at) VALUES
    ('_EVERYONE', '_EVERYONE', 'All users including guests', datetime('now')),
    ('_LOGGED_IN', '_LOGGED_IN', 'All authenticated users', datetime('now'));

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
  CREATE INDEX IF NOT EXISTS idx_documents_share_id ON documents(share_id);
  CREATE INDEX IF NOT EXISTS idx_permissions_document ON document_permissions(document_id);
  CREATE INDEX IF NOT EXISTS idx_permissions_user ON document_permissions(user_id);
  CREATE INDEX IF NOT EXISTS idx_permissions_group ON document_permissions(group_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;
