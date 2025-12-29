/**
 * Claude Code Remote - Main Application
 * Handles multi-session management, WebSocket connections, and terminal I/O
 * Updated for Phase 4: Toast notifications (F028), Connection status (F031), Auto-reconnect UI (F032)
 */

const App = {
  sessions: new Map(),       // Map<sessionId, { ws, terminal, status, repo }>
  activeSessionId: null,     // Currently visible session
  maxReconnectAttempts: 5,
  modalElement: null,        // Current modal reference
  toastContainer: null,      // Toast notification container
  
  // Prompt detection patterns for Claude
  promptPatterns: [
    /❯\s*$/,                 // Claude prompt character
    />\s*$/,                 // Alternative prompt
    /$\s*$/,                // Bash prompt
    /claude>\s*$/i           // Claude prefix
  ],

  /**
   * Initialize the application
   */
  async init() {
    console.log("[App] Claude Code Remote initializing...");
    
    // Create toast container
    this.createToastContainer();
    
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
    // New session button - show repo modal
    document.getElementById("newSessionBtn").addEventListener("click", () => {
      this.showRepoModal();
    });

    // Handle resize for active terminal
    window.addEventListener("resize", () => {
      if (this.activeSessionId && this.sessions.has(this.activeSessionId)) {
        const session = this.sessions.get(this.activeSessionId);
        if (session.terminal) {
          session.terminal.fit();
          const dims = session.terminal.getDimensions();
          this.sendResize(this.activeSessionId, dims.cols, dims.rows);
        }
      }
    });

    // Close modal on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.modalElement) {
        this.hideRepoModal();
      }
    });

    // iOS PWA: Handle visibility changes to detect/fix zombie connections
    // iOS freezes PWAs when backgrounded without firing WebSocket close events
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        console.log("[App] App became visible - checking connections");
        this.checkAllConnections();
      }
    });

    // Handle iOS bfcache restoration
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        console.log("[App] Page restored from bfcache - checking connections");
        this.checkAllConnections();
      }
    });

    // Handle online/offline events
    window.addEventListener("online", () => {
      console.log("[App] Network came online - checking connections");
      this.checkAllConnections();
    });
  },

  /**
   * Check all session connections and reconnect if needed (iOS PWA fix)
   */
  checkAllConnections() {
    for (const [sessionId, session] of this.sessions) {
      if (!session.ws || session.ws.readyState !== WebSocket.OPEN) {
        console.log("[App] Session", sessionId, "needs reconnection");
        this.connectWebSocket(sessionId);
      } else {
        // Send a ping to verify connection is truly alive
        // iOS can leave connections in zombie state
        try {
          session.ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        } catch (e) {
          console.log("[App] Session", sessionId, "ping failed, reconnecting");
          this.connectWebSocket(sessionId);
        }
      }
    }
  },

  // ============================================
  // Toast Notification System (F028)
  // ============================================

  /**
   * Create toast container
   */
  createToastContainer() {
    const container = document.createElement("div");
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "true");
    document.body.appendChild(container);
    this.toastContainer = container;
  },

  /**
   * Show a toast notification
   * @param {string} message - Toast message
   * @param {string} type - Toast type: success, info, warning, error
   * @param {number} duration - Duration in ms (0 = permanent until dismissed)
   */
  showToast(message, type = "info", duration = 4000) {
    if (!this.toastContainer) return;

    const toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    toast.innerHTML = 
      "<span class=\"toast-message\">" + this.escapeHtml(message) + "</span>" +
      "<button class=\"toast-close\" aria-label=\"Dismiss\">×</button>";

    // Dismiss handler
    const dismiss = () => {
      toast.classList.add("toast-exit");
      setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector(".toast-close").addEventListener("click", dismiss);

    this.toastContainer.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => toast.classList.add("toast-enter"));

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(dismiss, duration);
    }

    return { dismiss };
  },

  /**
   * Check if output contains a prompt (Claude finished task)
   * @param {string} data - Terminal output data
   * @returns {boolean}
   */
  detectPrompt(data) {
    // Check last 50 chars for prompt patterns
    const tail = data.slice(-50);
    return this.promptPatterns.some(pattern => pattern.test(tail));
  },

  // ============================================
  // Utility Functions
  // ============================================

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Validate GitHub URL format
   */
  isValidGitUrl(url) {
    // Accept https://, git://, or git@ URLs
    return /^(https?:\/\/|git:\/\/|git@)[\w.-]+[\/:][\w.\/-]+$/i.test(url);
  },

  /**
   * Set loading state for a button
   */
  setButtonLoading(button, loading, originalText) {
    if (loading) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = originalText || "Loading...";
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || originalText;
    }
  },

  /**
   * Format date for display
   */
  formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return diffDays + "d ago";
    if (diffDays < 30) return Math.floor(diffDays / 7) + "w ago";
    return date.toLocaleDateString();
  },

  // ============================================
  // Repo Modal Methods
  // ============================================

  /**
   * Show the repo selector modal
   */
  async showRepoModal() {
    // Create modal backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) this.hideRepoModal();
    });

    // Create modal
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "modal-title");
    modal.innerHTML = `
      <div class="modal-header">
        <h2 id="modal-title">Select Repository</h2>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <div class="repo-list" id="repoList">
          <div class="loading-repos">Loading repositories...</div>
        </div>
        <div class="modal-actions">
          <button class="modal-action-btn" id="cloneBtn">
            <span class="btn-icon">⤓</span> Clone from GitHub
          </button>
          <button class="modal-action-btn" id="createBtn">
            <span class="btn-icon">+</span> Create New
          </button>
        </div>
        <div class="modal-form" id="cloneForm" style="display:none">
          <input type="url" id="cloneUrl" placeholder="https://github.com/user/repo" autocomplete="off" />
          <p class="form-hint" id="cloneHint">Enter a GitHub repository URL</p>
          <div class="form-buttons">
            <button class="btn-secondary" id="cloneCancel">Cancel</button>
            <button class="btn-primary" id="cloneSubmit">Clone</button>
          </div>
        </div>
        <div class="modal-form" id="createForm" style="display:none">
          <input type="text" id="createName" placeholder="my-new-project" autocomplete="off" />
          <p class="form-hint" id="createHint">Letters, numbers, hyphens, underscores only</p>
          <div class="form-buttons">
            <button class="btn-secondary" id="createCancel">Cancel</button>
            <button class="btn-primary" id="createSubmit">Create</button>
          </div>
        </div>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    this.modalElement = backdrop;

    // Focus trap - keep focus within modal
    const focusableElements = modal.querySelectorAll("button, input");
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    });
    
    // Initial focus on close button
    firstFocusable.focus();

    // Set up modal event listeners
    modal.querySelector(".modal-close").addEventListener("click", () => this.hideRepoModal());
    
    // Clone button
    modal.querySelector("#cloneBtn").addEventListener("click", () => {
      modal.querySelector("#cloneForm").style.display = "block";
      modal.querySelector("#createForm").style.display = "none";
      modal.querySelector(".modal-actions").style.display = "none";
      modal.querySelector("#cloneUrl").focus();
    });
    
    // Create button
    modal.querySelector("#createBtn").addEventListener("click", () => {
      modal.querySelector("#createForm").style.display = "block";
      modal.querySelector("#cloneForm").style.display = "none";
      modal.querySelector(".modal-actions").style.display = "none";
      modal.querySelector("#createName").focus();
    });
    
    // Clone form - with validation
    const cloneUrlInput = modal.querySelector("#cloneUrl");
    const cloneHint = modal.querySelector("#cloneHint");
    const cloneSubmitBtn = modal.querySelector("#cloneSubmit");
    
    cloneUrlInput.addEventListener("input", () => {
      const url = cloneUrlInput.value.trim();
      if (url && !this.isValidGitUrl(url)) {
        cloneHint.textContent = "Invalid URL format";
        cloneHint.classList.add("error");
        cloneSubmitBtn.disabled = true;
      } else {
        cloneHint.textContent = "Enter a GitHub repository URL";
        cloneHint.classList.remove("error");
        cloneSubmitBtn.disabled = !url;
      }
    });
    
    modal.querySelector("#cloneCancel").addEventListener("click", () => {
      modal.querySelector("#cloneForm").style.display = "none";
      modal.querySelector(".modal-actions").style.display = "flex";
      cloneUrlInput.value = "";
      cloneHint.textContent = "Enter a GitHub repository URL";
      cloneHint.classList.remove("error");
    });
    
    modal.querySelector("#cloneSubmit").addEventListener("click", () => {
      const url = cloneUrlInput.value.trim();
      if (url && this.isValidGitUrl(url)) this.handleClone(url);
    });
    
    cloneUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const url = e.target.value.trim();
        if (url && this.isValidGitUrl(url)) this.handleClone(url);
      }
    });
    
    // Create form - with validation
    const createNameInput = modal.querySelector("#createName");
    const createHint = modal.querySelector("#createHint");
    const createSubmitBtn = modal.querySelector("#createSubmit");
    
    createNameInput.addEventListener("input", () => {
      const name = createNameInput.value.trim();
      if (name && !/^[a-zA-Z0-9_-]+$/.test(name)) {
        createHint.textContent = "Invalid characters in name";
        createHint.classList.add("error");
        createSubmitBtn.disabled = true;
      } else {
        createHint.textContent = "Letters, numbers, hyphens, underscores only";
        createHint.classList.remove("error");
        createSubmitBtn.disabled = !name;
      }
    });
    
    modal.querySelector("#createCancel").addEventListener("click", () => {
      modal.querySelector("#createForm").style.display = "none";
      modal.querySelector(".modal-actions").style.display = "flex";
      createNameInput.value = "";
      createHint.textContent = "Letters, numbers, hyphens, underscores only";
      createHint.classList.remove("error");
    });
    
    modal.querySelector("#createSubmit").addEventListener("click", () => {
      const name = createNameInput.value.trim();
      if (name && /^[a-zA-Z0-9_-]+$/.test(name)) this.handleCreate(name);
    });
    
    createNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const name = e.target.value.trim();
        if (name && /^[a-zA-Z0-9_-]+$/.test(name)) this.handleCreate(name);
      }
    });

    // Load repos
    await this.loadRepos();
  },

  /**
   * Hide and remove the repo modal
   */
  hideRepoModal() {
    if (this.modalElement) {
      this.modalElement.remove();
      this.modalElement = null;
      // Return focus to new session button
      document.getElementById("newSessionBtn").focus();
    }
  },

  /**
   * Load and render repository list
   */
  async loadRepos() {
    const listEl = document.getElementById("repoList");
    if (!listEl) return;

    try {
      const response = await fetch("/api/repos");
      if (!response.ok) throw new Error("Failed to fetch repos");
      
      const repos = await response.json();
      this.renderRepoList(repos);
    } catch (err) {
      console.error("[App] Failed to load repos:", err);
      listEl.innerHTML = `<div class="repo-error">Failed to load repositories</div>`;
    }
  },

  /**
   * Render the repository list
   */
  renderRepoList(repos) {
    const listEl = document.getElementById("repoList");
    if (!listEl) return;

    // Get repos that have active sessions
    const activeRepos = this.getActiveRepoNames();

    if (repos.length === 0) {
      listEl.innerHTML = `
        <div class="repo-empty">
          <p>No repositories found</p>
          <p class="repo-empty-hint">Clone from GitHub or create a new repo below</p>
        </div>
      `;
      return;
    }

    // Use escapeHtml for all user data
    listEl.innerHTML = repos.map(repo => {
      const escapedName = this.escapeHtml(repo.name);
      const hasSession = activeRepos.has(repo.name);
      return `
        <div class="repo-item${hasSession ? " has-session" : ""}" data-path="${this.escapeHtml(repo.path)}">
          <div class="repo-info">
            <span class="repo-name">${escapedName}</span>
            ${repo.isGit ? "<span class=\"repo-git-badge\">git</span>" : ""}
            ${hasSession ? "<span class=\"repo-session-badge\">active</span>" : ""}
          </div>
          <span class="repo-modified">${this.formatDate(repo.lastModified)}</span>
        </div>
      `;
    }).join("");

    // Add click listeners to repo items
    listEl.querySelectorAll(".repo-item").forEach(item => {
      item.addEventListener("click", () => {
        const path = item.dataset.path;
        this.hideRepoModal();
        this.createNewSession(path);
      });
    });
  },

  /**
   * Get names of repos that have active sessions
   */
  getActiveRepoNames() {
    const names = new Set();
    this.sessions.forEach(session => {
      if (session.repo) names.add(session.repo);
    });
    return names;
  },

  /**
   * Handle clone repository
   */
  async handleClone(url) {
    const submitBtn = document.getElementById("cloneSubmit");
    const urlInput = document.getElementById("cloneUrl");
    const cancelBtn = document.getElementById("cloneCancel");
    
    // Show loading state
    this.setButtonLoading(submitBtn, true, "Cloning...");
    urlInput.disabled = true;
    cancelBtn.disabled = true;

    try {
      const response = await fetch("/api/repos/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Clone failed");
      }

      const result = await response.json();
      console.log("[App] Cloned repo:", result.name);

      // Reset form and reload repos
      urlInput.value = "";
      document.getElementById("cloneForm").style.display = "none";
      document.querySelector(".modal-actions").style.display = "flex";
      await this.loadRepos();

    } catch (err) {
      console.error("[App] Clone failed:", err);
      const hint = document.getElementById("cloneHint");
      hint.textContent = err.message;
      hint.classList.add("error");
    } finally {
      this.setButtonLoading(submitBtn, false, "Clone");
      urlInput.disabled = false;
      cancelBtn.disabled = false;
    }
  },

  /**
   * Handle create repository
   */
  async handleCreate(name) {
    const submitBtn = document.getElementById("createSubmit");
    const nameInput = document.getElementById("createName");
    const cancelBtn = document.getElementById("createCancel");
    
    // Show loading state
    this.setButtonLoading(submitBtn, true, "Creating...");
    nameInput.disabled = true;
    cancelBtn.disabled = true;

    try {
      const response = await fetch("/api/repos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Create failed");
      }

      const result = await response.json();
      console.log("[App] Created repo:", result.name);

      // Reset form and reload repos
      nameInput.value = "";
      document.getElementById("createForm").style.display = "none";
      document.querySelector(".modal-actions").style.display = "flex";
      await this.loadRepos();

    } catch (err) {
      console.error("[App] Create failed:", err);
      const hint = document.getElementById("createHint");
      hint.textContent = err.message;
      hint.classList.add("error");
    } finally {
      this.setButtonLoading(submitBtn, false, "Create");
      nameInput.disabled = false;
      cancelBtn.disabled = false;
    }
  },

  // ============================================
  // Session Management Methods
  // ============================================

  /**
   * Load existing sessions from API
   */
  async loadExistingSessions() {
    try {
      const response = await fetch("/api/sessions");
      if (!response.ok) throw new Error("Failed to fetch sessions");
      
      const sessions = await response.json();
      console.log("[App] Found existing sessions:", sessions.length);
      
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
      console.error("[App] Failed to load sessions:", err);
      this.updateStatus("disconnected", "Load Error");
    }
  },

  /**
   * Create a new session
   */
  async createNewSession(repoPath) {
    try {
      this.updateStatus("connecting", "Creating session...");
      
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create session");
      }
      
      const sessionData = await response.json();
      console.log("[App] Session created:", sessionData.id);
      
      await this.initSession(sessionData);
      this.switchToSession(sessionData.id);
      this.updateNewSessionButton();
      this.hideEmptyState();
      
    } catch (err) {
      console.error("[App] Failed to create session:", err);
      this.updateStatus("disconnected", err.message);
    }
  },

  /**
   * Initialize a session (create terminal, tab, WebSocket)
   */
  async initSession(sessionData) {
    const { id, repo, repoPath, status } = sessionData;
    
    // Create terminal element
    const terminalWrapper = document.createElement("div");
    terminalWrapper.className = "terminal-wrapper";
    terminalWrapper.id = "terminal-" + id;
    document.getElementById("terminalContainer").appendChild(terminalWrapper);
    
    // Initialize xterm
    const terminal = TerminalManager.createTerminal("terminal-" + id);
    
    // Store session
    this.sessions.set(id, {
      id,
      repo,
      repoPath,
      ws: null,
      terminal,
      status: "connecting",
      reconnectAttempts: 0,
      lastOutputTime: 0,
      hasRecentOutput: false
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
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.dataset.sessionId = sessionId;
    
    // Use escapeHtml for repo name
    const escapedName = this.escapeHtml(repoName || "Session");
    tab.innerHTML = 
      "<span class=\"tab-status\"></span>" +
      "<span class=\"tab-name\">" + escapedName + "</span>" +
      "<span class=\"tab-close\">×</span>";
    
    // Tab click - switch session
    tab.addEventListener("click", (e) => {
      if (!e.target.classList.contains("tab-close")) {
        this.switchToSession(sessionId);
      }
    });
    
    // Close button click
    tab.querySelector(".tab-close").addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeSession(sessionId);
    });
    
    document.getElementById("tabs").appendChild(tab);
  },

  /**
   * Switch to a session (show its terminal)
   */
  switchToSession(sessionId) {
    if (!this.sessions.has(sessionId)) return;
    
    // Update previous active
    if (this.activeSessionId) {
      const prevWrapper = document.getElementById("terminal-" + this.activeSessionId);
      if (prevWrapper) prevWrapper.classList.remove("active");
      
      const prevTab = document.querySelector(".tab[data-session-id=\"" + this.activeSessionId + "\"]");
      if (prevTab) prevTab.classList.remove("active");
    }
    
    // Activate new session
    this.activeSessionId = sessionId;
    const session = this.sessions.get(sessionId);
    
    const wrapper = document.getElementById("terminal-" + sessionId);
    if (wrapper) wrapper.classList.add("active");
    
    const tab = document.querySelector(".tab[data-session-id=\"" + sessionId + "\"]");
    if (tab) tab.classList.add("active");
    
    // Focus and fit terminal
    if (session.terminal) {
      session.terminal.fit();
      session.terminal.focus();
      
      // Send resize
      const dims = session.terminal.getDimensions();
      this.sendResize(sessionId, dims.cols, dims.rows);
    }
    
    // Focus mobile input if available
    if (typeof Mobile !== "undefined" && Mobile.focusInput) {
      Mobile.focusInput();
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
      await fetch("/api/sessions/" + sessionId, { method: "DELETE" });
      
      // Remove terminal
      const wrapper = document.getElementById("terminal-" + sessionId);
      if (wrapper) wrapper.remove();
      
      // Remove tab
      const tab = document.querySelector(".tab[data-session-id=\"" + sessionId + "\"]");
      if (tab) tab.remove();
      
      // Remove from map
      this.sessions.delete(sessionId);
      
      console.log("[App] Session closed:", sessionId);
      
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
      console.error("[App] Failed to close session:", err);
    }
  },

  /**
   * Connect WebSocket for a session
   */
  connectWebSocket(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.status = "connecting";
    this.updateTabStatus(sessionId, "connecting");
    if (sessionId === this.activeSessionId) {
      this.updateStatus("connecting", "Connecting...");
    }
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = protocol + "//" + window.location.host + "/ws/" + sessionId;
    
    console.log("[App] Connecting WebSocket for session:", sessionId);
    const ws = new WebSocket(wsUrl);
    session.ws = ws;

    // Connection timeout warning for slow connections (PWA optimization)
    const connectionTimeout = setTimeout(() => {
      if (session.status === "connecting") {
        console.warn("[App] WebSocket connection taking longer than expected");
        if (sessionId === this.activeSessionId) {
          this.showToast("Connection taking longer than expected...", "warning", 5000);
        }
      }
    }, 3000);

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log("[App] WebSocket connected:", sessionId);
      session.reconnectAttempts = 0;
      session.status = "connected";
      this.updateTabStatus(sessionId, "idle");

      if (sessionId === this.activeSessionId) {
        this.updateStatus("connected", "Connected");

        // Send initial size and focus
        if (session.terminal) {
          const dims = session.terminal.getDimensions();
          this.sendResize(sessionId, dims.cols, dims.rows);
          session.terminal.focus();
        }
      }

      // iOS PWA: Start client-side heartbeat to detect zombie connections
      // iOS can leave WebSockets in a "connected" state that's actually dead
      if (session.heartbeatInterval) {
        clearInterval(session.heartbeatInterval);
      }
      session.heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
          // Set pong timeout - if no response, connection is dead
          session.pongTimeout = setTimeout(() => {
            console.warn("[App] Pong timeout - connection may be dead, forcing reconnect");
            ws.close();
          }, 10000); // 10 second timeout for pong
        }
      }, 20000); // Send heartbeat every 20 seconds
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(sessionId, msg);
      } catch (err) {
        console.error("[App] Failed to parse message:", err);
      }
    };

    ws.onclose = (event) => {
      console.log("[App] WebSocket closed:", sessionId, event.code);

      // Clean up heartbeat intervals
      if (session.heartbeatInterval) {
        clearInterval(session.heartbeatInterval);
        session.heartbeatInterval = null;
      }
      if (session.pongTimeout) {
        clearTimeout(session.pongTimeout);
        session.pongTimeout = null;
      }

      session.status = "disconnected";
      this.updateTabStatus(sessionId, "disconnected");

      if (sessionId === this.activeSessionId) {
        this.updateStatus("disconnected", "Disconnected");
      }

      // Attempt reconnect with visual feedback (F032)
      if (event.code !== 1000 && session.reconnectAttempts < this.maxReconnectAttempts) {
        session.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, session.reconnectAttempts), 10000);
        console.log("[App] Reconnecting in", delay + "ms...");
        
        // Show reconnect countdown in status (F031)
        if (sessionId === this.activeSessionId) {
          this.showReconnectCountdown(sessionId, delay, session.reconnectAttempts);
        }
        
        session.reconnectTimeout = setTimeout(() => this.connectWebSocket(sessionId), delay);
      } else if (session.reconnectAttempts >= this.maxReconnectAttempts) {
        if (sessionId === this.activeSessionId) {
          this.updateStatus("disconnected", "Connection failed");
          this.showToast("Connection lost. Tap to retry.", "error", 0);
        }
      }
    };

    ws.onerror = (error) => {
      clearTimeout(connectionTimeout);
      console.error("[App] WebSocket error:", sessionId, error);
    };

    // Wire up terminal input
    session.terminal.onData((data) => {
      this.sendInput(sessionId, data);
    });
  },

  /**
   * Show reconnect countdown in status (F031, F032)
   */
  showReconnectCountdown(sessionId, delay, attempt) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    let remaining = Math.ceil(delay / 1000);
    
    const updateCountdown = () => {
      if (session.status === "connected" || sessionId !== this.activeSessionId) {
        return; // Stop if connected or not active
      }
      
      if (remaining > 0) {
        this.updateStatus("connecting", "Reconnecting in " + remaining + "s (" + attempt + "/" + this.maxReconnectAttempts + ")");
        remaining--;
        setTimeout(updateCountdown, 1000);
      }
    };
    
    updateCountdown();
  },

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(sessionId, msg) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    switch (msg.type) {
      case "output":
        session.terminal.write(msg.data);
        
        // Track output for prompt detection (F028)
        const now = Date.now();
        session.lastOutputTime = now;
        session.hasRecentOutput = true;
        
        // Mark as active when receiving output
        this.updateTabStatus(sessionId, "active");
        
        // Reset to idle after a short delay and check for prompt
        clearTimeout(session.activityTimeout);
        session.activityTimeout = setTimeout(() => {
          this.updateTabStatus(sessionId, "idle");
          
          // Check if this looks like Claude finished (prompt detected after output)
          if (session.hasRecentOutput && this.detectPrompt(msg.data)) {
            session.hasRecentOutput = false;
            // Only show toast if this isn't the active tab or page is not visible
            if (document.hidden || sessionId !== this.activeSessionId) {
              this.showToast("Claude finished in " + (session.repo || "session"), "success");
            }
          }
        }, 500);
        break;
        
      case "status":
        console.log("[App] Status:", sessionId, msg.status);
        break;
        
      case "exit":
        console.log("[App] PTY exited:", sessionId, msg.code);
        session.terminal.write("\r\n\x1b[33m[Process exited with code " + msg.code + "]\x1b[0m\r\n");
        break;

      case "pong":
        // Clear pong timeout - connection is alive
        if (session.pongTimeout) {
          clearTimeout(session.pongTimeout);
          session.pongTimeout = null;
        }
        break;

      default:
        console.log("[App] Unknown message:", msg.type);
    }
  },

  /**
   * Send input to a session
   */
  sendInput(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: "input", data }));
    }
  },

  /**
   * Send resize to a session
   */
  sendResize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  },

  /**
   * Update tab status indicator
   */
  updateTabStatus(sessionId, status) {
    const tab = document.querySelector(".tab[data-session-id=\"" + sessionId + "\"]");
    if (!tab) return;
    
    const dot = tab.querySelector(".tab-status");
    if (dot) {
      dot.classList.remove("idle", "active", "disconnected", "connecting");
      if (status !== "connected") {
        dot.classList.add(status);
      }
    }
  },

  /**
   * Update the active session status in header
   */
  updateSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    if (session.status === "connected") {
      this.updateStatus("connected", "Connected");
    } else if (session.status === "connecting") {
      this.updateStatus("connecting", "Connecting...");
    } else {
      this.updateStatus("disconnected", "Disconnected");
    }
  },

  /**
   * Update connection status indicator (F031)
   */
  updateStatus(state, message) {
    const dot = document.querySelector(".status-dot");
    const text = document.querySelector(".status-text");
    
    if (dot) {
      dot.classList.remove("disconnected", "connecting");
      if (state === "disconnected") {
        dot.classList.add("disconnected");
      } else if (state === "connecting") {
        dot.classList.add("connecting");
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
    const btn = document.getElementById("newSessionBtn");
    if (btn) {
      btn.disabled = this.sessions.size >= 3;
    }
  },

  /**
   * Show empty state
   */
  showEmptyState() {
    const container = document.getElementById("terminalContainer");
    if (container.querySelector(".empty-state")) return;
    
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = 
      "<h2>No Sessions</h2>" +
      "<p>Create a new session to start using Claude Code</p>" +
      "<button id=\"emptyStateBtn\">New Session</button>";
    
    container.appendChild(emptyState);
    
    emptyState.querySelector("#emptyStateBtn").addEventListener("click", () => {
      this.showRepoModal();
    });
    
    this.updateStatus("disconnected", "No Sessions");
  },

  /**
   * Hide empty state
   */
  hideEmptyState() {
    const emptyState = document.querySelector(".empty-state");
    if (emptyState) emptyState.remove();
  }
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => App.init());
