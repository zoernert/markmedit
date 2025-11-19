import { Router } from 'express';
import { config } from '../config/index.js';
import { listStoredMcpServers } from '../services/mcp-registry.js';
import { getMCPServer, findBestMCPServer } from '../services/mcp-manager.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

export const mcpGenericRoutes = Router();

const toolCallSchema = z.object({
  serverId: z.string().optional(), // If not provided, auto-select based on query
  tool: z.string().min(1),
  params: z.any(),
  autoSelect: z.boolean().optional().default(false),
  allowedServerIds: z.array(z.string()).optional(),
});

interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

function normalizeToolList(response: any): DiscoveredTool[] {
  if (!response) {
    return [];
  }

  const containers: any[] = [];

  if (Array.isArray(response)) {
    containers.push(response);
  } else if (response && typeof response === 'object') {
    if (Array.isArray((response as any).tools)) {
      containers.push((response as any).tools);
    }
    if (Array.isArray((response as any).result)) {
      containers.push((response as any).result);
    }
    const nestedTools = (response as any).result?.tools ?? (response as any).data?.tools;
    if (Array.isArray(nestedTools)) {
      containers.push(nestedTools);
    }
  }

  const toolsCandidate = containers.find((entry) => Array.isArray(entry)) ?? [];

  return toolsCandidate
    .filter((tool: any) => tool && typeof tool === 'object' && typeof tool.name === 'string')
    .map((tool: any) => ({
      name: tool.name as string,
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema: tool.input_schema ?? tool.inputSchema,
    }));
}

// List all available MCP servers
mcpGenericRoutes.get('/servers', async (_req, res) => {
  if (!config.features.enableMCP) {
    throw new AppError(503, 'MCP not enabled');
  }

  const storedServers = listStoredMcpServers();
  const discoveryResults = await Promise.all(
    storedServers.map(async server => {
      if (!server.enabled) {
        return { id: server.id, tools: [], error: undefined };
      }

      try {
        const client = getMCPServer(server.id);
        const response = await client.listTools();
        return { id: server.id, tools: normalizeToolList(response), error: undefined };
      } catch (error) {
        console.error(`Failed to discover tools for MCP server '${server.id}'`, error);
        const message = error instanceof Error ? error.message : String(error);
        return { id: server.id, tools: [], error: message };
      }
    }),
  );

  const toolMap = new Map(discoveryResults.map(entry => [entry.id, entry]));

  const servers = storedServers.map(server => {
    const match = toolMap.get(server.id);
    return {
      ...server,
      tools: match?.tools ?? [],
      toolError: match?.error,
    };
  });

  res.json({ servers });
});

// List tools from a specific server
mcpGenericRoutes.post('/list-tools', async (req, res) => {
  if (!config.features.enableMCP) {
    throw new AppError(503, 'MCP not enabled');
  }

  const { serverId } = z.object({ 
    serverId: z.string() 
  }).parse(req.body);

  const server = getMCPServer(serverId);
  const tools = await server.listTools();
  
  res.json({ serverId, tools });
});

// Call a tool on an MCP server
mcpGenericRoutes.post('/call-tool', async (req, res) => {
  if (!config.features.enableMCP) {
    throw new AppError(503, 'MCP not enabled');
  }

  const data = toolCallSchema.parse(req.body);
  
  let server;
  if (data.serverId) {
    server = getMCPServer(data.serverId);
  } else if (data.autoSelect && data.params?.query) {
    server = findBestMCPServer(data.params.query, data.allowedServerIds);
    if (!server) {
      throw new AppError(404, 'No suitable MCP server found for query');
    }
  } else if (data.autoSelect && data.allowedServerIds?.length) {
    const [fallbackId] = data.allowedServerIds;
    if (!fallbackId) {
      throw new AppError(404, 'No suitable MCP server found for query');
    }
    server = getMCPServer(fallbackId);
  } else {
    throw new AppError(400, 'Either serverId must be provided or autoSelect=true with a query');
  }

  const result = await server.callTool(data.tool, data.params);
  
  res.json({ 
    serverId: server.getConfig().id,
    serverName: server.getConfig().name,
    tool: data.tool,
    result 
  });
});
