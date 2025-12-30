/**
 * ResizeCoordinator - Centralized viewport resize handling
 * Now respects KeyboardStateManager for animation-safe layout
 */
const ResizeCoordinator = {
  timeout: null,
  DEBOUNCE_MS: 100,
  lastFit: 0,
  MIN_INTERVAL_MS: 50,
  pendingFit: false,
  
  /**
   * Request a terminal fit - debounced and coordinated
   */
  requestFit() {
    // Skip if keyboard is animating
    if (typeof KeyboardStateManager !== 'undefined' && !KeyboardStateManager.canModifyLayout()) {
      console.log('[ResizeCoordinator] Skipping fit - keyboard animating');
      return;
    }
    
    if (this.pendingFit) return;
    
    this.pendingFit = true;
    clearTimeout(this.timeout);
    
    this.timeout = setTimeout(() => {
      this.performFit();
      this.pendingFit = false;
    }, this.DEBOUNCE_MS);
  },
  
  /**
   * Force an immediate fit (bypasses debounce but respects animation state)
   */
  forceFit() {
    clearTimeout(this.timeout);
    this.pendingFit = false;
    this.performFit();
  },
  
  /**
   * Perform the actual terminal fit
   */
  performFit() {
    const now = Date.now();
    
    if (now - this.lastFit < this.MIN_INTERVAL_MS) {
      console.log('[ResizeCoordinator] Skipping fit - too recent');
      return;
    }
    
    this.lastFit = now;
    
    // Force layout flush before measuring
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      void appContainer.offsetHeight;
    }
    
    // Perform the fit
    if (typeof App !== 'undefined' && App.activeSessionId) {
      const session = App.sessions.get(App.activeSessionId);
      if (session && session.terminal) {
        try {
          session.terminal.fit();
          const dims = session.terminal.getDimensions();
          if (dims && dims.cols && dims.rows) {
            App.sendResize(App.activeSessionId, dims.cols, dims.rows);
            console.log('[ResizeCoordinator] Fit complete:', dims.cols, 'x', dims.rows);
          }
        } catch (e) {
          console.warn('[ResizeCoordinator] Fit failed:', e.message);
        }
      }
    }
  },
  
  cancel() {
    clearTimeout(this.timeout);
    this.pendingFit = false;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResizeCoordinator;
}
