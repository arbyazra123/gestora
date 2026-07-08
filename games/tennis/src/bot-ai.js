/**
 * Bot AI for Table Tennis Opponent
 * Controls bot racket movement and decision making
 */

import * as THREE from 'three';

let botRacket;
let ball;
let courtBounds;

// AI parameters
const BOT_SPEED = 0.10;
const BOT_REACTION_TIME = 0.1; // seconds delay
const BOT_ACCURACY = 0.85; // 0-1, how accurate the bot is
const BOT_MAX_X = 2; // Movement range
const BOT_BASE_TILT = -Math.PI / 2; // Matches the resting tilt set in scene.js createBotRacket()
const BOT_MAX_YAW = Math.PI / 6;
const BOT_MAX_PITCH_ADJUST = Math.PI / 6;

// Bot state
const botState = {
  targetPosition: new THREE.Vector3(0, 1, 5),
  isReacting: false,
  reactionTimer: 0,
  difficulty: 'easy' // easy, medium, hard
};

export function setupBotAI(racket, ballRef, bounds) {
  botRacket = racket;
  ball = ballRef;
  courtBounds = bounds;

  console.log('[Table Tennis] Bot AI initialized');
}

export function setBotDifficulty(difficulty) {
  botState.difficulty = difficulty;

  // Adjust parameters based on difficulty
  switch (difficulty) {
    case 'easy':
      botState.accuracy = 0.6;
      botState.speed = BOT_SPEED * 0.7;
      botState.reactionTime = 0.4;
      break;
    case 'medium':
      botState.accuracy = 0.8;
      botState.speed = BOT_SPEED;
      botState.reactionTime = 0.2;
      break;
    case 'hard':
      botState.accuracy = 0.95;
      botState.speed = BOT_SPEED * 1.3;
      botState.reactionTime = 0.1;
      break;
  }

  console.log(`[Table Tennis] Bot difficulty set to ${difficulty}`);
}

export function updateBotAI(deltaTime, ballState) {
  if (!ball || !ballState.isActive) {
    // Return to center when ball is not active
    returnToCenter(deltaTime);
    return;
  }

  // Update reaction timer
  if (botState.reactionTimer > 0) {
    botState.reactionTimer -= deltaTime;
    return;
  }

  // Predict where the ball will be
  const predictedPosition = predictBallPosition(ballState);

  // Only react if ball is coming towards bot's side
  if (ballState.velocity.z > 0 && ballState.lastHitBy === 'player') {
    botState.isReacting = true;
    updateTargetPosition(predictedPosition);
  }

  // Move bot racket towards target position
  moveToTarget(deltaTime);

  // Update racket rotation to face the ball
  updateRacketOrientation();
}

function predictBallPosition(ballState) {
  // Simple physics prediction
  const currentPos = ball.position.clone();
  const velocity = ballState.velocity.clone();

  // Predict position when ball reaches bot's z-plane
  const timeToReach = (botRacket.position.z - currentPos.z) / velocity.z;

  if (timeToReach < 0 || timeToReach > 3) {
    return currentPos;
  }

  // Calculate predicted x position with some error based on accuracy
  const predictedX = currentPos.x + velocity.x * timeToReach;
  const error = (1 - botState.accuracy) * (Math.random() - 0.5) * 2;
  const predictedY = Math.max(0.5, currentPos.y + velocity.y * timeToReach);

  return new THREE.Vector3(
    predictedX + error,
    predictedY,
    botRacket.position.z
  );
}

function updateTargetPosition(predicted) {
  // Clamp x position to bot's movement range
  const targetX = THREE.MathUtils.clamp(
    predicted.x,
    -BOT_MAX_X,
    BOT_MAX_X
  );

  // Keep y position reasonable for hitting
  const targetY = THREE.MathUtils.clamp(predicted.y, 0.5, 3);

  botState.targetPosition.set(targetX, targetY, botRacket.position.z);
}

function moveToTarget(deltaTime) {
  const speed = botState.speed || BOT_SPEED;

  // Smooth movement towards target
  botRacket.position.lerp(botState.targetPosition, speed);
}

function returnToCenter(deltaTime) {
  // Return to center position when idle
  const centerPosition = new THREE.Vector3(0, 1, botRacket.position.z);
  botRacket.position.lerp(centerPosition, BOT_SPEED * 0.5);
  botState.isReacting = false;
}

export function updateRacketOrientation() {
  // Nudge the racket's resting tilt towards the ball, rather than replacing it outright:
  // the racket's face normal is the group's local Y axis (see scene.js createBotRacket),
  // not Z, so treating direction.z as a "forward" axis here produced huge, flipped angles
  // since the bot sits ahead of the ball in z (direction.z is almost always negative).
  const direction = ball.position.clone().sub(botRacket.position);

  const yaw = THREE.MathUtils.clamp(
    Math.atan2(direction.x, -direction.z),
    -BOT_MAX_YAW,
    BOT_MAX_YAW
  );
  const pitchAdjust = THREE.MathUtils.clamp(
    direction.y * 0.3,
    -BOT_MAX_PITCH_ADJUST,
    BOT_MAX_PITCH_ADJUST
  );

  botRacket.rotation.y = yaw;
  botRacket.rotation.x = BOT_BASE_TILT + pitchAdjust;
}

export function shouldBotHit(ballPosition, racketPosition) {
  // Check if ball is close enough to bot racket to hit
  const distance = ballPosition.distanceTo(racketPosition);

  // Hit range is larger based on difficulty
  const hitRange = botState.difficulty === 'hard' ? 0.7 : 0.5;

  return distance < hitRange && botState.isReacting;
}

export function getBotHitVelocity(ballPosition) {
  // Calculate bot's hit direction
  const targetX = (Math.random() - 0.5) * 4; // Random placement
  const targetZ = -courtBounds.length / 2 + 1; // Aim for player's court

  const direction = new THREE.Vector3(
    targetX - ballPosition.x,
    1, // Some upward angle
    targetZ - ballPosition.z
  ).normalize();

  // Power varies by difficulty
  const basePower = 6;
  const powerVariation = botState.accuracy;
  const power = basePower * (0.8 + Math.random() * 0.4 * powerVariation);

  return direction.multiplyScalar(power);
}

export function resetBotState() {
  botState.isReacting = false;
  botState.reactionTimer = BOT_REACTION_TIME;
  botState.targetPosition.set(0, 1, 5);
}

export function getBotRacketVelocity() {
  // Estimate velocity based on movement towards target
  const velocity = botState.targetPosition.clone()
    .sub(botRacket.position)
    .multiplyScalar(BOT_SPEED * 10);

  return velocity;
}
