/**
 * Table Tennis Ball Physics
 * Realistic ball movement with gravity, bounce, and spin
 */

import * as THREE from 'three';
import { SWING_DIRECTION_X } from './hand-tracking.js';
import { playHit, playBoing, playBounce, playNetHit } from './audio.js';

export let ball;
let scene;

// Physics constants
const GRAVITY = -9.8; // m/s^2
const BALL_RADIUS = 0.15;
const BOUNCE_DAMPING = 1.1; // Energy loss on bounce
const AIR_RESISTANCE = 1; // Drag retained per frame at a 60fps reference rate
const SPIN_FACTOR = 0.1;
const NET_TOP_HEIGHT = 0.4;
const BASE_LIFT = 1.2;
const GESTURE_LIFT_SCALE = 1; // extra upward velocity per world-unit of swing rise
const CENTER_HIT_LIFT_BONUS = 0.25; // guaranteed extra lift for the 2-finger center/lob swing
const NET_CLEARANCE = 0.4; // buffer above the net's top so a hit doesn't just barely clip it
const MIN_NET_CLEAR_DISTANCE = 0.5; // skip the clearance solve for hits already essentially at the net
const SMASH_LAND_DEPTH = 2.2; // world units past the net a smash should land at (court half-length is ~3.57, see scene.js COURT_LENGTH/COURT_SCALE)
const SMASH_BASE_POWER = 14; // vs. a normal hit's 9 — a smash is meaningfully harder to return

// Global ball speed multiplier — scales every serve/hit/smash power by the
// same factor (applied once, at the top of serveBall()/hitBall(), so every
// downstream trajectory/net-clearance calculation scales consistently with
// it) instead of retuning each constant separately. 1 = original speed;
// lowered from that after real playtesting reported the ball moving too
// fast to comfortably react to. games/tennis/src/index.js's MIN/MAX_SERVE_POWER
// still define the *pre-scale* serve-challenge power range unchanged.
export const BALL_SPEED_SCALE = 0.65;

// Ball state
export const ballState = {
  velocity: new THREE.Vector3(0, 0, 0),
  spin: new THREE.Vector3(0, 0, 0),
  isActive: false,
  lastHitBy: null, // 'player' or 'bot'
  // Where the ball was before this frame's movement — updateBall() below
  // refreshes this every frame it actually moves the ball. Racket collision
  // checks (game-logic.js) sweep the ball's box from here to its current
  // position instead of only testing the single post-move point, so a fast
  // ball can't skip clean over a thin racket within one frame ("ball goes
  // through the racket" — reported from real multiplayer testing, worse at
  // high speed / low framerate where a single frame's movement can exceed
  // the racket's own depth).
  previousPosition: new THREE.Vector3(0, 0.9, -5)
};

// Classification from the ball's most recent ground bounce ('out',
// 'bot-court', or 'player-court'), for the game-rule layer to consume —
// this is the exact moment/position checkBounds already computes, so no
// separate re-check is needed to know where the ball just landed.
let pendingBounceResult = null;

export function consumeBounceResult() {
  const result = pendingBounceResult;
  pendingBounceResult = null;
  return result;
}

/**
 * A flat-colored sphere looks identical at every rotation, so spin is
 * invisible no matter how fast the ball is actually spinning. This paints a
 * grid of contrasting dots onto a canvas and wraps it around the sphere as
 * a texture — wherever the ball rotates, some dots are visibly moving,
 * making spin readable from any angle without needing an external image.
 */
function createBallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgb(255, 109, 12)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fff';
  const cols = 8;
  const rows = 4;
  const dotRadius = 8;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Offset alternate rows so the dots don't line up into a uniform
      // grid, which would still look ambiguous under some rotations.
      const offsetX = (row % 2) * (canvas.width / cols / 2);
      const x = ((col + 0.5) * (canvas.width / cols) + offsetX) % canvas.width;
      const y = (row + 0.5) * (canvas.height / rows);
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return new THREE.CanvasTexture(canvas);
}

export function createBall(sceneRef) {
  scene = sceneRef;

  // Create the ball
  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
  const ballMaterial = new THREE.MeshStandardMaterial({
    map: createBallTexture(),
    roughness: 0.6,
    metalness: 0.1
  });

  ball = new THREE.Mesh(ballGeometry, ballMaterial);
  ball.castShadow = true;
  ball.receiveShadow = true;

  // Start ball at player's serve position
  resetBallPosition();

  scene.add(ball);
  console.log('[Table Tennis] Ball created');
}

export function resetBallPosition() {
  ball.position.set(0, 0.9, -5);
  ballState.velocity.set(0, 0, 0);
  ballState.spin.set(0, 0, 0);
  ballState.isActive = false;
  ballState.lastHitBy = null;
  ballState.previousPosition.copy(ball.position);
}

export function serveBall(power = 4) {
  // See BALL_SPEED_SCALE's doc comment — applied here, first, so every
  // calculation below (including the net-clearance solve) is consistent
  // with the actual scaled speed instead of the pre-scale input.
  const scaledPower = power * BALL_SPEED_SCALE;

  // Back-solve the vertical launch velocity needed so the serve's parabola
  // clears the net (plus a margin) by the time it reaches z=0 — a fixed
  // vy=1 regardless of power meant the ball could hit the ground on the
  // server's own side before ever reaching the net, especially at lower
  // power. Same solve as hitBall()'s net-clearance guarantee for rally hits.
  const distanceToNet = Math.abs(ball.position.z);
  const timeToNet = distanceToNet / scaledPower;
  const requiredHeight = NET_TOP_HEIGHT + BALL_RADIUS + NET_CLEARANCE;
  const requiredVy =
    (requiredHeight - ball.position.y - 0.5 * GRAVITY * timeToNet * timeToNet) / timeToNet;

  ballState.velocity.set(
    (Math.random() - 0.5) * 2, // Slight random horizontal
    Math.max(1, requiredVy), // Upward trajectory, at least enough to clear the net
    scaledPower // Forward speed
  );
  ballState.spin.set(0, 0, -2); // Topspin
  ballState.isActive = true;
  ballState.lastHitBy = 'player';
  console.log('[Table Tennis] Ball served');
}

export function updateBall(deltaTime, courtBounds) {
  if (!ballState.isActive) return;

  // Captured before this frame moves the ball — see ballState.previousPosition's doc comment.
  ballState.previousPosition.copy(ball.position);

  // Apply gravity
  ballState.velocity.y += GRAVITY * deltaTime;

  // Apply air resistance (framerate-independent: same drag regardless of actual fps)
  ballState.velocity.multiplyScalar(Math.pow(AIR_RESISTANCE, deltaTime * 60));

  // Apply spin effects (Magnus effect)
  const spinEffect = ballState.spin.clone().multiplyScalar(SPIN_FACTOR * deltaTime);
  ballState.velocity.add(spinEffect);

  // Update position
  ball.position.add(
    ballState.velocity.clone().multiplyScalar(deltaTime)
  );

  // Check ground collision
  if (ball.position.y <= BALL_RADIUS) {
    const impactSpeed = Math.abs(ballState.velocity.y);

    ball.position.y = BALL_RADIUS;
    ballState.velocity.y = impactSpeed * BOUNCE_DAMPING;

    // Reduce spin on bounce
    ballState.spin.multiplyScalar(0.7);

    playBounce(impactSpeed);

    pendingBounceResult = checkBounds(courtBounds);
  }

  checkNetCollision();

  // Apply rotation for visual effect
  const rotationSpeed = ballState.velocity.length() * deltaTime;
  ball.rotation.x += rotationSpeed;
  ball.rotation.z += rotationSpeed * 0.5;
}

// Net sits at z=0 with ~0 physical depth (see scene.js createNet), so treat
// it as a thin slab for collision purposes — otherwise a fast ball can cross
// z=0 entirely within one physics step and the exact-crossing-frame check
// used to miss it, or catch it a frame late after it had already tunneled
// through to the other side.
const NET_HALF_THICKNESS = BALL_RADIUS;
let netContactActive = false; // guards against re-bouncing every frame while the ball lingers in the net band

function checkNetCollision() {
  const withinNetBand = Math.abs(ball.position.z) < NET_HALF_THICKNESS;
  // Compare against the ball's surface, not just its center, so it can't
  // clip through the net's top edge.
  const belowNetTop = ball.position.y < NET_TOP_HEIGHT + BALL_RADIUS;

  if (!withinNetBand || !belowNetTop) {
    netContactActive = false;
    return;
  }

  // Pin the ball to whichever face of the net it approached from — this is
  // what actually stops it at the net instead of just reversing velocity
  // after it's already past.
  const approachSide = ballState.velocity.z >= 0 ? -1 : 1;
  ball.position.z = approachSide * NET_HALF_THICKNESS;

  if (!netContactActive) {
    handleNetCollision();
    netContactActive = true;
  }
}

function handleNetCollision() {
  console.log('[Table Tennis] Ball hit the net');
  ballState.velocity.z *= -0.5; // Reverse and dampen
  ballState.velocity.y *= 0.5;
  ballState.velocity.x *= 0.7;
  playNetHit();
}

function checkBounds(courtBounds) {
  const pos = ball.position;

  // Check if ball landed outside court boundaries
  if (
    pos.x < courtBounds.minX ||
    pos.x > courtBounds.maxX ||
    pos.z < courtBounds.minZ ||
    pos.z > courtBounds.maxZ
  ) {
    console.log('[Table Tennis] Ball out of bounds');
    return 'out';
  }

  // Check which side the ball landed on
  if (pos.z > 0) {
    console.log('[Table Tennis] Ball landed in bot court');
    return 'bot-court';
  } else {
    console.log('[Table Tennis] Ball landed in player court');
    return 'player-court';
  }
}

export function hitBall(racketPosition, racketVelocity, hitBy = 'player', gesture = null, smash = null) {
  // Calculate hit direction and power.
  // racketVelocity can be near zero (slow/still racket right at contact) — normalize()
  // silently collapses that to (0,0,0) instead of throwing, so the ball loses all
  // horizontal motion and just pops up (from the y-floor below) and drops in place.
  // Fall back to hitting straight toward the opponent's court in that case.
  const forwardZ = hitBy === 'player' ? 1 : -1;

  // A gesture swing (1/2/3 fingers) picks the direction explicitly instead of
  // relying on noisy tracked racket velocity, and its low-to-high rise sets
  // how high the ball is lifted. Center (2 fingers) is a dedicated bottom-to-up
  // lift swing, so it gets a steeper launch angle on top of that. A smash
  // (open hand) overrides all of that with a hard, flat, straight-ahead
  // power shot instead — real smashes trade arc for speed.
  const isCenterSwing = gesture?.direction === 'center';
  const launchY = smash ? 0.1 : isCenterSwing ? 0.35 : 0.3;
  const hitDirection = smash
    ? new THREE.Vector3(0, launchY, forwardZ).normalize()
    : gesture
      ? new THREE.Vector3(SWING_DIRECTION_X[gesture.direction] ?? 0, launchY, forwardZ).normalize()
      : racketVelocity.length() > 0.01
        ? racketVelocity.clone().normalize()
        : new THREE.Vector3(0, 0.3, forwardZ).normalize();
  // See BALL_SPEED_SCALE's doc comment — applied here, first, so every
  // calculation below (net-clearance solve, smash landing-depth solve) is
  // consistent with the actual scaled speed.
  const hitPower = (smash ? SMASH_BASE_POWER : 9) * BALL_SPEED_SCALE;

  // Set new velocity based on hit
  ballState.velocity.copy(hitDirection.multiplyScalar(hitPower));

  if (smash) {
    // A smash needs to dive down and land inside the opponent's court
    // quickly, not arc over on a normal lofted trajectory — at SMASH_BASE_POWER's
    // speed, even a shallow arc travels far enough in the air to sail past
    // their baseline before gravity brings it down. Back-solve the vy that
    // brings it down exactly at a safe landing depth past the net instead.
    const distanceToNet = Math.abs(racketPosition.z);
    const targetZ = forwardZ * SMASH_LAND_DEPTH;
    const timeToTarget = Math.abs(targetZ - racketPosition.z) / hitPower;
    let smashVy =
      (BALL_RADIUS - racketPosition.y - 0.5 * GRAVITY * timeToTarget * timeToTarget) / timeToTarget;

    // That dive is intentionally steep/low, so double-check it doesn't clip
    // the net on the way down. Uses the bare net-collision threshold, not
    // the padded NET_CLEARANCE margin the normal-shot check below uses — a
    // smash is meant to just clear it low and hard, not arc over with room
    // to spare, and the padded margin would force it high enough to undo
    // the dive and overshoot the court again.
    if (distanceToNet > MIN_NET_CLEAR_DISTANCE) {
      const timeToNet = distanceToNet / hitPower;
      const bareNetHeight = NET_TOP_HEIGHT + BALL_RADIUS;
      const heightAtNet =
        racketPosition.y + smashVy * timeToNet + 0.5 * GRAVITY * timeToNet * timeToNet;
      if (heightAtNet < bareNetHeight) {
        smashVy = (bareNetHeight - racketPosition.y - 0.5 * GRAVITY * timeToNet * timeToNet) / timeToNet;
      }
    }

    ballState.velocity.y = smashVy;
  } else {
    // Add some upward force; a gesture swing's rise adds extra lift on top,
    // and a center swing always gets a lift bonus even without much hand rise —
    // that's what makes it read as "the lob shot" rather than just another direction.
    const centerLiftBonus = isCenterSwing ? CENTER_HIT_LIFT_BONUS : 0;
    const minLift = gesture ? BASE_LIFT + gesture.liftPower * GESTURE_LIFT_SCALE + centerLiftBonus : BASE_LIFT;
    ballState.velocity.y = Math.max(ballState.velocity.y, minLift);

    // Guarantee every hit clears the net (this is what was missing for the bot's
    // returns specifically, but it applies to any hit): back-solve the vertical
    // velocity this shot's parabola needs so it's above the net, plus a
    // clearance margin, exactly when it reaches z=0 — a fast, flat-ish hit can
    // otherwise get there well before the flat minLift above would have arced
    // it that high.
    const distanceToNet = Math.abs(racketPosition.z);
    if (distanceToNet > MIN_NET_CLEAR_DISTANCE && Math.abs(ballState.velocity.z) > 0.01) {
      const timeToNet = distanceToNet / Math.abs(ballState.velocity.z);
      const requiredHeight = NET_TOP_HEIGHT + BALL_RADIUS + NET_CLEARANCE;
      const requiredVy =
        (requiredHeight - racketPosition.y - 0.5 * GRAVITY * timeToNet * timeToNet) / timeToNet;
      ballState.velocity.y = Math.max(ballState.velocity.y, requiredVy);
    }
  }

  // Apply spin based on racket angle
  const spinAmount = racketVelocity.length() * 0.5;
  ballState.spin.set(
    -racketVelocity.y * spinAmount,
    racketVelocity.x * spinAmount,
    -racketVelocity.z * spinAmount * 0.5
  );

  ballState.lastHitBy = hitBy;
  ballState.isActive = true;

  playHit(ballState.velocity.length());
  playBoing(ballState.velocity.length());

  console.log(`[Table Tennis] Ball hit by ${hitBy}, power: ${hitPower.toFixed(2)}`);
}

export function getBallBoundingBox() {
  const box = new THREE.Box3().setFromObject(ball);
  return box;
}

export function isBallActive() {
  return ballState.isActive;
}

export function stopBall() {
  ballState.isActive = false;
  ballState.velocity.set(0, 0, 0);
}
