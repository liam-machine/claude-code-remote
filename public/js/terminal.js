/**
 * Claude Code Remote - Terminal Module
 * Factory for creating xterm.js terminals with dark theme
 */

const TerminalManager = {
  /**
   * Dark theme matching the app's color scheme
   */
  theme: {
    background: '#0d1117',
    foreground: '#e6edf3',
    cursor: '#58a6ff',
    cursorAccent: '#0d1117',
    selectionBackground: '#264f78',
    selectionForeground: '#ffffff',
    // ANSI colors
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc'
  },

  /**
   * Create a new terminal in the given container
   * Returns an object with terminal methods
   * @param {string} containerId - DOM element ID to attach terminal to
   * @returns {Object} Terminal wrapper with methods
   */
  createTerminal(containerId) {
    const container = document.getElementById(containerId);
    
    if (!container) {
      console.error('[Terminal] Container not found:', containerId);
      return null;
    }

    // Create terminal with options optimized for mobile
    const terminal = new Terminal({
      theme: this.theme,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      tabStopWidth: 4,
      allowProposedApi: true,
      convertEol: true
    });

    // Initialize fit addon for automatic resizing
    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in container
    terminal.open(container);

    // Fit to container size
    try {
      fitAddon.fit();
    } catch (e) {
      console.warn('[Terminal] Initial fit failed:', e.message);
    }

    console.log('[Terminal] Created in', containerId);

    // Return wrapper object with methods
    return {
      /**
       * Fit terminal to container size
       */
      fit() {
        try {
          fitAddon.fit();
        } catch (e) {
          console.warn('[Terminal] Fit failed:', e.message);
        }
      },

      /**
       * Write data to terminal
       * @param {string} data - Data to write
       */
      write(data) {
        terminal.write(data);
      },

      /**
       * Clear the terminal
       */
      clear() {
        terminal.clear();
      },

      /**
       * Focus the terminal
       */
      focus() {
        terminal.focus();
      },

      /**
       * Get current terminal dimensions
       * @returns {{cols: number, rows: number}}
       */
      getDimensions() {
        return { cols: terminal.cols, rows: terminal.rows };
      },

      /**
       * Register callback for terminal input
       * @param {function} callback - Called with input data
       */
      onData(callback) {
        terminal.onData(callback);
      },

      /**
       * Dispose of the terminal
       */
      dispose() {
        terminal.dispose();
      }
    };
  },

  // Legacy API for backwards compatibility (single terminal)
  terminal: null,
  fitAddon: null,

  init(containerId) {
    const wrapper = this.createTerminal(containerId);
    if (wrapper) {
      this.terminal = wrapper;
      return wrapper;
    }
    return null;
  },

  fit() {
    if (this.terminal) this.terminal.fit();
  },

  write(data) {
    if (this.terminal) this.terminal.write(data);
  },

  clear() {
    if (this.terminal) this.terminal.clear();
  },

  focus() {
    if (this.terminal) this.terminal.focus();
  },

  getDimensions() {
    if (this.terminal) return this.terminal.getDimensions();
    return { cols: 80, rows: 24 };
  },

  onData(callback) {
    if (this.terminal) this.terminal.onData(callback);
  }
};
