/**
 * Table Tennis Ball Physics — server-authoritative port
 *
 * Ported from games/tennis/src/physics.js's updateBall/checkNetCollision/
 * checkBounds, stripped of THREE.Mesh/DOM/audio side effects (the original
 * is tightly coupled to a browser THREE.Scene and Tone.js). Only the pure
 * position/velocity/collision math survives here — everything operates on
 * a plain ballState object rather than a module-level singleton, since a
 * single server process can host multiple concurrent TennisRoom instances.
 *
 * Determinism note: unlike hand-sword's box spawning, this module never
 * calls Math.random() — the one random element in the original game (the
 * serve's horizontal jitter) is decided once by whichever client performs
 * the serve and arrives here as a concrete velocity, not re-randomized.
 */
import * as THREE from 'three';

export const GRAVITY = -9.8;
export const BALL_RADIUS = 0.15;
const BOUNCE_DAMPING = 1.1;
const AIR_RESISTANCE = 1;
const SPIN_FACTOR = 0.1;
const NET_TOP_HEIGHT = 0.4;
const NET_HALF_THICKNESS = BALL_RADIUS;

export function createBallState() {
  return {
    position: new THREE.Vector3(0, 0.9, -5),
    velocity: new THREE.Vector3(0, 0, 0),
    spin: new THREE.Vector3(0, 0, 0),
    isActive: false,
    lastHitBy: null, // 'player' | 'bot' — see TennisRoom for what these roles mean
    netContactActive: false // guards against re-bouncing every frame while lingering in the net band
  };
}

export function resetBallPosition(ballState) {
  ballState.position.set(0, 0.9, -5);
  ballState.velocity.set(0, 0, 0);
  ballState.spin.set(0, 0, 0);
  ballState.isActive = false;
  ballState.lastHitBy = null;
  ballState.netContactActive = false;
}

/**
 * Advance the ball one physics tick. Returns a bounce classification
 * ('out' | 'bot-court' | 'player-court') if the ball just bounced on the
 * ground this tick, else null — mirrors physics.js's consumeBounceResult()
 * but returned directly instead of stashed in module state.
 */
export function updateBall(ballState, deltaTime, courtBounds) {
  if (!ballState.isActive) return null;

  ballState.velocity.y += GRAVITY * deltaTime;
  ballState.velocity.multiplyScalar(Math.pow(AIR_RESISTANCE, deltaTime * 60));

  const spinEffect = ballState.spin.clone().multiplyScalar(SPIN_FACTOR * deltaTime);
  ballState.velocity.add(spinEffect);

  ballState.position.add(ballState.velocity.clone().multiplyScalar(deltaTime));

  let bounceResult = null;

  if (ballState.position.y <= BALL_RADIUS) {
    const impactSpeed = Math.abs(ballState.velocity.y);

    ballState.position.y = BALL_RADIUS;
    ballState.velocity.y = impactSpeed * BOUNCE_DAMPING;
    ballState.spin.multiplyScalar(0.7);

    bounceResult = checkBounds(ballState.position, courtBounds);
  }

  checkNetCollision(ballState);

  return bounceResult;
}

function checkNetCollision(ballState) {
  const withinNetBand = Math.abs(ballState.position.z) < NET_HALF_THICKNESS;
  const belowNetTop = ballState.position.y < NET_TOP_HEIGHT + BALL_RADIUS;

  if (!withinNetBand || !belowNetTop) {
    ballState.netContactActive = false;
    return;
  }

  const approachSide = ballState.velocity.z >= 0 ? -1 : 1;
  ballState.position.z = approachSide * NET_HALF_THICKNESS;

  if (!ballState.netContactActive) {
    ballState.velocity.z *= -0.5;
    ballState.velocity.y *= 0.5;
    ballState.velocity.x *= 0.7;
    ballState.netContactActive = true;
  }
}

function checkBounds(pos, courtBounds) {
  if (pos.x < courtBounds.minX || pos.x > courtBounds.maxX || pos.z < courtBounds.minZ || pos.z > courtBounds.maxZ) {
    return 'out';
  }
  return pos.z > 0 ? 'bot-court' : 'player-court';
}
