/**
 * Pong Game Logic
 * Simple first-to-N scoring — no tennis-style deuce/advantage.
 */

import * as THREE from 'three';

export const gameState = {
  playerScore: 0,
  botScore: 0,
  gameStatus: 'ready', // ready, serving, playing, point-over, game-over
  currentServer: 'player',
  lastPointWinner: null
};

const WINNING_SCORE = 7;

export function resetGame() {
  gameState.playerScore = 0;
  gameState.botScore = 0;
  gameState.gameStatus = 'ready';
  gameState.currentServer = 'player';
  gameState.lastPointWinner = null;
  console.log('[Pong] Game reset');
}

export function startServe() {
  gameState.gameStatus = 'serving';
  console.log(`[Pong] ${gameState.currentServer} serving`);
}

export function serveComplete() {
  gameState.gameStatus = 'playing';
}

/**
 * Sweeps the ball's box from where it was last frame to where it is now,
 * instead of only testing its current post-move position — a fast ball can
 * otherwise cross a whole frame's worth of distance in one step and skip
 * clean over a paddle without either sampled position ever actually
 * overlapping it ("ball goes through the paddle", reported from real
 * multiplayer testing). Axis-aligned, so it's a slight over-approximation
 * for a diagonal path, not exact swept-volume math — deliberately cheap
 * over precise, and correct for the common case of the ball moving mostly
 * along one axis within a single frame.
 */
function getSweptBallBox(ball, ballState) {
  const box = new THREE.Box3().setFromObject(ball);
  if (ballState.previousPosition) {
    box.expandByPoint(ballState.previousPosition);
  }
  return box;
}

/**
 * Segment (p0->p1) vs AABB entry-time test (slab method). Returns the
 * fraction t in [0,1] along the segment where it first enters `box`, or
 * null if it never actually crosses it (can happen since the swept-box
 * overlap test above is a coarser axis-aligned over-approximation for a
 * diagonal path — see its doc comment — so it can say "overlap" in a case
 * where the ball's exact center path doesn't cross this tighter box).
 */
function segmentBoxEntryT(p0, p1, box) {
  let tmin = 0;
  let tmax = 1;
  for (const axis of ['x', 'y', 'z']) {
    const d = p1[axis] - p0[axis];
    const o = p0[axis];
    const minB = box.min[axis];
    const maxB = box.max[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < minB || o > maxB) return null;
      continue;
    }
    let t1 = (minB - o) / d;
    let t2 = (maxB - o) / d;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/**
 * Once a swept-box hit is confirmed, snap the ball back to where it first
 * actually touched the paddle instead of leaving it wherever this frame's
 * full movement put it — which can already be well past (even behind) the
 * paddle's visible mesh at high ball speed or a slow frame, making the
 * bounce look laggy and happen from the wrong spot (reported from real
 * testing: the ball visibly passes into the paddle before bouncing back).
 * Expands the paddle's box by the ball's own half-size first (matching the
 * Minkowski-sum semantics of the overlap test above), then finds where the
 * ball's center path first crosses that expanded box.
 */
function resolveContactPosition(ball, ballState, paddleBox) {
  if (!ballState.previousPosition) return;
  const ballBox = new THREE.Box3().setFromObject(ball);
  const ballHalfSize = ballBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const expandedBox = paddleBox.clone().expandByVector(ballHalfSize);

  const t = segmentBoxEntryT(ballState.previousPosition, ball.position, expandedBox);
  if (t === null) return; // no exact crossing found — leave the ball where it is, same as before this fix
  ball.position.lerpVectors(ballState.previousPosition, ball.position, t);
}

export function checkPlayerPaddleCollision(playerPaddle, ball, ballState) {
  if (!ballState.isActive || ballState.lastHitBy === 'player') return false;

  const paddleBox = new THREE.Box3().setFromObject(playerPaddle);
  const ballBox = getSweptBallBox(ball, ballState);

  if (paddleBox.intersectsBox(ballBox)) {
    resolveContactPosition(ball, ballState, paddleBox);
    console.log('[Pong] Player hit the ball!');
    return true;
  }
  return false;
}

export function checkBotPaddleCollision(botPaddle, ball, ballState) {
  if (!ballState.isActive || ballState.lastHitBy === 'bot') return false;

  const paddleBox = new THREE.Box3().setFromObject(botPaddle);
  const ballBox = getSweptBallBox(ball, ballState);

  if (paddleBox.intersectsBox(ballBox)) {
    resolveContactPosition(ball, ballState, paddleBox);
    console.log('[Pong] Bot hit the ball!');
    return true;
  }
  return false;
}

export function awardPoint(winner) {
  console.log(`[Pong] Point awarded to ${winner}`);

  if (winner === 'player') {
    gameState.playerScore++;
  } else {
    gameState.botScore++;
  }

  gameState.lastPointWinner = winner;
  gameState.gameStatus = 'point-over';

  checkGameWin();
  return getScoreDisplay();
}

function checkGameWin() {
  if (gameState.playerScore >= WINNING_SCORE || gameState.botScore >= WINNING_SCORE) {
    gameState.gameStatus = 'game-over';
  }
}

export function getScoreDisplay() {
  return { player: gameState.playerScore, bot: gameState.botScore };
}

export function isGameOver() {
  return gameState.gameStatus === 'game-over';
}

export function getWinner() {
  if (gameState.playerScore >= WINNING_SCORE) return 'player';
  if (gameState.botScore >= WINNING_SCORE) return 'bot';
  return null;
}

export function nextPoint() {
  gameState.gameStatus = 'ready';
  // Winner of the previous point serves next
  gameState.currentServer = gameState.lastPointWinner || gameState.currentServer;
}

export function getCurrentServer() {
  return gameState.currentServer;
}
