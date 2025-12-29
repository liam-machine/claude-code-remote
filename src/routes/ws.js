/**
 * WebSocket Handler - Manages WebSocket connections for terminal I/O
 */

import { WebSocketServer } from 'ws';
import { getSession } from '../services/sessionManager.js';

// Store WebSocket connections by session ID
const connections = new Map();

/**
 * Initialize WebSocket server and attach to HTTP server
 * @param {http.Server} server - HTTP server instance
 */
export function initWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade requests
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;

    // Match /ws/:sessionId pattern
    const match = pathname.match(/^\/ws\/([a-f0-9-]+)$/i);
    
    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const sessionId = match[1];
    const session = getSession(sessionId);

    if (!session) {
      socket.write('HTTP/1.1 404 Session Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Upgrade the connection
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, session);
    });
  });

  // Handle new WebSocket connections
  wss.on('connection', (ws, request, session) => {
    const sessionId = session.id;
    console.log('[WS] Client connected to session:', sessionId);

    // Store the connection
    connections.set(sessionId, ws);

    // Send initial status
    ws.send(JSON.stringify({ type: 'status', status: 'connected', sessionId }));

    // Forward PTY output to WebSocket
    const ptyDataHandler = (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    };
    session.pty.onData(ptyDataHandler);

    // Handle PTY exit
    const ptyExitHandler = (exitCode) => {
      console.log('[WS] PTY exited with code:', exitCode);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
      }
    };
    session.pty.onExit(ptyExitHandler);

    // Handle incoming WebSocket messages
    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());
        
        switch (msg.type) {
          case 'input':
            // Forward input to PTY
            if (session.pty && msg.data) {
              session.pty.write(msg.data);
            }
            break;
            
          case 'resize':
            // Resize PTY
            if (session.pty && msg.cols && msg.rows) {
              session.pty.resize(msg.cols, msg.rows);
              console.log('[WS] Resized PTY to', msg.cols + 'x' + msg.rows);
            }
            break;
            
          default:
            console.log('[WS] Unknown message type:', msg.type);
        }
      } catch (err) {
        console.error('[WS] Error parsing message:', err.message);
      }
    });

    // Handle WebSocket close
    ws.on('close', () => {
      console.log('[WS] Client disconnected from session:', sessionId);
      connections.delete(sessionId);
    });

    // Handle WebSocket error
    ws.on('error', (err) => {
      console.error('[WS] Error on session', sessionId + ':', err.message);
    });
  });

  console.log('[WS] WebSocket server initialized');
  return wss;
}

/**
 * Get WebSocket connection for a session
 * @param {string} sessionId - Session ID
 * @returns {WebSocket|null}
 */
export function getConnection(sessionId) {
  return connections.get(sessionId) || null;
}
