/**
 * Claude Code Remote - Mobile Module
 * Handles iOS control bar, touch keyboard input, and keyboard visibility
 * Features: F025, F026, F027, F030
 */

const Mobile = {
  initialized: false,        // Guard to prevent multiple initializations
  controlBar: null,
  controlBarToggle: null,
  hiddenInput: null,
  isKeyboardVisible: false,
  isControlBarVisible: false,
  keyboardHeight: 0,
  pendingScrollToBottom: false,
  // Debouncing properties to prevent layout thrashing on iOS PWA
  viewportChangeTimeout: null,
  lastViewportHeight: 0,
  lastViewportUpdate: 0,

  /**
   * Initialize mobile features
   */
  init() {
    // Guard: Prevent multiple initializations (PWA can trigger init multiple times)
    if (this.initialized) {
      console.log('[Mobile] Already initialized, skipping');
      return;
    }
    
    // Only initialize on touch devices
    if (!this.isTouchDevice()) {
      console.log('[Mobile] Not a touch device, skipping mobile init');
      return;
    }

    this.initialized = true;  // Set flag early to prevent re-entry
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
    toggle.setAttribute('tabindex', '-1');  // Prevent focus on tap
    toggle.innerHTML = '⌨';
    
    // Set initial state
    if (this.isControlBarVisible) {
      toggle.classList.add('active');
    }
    
    // Use touchend for iOS to prevent keyboard toggle
    toggle.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Don't change hidden input focus - just toggle control bar
      this.toggleControlBar();
    }, { passive: false });
    
    // Fallback for non-touch (desktop testing)
    toggle.addEventListener('click', (e) => {
      // Only handle if not already handled by touchend
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) {
        return; // Already handled by touchend
      }
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
    
    // Update layout
    this.updateLayout();
    
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
      <div class=control-bar-inner>
        <button class=control-btn data-key=ctrl-c aria-label=Control C>
          <span class=ctrl-label>Ctrl</span>C
        </button>
        <button class=control-btn data-key=ctrl-d aria-label=Control D>
          <span class=ctrl-label>Ctrl</span>D
        </button>
        <button class=control-btn data-key=tab aria-label=Tab>Tab</button>
        <button class=control-btn data-key=esc aria-label=Escape>Esc</button>
        <div class=control-divider></div>
        <button class="control-btn arrow-btn" data-key=up aria-label=Arrow Up>↑</button>
        <button class="control-btn arrow-btn" data-key=down aria-label=Arrow Down>↓</button>
        <button class="control-btn arrow-btn" data-key=left aria-label=Arrow Left>←</button>
        <button class="control-btn arrow-btn" data-key=right aria-label=Arrow Right>→</button>
        <div class=control-divider></div>
        <button class="control-btn scroll-btn" data-action=scroll-bottom aria-label=Scroll to bottom>⤓</button>
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
    

    
    // Add click handler for scroll-to-bottom button
    const scrollBtn = controlBar.querySelector('.scroll-btn');
    if (scrollBtn) {
      scrollBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.scrollToBottom();
      });
    }
  },
  
  /**
   * Scroll terminal to bottom
   */
  scrollToBottom() {
    if (typeof App !== 'undefined' && App.activeSessionId) {
      const session = App.sessions.get(App.activeSessionId);
      if (session && session.terminal && session.terminal.scrollToBottom) {
        session.terminal.scrollToBottom();
        console.log('[Mobile] Scrolled to bottom');
      }
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
    // Guard: Check if hidden input already exists
    if (this.hiddenInput) {
      console.log('[Mobile] Hidden input already exists, skipping creation');
      return;
    }
    
    // Clean up any orphaned hidden inputs (defensive)
    const existingInputs = document.querySelectorAll('.hidden-input');
    existingInputs.forEach(el => {
      console.log('[Mobile] Removing orphaned hidden input');
      el.remove();
    });
    
    const input = document.createElement('textarea');
    input.className = 'hidden-input';
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', 'Terminal input');
    
    document.body.appendChild(input);
    this.hiddenInput = input;

    // Track composition state (iOS autocomplete/IME)
    let isComposing = false;

    // Handle composition events (iOS autocomplete, IME input)
    input.addEventListener('compositionstart', () => {
      isComposing = true;
    });

    input.addEventListener('compositionend', (e) => {
      isComposing = false;
      // Send the final composed text
      if (e.data && typeof App !== 'undefined' && App.activeSessionId) {
        App.sendInput(App.activeSessionId, e.data);
      }
      e.target.value = '';
    });

    // Handle input events - THIS IS THE SOLE INPUT SOURCE
    // xterm.js onData has been disabled to prevent duplication
    input.addEventListener('input', (e) => {
      // Skip if composing (iOS autocomplete) - compositionend handles it
      if (isComposing) return;
      
      // Set typing guard to prevent layout changes during active typing
      this.isTyping = true;
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.isTyping = false;
      }, 750); // Clear after 750ms of no typing (must outlive 250ms viewport debounce)
      
      const data = e.target.value;
      if (data && typeof App !== 'undefined' && App.activeSessionId) {
        App.sendInput(App.activeSessionId, data);
      }
      // Clear the input
      e.target.value = '';
      
      // Stop propagation to prevent any xterm.js listeners from firing
      e.stopPropagation();
    });

    // Handle special keys via keydown
    input.addEventListener('keydown', (e) => {
      // Skip if composing
      if (isComposing) return;
      
      // Handle special keys here
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, '\r');
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, '\x7f');
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, '\t');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, '\x1b');
        }
      } else if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, '\x03');
        }
      } else if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, '\x04');
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
    // Use visualViewport API (preferred for iOS)
    // Debounce to prevent rapid-fire updates during keyboard animations
    let viewportEventTimeout = null;
    const debouncedViewportChange = () => {
      if (viewportEventTimeout) return; // Already scheduled
      viewportEventTimeout = setTimeout(() => {
        viewportEventTimeout = null;
        this.handleViewportChange();
      }, 250); // 250ms debounce - enough for keyboard animation to settle
    };

    if (window.visualViewport) {
      // ONLY listen to resize events - NOT scroll
      // Scroll events fire on every keystroke when iOS tries to scroll
      // the hidden input into view, causing viewport bounce
      window.visualViewport.addEventListener('resize', debouncedViewportChange);
      // REMOVED: scroll listener - caused bounce on every keystroke
    }

    // Fallback to window resize
    window.addEventListener('resize', debouncedViewportChange);

    // Detect focus/blur on hidden input for keyboard
    // CRITICAL: Use debouncing to prevent layout thrashing on iOS PWA
    if (this.hiddenInput) {
      this.hiddenInput.addEventListener('focus', () => {
        this.pendingScrollToBottom = true;

        // Cancel any pending viewport change
        if (this.viewportChangeTimeout) {
          clearTimeout(this.viewportChangeTimeout);
        }

        // Wait for keyboard animation to settle before updating layout
        this.viewportChangeTimeout = setTimeout(() => {
          this.handleViewportChange();
          if (this.pendingScrollToBottom) {
            setTimeout(() => {
              this.scrollToBottom();
              this.pendingScrollToBottom = false;
            }, 100);
          }
        }, 300); // Single debounced call after animation settles
      });

      this.hiddenInput.addEventListener('blur', () => {
        // Cancel any pending viewport change
        if (this.viewportChangeTimeout) {
          clearTimeout(this.viewportChangeTimeout);
        }

        // Wait for keyboard to fully close
        this.viewportChangeTimeout = setTimeout(() => {
          this.handleViewportChange();
        }, 300);
      });
    }
  },

  /**
   * Handle viewport changes (keyboard show/hide on iOS)
   * Includes debouncing to prevent layout thrashing in iOS PWA
   */
  handleViewportChange() {
    // Skip viewport changes while actively typing to prevent PWA viewport jumping
    if (this.isTyping) {
      return;
    }
    
    const now = Date.now();

    // Skip if called too recently (within 50ms) - prevents rapid-fire updates
    if (this.lastViewportUpdate && now - this.lastViewportUpdate < 50) {
      return;
    }

    let viewportHeight, viewportTop;

    if (window.visualViewport) {
      viewportHeight = window.visualViewport.height;
      viewportTop = window.visualViewport.offsetTop;
    } else {
      viewportHeight = window.innerHeight;
      viewportTop = 0;
    }

    // Skip if viewport height hasn't actually changed (prevents duplicate renders)
    if (Math.abs(viewportHeight - this.lastViewportHeight) < 5) {
      return;
    }

    this.lastViewportUpdate = now;
    this.lastViewportHeight = viewportHeight;

    const windowHeight = window.innerHeight;
    const heightDiff = windowHeight - viewportHeight - viewportTop;

    // Keyboard is visible if viewport is significantly smaller
    const wasKeyboardVisible = this.isKeyboardVisible;
    this.isKeyboardVisible = heightDiff > 100;
    this.keyboardHeight = this.isKeyboardVisible ? heightDiff : 0;

    // Update layout
    this.updateLayout();

    // When keyboard just appeared, scroll to bottom (but let focus handler handle it if pending)
    if (this.isKeyboardVisible && !wasKeyboardVisible) {
      console.log('[Mobile] Keyboard shown, height:', this.keyboardHeight);
      // Only scroll if focus handler isn't already going to do it
      if (!this.pendingScrollToBottom) {
        setTimeout(() => this.scrollToBottom(), 50);
      }
    } else if (!this.isKeyboardVisible && wasKeyboardVisible) {
      console.log('[Mobile] Keyboard hidden');
    }
  },

  /**
   * Update layout based on keyboard and control bar state
   */
  updateLayout() {
    const terminalContainer = document.getElementById('terminalContainer');
    const appContainer = document.querySelector('.app-container');
    
    if (!terminalContainer) return;

    // Calculate the space taken by keyboard and control bar
    const controlBarHeight = (this.controlBar && this.isControlBarVisible) ? 52 : 0;
    const totalOffset = this.keyboardHeight + controlBarHeight;

    if (this.isKeyboardVisible) {
      // Reduce the app container height to fit above keyboard
      if (appContainer) {
        const availableHeight = window.visualViewport 
          ? window.visualViewport.height 
          : (window.innerHeight - this.keyboardHeight);
        appContainer.style.height = availableHeight + 'px';
        appContainer.style.maxHeight = availableHeight + 'px';
      }
      
      // Position control bar and toggle above keyboard
      // Single visualViewport read to prevent race conditions
      if (window.visualViewport) {
        const vp = window.visualViewport;
        const keyboardTop = vp.height + vp.offsetTop;
        
        if (this.controlBar) {
          this.controlBar.style.position = 'fixed';
          this.controlBar.style.bottom = 'auto';
          this.controlBar.style.top = (keyboardTop - 52) + 'px';
        }
        
        if (this.controlBarToggle) {
          const toggleBottom = this.isControlBarVisible ? 60 : 8;
          this.controlBarToggle.style.position = 'fixed';
          this.controlBarToggle.style.bottom = 'auto';
          this.controlBarToggle.style.top = (keyboardTop - toggleBottom - 44) + 'px';
        }
      }
    } else {
      // Reset to normal layout
      if (appContainer) {
        appContainer.style.height = '';
        appContainer.style.maxHeight = '';
      }
      
      if (this.controlBar) {
        this.controlBar.style.position = '';
        this.controlBar.style.bottom = '';
        this.controlBar.style.top = '';
      }
      
      if (this.controlBarToggle) {
        this.controlBarToggle.style.position = '';
        this.controlBarToggle.style.bottom = '';
        this.controlBarToggle.style.top = '';
      }
    }

    // Fit terminal to new size
    this.fitTerminal();
  },

  /**
   * Fit terminal to container - uses centralized ResizeCoordinator
   * This prevents multiple competing fit() calls from different event handlers
   */
  fitTerminal() {
    if (typeof ResizeCoordinator !== 'undefined') {
      ResizeCoordinator.requestFit();
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
