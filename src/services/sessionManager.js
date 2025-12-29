/**
 * Session Manager - Manages terminal sessions with PTY processes
 */

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { spawnPty, killPty, resizePty, writePty } from './ptyManager.js';
import { config } from '../config.js';

// In-memory session storage
const sessions = new Map();

// Claude command to auto-run
const CLAUDE_COMMAND = 'claude --dangerously-skip-permissions\n';

/**
 * Create a new session
 * @param {Object} options - Session options
 * @param {string} options.repoPath - Working directory for the session
 * @param {boolean} options.autoStartClaude - Whether to auto-start Claude (default: true)
 * @returns {Object} Session object with id, pty, createdAt
 */
export function createSession(options = {}) {
  // Check max sessions limit
  if (sessions.size >= config.maxSessions) {
    throw new Error(`Maximum sessions (${config.maxSessions}) reached`);
  }

  const id = uuidv4();
  const cwd = options.repoPath || config.reposDir;
  const autoStartClaude = options.autoStartClaude !== false;
  
  const pty = spawnPty({ cwd });
  
  // Detect home directory to display as "~" instead of username
  const isHomeDir = cwd === "/home/liam" || cwd === process.env.HOME;
  const repoName = isHomeDir ? "~" : path.basename(cwd);
  
  const session = {
    id,
    pty,
    repoPath: cwd,
    repo: repoName,
    status: 'running',
    createdAt: new Date().toISOString()
  };

  sessions.set(id, session);
  console.log('[Session] Created session:', id, 'Total:', sessions.size);
  
  // Auto-start Claude Code after a brief delay for bash to initialize
  if (autoStartClaude) {
    setTimeout(() => {
      if (sessions.has(id)) {
        console.log('[Session] Auto-starting Claude Code in session:', id);
        writePty(pty, CLAUDE_COMMAND);
      }
    }, 100);
  }
  
  return session;
}

/**
 * Get a session by ID
 * @param {string} id - Session ID
 * @returns {Object|null} Session object or null if not found
 */
export function getSession(id) {
  return sessions.get(id) || null;
}

/**
 * Get all sessions
 * @returns {Array} Array of session objects (without PTY details)
 */
export function getAllSessions() {
  return Array.from(sessions.values()).map(session => ({
    id: session.id,
    repo: session.repo,
    repoPath: session.repoPath,
    status: session.status,
    createdAt: session.createdAt
  }));
}

/**
 * Delete a session
 * @param {string} id - Session ID
 * @returns {boolean} True if deleted, false if not found
 */
export function deleteSession(id) {
  const session = sessions.get(id);
  if (!session) {
    return false;
  }

  killPty(session.pty);
  sessions.delete(id);
  console.log('[Session] Deleted session:', id, 'Remaining:', sessions.size);
  
  return true;
}

/**
 * Resize a session's PTY
 * @param {string} id - Session ID
 * @param {number} cols - New column count
 * @param {number} rows - New row count
 */
export function resizeSession(id, cols, rows) {
  const session = sessions.get(id);
  if (session) {
    resizePty(session.pty, cols, rows);
  }
}

/**
 * Write to a session's PTY
 * @param {string} id - Session ID
 * @param {string} data - Data to write
 */
export function writeToSession(id, data) {
  const session = sessions.get(id);
  if (session) {
    writePty(session.pty, data);
  }
}

/**
 * Get session count
 * @returns {number} Number of active sessions
 */
export function getSessionCount() {
  return sessions.size;
}
