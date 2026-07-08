/**
 * Game Manager
 * Handles dynamic loading/unloading of game modules
 * Module Federation orchestration
 */

import { mediaPipeService } from './MediaPipeService.js';
import { cameraService } from './CameraService.js';
import { multiplayerService } from './MultiplayerService.js';

class GameManager {
  constructor() {
    this.currentGame = null;
    this.currentGameId = null;
    this.preloadedGames = new Map(); // gameId -> manifest
    this.gameContainer = null;

    // Performance tracking
    this.loadTimes = new Map();
  }

  /**
   * Initialize game manager
   * @param {HTMLElement} container - Container element for games
   */
  init(container) {
    this.gameContainer = container;
    console.log('[GameManager] Initialized');
  }

  /**
   * Preload a game in the background
   * Uses <link rel="modulepreload"> for faster subsequent loading
   */
  async preloadGame(gameId, manifestUrl) {
    if (this.preloadedGames.has(gameId)) {
      console.log(`[GameManager] Game "${gameId}" already preloaded`);
      return;
    }

    try {
      console.log(`[GameManager] Preloading "${gameId}"...`);

      const manifest = await fetch(manifestUrl).then(r => r.json());

      // Use modulepreload for faster loading
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = manifest.remoteEntry;
      document.head.appendChild(link);

      this.preloadedGames.set(gameId, manifest);
      console.log(`[GameManager] Preloaded "${gameId}"`);
    } catch (error) {
      console.error(`[GameManager] Failed to preload "${gameId}":`, error);
    }
  }

  /**
   * Load and start a game with manifest object
   * @param {string} gameId - Game identifier
   * @param {object} manifest - Game manifest object
   * @param {object} options - Launch options (e.g. { multiplayer: true })
   */
  async loadGameWithManifest(gameId, manifest, options = {}) {
    const startTime = performance.now();
    console.log(`[GameManager] Loading "${gameId}"...`);

    // Each game declares which tracking detector it needs via
    // manifest.tracking.type (defaults to 'hands' for games that don't
    // declare one, e.g. tennis/hand-sword)
    const trackingType = manifest.tracking?.type || 'hands';

    // Two different MediaPipe legacy solution types (e.g. hands + face)
    // cannot coexist in this page's JS/WASM global scope — even a brand
    // new, first-ever init of the second type crashes once a different
    // type has already run. Force a clean reload instead, and auto-resume
    // straight into the requested game afterwards. 'tasksVision' games
    // manage their own separate WASM runtime (see MediaPipeService.markTypeUsed)
    // but are treated the same way here, since coexistence with a legacy
    // solution's WASM hasn't been verified safe either.
    if (mediaPipeService.hasUsedDifferentType(trackingType)) {
      console.warn(
        `[GameManager] Switching tracking type to "${trackingType}" requires a reload — resuming "${gameId}" after reload`
      );
      sessionStorage.setItem('motion-platform:pending-game', gameId);
      sessionStorage.setItem('motion-platform:pending-game-multiplayer', String(!!options.multiplayer));
      window.location.reload();
      return;
    }

    try {
      // Unload current game first
      if (this.currentGame) {
        await this.unloadGame();
      }

      // Cache the manifest
      this.preloadedGames.set(gameId, manifest);

      // Ensure services are initialized. 'tasksVision' games run their own
      // detector pipeline (e.g. games/pong/src/vision-tracking.js) instead
      // of the legacy per-solution one this service manages, but the camera
      // stream/video element is still shared.
      if (trackingType === 'tasksVision') {
        mediaPipeService.markTypeUsed('tasksVision');
      } else {
        await mediaPipeService.init(trackingType);
      }
      await cameraService.init();
      cameraService.showPreview();

      // Dynamic import the game module
      // Note: In production, this would use the remoteEntry URL from manifest
      const GameModule = await this.importGameModule(gameId, manifest);

      // Clear container
      this.gameContainer.innerHTML = '';

      // Instantiate game with shared services
      this.currentGame = new GameModule.default(
        this.gameContainer,
        {
          mediaPipe: mediaPipeService,
          camera: cameraService,
          multiplayer: multiplayerService,
          launchOptions: { multiplayer: !!options.multiplayer }
        }
      );

      this.currentGameId = gameId;

      // Initialize and start the game
      await this.currentGame.init();
      await this.currentGame.start();

      const loadTime = performance.now() - startTime;
      this.loadTimes.set(gameId, loadTime);

      console.log(`[GameManager] Game "${gameId}" loaded in ${loadTime.toFixed(2)}ms`);

      return this.currentGame;
    } catch (error) {
      console.error(`[GameManager] Failed to load "${gameId}":`, error);
      throw error;
    }
  }

  /**
   * Import game module dynamically
   * In development: imports from local games folder
   * In production: imports from CDN via remoteEntry
   */
  async importGameModule(gameId, manifest) {
    // Development mode - import from local folder using alias
    if (import.meta.env.DEV) {
      return await import(`@games/${gameId}/src/index.js`);
    }

    // Production mode - import from remote entry via Module Federation.
    // Prefer the deployed URL; remoteEntry is the localhost dev fallback
    // and would 404 in a real deployment.
    const remoteEntry = manifest.production || manifest.remoteEntry;
    return await import(/* @vite-ignore */ remoteEntry);
  }

  /**
   * Unload current game
   */
  async unloadGame() {
    if (!this.currentGame) {
      return;
    }

    console.log(`[GameManager] Unloading "${this.currentGameId}"...`);

    try {
      // Call game cleanup
      if (typeof this.currentGame.stop === 'function') {
        await this.currentGame.stop();
      }

      if (typeof this.currentGame.cleanup === 'function') {
        await this.currentGame.cleanup();
      }

      // Clear container
      if (this.gameContainer) {
        this.gameContainer.innerHTML = '';
      }

      // Stop the camera when no game needs it — releases the webcam hardware
      // (indicator light off) instead of leaving it capturing in the
      // background. init() re-acquires it on the next game load; browsers
      // don't re-prompt for permission on the same origin, so this doesn't
      // cost a dialog, just a brief re-negotiation.
      await cameraService.stop();

      this.currentGame = null;
      this.currentGameId = null;

      // Force garbage collection if available (dev mode)
      if (window.gc) {
        window.gc();
      }

      console.log('[GameManager] Game unloaded');
    } catch (error) {
      console.error('[GameManager] Error during unload:', error);
      throw error;
    }
  }

  /**
   * Pause current game
   */
  pauseGame() {
    if (this.currentGame && typeof this.currentGame.pause === 'function') {
      this.currentGame.pause();
      console.log('[GameManager] Game paused');
    }
  }

  /**
   * Resume current game
   */
  resumeGame() {
    if (this.currentGame && typeof this.currentGame.resume === 'function') {
      this.currentGame.resume();
      console.log('[GameManager] Game resumed');
    }
  }

  /**
   * Get current game instance
   */
  getCurrentGame() {
    return this.currentGame;
  }

  /**
   * Get current game ID
   */
  getCurrentGameId() {
    return this.currentGameId;
  }

  /**
   * Get load time for a game
   */
  getLoadTime(gameId) {
    return this.loadTimes.get(gameId);
  }

  /**
   * Get all preloaded games
   */
  getPreloadedGames() {
    return Array.from(this.preloadedGames.keys());
  }
}

// Export singleton instance
export const gameManager = new GameManager();
