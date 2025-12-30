/**
 * Claude Code Remote - Mobile Module (Refactored)
 * Handles iOS control bar and touch keyboard input
 * Delegates keyboard state management to KeyboardStateManager
 */

const Mobile = {
  initialized: false,
  controlBar: null,
  controlBarToggle: null,
  hiddenInput: null,
  isControlBarVisible: false,

  /**
   * Initialize mobile features
   */
  init() {
    if (this.initialized) {
      console.log('[Mobile] Already initialized, skipping');
      return;
    }
    
    if (!this.isTouchDevice()) {
      console.log('[Mobile] Not a touch device, skipping mobile init');
      return;
    }

    this.initialized = true;
    console.log('[Mobile] Initializing mobile features...');
    
    this.isControlBarVisible = localStorage.getItem('controlBarVisible') === 'true';
    
    this.createControlBar();
    this.createControlBarToggle();
    this.createHiddenInput();
    this.setupTerminalTapHandler();
    
    console.log('[Mobile] Mobile features initialized');
  },

  isTouchDevice() {
    return 'ontouchstart' in window || 
           navigator.maxTouchPoints > 0 || 
           window.matchMedia('(pointer: coarse)').matches;
  },

  createControlBarToggle() {
    const toggle = document.createElement('button');
    toggle.className = 'control-bar-toggle';
    toggle.setAttribute('aria-label', 'Toggle control bar');
    toggle.setAttribute('tabindex', '-1');
    toggle.innerHTML = '⌨';
    
    if (this.isControlBarVisible) {
      toggle.classList.add('active');
    }
    
    toggle.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleControlBar();
    }, { passive: false });
    
    toggle.addEventListener('click', (e) => {
      if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      e.preventDefault();
      e.stopPropagation();
      this.toggleControlBar();
    });
    
    document.body.appendChild(toggle);
    this.controlBarToggle = toggle;
  },

  toggleControlBar() {
    this.isControlBarVisible = !this.isControlBarVisible;
    localStorage.setItem('controlBarVisible', this.isControlBarVisible);
    
    if (this.controlBar) {
      this.controlBar.classList.toggle('visible', this.isControlBarVisible);
    }
    if (this.controlBarToggle) {
      this.controlBarToggle.classList.toggle('active', this.isControlBarVisible);
    }
    
    // Only request fit if safe (not during keyboard animation)
    if (typeof KeyboardStateManager !== 'undefined' && KeyboardStateManager.canModifyLayout()) {
      if (typeof ResizeCoordinator !== 'undefined') {
        ResizeCoordinator.requestFit();
      }
    }
    
    console.log('[Mobile] Control bar', this.isControlBarVisible ? 'shown' : 'hidden');
  },

  createControlBar() {
    const controlBar = document.createElement('div');
    controlBar.className = 'control-bar';
    
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
        <button class=control-btn arrow-btn data-key=up aria-label=Arrow Up>↑</button>
        <button class=control-btn arrow-btn data-key=down aria-label=Arrow Down>↓</button>
        <button class=control-btn arrow-btn data-key=left aria-label=Arrow Left>←</button>
        <button class=control-btn arrow-btn data-key=right aria-label=Arrow Right>→</button>
        <div class=control-divider></div>
        <button class=control-btn scroll-btn data-action=scroll-bottom aria-label=Scroll to bottom>⤓</button>
      </div>
    `;

    document.body.appendChild(controlBar);
    this.controlBar = controlBar;

    // Control key handlers
    controlBar.querySelectorAll('.control-btn[data-key]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleControlKey(btn.dataset.key);
        if (this.hiddenInput) this.hiddenInput.focus();
      });
    });
    
    // Scroll button handler - use KeyboardStateManager
    const scrollBtn = controlBar.querySelector('.scroll-btn');
    if (scrollBtn) {
      scrollBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof KeyboardStateManager !== 'undefined') {
          KeyboardStateManager.scrollToBottom();
        } else if (typeof App !== 'undefined' && App.activeSessionId) {
          // Fallback for non-mobile
          const session = App.sessions.get(App.activeSessionId);
          if (session && session.terminal) {
            session.terminal.scrollToBottom();
          }
        }
      });
    }
  },

  handleControlKey(key) {
    const keyMap = {
      'ctrl-c': '\x03',
      'ctrl-d': '\x04',
      'tab': '\t',
      'esc': '\x1b',
      'up': '\x1b[A',
      'down': '\x1b[B',
      'right': '\x1b[C',
      'left': '\x1b[D'
    };

    const sequence = keyMap[key];
    if (sequence && typeof App !== 'undefined' && App.activeSessionId) {
      App.sendInput(App.activeSessionId, sequence);
    }
  },

  createHiddenInput() {
    if (this.hiddenInput) {
      console.log('[Mobile] Hidden input already exists, skipping');
      return;
    }
    
    // Clean up orphaned inputs
    document.querySelectorAll('.hidden-input').forEach(el => el.remove());
    
    const input = document.createElement('textarea');
    input.className = 'hidden-input';
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', 'Terminal input');
    input.setAttribute('inputmode', 'text');
    input.setAttribute('enterkeyhint', 'send');
    
    document.body.appendChild(input);
    this.hiddenInput = input;

    let isComposing = false;

    input.addEventListener('compositionstart', () => {
      isComposing = true;
    });

    input.addEventListener('compositionend', (e) => {
      isComposing = false;
      if (e.data && typeof App !== 'undefined' && App.activeSessionId) {
        App.sendInput(App.activeSessionId, e.data);
      }
      e.target.value = '';
    });

    // Input handler - THE ONLY source of terminal input
    input.addEventListener('input', (e) => {
      if (isComposing) return;
      
      const data = e.target.value;
      if (data && typeof App !== 'undefined' && App.activeSessionId) {
        App.sendInput(App.activeSessionId, data);
      }
      e.target.value = '';
      e.stopPropagation();
    });

    // Special key handling
    input.addEventListener('keydown', (e) => {
      if (isComposing) return;
      
      const specialKeys = {
        'Enter': '\r',
        'Backspace': '\x7f',
        'Tab': '\t',
        'Escape': '\x1b'
      };
      
      if (specialKeys[e.key]) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, specialKeys[e.key]);
        }
      } else if (e.ctrlKey && (e.key === 'c' || e.key === 'd')) {
        e.preventDefault();
        e.stopPropagation();
        const code = e.key === 'c' ? '\x03' : '\x04';
        if (typeof App !== 'undefined' && App.activeSessionId) {
          App.sendInput(App.activeSessionId, code);
        }
      }
    });

    // Focus/blur handlers - delegate to KeyboardStateManager
    input.addEventListener('focus', () => {
      if (typeof KeyboardStateManager !== 'undefined') {
        KeyboardStateManager.onInputFocus();
      }
    });

    input.addEventListener('blur', () => {
      if (typeof KeyboardStateManager !== 'undefined') {
        KeyboardStateManager.onInputBlur();
      }
    });

    // Prevent zoom on double-tap
    input.addEventListener('touchend', (e) => e.preventDefault());
  },

  setupTerminalTapHandler() {
    const terminalContainer = document.getElementById('terminalContainer');
    if (!terminalContainer) return;

    terminalContainer.addEventListener('click', () => {
      if (this.hiddenInput) this.hiddenInput.focus();
    });
  },

  focusInput() {
    if (this.hiddenInput && this.isTouchDevice()) {
      this.hiddenInput.focus();
    }
  },

  blurInput() {
    if (this.hiddenInput) this.hiddenInput.blur();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Mobile.init();
});
