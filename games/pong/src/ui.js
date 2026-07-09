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
let controlsDisplay;
let abilityPanelDisplay;
let fingerCountDisplay;

function patternHint(pattern) {
  return pattern.join(' → '); // e.g. "5 → 3 → 2"
}

export function setupUI(container) {
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

  controlsDisplay = document.createElement('div');
  controlsDisplay.className = 'pong-controls-panel';
  controlsDisplay.innerHTML = `
    <div class="pong-controls-panel__title">
      <strong>Hand Pong</strong>
    </div>
    <div class="pong-controls-panel__hint">
      Move your hand left/right to control the paddle<br>
      <span class="pong-controls-panel__small">
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
  if (uiOverlay && uiOverlay.parentNode) {
    uiOverlay.parentNode.removeChild(uiOverlay);
  }
  console.log('[Pong] UI cleaned up');
}
