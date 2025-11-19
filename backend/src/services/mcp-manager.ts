import type { MCPServerConfig } from '../config/index.js';
import { MCPClient } from './mcp-client.js';
import { listActiveMcpServers } from './mcp-registry.js';

/**
 * Manager for MCP server connections
 * Uses official @modelcontextprotocol/sdk
 */
class MCPServerManager {
  private clients: Map<string, MCPClient> = new Map();
  private configs: MCPServerConfig[];

  constructor(configs: MCPServerConfig[]) {
    this.configs = configs;
    this.initializeClients();
  }

  private initializeClients(): void {
    for (const config of this.configs) {
      const client = new MCPClient(config);
      this.clients.set(config.id, client);
    }
  }

  getServer(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId);
  }

  getAllServers(): MCPClient[] {
    return Array.from(this.clients.values());
  }

  getServerConfigs(): MCPServerConfig[] {
    return this.configs;
  }

  getServersByIds(ids: string[]): MCPClient[] {
    return ids.map(id => this.clients.get(id)).filter((c): c is MCPClient => c !== undefined);
  }

  getServersByCapability(capability: string): MCPClient[] {
    return this.configs
      .filter(config => config.capabilities?.includes(capability))
      .map(config => this.clients.get(config.id))
      .filter((c): c is MCPClient => c !== undefined);
  }

  findBestServer(query: string, allowedServerIds?: string[]): MCPClient | undefined {
    const lowerQuery = query.toLowerCase();
    const eligibleConfigs = allowedServerIds
      ? this.configs.filter(c => allowedServerIds.includes(c.id))
      : this.configs;

    let bestMatch: { config: MCPServerConfig; score: number } | null = null;

    for (const config of eligibleConfigs) {
      const description = config.description.toLowerCase();
      const name = config.name.toLowerCase();
      
      let score = 0;
      if (name.includes(lowerQuery)) score += 3;
      if (description.includes(lowerQuery)) score += 2;
      
      config.capabilities?.forEach(cap => {
        if (lowerQuery.includes(cap.toLowerCase())) score += 1;
      });

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { config, score };
      }
    }

    return bestMatch ? this.clients.get(bestMatch.config.id) : undefined;
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.values()).map(client => client.close())
    );
    this.clients.clear();
  }
}

let mcpManager: MCPServerManager | null = null;

export function getMCPManager(): MCPServerManager {
  if (!mcpManager) {
    const activeServers = listActiveMcpServers();
    const configs = activeServers.map((server): MCPServerConfig => {
      const { enabled: _enabled, isDefault: _isDefault, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = server;
      return rest;
    });
    mcpManager = new MCPServerManager(configs);

    console.log(`✓ MCP Manager initialized with ${configs.length} servers`);
    for (const serverConfig of activeServers) {
      const preview = serverConfig.description.length > 60
        ? `${serverConfig.description.substring(0, 57)}...`
        : serverConfig.description;
      console.log(`  - ${serverConfig.name} (${serverConfig.id}): ${preview}`);
    }
  }
  return mcpManager;
}

export function invalidateMCPManager(): void {
  mcpManager = null;
}

/**
 * Get a specific MCP server by ID
 */
export function getMCPServer(serverId: string): MCPClient {
  const manager = getMCPManager();
  const server = manager.getServer(serverId);
  
  if (!server) {
    throw new Error(`MCP server '${serverId}' not found. Available servers: ${manager.getServerConfigs().map(c => c.id).join(', ')}`);
  }
  
  return server;
}

/**
 * Find the best MCP server for a given query
 * Uses keyword matching against server descriptions
 */
export function findBestMCPServer(query: string, allowedServerIds?: string[]): MCPClient | undefined {
  const manager = getMCPManager();
  return manager.findBestServer(query, allowedServerIds);
}

/**
 * Get all available MCP servers
 */
export function getAllMCPServers(): MCPClient[] {
  const manager = getMCPManager();
  return manager.getAllServers();
}

/**
 * Get servers with a specific capability
 */
export function getMCPServersByCapability(capability: string): MCPClient[] {
  const manager = getMCPManager();
  return manager.getServersByCapability(capability);
}

export function getMCPServersByIds(ids: string[]): MCPClient[] {
  const manager = getMCPManager();
  return manager.getServersByIds(ids);
}
