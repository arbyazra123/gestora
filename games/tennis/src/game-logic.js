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

export function checkPlayerRacketCollision(playerRacket, ball, ballState) {
  if (!ballState.isActive || ballState.lastHitBy === 'player') {
    return false;
  }

  const racketBox = new THREE.Box3().setFromObject(playerRacket);
  const ballBox = new THREE.Box3().setFromObject(ball);

  if (racketBox.intersectsBox(ballBox)) {
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
  const ballBox = new THREE.Box3().setFromObject(ball);

  if (racketBox.intersectsBox(ballBox)) {
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

export function getScoreDisplay() {
  const pScore = gameState.playerScore;
  const bScore = gameState.botScore;

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
