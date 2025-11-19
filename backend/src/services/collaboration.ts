import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import * as Y from 'yjs';
import { PermissionService } from './permissions.js';
import { AuthService } from './auth.js';
import { getDatabase } from '../db/index.js';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  documentId?: string;
  canWrite?: boolean;
}

interface UserPresence {
  userId: string;
  username: string;
  color: string;
  cursor?: { line: number; column: number };
}

/**
 * Y.js documents store (documentId -> Y.Doc)
 */
const documents = new Map<string, Y.Doc>();

/**
 * WebSocket connections per document (documentId -> Set<WebSocket>)
 */
const connections = new Map<string, Set<AuthenticatedWebSocket>>();

/**
 * Active users per document for presence tracking
 */
const activeUsers = new Map<string, Map<string, UserPresence>>();

/**
 * Color palette for user cursors
 */
const userColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
];

/**
 * Get a unique color for a user
 */
function getUserColor(userId: string): string {
  const hash = userId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  return userColors[Math.abs(hash) % userColors.length];
}

/**
 * Get or create Y.Doc for a document
 */
function getYDoc(documentId: string): Y.Doc {
  let ydoc = documents.get(documentId);
  
  if (!ydoc) {
    ydoc = new Y.Doc();
    documents.set(documentId, ydoc);
    
    // Load content from database
    const db = getDatabase();
    const doc = db.prepare('SELECT content FROM documents WHERE id = ?').get(documentId) as any;
    
    if (doc?.content) {
      const ytext = ydoc.getText('content');
      ytext.insert(0, doc.content);
    }
    
    // Save on update
    ydoc.on('update', (update: Uint8Array) => {
      // Persist to database
      const content = ydoc!.getText('content').toString();
      db.prepare('UPDATE documents SET content = ?, updated_at = ? WHERE id = ?')
        .run(content, Date.now(), documentId);
      
      // Broadcast to all connected clients
      broadcastUpdate(documentId, update);
    });
  }
  
  return ydoc;
}

/**
 * Broadcast Y.js update to all clients
 */
function broadcastUpdate(documentId: string, update: Uint8Array): void {
  const conns = connections.get(documentId);
  if (!conns) return;
  
  const message = JSON.stringify({
    type: 'sync',
    update: Array.from(update),
  });
  
  for (const conn of conns) {
    if (conn.readyState === WebSocket.OPEN) {
      conn.send(message);
    }
  }
}

/**
 * Broadcast presence update
 */
function broadcastPresence(documentId: string): void {
  const users = activeUsers.get(documentId);
  if (!users) return;
  
  const message = JSON.stringify({
    type: 'presence',
    users: Array.from(users.values()),
  });
  
  const conns = connections.get(documentId);
  if (!conns) return;
  
  for (const conn of conns) {
    if (conn.readyState === WebSocket.OPEN) {
      conn.send(message);
    }
  }
}

/**
 * Initialize WebSocket server for real-time collaboration
 */
export function initializeCollaborationServer(httpServer: HTTPServer): WebSocketServer {
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/collaboration',
  });

  wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const documentId = url.searchParams.get('documentId');
    const token = url.searchParams.get('token');

    if (!documentId) {
      ws.close(4000, 'Document ID required');
      return;
    }

    // Verify authentication and permissions
    let user = null;
    if (token) {
      try {
        user = await AuthService.verifyToken(token);
      } catch (error) {
        console.error('Token verification failed:', error);
      }
    }

    // Check permission (at least read access required)
    const hasPermission = PermissionService.checkPermission(
      documentId,
      user?.id || null,
      'read'
    );

    if (!hasPermission) {
      ws.close(4003, 'Access denied');
      return;
    }

    // Check if user has write permission
    const canWrite = user ? PermissionService.checkPermission(
      documentId,
      user.id,
      'write'
    ) : false;

    // Store user info on WebSocket
    ws.userId = user?.id || `anon-${Date.now()}`;
    ws.username = user?.username || 'Anonymous';
    ws.documentId = documentId;
    ws.canWrite = canWrite;

    // Add to connections
    if (!connections.has(documentId)) {
      connections.set(documentId, new Set());
    }
    connections.get(documentId)!.add(ws);

    // Track active user
    if (!activeUsers.has(documentId)) {
      activeUsers.set(documentId, new Map());
    }

    const userPresence: UserPresence = {
      userId: ws.userId,
      username: ws.username,
      color: getUserColor(ws.userId),
    };

    activeUsers.get(documentId)!.set(ws.userId, userPresence);

    // Get or create Y.Doc
    const ydoc = getYDoc(documentId);

    // Send initial state
    const state = Y.encodeStateAsUpdate(ydoc);
    ws.send(JSON.stringify({
      type: 'sync',
      update: Array.from(state),
      readonly: !canWrite,
    }));

    // Send current presence
    broadcastPresence(documentId);

    // Handle messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'update':
            // Apply update to Y.Doc
            if (canWrite && message.update) {
              const update = new Uint8Array(message.update);
              Y.applyUpdate(ydoc, update);
            }
            break;

          case 'cursor':
            // Update cursor position
            if (message.position) {
              const users = activeUsers.get(documentId);
              if (users?.has(ws.userId!)) {
                const user = users.get(ws.userId!)!;
                user.cursor = message.position;
                broadcastPresence(documentId);
              }
            }
            break;

          case 'ping':
            // Respond to ping
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    // Handle close
    ws.on('close', () => {
      // Remove from connections
      const conns = connections.get(documentId);
      if (conns) {
        conns.delete(ws);
        if (conns.size === 0) {
          connections.delete(documentId);
          // Keep Y.Doc for a while (could implement cleanup later)
        }
      }

      // Remove from active users
      const users = activeUsers.get(documentId);
      if (users) {
        users.delete(ws.userId!);
        if (users.size === 0) {
          activeUsers.delete(documentId);
        } else {
          broadcastPresence(documentId);
        }
      }

      console.log(`User ${ws.username} disconnected from document ${documentId}`);
    });

    console.log(`User ${ws.username} connected to document ${documentId} (write: ${canWrite})`);
  });

  console.log('✓ Collaboration WebSocket server initialized on /collaboration');
  
  return wss;
}

/**
 * Get active users for a document
 */
export function getActiveUsers(documentId: string): UserPresence[] {
  const users = activeUsers.get(documentId);
  return users ? Array.from(users.values()) : [];
}

/**
 * Get number of active users across all documents
 */
export function getCollaborationStats(): { totalDocuments: number; totalUsers: number } {
  let totalUsers = 0;
  for (const users of activeUsers.values()) {
    totalUsers += users.size;
  }
  
  return {
    totalDocuments: activeUsers.size,
    totalUsers,
  };
}

/**
 * Force save document state
 */
export function saveDocumentState(documentId: string): void {
  const ydoc = documents.get(documentId);
  if (!ydoc) return;

  const db = getDatabase();
  const content = ydoc.getText('content').toString();
  db.prepare('UPDATE documents SET content = ?, updated_at = ? WHERE id = ?')
    .run(content, Date.now(), documentId);
}
