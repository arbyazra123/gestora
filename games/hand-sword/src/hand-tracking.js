import * as THREE from 'three';
import { getIsTwoHandMode } from './game-logic.js';

// MediaPipe globals from CDN scripts (from platform)
const { HAND_CONNECTIONS } = window;
const { drawConnectors, drawLandmarks } = window;

// References to platform services (set during setup)
let cameraService = null;
let mediaPipeService = null;

// State for smoothing for both hands
let rightSmoothedPosition = { x: 0, y: 0, z: 0 };
let leftSmoothedPosition = { x: 0, y: 0, z: 0 };
const SMOOTHING = 0.3; // 0 = no smoothing, 1 = no movement

// Gap detection & interpolation state for both hands
let wasRightHandDetected = false;
let wasLeftHandDetected = false;
let rightFramesSinceRedetection = 0;
let leftFramesSinceRedetection = 0;
const REDETECTION_SMOOTH_FRAMES = 15; // Smooth for 15 frames after re-detection

// Flip state - toggle to adjust if camera browser is mirrored
let isFlipped = false;

// Lerp helper
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---------- HAND TRACKING MODE ----------
export function updateHandTrackingMode() {
  if (!mediaPipeService) return;

  const isTwoHandMode = getIsTwoHandMode();
  mediaPipeService.setOptions({
    maxNumHands: isTwoHandMode ? 2 : 1, // Track 1 or 2 hands based on mode
    modelComplexity: 0, // Fastest model
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
}

// ---------- FLIP TOGGLE ----------
export function setFlipped(value) {
  isFlipped = value;
}

export function getFlipped() {
  return isFlipped;
}

// ---------- MAPPING: hand landmarks -> sword transform ----------
// Landmark index reference (MediaPipe):
// 0 = wrist, 5 = index_mcp, 9 = middle_mcp, 17 = pinky_mcp
// Use wrist -> middle_mcp as main orientation "sword grip"
function mapHandToSword(landmarks, swordGroup, blade, hilt, smoothedPosition, framesSinceRedetection) {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];

  // Position: use wrist as reference point, normalize to Three.js world space
  // MediaPipe coords: x,y in [0,1] (relative to frame), z relative depth (negative = closer to camera)
  const xMultiplier = isFlipped ? -12 : 12;
  const targetX = (wrist.x - 0.5) * -12;
  const targetY = (wrist.y - 0.6) * -12;
  const targetZ = (wrist.z) * xMultiplier;

  // Adaptive smoothing: extra smooth right after re-detection to prevent teleport
  let adaptiveSmoothFactor = SMOOTHING;
  if (framesSinceRedetection < REDETECTION_SMOOTH_FRAMES) {
    // Interpolate from high smoothing (0.7) down to normal (SMOOTHING)
    const progress = framesSinceRedetection / REDETECTION_SMOOTH_FRAMES;
    adaptiveSmoothFactor = 0.7 + (SMOOTHING - 0.7) * progress;
  }

  smoothedPosition.x = lerp(smoothedPosition.x, targetX, adaptiveSmoothFactor);
  smoothedPosition.y = lerp(smoothedPosition.y, targetY, adaptiveSmoothFactor);
  smoothedPosition.z = lerp(smoothedPosition.z, targetZ, adaptiveSmoothFactor);

  swordGroup.position.set(smoothedPosition.x, smoothedPosition.y, smoothedPosition.z);

  // Orientation: vector from wrist to middle_mcp becomes "sword direction" (Y axis of blade)
  const xFlip = isFlipped ? 1 : -1;
  const dirVector = new THREE.Vector3(
    xFlip * ((middleMcp.x * 1) - wrist.x),
    -(middleMcp.y - wrist.y), // flip y, screen space vs world space different direction
    ((middleMcp.z * 2) - wrist.z)
  ).normalize();

  // Additional vector (index to pinky) to determine "roll" of sword (rotation along blade axis)
  const rollRefVector = new THREE.Vector3(
    xFlip * (pinkyMcp.x - indexMcp.x),
    -(pinkyMcp.y - indexMcp.y),
    -(pinkyMcp.z - indexMcp.z)
  ).normalize();

  // Create quaternion from sword direction (default blade Three.js points to +Y)
  const defaultDir = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDir, dirVector);

  // Smoothing rotation using slerp
  // Use same adaptive smoothing as position
  swordGroup.quaternion.slerp(quaternion, 1 - adaptiveSmoothFactor);
}

// Sword references (set during setup)
let rightSwordGroup, rightBlade, rightHilt, leftSwordGroup, leftBlade, leftHilt;

// ---------- SETUP HAND TRACKING ----------
export function setupHandTracking(
  _rightSwordGroup, _rightBlade, _rightHilt,
  _leftSwordGroup, _leftBlade, _leftHilt,
  _cameraService, _mediaPipeService
) {
  // Store references
  rightSwordGroup = _rightSwordGroup;
  rightBlade = _rightBlade;
  rightHilt = _rightHilt;
  leftSwordGroup = _leftSwordGroup;
  leftBlade = _leftBlade;
  leftHilt = _leftHilt;
  cameraService = _cameraService;
  mediaPipeService = _mediaPipeService;

  // Set initial hand tracking mode
  updateHandTrackingMode();
}

// ---------- RESULTS HANDLER ----------
export function handleHandTrackingResults(results) {
  // Get canvas context for drawing hand visualization
  const canvasElement = cameraService?.getCanvasElement();
  const canvasCtx = cameraService?.getCanvasContext();

  if (!canvasCtx || !canvasElement) return;

  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  let rightHandDetected = false;
  let leftHandDetected = false;

  const isTwoHandMode = getIsTwoHandMode();

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      // Process each detected hand
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];

        if (isTwoHandMode) {
          // 2-hand mode: determine left/right based on x position
          const wristX = landmarks[0].x;
          const isRightSide = wristX > 0.5;

          // Draw hand tracking
          const color = isRightSide ? '#00FFFF' : '#FF00FF';
          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: color, lineWidth: 2 });
          drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', radius: 2 });

          if (isRightSide) {
            rightHandDetected = true;

            // Detect gap for right hand
            if (!wasRightHandDetected) {
              rightFramesSinceRedetection = 0;
            } else {
              rightFramesSinceRedetection++;
            }

            mapHandToSword(landmarks, rightSwordGroup, rightBlade, rightHilt, rightSmoothedPosition, rightFramesSinceRedetection);

            // Fade sword in
            rightBlade.material.opacity = 1;
            rightHilt.material.opacity = 1;
          } else {
            leftHandDetected = true;

            // Detect gap for left hand
            if (!wasLeftHandDetected) {
              leftFramesSinceRedetection = 0;
            } else {
              leftFramesSinceRedetection++;
            }

            mapHandToSword(landmarks, leftSwordGroup, leftBlade, leftHilt, leftSmoothedPosition, leftFramesSinceRedetection);

            // Fade sword in
            leftBlade.material.opacity = 1;
            leftHilt.material.opacity = 1;
          }
        } else {
          // 1-hand mode: always use right sword (cyan), accept any hand
          rightHandDetected = true;

          // Draw hand tracking (cyan color)
          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FFFF', lineWidth: 2 });
          drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', radius: 2 });

          // Detect gap
          if (!wasRightHandDetected) {
            rightFramesSinceRedetection = 0;
          } else {
            rightFramesSinceRedetection++;
          }

          mapHandToSword(landmarks, rightSwordGroup, rightBlade, rightHilt, rightSmoothedPosition, rightFramesSinceRedetection);

          // Fade sword in
          rightBlade.material.opacity = 1;
          rightHilt.material.opacity = 1;
        }
      }

    // Status logging (optional)
    if (isTwoHandMode) {
      console.log(`[Hand Tracking] ${rightHandDetected ? 'R' : ''} ${leftHandDetected ? 'L' : ''}`);
    }
  } else {
    console.log('[Hand Tracking] No hands detected');
  }

  // Fade out swords that aren't detected
  if (rightBlade && rightHilt) {
    if (!rightHandDetected) {
      rightBlade.material.opacity = 0.3;
      rightHilt.material.opacity = 0.3;
    }
  }

  if (leftBlade && leftHilt) {
    if (!leftHandDetected) {
      leftBlade.material.opacity = 0.3;
      leftHilt.material.opacity = 0.3;
    }
  }

  wasRightHandDetected = rightHandDetected;
  wasLeftHandDetected = leftHandDetected;
  canvasCtx.restore();
}
