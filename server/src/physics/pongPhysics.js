/**
 * Pong Ball Physics — server-authoritative port
 *
 * Ported from games/pong/src/physics.js's updateBall/checkMiss, stripped of
 * THREE.Mesh/audio side effects. Flat 2D-in-3D motion (constant y, no
 * gravity/spin/net) — only wall bounce (x) and back-line miss detection (z)
 * are simulated continuously here; paddle hits are computed locally by
 * whichever client's paddle touches the ball (reusing the existing
 * angle-steering math unchanged) and reported to the room as a resulting
 * velocity — see PongRoom's trust-model comment for why hits aren't
 * re-derived server-side.
 *
 * Operates on a plain ballState object rather than a module-level
 * singleton, since a single server process can host multiple concurrent
 * PongRoom instances.
 */

export const BALL_RADIUS = 0.12;

export function createBallState() {
  return { x: 0, z: 0, vx: 0, vz: 0, isActive: false, lastHitBy: null };
}

export function resetBallPosition(ballState) {
  ballState.x = 0;
  ballState.z = 0;
  ballState.vx = 0;
  ballState.vz = 0;
  ballState.isActive = false;
  ballState.lastHitBy = null;
}

export function stopBall(ballState) {
  ballState.isActive = false;
  ballState.vx = 0;
  ballState.vz = 0;
}

/**
 * Advance the ball one physics tick. Returns which side FAILED to return it
 * ('player' | 'bot' — matches games/pong/src/physics.js's checkMiss()
 * naming, i.e. who gets scored against) if it just crossed that side's back
 * line this tick, else null.
 */
export function updateBall(ballState, deltaTime, fieldBounds) {
  if (!ballState.isActive) return null;

  ballState.x += ballState.vx * deltaTime;
  ballState.z += ballState.vz * deltaTime;

  if (ballState.x <= fieldBounds.minX + BALL_RADIUS) {
    ballState.x = fieldBounds.minX + BALL_RADIUS;
    ballState.vx = Math.abs(ballState.vx);
  } else if (ballState.x >= fieldBounds.maxX - BALL_RADIUS) {
    ballState.x = fieldBounds.maxX - BALL_RADIUS;
    ballState.vx = -Math.abs(ballState.vx);
  }

  if (ballState.z < fieldBounds.minZ) return 'bot';
  if (ballState.z > fieldBounds.maxZ) return 'player';
  return null;
}
