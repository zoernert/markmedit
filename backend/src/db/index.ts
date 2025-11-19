import Database from 'better-sqlite3';
import { config } from '../config/index.js';
import { initSchema } from './schema.js';

let db: Database.Database | null = null;

export async function initializeDatabase() {
  if (config.database.type === 'sqlite') {
    db = new Database(config.database.path);
    
    // Migration: Add share columns if they don't exist
    try {
      db.exec(`SELECT share_id FROM documents LIMIT 1;`);
    } catch (e: any) {
      if (e.message && e.message.includes('no such column')) {
        console.log('[db] Running migration: Adding share_id and share_enabled columns');
        db.exec(`
          ALTER TABLE documents ADD COLUMN share_id TEXT;
          ALTER TABLE documents ADD COLUMN share_enabled INTEGER DEFAULT 0;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_share_id ON documents(share_id);
        `);
        console.log('[db] Migration complete');
      }
    }

    // Migration: Create document_access_log table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_access_log (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        user_id TEXT,
        access_type TEXT NOT NULL,
        share_id TEXT,
        accessed_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_access_log_user ON document_access_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_access_log_document ON document_access_log(document_id);
      CREATE INDEX IF NOT EXISTS idx_access_log_share ON document_access_log(share_id);
    `);
    console.log('[db] ✓ Document access log table ready');

    // Migration: Add background_color and is_pinned columns if they don't exist
    try {
      db.exec(`SELECT background_color, is_pinned FROM documents LIMIT 1;`);
    } catch (e: any) {
      if (e.message && e.message.includes('no such column')) {
        console.log('[db] Running migration: Adding background_color and is_pinned columns');
        db.exec(`
          ALTER TABLE documents ADD COLUMN background_color TEXT;
          ALTER TABLE documents ADD COLUMN is_pinned INTEGER DEFAULT 0;
        `);
        console.log('[db] Migration complete: Card customization fields added');
      }
    }

    // Migration: Add is_readonly and source_url columns if they don't exist
    try {
      db.exec(`SELECT is_readonly, source_url FROM documents LIMIT 1;`);
    } catch (e: any) {
      if (e.message && e.message.includes('no such column')) {
        console.log('[db] Running migration: Adding is_readonly and source_url columns');
        db.exec(`
          ALTER TABLE documents ADD COLUMN is_readonly INTEGER DEFAULT 0;
          ALTER TABLE documents ADD COLUMN source_url TEXT;
        `);
        console.log('[db] Migration complete: Document import fields added');
      }
    }

    // Migration: Create document_relationships table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_relationships (
        id TEXT PRIMARY KEY,
        source_document_id TEXT NOT NULL,
        target_document_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL CHECK(relationship_type IN ('import', 'fork', 'pull_request')),
        auto_sync INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'outdated', 'pending', 'merged', 'rejected')),
        pull_request_diff TEXT,
        pull_request_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (target_document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_document_relationships_source ON document_relationships(source_document_id);
      CREATE INDEX IF NOT EXISTS idx_document_relationships_target ON document_relationships(target_document_id);
      CREATE INDEX IF NOT EXISTS idx_document_relationships_type ON document_relationships(relationship_type);
      CREATE INDEX IF NOT EXISTS idx_document_relationships_status ON document_relationships(status);
    `);
    console.log('[db] ✓ Document relationships table ready');
    
    // Migration: Add is_archived and archived_at columns if they don't exist
    try {
      db.exec(`SELECT is_archived, archived_at FROM documents LIMIT 1;`);
    } catch (e: any) {
      if (e.message && e.message.includes('no such column')) {
        console.log('[db] Running migration: Adding is_archived and archived_at columns');
        db.exec(`
          ALTER TABLE documents ADD COLUMN is_archived INTEGER DEFAULT 0;
          ALTER TABLE documents ADD COLUMN archived_at INTEGER;
          CREATE INDEX IF NOT EXISTS idx_documents_archived ON documents(is_archived);
        `);
        console.log('[db] Migration complete: Document archiving fields added');
      }
    }
    
    // Execute schema initialization
    db.exec(initSchema);
    
    // Create original tables (for backward compatibility during migration)
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents_legacy (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        parent_id TEXT,
        position INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (parent_id) REFERENCES documents_legacy(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT
      );

      CREATE TABLE IF NOT EXISTS document_tags (
        document_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (document_id, tag_id),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        data TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        capabilities TEXT,
        default_tools TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_shared INTEGER DEFAULT 0,
        share_id TEXT,
        source_artifact_id TEXT,
        shared_at INTEGER,
        import_url TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_share_id ON artifacts(share_id);

      CREATE TABLE IF NOT EXISTS mcp_tool_hints (
        id TEXT PRIMARY KEY,
        tool_name TEXT NOT NULL,
        server_id TEXT,
        description TEXT,
        keywords TEXT,
        usage_hint TEXT,
        priority INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS document_versions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        changed_by TEXT,
        change_summary TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_document ON artifacts(document_id);
      CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_default ON mcp_servers(is_default);
      CREATE INDEX IF NOT EXISTS idx_mcp_tool_hints_server ON mcp_tool_hints(server_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_tool_hints_tool ON mcp_tool_hints(tool_name);
      CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id);
      CREATE INDEX IF NOT EXISTS idx_document_versions_created ON document_versions(created_at DESC);
    `);

    console.log('✓ SQLite database initialized');
  } else {
    // PostgreSQL implementation would go here
    throw new Error('PostgreSQL not yet implemented');
  }
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// Helper for async patterns
export async function getDb() {
  return getDatabase();
}

export interface Document {
  id: string;
  title: string;
  slug: string;
  content: string;
  parent_id: string | null;
  position: number;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface MCPToolHint {
  id: string;
  tool_name: string;
  server_id: string | null;
  description: string | null;
  keywords: string | null;
  usage_hint: string | null;
  priority: number;
  created_at: number;
  updated_at: number;
}
