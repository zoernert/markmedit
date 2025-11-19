import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { getMCPClient } from '../services/mcp.js';
import { findBestMCPServer, getMCPServer } from '../services/mcp-manager.js';
import type { MCPClient, MCPDefaultToolKey } from '../services/mcp-client.js';

export const mcpRoutes = Router();

const baseOptionsSchema = z.object({
  serverId: z.string().optional(),
  tool: z.string().optional(),
  autoSelect: z.boolean().optional(),
  allowedServerIds: z.array(z.string()).optional(),
});

const searchSchema = baseOptionsSchema.extend({
  query: z.string().min(1),
  limit: z.number().min(1).max(100).optional(),
  collection: z.string().optional(),
});

const chatSchema = baseOptionsSchema.extend({
  message: z.string().min(1),
  history: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional(),
  metadata: z.record(z.any()).optional(),
});

const reasoningSchema = baseOptionsSchema.extend({
  query: z.string().min(1),
  context: z.string().optional(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional(),
});

const edifactSchema = baseOptionsSchema.extend({
  message: z.string().min(1),
});

const edifactChatSchema = baseOptionsSchema.extend({
  message: z.string().min(1),
  edifactMessage: z.string().min(1),
  history: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional(),
});

const edifactModifySchema = baseOptionsSchema.extend({
  instruction: z.string().min(1),
  currentMessage: z.string().min(1),
});

function ensureMCPEnabled() {
  if (!config.features.enableMCP) {
    throw new AppError(503, 'MCP not enabled');
  }
}

function camelToKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function resolveServer({
  serverId,
  autoSelect,
  query,
  allowedServerIds,
}: {
  serverId?: string;
  autoSelect?: boolean;
  query?: string;
  allowedServerIds?: string[];
}): MCPClient {
  if (serverId) {
    return getMCPServer(serverId);
  }

  if (autoSelect && query) {
    const best = findBestMCPServer(query, allowedServerIds);
    if (best) {
      return best;
    }
  }

  try {
    return getMCPClient(allowedServerIds);
  } catch (error) {
    throw new AppError(404, 'No enabled MCP servers available');
  }
}

function resolveToolName(server: MCPClient, key: MCPDefaultToolKey, explicitTool?: string): string {
  if (explicitTool) {
    return explicitTool;
  }
  return server.getDefaultTool(key) ?? camelToKebab(key);
}

function buildResponse(server: MCPClient, tool: string, payload: any) {
  const config = server.getConfig();
  return {
    serverId: config.id,
    serverName: config.name,
    serverDescription: config.description,
    tool,
    result: payload,
  };
}

// Semantic search
mcpRoutes.post('/search', async (req, res) => {
  ensureMCPEnabled();
  const data = searchSchema.parse(req.body);

  const server = resolveServer({
    serverId: data.serverId,
    autoSelect: data.autoSelect,
    query: data.query,
    allowedServerIds: data.allowedServerIds,
  });

  const toolName = resolveToolName(server, 'search', data.tool);
  const params = {
    query: data.query,
    limit: data.limit,
    collection: data.collection,
  };

  const result = await server.callTool(toolName, params);
  res.json(buildResponse(server, toolName, result));
});

// Chat
mcpRoutes.post('/chat', async (req, res) => {
  ensureMCPEnabled();
  const data = chatSchema.parse(req.body);

  const server = resolveServer({
    serverId: data.serverId,
    autoSelect: data.autoSelect,
    query: data.message,
    allowedServerIds: data.allowedServerIds,
  });

  const toolName = resolveToolName(server, 'chat', data.tool);
  const params = {
    message: data.message,
    history: data.history,
    metadata: data.metadata,
  };

  const result = await server.callTool(toolName, params);
  res.json(buildResponse(server, toolName, result));
});

// Reasoning / advanced analysis
mcpRoutes.post('/reasoning', async (req, res) => {
  ensureMCPEnabled();
  const data = reasoningSchema.parse(req.body);

  const server = resolveServer({
    serverId: data.serverId,
    autoSelect: data.autoSelect,
    query: data.query,
    allowedServerIds: data.allowedServerIds,
  });

  const toolName = resolveToolName(server, 'reasoning', data.tool);
  const params = {
    query: data.query,
    context: data.context,
    messages: data.messages,
  };

  const result = await server.callTool(toolName, params);
  res.json(buildResponse(server, toolName, result));
});

// EDIFACT helpers
function ensureEdifactTool(server: MCPClient, key: MCPDefaultToolKey, tool?: string) {
  const resolved = resolveToolName(server, key, tool);
  return resolved;
}

mcpRoutes.post('/edifact/analyze', async (req, res) => {
  ensureMCPEnabled();
  const data = edifactSchema.parse(req.body);
  const server = resolveServer({
    serverId: data.serverId,
    autoSelect: data.autoSelect,
    query: data.message,
    allowedServerIds: data.allowedServerIds,
  });

  const toolName = ensureEdifactTool(server, 'edifactAnalyze', data.tool);
  const result = await server.callTool(toolName, { message: data.message });
  res.json(buildResponse(server, toolName, result));
});

mcpRoutes.post('/edifact/explain', async (req, res) => {
  ensureMCPEnabled();
  const data = edifactSchema.parse(req.body);
  const server = resolveServer({
    serverId: data.serverId,
    autoSelect: data.autoSelect,
    query: data.message,
    allowedServerIds: data.allowedServerIds,
  });

  const toolName = ensureEdifactTool(server, 'edifactExplain', data.tool);
  const result = await server.callTool(toolName, { message: data.message });
  res.json(buildResponse(server, toolName, result));
});

mcpRoutes.post('/edifact/validate', async (req, res) => {
  ensureMCPEnabled();
  const data = edifactSchema.parse(req.body);
  const server = resolveServer({
    serverId: data.serverId,
    autoSelect: data.autoSelect,
    query: data.message,
    allowedServerIds: data.allowedServerIds,
  });

  const toolName = ensureEdifactTool(server, 'edifactValidate', data.tool);
  const result = await server.callTool(toolName, { message: data.message });
  res.json(buildResponse(server, toolName, result));
});

mcpRoutes.post('/edifact/chat', async (req, res) => {
  ensureMCPEnabled();
  const data = edifactChatSchema.parse(req.body);
  const server = resolveServer({
    serverId: data.serverId,
    autoSelect: data.autoSelect,
    query: data.message,
    allowedServerIds: data.allowedServerIds,
  });

  const toolName = ensureEdifactTool(server, 'edifactChat', data.tool);
  const params = {
    message: data.message,
    edifactMessage: data.edifactMessage,
    history: data.history,
  };
  const result = await server.callTool(toolName, params);
  res.json(buildResponse(server, toolName, result));
});

mcpRoutes.post('/edifact/modify', async (req, res) => {
  ensureMCPEnabled();
  const data = edifactModifySchema.parse(req.body);
  const server = resolveServer({
    serverId: data.serverId,
    autoSelect: data.autoSelect,
    query: data.instruction,
    allowedServerIds: data.allowedServerIds,
  });

  const toolName = ensureEdifactTool(server, 'edifactModify', data.tool);
  const params = {
    instruction: data.instruction,
    currentMessage: data.currentMessage,
  };
  const result = await server.callTool(toolName, params);
  res.json(buildResponse(server, toolName, result));
});
