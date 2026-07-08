/**
 * Table Tennis Game UI Overlay
 * Displays score, game status, and controls
 */

let uiOverlay;
let scoreDisplay;
let gameScoreDisplay;
let statusDisplay;
let controlsDisplay;
let rallyDisplay;
let fingerCountDisplay;
let serveChallengeDisplay;

let isMultiplayerMode = false;
let countdownIntervalId = null;

export function setupUI(container) {
  // Create UI overlay container
  uiOverlay = document.createElement('div');
  uiOverlay.id = 'table-tennis-ui';
  uiOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: white;
    z-index: 1000;
  `;

  // Score display (top center)
  scoreDisplay = document.createElement('div');
  scoreDisplay.style.cssText = `
    position: absolute;
    top: 150px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    padding: 15px 20px;
    border-radius: 12px;
    display: flex;
    gap: 30px;
    align-items: center;
    font-size: 24px;
    font-weight: bold;
    backdrop-filter: blur(10px);
  `;
  scoreDisplay.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 14px; opacity: 0.7; margin-bottom: 5px;">YOU</div>
      <div id="player-score">0</div>
    </div>
    <div style="font-size: 32px; opacity: 0.5;">:</div>
    <div style="text-align: center;">
      <div id="bot-label" style="font-size: 14px; opacity: 0.7; margin-bottom: 5px;">BOT</div>
      <div id="bot-score">0</div>
    </div>
  `;

  // Game score (games won)
  gameScoreDisplay = document.createElement('div');
  gameScoreDisplay.style.cssText = `
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.5);
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 16px;
    backdrop-filter: blur(10px);
  `;
  gameScoreDisplay.innerHTML = `
    <span id="player-games">0</span> - <span id="bot-games">0</span> Games
  `;

  // Status display (center)
  statusDisplay = document.createElement('div');
  statusDisplay.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    padding: 30px 60px;
    border-radius: 16px;
    font-size: 36px;
    font-weight: bold;
    text-align: center;
    display: none;
    backdrop-filter: blur(10px);
  `;
  statusDisplay.id = 'status-display';

  // Rally counter
  rallyDisplay = document.createElement('div');
  rallyDisplay.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.6);
    padding: 15px 25px;
    border-radius: 8px;
    font-size: 18px;
    backdrop-filter: blur(10px);
  `;
  rallyDisplay.innerHTML = `Rally: <span id="rally-count">0</span>`;

  // Live debug readout of the raw finger count, near the camera preview
  // (CameraService places that canvas at top:10px, right:10px, 240x180)
  fingerCountDisplay = document.createElement('div');
  fingerCountDisplay.id = 'finger-count';
  fingerCountDisplay.style.cssText = `
    position: absolute;
    top: 200px;
    right: 10px;
    width: 240px;
    background: rgba(0, 0, 0, 0.7);
    padding: 8px 0;
    border-radius: 8px;
    text-align: center;
    font-size: 13px;
  `;
  fingerCountDisplay.innerHTML = `
    Fingers: <span id="finger-count-value" style="font-weight: bold; color: #ffcc00;">-</span>
    &nbsp;|&nbsp;
    Swing: <span id="swing-direction-value" style="font-weight: bold; color: #4ade80;">-</span>
    <div id="smash-status-value" style="font-weight: bold; color: #f87171; margin-top: 4px; visibility: hidden;">
      🔥 SMASH READY!
    </div>
  `;

  // Serve challenge — 3 finger-count digits shown one at a time, grey
  // (pending) turning green (confirmed) as the player shows each in order.
  serveChallengeDisplay = document.createElement('div');
  serveChallengeDisplay.id = 'serve-challenge';
  serveChallengeDisplay.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    padding: 30px 50px;
    border-radius: 16px;
    text-align: center;
    display: none;
    backdrop-filter: blur(10px);
  `;
  serveChallengeDisplay.innerHTML = `
    <div style="font-size: 18px; margin-bottom: 16px; opacity: 0.85;">Show fingers in order to serve!</div>
    <div style="display: flex; gap: 16px; justify-content: center;">
      ${[0, 1, 2]
        .map(
          (i) => `
        <div id="serve-digit-${i}" style="
          width: 60px;
          height: 60px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          font-weight: bold;
          color: #888;
        ">-</div>
      `
        )
        .join('')}
    </div>
    <div style="margin-top: 16px; font-size: 14px; opacity: 0.7;">
      Time left: <span id="serve-timer">0.0</span>s
    </div>
  `;

  // Controls display (bottom)
  controlsDisplay = document.createElement('div');
  controlsDisplay.style.cssText = `
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.6);
    padding: 15px 20px;
    border-radius: 12px;
    font-size: 14px;
    text-align: center;
    backdrop-filter: blur(10px);
    max-width: 600px;
  `;
  controlsDisplay.innerHTML = `
    <div style="margin-bottom: 10px;">
      <strong>🏓 Motion Table Tennis</strong>
    </div>
    <div style="opacity: 0.9; line-height: 1.6;">
      Move your hand to control the paddle<br>
      <span style="font-size: 12px; opacity: 0.7;">
        Press SPACE to start • 1/2/3 fingers to aim • 5 fingers to smash<br>
        Show the finger-count digits in order to serve • First to 2 games wins
      </span>
    </div>
  `;

  // Append all elements
  uiOverlay.appendChild(scoreDisplay);
  uiOverlay.appendChild(gameScoreDisplay);
  uiOverlay.appendChild(statusDisplay);
  uiOverlay.appendChild(rallyDisplay);
  uiOverlay.appendChild(fingerCountDisplay);
  uiOverlay.appendChild(serveChallengeDisplay);
  uiOverlay.appendChild(controlsDisplay);

  if (container) {
    container.appendChild(uiOverlay);
  } else {
    document.body.appendChild(uiOverlay);
  }

  console.log('[Table Tennis] UI initialized');
}

export function updateScore(playerScore, botScore) {
  document.getElementById('player-score').textContent = playerScore;
  document.getElementById('bot-score').textContent = botScore;
}

export function updateGameScore(playerGames, botGames) {
  document.getElementById('player-games').textContent = playerGames;
  document.getElementById('bot-games').textContent = botGames;
}

export function updateRallyCount(count) {
  document.getElementById('rally-count').textContent = count;
}

export function updateFingerCount(count) {
  const el = document.getElementById('finger-count-value');
  if (!el) return;
  el.textContent = count === null ? '-' : count;
}

export function updateSwingDirection(direction) {
  const el = document.getElementById('swing-direction-value');
  if (!el) return;
  el.textContent = direction ? direction.toUpperCase() : '-';
}

export function updateSmashStatus(armed) {
  const el = document.getElementById('smash-status-value');
  if (!el) return;
  el.style.visibility = armed ? 'visible' : 'hidden';
}

export function showStatus(message, duration = 0) {
  statusDisplay.textContent = message;
  statusDisplay.style.display = 'block';

  if (duration > 0) {
    setTimeout(() => {
      hideStatus();
    }, duration);
  }
}

export function hideStatus() {
  statusDisplay.style.display = 'none';
}

/**
 * Switches the score panel's "BOT" label to "OPPONENT" and makes
 * showGameOver()/showPointWinner() refer to a real opponent instead of the
 * bot, without needing separate multiplayer-only copies of those functions.
 */
export function setMultiplayerMode(enabled) {
  isMultiplayerMode = enabled;
  const label = document.getElementById('bot-label');
  if (label) label.textContent = enabled ? 'OPPONENT' : 'BOT';
}

function opponentNoun() {
  return isMultiplayerMode ? 'Opponent' : 'Bot';
}

export function showGameOver(winner) {
  const message = winner === 'player' ? '🎉 You Won!' : `😔 ${opponentNoun()} Wins!`;
  const restartHint = isMultiplayerMode ? '' : '\n\nPress R to restart';
  showStatus(message + restartHint, 0);
}

/**
 * Live countdown (e.g. "3", "2", "1") counting down to a shared,
 * server-provided epoch timestamp, reusing the existing status display —
 * mirrors games/hand-sword/src/ui.js's showCountdown().
 */
export function showMultiplayerCountdown(startAtEpochMs) {
  clearMultiplayerCountdown();
  const tick = () => {
    const remainingMs = startAtEpochMs - Date.now();
    if (remainingMs <= 0) {
      clearMultiplayerCountdown();
      hideStatus();
      return;
    }
    showStatus(String(Math.ceil(remainingMs / 1000)), 0);
  };
  tick();
  countdownIntervalId = setInterval(tick, 200);
}

export function clearMultiplayerCountdown() {
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}

export function showServePrompt(server) {
  // Player serves are driven by the finger-count challenge (see
  // showServeChallenge()) rather than a button prompt.
  if (server === 'bot') {
    showStatus('Bot Serving...', 2000);
  }
}

export function showServeChallenge(digits) {
  digits.forEach((digit, i) => {
    const el = document.getElementById(`serve-digit-${i}`);
    if (!el) return;
    el.textContent = digit;
    el.style.color = '#888';
    el.style.background = 'rgba(255, 255, 255, 0.15)';
  });
  serveChallengeDisplay.style.display = 'block';
}

export function updateServeChallengeDisplay(state) {
  if (!state) return;

  state.digits.forEach((digit, i) => {
    const el = document.getElementById(`serve-digit-${i}`);
    if (!el) return;

    if (state.digitDone[i]) {
      el.style.color = '#4ade80';
      el.style.background = 'rgba(74, 222, 128, 0.2)';
    } else if (i === state.currentIndex) {
      el.style.color = '#ffcc00';
    } else {
      el.style.color = '#888';
    }
  });

  const timerEl = document.getElementById('serve-timer');
  if (timerEl) timerEl.textContent = (state.remainingMs / 1000).toFixed(1);
}

export function hideServeChallenge() {
  serveChallengeDisplay.style.display = 'none';
}

export function showPointWinner(winner) {
  const message = winner === 'player' ? 'Point!' : `${opponentNoun()} Point`;
  showStatus(message, 1500);
}

export function hideControls() {
  controlsDisplay.style.display = 'none';
}

export function showControls() {
  controlsDisplay.style.display = 'block';
}

export function cleanupUI() {
  clearMultiplayerCountdown();
  if (uiOverlay && uiOverlay.parentNode) {
    uiOverlay.parentNode.removeChild(uiOverlay);
  }
  console.log('[Table Tennis] UI cleaned up');
}
