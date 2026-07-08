import { updateBPM, startAudio, unlockAudioContext, pauseAudio, stopAudio, setTheme, themes, currentBPM } from './audio.js';
import { setTwoHandMode, setDifficulty, clearAllBoxes, resetScore } from './game-logic.js';
import { setFlipped, getFlipped, updateHandTrackingMode } from './hand-tracking.js';
import { resetHealthMeter } from './health-meter.js';
import { resetBackgroundEffects } from './background-effects.js';

// ---------- CREATE UI OVERLAY ----------
function createUIOverlay() {
  // Check if UI already exists
  if (document.getElementById('game-ui-overlay')) {
    return;
  }

  const uiHTML = `
    <div id="game-ui-overlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 100;">
      <!-- Top Controls -->
      <div class="top-controls" style="position: absolute; top: 80px; left: 20px; display: flex; flex-direction: column; gap: 10px; pointer-events: auto;">
        <button id="flip-toggle" class="control-btn">Flip: OFF (Direct)</button>

        <div class="bpm-control">
          <label style="color: #00ffff; font-size: 0.9em;">BPM: <span id="bpm-value">120</span></label>
          <input type="range" id="bpm-slider" min="60" max="200" value="120" step="10" style="width: 150px;">
        </div>

        <div class="playback-controls" style="display: flex; gap: 5px;">
          <button id="play-btn" class="control-btn">▶ Play</button>
          <button id="pause-btn" class="control-btn hidden">⏸ Pause</button>
          <button id="reset-btn" class="control-btn">↻ Reset</button>
        </div>

        <div class="hand-mode-controls" style="display: flex; gap: 5px;">
          <button id="one-hand-btn" class="control-btn">1 Hand</button>
          <button id="two-hand-btn" class="control-btn active">2 Hands</button>
        </div>

        <div class="difficulty-controls" style="display: flex; gap: 5px;">
          <button id="easy-btn" class="control-btn">Easy</button>
          <button id="medium-btn" class="control-btn active">Medium</button>
          <button id="hard-btn" class="control-btn">Hard</button>
        </div>

        <div class="theme-control">
          <label style="color: #00ffff; font-size: 0.9em;">Track: <span id="theme-name">Midnight Drive</span></label>
          <select id="theme-select" class="control-select" style="width: 150px;">
            <option value="synthwave">Midnight Drive</option>
            <option value="cyberpunk">Chrome District</option>
            <option value="chillwave">Ocean Haze</option>
            <option value="dnb">Breakneck</option>
          </select>
        </div>
      </div>

      <!-- Score Display (Top Center) -->
      <div style="position: absolute; top: 20px; left: 50%; transform: translateX(-50%); text-align: center; pointer-events: none;">
        <div style="font-size: 2em; font-weight: bold; color: #00ffff; text-shadow: 0 0 10px #00ffff;">
          Score: <span id="score-display">0</span>
        </div>
        <div id="combo-display" style="font-size: 1.5em; font-weight: bold; color: #ff00ff; text-shadow: 0 0 10px #ff00ff; margin-top: 10px;">
          Combo: 0x
        </div>
      </div>

      <!-- Health Meter (Bottom Right) -->
      <div style="position: absolute; bottom: 20px; right: 20px; pointer-events: none;">
        <canvas id="health-meter" width="200" height="150"></canvas>
      </div>

      <!-- Opponent Panel (Top Right) -->
      <div id="opponent-panel" class="hidden" style="position: absolute; top: 20px; right: 20px; text-align: right; pointer-events: none;">
        <div style="font-size: 1.3em; font-weight: bold; color: #ff00ff; text-shadow: 0 0 10px #ff00ff;">
          Opponent: <span id="opponent-score-display">0</span>
        </div>
        <div id="opponent-combo-display" style="font-size: 1em; color: #00ffff;">Combo: 0x</div>
      </div>

      <!-- Multiplayer Status Overlay (Center) -->
      <div id="multiplayer-overlay" class="hidden" style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); text-align: center; pointer-events: none;">
        <div id="multiplayer-status-text" style="font-size: 1.8em; font-weight: bold; color: #00ffff; text-shadow: 0 0 10px #00ffff;"></div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', uiHTML);
  injectUIStyles();
}

// ---------- INJECT UI STYLES ----------
function injectUIStyles() {
  if (document.getElementById('game-ui-styles')) return;

  const style = document.createElement('style');
  style.id = 'game-ui-styles';
  style.textContent = `
    .control-btn {
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.7);
      border: 2px solid #00ffff;
      border-radius: 5px;
      color: #00ffff;
      font-size: 0.9em;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .control-btn:hover {
      background: #00ffff;
      color: #000;
    }

    .control-btn.active {
      background: #00ffff;
      color: #000;
    }

    .control-btn.hidden {
      display: none;
    }

    #multiplayer-overlay.hidden,
    #opponent-panel.hidden {
      display: none;
    }

    .control-select {
      padding: 6px;
      background: rgba(0, 0, 0, 0.7);
      border: 2px solid #00ffff;
      border-radius: 5px;
      color: #00ffff;
      font-size: 0.9em;
      cursor: pointer;
    }

    input[type="range"] {
      accent-color: #00ffff;
    }
  `;

  document.head.appendChild(style);
}

// ---------- UI SETUP ----------
export function setupUI(scene, leftSwordGroup, onGameReset, multiplayerOptions = null) {
  // Create UI overlay if it doesn't exist
  createUIOverlay();

  // Flip toggle button
  const flipToggle = document.getElementById('flip-toggle');
  flipToggle.addEventListener('click', () => {
    const newFlipState = !getFlipped();
    setFlipped(newFlipState);
    flipToggle.textContent = newFlipState ? 'Flip: ON (Mirrored)' : 'Flip: OFF (Direct)';
  });

  // BPM control slider
  const bpmSlider = document.getElementById('bpm-slider');
  const bpmValue = document.getElementById('bpm-value');
  bpmSlider.addEventListener('input', (e) => {
    const newBPM = parseInt(e.target.value);
    updateBPM(newBPM);
    bpmValue.textContent = newBPM;
  });

  // Playback control buttons
  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const resetBtn = document.getElementById('reset-btn');

  playBtn.addEventListener('click', async () => {
    if (multiplayerOptions?.wantsMultiplayer) {
      // Unlock the audio context now, inside this click's gesture chain —
      // actual transport start is deferred to the server-synced start
      // epoch (see beginPlayback(), called later from index.js).
      await unlockAudioContext();
      playBtn.disabled = true;
      playBtn.textContent = '⏳ Ready';
      multiplayerOptions.onReady();
      return;
    }

    await startAudio();
    playBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
  });

  pauseBtn.addEventListener('click', () => {
    pauseAudio();
    pauseBtn.classList.add('hidden');
    playBtn.classList.remove('hidden');
  });

  resetBtn.addEventListener('click', () => {
    stopAudio();
    clearAllBoxes(scene);
    resetScore();
    resetHealthMeter();
    resetBackgroundEffects();

    // Hide pause, show play
    pauseBtn.classList.add('hidden');
    playBtn.classList.remove('hidden');

    // Call the callback if provided
    if (onGameReset) {
      onGameReset();
    }
  });

  // Hand mode control buttons
  const oneHandBtn = document.getElementById('one-hand-btn');
  const twoHandBtn = document.getElementById('two-hand-btn');

  // Set initial active state
  twoHandBtn.classList.add('active');

  oneHandBtn.addEventListener('click', () => {
    setTwoHandMode(false);
    oneHandBtn.classList.add('active');
    twoHandBtn.classList.remove('active');

    // Hide left sword in 1-hand mode
    leftSwordGroup.visible = false;

    // Update hand tracking to 1 hand
    updateHandTrackingMode();
  });

  twoHandBtn.addEventListener('click', () => {
    setTwoHandMode(true);
    twoHandBtn.classList.add('active');
    oneHandBtn.classList.remove('active');

    // Show both swords in 2-hand mode
    leftSwordGroup.visible = true;

    // Update hand tracking to 2 hands
    updateHandTrackingMode();
  });

  // Difficulty control buttons
  const easyBtn = document.getElementById('easy-btn');
  const mediumBtn = document.getElementById('medium-btn');
  const hardBtn = document.getElementById('hard-btn');

  // Set initial active state (medium)
  mediumBtn.classList.add('active');

  easyBtn.addEventListener('click', () => {
    setDifficulty('easy');
    easyBtn.classList.add('active');
    mediumBtn.classList.remove('active');
    hardBtn.classList.remove('active');
  });

  mediumBtn.addEventListener('click', () => {
    setDifficulty('medium');
    mediumBtn.classList.add('active');
    easyBtn.classList.remove('active');
    hardBtn.classList.remove('active');
  });

  hardBtn.addEventListener('click', () => {
    setDifficulty('hard');
    hardBtn.classList.add('active');
    easyBtn.classList.remove('active');
    mediumBtn.classList.remove('active');
  });

  // Theme selector
  const themeSelect = document.getElementById('theme-select');
  const themeName = document.getElementById('theme-name');

  themeSelect.addEventListener('change', (e) => {
    const newTheme = e.target.value;
    themeName.textContent = themes[newTheme].name;

    // Re-initialize theme instruments
    setTheme(newTheme);

    console.log(`Theme changed to: ${themes[newTheme].name}`);
  });
}

// ---------- CLEANUP UI ----------
export function cleanupUI() {
  const overlay = document.getElementById('game-ui-overlay');
  if (overlay) {
    overlay.remove();
  }

  const styles = document.getElementById('game-ui-styles');
  if (styles) {
    styles.remove();
  }

  clearCountdownInterval();
}

// ---------- MULTIPLAYER UI ----------
let countdownIntervalId = null;

function clearCountdownInterval() {
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}

export function showMultiplayerOverlay(statusText) {
  const overlay = document.getElementById('multiplayer-overlay');
  const text = document.getElementById('multiplayer-status-text');
  if (!overlay || !text) return;
  text.textContent = statusText;
  overlay.classList.remove('hidden');

  const opponentPanel = document.getElementById('opponent-panel');
  if (opponentPanel) opponentPanel.classList.remove('hidden');
}

export function hideMultiplayerOverlay() {
  const overlay = document.getElementById('multiplayer-overlay');
  if (overlay) overlay.classList.add('hidden');
  clearCountdownInterval();
}

export function showCountdown(startAtEpochMs) {
  clearCountdownInterval();
  const tick = () => {
    const remainingMs = startAtEpochMs - Date.now();
    if (remainingMs <= 0) {
      clearCountdownInterval();
      hideMultiplayerOverlay();
      return;
    }
    showMultiplayerOverlay(`Starting in ${Math.ceil(remainingMs / 1000)}...`);
  };
  tick();
  countdownIntervalId = setInterval(tick, 200);
}

export function updateOpponentScore(score, combo) {
  const scoreEl = document.getElementById('opponent-score-display');
  const comboEl = document.getElementById('opponent-combo-display');
  if (scoreEl) scoreEl.textContent = score;
  if (comboEl) comboEl.textContent = `Combo: ${combo}x`;
}

export function showMatchResult(won) {
  showMultiplayerOverlay(won ? '🏆 You Win!' : 'Match Ended');
}

export function lockControls() {
  ['bpm-slider', 'easy-btn', 'medium-btn', 'hard-btn', 'theme-select', 'reset-btn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
}

export function unlockControls() {
  ['bpm-slider', 'easy-btn', 'medium-btn', 'hard-btn', 'theme-select', 'reset-btn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}
