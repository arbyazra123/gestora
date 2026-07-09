import * as THREE from 'three';
import * as Tone from 'tone';
import { playHitSound, playComboBreakSound, updateBPM, DIFFICULTY_PRESETS } from './audio.js';
import { recordHit, recordMiss } from './health-meter.js';
import { updateComboEffects } from './background-effects.js';

// ---------- GAME STATE ----------
export let score = 0;
export let combo = 0;
export let maxCombo = 0;
export let isTwoHandMode = true; // Default to 2-hand mode
export let currentDifficulty = 'medium'; // easy, medium, hard

// UI elements - lazy initialized
let scoreElement = null;
let comboElement = null;
let comboDisplay = null;

// Helper to get UI elements (lazy initialization)
function getUIElements() {
  if (!scoreElement) {
    scoreElement = document.getElementById('score-display');
    comboElement = document.getElementById('combo');
    comboDisplay = document.getElementById('combo-display');
  }
  return { scoreElement, comboElement, comboDisplay };
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
export function getCurrentDifficulty() {
  return currentDifficulty;
}

export function getIsTwoHandMode() {
  return isTwoHandMode;
}

// Setters for state
export function setTwoHandMode(value) {
  isTwoHandMode = value;
}

export function setDifficulty(value) {
  currentDifficulty = value;
  updateBPM(DIFFICULTY_PRESETS[value].bpm);
}

// ---------- BOX CREATION ----------
export function createBox(scene, currentBPM) {
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

  // Starting position - different patterns based on mode
  if (isTwoHandMode) {
    // 2-hand mode: spawn on left or right (requires both hands)
    const side = Math.random() > 0.5 ? 1 : -1;
    box.position.x = side * (2 + Math.random() * 2); // 2-4 units from center
  } else {
    // 1-hand mode: spawn near center (easier)
    box.position.x = (Math.random() - 0.5) * 3; // -1.5 to 1.5 from center
  }
  box.position.y = Math.random() * 4 - 1;

  // Store timing info for time-based animation
  const beatInterval = 60 / currentBPM;
  box.spawnTime = Tone.now(); // Exact time spawned
  box.arrivalTime = box.spawnTime + (ARRIVAL_BEATS * beatInterval); // Exact time should arrive
  box.startZ = SPAWN_Z;
  box.targetZ = TARGET_Z;

  // Initialize position
  box.position.z = SPAWN_Z;

  // Add random rotation for visual variety
  box.rotation.set(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    Math.random() * Math.PI
  );

  // Store rotation speed for animation
  box.rotationSpeed = {
    x: (Math.random() - 0.5) * 0.02,
    y: (Math.random() - 0.5) * 0.02,
    z: (Math.random() - 0.5) * 0.02
  };

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
  const { scoreElement } = getUIElements();
  if (scoreElement) {
    scoreElement.textContent = score;
  }
  updateComboDisplay();
}

// ---------- COLLISION DETECTION ----------
export function checkCollision(box, rightBladeBounds, leftBladeBounds) {
  // Use pre-calculated sword bounds from animate loop
  boxBoundingBox.setFromObject(box);

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

  // Play hit sound with combo pitch
  playHitSound();

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

    // Rotate box for visual effect
    if (box.rotationSpeed) {
      box.rotation.x += box.rotationSpeed.x;
      box.rotation.y += box.rotationSpeed.y;
      box.rotation.z += box.rotationSpeed.z;
    }

    // Remove if passed camera (MISS - reset combo)
    if (box.position.z > MISS_Z) {
      resetCombo(); // Break combo on miss
      recordMiss(); // Record miss for health meter
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
