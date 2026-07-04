/**
 * Bot AI for Pong Opponent
 * Tracks the ball's x position only — no rotation, no z movement.
 */

import { FIELD_WIDTH, PADDLE_WIDTH } from './scene.js';

let botPaddle;
let ball;

const BOT_MAX_X = FIELD_WIDTH / 2 - PADDLE_WIDTH / 2;

// Speed needs to keep up with the ball, which ramps up to MAX_SPEED (11 units/
// sec, see physics.js) and can cross the full FIELD_LENGTH in well under a
// second — a paddle speed much lower than that makes the bot miss fast
// cross-court shots almost by design, not by "difficulty".
const botState = {
  speed: 6, // units/sec, difficulty-adjustable
  accuracy: 0.85,
  boostMultiplier: 1 // Paddle Boost ability
};

// Paddle Boost ability: faster paddle movement while active
export function setBotBoost(active) {
  botState.boostMultiplier = active ? 1.4 : 1;
}

export function setupBotAI(paddle, ballRef) {
  botPaddle = paddle;
  ball = ballRef;
  console.log('[Pong] Bot AI initialized');
}

export function setBotDifficulty(difficulty) {
  switch (difficulty) {
    case 'easy':
      botState.speed = 4;
      botState.accuracy = 0.6;
      break;
    case 'medium':
      botState.speed = 6;
      botState.accuracy = 0.8;
      break;
    case 'hard':
      botState.speed = 8.5;
      botState.accuracy = 0.95;
      break;
  }
  console.log(`[Pong] Bot difficulty set to ${difficulty}`);
}

export function updateBotAI(deltaTime, ballState) {
  if (!ball || !ballState.isActive) {
    moveTowardsX(0, deltaTime);
    return;
  }

  const error = (1 - botState.accuracy) * (Math.random() - 0.5) * 2;
  const targetX = Math.max(-BOT_MAX_X, Math.min(BOT_MAX_X, ball.position.x + error));

  moveTowardsX(targetX, deltaTime);
}

function moveTowardsX(targetX, deltaTime) {
  const dx = targetX - botPaddle.position.x;
  const maxStep = botState.speed * botState.boostMultiplier * deltaTime;
  const step = Math.max(-maxStep, Math.min(maxStep, dx));
  botPaddle.position.x += step;
}

export function resetBotState() {
  botPaddle.position.x = 0;
}
