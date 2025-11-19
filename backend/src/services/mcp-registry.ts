import type { MCPServerConfig } from '../config/index.js';
import { getDatabase } from '../db/index.js';

export interface StoredMCPServer extends MCPServerConfig {
  enabled: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

const SELECT_COLUMNS = `
  id,
  name,
  url,
  type,
  description,
  capabilities,
  default_tools,
  enabled,
  is_default,
  created_at,
  updated_at
`;

const ORDER_BY_DEFAULT = 'ORDER BY is_default DESC, name ASC';

function parseJson<T>(raw: string | null): T | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('Failed to parse MCP server JSON payload', { raw, error });
    return undefined;
  }
}

function mapRowToServer(row: any): StoredMCPServer {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    type: row.type,
    description: row.description,
    capabilities: parseJson<string[]>(row.capabilities),
    defaultTools: parseJson<MCPServerConfig['defaultTools']>(row.default_tools),
    enabled: row.enabled === 1,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listStoredMcpServers(): StoredMCPServer[] {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM mcp_servers ${ORDER_BY_DEFAULT}`)
    .all();
  return rows.map(mapRowToServer);
}

export function listActiveMcpServers(): StoredMCPServer[] {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM mcp_servers WHERE enabled = 1 ${ORDER_BY_DEFAULT}`)
    .all();
  return rows.map(mapRowToServer);
}

export function findMcpServerById(id: string): StoredMCPServer | undefined {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM mcp_servers WHERE id = ?`)
    .get(id);
  return row ? mapRowToServer(row) : undefined;
}

export function upsertMcpServer(server: MCPServerConfig & { enabled?: boolean; isDefault?: boolean }): StoredMCPServer {
  const db = getDatabase();
  const now = Date.now();
  const existing = findMcpServerById(server.id);
  const createdAt = existing?.createdAt ?? now;
  const capabilities = server.capabilities?.length ? JSON.stringify(server.capabilities) : null;
  const defaultTools = server.defaultTools && Object.keys(server.defaultTools).length
    ? JSON.stringify(server.defaultTools)
    : null;

  const payload = {
    id: server.id,
    name: server.name,
    url: server.url,
    type: server.type,
    description: server.description,
    capabilities,
    default_tools: defaultTools,
    enabled: server.enabled === false ? 0 : 1,
    is_default: existing?.isDefault ? 1 : 0,
    created_at: createdAt,
    updated_at: now,
  } as const;

  db.prepare(`
    INSERT INTO mcp_servers (id, name, url, type, description, capabilities, default_tools, enabled, is_default, created_at, updated_at)
    VALUES (@id, @name, @url, @type, @description, @capabilities, @default_tools, @enabled, @is_default, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      type = excluded.type,
      description = excluded.description,
      capabilities = excluded.capabilities,
      default_tools = excluded.default_tools,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(payload);

  if (server.isDefault) {
    setDefaultMcpServer(server.id);
  }

  return findMcpServerById(server.id)!;
}

export function updateMcpServer(
  id: string,
  updates: Partial<MCPServerConfig & { enabled: boolean; isDefault: boolean }>,
): StoredMCPServer {
  const current = findMcpServerById(id);
  if (!current) {
    throw new Error(`MCP server '${id}' not found`);
  }

  const merged: MCPServerConfig & { enabled?: boolean; isDefault?: boolean } = {
    ...current,
    ...updates,
  };

  // Keep computed fields from current record
  if (updates.enabled === undefined) {
    merged.enabled = current.enabled;
  }
  if (updates.isDefault === undefined) {
    merged.isDefault = current.isDefault;
  }

  return upsertMcpServer(merged);
}

export function deleteMcpServer(id: string): void {
  const db = getDatabase();
  const target = db
    .prepare('SELECT is_default FROM mcp_servers WHERE id = ?')
    .get(id) as { is_default?: number } | undefined;
  if (!target) {
    return;
  }

  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);

  if (target.is_default === 1) {
    const next = db
      .prepare(`SELECT id FROM mcp_servers ORDER BY is_default DESC, created_at ASC LIMIT 1`)
      .get() as { id?: string } | undefined;
    if (next?.id) {
      setDefaultMcpServer(next.id);
    }
  }
}

export function setDefaultMcpServer(id: string): void {
  const db = getDatabase();
  const tx = db.transaction((serverId: string) => {
    db.prepare('UPDATE mcp_servers SET is_default = 0').run();
    db.prepare('UPDATE mcp_servers SET is_default = 1, updated_at = ? WHERE id = ?').run(Date.now(), serverId);
  });

  tx(id);
}

export function syncMcpServersFromConfig(servers: MCPServerConfig[]): { inserted: number; updated: number } {
  if (!servers?.length) {
    return { inserted: 0, updated: 0 };
  }

  const existing = listStoredMcpServers();
  const existingIds = new Set(existing.map(server => server.id));
  let hasDefault = existing.some(server => server.isDefault);
  let inserted = 0;
  let updated = 0;

  servers.forEach((server, index) => {
    const isNew = !existingIds.has(server.id);
    const shouldBeDefault = server.isDefault === true || (!hasDefault && index === 0);

    upsertMcpServer({
      ...server,
      enabled: server.enabled !== false,
      isDefault: shouldBeDefault,
    });

    if (isNew) {
      inserted += 1;
    } else {
      updated += 1;
    }

    if (shouldBeDefault) {
      hasDefault = true;
    }
  });

  return { inserted, updated };
}
