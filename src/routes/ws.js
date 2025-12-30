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
  const wss = new WebSocketServer({
    noServer: true,
    // CRITICAL: Disable compression for iOS compatibility
    // iOS 14/15+ has bugs with permessage-deflate that cause disconnections
    perMessageDeflate: false
  });

  // Server-side heartbeat to detect dead connections
  // iOS PWAs aggressively close idle connections after 30-60s
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('[WS] Terminating dead connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping(); // WebSocket protocol-level ping
    });
  }, 25000); // Check every 25 seconds

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

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
    const clientIP = request.socket?.remoteAddress || 'unknown';
    console.log('[WS] Client connected to session:', sessionId, 'from IP:', clientIP);

    // Mark connection as alive for heartbeat
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Store the connection
    connections.set(sessionId, ws);

    // Send initial status
    ws.send(JSON.stringify({ type: 'status', status: 'connected', sessionId }));

    // ============================================================
    // BUFFERED PTY OUTPUT - Batches rapid PTY output to prevent
    // overwhelming clients with many small WebSocket messages
    // ============================================================
    let outputBuffer = '';
    let flushTimeout = null;
    const FLUSH_INTERVAL = 50; // ms - collect output over 50ms window
    
    const flushBuffer = () => {
      flushTimeout = null;
      if (outputBuffer && ws.readyState === ws.OPEN) {
        console.log('[WS] Flushing buffered output, length:', outputBuffer.length);
        try {
          ws.send(JSON.stringify({ type: 'output', data: outputBuffer }));
        } catch (e) {
          console.error('[WS] Send error:', e.message);
        }
        outputBuffer = '';
      }
    };

    const ptyDataHandler = (data) => {
      outputBuffer += data;
      // Schedule flush if not already scheduled
      if (!flushTimeout) {
        flushTimeout = setTimeout(flushBuffer, FLUSH_INTERVAL);
      }
    };

    // Attach handler after short delay for connection to stabilize
    setTimeout(() => {
      console.log('[WS] Attaching buffered PTY data handler (50ms batching)');
      session.pty.onData(ptyDataHandler);
    }, 100);

    // Handle PTY exit
    const ptyExitHandler = (exitCode) => {
      // Flush any remaining output before sending exit
      if (outputBuffer && ws.readyState === ws.OPEN) {
        flushBuffer();
      }
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

          case 'ping':
            // Client-side heartbeat - respond immediately
            // This helps iOS detect zombie connections
            ws.isAlive = true;
            ws.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }));
            break;

          default:
            console.log('[WS] Unknown message type:', msg.type);
        }
      } catch (err) {
        console.error('[WS] Error parsing message:', err.message);
      }
    });

    // Handle WebSocket close
    ws.on('close', (code, reason) => {
      // Clean up flush timeout
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }
      console.log('[WS] Close code:', code, 'reason:', reason?.toString());
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
