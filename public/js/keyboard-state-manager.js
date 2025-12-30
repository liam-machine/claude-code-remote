/**
 * KeyboardStateManager - Single source of truth for iOS keyboard state
 * 
 * Solves viewport jumping by:
 * 1. State machine prevents conflicting layout updates
 * 2. All scroll decisions go through one place
 * 3. Layout changes deferred until animation completes
 * 4. CSS handles actual sizing via dvh units
 */
const KeyboardStateManager = {
  // State machine states
  STATES: {
    IDLE: 'IDLE',
    KEYBOARD_OPENING: 'KEYBOARD_OPENING',
    KEYBOARD_OPEN: 'KEYBOARD_OPEN',
    KEYBOARD_CLOSING: 'KEYBOARD_CLOSING'
  },
  
  currentState: 'IDLE',
  stateChangeTime: 0,
  animationTimeout: null,
  
  // Configuration
  ANIMATION_DURATION: 350,  // iOS keyboard animation is ~300ms, add buffer
  SCROLL_DELAY: 50,         // Small delay after animation for DOM to settle
  
  // Cached values
  lastKnownKeyboardHeight: 0,
  scrollPending: false,
  _initialized: false,
  
  /**
   * Initialize the state manager
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;
    
    console.log('[KSM] Initializing KeyboardStateManager');
    
    // Listen to visualViewport for iOS keyboard detection
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.handleViewportResize());
    }
    
    // Fallback for non-iOS
    window.addEventListener('resize', () => this.handleViewportResize());
  },
  
  /**
   * Transition to a new state
   */
  transitionTo(newState) {
    if (this.currentState === newState) return;
    
    const oldState = this.currentState;
    this.currentState = newState;
    this.stateChangeTime = Date.now();
    
    console.log('[KSM] State: ' + oldState + ' -> ' + newState);
    
    // Clear any pending animation timeout
    if (this.animationTimeout) {
      clearTimeout(this.animationTimeout);
      this.animationTimeout = null;
    }
    
    // Handle state-specific behavior
    switch (newState) {
      case this.STATES.KEYBOARD_OPENING:
        this.onKeyboardOpening();
        break;
      case this.STATES.KEYBOARD_OPEN:
        this.onKeyboardOpen();
        break;
      case this.STATES.KEYBOARD_CLOSING:
        this.onKeyboardClosing();
        break;
      case this.STATES.IDLE:
        this.onIdle();
        break;
    }
  },
  
  /**
   * Handle viewport resize events from visualViewport
   */
  handleViewportResize() {
    const vp = window.visualViewport;
    if (!vp) return;
    
    const windowHeight = window.innerHeight;
    const viewportHeight = vp.height;
    const heightDiff = windowHeight - viewportHeight - vp.offsetTop;
    
    // Keyboard is considered visible if height diff > 100px
    const keyboardVisible = heightDiff > 100;
    
    if (keyboardVisible) {
      this.lastKnownKeyboardHeight = heightDiff;
    }
    
    // Determine state transition based on current state and keyboard visibility
    switch (this.currentState) {
      case this.STATES.IDLE:
        if (keyboardVisible) {
          this.transitionTo(this.STATES.KEYBOARD_OPENING);
        }
        break;
        
      case this.STATES.KEYBOARD_OPENING:
        // Stay in opening until animation completes
        break;
        
      case this.STATES.KEYBOARD_OPEN:
        if (!keyboardVisible) {
          this.transitionTo(this.STATES.KEYBOARD_CLOSING);
        }
        break;
        
      case this.STATES.KEYBOARD_CLOSING:
        // Stay in closing until animation completes
        break;
    }
  },
  
  /**
   * Called when hidden input gains focus (from Mobile.js)
   */
  onInputFocus() {
    if (this.currentState === this.STATES.IDLE) {
      this.scrollPending = true;
      this.transitionTo(this.STATES.KEYBOARD_OPENING);
    }
  },
  
  /**
   * Called when hidden input loses focus (from Mobile.js)
   */
  onInputBlur() {
    if (this.currentState === this.STATES.KEYBOARD_OPEN) {
      this.transitionTo(this.STATES.KEYBOARD_CLOSING);
    }
  },
  
  // ============================================
  // State Handlers
  // ============================================
  
  onKeyboardOpening() {
    // Set CSS class to disable transitions during animation
    document.body.classList.add('keyboard-animating');
    document.body.classList.add('keyboard-open');
    
    // Update control bar position immediately
    this.updateControlBarPosition(true);
    
    // Wait for animation to complete, then transition to OPEN
    this.animationTimeout = setTimeout(() => {
      this.transitionTo(this.STATES.KEYBOARD_OPEN);
    }, this.ANIMATION_DURATION);
  },
  
  onKeyboardOpen() {
    // Animation complete - safe to do layout work
    document.body.classList.remove('keyboard-animating');
    
    // Request terminal fit
    if (typeof ResizeCoordinator !== 'undefined') {
      ResizeCoordinator.forceFit();
    }
    
    // Scroll to bottom if pending
    if (this.scrollPending) {
      setTimeout(() => {
        this.scrollToBottom();
        this.scrollPending = false;
      }, this.SCROLL_DELAY);
    }
  },
  
  onKeyboardClosing() {
    document.body.classList.add('keyboard-animating');
    
    // Update control bar position
    this.updateControlBarPosition(false);
    
    // Wait for animation to complete, then transition to IDLE
    this.animationTimeout = setTimeout(() => {
      this.transitionTo(this.STATES.IDLE);
    }, this.ANIMATION_DURATION);
  },
  
  onIdle() {
    document.body.classList.remove('keyboard-animating');
    document.body.classList.remove('keyboard-open');
    
    // Reset control bar to normal position
    this.resetControlBar();
    
    // Request terminal fit
    if (typeof ResizeCoordinator !== 'undefined') {
      ResizeCoordinator.forceFit();
    }
  },
  
  // ============================================
  // Layout Helpers
  // ============================================
  
  /**
   * Update control bar position for keyboard state
   * Uses transform instead of top/bottom to avoid reflow
   */
  updateControlBarPosition(keyboardVisible) {
    if (typeof Mobile === 'undefined') return;
    
    const controlBar = Mobile.controlBar;
    const toggle = Mobile.controlBarToggle;
    
    if (!controlBar || !toggle) return;
    
    if (keyboardVisible && window.visualViewport) {
      const vp = window.visualViewport;
      const keyboardTop = vp.height + vp.offsetTop;
      const offset = keyboardTop - window.innerHeight;
      
      // Use transforms for GPU-accelerated positioning
      controlBar.style.transform = 'translateY(' + offset + 'px)';
      
      const toggleOffset = Mobile.isControlBarVisible ? 60 : 8;
      toggle.style.transform = 'translateY(' + (offset - toggleOffset) + 'px)';
    }
  },
  
  resetControlBar() {
    if (typeof Mobile === 'undefined') return;
    
    const controlBar = Mobile.controlBar;
    const toggle = Mobile.controlBarToggle;
    
    if (controlBar) controlBar.style.transform = '';
    if (toggle) toggle.style.transform = '';
  },
  
  /**
   * Single scroll-to-bottom entry point
   * This is the ONLY place that triggers scroll
   */
  scrollToBottom() {
    // Don't scroll during animations
    if (this.currentState === this.STATES.KEYBOARD_OPENING ||
        this.currentState === this.STATES.KEYBOARD_CLOSING) {
      console.log('[KSM] Scroll deferred - animation in progress');
      this.scrollPending = true;
      return;
    }
    
    if (typeof App !== 'undefined' && App.activeSessionId) {
      const session = App.sessions.get(App.activeSessionId);
      if (session && session.terminal) {
        session.terminal.scrollToBottom();
        console.log('[KSM] Scrolled to bottom');
      }
    }
  },
  
  /**
   * Check if layout changes are safe
   * Returns false during keyboard animations
   */
  canModifyLayout() {
    return this.currentState === this.STATES.IDLE ||
           this.currentState === this.STATES.KEYBOARD_OPEN;
  },
  
  /**
   * Check if keyboard is currently visible
   */
  isKeyboardVisible() {
    return this.currentState === this.STATES.KEYBOARD_OPENING ||
           this.currentState === this.STATES.KEYBOARD_OPEN;
  }
};

// Auto-initialize on load
document.addEventListener('DOMContentLoaded', () => {
  KeyboardStateManager.init();
});
