/**
 * Pong Playfield Scene Setup
 * Flat 3D playfield: paddles only ever translate along X, never rotate.
 */

import * as THREE from 'three';

// Scene objects
export let scene, camera, renderer;
export let playfield, playerPaddle, botPaddle;

// Playfield dimensions (world units)
export const FIELD_WIDTH = 7; // x-axis: left/right bounce walls
export const FIELD_LENGTH = 10; // z-axis: player <-> bot
export const PADDLE_WIDTH = 1.2;
export const PADDLE_HEIGHT = 0.4;
export const PADDLE_DEPTH = 0.2;
export const PADDLE_Y = 0.3; // fixed height, paddles never move vertically
const PADDLE_Z_OFFSET = FIELD_LENGTH / 2 - 0.3; // paddles sit just inside the back line

export function initScene(container) {
  console.log('[Pong] Initializing scene...');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // Sky blue

  camera = new THREE.PerspectiveCamera(
    100,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 7, 6);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
  directionalLight.position.set(5, 10, 5);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -10;
  directionalLight.shadow.camera.right = 10;
  directionalLight.shadow.camera.top = 10;
  directionalLight.shadow.camera.bottom = -10;
  scene.add(directionalLight);

  createPlayfield();
  createWalls();
  createPlayerPaddle();
  createBotPaddle();

  console.log('[Pong] Scene initialized');
}

function createPlayfield() {
  const fieldGeometry = new THREE.BoxGeometry(FIELD_WIDTH, 0.1, FIELD_LENGTH);
  const fieldMaterial = new THREE.MeshStandardMaterial({
    color: 0x0f3460,
    roughness: 0.7
  });
  playfield = new THREE.Mesh(fieldGeometry, fieldMaterial);
  playfield.position.y = -0.05;
  playfield.receiveShadow = true;
  scene.add(playfield);

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Center line (dividing player/bot halves)
  const centerLine = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_WIDTH, 0.02, 0.08),
    lineMaterial
  );
  centerLine.position.set(0, 0.01, 0);
  scene.add(centerLine);

  // Back lines (behind each paddle — crossing this is a miss)
  const backLineFar = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_WIDTH, 0.02, 0.08),
    lineMaterial
  );
  backLineFar.position.set(0, 0.01, -FIELD_LENGTH / 2);
  scene.add(backLineFar);

  const backLineNear = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_WIDTH, 0.02, 0.08),
    lineMaterial
  );
  backLineNear.position.set(0, 0.01, FIELD_LENGTH / 2);
  scene.add(backLineNear);
}

function createWalls() {
  const wallGeometry = new THREE.BoxGeometry(0.15, 0.4, FIELD_LENGTH);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });

  const wallLeft = new THREE.Mesh(wallGeometry, wallMaterial);
  wallLeft.position.set(-FIELD_WIDTH / 2, 0.15, 0);
  wallLeft.castShadow = true;
  scene.add(wallLeft);

  const wallRight = new THREE.Mesh(wallGeometry, wallMaterial);
  wallRight.position.set(FIELD_WIDTH / 2, 0.15, 0);
  wallRight.castShadow = true;
  scene.add(wallRight);
}

function createPaddle(color) {
  const geometry = new THREE.BoxGeometry(PADDLE_WIDTH, PADDLE_HEIGHT, PADDLE_DEPTH);
  const material = new THREE.MeshStandardMaterial({ color });
  const paddle = new THREE.Mesh(geometry, material);
  paddle.castShadow = true;
  return paddle;
}

function createPlayerPaddle() {
  playerPaddle = createPaddle(0xff6b35); // Orange
  playerPaddle.position.set(0, PADDLE_Y, PADDLE_Z_OFFSET);
  scene.add(playerPaddle);
}

function createBotPaddle() {
  botPaddle = createPaddle(0x4169e1); // Royal blue
  botPaddle.position.set(0, PADDLE_Y, -PADDLE_Z_OFFSET);
  scene.add(botPaddle);
}

export function setupWindowResize() {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

export function getFieldBounds() {
  return {
    minX: -FIELD_WIDTH / 2,
    maxX: FIELD_WIDTH / 2,
    minZ: -FIELD_LENGTH / 2,
    maxZ: FIELD_LENGTH / 2,
    paddleZOffset: PADDLE_Z_OFFSET
  };
}
