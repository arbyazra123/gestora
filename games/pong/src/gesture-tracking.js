/**
 * Hand Gesture Tracking for Pong Special Abilities
 * Counts extended fingers (0-5) per frame from MediaPipe Tasks Vision's
 * HandLandmarker (see vision-tracking.js), and emits a "gesture" event once
 * a count has been held steady for GESTURE_HOLD_MS — debouncing the
 * transition noise as fingers move between counts, and making sure each
 * held pose only fires once, not every frame.
 */

// Non-thumb fingers: extended if the tip sits above (smaller y than) its PIP
// joint — a standard, simple heuristic that works well for an upright hand
// facing the camera.
const FINGER_TIPS = [8, 12, 16, 20]; // index, middle, ring, pinky
const FINGER_PIPS = [6, 10, 14, 18];

// Thumb doesn't fold the same way, so compare its distance from the palm
// base (pinky MCP) at the tip vs the IP joint — handedness-agnostic, unlike
// comparing raw x positions which flips depending on left/right hand.
const THUMB_TIP = 4;
const THUMB_IP = 3;
const PALM_BASE = 17; // pinky MCP

const GESTURE_HOLD_MS = 400; // how long a count must be steady before it registers as a step

let currentCount = null;
let countSince = 0;
let lastRegisteredCount = null; // guards against re-emitting the same held count every frame
let gestureListener = null;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function countExtendedFingers(landmarks) {
  let count = 0;

  for (let i = 0; i < FINGER_TIPS.length; i++) {
    if (landmarks[FINGER_TIPS[i]].y < landmarks[FINGER_PIPS[i]].y) {
      count++;
    }
  }

  const palmBase = landmarks[PALM_BASE];
  const tipDist = dist(landmarks[THUMB_TIP], palmBase);
  const ipDist = dist(landmarks[THUMB_IP], palmBase);
  if (tipDist > ipDist * 1.1) {
    count++;
  }

  return count;
}

export function onGesture(callback) {
  gestureListener = callback;
}

export function handleHandGestureResults(results) {
  if (!results || !results.landmarks || results.landmarks.length === 0) {
    currentCount = null;
    return;
  }

  const landmarks = results.landmarks[0];
  const count = countExtendedFingers(landmarks);
  const now = performance.now();

  if (count !== currentCount) {
    currentCount = count;
    countSince = now;
    lastRegisteredCount = null; // allow this new count to register once held long enough
    return;
  }

  const heldFor = now - countSince;
  if (heldFor >= GESTURE_HOLD_MS && lastRegisteredCount !== count) {
    lastRegisteredCount = count;
    gestureListener?.(count);
  }
}

/**
 * The raw, live finger count this frame (or null if no hand is visible) —
 * distinct from the debounced "registered" count used for ability
 * patterns; this is for showing the player what's currently being read.
 */
export function getCurrentCount() {
  return currentCount;
}

export function resetGestureTracking() {
  currentCount = null;
  countSince = 0;
  lastRegisteredCount = null;
}
