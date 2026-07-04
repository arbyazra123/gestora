/**
 * Head Tracking for Pong Paddle Control
 * Maps head x-position (from MediaPipe Tasks Vision's FaceLandmarker,
 * see vision-tracking.js) to the player paddle's x position only. No
 * rotation, no y/z — pure left/right.
 */

import { FIELD_WIDTH, PADDLE_WIDTH } from './scene.js';

let playerPaddle;

// Nose tip landmark (stable, centered reference point for head x position;
// same index as legacy Face Mesh's topology)
const NOSE_TIP_INDEX = 1;

// How much a given head movement moves the paddle: 1 = you must cross the
// whole camera frame to cover the full paddle range; >1 = smaller head
// movements reach the edges (2 means half the frame width is already full range).
const SENSITIVITY = 4;
// How quickly the paddle catches up to your head's target position each frame:
// 0-1, higher = snappier/twitchier, lower = smoother but laggier.
const SMOOTHING_FACTOR = 0.25;
const MAX_X = FIELD_WIDTH / 2 - PADDLE_WIDTH / 2;

let smoothedX = 0;
let isFaceDetected = false;
let boostActive = false;

export function setupHeadTracking(paddle) {
  playerPaddle = paddle;
  console.log('[Pong] Head tracking setup complete');
}

// Paddle Boost ability: snappier tracking response while active
export function setHeadBoost(active) {
  boostActive = active;
}

export function handleFaceLandmarkResults(results) {
  if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) {
    isFaceDetected = false;
    return;
  }

  isFaceDetected = true;
  const landmarks = results.faceLandmarks[0];
  const xCenter = landmarks[NOSE_TIP_INDEX].x; // 0 (image left) .. 1 (image right)

  // The camera feed isn't mirrored on-screen, so flip x: moving your head
  // to your own right should nudge the paddle right, like looking in a mirror.
  const normalizedX = (0.5 - xCenter) * 2 * SENSITIVITY; // clamped via MAX_X below
  const targetX = normalizedX * MAX_X;

  const smoothing = boostActive ? Math.min(SMOOTHING_FACTOR * 1.8, 1) : SMOOTHING_FACTOR;
  smoothedX += (targetX - smoothedX) * smoothing;
  playerPaddle.position.x = Math.max(-MAX_X, Math.min(MAX_X, smoothedX));
}

export function isHeadVisible() {
  return isFaceDetected;
}

export function resetHeadTracking() {
  smoothedX = 0;
  isFaceDetected = false;
}
