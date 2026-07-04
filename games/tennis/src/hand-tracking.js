/**
 * Hand Tracking for Table Tennis Racket Control
 * Maps hand position and orientation to player racket
 */

import * as THREE from 'three';

let playerRacket;
let camera;
let mediaPipe;

// Smoothing parameters
const SMOOTHING_FACTOR = 0.3;
const prevPosition = new THREE.Vector3();
const prevRotation = new THREE.Euler();

// Hand tracking state
let isHandDetected = false;

// Swing gesture: 1/2/3 fingers pick a hit direction, a low-to-high hand
// motion while holding that gesture triggers the swing and sets the lift.
export const SWING_DIRECTION_X = { left: -0.28, center: 0, right: 0.28 };
const DIRECTION_TWIST = { left: -1, center: 0.35, right: 1 };
const SWING_ANIM_DURATION = 350; // ms

// Showing a valid 1/2/3-finger gesture arms that direction immediately (with
// an instant visual snap so it's never silent); any rise of the hand while
// held on top of that just scales the lift power, it isn't required to get
// a reaction at all.
let swingDirection = null;
let swingLowY = null;
let pendingSwing = null; // { direction, liftPower, expiresAt }
let activeSwingAnim = null; // { direction, startTime }

// Smash gesture: just showing an open hand (5 fingers) is enough — no
// swing motion required. Refreshed every frame the gesture is held (same
// as the direction swing's pendingSwing), so whenever the ball actually
// touches the racket, a still-held open hand is picked up as a smash.
const SMASH_FINGER_COUNT = 5;

let smashActive = false;
let pendingSmash = null; // { expiresAt }

// Raw finger count, for the on-screen debug readout (distinct from the
// direction-only gesture above, which ignores combinations like "index +
// pinky" that don't map to a swing).
const FINGER_TIPS = [8, 12, 16, 20]; // index, middle, ring, pinky
const FINGER_PIPS = [6, 10, 14, 18];
const THUMB_TIP = 4;
const THUMB_IP = 3;
const PALM_BASE = 17; // pinky MCP

let currentFingerCount = null;

export function setupHandTracking(racket, cameraService, mediaPipeService) {
  playerRacket = racket;
  camera = cameraService;
  mediaPipe = mediaPipeService;

  console.log('[Table Tennis] Hand tracking setup complete');
}

export function handleHandTrackingResults(results) {
  drawCameraPreview(results);

  if (!results || !results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    isHandDetected = false;
    currentFingerCount = null;
    resetSwingState();
    resetSmashState();
    return;
  }

  isHandDetected = true;
  const landmarks = results.multiHandLandmarks[0]; // Use first hand
  currentFingerCount = countExtendedFingers(landmarks);

  // Get key landmarks
  const wrist = landmarks[0];
  const indexFinger = landmarks[8];
  const middleFinger = landmarks[12];

  // Convert MediaPipe coordinates (0-1) to 3D world space
  const position = mediaPipeToWorld(wrist);

  updateSwingGesture(landmarks, position.y);
  updateSmashGesture(currentFingerCount);

  // Calculate rotation based on hand orientation
  const direction = new THREE.Vector3(
    (wrist.x - indexFinger.x),
    (indexFinger.y + wrist.y),
    - ((indexFinger.z * 3) - wrist.z)
  ).normalize();

  // Apply smoothing
  if (prevPosition.length() === 0) {
    prevPosition.copy(position);
  }

  position.lerp(prevPosition, 1 - SMOOTHING_FACTOR);
  prevPosition.copy(position);

  // Update racket position
  playerRacket.position.copy(position);

  // Update racket rotation to face the direction of movement
  const targetRotation = new THREE.Euler(
    -direction.y * Math.PI / 2,
    Math.atan2(direction.x, direction.z),
    0
  );

  if (prevRotation.x === 0 && prevRotation.y === 0) {
    prevRotation.copy(targetRotation);
  }

  // Smooth rotation
  playerRacket.rotation.x = THREE.MathUtils.lerp(
    playerRacket.rotation.x,
    targetRotation.x,
    SMOOTHING_FACTOR
  );
  playerRacket.rotation.y = THREE.MathUtils.lerp(
    playerRacket.rotation.y,
    targetRotation.y,
    SMOOTHING_FACTOR
  );

  prevRotation.copy(playerRacket.rotation);
}

function isFingerExtended(landmarks, tipIdx, pipIdx) {
  // Assumes a hand held up facing the camera: tip above (smaller y than) pip means extended.
  return landmarks[tipIdx].y < landmarks[pipIdx].y;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isThumbExtended(landmarks) {
  // Thumb doesn't fold the same way as the other fingers, so compare its
  // distance from the palm base at the tip vs the IP joint instead of the
  // tip/pip y-comparison used above.
  const palmBase = landmarks[PALM_BASE];
  return dist(landmarks[THUMB_TIP], palmBase) > dist(landmarks[THUMB_IP], palmBase) * 1.1;
}

/**
 * Count which fingers are extended and map the combination to a swing
 * direction. An open pinky means "not a counting gesture" (fist/open palm).
 */
function getGestureDirection(landmarks) {
  const index = isFingerExtended(landmarks, 8, 6);
  const middle = isFingerExtended(landmarks, 12, 10);
  const ring = isFingerExtended(landmarks, 16, 14);
  const pinky = isFingerExtended(landmarks, 20, 18);

  if (pinky) return null;
  if (index && middle && ring) return 'right';
  if (index && middle && !ring) return 'center';
  if (index && !middle && !ring) return 'left';
  return null;
}

/**
 * Raw extended-finger count (0-5), for the on-screen debug readout —
 * independent of the direction-only gesture above.
 */
function countExtendedFingers(landmarks) {
  let count = 0;
  for (let i = 0; i < FINGER_TIPS.length; i++) {
    if (isFingerExtended(landmarks, FINGER_TIPS[i], FINGER_PIPS[i])) count++;
  }
  if (isThumbExtended(landmarks)) count++;
  return count;
}

export function getCurrentFingerCount() {
  return currentFingerCount;
}

/**
 * Draw the live camera feed onto the shared preview canvas. CameraService
 * creates that canvas but never paints it (see host/src/core/CameraService.js)
 * — each game's tracking module is expected to draw its own frame, same as
 * hand-sword/src/hand-tracking.js does.
 */
function drawCameraPreview(results) {
  const canvasElement = camera?.getCanvasElement?.();
  const canvasCtx = camera?.getCanvasContext?.();
  if (!canvasCtx || !canvasElement || !results?.image) return;

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.restore();
}

/**
 * Showing a 1/2/3-finger gesture immediately arms that direction (firing the
 * visual snap right away, so it's never silent) and starts tracking the
 * hand's low point; continuing to hold it while raising the hand increases
 * liftPower proportionally. pendingSwing is refreshed every frame the
 * gesture is held so a ball hit always picks up the latest direction/lift.
 */
function updateSwingGesture(landmarks, handY) {
  const direction = getGestureDirection(landmarks);

  if (!direction) {
    resetSwingState();
    return;
  }

  if (direction !== swingDirection) {
    swingDirection = direction;
    swingLowY = handY;
    activeSwingAnim = { direction, startTime: performance.now(), lastArc: 0 };
  } else {
    swingLowY = Math.min(swingLowY, handY);
  }

  const rise = Math.max(0, handY - swingLowY);
  pendingSwing = {
    direction: swingDirection,
    liftPower: rise,
    expiresAt: performance.now() + 500
  };
}

function resetSwingState() {
  swingDirection = null;
  swingLowY = null;
}

export function getArmedDirection() {
  return swingDirection;
}

/**
 * Just showing an open hand (5 fingers) is enough to smash — no swing
 * motion needed. Fires the visual snap once on the rising edge (so it's
 * not replayed every frame while held), and keeps pendingSmash fresh the
 * whole time the gesture is held.
 */
function updateSmashGesture(fingerCount) {
  if (fingerCount !== SMASH_FINGER_COUNT) {
    resetSmashState();
    return;
  }

  if (!smashActive) {
    smashActive = true;
    activeSwingAnim = { direction: 'smash', startTime: performance.now(), lastArc: 0 };
  }

  pendingSmash = { expiresAt: performance.now() + 500 };
}

function resetSmashState() {
  smashActive = false;
}

export function isSmashArmed() {
  return smashActive;
}

/**
 * Consume the pending smash (if any and not expired) so it's applied to
 * exactly one ball hit.
 */
export function consumePendingSmash() {
  if (!pendingSmash) return null;
  if (performance.now() > pendingSmash.expiresAt) {
    pendingSmash = null;
    return null;
  }
  const smash = pendingSmash;
  pendingSmash = null;
  activeSwingAnim = { direction: 'smash', startTime: performance.now(), lastArc: 0 };
  return smash;
}

/**
 * Consume the pending swing (if any and not expired) so it's applied to
 * exactly one ball hit.
 */
export function consumePendingSwing() {
  if (!pendingSwing) return null;
  if (performance.now() > pendingSwing.expiresAt) {
    pendingSwing = null;
    return null;
  }
  const swing = pendingSwing;
  pendingSwing = null;
  activeSwingAnim = { direction: swing.direction, startTime: performance.now(), lastArc: 0 };
  return swing;
}

const CENTER_LIFT_BUMP = 0.9; // world units the racket visually rises for a center swing
const SMASH_DROP_BUMP = -1.8; // world units the racket visually drops for a smash — bigger and inverted vs. the center lift

/**
 * Play the swing "snap" visual. Left/right twist the racket on rotation.z —
 * the one rotation axis hand-tracking never touches, so it can't fight the
 * per-frame rotation tracking above. Center and smash instead bump the
 * racket's position.y (up for center's lift, down for a smash's downward
 * chop) and back; position is safe to overlay the same way since
 * hand-tracking always copy()s a freshly computed position over it rather
 * than lerping from whatever's currently there, so this offset never feeds
 * back into its own smoothing state.
 */
export function updateSwingAnimation() {
  if (!activeSwingAnim || !playerRacket) return;

  const elapsed = performance.now() - activeSwingAnim.startTime;
  const t = elapsed / SWING_ANIM_DURATION;

  if (t >= 1) {
    playerRacket.rotation.z = 0;
    activeSwingAnim = null;
    return;
  }

  const arc = Math.sin(t * Math.PI);

  if (activeSwingAnim.direction === 'center' || activeSwingAnim.direction === 'smash') {
    // Additive delta from last frame's arc value, not an absolute set — this
    // function runs every render frame (often several per hand-tracking
    // update), so adding the full arc each time would compound way past the
    // intended bump. The deltas telescope to exactly arc(t) of offset
    // relative to wherever hand-tracking has the racket positioned now.
    const bump = activeSwingAnim.direction === 'smash' ? SMASH_DROP_BUMP : CENTER_LIFT_BUMP;
    playerRacket.position.y += bump * (arc - activeSwingAnim.lastArc);
    activeSwingAnim.lastArc = arc;
  } else {
    playerRacket.rotation.z = (DIRECTION_TWIST[activeSwingAnim.direction] ?? 0) * arc;
  }
}

/**
 * Convert MediaPipe normalized coordinates to 3D world space
 * MediaPipe: x: 0-1 (left to right), y: 0-1 (top to bottom), z: depth
 * World: x: -width/2 to width/2, y: 0 to height, z: near to far
 */
function mediaPipeToWorld(landmark) {
  // Map x from [0, 1] to [-6, 6] (court width area)
  const x = (landmark.x - 0.33) * -20;

  // Map y from [0, 1] to [3, 0] (inverted, higher in screen = higher in world)
  const y = (0 - landmark.y) * 5 + 5;

  // Map z from [0, -0.3] to [-8, -4] (depth, closer to player side)
  const z = landmark.z * -10 - 4.5;

  return new THREE.Vector3(x, y, z);
}

export function isHandVisible() {
  return isHandDetected;
}

export function getRacketVelocity() {
  // Calculate velocity based on position change
  const currentPos = playerRacket.position.clone();
  const velocity = currentPos.sub(prevPosition);
  return velocity;
}
