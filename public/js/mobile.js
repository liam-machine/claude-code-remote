/**
 * Claude Code Remote - Mobile Module
 * Handles iOS control bar, touch keyboard input, and keyboard visibility
 * Features: F025, F026, F027, F030
 */

const Mobile = {
  controlBar: null,
  controlBarToggle: null,
  hiddenInput: null,
  isKeyboardVisible: false,
  isControlBarVisible: false,
  keyboardHeight: 0,

  /**
   * Initialize mobile features
   */
  init() {
    // Only initialize on touch devices
    if (!this.isTouchDevice()) {
      console.log('[Mobile] Not a touch device, skipping mobile init');
      return;
    }

    console.log('[Mobile] Initializing mobile features...');
    
    // Load saved preference
    this.isControlBarVisible = localStorage.getItem('controlBarVisible') === 'true';
    
    this.createControlBar();
    this.createControlBarToggle();
    this.createHiddenInput();
    this.setupKeyboardDetection();
    this.setupTerminalTapHandler();
    
    console.log('[Mobile] Mobile features initialized');
  },

  /**
   * Check if this is a touch device
   */
  isTouchDevice() {
    return 'ontouchstart' in window || 
           navigator.maxTouchPoints > 0 || 
           window.matchMedia('(pointer: coarse)').matches;
  },

  /**
   * Create the toggle button for control bar
   */
  createControlBarToggle() {
    const toggle = document.createElement('button');
    toggle.className = 'control-bar-toggle';
    toggle.setAttribute('aria-label', 'Toggle control bar');
    toggle.innerHTML = '⌨';
    
    // Set initial state
    if (this.isControlBarVisible) {
      toggle.classList.add('active');
    }
    
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleControlBar();
    });
    
    document.body.appendChild(toggle);
    this.controlBarToggle = toggle;
  },

  /**
   * Toggle control bar visibility
   */
  toggleControlBar() {
    this.isControlBarVisible = !this.isControlBarVisible;
    
    // Save preference
    localStorage.setItem('controlBarVisible', this.isControlBarVisible);
    
    // Update UI
    if (this.controlBar) {
      this.controlBar.classList.toggle('visible', this.isControlBarVisible);
    }
    if (this.controlBarToggle) {
      this.controlBarToggle.classList.toggle('active', this.isControlBarVisible);
    }
    
    // Update terminal height
    this.updateTerminalHeight();
    
    console.log('[Mobile] Control bar', this.isControlBarVisible ? 'shown' : 'hidden');
  },

  /**
   * Create the iOS control bar (F025)
   */
  createControlBar() {
    const controlBar = document.createElement('div');
    controlBar.className = 'control-bar';
    
    // Set initial visibility
    if (this.isControlBarVisible) {
      controlBar.classList.add('visible');
    }
    
    controlBar.innerHTML = `
      <div class="control-bar-inner">
        <button class="control-btn" data-key="ctrl-c" aria-label="Control C">
          <span class="ctrl-label">Ctrl</span>C
        </button>
        <button class="control-btn" data-key="ctrl-d" aria-label="Control D">
          <span class="ctrl-label">Ctrl</span>D
        </button>
        <button class="control-btn" data-key="tab" aria-label="Tab">Tab</button>
        <button class="control-btn" data-key="esc" aria-label="Escape">Esc</button>
        <div class="control-divider"></div>
        <button class="control-btn arrow-btn" data-key="up" aria-label="Arrow Up">↑</button>
        <button class="control-btn arrow-btn" data-key="down" aria-label="Arrow Down">↓</button>
        <button class="control-btn arrow-btn" data-key="left" aria-label="Arrow Left">←</button>
        <button class="control-btn arrow-btn" data-key="right" aria-label="Arrow Right">→</button>
        <div class="control-divider"></div>
        <button class="control-btn hide-btn" data-action="hide" aria-label="Hide control bar">✕</button>
      </div>
    `;

    document.body.appendChild(controlBar);
    this.controlBar = controlBar;

    // Add click handlers for control keys
    controlBar.querySelectorAll('.control-btn[data-key]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleControlKey(btn.dataset.key);
        // Keep focus on hidden input
        if (this.hiddenInput) {
          this.hiddenInput.focus();
        }
      });
    });
    
    // Add click handler for hide button
    const hideBtn = controlBar.querySelector('.hide-btn');
    if (hideBtn) {
      hideBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleControlBar();
      });
    }
  },

  /**
   * Handle control key press
   */
  handleControlKey(key) {
    // Map keys to terminal escape sequences
    const keyMap = {
      'ctrl-c': '\x03',      // ETX (End of Text)
      'ctrl-d': '\x04',      // EOT (End of Transmission)
      'tab': '\t',           // Tab
      'esc': '\x1b',         // Escape
      'up': '\x1b[A',        // Arrow up
      'down': '\x1b[B',      // Arrow down
      'right': '\x1b[C',     // Arrow right
      'left': '\x1b[D'       // Arrow left
    };

    const sequence = keyMap[key];
    if (sequence && typeof App !== 'undefined' && App.activeSessionId) {
      App.sendInput(App.activeSessionId, sequence);
    }
  },

  /**
   * Create hidden input for keyboard capture (F026)
   */
  createHiddenInput() {
    const input = document.createElement('textarea');
    input.className = 'hidden-input';
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', 'Terminal input');
    
    document.body.appendChild(input);
    this.hiddenInput = input;

    // Handle input events
    input.addEventListener('input', (e) => {
      const data = e.target.value;
      if (data && typeof App !== 'undefined' && App.activeSessionId) {
        App.sendInput(App.activeSessionId, data);
      }
      // Clear the input
      e.target.value = '';
    });

    // Handle special keys via keydown
    input.addEventListener('keydown', (e) => {
      // Let the input event handle regular characters
      // Handle special keys here
      if (e.key === 'Enter') {
        e.preventDefault();
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, '\r');
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, '\x7f');
        }
      }
    });

    // Prevent zoom on double-tap
    input.addEventListener('touchend', (e) => {
      e.preventDefault();
    });
  },

  /**
   * Setup tap handler for terminal area (F026)
   */
  setupTerminalTapHandler() {
    const terminalContainer = document.getElementById('terminalContainer');
    if (!terminalContainer) return;

    terminalContainer.addEventListener('click', () => {
      if (this.hiddenInput) {
        this.hiddenInput.focus();
      }
    });
  },

  /**
   * Setup keyboard visibility detection (F027)
   */
  setupKeyboardDetection() {
    // Use visualViewport API if available (preferred)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        this.handleViewportResize();
      });
    } else {
      // Fallback to window resize
      window.addEventListener('resize', () => {
        this.handleViewportResize();
      });
    }

    // Also detect focus/blur on hidden input
    if (this.hiddenInput) {
      this.hiddenInput.addEventListener('focus', () => {
        // Small delay to let keyboard animation complete
        setTimeout(() => this.handleViewportResize(), 300);
      });
      
      this.hiddenInput.addEventListener('blur', () => {
        setTimeout(() => this.handleViewportResize(), 100);
      });
    }
  },

  /**
   * Handle viewport resize (keyboard show/hide)
   */
  handleViewportResize() {
    const viewportHeight = window.visualViewport 
      ? window.visualViewport.height 
      : window.innerHeight;
    
    const windowHeight = window.innerHeight;
    const heightDiff = windowHeight - viewportHeight;
    
    // If viewport is significantly smaller than window, keyboard is visible
    const wasKeyboardVisible = this.isKeyboardVisible;
    this.isKeyboardVisible = heightDiff > 150;
    this.keyboardHeight = this.isKeyboardVisible ? heightDiff : 0;

    // Update control bar position
    this.updateControlBarPosition();

    // Update terminal container height
    this.updateTerminalHeight();

    // Log state change
    if (wasKeyboardVisible !== this.isKeyboardVisible) {
      console.log('[Mobile] Keyboard', this.isKeyboardVisible ? 'shown' : 'hidden', 
                  'height:', this.keyboardHeight);
    }
  },

  /**
   * Update control bar position based on keyboard
   */
  updateControlBarPosition() {
    if (!this.controlBar) return;

    if (this.isKeyboardVisible && window.visualViewport) {
      // Position above keyboard
      const bottom = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
      this.controlBar.style.bottom = bottom + 'px';
      if (this.controlBarToggle) {
        this.controlBarToggle.style.bottom = (bottom + (this.isControlBarVisible ? 52 : 0) + 8) + 'px';
      }
    } else {
      // Reset to default (CSS handles safe area)
      this.controlBar.style.bottom = '';
      if (this.controlBarToggle) {
        this.controlBarToggle.style.bottom = '';
      }
    }
  },

  /**
   * Update terminal container height
   */
  updateTerminalHeight() {
    const terminalContainer = document.getElementById('terminalContainer');
    if (!terminalContainer) return;

    if (this.isKeyboardVisible) {
      // Account for control bar height (if visible) + keyboard
      const controlBarHeight = (this.controlBar && this.isControlBarVisible) ? this.controlBar.offsetHeight : 0;
      const offset = this.keyboardHeight + controlBarHeight;
      terminalContainer.style.paddingBottom = offset + 'px';
    } else {
      // Reset - let CSS handle safe area
      terminalContainer.style.paddingBottom = '';
    }

    // Trigger terminal resize
    if (typeof App !== 'undefined' && App.activeSessionId) {
      const session = App.sessions.get(App.activeSessionId);
      if (session && session.terminal) {
        setTimeout(() => {
          session.terminal.fit();
          const dims = session.terminal.getDimensions();
          App.sendResize(App.activeSessionId, dims.cols, dims.rows);
        }, 50);
      }
    }
  },

  /**
   * Focus the hidden input (call from App when switching sessions)
   */
  focusInput() {
    if (this.hiddenInput && this.isTouchDevice()) {
      this.hiddenInput.focus();
    }
  },

  /**
   * Blur the hidden input
   */
  blurInput() {
    if (this.hiddenInput) {
      this.hiddenInput.blur();
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  Mobile.init();
});
