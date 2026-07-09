// ---------- COMBO-BASED BACKGROUND EFFECTS ----------
// Progressive visual effects that intensify with combo level

import * as THREE from 'three';

let scene = null;
let ambientLight = null;
let directionalLight = null;
let gridHelper = null;
let eqBars = null;

// Beat-flash state, layered independently of the combo tint below so the
// scene reacts to the music from the very first beat, not just after hits.
// flashBaseAmbient/Directional snapshot whatever the combo system currently
// has the lights set to at the moment a kick fires, so the flash decays back
// to "wherever combo effects currently have it" instead of fighting them.
let beatFlash = 0; // 0..1, decays each frame
let flashBaseAmbient = 0.3;
let flashBaseDirectional = 0.8;
const BEAT_FLASH_DECAY_PER_SEC = 3;
const BAR_RISE_DECAY_PER_SEC = 4;

// Store original values for reset
const ORIGINAL_FOG_COLOR = new THREE.Color(0x0a0a1a);
const ORIGINAL_BG_COLOR = new THREE.Color(0x0a0a1a);
const ORIGINAL_AMBIENT_INTENSITY = 0.3;
const ORIGINAL_DIR_INTENSITY = 0.8;

// Pulse animation state
let pulseTime = 0;

// Initialize with scene references
export function initBackgroundEffects(sceneRef, ambientLightRef, directionalLightRef, gridHelperRef, eqBarsRef) {
  scene = sceneRef;
  ambientLight = ambientLightRef;
  directionalLight = directionalLightRef;
  gridHelper = gridHelperRef;
  eqBars = eqBarsRef;
}

// Called once per scheduled beat (from audio.js's setupBeatScheduler) — pops
// the grid/lights and a random subset of the EQ-bar skyline, independent of
// combo level, so the background is never static while music is playing.
export function pulseOnBeat({ isKick, isSnare, isHihat }) {
  if (isKick && ambientLight && directionalLight) {
    flashBaseAmbient = ambientLight.intensity;
    flashBaseDirectional = directionalLight.intensity;
    beatFlash = 1;
  }

  if (!eqBars) return;
  const activity = (isKick ? 1 : 0) + (isSnare ? 0.5 : 0) + (isHihat ? 0.25 : 0);
  if (activity === 0) return;

  const popCount = isKick ? 6 : 3;
  const bars = eqBars.children;
  for (let n = 0; n < popCount; n++) {
    const bar = bars[Math.floor(Math.random() * bars.length)];
    const targetHeight = bar.baseHeight * (1.5 + activity * 1.5);
    bar.scale.y = Math.max(bar.scale.y, targetHeight);
    bar.position.y = -2 + bar.scale.y / 2;
  }
}

// Update effects based on current combo
export function updateComboEffects(combo) {
  if (!scene || !ambientLight || !directionalLight) return;

  // Define combo thresholds and their effects
  if (combo === 0) {
    // Reset to normal
    resetEffects();
  } else if (combo < 5) {
    // Level 1: Subtle glow
    setLevel1Effects();
  } else if (combo < 10) {
    // Level 2: Noticeable glow
    setLevel2Effects();
  } else if (combo < 20) {
    // Level 3: Strong glow with pulsing
    setLevel3Effects();
  } else if (combo < 30) {
    // Level 4: Intense glow
    setLevel4Effects();
  } else {
    // Level 5: ULTIMATE MODE
    setLevel5Effects();
  }
}

// Animate pulse effect (call every frame)
export function animateBackgroundEffects(deltaTime) {
  pulseTime += deltaTime;

  if (beatFlash > 0 && ambientLight && directionalLight) {
    beatFlash = Math.max(0, beatFlash - BEAT_FLASH_DECAY_PER_SEC * deltaTime);
    ambientLight.intensity = flashBaseAmbient + beatFlash * 0.3;
    directionalLight.intensity = flashBaseDirectional + beatFlash * 0.5;
  }

  if (eqBars) {
    eqBars.children.forEach((bar) => {
      if (bar.scale.y > bar.baseHeight) {
        bar.scale.y = Math.max(bar.baseHeight, bar.scale.y - BAR_RISE_DECAY_PER_SEC * deltaTime);
        bar.position.y = -2 + bar.scale.y / 2;
      }
    });
  }
}

function resetEffects() {
  scene.background = ORIGINAL_BG_COLOR;
  scene.fog.color = ORIGINAL_FOG_COLOR;
  ambientLight.intensity = ORIGINAL_AMBIENT_INTENSITY;
  directionalLight.intensity = ORIGINAL_DIR_INTENSITY;
  ambientLight.color.setHex(0x4444ff);
  directionalLight.color.setHex(0xff00ff);
}

function setLevel1Effects() {
  // Combo 1-4: Subtle cyan/magenta tint
  const tintColor = new THREE.Color(0x0a0a2a);
  scene.background = tintColor;
  scene.fog.color = tintColor;
  ambientLight.intensity = 0.4;
  directionalLight.intensity = 0.9;
}

function setLevel2Effects() {
  // Combo 5-9: More noticeable glow
  const tintColor = new THREE.Color(0x0a0a3a);
  scene.background = tintColor;
  scene.fog.color = tintColor;
  ambientLight.intensity = 0.5;
  directionalLight.intensity = 1.0;
  ambientLight.color.setHex(0x6666ff);
}

function setLevel3Effects() {
  // Combo 10-19: Strong glow with subtle pulsing
  const baseTint = 0x0a0a4a;
  const pulse = Math.sin(pulseTime * 3) * 0.05 + 1.0; // Subtle pulse

  const tintColor = new THREE.Color(baseTint);
  scene.background = tintColor;
  scene.fog.color = tintColor;

  ambientLight.intensity = 0.6 * pulse;
  directionalLight.intensity = 1.1 * pulse;
  ambientLight.color.setHex(0x8888ff);
  directionalLight.color.setHex(0xff44ff);
}

function setLevel4Effects() {
  // Combo 20-29: Intense glow with stronger pulsing
  const baseTint = 0x0a0a6a;
  const pulse = Math.sin(pulseTime * 4) * 0.1 + 1.0; // More noticeable pulse

  const tintColor = new THREE.Color(baseTint);
  scene.background = tintColor;
  scene.fog.color = tintColor;

  ambientLight.intensity = 0.8 * pulse;
  directionalLight.intensity = 1.3 * pulse;
  ambientLight.color.setHex(0xaaaaff);
  directionalLight.color.setHex(0xff66ff);

  // Grid brightens
  if (gridHelper) {
    gridHelper.material.opacity = 0.8;
  }
}

function setLevel5Effects() {
  // Combo 30+: ULTIMATE MODE - Full intensity
  const baseTint = 0x1a1a8a;
  const pulse = Math.sin(pulseTime * 5) * 0.15 + 1.0; // Strong pulse

  // Alternate between cyan and magenta
  const colorCycle = Math.sin(pulseTime * 2);
  const r = colorCycle > 0 ? 0x1a : 0x4a;
  const g = 0x1a;
  const b = colorCycle < 0 ? 0x1a : 0x8a;
  const cycleColor = new THREE.Color((r << 16) | (g << 8) | b);

  scene.background = cycleColor;
  scene.fog.color = cycleColor;

  ambientLight.intensity = 1.2 * pulse;
  directionalLight.intensity = 1.8 * pulse;

  // Cycle light colors
  if (colorCycle > 0) {
    ambientLight.color.setHex(0x00ffff); // Cyan
    directionalLight.color.setHex(0xff00ff); // Magenta
  } else {
    ambientLight.color.setHex(0xff00ff); // Magenta
    directionalLight.color.setHex(0x00ffff); // Cyan
  }

  // Grid pulses intensely
  if (gridHelper) {
    gridHelper.material.opacity = 0.5 + Math.sin(pulseTime * 5) * 0.3;
  }
}

// Export reset function for use when game resets
export function resetBackgroundEffects() {
  pulseTime = 0;
  beatFlash = 0;
  resetEffects();

  if (eqBars) {
    eqBars.children.forEach((bar) => {
      bar.scale.y = bar.baseHeight;
      bar.position.y = -2 + bar.baseHeight / 2;
    });
  }
}
