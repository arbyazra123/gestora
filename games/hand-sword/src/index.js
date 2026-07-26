/**
 * Hand Sword Rhythm Game
 * Game class interface for Motion Platform
 */

import * as THREE from 'three';
import * as Tone from 'tone';
import { initTheme, setupBeatScheduler, getCurrentBPM, stopAudio, setTheme, updateBPM, beginPlayback, currentTheme, beatCounter, TRACK_LENGTH_BEATS } from './audio.js';
import {
  boxes,
  createBox,
  updateBoxes,
  checkCollision,
  destroyBox,
  rightBladeBoundingBox,
  leftBladeBoundingBox,
  clearAllBoxes,
  resetScore,
  score,
  combo,
  maxCombo,
  hits,
  misses,
  setMatchMode,
  setCoopSide,
  setCoopSeed
} from './game-logic.js';
import { initHealthMeter, resetHealthMeter, getAccuracy } from './health-meter.js';
import { initBackgroundEffects, animateBackgroundEffects, resetBackgroundEffects, pulseOnBeat } from './background-effects.js';
import { cleanupUI } from './ui.js';

export default class HandSwordGame {
  constructor(container, services) {
    this.container = container;
    this.mediaPipe = services.mediaPipe;
    this.camera = services.camera;
    this.multiplayer = services.multiplayer;

    // Game state
    this.isRunning = false;
    this.isPaused = false;
    this.animationFrameId = null;
    this.lastTime = performance.now();

    // Three.js objects (will be imported)
    this.scene = null;
    this.camera3d = null;
    this.renderer = null;
    this.rightSwordGroup = null;
    this.rightBlade = null;
    this.rightHilt = null;
    this.leftSwordGroup = null;
    this.leftBlade = null;
    this.leftHilt = null;
    this.ambientLight = null;
    this.directionalLight = null;
    this.gridHelper = null;
    this.eqBars = null;

    // Hand tracking module
    this.handTrackingModule = null;
    this.uiModule = null;

    // Multiplayer state
    this.wantsMultiplayer = !!services.launchOptions?.multiplayer;
    this.matchState = 'idle'; // idle | connecting | waiting | countdown | playing | ended
    this.selectedMultiplayerMode = 'versus'; // 'versus' | 'coop' — chosen pre-Ready, see ui.js's mode toggle
    this.room = null;
    this._onStateChange = null;
    this._onOpponentHand = null;
    this._lastScoreSent = 0;

    // Set only when the player chose "Create Room" in the hub's Room List
    // (see host/src/ui/RoomListModal.js) — hand-sword still needs its own
    // mode/song settings chosen in-game first (see ui.js's mode toggle), so
    // handleReady() creates the room once those AND this are both ready,
    // merging them together. Null when they instead joined an existing room
    // from the list (services.multiplayer.room is already set in that case
    // — see init(), which also skips showing the mode toggle then, since
    // the room's mode is already locked in by whoever created it).
    this.pendingRoomOptions = services.launchOptions?.pendingRoomOptions || null;

    console.log('[HandSword] Game instance created');
  }

  /**
   * Initialize the game
   * Load modules and setup scene
   */
  async init() {
    console.log('[HandSword] Initializing...');

    try {
      // Dynamically import modules
      const [sceneModule, handTrackingModule, uiModule] = await Promise.all([
        import('./scene.js'),
        import('./hand-tracking.js'),
        import('./ui.js')
      ]);

      // Store module references
      this.handTrackingModule = handTrackingModule;
      this.uiModule = uiModule;

      // Initialize Three.js scene with container
      sceneModule.initScene(this.container);

      // Get scene objects after initialization
      this.scene = sceneModule.scene;
      this.camera3d = sceneModule.camera;
      this.renderer = sceneModule.renderer;
      this.rightSwordGroup = sceneModule.rightSwordGroup;
      this.rightBlade = sceneModule.rightBlade;
      this.rightHilt = sceneModule.rightHilt;
      this.leftSwordGroup = sceneModule.leftSwordGroup;
      this.leftBlade = sceneModule.leftBlade;
      this.leftHilt = sceneModule.leftHilt;
      this.ambientLight = sceneModule.ambientLight;
      this.directionalLight = sceneModule.directionalLight;
      this.gridHelper = sceneModule.gridHelper;
      this.eqBars = sceneModule.eqBars;

      // Setup window resize
      sceneModule.setupWindowResize();

      // Initialize audio theme
      initTheme('synthwave');

      // Setup beat scheduler
      setupBeatScheduler(
        (melodyFreq) => createBox(this.scene, getCurrentBPM(), melodyFreq),
        () => this.handleTrackEnd(),
        (beatInfo) => pulseOnBeat(beatInfo)
      );

      // Setup hand tracking with platform services
      this.handTrackingModule.setupHandTracking(
        this.rightSwordGroup,
        this.rightBlade,
        this.rightHilt,
        this.leftSwordGroup,
        this.leftBlade,
        this.leftHilt,
        this.camera,
        this.mediaPipe
      );

      // Setup UI. alreadyJoined means the player picked an existing room
      // from the hub's Room List rather than "Create Room" — the mode
      // toggle is hidden in that case since the room's mode is already
      // locked in by whoever created it, not chosen here.
      const alreadyJoined = this.wantsMultiplayer && !!this.multiplayer.room;
      const multiplayerOptions = this.wantsMultiplayer
        ? {
          wantsMultiplayer: true,
          alreadyJoined,
          onReady: () => this.handleReady(),
          onModeChange: (mode) => { this.selectedMultiplayerMode = mode; }
        }
        : null;
      uiModule.setupUI(this.scene, this.leftSwordGroup, undefined, multiplayerOptions);

      if (this.wantsMultiplayer) {
        uiModule.lockControls();
        uiModule.showMultiplayerOverlay('Click Play when ready!');

        this._onStateChange = (state) => this.handleMatchStateChange(state);
        this._onOpponentHand = (msg) => this.renderOpponentHand(msg.data);
        this.multiplayer.on('stateChange', this._onStateChange);
        this.multiplayer.on('opponentHand', this._onOpponentHand);

        // Already joined via the hub's Room List before this game even
        // loaded — adopt it directly; handleReady() below becomes a no-op
        // for this case. MultiplayerService.on() above already replayed the
        // room's current state synchronously, so handleMatchStateChange()
        // has already run once by this point — but unlike the "Create Room"
        // path (handleReady()), nothing else sets the "Waiting for
        // opponent..." message for a joiner, so do it here explicitly
        // (harmless if the room fills and jumps to countdown a moment
        // later — handleMatchStateChange()'s countdown branch overwrites it).
        if (alreadyJoined) {
          this.room = this.multiplayer.room;
          this.matchState = 'waiting';
          this.uiModule.showMultiplayerOverlay('Waiting for opponent...');
          // Everything else in init() has already run by this point — tell
          // the server this seat is actually ready to play, not just
          // connected (see MultiplayerService.sendReady()'s doc comment).
          this.multiplayer.sendReady();
        }
      }

      // Initialize health meter
      initHealthMeter();

      // Initialize background effects
      initBackgroundEffects(
        this.scene,
        this.ambientLight,
        this.directionalLight,
        this.gridHelper,
        this.eqBars
      );

      // Subscribe to MediaPipe hand tracking with handler
      this.mediaPipe.subscribe('hand-sword', (results) => {
        this.handTrackingModule.handleHandTrackingResults(results);
        this.onHandData(results);
      });

      console.log('[HandSword] Initialized successfully');
    } catch (error) {
      console.error('[HandSword] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start the game loop
   */
  async start() {
    if (this.isRunning) {
      console.warn('[HandSword] Already running');
      return;
    }

    console.log('[HandSword] Starting...');

    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();

    // Start animation loop
    this.animate();

    console.log('[HandSword] Started');
  }

  /**
   * Pause the game
   */
  pause() {
    if (!this.isRunning || this.isPaused) return;

    console.log('[HandSword] Paused');
    this.isPaused = true;

    // Pause audio if needed
    // pauseAudio(); // Can be added if needed
  }

  /**
   * Resume the game
   */
  resume() {
    if (!this.isRunning || !this.isPaused) return;

    console.log('[HandSword] Resumed');
    this.isPaused = false;
    this.lastTime = performance.now();
  }

  /**
   * Stop the game
   */
  stop() {
    if (!this.isRunning) return;

    console.log('[HandSword] Stopping...');

    this.isRunning = false;
    this.isPaused = false;

    // Cancel animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    console.log('[HandSword] Stopped');
  }

  /**
   * Cleanup and dispose resources
   */
  cleanup() {
    console.log('[HandSword] Cleaning up...');

    // Unsubscribe from hand tracking
    this.mediaPipe.unsubscribe('hand-sword');

    // Tear down multiplayer — multiplayerService is a singleton reused
    // across game load/unload cycles, so stale listeners from this match
    // must not linger into the next one. (cleanupUI() below removes the
    // whole UI overlay including locked controls, so no separate
    // unlockControls() call is needed here.)
    if (this.wantsMultiplayer) {
      if (this._onStateChange) this.multiplayer.off('stateChange', this._onStateChange);
      if (this._onOpponentHand) this.multiplayer.off('opponentHand', this._onOpponentHand);
      this.multiplayer.leaveRoom();
      this.room = null;
      this.matchState = 'idle';
    }

    // Clear all boxes
    if (this.scene) {
      clearAllBoxes(this.scene);
    }

    // Reset game state
    stopAudio();
    resetScore();
    resetHealthMeter();
    resetBackgroundEffects();
    // game-logic.js's module state outlives this game instance (module
    // caching), so a coop match's mode/side must not leak into the next
    // launch — otherwise a later solo/versus round would silently keep
    // running coop's side-restricted collision logic.
    setMatchMode('solo');
    setCoopSide(null);

    // Cleanup UI overlay
    cleanupUI();

    // Dispose Three.js resources
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(mat => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }

    console.log('[HandSword] Cleaned up');
  }

  /**
   * Game animation loop
   */
  animate() {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(() => this.animate());

    if (this.isPaused) return;

    // Calculate delta time
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Animate background effects
    animateBackgroundEffects(deltaTime);

    // Pre-calculate sword bounding boxes
    rightBladeBoundingBox.setFromObject(this.rightBlade);
    leftBladeBoundingBox.setFromObject(this.leftBlade);

    // Update boxes
    updateBoxes(this.scene);

    // Check collisions
    for (let i = boxes.length - 1; i >= 0; i--) {
      const box = boxes[i];
      if (checkCollision(box, rightBladeBoundingBox, leftBladeBoundingBox)) {
        destroyBox(this.scene, box, i);
      }
    }

    // Render scene
    this.renderer.render(this.scene, this.camera3d);

    // Song progress — box spawn timing (and therefore beatCounter) is
    // driven entirely by the beat scheduler, so this is just its ratio
    // against the track's fixed length.
    if (this.uiModule?.updateProgressBar) {
      this.uiModule.updateProgressBar(Math.min(1, beatCounter / TRACK_LENGTH_BEATS));
    }

    // Relay score/combo/hits/misses to the opponent while a match is live
    if (this.wantsMultiplayer && this.matchState === 'playing') {
      const now = performance.now();
      if (now - this._lastScoreSent > 150) {
        this.multiplayer.sendGameState({ score, combo, maxCombo, hits, misses });
        this._lastScoreSent = now;
      }
    }
  }

  /**
   * Called when the beat scheduler reaches the end of the track's fixed
   * length. Multiplayer matches are ended server-side (on disconnect, not
   * duration yet — see HandSwordRoom) so this only applies solo.
   */
  handleTrackEnd() {
    if (this.wantsMultiplayer) return;

    stopAudio();
    clearAllBoxes(this.scene);
    this.uiModule.showResultsOverlay({ score, maxCombo, accuracy: getAccuracy(), hits, misses });
  }

  /**
   * Called when the player clicks "Play" in multiplayer mode (their audio
   * context is already unlocked by this point — see ui.js's playBtn
   * handler). If a room was already joined via the hub's Room List (see
   * init()) this is a no-op — state sync is already flowing. Otherwise the
   * player chose "Create Room" there, and this creates it now with their
   * chosen mode/song (see ui.js's mode toggle) plus whatever password/name
   * they set in the Room List.
   */
  async handleReady() {
    if (this.room) return;

    this.matchState = 'connecting';
    this.uiModule.showMultiplayerOverlay('Connecting...');

    try {
      await this.multiplayer.createRoom('hand-sword', {
        bpm: getCurrentBPM(),
        theme: currentTheme,
        mode: this.selectedMultiplayerMode,
        ...(this.pendingRoomOptions || {})
      });
      this.room = this.multiplayer.room;
      // By the time the player taps Play, init()/start() have long since
      // finished — this seat is ready the moment the room exists.
      this.multiplayer.sendReady();

      this.matchState = 'waiting';
      this.uiModule.showMultiplayerOverlay('Waiting for opponent...');
    } catch (error) {
      console.error('[HandSword] Failed to create multiplayer match:', error);
      this.uiModule.showMultiplayerOverlay('Connection failed');
    }
  }

  /**
   * Called on every synced room state change (see MultiplayerService's
   * 'stateChange' event, wired in init()).
   */
  handleMatchStateChange(state) {
    const myId = this.multiplayer.getPlayerId();
    const opponent = [...state.players.values()].find((p) => p.sessionId !== myId);

    if (state.status === 'countdown' && this.matchState !== 'countdown' && this.matchState !== 'playing') {
      this.matchState = 'countdown';

      // Apply the room's locked match settings to the local UI/state —
      // only when they actually differ. setTheme() re-initializes Tone.js
      // instruments (and applies the track's own difficulty/bpm — see
      // audio.js), which stomps the already-scheduled beat repeat's
      // internal time bookkeeping if called redundantly (harmless-looking
      // but throws inside Tone's scheduler once playback starts).
      if (state.theme !== currentTheme) setTheme(state.theme);
      if (state.bpm !== getCurrentBPM()) updateBPM(state.bpm);

      // Lock in Match Mode and, for coop, our assigned side + the shared
      // box-spawn seed (see game-logic.js's coop branch of createBox()).
      setMatchMode(state.mode);
      if (state.mode === 'coop') {
        setCoopSeed(state.coopSeed);
        const mySide = state.players.get(myId)?.side ?? 'left';
        setCoopSide(mySide);
        // We only have a hand on our own side — hide the other sword
        // rather than leave it idle in the scene.
        if (mySide === 'left') this.rightSwordGroup.visible = false;
        else this.leftSwordGroup.visible = false;
      }
      this.handTrackingModule.updateHandTrackingMode();

      this.uiModule.showCountdown(state.startAt);

      const delay = Math.max(0, state.startAt - Date.now());
      setTimeout(() => {
        beginPlayback();
        this.matchState = 'playing';
      }, delay);
    }

    if (state.status === 'ended' && this.matchState !== 'ended') {
      this.matchState = 'ended';
      const myScore = state.players.get(myId)?.score ?? score;
      const opponentScore = opponent?.score ?? 0;
      this.uiModule.showMatchResult(
        state.mode === 'coop'
          ? { mode: 'coop', teamScore: myScore + opponentScore }
          : { mode: 'versus', won: myScore >= opponentScore }
      );
      this.uiModule.unlockControls();
    }

    if (opponent) {
      this.uiModule.updateOpponentScore(opponent.score, opponent.combo, opponent.hits, opponent.misses);
    }
  }

  /**
   * Render the opponent's tracked hand. Kept lightweight/cosmetic —
   * see hand-tracking.js's renderGhostHand helper.
   */
  renderOpponentHand(compressed) {
    if (this.handTrackingModule?.renderGhostHand) {
      this.handTrackingModule.renderGhostHand(this.scene, compressed);
    }
  }

  /**
   * Handle hand tracking data from MediaPipe
   */
  onHandData(results) {
    // Hand tracking is already handled by hand-tracking.js module
    // This callback is here for potential multiplayer broadcasting
    if (this.multiplayer && this.multiplayer.isConnectedToServer()) {
      this.multiplayer.broadcastHandData(results);
    }
  }

}
