import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config/index.js';
import {
  listStoredMcpServers,
  upsertMcpServer,
  updateMcpServer,
  deleteMcpServer,
  setDefaultMcpServer,
  findMcpServerById,
} from '../services/mcp-registry.js';
import { invalidateMCPManager } from '../services/mcp-manager.js';
import { AppError } from '../middleware/errorHandler.js';

export const mcpServerRoutes = Router();

const baseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  type: z.enum(['http']).default('http'),
  description: z.string().min(1),
  capabilities: z.array(z.string()).optional(),
  defaultTools: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const updateSchema = baseSchema.omit({ id: true }).partial();

function ensureMcpEnabled() {
  if (!config.features.enableMCP) {
    throw new AppError(503, 'MCP not enabled');
  }
}

mcpServerRoutes.get('/', (_req, res) => {
  ensureMcpEnabled();
  const servers = listStoredMcpServers();
  res.json({ servers });
});

mcpServerRoutes.post('/', (req, res) => {
  ensureMcpEnabled();
  const payload = baseSchema.parse(req.body);
  const record = upsertMcpServer(payload);
  invalidateMCPManager();
  res.status(201).json({ server: record });
});

mcpServerRoutes.put('/:id', (req, res) => {
  ensureMcpEnabled();
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
  if (!findMcpServerById(id)) {
    throw new AppError(404, `MCP server '${id}' not found`);
  }

  const payload = updateSchema.parse(req.body);
  if (!Object.keys(payload).length) {
    throw new AppError(400, 'No fields provided for update');
  }

  let record = updateMcpServer(id, payload);
  if (payload.isDefault) {
    setDefaultMcpServer(id);
    record = findMcpServerById(id)!;
  }
  invalidateMCPManager();
  res.json({ server: record });
});

mcpServerRoutes.post('/:id/default', (req, res) => {
  ensureMcpEnabled();
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
  if (!findMcpServerById(id)) {
    throw new AppError(404, `MCP server '${id}' not found`);
  }

  setDefaultMcpServer(id);
  invalidateMCPManager();
  const record = findMcpServerById(id)!;
  res.json({ server: record });
});

mcpServerRoutes.delete('/:id', (req, res) => {
  ensureMcpEnabled();
  const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
  if (!findMcpServerById(id)) {
    res.status(204).end();
    return;
  }

  deleteMcpServer(id);
  invalidateMCPManager();
  res.status(204).end();
});
