import { getAllMCPServers } from './mcp-manager.js';
import type { MCPClient } from './mcp-client.js';

/**
 * Legacy compatibility layer for earlier brand-specific code paths
 * This wraps the generic MCP system to maintain backward compatibility
 */

export async function initializeMCP(): Promise<void> {
  // Deprecated - MCP is now initialized via getMCPManager()
  console.warn('⚠ initializeMCP() is deprecated. MCP Manager is initialized automatically.');
}

export function getMCPClient(allowedServerIds?: string[]) {
  const allServers = getAllMCPServers();
  const servers = allowedServerIds?.length
    ? allServers.filter((server: MCPClient) => allowedServerIds.includes(server.getConfig().id))
    : allServers;

  if (servers.length === 0) {
    if (allowedServerIds?.length) {
      throw new Error(`No MCP servers available for ids: ${allowedServerIds.join(', ')}`);
    }
    throw new Error('No MCP servers available. Please configure an MCP server via the management API.');
  }

  const preferred = servers.find((server: any) => !!server.getDefaultTool?.('chat'));
  return preferred ?? servers[0];
}
