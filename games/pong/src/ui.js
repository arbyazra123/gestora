/**
 * Pong Game UI Overlay
 * Displays score, game status, controls, and special-ability prompts
 */
import '../style.css';
import { ABILITY_TYPES } from './abilities.js';

let uiOverlay;
let skillTextFar;
let skillTextNear;
let statusDisplay;
let abilityPanelDisplay;
let fingerCountDisplay;
let introOverlay;
let infoButton;

let hasDismissedIntro = false;
let onPlayCallback = null;
let statusTimeoutId = null;
let isMultiplayerMode = false;
let countdownIntervalId = null;

function patternHint(pattern) {
  return pattern.join(' → '); // e.g. "5 → 3 → 2"
}

export function setupUI(container, { onPlay } = {}) {
  onPlayCallback = onPlay || null;
  hasDismissedIntro = false;

  uiOverlay = document.createElement('div');
  uiOverlay.id = 'pong-ui';
  uiOverlay.className = 'pong-ui-overlay';

  // "Skill Activated" call-outs, warped with a CSS 3D tilt (see
  // .pong-skill-text's transform in style.css), anchored to the center of
  // each side's half of the table (see positionSkillTextAnchors()) so they
  // sit on the table surface itself instead of floating above it.
  skillTextFar = document.createElement('div');
  skillTextFar.id = 'skill-text-bot';
  skillTextFar.className = 'pong-skill-text pong-skill-text--far';
  skillTextFar.textContent = 'Skill Activated';

  skillTextNear = document.createElement('div');
  skillTextNear.id = 'skill-text-player';
  skillTextNear.className = 'pong-skill-text pong-skill-text--near';
  skillTextNear.textContent = 'Skill Activated';

  // Was previously never created/appended (statusDisplay stayed undefined),
  // so showGameOver/showServePrompt/showPointWinner/ability toasts all
  // silently did nothing, and hideStatus() throwing on the undefined
  // reference was quietly killing whatever ran after it (e.g. serve()'s
  // setAbilitiesEnabled(true) call).
  statusDisplay = document.createElement('div');
  statusDisplay.className = 'pong-status';
  statusDisplay.id = 'pong-status-display';

  abilityPanelDisplay = document.createElement('div');
  abilityPanelDisplay.id = 'ability-panel';
  abilityPanelDisplay.className = 'pong-ability-panel';
  abilityPanelDisplay.innerHTML = Object.entries(ABILITY_TYPES)
    .map(
      ([key, ability]) => `
    <div class="pong-ability-card">
      <div class="pong-ability-card__name">${ability.name}</div>
      <div class="pong-ability-card__hint">${patternHint(ability.pattern)}</div>
      <div id="cooldown-${key}" class="pong-ability-card__cooldown pong-ability-card__cooldown--ready">Ready</div>
    </div>
  `
    )
    .join('');

  // Live debug readout of the raw finger count, near the camera preview
  // (CameraService places that canvas at top:48px, right:10px, 240x180)
  fingerCountDisplay = document.createElement('div');
  fingerCountDisplay.id = 'finger-count';
  fingerCountDisplay.className = 'pong-finger-panel';
  fingerCountDisplay.innerHTML = `Fingers: <span id="finger-count-value" class="pong-finger-panel__value">-</span>`;

  // One-time "How to Play" intro, shown full-screen at the start of every
  // session and reopenable via infoButton — replaces the old permanent
  // bottom banner, which ate play-area space for the whole match (worst on
  // small/mobile screens). Its Play button also doubles as the touch
  // equivalent of "Press SPACE to serve", since mobile has no keyboard.
  introOverlay = document.createElement('div');
  introOverlay.id = 'pong-intro-overlay';
  introOverlay.className = 'pong-intro-overlay visible';
  introOverlay.innerHTML = `
    <div class="pong-intro-card">
      <div class="pong-intro__title"><strong>Hand Pong</strong></div>
      <div class="pong-intro__hint">
        Move your hand left/right to control the paddle<br>
        <span class="pong-intro__small">
          First to 7 points wins • Hold up finger-count patterns to trigger abilities above
        </span>
      </div>
      <button id="pong-intro-play-btn" class="pong-intro-play-btn">▶ Tap to Play</button>
    </div>
  `;

  // Small persistent button to reopen the how-to-play card mid-match.
  infoButton = document.createElement('button');
  infoButton.id = 'pong-info-button';
  infoButton.className = 'pong-info-button';
  infoButton.textContent = 'ⓘ';
  infoButton.setAttribute('aria-label', 'How to play');

  uiOverlay.appendChild(skillTextFar);
  uiOverlay.appendChild(skillTextNear);
  uiOverlay.appendChild(statusDisplay);
  uiOverlay.appendChild(abilityPanelDisplay);
  uiOverlay.appendChild(fingerCountDisplay);
  uiOverlay.appendChild(introOverlay);
  uiOverlay.appendChild(infoButton);

  if (container) {
    container.appendChild(uiOverlay);
  } else {
    document.body.appendChild(uiOverlay);
  }

  attachIntroListeners();

  console.log('[Pong] UI initialized');
}

function attachIntroListeners() {
  document.getElementById('pong-intro-play-btn').addEventListener('click', handleIntroDismiss);
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
  const btn = document.getElementById('pong-intro-play-btn');
  if (btn) btn.textContent = hasDismissedIntro ? 'Got it' : '▶ Tap to Play';
}

export function showIntro() {
  updateIntroButtonLabel();
  introOverlay.classList.add('visible');
}

/**
 * Reposition the two "Skill Activated" anchors the same way, to the center
 * of each side's half of the table.
 */
export function positionSkillTextAnchors(botScreenPos, playerScreenPos) {
  skillTextFar.style.left = `${botScreenPos.x}px`;
  skillTextFar.style.top = `${botScreenPos.y}px`;
  skillTextNear.style.left = `${playerScreenPos.x}px`;
  skillTextNear.style.top = `${playerScreenPos.y}px`;
}

export function showStatus(message, duration = 0) {
  statusDisplay.textContent = message;
  statusDisplay.classList.add('visible');

  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }
  if (duration > 0) {
    statusTimeoutId = setTimeout(() => hideStatus(), duration);
  }
}

export function hideStatus() {
  statusDisplay.classList.remove('visible');
}

/**
 * Makes showGameOver()/showPointWinner()/getOpponentNoun() refer to a real
 * opponent instead of the bot, without needing separate multiplayer-only
 * copies of those functions — mirrors games/tennis/src/ui.js's same pattern.
 */
export function setMultiplayerMode(enabled) {
  isMultiplayerMode = enabled;
}

export function getOpponentNoun() {
  return isMultiplayerMode ? 'Opponent' : 'Bot';
}

export function showGameOver(winner) {
  const message = winner === 'player' ? '🎉 You Won!' : `😔 ${getOpponentNoun()} Wins!`;
  const restartHint = isMultiplayerMode ? '' : '\n\nPress R to restart';
  showStatus(message + restartHint, 0);
}

export function showServePrompt(server) {
  const message = server === 'player' ? 'Your Serve\nPress SPACE' : 'Bot Serving...';
  showStatus(message, 2000);
}

export function showPointWinner(winner) {
  const message = winner === 'player' ? 'Point!' : `${getOpponentNoun()} Point`;
  showStatus(message, 1200);
}

/**
 * Live countdown (e.g. "3", "2", "1") counting down to a shared,
 * server-provided epoch timestamp, reusing the existing status display —
 * mirrors games/tennis/src/ui.js's showMultiplayerCountdown().
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

export function updateFingerCount(count) {
  const el = document.getElementById('finger-count-value');
  if (!el) return;
  el.textContent = count === null ? '-' : count;
}

export function updateAbilityCooldowns(snapshot) {
  for (const key of Object.keys(ABILITY_TYPES)) {
    const el = document.getElementById(`cooldown-${key}`);
    if (!el) continue;

    const remaining = snapshot[key] || 0;
    if (remaining <= 0) {
      el.textContent = 'Ready';
      el.classList.remove('pong-ability-card__cooldown--active');
      el.classList.add('pong-ability-card__cooldown--ready');
    } else {
      el.textContent = `${Math.ceil(remaining / 1000)}s`;
      el.classList.remove('pong-ability-card__cooldown--ready');
      el.classList.add('pong-ability-card__cooldown--active');
    }
  }
}

export function updateActiveAbility(side, type) {
  const el = side === 'player' ? skillTextNear : skillTextFar;
  if (!el) return;

  if (type) {
    el.textContent = `${ABILITY_TYPES[type]?.name || type} Activated`;
    el.style.opacity = '1';
  } else {
    el.style.opacity = '0';
  }
}

export function cleanupUI() {
  clearMultiplayerCountdown();
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }
  if (uiOverlay && uiOverlay.parentNode) {
    uiOverlay.parentNode.removeChild(uiOverlay);
  }
  console.log('[Pong] UI cleaned up');
}
