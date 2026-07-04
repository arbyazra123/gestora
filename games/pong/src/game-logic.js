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

export function checkPlayerPaddleCollision(playerPaddle, ball, ballState) {
  if (!ballState.isActive || ballState.lastHitBy === 'player') return false;

  const paddleBox = new THREE.Box3().setFromObject(playerPaddle);
  const ballBox = new THREE.Box3().setFromObject(ball);

  if (paddleBox.intersectsBox(ballBox)) {
    console.log('[Pong] Player hit the ball!');
    return true;
  }
  return false;
}

export function checkBotPaddleCollision(botPaddle, ball, ballState) {
  if (!ballState.isActive || ballState.lastHitBy === 'bot') return false;

  const paddleBox = new THREE.Box3().setFromObject(botPaddle);
  const ballBox = new THREE.Box3().setFromObject(ball);

  if (paddleBox.intersectsBox(ballBox)) {
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
