/**
 * MediaPipe Tasks Vision integration for Motion Pong.
 *
 * The rest of this platform's games use MediaPipe's legacy per-solution
 * bundles (@mediapipe/hands, @mediapipe/face_mesh, ... — see
 * host/src/core/MediaPipeService.js), each a separate Emscripten/WASM
 * module that can't coexist with another different one in the same page.
 * Pong needs BOTH a hand detector (finger-count abilities) and a face
 * detector (head-controlled paddle) running at once, which the legacy
 * system can't do. The newer Tasks Vision API shares ONE WASM runtime
 * across all its detectors specifically to support this, so HandLandmarker
 * and FaceLandmarker run together here without that conflict.
 *
 * This runs independently of the shared MediaPipeService/CameraService
 * detector pipeline (that pipeline is left with nothing to feed, which is
 * harmless — see GameManager's 'tasksVision' handling). It reads frames
 * directly off the same live <video> element CameraService already has
 * playing, via its own pull-based detectForVideo() loop instead of the
 * legacy push-based send()/onResults() callback style.
 */

import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

// Must match the installed npm package version exactly (see package.json) —
// this fetches the WASM binary the JS wrapper below expects; a mismatch
// between the two can break at the API/ABI boundary.
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

let handLandmarker = null;
let faceLandmarker = null;
let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let rafId = null;
let isRunning = false;

let onHandResults = null;
let onFaceResults = null;

/**
 * Load the shared WASM runtime and both landmarkers. Call once before
 * startVisionTracking().
 */
export async function initVisionTracking({ video, canvas, handlers }) {
  videoElement = video;
  canvasElement = canvas || null;
  canvasCtx = canvasElement ? canvasElement.getContext('2d') : null;
  onHandResults = handlers?.onHandResults || null;
  onFaceResults = handlers?.onFaceResults || null;

  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL },
    runningMode: 'VIDEO',
    numHands: 1
  });

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: FACE_MODEL_URL },
    runningMode: 'VIDEO',
    numFaces: 1
  });

  console.log('[Pong] Vision tracking initialized (HandLandmarker + FaceLandmarker)');
}

export function startVisionTracking() {
  if (isRunning) return;
  isRunning = true;
  loop();
}

export function stopVisionTracking() {
  isRunning = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function disposeVisionTracking() {
  stopVisionTracking();
  handLandmarker?.close();
  faceLandmarker?.close();
  handLandmarker = null;
  faceLandmarker = null;
}

function drawPreview() {
  if (!canvasCtx || !canvasElement || !videoElement) return;
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.restore();
}

function loop() {
  if (!isRunning) return;

  if (videoElement.readyState >= 2) {
    const now = performance.now();
    drawPreview();

    if (handLandmarker) {
      onHandResults?.(handLandmarker.detectForVideo(videoElement, now));
    }
    if (faceLandmarker) {
      onFaceResults?.(faceLandmarker.detectForVideo(videoElement, now));
    }
  }

  rafId = requestAnimationFrame(loop);
}
