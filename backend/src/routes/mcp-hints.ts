import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, MCPToolHint } from '../db/index.js';

const router = Router();

// GET all hints
router.get('/', (_req, res) => {
  try {
    const db = getDatabase();
    const hints = db.prepare(`
      SELECT * FROM mcp_tool_hints 
      ORDER BY priority DESC, tool_name ASC
    `).all() as MCPToolHint[];
    
    res.json({ hints });
  } catch (error) {
    console.error('Error fetching MCP tool hints:', error);
    res.status(500).json({ error: 'Failed to fetch hints' });
  }
});

// GET hints for specific server
router.get('/server/:serverId', (req, res) => {
  try {
    const db = getDatabase();
    const { serverId } = req.params;
    
    const hints = db.prepare(`
      SELECT * FROM mcp_tool_hints 
      WHERE server_id = ? 
      ORDER BY priority DESC, tool_name ASC
    `).all(serverId) as MCPToolHint[];
    
    res.json({ hints });
  } catch (error) {
    console.error('Error fetching hints for server:', error);
    res.status(500).json({ error: 'Failed to fetch hints' });
  }
});

// GET hint by ID
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    
    const hint = db.prepare('SELECT * FROM mcp_tool_hints WHERE id = ?').get(id) as MCPToolHint | undefined;
    
    if (!hint) {
      return res.status(404).json({ error: 'Hint not found' });
    }
    
    return res.json({ hint });
  } catch (error) {
    console.error('Error fetching hint:', error);
    return res.status(500).json({ error: 'Failed to fetch hint' });
  }
});

// POST create new hint
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const { tool_name, server_id, description, keywords, usage_hint, priority } = req.body;
    
    if (!tool_name) {
      return res.status(400).json({ error: 'tool_name is required' });
    }
    
    const id = randomUUID();
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO mcp_tool_hints (
        id, tool_name, server_id, description, keywords, usage_hint, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tool_name,
      server_id || null,
      description || null,
      keywords || null,
      usage_hint || null,
      priority || 0,
      now,
      now
    );
    
    const hint = db.prepare('SELECT * FROM mcp_tool_hints WHERE id = ?').get(id) as MCPToolHint;
    
    return res.status(201).json({ hint });
  } catch (error) {
    console.error('Error creating hint:', error);
    return res.status(500).json({ error: 'Failed to create hint' });
  }
});

// PUT update hint
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const { tool_name, server_id, description, keywords, usage_hint, priority } = req.body;
    
    // Check if hint exists
    const existing = db.prepare('SELECT * FROM mcp_tool_hints WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Hint not found' });
    }
    
    const now = Date.now();
    
    db.prepare(`
      UPDATE mcp_tool_hints 
      SET tool_name = ?, server_id = ?, description = ?, keywords = ?, usage_hint = ?, priority = ?, updated_at = ?
      WHERE id = ?
    `).run(
      tool_name,
      server_id || null,
      description || null,
      keywords || null,
      usage_hint || null,
      priority !== undefined ? priority : 0,
      now,
      id
    );
    
    const hint = db.prepare('SELECT * FROM mcp_tool_hints WHERE id = ?').get(id) as MCPToolHint;
    
    return res.json({ hint });
  } catch (error) {
    console.error('Error updating hint:', error);
    return res.status(500).json({ error: 'Failed to update hint' });
  }
});

// DELETE hint
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    
    const result = db.prepare('DELETE FROM mcp_tool_hints WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Hint not found' });
    }
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting hint:', error);
    return res.status(500).json({ error: 'Failed to delete hint' });
  }
});

// POST bulk create hints for a server's tools
router.post('/bulk', (req, res) => {
  try {
    const db = getDatabase();
    const { hints } = req.body;
    
    if (!Array.isArray(hints)) {
      return res.status(400).json({ error: 'hints must be an array' });
    }
    
    const now = Date.now();
    const insertStmt = db.prepare(`
      INSERT INTO mcp_tool_hints (
        id, tool_name, server_id, description, keywords, usage_hint, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const createdHints: MCPToolHint[] = [];
    
    for (const hint of hints) {
      const id = randomUUID();
      insertStmt.run(
        id,
        hint.tool_name,
        hint.server_id || null,
        hint.description || null,
        hint.keywords || null,
        hint.usage_hint || null,
        hint.priority || 0,
        now,
        now
      );
      
      const created = db.prepare('SELECT * FROM mcp_tool_hints WHERE id = ?').get(id) as MCPToolHint;
      createdHints.push(created);
    }
    
    return res.status(201).json({ hints: createdHints });
  } catch (error) {
    console.error('Error creating bulk hints:', error);
    return res.status(500).json({ error: 'Failed to create hints' });
  }
});

export default router;
