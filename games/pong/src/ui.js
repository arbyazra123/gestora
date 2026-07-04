/**
 * Pong Game UI Overlay
 * Displays score, game status, controls, and special-ability prompts
 */

import { ABILITY_TYPES } from './abilities.js';

const ABILITY_ICONS = { paddleBoost: '⚡', slowMo: '🐌', shield: '🛡️' };

let uiOverlay;
let scoreDisplay;
let statusDisplay;
let controlsDisplay;
let abilityPanelDisplay;
let fingerCountDisplay;

function patternHint(pattern) {
  return pattern.join(' → '); // e.g. "5 → 3 → 2"
}

export function setupUI(container) {
  uiOverlay = document.createElement('div');
  uiOverlay.id = 'pong-ui';
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

  scoreDisplay = document.createElement('div');
  scoreDisplay.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    padding: 15px 25px;
    border-radius: 12px;
    display: flex;
    gap: 20px;
    align-items: center;
    font-size: 22px;
    font-weight: bold;
    backdrop-filter: blur(10px);
  `;
  scoreDisplay.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 14px; opacity: 0.7; margin-bottom: 5px;">YOU</div>
      <div id="player-score">0</div>
      <div id="player-ability" style="font-size: 12px; color: #4ade80; margin-top: 4px; min-height: 14px;"></div>
    </div>
    <div style="font-size: 38px; opacity: 0.5;">:</div>
    <div style="text-align: center;">
      <div style="font-size: 14px; opacity: 0.7; margin-bottom: 5px;">BOT</div>
      <div id="bot-score">0</div>
      <div id="bot-ability" style="font-size: 12px; color: #f87171; margin-top: 4px; min-height: 14px;"></div>
    </div>
  `;

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
    white-space: pre-line;
    display: none;
    backdrop-filter: blur(10px);
  `;
  statusDisplay.id = 'status-display';

  abilityPanelDisplay = document.createElement('div');
  abilityPanelDisplay.id = 'ability-panel';
  abilityPanelDisplay.style.cssText = `
    position: absolute;
    top: 120px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    padding: 10px 20px;
    border-radius: 10px;
    backdrop-filter: blur(10px);
    display: flex;
    gap: 20px;
  `;
  abilityPanelDisplay.innerHTML = Object.entries(ABILITY_TYPES)
    .map(
      ([key, ability]) => `
    <div style="text-align: center;">
      <div style="font-size: 20px;">${ABILITY_ICONS[key] || '⚡'}</div>
      <div style="font-weight: bold; font-size: 12px;">${ability.name}</div>
      <div style="opacity: 0.7; font-size: 11px;">${patternHint(ability.pattern)}</div>
      <div id="cooldown-${key}" style="margin-top: 4px; font-size: 12px; color: #4ade80;">Ready</div>
    </div>
  `
    )
    .join('');

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
  fingerCountDisplay.innerHTML = `Fingers: <span id="finger-count-value" style="font-weight: bold; color: #ffcc00;">-</span>`;

  controlsDisplay = document.createElement('div');
  controlsDisplay.style.cssText = `
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.6);
    padding: 10px 20px;
    border-radius: 12px;
    font-size: 14px;
    text-align: center;
    backdrop-filter: blur(10px);
    max-width: 600px;
  `;
  controlsDisplay.innerHTML = `
    <div style="margin-bottom: 10px;">
      <strong>🏓 Hand Pong</strong>
    </div>
    <div style="opacity: 1; line-height: 1.6;">
      Move your hand left/right to control the paddle<br>
      <span style="font-size: 10px; opacity: 0.7;">
        Press SPACE to serve • First to 7 points wins • Hold up finger-count patterns to trigger abilities above
      </span>
    </div>
  `;

  uiOverlay.appendChild(scoreDisplay);
  uiOverlay.appendChild(statusDisplay);
  uiOverlay.appendChild(abilityPanelDisplay);
  uiOverlay.appendChild(fingerCountDisplay);
  uiOverlay.appendChild(controlsDisplay);

  if (container) {
    container.appendChild(uiOverlay);
  } else {
    document.body.appendChild(uiOverlay);
  }

  console.log('[Pong] UI initialized');
}

export function updateScore(playerScore, botScore) {
  document.getElementById('player-score').textContent = playerScore;
  document.getElementById('bot-score').textContent = botScore;
}

export function showStatus(message, duration = 0) {
  statusDisplay.textContent = message;
  statusDisplay.style.display = 'block';

  if (duration > 0) {
    setTimeout(() => hideStatus(), duration);
  }
}

export function hideStatus() {
  statusDisplay.style.display = 'none';
}

export function showGameOver(winner) {
  const message = winner === 'player' ? '🎉 You Won!' : '😔 Bot Wins!';
  showStatus(message + '\n\nPress R to restart', 0);
}

export function showServePrompt(server) {
  const message = server === 'player' ? 'Your Serve\nPress SPACE' : 'Bot Serving...';
  showStatus(message, 2000);
}

export function showPointWinner(winner) {
  const message = winner === 'player' ? 'Point!' : 'Bot Point';
  showStatus(message, 1200);
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
      el.style.color = '#4ade80';
    } else {
      el.textContent = `${Math.ceil(remaining / 1000)}s`;
      el.style.color = '#f87171';
    }
  }
}

export function updateActiveAbility(side, type) {
  const el = document.getElementById(`${side}-ability`);
  if (!el) return;
  el.textContent = type ? `⚡ ${ABILITY_TYPES[type]?.name || type}` : '';
}

export function cleanupUI() {
  if (uiOverlay && uiOverlay.parentNode) {
    uiOverlay.parentNode.removeChild(uiOverlay);
  }
  console.log('[Pong] UI cleaned up');
}
