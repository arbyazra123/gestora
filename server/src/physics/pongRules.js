/**
 * Pong scoring/serve rules — server-authoritative port
 *
 * Ported from games/pong/src/game-logic.js. Simple first-to-N scoring, no
 * tennis-style deuce/advantage, and — unlike tennis — the WINNER of the
 * previous point serves next (games/pong/src/game-logic.js's nextPoint()
 * comment flags this as the deliberate inverse of tennis's loser-serves
 * convention; preserved unchanged here).
 *
 * 'player'/'bot' are court-side role identifiers carried over unchanged
 * from the original single-player code (+z side / -z side) — in
 * multiplayer neither side is an actual bot, both are human players
 * assigned one of these two roles on join. See PongRoom for the mapping.
 *
 * Operates on a plain matchState object rather than a module-level
 * singleton, since a single server process can host multiple concurrent
 * PongRoom instances.
 */

const WINNING_SCORE = 7;

export function createMatchState() {
  return {
    playerScore: 0,
    botScore: 0,
    currentServer: 'player',
    gameStatus: 'ready', // ready | serving | playing | point-over | game-over
    lastPointWinner: null
  };
}

export function startServe(m) {
  m.gameStatus = 'serving';
}

export function serveComplete(m) {
  m.gameStatus = 'playing';
}

export function canServe(m, role) {
  return m.gameStatus === 'ready' && m.currentServer === role;
}

export function canHit(ballState, role) {
  return ballState.isActive && ballState.lastHitBy !== role;
}

export function awardPoint(m, winner) {
  if (winner === 'player') m.playerScore++;
  else m.botScore++;

  m.lastPointWinner = winner;
  m.gameStatus = 'point-over';

  if (m.playerScore >= WINNING_SCORE || m.botScore >= WINNING_SCORE) {
    m.gameStatus = 'game-over';
  }
}

export function isGameOver(m) {
  return m.gameStatus === 'game-over';
}

export function getWinner(m) {
  if (m.playerScore >= WINNING_SCORE) return 'player';
  if (m.botScore >= WINNING_SCORE) return 'bot';
  return null;
}

export function nextPoint(m) {
  m.gameStatus = 'ready';
  m.currentServer = m.lastPointWinner || m.currentServer;
}
