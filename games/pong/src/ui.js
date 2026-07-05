/**
 * Pong Game UI Overlay
 * Displays score, game status, controls, and special-ability prompts
 */

import { ABILITY_TYPES } from './abilities.js';

let uiOverlay;
let skillTextFar;
let skillTextNear;
let statusDisplay;
let controlsDisplay;
let abilityPanelDisplay;
let fingerCountDisplay;

// "Lying flat on the table" look for the skill-activated text (the score
// display itself is now real 3D geometry — see score-display.js — so it
// doesn't need this CSS approximation).
const TABLE_WARP_TRANSFORM = 'perspective(400px) rotateX(45deg)';

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

  // "Skill Activated" call-outs, warped with a CSS 3D tilt, anchored to the
  // center of each side's half of the table (see positionSkillTextAnchors())
  // so they sit on the table surface itself instead of floating above it.
  skillTextFar = document.createElement('div');
  skillTextFar.id = 'skill-text-bot';
  skillTextFar.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    transform: translate(-50%, -50%) ${TABLE_WARP_TRANSFORM};
    color: #ff5a3c;
    font-weight: bold;
    font-size: 16px;
    text-shadow: 0 0 4px rgba(255, 90, 60, 0.8);
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.15s;
  `;
  skillTextFar.textContent = 'Skill Activated';

  skillTextNear = document.createElement('div');
  skillTextNear.id = 'skill-text-player';
  skillTextNear.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    transform: translate(-50%, -50%) ${TABLE_WARP_TRANSFORM};
    color: #ff5a3c;
    font-weight: bold;
    font-size: 24px;
    text-shadow: 0 0 10px rgba(255, 90, 60, 0.8);
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.15s;
  `;
  skillTextNear.textContent = 'Skill Activated';

  abilityPanelDisplay = document.createElement('div');
  abilityPanelDisplay.id = 'ability-panel';
  abilityPanelDisplay.style.cssText = `
    position: absolute;
    top: 20px;
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
      <strong>Hand Pong</strong>
    </div>
    <div style="opacity: 1; line-height: 1.6;">
      Move your hand left/right to control the paddle<br>
      <span style="font-size: 10px; opacity: 0.7;">
        Press SPACE to serve • First to 7 points wins • Hold up finger-count patterns to trigger abilities above
      </span>
    </div>
  `;

  uiOverlay.appendChild(skillTextFar);
  uiOverlay.appendChild(skillTextNear);
  // uiOverlay.appendChild(statusDisplay);
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
  // statusDisplay.textContent = message;
  // statusDisplay.style.display = 'block';

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
  if (uiOverlay && uiOverlay.parentNode) {
    uiOverlay.parentNode.removeChild(uiOverlay);
  }
  console.log('[Pong] UI cleaned up');
}
