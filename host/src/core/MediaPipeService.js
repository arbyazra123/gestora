/**
 * MediaPipe Tracking Service - Singleton
 * Shared hand/face tracking across all games
 * Each detector type (hands, face) is loaded lazily, only when a game needs it
 */

const DETECTOR_CONFIG = {
  hands: {
    globalName: 'Hands',
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    defaultOptions: {
      maxNumHands: 2,
      modelComplexity: 0, // Fastest model
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    }
  },
  face: {
    globalName: 'FaceDetection',
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
    defaultOptions: {
      model: 'short',
      minDetectionConfidence: 0.5
    }
  },
  faceMesh: {
    globalName: 'FaceMesh',
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    defaultOptions: {
      maxNumFaces: 1,
      refineLandmarks: true, // adds iris landmarks, sharper eye contour precision
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    }
  }
};

class MediaPipeService {
  constructor() {
    // type -> { instance, isInitialized, isLoading }. Once created, a
    // detector is kept alive for the rest of the page session and never
    // closed/recreated — MediaPipe's legacy per-solution WASM bundles are
    // not safe to close() and re-instantiate in the same page (their
    // Emscripten module relies on module-level state for the virtual FS
    // used to load model assets; a second instantiation of even the SAME
    // type can corrupt that and crash). Switching which detector is "live"
    // is handled purely in JS via getActiveDetectors(), not by tearing
    // anything down.
    this.detectors = {};
    this.subscribers = new Map(); // gameId -> { callback, type }
    this.activeGameId = null;

    // Types ever initialized in this page's JS realm. Two DIFFERENT solution
    // types (e.g. hands + face) cannot coexist in the same page at all —
    // confirmed by a fresh, first-ever init of 'face' still crashing after
    // 'hands' had been used earlier in the session, with no close/recreate
    // involved. Only a full page reload gives the second type a clean global
    // scope to bootstrap in. See hasUsedDifferentType().
    this.everLoadedTypes = new Set();

    // Performance: Track stats
    this.stats = {
      fps: 0,
      lastFrameTime: 0,
      frameCount: 0
    };
  }

  /**
   * Initialize a detector ('hands' or 'face')
   * Lazily loads its script only when a game first needs it
   */
  async init(type = 'hands') {
    const existing = this.detectors[type];
    if (existing?.isInitialized) return;
    if (existing?.isLoading) {
      // Wait for existing init to complete
      return new Promise((resolve) => {
        const checkInit = setInterval(() => {
          if (this.detectors[type]?.isInitialized) {
            clearInterval(checkInit);
            resolve();
          }
        }, 100);
      });
    }

    const config = DETECTOR_CONFIG[type];
    if (!config) {
      throw new Error(`[MediaPipe] Unknown detector type "${type}"`);
    }

    this.detectors[type] = { instance: null, isInitialized: false, isLoading: true };
    console.log(`[MediaPipe] Initializing "${type}" detector...`);

    try {
      await this.waitForScript(type, config);

      const DetectorClass = window[config.globalName];
      const instance = new DetectorClass({ locateFile: config.locateFile });
      instance.setOptions(config.defaultOptions);
      instance.onResults((results) => this.handleResults(type, results));

      this.detectors[type] = { instance, isInitialized: true, isLoading: false };
      this.everLoadedTypes.add(type);
      console.log(`[MediaPipe] "${type}" detector initialized successfully`);
    } catch (error) {
      console.error(`[MediaPipe] "${type}" detector initialization failed:`, error);
      this.detectors[type] = { instance: null, isInitialized: false, isLoading: false };
      throw error;
    }
  }

  /**
   * Wait for a detector's script to be available as a window global.
   * Scripts are expected to already be loaded via <script> tags in index.html.
   */
  async waitForScript(type, config) {
    if (window[config.globalName]) return;

    console.log(`[MediaPipe] Waiting for "${type}" script to load...`);

    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max wait

      const checkInterval = setInterval(() => {
        attempts++;

        if (window[config.globalName]) {
          console.log(`[MediaPipe] "${type}" script loaded successfully`);
          clearInterval(checkInterval);
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          reject(new Error(
            `MediaPipe "${type}" script failed to load. Check its <script> tag in index.html and your internet connection.`
          ));
        }
      }, 100);
    });
  }

  /**
   * Subscribe a game to tracking updates for a given detector type
   */
  subscribe(gameId, callback, type = 'hands') {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    console.log(`[MediaPipe] Game "${gameId}" subscribed (${type})`);
    this.subscribers.set(gameId, { callback, type });
    this.activeGameId = gameId;
  }

  /**
   * Unsubscribe a game from tracking
   */
  unsubscribe(gameId) {
    console.log(`[MediaPipe] Game "${gameId}" unsubscribed`);
    this.subscribers.delete(gameId);

    if (this.activeGameId === gameId) {
      this.activeGameId = null;
    }
  }

  /**
   * Handle results from a specific detector and broadcast to the active
   * game only if it's subscribed to that detector's type
   * Performance: Only send to active game, not all subscribers
   */
  handleResults(type, results) {
    // Update FPS stats
    const now = performance.now();
    if (this.stats.lastFrameTime) {
      const delta = now - this.stats.lastFrameTime;
      this.stats.fps = Math.round(1000 / delta);
    }
    this.stats.lastFrameTime = now;
    this.stats.frameCount++;

    // Send to active game only, and only if it's subscribed to this detector type
    if (this.activeGameId) {
      const sub = this.subscribers.get(this.activeGameId);
      if (sub && sub.type === type) {
        sub.callback(results);
      }
    }
  }

  /**
   * Get the detector instance the CURRENTLY ACTIVE game is subscribed to
   * (not every detector ever initialized). Used by CameraService to decide
   * which detector(s) to feed each camera frame to. Detector instances from
   * a previous game stay alive in memory (see constructor) but are simply
   * never sent frames once no active subscriber needs them, instead of
   * being torn down.
   */
  getActiveDetectors() {
    if (!this.activeGameId) return [];

    const sub = this.subscribers.get(this.activeGameId);
    if (!sub) return [];

    const detector = this.detectors[sub.type];
    if (!detector?.isInitialized) return [];

    return [{ type: sub.type, instance: detector.instance }];
  }

  /**
   * Update options for a specific detector (e.g., maxNumHands)
   */
  setOptions(options, type = 'hands') {
    const detector = this.detectors[type]?.instance;
    if (detector) {
      detector.setOptions(options);
      console.log(`[MediaPipe] "${type}" options updated:`, options);
    }
  }

  /**
   * Get current FPS
   */
  getFPS() {
    return this.stats.fps;
  }

  /**
   * Get a detector instance directly (e.g., for camera setup)
   */
  getDetector(type = 'hands') {
    return this.detectors[type]?.instance || null;
  }

  /**
   * True if some OTHER detector type has already run in this page session.
   * The caller should force a full page reload rather than trying to init
   * the new type in-place — see everLoadedTypes above.
   */
  hasUsedDifferentType(type) {
    return this.everLoadedTypes.size > 0 && !this.everLoadedTypes.has(type);
  }

  /**
   * Record that a type was used without going through this service's own
   * init() — for games managing their own tracking runtime (e.g. pong's
   * MediaPipe Tasks Vision pipeline, see games/pong/src/vision-tracking.js)
   * that still needs to participate in the one-type-per-session guard above.
   */
  markTypeUsed(type) {
    this.everLoadedTypes.add(type);
  }
}

// Export singleton instance
export const mediaPipeService = new MediaPipeService();
