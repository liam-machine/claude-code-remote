/**
 * Claude Code Remote - Main Application
 * Handles multi-session management, WebSocket connections, and terminal I/O
 */

const App = {
  sessions: new Map(),       // Map<sessionId, { ws, terminal, status, repo }>
  activeSessionId: null,     // Currently visible session
  maxReconnectAttempts: 5,

  /**
   * Initialize the application
   */
  async init() {
    console.log('[App] Claude Code Remote initializing...');
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Load existing sessions
    await this.loadExistingSessions();
    
    // If no sessions exist, show empty state
    if (this.sessions.size === 0) {
      this.showEmptyState();
    }
  },

  /**
   * Set up UI event listeners
   */
  setupEventListeners() {
    // New session button
    document.getElementById('newSessionBtn').addEventListener('click', () => {
      this.createNewSession();
    });

    // Handle resize for active terminal
    window.addEventListener('resize', () => {
      if (this.activeSessionId && this.sessions.has(this.activeSessionId)) {
        const session = this.sessions.get(this.activeSessionId);
        if (session.terminal) {
          session.terminal.fit();
          const dims = session.terminal.getDimensions();
          this.sendResize(this.activeSessionId, dims.cols, dims.rows);
        }
      }
    });
  },

  /**
   * Load existing sessions from API
   */
  async loadExistingSessions() {
    try {
      const response = await fetch('/api/sessions');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      
      const sessions = await response.json();
      console.log('[App] Found existing sessions:', sessions.length);
      
      // Initialize each session
      for (const sessionData of sessions) {
        await this.initSession(sessionData);
      }
      
      // Activate first session if exists
      if (sessions.length > 0) {
        this.switchToSession(sessions[0].id);
      }
      
      this.updateNewSessionButton();
    } catch (err) {
      console.error('[App] Failed to load sessions:', err);
      this.updateStatus('disconnected', 'Load Error');
    }
  },

  /**
   * Create a new session
   */
  async createNewSession(repoPath) {
    try {
      this.updateStatus('connecting', 'Creating session...');
      
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create session');
      }
      
      const sessionData = await response.json();
      console.log('[App] Session created:', sessionData.id);
      
      await this.initSession(sessionData);
      this.switchToSession(sessionData.id);
      this.updateNewSessionButton();
      this.hideEmptyState();
      
    } catch (err) {
      console.error('[App] Failed to create session:', err);
      this.updateStatus('disconnected', err.message);
    }
  },

  /**
   * Initialize a session (create terminal, tab, WebSocket)
   */
  async initSession(sessionData) {
    const { id, repo, repoPath, status } = sessionData;
    
    // Create terminal element
    const terminalWrapper = document.createElement('div');
    terminalWrapper.className = 'terminal-wrapper';
    terminalWrapper.id = 'terminal-' + id;
    document.getElementById('terminalContainer').appendChild(terminalWrapper);
    
    // Initialize xterm
    const terminal = TerminalManager.createTerminal('terminal-' + id);
    
    // Store session
    this.sessions.set(id, {
      id,
      repo,
      repoPath,
      ws: null,
      terminal,
      status: 'connecting',
      reconnectAttempts: 0
    });
    
    // Create tab
    this.createTab(id, repo);
    
    // Connect WebSocket
    this.connectWebSocket(id);
  },

  /**
   * Create a tab element for a session
   */
  createTab(sessionId, repoName) {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.sessionId = sessionId;
    
    tab.innerHTML = 
      '<span class="tab-status"></span>' +
      '<span class="tab-name">' + (repoName || 'Session') + '</span>' +
      '<span class="tab-close">\u00d7</span>';
    
    // Tab click - switch session
    tab.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        this.switchToSession(sessionId);
      }
    });
    
    // Close button click
    tab.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeSession(sessionId);
    });
    
    document.getElementById('tabs').appendChild(tab);
  },

  /**
   * Switch to a session (show its terminal)
   */
  switchToSession(sessionId) {
    if (!this.sessions.has(sessionId)) return;
    
    // Update previous active
    if (this.activeSessionId) {
      const prevWrapper = document.getElementById('terminal-' + this.activeSessionId);
      if (prevWrapper) prevWrapper.classList.remove('active');
      
      const prevTab = document.querySelector('.tab[data-session-id="' + this.activeSessionId + '"]');
      if (prevTab) prevTab.classList.remove('active');
    }
    
    // Activate new session
    this.activeSessionId = sessionId;
    const session = this.sessions.get(sessionId);
    
    const wrapper = document.getElementById('terminal-' + sessionId);
    if (wrapper) wrapper.classList.add('active');
    
    const tab = document.querySelector('.tab[data-session-id="' + sessionId + '"]');
    if (tab) tab.classList.add('active');
    
    // Focus and fit terminal
    if (session.terminal) {
      session.terminal.fit();
      session.terminal.focus();
      
      // Send resize
      const dims = session.terminal.getDimensions();
      this.sendResize(sessionId, dims.cols, dims.rows);
    }
    
    // Update status
    this.updateSessionStatus(sessionId);
  },

  /**
   * Close a session
   */
  async closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    try {
      // Close WebSocket
      if (session.ws) {
        session.ws.close(1000);
      }
      
      // Delete from server
      await fetch('/api/sessions/' + sessionId, { method: 'DELETE' });
      
      // Remove terminal
      const wrapper = document.getElementById('terminal-' + sessionId);
      if (wrapper) wrapper.remove();
      
      // Remove tab
      const tab = document.querySelector('.tab[data-session-id="' + sessionId + '"]');
      if (tab) tab.remove();
      
      // Remove from map
      this.sessions.delete(sessionId);
      
      console.log('[App] Session closed:', sessionId);
      
      // Switch to another session or show empty state
      if (this.activeSessionId === sessionId) {
        const remaining = Array.from(this.sessions.keys());
        if (remaining.length > 0) {
          this.switchToSession(remaining[0]);
        } else {
          this.activeSessionId = null;
          this.showEmptyState();
        }
      }
      
      this.updateNewSessionButton();
      
    } catch (err) {
      console.error('[App] Failed to close session:', err);
    }
  },

  /**
   * Connect WebSocket for a session
   */
  connectWebSocket(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.status = 'connecting';
    this.updateTabStatus(sessionId, 'connecting');
    if (sessionId === this.activeSessionId) {
      this.updateStatus('connecting', 'Connecting...');
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host + '/ws/' + sessionId;
    
    console.log('[App] Connecting WebSocket for session:', sessionId);
    const ws = new WebSocket(wsUrl);
    session.ws = ws;

    ws.onopen = () => {
      console.log('[App] WebSocket connected:', sessionId);
      session.reconnectAttempts = 0;
      session.status = 'connected';
      this.updateTabStatus(sessionId, 'idle');
      
      if (sessionId === this.activeSessionId) {
        this.updateStatus('connected', 'Connected');
        
        // Send initial size and focus
        if (session.terminal) {
          const dims = session.terminal.getDimensions();
          this.sendResize(sessionId, dims.cols, dims.rows);
          session.terminal.focus();
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(sessionId, msg);
      } catch (err) {
        console.error('[App] Failed to parse message:', err);
      }
    };

    ws.onclose = (event) => {
      console.log('[App] WebSocket closed:', sessionId, event.code);
      session.status = 'disconnected';
      this.updateTabStatus(sessionId, 'disconnected');
      
      if (sessionId === this.activeSessionId) {
        this.updateStatus('disconnected', 'Disconnected');
      }
      
      // Attempt reconnect
      if (event.code !== 1000 && session.reconnectAttempts < this.maxReconnectAttempts) {
        session.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, session.reconnectAttempts), 10000);
        console.log('[App] Reconnecting in', delay + 'ms...');
        setTimeout(() => this.connectWebSocket(sessionId), delay);
      }
    };

    ws.onerror = (error) => {
      console.error('[App] WebSocket error:', sessionId, error);
    };

    // Wire up terminal input
    session.terminal.onData((data) => {
      this.sendInput(sessionId, data);
    });
  },

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(sessionId, msg) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    switch (msg.type) {
      case 'output':
        session.terminal.write(msg.data);
        // Mark as active when receiving output
        this.updateTabStatus(sessionId, 'active');
        // Reset to idle after a short delay
        clearTimeout(session.activityTimeout);
        session.activityTimeout = setTimeout(() => {
          this.updateTabStatus(sessionId, 'idle');
        }, 500);
        break;
        
      case 'status':
        console.log('[App] Status:', sessionId, msg.status);
        break;
        
      case 'exit':
        console.log('[App] PTY exited:', sessionId, msg.code);
        session.terminal.write('\r\n\x1b[33m[Process exited with code ' + msg.code + ']\x1b[0m\r\n');
        break;
        
      default:
        console.log('[App] Unknown message:', msg.type);
    }
  },

  /**
   * Send input to a session
   */
  sendInput(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'input', data }));
    }
  },

  /**
   * Send resize to a session
   */
  sendResize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  },

  /**
   * Update tab status indicator
   */
  updateTabStatus(sessionId, status) {
    const tab = document.querySelector('.tab[data-session-id="' + sessionId + '"]');
    if (!tab) return;
    
    const dot = tab.querySelector('.tab-status');
    if (dot) {
      dot.classList.remove('idle', 'active', 'disconnected');
      if (status !== 'connected') {
        dot.classList.add(status);
      }
    }
  },

  /**
   * Update the active session's status in header
   */
  updateSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    if (session.status === 'connected') {
      this.updateStatus('connected', 'Connected');
    } else if (session.status === 'connecting') {
      this.updateStatus('connecting', 'Connecting...');
    } else {
      this.updateStatus('disconnected', 'Disconnected');
    }
  },

  /**
   * Update connection status indicator
   */
  updateStatus(state, message) {
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');
    
    if (dot) {
      dot.classList.remove('disconnected', 'connecting');
      if (state === 'disconnected') {
        dot.classList.add('disconnected');
      } else if (state === 'connecting') {
        dot.classList.add('connecting');
      }
    }
    
    if (text) {
      text.textContent = message;
    }
  },

  /**
   * Update new session button state
   */
  updateNewSessionButton() {
    const btn = document.getElementById('newSessionBtn');
    if (btn) {
      btn.disabled = this.sessions.size >= 3;
    }
  },

  /**
   * Show empty state
   */
  showEmptyState() {
    const container = document.getElementById('terminalContainer');
    if (container.querySelector('.empty-state')) return;
    
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = 
      '<h2>No Sessions</h2>' +
      '<p>Create a new session to start using Claude Code</p>' +
      '<button id="emptyStateBtn">New Session</button>';
    
    container.appendChild(emptyState);
    
    emptyState.querySelector('#emptyStateBtn').addEventListener('click', () => {
      this.createNewSession();
    });
    
    this.updateStatus('disconnected', 'No Sessions');
  },

  /**
   * Hide empty state
   */
  hideEmptyState() {
    const emptyState = document.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
