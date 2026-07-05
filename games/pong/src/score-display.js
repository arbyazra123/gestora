/**
 * In-scene 3D score display: two small standee-style signs mounted beside
 * the table's left edge, each showing one side's score as a canvas-texture
 * digit. Being real 3D objects (not a DOM/CSS overlay), they automatically
 * pick up the correct perspective skew from the camera's actual viewing
 * angle — no hand-computed position/rotation math needed to fake a "lying
 * flat"/"leaning" look, and they never need repositioning on resize.
 */

import * as THREE from 'three';
import { FIELD_WIDTH } from './scene.js';

const SIGN_WIDTH = 0.8;
const SIGN_HEIGHT = 0.8;
const SIGN_X = -FIELD_WIDTH / 2 - 0.6; // just outside the table's left edge
const SIGN_Y = 1; // lifted above the table surface, like a small standee
const SIGN_LEAN = 0; // radians, "roll" around the sign's own face — see createSign()

let botSign;
let playerSign;

function drawDigit(canvas, value) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 76px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(1), canvas.width / 2, canvas.height / 2 + 6);
}

function createSign(z) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  drawDigit(canvas, 0);

  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(SIGN_X, SIGN_Y, z);
  mesh.rotation.y = Math.PI / 2; // face toward the table/camera side (+X)
  mesh.rotateX(-0.4)
  mesh.castShadow = true; // casts onto the table (playfield already has receiveShadow), makes its floating height/position readable
  mesh.receiveShadow = true;

  // Setting mesh.rotation.z here instead wouldn't work how you'd expect:
  // assigning .rotation.x/y/z redefines the whole orientation at once, via
  // a fixed-order (Rx·Ry·Rz) composition around the ORIGINAL world axes —
  // it doesn't "add a roll on top of" the Y rotation above, it recomposes
  // with it, which stops looking like a simple lean once rotation.y is a
  // big angle like this. rotateZ() is an incremental rotation around the
  // mesh's CURRENT local Z axis (its own face-normal, regardless of which
  // way that normal currently points in world space), which is exactly the
  // "roll the sign like a clock face" effect we want here.
  mesh.rotateZ(SIGN_LEAN);

  return { mesh, canvas, texture };
}

export function createScoreDisplay(scene) {
  botSign = createSign(-1);
  playerSign = createSign(1);
  scene.add(botSign.mesh);
  scene.add(playerSign.mesh);
}

export function updateScoreDisplay(playerScore, botScore) {
  drawDigit(botSign.canvas, botScore);
  botSign.texture.needsUpdate = true;

  drawDigit(playerSign.canvas, playerScore);
  playerSign.texture.needsUpdate = true;
}

export function disposeScoreDisplay() {
  for (const sign of [botSign, playerSign]) {
    if (!sign) continue;
    sign.mesh.geometry.dispose();
    sign.mesh.material.dispose();
    sign.texture.dispose();
  }
}
