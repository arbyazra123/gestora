/**
 * Camera Service - Singleton
 * Manages webcam stream shared across all games
 * Single camera permission request, optimized quality
 */

import { mediaPipeService } from './MediaPipeService.js';

class CameraService {
  constructor() {
    this.camera = null;
    this.videoElement = null;
    this.canvasElement = null;
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

    // Create canvas for visualization
    this.canvasElement = document.getElementById('output_canvas');
    if (!this.canvasElement) {
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.id = 'output_canvas';
      this.canvasElement.style.position = 'absolute';
      this.canvasElement.style.top = '10px';
      this.canvasElement.style.right = '10px';
      this.canvasElement.style.width = '240px';
      this.canvasElement.style.height = '180px';
      this.canvasElement.style.zIndex = '10';
      this.canvasElement.style.border = '1px solid #444';
      document.body.appendChild(this.canvasElement);
    }

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
      this.canvasElement.style.display = 'none';
    }
  }

  /**
   * Show the preview canvas again (e.g. when a game starts)
   */
  showPreview() {
    if (this.canvasElement) {
      this.canvasElement.style.display = 'block';
    }
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
