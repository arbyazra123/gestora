/**
 * Table Tennis Game UI Overlay
 * Displays game status and controls. The point score itself lives in the
 * 3D scene now (see score-display.js) rather than here — mirrors pong's
 * approach of an in-scene score instead of a DOM overlay.
 */
import '../style.css';

let uiOverlay;
let gameScoreDisplay;
let statusDisplay;
let readyButton;
let fingerCountDisplay;
let serveChallengeDisplay;
let introOverlay;
let infoButton;

let isMultiplayerMode = false;
let countdownIntervalId = null;
let hasDismissedIntro = false;
let onPlayCallback = null;

export function setupUI(container, { onPlay } = {}) {
  onPlayCallback = onPlay || null;
  hasDismissedIntro = false;

  // Create UI overlay container
  uiOverlay = document.createElement('div');
  uiOverlay.id = 'table-tennis-ui';
  uiOverlay.className = 'tt-ui-overlay';

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

  // Multiplayer-only Ready toggle. A sibling of statusDisplay rather than a
  // child — showStatus() below replaces statusDisplay's textContent
  // wholesale on every status update, which would otherwise wipe this
  // button out the moment any status text changed. Positioned via CSS to
  // sit just under it instead.
  readyButton = document.createElement('button');
  readyButton.className = 'tt-ready-btn hidden';
  readyButton.id = 'tt-ready-btn';
  readyButton.textContent = 'Ready';

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

  // One-time "How to Play" intro, shown full-screen at the start of every
  // session and reopenable via infoButton — replaces the old permanent
  // bottom banner, which ate play-area space for the whole match (worst on
  // small/mobile screens). Its Play button also doubles as the touch
  // equivalent of "Press SPACE to Start", since mobile has no keyboard.
  introOverlay = document.createElement('div');
  introOverlay.id = 'tt-intro-overlay';
  introOverlay.className = 'tt-intro-overlay visible';
  introOverlay.innerHTML = `
    <div class="tt-intro-card">
      <div class="tt-intro__title"><strong>🏓 Motion Table Tennis</strong></div>
      <div class="tt-intro__hint">
        Move your hand to control the paddle<br>
        <span class="tt-intro__small">
          1/2/3 fingers to aim • 5 fingers to smash<br>
          Show the finger-count digits in order to serve • First to 2 games wins
        </span>
      </div>
      <button id="tt-intro-play-btn" class="tt-intro-play-btn">▶ Tap to Play</button>
    </div>
  `;

  // Small persistent button to reopen the how-to-play card mid-match.
  infoButton = document.createElement('button');
  infoButton.id = 'tt-info-button';
  infoButton.className = 'tt-info-button';
  infoButton.textContent = 'ⓘ';
  infoButton.setAttribute('aria-label', 'How to play');

  // Append all elements
  uiOverlay.appendChild(gameScoreDisplay);
  uiOverlay.appendChild(statusDisplay);
  uiOverlay.appendChild(readyButton);
  uiOverlay.appendChild(fingerCountDisplay);
  uiOverlay.appendChild(serveChallengeDisplay);
  uiOverlay.appendChild(introOverlay);
  uiOverlay.appendChild(infoButton);

  if (container) {
    container.appendChild(uiOverlay);
  } else {
    document.body.appendChild(uiOverlay);
  }

  attachIntroListeners();

  console.log('[Table Tennis] UI initialized');
}

function attachIntroListeners() {
  document.getElementById('tt-intro-play-btn').addEventListener('click', handleIntroDismiss);
  infoButton.addEventListener('click', () => showIntro());
}

/**
 * First dismissal fires onPlayCallback (the real game-start trigger);
 * reopening later via infoButton is purely informational, so it doesn't
 * fire the callback again.
 */
function handleIntroDismiss() {
  introOverlay.classList.remove('visible');
  const firstDismiss = !hasDismissedIntro;
  hasDismissedIntro = true;
  updateIntroButtonLabel();
  if (firstDismiss && onPlayCallback) {
    onPlayCallback();
  }
}

function updateIntroButtonLabel() {
  const btn = document.getElementById('tt-intro-play-btn');
  if (btn) btn.textContent = hasDismissedIntro ? 'Got it' : '▶ Tap to Play';
}

export function showIntro() {
  updateIntroButtonLabel();
  introOverlay.classList.add('visible');
}

export function updateGameScore(playerGames, botGames) {
  document.getElementById('player-games').textContent = playerGames;
  document.getElementById('bot-games').textContent = botGames;
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
 * Makes showGameOver()/showPointWinner() (and opponentNoun() below) refer
 * to a real opponent instead of the bot, without needing separate
 * multiplayer-only copies of those functions.
 */
export function setMultiplayerMode(enabled) {
  isMultiplayerMode = enabled;
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
/**
 * Explicit Ready toggle — replaces the old "sendReady() the instant
 * loading finished" behavior with a real user decision the player can
 * change their mind about. onToggle(isReady) is called on every click; the
 * caller (index.js) is responsible for actually sending ready/unready to
 * the server.
 */
export function showReadyButton(onToggle) {
  if (!readyButton) return;
  readyButton.classList.remove('hidden');
  readyButton.classList.remove('is-ready');
  readyButton.textContent = 'Ready';
  readyButton.onclick = () => {
    const isReady = !readyButton.classList.contains('is-ready');
    readyButton.classList.toggle('is-ready', isReady);
    readyButton.textContent = isReady ? 'Not Ready' : 'Ready';
    onToggle(isReady);
  };
}

export function hideReadyButton() {
  if (readyButton) readyButton.classList.add('hidden');
}

export function showMultiplayerCountdown(startAtEpochMs) {
  clearMultiplayerCountdown();
  hideReadyButton();
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

export function cleanupUI() {
  clearMultiplayerCountdown();
  if (uiOverlay && uiOverlay.parentNode) {
    uiOverlay.parentNode.removeChild(uiOverlay);
  }
  console.log('[Table Tennis] UI cleaned up');
}
