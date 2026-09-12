import * as THREE from 'three';
import { getIsTwoHandMode, getMatchMode, getCoopSide } from './game-logic.js';

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

  // Coop plays 1-handed same as 1-hand mode, just mapped to the assigned
  // side's sword instead of always the right one (see handleHandTrackingResults).
  const isTwoHandMode = getMatchMode() !== 'coop' && getIsTwoHandMode();
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
//
// Pure position/orientation math, shared between the local (smoothed,
// 60fps) tracking path and the opponent ghost-hand (unsmoothed, ~20fps)
// rendering path below.
function computeHandTransform(wrist, middleMcp, indexMcp, pinkyMcp) {
  // Position: use wrist as reference point, normalize to Three.js world space
  // MediaPipe coords: x,y in [0,1] (relative to frame), z relative depth (negative = closer to camera)
  const xMultiplier = isFlipped ? -12 : 12;
  const targetX = (wrist.x - 0.5) * -12;
  const targetY = (wrist.y - 0.6) * -12;
  const targetZ = (wrist.z) * xMultiplier;

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

  return { targetX, targetY, targetZ, quaternion };
}

function mapHandToSword(landmarks, swordGroup, blade, hilt, smoothedPosition, framesSinceRedetection) {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];

  const { targetX, targetY, targetZ, quaternion } = computeHandTransform(wrist, middleMcp, indexMcp, pinkyMcp);

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

  // Smoothing rotation using slerp, same adaptive smoothing as position
  swordGroup.quaternion.slerp(quaternion, 1 - adaptiveSmoothFactor);
}

// ---------- OPPONENT GHOST HAND (multiplayer, cosmetic-only) ----------
// Opponent data arrives throttled (~20fps) via MultiplayerService's
// compressHandData() format: { w, m, i, p } wrist/middle/index/pinky
// [x,y,z] arrays, one entry per detected hand. No smoothing/gap-detection
// is applied here — that's tuned for local 60fps tracking and isn't
// needed for a purely cosmetic opponent indicator.
//
// No world-space offset here (there used to be a +15 one) — the camera
// (see scene.js, ~(0,1,5) at 75° FOV) only ever shows roughly ±4 world
// units of width, so a +15 offset rendered the ghost sword completely
// outside the frustum on every client, every mode ("can't see partner's
// sword at all", reported from real two-laptop testing regardless of
// which hand/side either player used). computeHandTransform() below is
// the exact same formula used for the local sword, so with no added
// offset the ghost sword lands in the same shared coordinate space the
// boxes live in — in coop specifically, that's what makes it appear right
// where the partner's own side's boxes are, instead of nowhere at all.
const ghostHandGroups = [];

function toPoint([x, y, z]) {
  return { x, y, z };
}

function createGhostSwordGroup(scene) {
  const group = new THREE.Group();

  const bladeGeo = new THREE.BoxGeometry(0.08, 2, 0.02);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, transparent: true, opacity: 0.4 });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);

  const hiltGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
  const hiltMat = new THREE.MeshStandardMaterial({ color: 0x884400, transparent: true, opacity: 0.4 });
  const hilt = new THREE.Mesh(hiltGeo, hiltMat);
  hilt.position.y = -1.2;

  group.add(blade, hilt);
  scene.add(group);
  return group;
}

/**
 * Update (creating on first use) ghost sword groups representing the
 * opponent's tracked hand(s).
 * @param {THREE.Scene} scene
 * @param {Array<{w:number[],m:number[],i:number[],p:number[]}>} compressedHands
 */
export function renderGhostHand(scene, compressedHands) {
  if (!Array.isArray(compressedHands)) return;

  compressedHands.forEach((hand, idx) => {
    if (!ghostHandGroups[idx]) {
      ghostHandGroups[idx] = createGhostSwordGroup(scene);
    }
    const group = ghostHandGroups[idx];

    const { targetX, targetY, targetZ, quaternion } = computeHandTransform(
      toPoint(hand.w),
      toPoint(hand.m),
      toPoint(hand.i),
      toPoint(hand.p)
    );

    group.position.set(targetX, targetY, targetZ);
    group.quaternion.copy(quaternion);
  });
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

  const matchMode = getMatchMode();
  const isTwoHandMode = matchMode !== 'coop' && getIsTwoHandMode();

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
        } else if (matchMode === 'coop') {
          // Coop: exactly one hand, mapped to our assigned side's sword —
          // not always the right one, unlike solo 1-hand mode below.
          const useRight = getCoopSide() !== 'left';
          const targetGroup = useRight ? rightSwordGroup : leftSwordGroup;
          const targetBlade = useRight ? rightBlade : leftBlade;
          const targetHilt = useRight ? rightHilt : leftHilt;
          const smoothedPosition = useRight ? rightSmoothedPosition : leftSmoothedPosition;

          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: useRight ? '#00FFFF' : '#FF00FF', lineWidth: 2 });
          drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', radius: 2 });

          if (useRight) {
            rightHandDetected = true;
            if (!wasRightHandDetected) rightFramesSinceRedetection = 0; else rightFramesSinceRedetection++;
            mapHandToSword(landmarks, targetGroup, targetBlade, targetHilt, smoothedPosition, rightFramesSinceRedetection);
          } else {
            leftHandDetected = true;
            if (!wasLeftHandDetected) leftFramesSinceRedetection = 0; else leftFramesSinceRedetection++;
            mapHandToSword(landmarks, targetGroup, targetBlade, targetHilt, smoothedPosition, leftFramesSinceRedetection);
          }

          targetBlade.material.opacity = 1;
          targetHilt.material.opacity = 1;
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
