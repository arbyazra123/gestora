import * as THREE from 'three';
import * as Tone from 'tone';
import { playHitSound, playComboBreakSound } from './audio.js';
import { recordHit, recordMiss } from './health-meter.js';
import { updateComboEffects } from './background-effects.js';
import { camera } from './scene.js';

// ---------- GAME STATE ----------
export let score = 0;
export let combo = 0;
export let maxCombo = 0;
export let hits = 0;
export let misses = 0;
export let isTwoHandMode = true; // Default to 2-hand mode

// ---------- MULTIPLAYER MATCH MODE ----------
// 'solo' outside multiplayer; 'versus' or 'coop' once a Match locks in a mode
// (see index.js's handleMatchStateChange). Coop restricts each client to its
// assigned side (see checkCollision/updateBoxes below) and plays 1-handed.
export let matchMode = 'solo';
export let coopSide = null; // 'left' | 'right' | null

// Tiny seeded PRNG (mulberry32) so both coop clients draw the exact same
// sequence of box sides — box spawn *timing* is already fully deterministic
// from bpm/difficulty/theme/beat count (see audio.js's setupBeatScheduler),
// so this one synced seed is enough for a genuinely shared board without
// the server owning box state (HandSwordRoom stays a Relay Room).
let coopRng = null;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getMatchMode() {
  return matchMode;
}

export function setMatchMode(value) {
  matchMode = value;
}

export function getCoopSide() {
  return coopSide;
}

export function setCoopSide(value) {
  coopSide = value;
}

export function setCoopSeed(seed) {
  coopRng = mulberry32(seed);
}

// UI elements - lazy initialized
let scoreElement = null;
let comboElement = null;
let comboDisplay = null;
let hitsElement = null;
let missesElement = null;

// Helper to get UI elements (lazy initialization)
function getUIElements() {
  if (!scoreElement) {
    scoreElement = document.getElementById('score-display');
    comboElement = document.getElementById('combo');
    comboDisplay = document.getElementById('combo-display');
    hitsElement = document.getElementById('hits-display');
    missesElement = document.getElementById('misses-display');
  }
  return { scoreElement, comboElement, comboDisplay, hitsElement, missesElement };
}

// ---------- BOXES (cubes) ----------
export const boxes = [];
const boxGeometry = new THREE.BoxGeometry(1, 1, 1); // Cube/box

// Box travel timing - should arrive in exact number of beats
export const SPAWN_Z = -30; // How far away boxes spawn
export const TARGET_Z = 0; // Where boxes should be hit
export const MISS_Z = 3; // If box passes this, it's a miss
export const ARRIVAL_BEATS = 4; // Boxes should take exactly 4 beats to arrive (1 measure)

// Pre-allocate bounding boxes to avoid creating new ones every frame
export const rightBladeBoundingBox = new THREE.Box3();
export const leftBladeBoundingBox = new THREE.Box3();
const boxBoundingBox = new THREE.Box3();

// Getters for state
export function getIsTwoHandMode() {
  return isTwoHandMode;
}

// Setters for state
export function setTwoHandMode(value) {
  isTwoHandMode = value;
}

// ---------- BOX CREATION ----------
export function createBox(scene, currentBPM, melodyFreq = null) {
  const colors = [0xff0088, 0x00ffff, 0xff00ff, 0x00ff88];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const material = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.5,
    metalness: 0.2,
    roughness: 0.3
  });

  const box = new THREE.Mesh(boxGeometry, material);

  // Visible half-width at the hit plane (TARGET_Z), derived from the
  // camera's actual aspect ratio. On narrow mobile/portrait screens the
  // horizontal FOV is much smaller than desktop, so the fixed world-unit
  // ranges below scale down to stay on-screen instead of spawning boxes
  // past the edge of view.
  const distanceToTarget = camera.position.z - TARGET_Z;
  const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * distanceToTarget;

  // Starting position - different patterns based on mode
  if (matchMode === 'coop') {
    // Coop: shared board — side and x-offset are drawn from the seeded
    // PRNG (not Math.random()) so both clients agree on which side (and
    // therefore which player is responsible) each box belongs to. Y/
    // rotation stay per-client Math.random() — purely cosmetic, no
    // gameplay reason to sync those.
    const rand = coopRng || Math.random;
    box.side = rand() > 0.5 ? 'right' : 'left';
    const side = box.side === 'right' ? 1 : -1;
    const minOffset = Math.min(halfWidth * 0.4, 2);
    const maxOffset = Math.min(halfWidth * 0.8, 4);
    box.position.x = side * (minOffset + rand() * (maxOffset - minOffset));
  } else if (isTwoHandMode) {
    // 2-hand mode: spawn on left or right (requires both hands)
    const side = Math.random() > 0.5 ? 1 : -1;
    box.side = side === 1 ? 'right' : 'left';
    const minOffset = Math.min(halfWidth * 0.4, 2);
    const maxOffset = Math.min(halfWidth * 0.8, 4);
    box.position.x = side * (minOffset + Math.random() * (maxOffset - minOffset)); // capped at 2-4 units on wide screens, scaled down on narrow ones
  } else {
    // 1-hand mode: spawn near center (easier)
    box.side = null;
    const maxOffset = Math.min(halfWidth * 0.6, 1.5);
    box.position.x = (Math.random() - 0.5) * 2 * maxOffset; // capped at -1.5 to 1.5 on wide screens, scaled down on narrow ones
  }
  box.position.y = Math.random() * 4 - 1;

  // Store timing info for time-based animation
  const beatInterval = 60 / currentBPM;
  box.spawnTime = Tone.now(); // Exact time spawned
  box.arrivalTime = box.spawnTime + (ARRIVAL_BEATS * beatInterval); // Exact time should arrive
  box.startZ = SPAWN_Z;
  box.targetZ = TARGET_Z;

  // Set for boxes spawned from a riffed track's melody grid — carries the
  // exact note this box should sound when hit (see destroyBox below).
  box.melodyFreq = melodyFreq;

  // Initialize position
  box.position.z = SPAWN_Z;

  // No rotation — box stays face-on to the player for the whole flight
  // instead of tumbling, so its approach is easier to read.

  scene.add(box);
  boxes.push(box);
}

// ---------- SCORE & COMBO SYSTEM ----------
function updateScore(points) {
  score += points;
  const { scoreElement } = getUIElements();
  if (scoreElement) {
    scoreElement.textContent = score;
  }
}

function updateComboDisplay() {
  const { comboElement, comboDisplay } = getUIElements();

  if (comboElement) {
    comboElement.textContent = combo;
  }

  if (comboDisplay) {
    if (combo > 0) {
      comboDisplay.textContent = `Combo: ${combo}x`;
      comboDisplay.style.display = 'block';
      // Trigger animation
      comboDisplay.style.animation = 'none';
      setTimeout(() => {
        comboDisplay.style.animation = '';
      }, 10);
    } else {
      comboDisplay.textContent = 'Combo: 0x';
    }
  }
}

function updateHitMissDisplay() {
  const { hitsElement, missesElement } = getUIElements();
  if (hitsElement) hitsElement.textContent = hits;
  if (missesElement) missesElement.textContent = misses;
}

function increaseCombo() {
  combo++;
  if (combo > maxCombo) {
    maxCombo = combo;
  }
  updateComboDisplay();
  updateComboEffects(combo); // Update background effects
}

export function resetCombo() {
  playComboBreakSound();
  combo = 0;
  updateComboDisplay();
  updateComboEffects(combo); // Reset background effects
}

export function resetScore() {
  score = 0;
  combo = 0;
  hits = 0;
  misses = 0;
  const { scoreElement } = getUIElements();
  if (scoreElement) {
    scoreElement.textContent = score;
  }
  updateComboDisplay();
  updateHitMissDisplay();
}

// ---------- COLLISION DETECTION ----------
export function checkCollision(box, rightBladeBounds, leftBladeBounds) {
  // Use pre-calculated sword bounds from animate loop
  boxBoundingBox.setFromObject(box);

  if (matchMode === 'coop') {
    // Coop: the partner's side is visible (shared board) but not ours to
    // hit — only test our own assigned-side blade against our own boxes.
    if (box.side !== coopSide) return false;
    return coopSide === 'right'
      ? rightBladeBounds.intersectsBox(boxBoundingBox)
      : leftBladeBounds.intersectsBox(boxBoundingBox);
  }

  // In 1-hand mode, only check right sword
  if (!isTwoHandMode) {
    return rightBladeBounds.intersectsBox(boxBoundingBox);
  }

  // In 2-hand mode, check both swords
  return rightBladeBounds.intersectsBox(boxBoundingBox) || leftBladeBounds.intersectsBox(boxBoundingBox);
}

// ---------- EXPLOSION EFFECT ----------
function createExplosion(scene, position, color) {
  // Create particle explosion effect
  const particleCount = 8; // Reduced for performance
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    const particleGeo = new THREE.SphereGeometry(0.1, 4, 4);
    const particleMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1
    });
    const particle = new THREE.Mesh(particleGeo, particleMat);

    particle.position.copy(position);

    // Random velocity
    particle.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3
    );

    scene.add(particle);
    particles.push(particle);

    // Animate and remove after short time
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > 500) {
        scene.remove(particle);
        return;
      }

      particle.position.add(particle.velocity);
      particle.material.opacity = 1 - (elapsed / 500);
      requestAnimationFrame(animate);
    };
    animate();
  }
}

export function destroyBox(scene, box, index) {
  // Create explosion at box position
  createExplosion(scene, box.position.clone(), box.material.color);

  // Increase combo first (before playing sound, so pitch uses new combo value)
  increaseCombo();

  // Record hit for health meter
  recordHit();
  hits++;
  updateHitMissDisplay();

  // Play hit sound — this box's own riff note if it has one, otherwise
  // the default combo-pitched chord hit
  playHitSound(box.melodyFreq);

  // Remove box immediately
  scene.remove(box);
  boxes.splice(index, 1);

  // Score increases with combo multiplier
  updateScore(10 + combo);
}

// ---------- BOX UPDATE ----------
export function updateBoxes(scene) {
  const currentTime = Tone.now();

  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];

    // Calculate position based on exact time (not frame-based)
    const elapsed = currentTime - box.spawnTime;
    const duration = box.arrivalTime - box.spawnTime;
    const progress = Math.min(elapsed / duration, 1.5); // Allow slight overshoot

    // Lerp from start to target based on time progress
    box.position.z = box.startZ + (box.targetZ - box.startZ) * progress;

    // Remove if passed camera (MISS - reset combo)
    if (box.position.z > MISS_Z) {
      // Coop: a box on the partner's side isn't ours to answer for — it's
      // still removed here (each client independently runs the full,
      // identically-seeded board), but doesn't touch our own combo/health/
      // miss count. The partner's own client independently records it.
      if (matchMode !== 'coop' || box.side === coopSide) {
        resetCombo(); // Break combo on miss
        recordMiss(); // Record miss for health meter
        misses++;
        updateHitMissDisplay();
      }
      scene.remove(box);
      boxes.splice(i, 1);
    }
  }
}

// ---------- GAME RESET ----------
export function clearAllBoxes(scene) {
  boxes.forEach(box => scene.remove(box));
  boxes.length = 0;
}
