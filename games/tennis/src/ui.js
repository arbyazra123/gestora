/**
 * Table Tennis Game UI Overlay
 * Displays score, game status, and controls
 */
import '../style.css';

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
  uiOverlay.className = 'tt-ui-overlay';

  // Score display (top center)
  scoreDisplay = document.createElement('div');
  scoreDisplay.className = 'tt-score-panel';
  scoreDisplay.innerHTML = `
    <div class="tt-score-panel__side">
      <div class="tt-score-panel__label">YOU</div>
      <div id="player-score">0</div>
    </div>
    <div class="tt-score-panel__divider">:</div>
    <div class="tt-score-panel__side">
      <div id="bot-label" class="tt-score-panel__label">BOT</div>
      <div id="bot-score">0</div>
    </div>
  `;

  // Game score (games won)
  gameScoreDisplay = document.createElement('div');
  gameScoreDisplay.className = 'tt-games-panel';
  gameScoreDisplay.innerHTML = `
    <span id="player-games">0</span> - <span id="bot-games">0</span> Games
  `;

  // Status display (center)
  statusDisplay = document.createElement('div');
  statusDisplay.className = 'tt-status';
  statusDisplay.id = 'status-display';

  // Rally counter
  rallyDisplay = document.createElement('div');
  rallyDisplay.className = 'tt-rally-panel';
  rallyDisplay.innerHTML = `Rally: <span id="rally-count">0</span>`;

  // Live debug readout of the raw finger count, near the camera preview
  // (CameraService places that canvas at top:10px, right:10px, 240x180)
  fingerCountDisplay = document.createElement('div');
  fingerCountDisplay.id = 'finger-count';
  fingerCountDisplay.className = 'tt-finger-panel';
  fingerCountDisplay.innerHTML = `
    Fingers: <span id="finger-count-value" class="tt-finger-panel__value tt-finger-panel__value--amber">-</span>
    &nbsp;|&nbsp;
    Swing: <span id="swing-direction-value" class="tt-finger-panel__value tt-finger-panel__value--green">-</span>
    <div id="smash-status-value" class="tt-smash-status">
      🔥 SMASH READY!
    </div>
  `;

  // Serve challenge — 3 finger-count digits shown one at a time, grey
  // (pending) turning green (confirmed) as the player shows each in order.
  serveChallengeDisplay = document.createElement('div');
  serveChallengeDisplay.id = 'serve-challenge';
  serveChallengeDisplay.className = 'tt-serve-challenge';
  serveChallengeDisplay.innerHTML = `
    <div class="tt-serve-challenge__hint">Show fingers in order to serve!</div>
    <div class="tt-serve-challenge__digits">
      ${[0, 1, 2]
        .map(
          (i) => `
        <div id="serve-digit-${i}" class="tt-serve-digit tt-serve-digit--pending">-</div>
      `
        )
        .join('')}
    </div>
    <div class="tt-serve-challenge__timer-row">
      Time left: <span id="serve-timer">0.0</span>s
    </div>
  `;

  // Controls display (bottom)
  controlsDisplay = document.createElement('div');
  controlsDisplay.className = 'tt-controls-panel';
  controlsDisplay.innerHTML = `
    <div class="tt-controls-panel__title">
      <strong>🏓 Motion Table Tennis</strong>
    </div>
    <div class="tt-controls-panel__hint">
      Move your hand to control the paddle<br>
      <span class="tt-controls-panel__small">
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
  el.classList.toggle('armed', armed);
}

export function showStatus(message, duration = 0) {
  statusDisplay.textContent = message;
  statusDisplay.classList.add('visible');

  if (duration > 0) {
    setTimeout(() => {
      hideStatus();
    }, duration);
  }
}

export function hideStatus() {
  statusDisplay.classList.remove('visible');
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
    el.className = 'tt-serve-digit tt-serve-digit--pending';
  });
  serveChallengeDisplay.classList.add('visible');
}

export function updateServeChallengeDisplay(state) {
  if (!state) return;

  state.digits.forEach((digit, i) => {
    const el = document.getElementById(`serve-digit-${i}`);
    if (!el) return;

    if (state.digitDone[i]) {
      el.className = 'tt-serve-digit tt-serve-digit--done';
    } else if (i === state.currentIndex) {
      el.className = 'tt-serve-digit tt-serve-digit--current';
    } else {
      el.className = 'tt-serve-digit tt-serve-digit--pending';
    }
  });

  const timerEl = document.getElementById('serve-timer');
  if (timerEl) timerEl.textContent = (state.remainingMs / 1000).toFixed(1);
}

export function hideServeChallenge() {
  serveChallengeDisplay.classList.remove('visible');
}

export function showPointWinner(winner) {
  const message = winner === 'player' ? 'Point!' : `${opponentNoun()} Point`;
  showStatus(message, 1500);
}

export function hideControls() {
  controlsDisplay.classList.add('hidden');
}

export function showControls() {
  controlsDisplay.classList.remove('hidden');
}

export function cleanupUI() {
  clearMultiplayerCountdown();
  if (uiOverlay && uiOverlay.parentNode) {
    uiOverlay.parentNode.removeChild(uiOverlay);
  }
  console.log('[Table Tennis] UI cleaned up');
}
