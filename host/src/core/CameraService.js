/**
 * Camera Service - Singleton
 * Manages webcam stream shared across all games
 * Single camera permission request, optimized quality
 */

import { mediaPipeService } from './MediaPipeService.js';

// Persisted across game switches/reloads so the preference applies
// uniformly to every game — GameManager calls showPreview() on every load
// (see loadGameWithManifest()) without knowing about this preference at all.
const PREVIEW_VISIBLE_KEY = 'motion-platform:camera-preview-visible';

class CameraService {
  constructor() {
    this.camera = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.toggleButton = null;
    this.isActive = false;
    this.stream = null;
    this.frameInFlight = null; // tracks the current onFrame's send() calls, if any are still pending
  }

  /**
   * Initialize camera with MediaPipe
   */
  async init() {
    if (this.isActive) {
      console.log('[Camera] Already initialized');
      return;
    }

    console.log('[Camera] Initializing...');

    // The caller (GameManager) initializes whichever detector(s) the game
    // needs via mediaPipeService.init(type) before starting the camera —
    // this service is detector-agnostic and just feeds frames to all of them.

    // Create video element if not exists
    this.videoElement = document.getElementById('input_video');
    if (!this.videoElement) {
      this.videoElement = document.createElement('video');
      this.videoElement.id = 'input_video';
      this.videoElement.autoplay = true;
      this.videoElement.playsinline = true;
      this.videoElement.style.display = 'none';
      document.body.appendChild(this.videoElement);
    }

    // Create canvas for visualization. Positioning/sizing (including the
    // mobile breakpoint) lives in host/style.css under .camera-preview-canvas.
    this.canvasElement = document.getElementById('output_canvas');
    if (!this.canvasElement) {
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.id = 'output_canvas';
      this.canvasElement.className = 'camera-preview-canvas';
      document.body.appendChild(this.canvasElement);
    }

    // Toggle button sits above the canvas at a fixed position, independent
    // of the canvas's own responsive size, so it never needs repositioning
    // and stays reachable even when the preview itself is hidden.
    this.toggleButton = document.getElementById('camera-toggle-btn');
    if (!this.toggleButton) {
      this.toggleButton = document.createElement('button');
      this.toggleButton.id = 'camera-toggle-btn';
      this.toggleButton.className = 'camera-toggle-btn control-btn';
      this.toggleButton.setAttribute('aria-label', 'Toggle camera preview');
      this.toggleButton.addEventListener('click', () => this.toggleCameraPreview());
      document.body.appendChild(this.toggleButton);
    }
    this.updateToggleButtonLabel();

    try {
      // Initialize MediaPipe Camera
      const { Camera } = window;

      this.camera = new Camera(this.videoElement, {
        onFrame: async () => {
          // Feed each frame to every detector a game has initialized
          // (hands, face, ...) — a game may use more than one type at once.
          // Track this as in-flight so stop() can wait for it before
          // freeing any detector's underlying WASM memory (see stop()).
          const detectors = mediaPipeService.getActiveDetectors();
          const work = (async () => {
            for (const { instance } of detectors) {
              await instance.send({ image: this.videoElement });
            }
          })();
          this.frameInFlight = work;
          try {
            await work;
          } finally {
            if (this.frameInFlight === work) this.frameInFlight = null;
          }
        },
        width: 640,
        height: 480,
        frameRate: { ideal: 60, min: 30, max: 60 } // Optimized for performance
      });

      await this.camera.start();

      this.canvasElement.width = 640;
      this.canvasElement.height = 480;

      this.isActive = true;
      console.log('[Camera] Started successfully');
    } catch (error) {
      console.error('[Camera] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Hide the preview canvas (e.g. when returning to the hub) without
   * stopping the underlying stream — switching games shouldn't need to
   * re-request camera permission.
   */
  hidePreview() {
    if (this.canvasElement) {
      this.canvasElement.classList.add('hidden');
    }
  }

  /**
   * Show the preview canvas again (e.g. when a game starts). GameManager
   * calls this unconditionally on every game load — respecting the user's
   * persisted show/hide preference here (rather than in GameManager) is
   * what makes the preference apply across every game automatically.
   */
  showPreview() {
    if (this.canvasElement && this.isPreviewEnabled()) {
      this.canvasElement.classList.remove('hidden');
    }
  }

  /**
   * Whether the user has chosen to see the camera preview (default true).
   */
  isPreviewEnabled() {
    const stored = localStorage.getItem(PREVIEW_VISIBLE_KEY);
    return stored === null ? true : stored === 'true';
  }

  /**
   * Toggle the user's camera preview preference — persisted so it survives
   * game switches/reloads and applies platform-wide, not just to whichever
   * game happened to be open when the user clicked the toggle.
   */
  toggleCameraPreview() {
    const nextEnabled = !this.isPreviewEnabled();
    localStorage.setItem(PREVIEW_VISIBLE_KEY, String(nextEnabled));
    if (nextEnabled) {
      this.showPreview();
    } else {
      this.hidePreview();
    }
    this.updateToggleButtonLabel();
  }

  updateToggleButtonLabel() {
    if (!this.toggleButton) return;
    const enabled = this.isPreviewEnabled();
    this.toggleButton.textContent = enabled ? 'Hide Camera' : 'Show Camera';
    this.toggleButton.title = enabled ? 'Hide camera preview' : 'Show camera preview';
  }

  /**
   * Stop the camera stream and release the hardware (turns off the webcam
   * indicator light). @mediapipe/camera_utils's Camera.stop() only cancels
   * its internal frame loop — it does not stop the underlying getUserMedia
   * tracks, so we do that explicitly here.
   */
  async stop() {
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }

    // A frame's onFrame callback may still be awaiting instance.send() when
    // we get here — let it settle before pulling the video stream out from
    // under it (detectors themselves are never closed, see MediaPipeService).
    if (this.frameInFlight) {
      await this.frameInFlight.catch(() => {});
    }

    const stream = this.videoElement?.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      this.videoElement.srcObject = null;
    }

    this.hidePreview();
    this.isActive = false;
    console.log('[Camera] Stopped');
  }

  /**
   * Get video element
   */
  getVideoElement() {
    return this.videoElement;
  }

  /**
   * Get canvas element
   */
  getCanvasElement() {
    return this.canvasElement;
  }

  /**
   * Check if camera is active
   */
  isRunning() {
    return this.isActive;
  }

  /**
   * Get canvas context for drawing
   */
  getCanvasContext() {
    return this.canvasElement ? this.canvasElement.getContext('2d') : null;
  }
}

// Export singleton instance
export const cameraService = new CameraService();
