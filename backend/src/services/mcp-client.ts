import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MCPServerConfig } from '../config/index.js';
import { memoryMonitor } from './memory-monitor.js';

export type MCPDefaultToolKey = keyof NonNullable<MCPServerConfig['defaultTools']>;

/**
 * MCP Client using official @modelcontextprotocol/sdk
 * Properly implements the MCP protocol via SSE/HTTP transport
 */
export class MCPClient {
  private config: MCPServerConfig;
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private connected = false;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.client = new Client({
      name: 'markmedit-client',
      version: '1.0.0',
    }, {
      capabilities: {
        // We want to use tools from the server
        tools: {},
      },
    });
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Create SSE transport for HTTP-based MCP servers
      const serverUrl = new URL(this.config.url);
      this.transport = new StreamableHTTPClientTransport(serverUrl);

      await this.client.connect(this.transport);
      this.connected = true;
      console.log(`✓ Connected to MCP server: ${this.config.name}`);
    } catch (error) {
      console.error(`Failed to connect to MCP server ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Ensure connection is established
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<any> {
    await this.ensureConnected();
    const response = await this.client.listTools();
    return response.tools || [];
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolName: string, params: any): Promise<any> {
    return memoryMonitor.trackOperation('MCPClient', `callTool(${toolName})`, async () => {
      await this.ensureConnected();
      const response = await this.client.callTool({
        name: toolName,
        arguments: params,
      });
      return response;
    });
  }

  /**
   * List available resources
   */
  async listResources(): Promise<any> {
    await this.ensureConnected();
    const response = await this.client.listResources();
    return response.resources || [];
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<any> {
    await this.ensureConnected();
    const response = await this.client.readResource({ uri });
    return response;
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<any> {
    await this.ensureConnected();
    const response = await this.client.listPrompts();
    return response.prompts || [];
  }

  /**
   * Get a prompt
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<any> {
    await this.ensureConnected();
    const response = await this.client.getPrompt({
      name,
      arguments: args,
    });
    return response;
  }

  /**
   * Get server configuration
   */
  getConfig(): MCPServerConfig {
    return this.config;
  }

  /**
   * Get configured default tool name for a semantic operation
   */
  getDefaultTool(key: MCPDefaultToolKey): string | undefined {
    return this.config.defaultTools?.[key];
  }

  /**
   * Call a configured default tool. Falls back to the tool key name if not configured.
   */
  async callDefaultTool(key: MCPDefaultToolKey, params: any): Promise<any> {
    const toolName = this.getDefaultTool(key) ?? key
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase();
    return this.callTool(toolName, params);
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.connected && this.transport) {
      await this.client.close();
      this.connected = false;
      console.log(`✓ Disconnected from MCP server: ${this.config.name}`);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}
