/**
 * In-scene 3D score display: two small standee-style signs mounted beside
 * the court's left sideline, each showing one side's current point score
 * (0/15/30/40/AD/Deuce) as a canvas-texture label. Mirrors games/pong/src/
 * score-display.js's approach — being real 3D objects (not a DOM/CSS
 * overlay), they automatically pick up the correct perspective skew from
 * the camera's actual viewing angle, and never need repositioning on resize.
 *
 * Unlike pong's plain digit score, a tennis point label can be a longer
 * string ("Deuce"), so the label text is auto-shrunk to fit instead of
 * using one fixed font size.
 */

import * as THREE from 'three';
import { getCourtBounds } from './scene.js';

const SIGN_WIDTH = 0.8;
const SIGN_HEIGHT = 0.8;
const SIGN_Y = -0.05; // lifted above the court surface, like a small standee
const SIGN_LEAN = 0; // radians, "roll" around the sign's own face — see createSign()

let botSign;
let playerSign;

function fitFontSize(ctx, text, maxWidth, maxSize) {
  let size = maxSize;
  ctx.font = `bold ${size}px -apple-system, BlinkMacSystemFont, sans-serif`;
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `bold ${size}px -apple-system, BlinkMacSystemFont, sans-serif`;
  }
  return size;
}

function drawLabel(canvas, value) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

  const text = value === '' || value == null ? '-' : String(value);
  ctx.fillStyle = '#fff';
  const size = fitFontSize(ctx, text, canvas.width - 24, 76);
  ctx.font = `bold ${size}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
}

function createSign(x, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  drawLabel(canvas, 0);

  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_HEIGHT);
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, SIGN_Y, z);
  mesh.rotation.y = Math.PI / 2; // face toward the court/camera side (+X)
  mesh.rotateX(-0.45);
  mesh.castShadow = true; // casts onto the court (playfield already has receiveShadow), makes its floating height/position readable
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
  const bounds = getCourtBounds();
  const signX = bounds.minX - 0.5; // just outside the left sideline, clear of the net posts

  // z<0 is the "Near"/player side, z>0 is "Far"/bot — matches
  // scene.js's playerRacket/botRacket placement and physics.js's court
  // bounds convention.
  playerSign = createSign(signX, -1.5);
  botSign = createSign(signX, 2);
  scene.add(botSign.mesh);
  scene.add(playerSign.mesh);
}

export function updateScoreDisplay(playerScore, botScore) {
  drawLabel(botSign.canvas, botScore);
  botSign.texture.needsUpdate = true;

  drawLabel(playerSign.canvas, playerScore);
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
