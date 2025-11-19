import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';

interface UserPresence {
  userId: string;
  username: string;
  color: string;
  cursor?: { line: number; column: number };
}

interface CollaborationState {
  connected: boolean;
  users: UserPresence[];
  readonly: boolean;
}

export function useCollaboration(documentId: string | null, token: string | null) {
  const [state, setState] = useState<CollaborationState>({
    connected: false,
    users: [],
    readonly: true,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!documentId || !token) return;

    const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
    const url = `${WS_URL}/collaboration?documentId=${documentId}&token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    // Initialize Y.Doc
    if (!ydocRef.current) {
      ydocRef.current = new Y.Doc();
    }

    ws.onopen = () => {
      console.log('Collaboration connected');
      setState((prev) => ({ ...prev, connected: true }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'sync':
            // Apply Y.js update
            if (message.update && ydocRef.current) {
              const update = new Uint8Array(message.update);
              Y.applyUpdate(ydocRef.current, update);
            }
            
            // Set readonly status
            if (message.readonly !== undefined) {
              setState((prev) => ({ ...prev, readonly: message.readonly }));
            }
            break;

          case 'presence':
            // Update user presence
            if (message.users) {
              setState((prev) => ({ ...prev, users: message.users }));
            }
            break;

          case 'pong':
            // Keep-alive response
            break;

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Collaboration disconnected');
      setState((prev) => ({ ...prev, connected: false, users: [] }));
      wsRef.current = null;

      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };
  }, [documentId, token]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendUpdate = useCallback((update: Uint8Array) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update',
        update: Array.from(update),
      }));
    }
  }, []);

  const sendCursor = useCallback((position: { line: number; column: number }) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor',
        position,
      }));
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Set up Y.Doc update listener
  useEffect(() => {
    if (!ydocRef.current) return;

    const ydoc = ydocRef.current;
    
    const updateHandler = (update: Uint8Array) => {
      sendUpdate(update);
    };

    ydoc.on('update', updateHandler);

    return () => {
      ydoc.off('update', updateHandler);
    };
  }, [sendUpdate]);

  return {
    ...state,
    ydoc: ydocRef.current,
    sendCursor,
    reconnect: connect,
  };
}
