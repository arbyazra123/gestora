/**
 * Pong Ball Physics
 * Flat 2D-in-3D motion: constant height, no gravity. Bounces off the side
 * walls (x) and paddles (z); only exits play by passing a paddle's back line.
 */

import * as THREE from 'three';
import { PADDLE_Y, PADDLE_WIDTH } from './scene.js';
import { playPaddleHit, playWallBounce } from './audio.js';

export let ball;
let scene;

const BALL_RADIUS = 0.12;
const INITIAL_SPEED = 3.4;
const MAX_SPEED = 20;
const SPEED_GROWTH = 1.05; // per paddle hit
const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60 degrees, classic pong paddle-angle feel

export const ballState = {
  velocity: new THREE.Vector3(0, 0, 0),
  isActive: false,
  lastHitBy: null, // 'player' or 'bot'
  // Where the ball was before this frame's movement — updateBall() below
  // refreshes this every frame it actually moves the ball (and
  // index.js's handleMatchStateChange() does the same in multiplayer,
  // where updateBall() is never called locally). Paddle collision checks
  // (game-logic.js) sweep the ball's box from here to its current position
  // instead of only testing the single post-move point, so a fast ball
  // can't skip clean over a paddle within one frame ("ball goes through
  // the paddle" — reported from real multiplayer testing, worse at
  // MAX_SPEED / low framerate where a single frame's movement can exceed
  // the paddle's own depth).
  previousPosition: new THREE.Vector3(0, PADDLE_Y, 0)
};

export function createBall(sceneRef) {
  scene = sceneRef;

  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
  const material = new THREE.MeshStandardMaterial({
    color: 0xccff00,
    roughness: 0.5,
    metalness: 0.1
  });

  ball = new THREE.Mesh(geometry, material);
  ball.castShadow = true;

  resetBall();
  scene.add(ball);
  console.log('[Pong] Ball created');
}

export function resetBall() {
  ball.position.set(0, PADDLE_Y, 0);
  ballState.velocity.set(0, 0, 0);
  ballState.isActive = false;
  ballState.lastHitBy = null;
  ballState.previousPosition.copy(ball.position);
}

/**
 * Serve towards the opponent of whoever is serving.
 * Player sits at +z, bot at -z, so a player serve moves in -z and vice versa.
 */
export function serveBall(server = 'player') {
  const direction = server === 'player' ? -1 : 1;
  ballState.velocity.set(
    (Math.random() - 0.5) * INITIAL_SPEED * 0.4,
    0,
    direction * INITIAL_SPEED
  );
  ballState.isActive = true;
  ballState.lastHitBy = server;
  console.log(`[Pong] Ball served by ${server}`);
}

export function updateBall(deltaTime, fieldBounds) {
  if (!ballState.isActive) return;

  // Captured before this frame moves the ball — see ballState.previousPosition's doc comment.
  ballState.previousPosition.copy(ball.position);

  ball.position.add(ballState.velocity.clone().multiplyScalar(deltaTime));

  // Bounce off the side walls
  if (ball.position.x <= fieldBounds.minX + BALL_RADIUS) {
    ball.position.x = fieldBounds.minX + BALL_RADIUS;
    ballState.velocity.x = Math.abs(ballState.velocity.x);
    playWallBounce();
  } else if (ball.position.x >= fieldBounds.maxX - BALL_RADIUS) {
    ball.position.x = fieldBounds.maxX - BALL_RADIUS;
    ballState.velocity.x = -Math.abs(ballState.velocity.x);
    playWallBounce();
  }
}

/**
 * Bounce the ball off a paddle. hitBy sends it back towards the opponent;
 * the offset of the hit from the paddle's center steers the angle, like
 * classic pong, and each hit speeds the rally up slightly.
 */
export function hitBall(paddlePosition, ballPosition, hitBy) {
  const currentSpeed = Math.min(
    Math.max(ballState.velocity.length(), INITIAL_SPEED) * SPEED_GROWTH,
    MAX_SPEED
  );

  const offset = THREE.MathUtils.clamp(
    (ballPosition.x - paddlePosition.x) / (PADDLE_WIDTH / 2),
    -1,
    1
  );
  const angle = offset * MAX_BOUNCE_ANGLE;
  const forwardZ = hitBy === 'player' ? -1 : 1;

  ballState.velocity.set(
    Math.sin(angle) * currentSpeed,
    0,
    Math.cos(angle) * currentSpeed * forwardZ
  );
  ballState.lastHitBy = hitBy;
  ballState.isActive = true;

  playPaddleHit(currentSpeed);
  console.log(`[Pong] Ball hit by ${hitBy}, speed: ${currentSpeed.toFixed(2)}`);
}

export function checkMiss(fieldBounds) {
  const z = ball.position.z;

  if (z < fieldBounds.minZ) return 'bot'; // bot failed to return, player scores
  if (z > fieldBounds.maxZ) return 'player'; // player failed to return, bot scores
  return null;
}

export function isBallActive() {
  return ballState.isActive;
}

export function stopBall() {
  ballState.isActive = false;
  ballState.velocity.set(0, 0, 0);
}

export function getBallRadius() {
  return BALL_RADIUS;
}
