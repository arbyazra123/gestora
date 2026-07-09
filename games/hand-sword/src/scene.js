import * as THREE from 'three';

// ---------- THREE.JS SCENE SETUP ----------
// Scene is created as a function to accept container from platform
export let scene = null;
export let camera = null;
export let renderer = null;
export let ambientLight = null;
export let directionalLight = null;
export let gridHelper = null;
export let eqBars = null;
export let rightSwordGroup = null;
export let rightBlade = null;
export let rightHilt = null;
export let leftSwordGroup = null;
export let leftBlade = null;
export let leftHilt = null;

/**
 * Initialize scene with provided container
 */
export function initScene(container) {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);
  scene.fog = new THREE.Fog(0x0a0a1a, 10, 50);

  // Create camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1, 5);

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Append to provided container
  container.appendChild(renderer.domElement);

  // Lighting - neon style
  ambientLight = new THREE.AmbientLight(0x4444ff, 0.3);
  scene.add(ambientLight);
  directionalLight = new THREE.DirectionalLight(0xff00ff, 0.8);
  directionalLight.position.set(2, 4, 3);
  scene.add(directionalLight);

  // Grid floor - futuristic
  gridHelper = new THREE.GridHelper(100, 100, 0x00ffff, 0x0088ff);
  gridHelper.position.y = -2;
  scene.add(gridHelper);

  // Background stars/particles
  const starGeometry = new THREE.BufferGeometry();
  const starVertices = [];
  for (let i = 0; i < 1000; i++) {
    const x = (Math.random() - 0.5) * 200;
    const y = (Math.random() - 0.5) * 200;
    const z = -Math.random() * 100 - 10;
    starVertices.push(x, y, z);
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0x88ccff,
    size: 0.3,
    transparent: true,
    opacity: 0.8
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  // Background EQ-bar skyline — pulsed per-beat in background-effects.js so
  // the scene feels alive even before the player lands any hits (combo 0).
  eqBars = new THREE.Group();
  const barCount = 20;
  const barGeometry = new THREE.BoxGeometry(0.6, 1, 0.6);
  for (let i = 0; i < barCount; i++) {
    const isEven = i % 2 === 0;
    const color = isEven ? 0x00ffff : 0xff00ff;
    const barMaterial = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4,
      transparent: true,
      opacity: 0.85
    });
    const bar = new THREE.Mesh(barGeometry, barMaterial);
    const spread = (i - (barCount - 1) / 2) / barCount; // -0.5..0.5 across the skyline
    bar.position.set(spread * 40, -1.5, -25 + Math.abs(spread) * -10);
    bar.baseHeight = 1 + Math.random() * 2;
    bar.scale.y = bar.baseHeight;
    bar.position.y = -2 + bar.baseHeight / 2;
    eqBars.add(bar);
  }
  scene.add(eqBars);

  // ---------- SWORD CREATION ----------
  // Right hand sword - cyan (pivot at hilt base)
  rightSwordGroup = new THREE.Group();

  const rightBladeGeo = new THREE.BoxGeometry(0.08, 2, 0.02);
  const rightBladeMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 0.8,
    metalness: 0.9,
    roughness: 0.1,
    transparent: true,
    opacity: 1
  });
  rightBlade = new THREE.Mesh(rightBladeGeo, rightBladeMat);
  rightBlade.position.y = 1.2; // Move up so pivot is at hilt base
  rightSwordGroup.add(rightBlade);

  const rightHiltGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
  const rightHiltMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    emissive: 0xff00ff,
    emissiveIntensity: 0.3,
    metalness: 0.8,
    roughness: 0.2,
    transparent: true,
    opacity: 1
  });
  rightHilt = new THREE.Mesh(rightHiltGeo, rightHiltMat);
  rightHilt.position.y = 0; // Hilt at origin (pivot point)
  rightSwordGroup.add(rightHilt);

  scene.add(rightSwordGroup);

  // Left hand sword - magenta (pivot at hilt base)
  leftSwordGroup = new THREE.Group();

  const leftBladeGeo = new THREE.BoxGeometry(0.08, 2, 0.02);
  const leftBladeMat = new THREE.MeshStandardMaterial({
    color: 0xff00ff,
    emissive: 0xff00ff,
    emissiveIntensity: 0.8,
    metalness: 0.9,
    roughness: 0.1,
    transparent: true,
    opacity: 1
  });
  leftBlade = new THREE.Mesh(leftBladeGeo, leftBladeMat);
  leftBlade.position.y = 1.2; // Move up so pivot is at hilt base
  leftSwordGroup.add(leftBlade);

  const leftHiltGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
  const leftHiltMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    emissive: 0x00ffff,
    emissiveIntensity: 0.3,
    metalness: 0.8,
    roughness: 0.2,
    transparent: true,
    opacity: 1
  });
  leftHilt = new THREE.Mesh(leftHiltGeo, leftHiltMat);
  leftHilt.position.y = 0; // Hilt at origin (pivot point)
  leftSwordGroup.add(leftHilt);

  scene.add(leftSwordGroup);
}

// Window resize handler
export function setupWindowResize() {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
