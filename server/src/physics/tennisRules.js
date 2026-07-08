/**
 * Table Tennis scoring/serve/bounce-fault rules — server-authoritative port
 *
 * Ported from games/tennis/src/game-logic.js (scoring/serve state machine)
 * plus the bounce-fault orchestration from games/tennis/src/index.js's
 * handleBounce()/handleBallOut() (which side wins a point when the ball
 * goes out, double-bounces, or lands on the wrong side first). Operates on
 * a plain matchState object rather than module-level singletons, since a
 * single server process can host multiple concurrent TennisRoom instances.
 *
 * 'player'/'bot' below are court-side role identifiers carried over
 * unchanged from the original single-player code (z<0 side / z>0 side) —
 * in multiplayer neither side is an actual bot, both are human players
 * assigned one of these two roles on join. See TennisRoom for the mapping.
 */

const SCORE_LABELS = ['0', '15', '30', '40', 'AD'];

export function createMatchState() {
  return {
    playerScore: 0,
    botScore: 0,
    playerGames: 0,
    botGames: 0,
    currentServer: 'player',
    rallyCount: 0,
    gameStatus: 'ready', // ready | serving | playing | point-over | game-over
    lastPointWinner: null,
    awaitingReturnHit: false
  };
}

export function startServe(m) {
  m.gameStatus = 'serving';
  m.rallyCount = 0;
  m.awaitingReturnHit = false;
}

export function serveComplete(m) {
  m.gameStatus = 'playing';
}

export function registerHit(m) {
  m.rallyCount++;
  m.awaitingReturnHit = false;
}

export function canHit(ballState, role) {
  return ballState.isActive && ballState.lastHitBy !== role;
}

export function canServe(m, role) {
  return (m.gameStatus === 'ready') && m.currentServer === role;
}

export function awardPoint(m, winner) {
  if (winner === 'player') m.playerScore++;
  else m.botScore++;

  m.lastPointWinner = winner;
  m.gameStatus = 'point-over';

  checkGameWin(m);
}

function checkGameWin(m) {
  const p = m.playerScore;
  const b = m.botScore;

  if (p >= 4 && p - b >= 2) winGame(m, 'player');
  else if (b >= 4 && b - p >= 2) winGame(m, 'bot');
}

function winGame(m, winner) {
  if (winner === 'player') m.playerGames++;
  else m.botGames++;

  m.playerScore = 0;
  m.botScore = 0;
  m.currentServer = m.currentServer === 'player' ? 'bot' : 'player';

  m.gameStatus = (m.playerGames >= 2 || m.botGames >= 2) ? 'game-over' : 'ready';
}

export function isGameOver(m) {
  return m.gameStatus === 'game-over';
}

export function getWinner(m) {
  if (m.playerGames >= 2) return 'player';
  if (m.botGames >= 2) return 'bot';
  return null;
}

export function nextPoint(m) {
  m.gameStatus = 'ready';
}

export function getScoreDisplay(m) {
  const p = m.playerScore;
  const b = m.botScore;

  if (p >= 3 && b >= 3) {
    if (p === b) return { player: 'Deuce', bot: 'Deuce' };
    return p > b ? { player: 'AD', bot: '' } : { player: '', bot: 'AD' };
  }

  return {
    player: SCORE_LABELS[Math.min(p, 4)],
    bot: SCORE_LABELS[Math.min(b, 4)]
  };
}

/**
 * Apply a ground-bounce result to the match state — awards a point (via
 * awardPoint) if the bounce ends the rally (out of bounds, wrong side, or
 * a second bounce with no intervening hit), otherwise arms
 * awaitingReturnHit for the next bounce check. Also stops the ball
 * (ballState.isActive=false) whenever a point is awarded, mirroring
 * index.js's stopBall() calls in handleBallOut/handleBounce.
 */
export function processBounce(ballState, matchState, bounceResult) {
  if (bounceResult === 'out') {
    const winner = matchState.awaitingReturnHit
      ? ballState.lastHitBy
      : (ballState.lastHitBy === 'player' ? 'bot' : 'player');
    stopBall(ballState);
    matchState.awaitingReturnHit = false;
    awardPoint(matchState, winner);
    return;
  }

  const expectedSide = ballState.lastHitBy === 'player' ? 'bot-court' : 'player-court';
  if (bounceResult !== expectedSide) {
    const winner = ballState.lastHitBy === 'player' ? 'bot' : 'player';
    stopBall(ballState);
    matchState.awaitingReturnHit = false;
    awardPoint(matchState, winner);
    return;
  }

  if (matchState.awaitingReturnHit) {
    const winner = ballState.lastHitBy;
    stopBall(ballState);
    matchState.awaitingReturnHit = false;
    awardPoint(matchState, winner);
  } else {
    matchState.awaitingReturnHit = true;
  }
}

function stopBall(ballState) {
  ballState.isActive = false;
  ballState.velocity.set(0, 0, 0);
}
