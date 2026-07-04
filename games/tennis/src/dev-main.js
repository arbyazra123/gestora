/**
 * Standalone dev harness — boots the game outside the host app, so the
 * scene/physics can be tested via `npm run dev` at
 * http://localhost:5002/dev.html without running the full host.
 * Wires up real MediaPipe hand tracking + webcam directly (mirrors
 * host/src/core/MediaPipeService.js and CameraService.js), since the
 * host normally provides those as shared singletons.
 */
import TableTennisGame from './index.js';

const mediaPipe = {
  hands: null,
  subscribers: new Map(),
  activeGameId: null,

  async init() {
    if (this.hands) return;

    const { Hands } = window;
    this.hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    this.hands.onResults((results) => {
      if (this.activeGameId) {
        const callback = this.subscribers.get(this.activeGameId);
        if (callback) callback(results);
      }
    });
  },

  subscribe(gameId, callback) {
    this.subscribers.set(gameId, callback);
    this.activeGameId = gameId;
  },

  unsubscribe(gameId) {
    this.subscribers.delete(gameId);
    if (this.activeGameId === gameId) this.activeGameId = null;
  }
};

const camera = {
  canvasElement: null,

  async init() {
    await mediaPipe.init();

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.style.display = 'none';
    document.body.appendChild(video);

    // Preview canvas (mirrors host/src/core/CameraService.js) — hand-tracking.js
    // draws each frame onto this itself, same as it does against the real
    // CameraService singleton, via results.image in handleHandTrackingResults.
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

    const { Camera } = window;
    const cam = new Camera(video, {
      onFrame: async () => {
        await mediaPipe.hands.send({ image: video });
      },
      width: 1280,
      height: 720
    });
    await cam.start();
  },

  getCanvasElement() {
    return this.canvasElement;
  },

  getCanvasContext() {
    return this.canvasElement ? this.canvasElement.getContext('2d') : null;
  }
};

const game = new TableTennisGame(document.getElementById('app'), {
  mediaPipe,
  camera,
  multiplayer: {}
});

// The host's GameManager normally initializes these services before
// instantiating a game (see host/src/core/GameManager.js) — TableTennisGame
// itself never calls camera.init(), it only stores the reference.
await mediaPipe.init();
await camera.init();

await game.init();
await game.start();
