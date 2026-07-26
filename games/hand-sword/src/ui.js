import '../style.css';
import { startAudio, unlockAudioContext, pauseAudio, stopAudio, setTheme, themes } from './audio.js';
import { setTwoHandMode, clearAllBoxes, resetScore } from './game-logic.js';
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
    <div id="game-ui-overlay" class="ui-overlay">
      <!-- Song Progress (very top, full width) -->
      <div id="progress-bar-wrap" class="progress-bar-wrap">
        <div id="progress-bar-fill" class="progress-bar-fill"></div>
      </div>

      <!-- Score Display (Top Center) -->
      <div id="score-hud" class="score-hud">
        <div class="score-hud__score">
          Score: <span id="score-display">0</span>
        </div>
        <div id="combo-display" class="score-hud__combo">
          Combo: 0x
        </div>
        <div class="score-hud__hitmiss">
          <span class="hitmiss hitmiss--hit">Hits: <span id="hits-display">0</span></span>
          <span class="hitmiss hitmiss--miss">Misses: <span id="misses-display">0</span></span>
        </div>
      </div>

      <!-- Health Meter (Bottom Right, above the bottom-center dock) -->
      <div class="health-meter-wrap">
        <canvas id="health-meter" width="200" height="150"></canvas>
      </div>

      <!-- Settings panel backdrop (click outside to collapse) -->
      <div id="sidebar-backdrop" class="panel-backdrop"></div>

      <!-- Settings panel — anchored above the dock, opens upward -->
      <div id="game-sidebar" class="settings-panel">
        <div class="settings-panel__header">Settings</div>
        <div class="settings-panel__grid">
          <button id="flip-toggle" class="control-btn">Flip: OFF (Direct)</button>

          <div class="control-group">
            <button id="one-hand-btn" class="control-btn">1 Hand</button>
            <button id="two-hand-btn" class="control-btn active">2 Hands</button>
          </div>

          <div class="theme-control">
            <label for="theme-select" class="theme-control__label">Track</label>
            <select id="theme-select" class="control-select">
              <option value="chillwave">Ocean Haze (Easy)</option>
              <option value="synthwave">Midnight Drive (Medium)</option>
              <option value="billiejean">Billie Jean (Medium)</option>
              <option value="sweetchild">Sweet Child O' Mine (Medium)</option>
              <option value="cyberpunk">Chrome District (Hard)</option>
              <option value="sevennation">Seven Nation Army (Hard)</option>
              <option value="dnb">Breakneck (Hard)</option>
            </select>
          </div>

          <!-- Multiplayer-only: shown/hidden via setupUI()'s multiplayerOptions
               check, same as before — just relocated here (settings panel)
               instead of floating in the center pre-match overlay. -->
          <div id="multiplayer-mode-toggle" class="theme-control multiplayer-mode-toggle hidden">
            <label class="theme-control__label">Match Mode</label>
            <div class="control-group">
              <button id="mode-versus-btn" class="control-btn active">Versus</button>
              <button id="mode-coop-btn" class="control-btn">Co-op</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom-center control dock -->
      <div class="control-dock">
        <button id="sidebar-toggle" class="dock-btn" aria-label="Toggle settings">
          <span class="dock-btn__icon">⚙</span>
          <span class="dock-btn__label">Settings</span>
        </button>
        <button id="play-btn" class="dock-btn dock-btn--primary">
          <span class="dock-btn__icon">▶</span>
          <span class="dock-btn__label">Play</span>
        </button>
        <button id="pause-btn" class="dock-btn dock-btn--primary hidden">
          <span class="dock-btn__icon">⏸</span>
          <span class="dock-btn__label">Pause</span>
        </button>
        <button id="reset-btn" class="dock-btn">
          <span class="dock-btn__icon">↻</span>
          <span class="dock-btn__label">Reset</span>
        </button>
      </div>

      <!-- Opponent Panel (Top Right) -->
      <div id="opponent-panel" class="opponent-panel hidden">
        <div class="opponent-panel__score">
          Opponent: <span id="opponent-score-display">0</span>
        </div>
        <div id="opponent-combo-display" class="opponent-panel__combo">Combo: 0x</div>
        <div class="opponent-panel__hitmiss">
          <span class="hitmiss hitmiss--hit">Hits: <span id="opponent-hits-display">0</span></span>
          <span class="hitmiss hitmiss--miss">Misses: <span id="opponent-misses-display">0</span></span>
        </div>
      </div>

      <!-- Multiplayer Status Overlay (Center) -->
      <div id="multiplayer-overlay" class="multiplayer-overlay hidden">
        <div id="multiplayer-status-text" class="multiplayer-overlay__text"></div>
      </div>

      <!-- Results Overlay (Center) -->
      <div id="results-overlay" class="results-overlay hidden">
        <div class="results-overlay__title">Track Complete!</div>
        <div class="results-overlay__line">Score: <span id="results-score">0</span></div>
        <div class="results-overlay__line results-overlay__line--combo">Max Combo: <span id="results-max-combo">0</span>x</div>
        <div class="results-overlay__line results-overlay__line--accuracy">Accuracy: <span id="results-accuracy">0</span>%</div>
        <div class="results-overlay__line results-overlay__line--hitmiss">Hits: <span id="results-hits">0</span> &middot; Misses: <span id="results-misses">0</span></div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', uiHTML);
}

// ---------- UI SETUP ----------
export function setupUI(scene, leftSwordGroup, onGameReset, multiplayerOptions = null) {
  // Create UI overlay if it doesn't exist
  createUIOverlay();

  // Settings sidebar: default expanded on desktop, collapsed on narrow
  // viewports so mobile starts with a clear view of the play field.
  const sidebar = document.getElementById('game-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarToggle = document.getElementById('sidebar-toggle');

  const setSidebarExpanded = (expanded) => {
    sidebar.classList.toggle('expanded', expanded);
    sidebarBackdrop.classList.toggle('expanded', expanded);
  };

  setSidebarExpanded(!window.matchMedia('(max-width: 768px)').matches);

  sidebarToggle.addEventListener('click', () => {
    setSidebarExpanded(!sidebar.classList.contains('expanded'));
  });

  sidebarBackdrop.addEventListener('click', () => {
    setSidebarExpanded(false);
  });

  // Flip toggle button
  const flipToggle = document.getElementById('flip-toggle');
  flipToggle.addEventListener('click', () => {
    const newFlipState = !getFlipped();
    setFlipped(newFlipState);
    flipToggle.textContent = newFlipState ? 'Flip: ON (Mirrored)' : 'Flip: OFF (Direct)';
  });

  // Multiplayer mode toggle (Versus/Co-op) — shown only pre-Ready; the
  // choice is locked in once Ready is clicked (see playBtn handler below).
  // Hidden entirely when joining an existing room from the hub's Room List
  // (alreadyJoined) — that room's mode is already locked in by whoever
  // created it, not chosen here.
  if (multiplayerOptions?.wantsMultiplayer && !multiplayerOptions?.alreadyJoined) {
    const modeToggle = document.getElementById('multiplayer-mode-toggle');
    const modeVersusBtn = document.getElementById('mode-versus-btn');
    const modeCoopBtn = document.getElementById('mode-coop-btn');
    modeToggle.classList.remove('hidden');

    modeVersusBtn.addEventListener('click', () => {
      modeVersusBtn.classList.add('active');
      modeCoopBtn.classList.remove('active');
      multiplayerOptions.onModeChange?.('versus');
    });

    modeCoopBtn.addEventListener('click', () => {
      modeCoopBtn.classList.add('active');
      modeVersusBtn.classList.remove('active');
      multiplayerOptions.onModeChange?.('coop');
    });
  }

  // Playback control buttons
  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const resetBtn = document.getElementById('reset-btn');

  playBtn.addEventListener('click', async () => {
    setSidebarExpanded(false);

    if (multiplayerOptions?.wantsMultiplayer) {
      // Unlock the audio context now, inside this click's gesture chain —
      // actual transport start is deferred to the server-synced start
      // epoch (see beginPlayback(), called later from index.js).
      await unlockAudioContext();
      playBtn.disabled = true;
      playBtn.textContent = '⏳ Ready';
      document.getElementById('multiplayer-mode-toggle')?.classList.add('hidden');
      multiplayerOptions.onReady();
      return;
    }

    // Starting a fresh round after the previous one finished — clear the
    // results screen and stats rather than resuming (this button is also
    // reused as "Play Again").
    if (isResultsShowing()) {
      hideResultsOverlay();
      clearAllBoxes(scene);
      resetScore();
      resetHealthMeter();
      resetBackgroundEffects();
      updateProgressBar(0);
    }

    await startAudio();
    lockControls();
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
    updateProgressBar(0);
    hideResultsOverlay();
    unlockControls();

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

  // Theme selector — the select itself already displays the chosen
  // track's label, no separate name readout needed.
  const themeSelect = document.getElementById('theme-select');

  themeSelect.addEventListener('change', (e) => {
    const newTheme = e.target.value;
    setTheme(newTheme);
    console.log(`Theme changed to: ${themes[newTheme].name}`);
  });
}

// ---------- CLEANUP UI ----------
export function cleanupUI() {
  // The stylesheet itself is a static import (see top of file) and stays
  // loaded for the module's lifetime — only the DOM it targets is removed.
  const overlay = document.getElementById('game-ui-overlay');
  if (overlay) {
    overlay.remove();
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

export function updateOpponentScore(score, combo, hits = 0, misses = 0) {
  const scoreEl = document.getElementById('opponent-score-display');
  const comboEl = document.getElementById('opponent-combo-display');
  const hitsEl = document.getElementById('opponent-hits-display');
  const missesEl = document.getElementById('opponent-misses-display');
  if (scoreEl) scoreEl.textContent = score;
  if (comboEl) comboEl.textContent = `Combo: ${combo}x`;
  if (hitsEl) hitsEl.textContent = hits;
  if (missesEl) missesEl.textContent = misses;
}

export function showMatchResult({ mode, won, teamScore } = {}) {
  showMultiplayerOverlay(mode === 'coop' ? `🤝 Team Score: ${teamScore}` : (won ? '🏆 You Win!' : 'Match Ended'));
}

// ---------- PROGRESS BAR ----------
export function updateProgressBar(progress) {
  const fill = document.getElementById('progress-bar-fill');
  if (fill) fill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
}

// Controls that don't make sense to change mid-round — Play/Pause toggle
// via visibility instead, and Reset stays usable as an abort button.
const LOCKABLE_CONTROL_IDS = ['one-hand-btn', 'two-hand-btn', 'theme-select'];

export function lockControls() {
  LOCKABLE_CONTROL_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
}

export function unlockControls() {
  LOCKABLE_CONTROL_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

// ---------- RESULTS OVERLAY ----------
export function showResultsOverlay({ score, maxCombo, accuracy, hits = 0, misses = 0 }) {
  const overlay = document.getElementById('results-overlay');
  if (!overlay) return;

  document.getElementById('results-score').textContent = score;
  document.getElementById('results-max-combo').textContent = maxCombo;
  document.getElementById('results-accuracy').textContent = Math.round(accuracy * 100);
  document.getElementById('results-hits').textContent = hits;
  document.getElementById('results-misses').textContent = misses;
  overlay.classList.remove('hidden');

  document.getElementById('pause-btn').classList.add('hidden');
  document.getElementById('play-btn').classList.remove('hidden');
  unlockControls();
}

export function hideResultsOverlay() {
  const overlay = document.getElementById('results-overlay');
  if (overlay) overlay.classList.add('hidden');
}

export function isResultsShowing() {
  const overlay = document.getElementById('results-overlay');
  return !!overlay && !overlay.classList.contains('hidden');
}
