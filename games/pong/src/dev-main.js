/**
 * Standalone dev harness — boots the game outside the host app, so it can
 * be tested via `npm run dev` at http://localhost:5003/dev.html without
 * running the full host. Unlike the other games' dev harnesses, this one
 * doesn't need to mock a MediaPipe detector at all: PongGame owns its own
 * Tasks Vision pipeline (see vision-tracking.js) and only needs a live
 * <video> element + a canvas to draw the preview onto, both of which this
 * mock camera service provides via plain getUserMedia — no legacy
 * @mediapipe/camera_utils Camera class required.
 */
import PongGame from './index.js';

const camera = {
  videoElement: null,
  canvasElement: null,

  async init() {
    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;
    this.videoElement.style.display = 'none';
    document.body.appendChild(this.videoElement);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 }
    });
    this.videoElement.srcObject = stream;
    await new Promise((resolve) => {
      this.videoElement.onloadedmetadata = resolve;
    });
    await this.videoElement.play();

    // Preview canvas (mirrors host/src/core/CameraService.js), so
    // vision-tracking.js's drawPreview() has somewhere to paint the feed.
    this.canvasElement = document.createElement('canvas');
    this.canvasElement.id = 'output_canvas';
    this.canvasElement.style.position = 'absolute';
    this.canvasElement.style.top = '10px';
    this.canvasElement.style.right = '10px';
    this.canvasElement.style.width = '240px';
    this.canvasElement.style.height = '180px';
    this.canvasElement.style.zIndex = '10';
    this.canvasElement.style.border = '1px solid #444';
    this.canvasElement.width = 1280;
    this.canvasElement.height = 720;
    document.body.appendChild(this.canvasElement);
  },

  getVideoElement() {
    return this.videoElement;
  },

  getCanvasElement() {
    return this.canvasElement;
  },

  getCanvasContext() {
    return this.canvasElement ? this.canvasElement.getContext('2d') : null;
  }
};

const game = new PongGame(document.getElementById('app'), {
  mediaPipe: null, // unused — PongGame runs its own Tasks Vision pipeline
  camera,
  multiplayer: {}
});

// The host's GameManager normally initializes this before instantiating a
// game — PongGame itself never calls camera.init().
await camera.init();

await game.init();
await game.start();
