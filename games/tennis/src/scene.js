/**
 * Table Tennis Court Scene Setup
 * Creates the 3D environment with court, net, and lighting
 */

import * as THREE from 'three';

// Scene objects
export let scene, camera, renderer;
export let court, net, playerRacket, botRacket;

// Court dimensions (in meters, scaled for visualization)
const COURT_LENGTH = 23.77;
const COURT_WIDTH = 10.97;
const NET_HEIGHT = 0.4;
const COURT_SCALE = 0.3; // Scale down for better visualization

export function initScene(container) {
  console.log('[Table Tennis] Initializing scene...');

  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Sky blue

  // Create camera
  camera = new THREE.PerspectiveCamera(
    80,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 3, 6);
  camera.lookAt(0, 0.5, 0);

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 5);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -15;
  directionalLight.shadow.camera.right = 15;
  directionalLight.shadow.camera.top = 15;
  directionalLight.shadow.camera.bottom = -15;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);

  // Create the court
  createCourt();

  // Create net
  createNet();

  // Create player racket (controlled by hand tracking)
  createPlayerRacket();

  // Create bot racket
  createBotRacket();

  console.log('[Table Tennis] Scene initialized');
}

function createCourt() {
  // Court surface (green clay-like surface)
  const courtGeometry = new THREE.BoxGeometry(
    COURT_WIDTH * COURT_SCALE,
    0.1,
    COURT_LENGTH * COURT_SCALE
  );
  const courtMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d8b57, // Court green
    roughness: 0.8
  });
  court = new THREE.Mesh(courtGeometry, courtMaterial);
  court.position.y = -0.05;
  court.receiveShadow = true;
  scene.add(court);

  // Court lines (white)
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Baseline (player side)
  const baselineFar = createLine(COURT_WIDTH * COURT_SCALE, 0.02, 0.1);
  baselineFar.position.set(0, 0.01, -COURT_LENGTH * COURT_SCALE / 2);
  scene.add(baselineFar);

  // Baseline (bot side)
  const baselineNear = createLine(COURT_WIDTH * COURT_SCALE, 0.02, 0.1);
  baselineNear.position.set(0, 0.01, COURT_LENGTH * COURT_SCALE / 2);
  scene.add(baselineNear);

  // Side lines
  const sidelineLeft = createLine(0.1, 0.02, COURT_LENGTH * COURT_SCALE);
  sidelineLeft.position.set(-COURT_WIDTH * COURT_SCALE / 2, 0.01, 0);
  scene.add(sidelineLeft);

  const sidelineRight = createLine(0.1, 0.02, COURT_LENGTH * COURT_SCALE);
  sidelineRight.position.set(COURT_WIDTH * COURT_SCALE / 2, 0.01, 0);
  scene.add(sidelineRight);

  // Center service line
  const serviceLine = createLine(COURT_WIDTH * COURT_SCALE * 0.6, 0.02, 0.1);
  serviceLine.position.set(0, 0.01, 0);
  scene.add(serviceLine);
}

function createLine(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  return new THREE.Mesh(geometry, material);
}

function createNet() {
  // Net posts
  const postGeometry = new THREE.CylinderGeometry(0.05, 0.05, NET_HEIGHT * COURT_SCALE * 3, 8);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

  const postLeft = new THREE.Mesh(postGeometry, postMaterial);
  postLeft.position.set(-COURT_WIDTH * COURT_SCALE / 2 - 0.3, NET_HEIGHT * COURT_SCALE * 1.5, 0);
  postLeft.castShadow = true;
  scene.add(postLeft);

  const postRight = new THREE.Mesh(postGeometry, postMaterial);
  postRight.position.set(COURT_WIDTH * COURT_SCALE / 2 + 0.3, NET_HEIGHT * COURT_SCALE * 1.5, 0);
  postRight.castShadow = true;
  scene.add(postRight);

  // Net mesh
  const netWidth = COURT_WIDTH * COURT_SCALE + 0.6;
  const netHeight = NET_HEIGHT * COURT_SCALE * 3;
  const netGeometry = new THREE.PlaneGeometry(netWidth, netHeight, 20, 10);
  const netMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
    wireframe: true
  });

  net = new THREE.Mesh(netGeometry, netMaterial);
  net.position.set(0, netHeight / 2, 0);
  scene.add(net);
}

function createPlayerRacket() {
  playerRacket = new THREE.Group();

  // Racket head (oval shape)
  const headGeometry = new THREE.TorusGeometry(0.4, 0.03, 16, 32);
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b35 }); // Orange
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.rotation.x = Math.PI / 2;
  head.castShadow = true;
  playerRacket.add(head);

  // Racket strings
  const stringsMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    wireframe: true
  });
  const stringsGeometry = new THREE.PlaneGeometry(0.7, 0.7, 10, 10);
  const strings = new THREE.Mesh(stringsGeometry, stringsMaterial);
  strings.rotation.x = Math.PI / 2;
  playerRacket.add(strings);

  // Handle (extends outward from the rim, in the same plane as the head)
  const handleGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.75;
  handle.castShadow = true;
  playerRacket.add(handle);

  // Position racket in player area
  playerRacket.position.set(2, 1, -5);
  playerRacket.rotation.x = -Math.PI / 2;
  scene.add(playerRacket);
}

function createBotRacket() {
  botRacket = new THREE.Group();

  // Racket head (oval shape)
  const headGeometry = new THREE.TorusGeometry(0.4, 0.03, 16, 32);
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0x4169e1 }); // Royal blue
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.rotation.x = Math.PI / 2;
  head.castShadow = true;
  
  botRacket.add(head);

  // Racket strings
  const stringsMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    wireframe: true
  });
  const stringsGeometry = new THREE.PlaneGeometry(0.7, 0.7, 10, 10);
  const strings = new THREE.Mesh(stringsGeometry, stringsMaterial);
  strings.rotation.x = Math.PI / 2;
  botRacket.add(strings);

  // Handle (extends outward from the rim, in the same plane as the head)
  const handleGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.75;
  handle.castShadow = true;
  botRacket.add(handle);

  // Position racket in bot area
  botRacket.position.set(0, 1, 4.5);
  // -PI/2 (radians, not degrees — 180 here was being read as ~233° after
  // wrapping) is the angle where this local geometry's face normal ends up
  // pointing toward -Z (toward the player, correct for the bot) and the
  // handle hangs down toward -Y at the same time — see BOT_BASE_TILT in
  // bot-ai.js, which must match this.
  botRacket.rotation.x = -Math.PI / 2;
  scene.add(botRacket);
}

export function setupWindowResize() {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

export function getCourtBounds() {
  return {
    width: COURT_WIDTH * COURT_SCALE,
    length: COURT_LENGTH * COURT_SCALE,
    minX: -COURT_WIDTH * COURT_SCALE / 2,
    maxX: COURT_WIDTH * COURT_SCALE / 2,
    minZ: -COURT_LENGTH * COURT_SCALE / 2,
    maxZ: COURT_LENGTH * COURT_SCALE / 2
  };
}
