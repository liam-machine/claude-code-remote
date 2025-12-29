/**
 * PTY Manager - Handles spawning and managing pseudo-terminals via node-pty
 */

import pty from 'node-pty';
import { platform } from 'os';

// Default shell based on platform
const defaultShell = platform() === 'win32' ? 'powershell.exe' : '/bin/bash';

/**
 * Spawn a new PTY process
 * @param {Object} options - Spawn options
 * @param {string} options.cwd - Working directory for the shell
 * @param {number} options.cols - Terminal columns (default: 80)
 * @param {number} options.rows - Terminal rows (default: 24)
 * @param {Object} options.env - Additional environment variables
 * @returns {Object} PTY process instance
 */
export function spawnPty(options = {}) {
  const {
    cwd = process.env.HOME || '/home/liam',
    cols = 80,
    rows = 24,
    env = {}
  } = options;

  const ptyProcess = pty.spawn(defaultShell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      ...env
    }
  });

  console.log('[PTY] Spawned process PID:', ptyProcess.pid, 'CWD:', cwd);
  
  return ptyProcess;
}

/**
 * Resize a PTY process
 * @param {Object} ptyProcess - The PTY process to resize
 * @param {number} cols - New column count
 * @param {number} rows - New row count
 */
export function resizePty(ptyProcess, cols, rows) {
  if (ptyProcess && typeof ptyProcess.resize === 'function') {
    ptyProcess.resize(cols, rows);
    console.log('[PTY] Resized PID', ptyProcess.pid, 'to', cols + 'x' + rows);
  }
}

/**
 * Write data to a PTY process
 * @param {Object} ptyProcess - The PTY process
 * @param {string} data - Data to write
 */
export function writePty(ptyProcess, data) {
  if (ptyProcess && typeof ptyProcess.write === 'function') {
    ptyProcess.write(data);
  }
}

/**
 * Kill a PTY process
 * @param {Object} ptyProcess - The PTY process to kill
 */
export function killPty(ptyProcess) {
  if (ptyProcess) {
    const pid = ptyProcess.pid;
    try {
      ptyProcess.kill();
      console.log('[PTY] Killed process PID:', pid);
    } catch (err) {
      console.error('[PTY] Error killing PID', pid + ':', err.message);
    }
  }
}
