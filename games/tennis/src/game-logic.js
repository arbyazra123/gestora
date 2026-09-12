/**
 * Table Tennis Game Logic
 * Handles scoring, collision detection, and game rules
 */

import * as THREE from 'three';

// Game state
export const gameState = {
  playerScore: 0,
  botScore: 0,
  playerGames: 0,
  botGames: 0,
  currentServer: 'player',
  rallyCount: 0,
  gameStatus: 'ready', // ready, serving, playing, point-over, game-over
  lastPointWinner: null
};

// Point scoring labels
const SCORE_LABELS = ['0', '15', '30', '40', 'AD'];

export function resetGame() {
  gameState.playerScore = 0;
  gameState.botScore = 0;
  gameState.playerGames = 0;
  gameState.botGames = 0;
  gameState.currentServer = 'player';
  gameState.rallyCount = 0;
  gameState.gameStatus = 'ready';
  gameState.lastPointWinner = null;
  console.log('[Table Tennis] Game reset');
}

export function startServe() {
  gameState.gameStatus = 'serving';
  gameState.rallyCount = 0;
  console.log(`[Table Tennis] ${gameState.currentServer} serving`);
}

export function serveComplete() {
  gameState.gameStatus = 'playing';
}

/**
 * Sweeps the ball's box from where it was last frame to where it is now,
 * instead of only testing its current post-move position — a fast ball can
 * otherwise cross a whole frame's worth of distance in one step and skip
 * clean over a thin racket without either sampled position ever actually
 * overlapping it ("ball goes through the racket", reported from real
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
 * actually touched the racket instead of leaving it wherever this frame's
 * full movement put it — which can already be well past (even behind) the
 * racket's visible mesh at high ball speed or a slow frame, making the
 * bounce look laggy and happen from the wrong spot (reported from real
 * testing: the ball visibly passes into the racket before bouncing back).
 * Expands the racket's box by the ball's own half-size first (matching the
 * Minkowski-sum semantics of the overlap test above), then finds where the
 * ball's center path first crosses that expanded box.
 */
function resolveContactPosition(ball, ballState, racketBox) {
  if (!ballState.previousPosition) return;
  const ballBox = new THREE.Box3().setFromObject(ball);
  const ballHalfSize = ballBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const expandedBox = racketBox.clone().expandByVector(ballHalfSize);

  const t = segmentBoxEntryT(ballState.previousPosition, ball.position, expandedBox);
  if (t === null) return; // no exact crossing found — leave the ball where it is, same as before this fix
  ball.position.lerpVectors(ballState.previousPosition, ball.position, t);
}

export function checkPlayerRacketCollision(playerRacket, ball, ballState) {
  if (!ballState.isActive || ballState.lastHitBy === 'player') {
    return false;
  }

  const racketBox = new THREE.Box3().setFromObject(playerRacket);
  const ballBox = getSweptBallBox(ball, ballState);

  if (racketBox.intersectsBox(ballBox)) {
    resolveContactPosition(ball, ballState, racketBox);
    console.log('[Table Tennis] Player hit the ball!');
    gameState.rallyCount++;
    return true;
  }

  return false;
}

export function checkBotRacketCollision(botRacket, ball, ballState) {
  if (!ballState.isActive || ballState.lastHitBy === 'bot') {
    return false;
  }

  const racketBox = new THREE.Box3().setFromObject(botRacket);
  const ballBox = getSweptBallBox(ball, ballState);

  if (racketBox.intersectsBox(ballBox)) {
    resolveContactPosition(ball, ballState, racketBox);
    console.log('[Table Tennis] Bot hit the ball!');
    gameState.rallyCount++;
    return true;
  }

  return false;
}

export function awardPoint(winner) {
  console.log(`[Table Tennis] Point awarded to ${winner}`);

  if (winner === 'player') {
    gameState.playerScore++;
  } else {
    gameState.botScore++;
  }

  gameState.lastPointWinner = winner;
  gameState.gameStatus = 'point-over';

  // Check if game is won
  checkGameWin();

  return getScoreDisplay();
}

function checkGameWin() {
  const pScore = gameState.playerScore;
  const bScore = gameState.botScore;

  // Standard scoring rule: need 4 points and lead by 2
  if (pScore >= 4 && pScore - bScore >= 2) {
    winGame('player');
  } else if (bScore >= 4 && bScore - pScore >= 2) {
    winGame('bot');
  }
}

function winGame(winner) {
  console.log(`[Table Tennis] ${winner} wins the game!`);

  if (winner === 'player') {
    gameState.playerGames++;
  } else {
    gameState.botGames++;
  }

  // Reset scores for next game
  gameState.playerScore = 0;
  gameState.botScore = 0;

  // Switch server
  gameState.currentServer = gameState.currentServer === 'player' ? 'bot' : 'player';

  // Check if match is won (first to 2 games)
  if (gameState.playerGames >= 2 || gameState.botGames >= 2) {
    gameState.gameStatus = 'game-over';
  } else {
    gameState.gameStatus = 'ready';
  }
}

/**
 * @param {{playerScore:number,botScore:number}} scores - defaults to this
 *   module's own gameState; multiplayer mode passes server-synced scores
 *   instead, reusing this same deuce/AD label logic without duplicating it.
 */
export function getScoreDisplay(scores = gameState) {
  const pScore = scores.playerScore;
  const bScore = scores.botScore;

  // Handle deuce and advantage
  if (pScore >= 3 && bScore >= 3) {
    if (pScore === bScore) {
      return { player: 'Deuce', bot: 'Deuce' };
    } else if (pScore > bScore) {
      return { player: 'AD', bot: '' };
    } else {
      return { player: '', bot: 'AD' };
    }
  }

  return {
    player: SCORE_LABELS[Math.min(pScore, 4)],
    bot: SCORE_LABELS[Math.min(bScore, 4)]
  };
}

export function getGameScore() {
  return {
    playerGames: gameState.playerGames,
    botGames: gameState.botGames
  };
}

export function isPointOver() {
  return gameState.gameStatus === 'point-over';
}

export function isGameOver() {
  return gameState.gameStatus === 'game-over';
}

export function getWinner() {
  if (gameState.playerGames >= 2) return 'player';
  if (gameState.botGames >= 2) return 'bot';
  return null;
}

export function nextPoint() {
  gameState.gameStatus = 'ready';
}

export function getRallyCount() {
  return gameState.rallyCount;
}

export function getCurrentServer() {
  return gameState.currentServer;
}
