/**
 * ResizeCoordinator - Centralized viewport resize handling
 * 
 * Solves viewport glitches by:
 * 1. Single debounced entry point for all resize events
 * 2. Layout flush before measuring (prevents stale dimensions)
 * 3. Coordinates between app.js and mobile.js
 * 4. Handles iOS keyboard animation timing
 */
const ResizeCoordinator = {
  timeout: null,
  DEBOUNCE_MS: 100,           // Fast enough to feel responsive, slow enough to batch
  lastFit: 0,
  MIN_INTERVAL_MS: 50,        // Minimum time between fits
  pendingFit: false,
  
  /**
   * Request a terminal fit - debounced and coordinated
   * Call this from anywhere that needs to trigger a resize
   */
  requestFit() {
    // Already have a pending request
    if (this.pendingFit) {
      return;
    }
    
    this.pendingFit = true;
    clearTimeout(this.timeout);
    
    this.timeout = setTimeout(() => {
      this.performFit();
      this.pendingFit = false;
    }, this.DEBOUNCE_MS);
  },
  
  /**
   * Force an immediate fit (bypasses debounce)
   * Use sparingly - only for critical moments like session switch
   */
  forceFit() {
    clearTimeout(this.timeout);
    this.pendingFit = false;
    this.performFit();
  },
  
  /**
   * Perform the actual terminal fit
   * - Flushes layout to ensure accurate measurements
   * - Respects minimum interval to prevent thrashing
   */
  performFit() {
    const now = Date.now();
    
    // Prevent rapid-fire fits
    if (now - this.lastFit < this.MIN_INTERVAL_MS) {
      console.log('[ResizeCoordinator] Skipping fit - too recent');
      return;
    }
    
    this.lastFit = now;
    
    // Force layout flush before measuring
    // This ensures CSS changes are painted before we measure
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      // Reading offsetHeight forces a synchronous layout
      void appContainer.offsetHeight;
    }
    
    // Perform the fit
    if (typeof App !== 'undefined' && App.activeSessionId) {
      const session = App.sessions.get(App.activeSessionId);
      if (session && session.terminal) {
        try {
          session.terminal.fit();
          const dims = session.terminal.getDimensions();
          if (dims.cols && dims.rows) {
            App.sendResize(App.activeSessionId, dims.cols, dims.rows);
            console.log('[ResizeCoordinator] Fit complete:', dims.cols, 'x', dims.rows);
          }
        } catch (e) {
          console.warn('[ResizeCoordinator] Fit failed:', e.message);
        }
      }
    }
  },
  
  /**
   * Cancel any pending fit request
   * Useful when switching sessions or cleaning up
   */
  cancel() {
    clearTimeout(this.timeout);
    this.pendingFit = false;
  }
};

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResizeCoordinator;
}
