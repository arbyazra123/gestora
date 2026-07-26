/**
 * Motion Pong
 * Classic pong against a bot — move your head left/right to control the
 * paddle, hold up finger-count gestures with your hand to trigger special
 * abilities. Both run at once via MediaPipe Tasks Vision (see
 * vision-tracking.js), which is why this game needs its own tracking
 * pipeline instead of the shared legacy one the other games use.
 * Game class interface for Motion Platform
 */

import {
  initScene,
  setupWindowResize,
  scene,
  camera,
  renderer,
  playerPaddle,
  botPaddle,
  getFieldBounds,
  worldToScreen,
  FIELD_LENGTH
} from './scene.js';
import {
  setupHeadTracking,
  handleFaceLandmarkResults,
  setHeadBoost,
  resetHeadTracking
} from './head-tracking.js';
import { handleHandGestureResults, resetGestureTracking, getCurrentCount } from './gesture-tracking.js';
import {
  initVisionTracking,
  startVisionTracking,
  stopVisionTracking,
  disposeVisionTracking
} from './vision-tracking.js';
import {
  createBall,
  updateBall,
  serveBall,
  hitBall,
  resetBall,
  ball,
  ballState,
  isBallActive,
  stopBall,
  checkMiss
} from './physics.js';
import {
  setupBotAI,
  updateBotAI,
  setBotDifficulty,
  setBotBoost,
  resetBotState
} from './bot-ai.js';
import {
  setupAbilities,
  updateAbilities,
  isShieldActive,
  consumeShield,
  isSlowMoActive,
  isPaddleBoostActive,
  getActiveAbility,
  resetAbilities,
  setAbilitiesEnabled,
  setBotAutoActivateEnabled,
  ABILITY_TYPES
} from './abilities.js';
import {
  resetGame,
  startServe,
  serveComplete,
  checkPlayerPaddleCollision,
  checkBotPaddleCollision,
  awardPoint,
  getScoreDisplay,
  isGameOver,
  getWinner,
  nextPoint,
  getCurrentServer,
  gameState
} from './game-logic.js';
import {
  setupUI,
  showStatus,
  hideStatus,
  showGameOver,
  showServePrompt,
  showPointWinner,
  updateAbilityCooldowns,
  updateActiveAbility,
  updateFingerCount,
  positionSkillTextAnchors,
  cleanupUI,
  setMultiplayerMode,
  getOpponentNoun,
  showMultiplayerCountdown
} from './ui.js';
import { createScoreDisplay, updateScoreDisplay, disposeScoreDisplay } from './score-display.js';
import {
  initAudio,
  startAudioContext,
  startMusic,
  stopMusic,
  updateGlideSound,
  playServe,
  playMiss,
  playPointWin,
  playShieldSave,
  playGameOver
} from './audio.js';

const PADDLE_BOOST_SCALE = 1.6;
const SLOW_MO_FACTOR = 0.4;

export default class PongGame {
  constructor(container, services) {
    this.container = container;
    this.mediaPipe = services.mediaPipe;
    this.camera = services.camera;
    this.multiplayer = services.multiplayer;

    this.isRunning = false;
    this.isPaused = false;
    this.animationFrameId = null;
    this.lastTime = performance.now();
    this.fieldBounds = null;

    this.keyboardHandler = null;
    this.serveTapHandler = null;

    // Multiplayer state
    this.wantsMultiplayer = !!services.launchOptions?.multiplayer;
    this.matchState = 'idle'; // idle | connecting | waiting | countdown | playing | ended
    this.room = null;
    this.myRole = null; // 'player' | 'bot' — assigned by the server on join
    this.latestState = null;
    this._onStateChange = null;
    this._unsubAbilityActivated = null;
    this._lastRoomStatus = null;
    this._lastGameStatus = null;
    this._lastPaddleSent = 0;

    // Snapshots of network-reported ability state, refreshed every
    // handleMatchStateChange() tick — read each animation frame by
    // applyAbilityEffects() since that runs far more often than state syncs
    // arrive. Solo mode ignores these entirely (uses abilities.js directly).
    this._myPaddleBoostActive = false;
    this._myShieldActive = false;
    this._oppPaddleBoostActive = false;
    this._oppShieldActive = false;
    this._slowMoActive = false;

    // Set only when the player chose "Create Room" in the hub's Room List
    // (see host/src/ui/RoomListModal.js) — pong has no pre-match settings of
    // its own to gather first, so handleReady() creates the room directly
    // with these once the player taps Play. Null when they instead joined
    // an existing room from the list (services.multiplayer.room is already
    // set in that case — see init()).
    this.pendingRoomOptions = services.launchOptions?.pendingRoomOptions || null;

    console.log('[Pong] Game instance created');
  }

  async init() {
    console.log('[Pong] Initializing...');

    try {
      initScene(this.container);
      setupWindowResize();

      this.fieldBounds = getFieldBounds();

      initAudio();
      this.setupAudioUnlock();
      createBall(scene);
      createScoreDisplay(scene);

      setupHeadTracking(playerPaddle);
      setupBotAI(botPaddle, ball);
      setBotDifficulty('medium');

      // setupUI must run first: setupAbilities() -> resetAbilities() fires
      // onCooldownChange(...) synchronously, which needs the ability panel
      // DOM elements to already exist.
      setupUI(this.container, {
        onPlay: () => (this.wantsMultiplayer ? this.handleReady() : this.handleServe())
      });

      setupAbilities({
        onActivate: (side, type) => this.handleAbilityActivate(side, type),
        onCooldownChange: (snapshot) => updateAbilityCooldowns(snapshot)
      });

      // FaceLandmarker drives head position (x only, no rotation);
      // HandLandmarker drives finger-count gestures for special abilities.
      // Both run together off the shared camera video element — see
      // vision-tracking.js for why this needs Tasks Vision instead of the
      // legacy per-solution pipeline the other games use.
      await initVisionTracking({
        video: this.camera.getVideoElement(),
        canvas: this.camera.getCanvasElement(),
        handlers: {
          onFaceResults: handleFaceLandmarkResults,
          onHandResults: handleHandGestureResults
        }
      });
      startVisionTracking();

      this.setupKeyboardControls();
      this.setupServeTapHandler();

      if (this.wantsMultiplayer) {
        setMultiplayerMode(true);
        setBotAutoActivateEnabled(false);
        this._onStateChange = (state) => this.handleMatchStateChange(state);
        this.multiplayer.on('stateChange', this._onStateChange);

        // Already joined via the hub's Room List before this game even
        // loaded (the player picked an existing room, not "Create Room") —
        // adopt it directly; handleReady() below becomes a no-op for this
        // case. MultiplayerService.on() above already replayed the room's
        // current state synchronously, so handleMatchStateChange() has
        // already run once by this point.
        if (this.multiplayer.room) {
          this.room = this.multiplayer.room;
          this.wireRoomMessageListeners();
        }
      } else {
        resetGame();
        this.updateUI();
        showServePrompt(getCurrentServer());
      }

      console.log('[Pong] Initialized successfully');
    } catch (error) {
      console.error('[Pong] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Browsers only resume a suspended AudioContext from inside a genuine,
   * direct user-gesture event handler — calling Tone.start() several awaits
   * deep inside start()/loadGameWithManifest()'s promise chain isn't
   * reliably recognized as one. This listens for the very first raw
   * pointerdown/keydown on the page and calls it synchronously as the
   * first thing that handler does, which browsers do accept.
   */
  setupAudioUnlock() {
    this.audioUnlockHandler = () => {
      startAudioContext();
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
    };
    window.addEventListener('pointerdown', this.audioUnlockHandler);
    window.addEventListener('keydown', this.audioUnlockHandler);
  }

  /**
   * Skill text sits at the center of each side's half of the table,
   * projected from real world points via scene.js's worldToScreen() rather
   * than a guessed viewport percentage, so it tracks the table's actual
   * on-screen position regardless of aspect ratio/container layout.
   */
  updateAnchoredUIPositions() {
    positionSkillTextAnchors(
      worldToScreen(0, 0.1, -FIELD_LENGTH / 4),
      worldToScreen(0, 0.1, FIELD_LENGTH / 4)
    );
  }

  setupKeyboardControls() {
    this.keyboardHandler = (event) => {
      if (event.code === 'Space' && !event.repeat) {
        if (this.wantsMultiplayer) {
          this.tryServeMultiplayer();
        } else {
          this.handleServe();
        }
      } else if (event.code === 'KeyR' && !this.wantsMultiplayer && isGameOver()) {
        this.restartGame();
      }
    };

    window.addEventListener('keydown', this.keyboardHandler);
  }

  /**
   * Tap-anywhere-to-serve — the touch equivalent of the SPACE handler above.
   * Solo mode's "your serve" gate and multiplayer's per-point serve gate
   * (see beginMultiplayerServeTurn()) otherwise only had a keyboard trigger,
   * which mobile has none of; this closes that gap for both modes at once.
   */
  setupServeTapHandler() {
    this.serveTapHandler = (event) => {
      if (event.target.closest('button')) return; // don't double-fire on UI chrome taps
      if (this.wantsMultiplayer) {
        this.tryServeMultiplayer();
      } else {
        this.handleServe();
      }
    };
    this.container.addEventListener('pointerdown', this.serveTapHandler);
  }

  handleServe() {
    if (gameState.gameStatus !== 'ready') return;

    if (getCurrentServer() === 'player') {
      this.serve('player');
    }
    // Bot serves itself automatically (see start()/handlePointEnd())
  }

  /**
   * Subscribes to room messages that aren't part of the replicated schema
   * state — split out so both the "already joined via the hub's Room List"
   * path (init()) and the "just created it here" path (handleReady() below)
   * wire it exactly once, whichever happens.
   */
  wireRoomMessageListeners() {
    this._unsubAbilityActivated = this.room.onMessage('ability_activated', ({ side, type }) => {
      this.handleAbilityActivate(this.translateRole(side), type);
    });
  }

  /**
   * Called when the player taps/presses SPACE on the intro overlay in
   * multiplayer mode (this is already a proven gesture-safe audio-unlock
   * point via setupAudioUnlock()'s global keydown/pointerdown listener,
   * registered earlier in init()). If a room was already joined via the
   * hub's Room List (see init()) this is a no-op — state sync is already
   * flowing. Otherwise the player chose "Create Room" there, and this
   * creates it now with whatever password/name they set.
   */
  async handleReady() {
    if (this.room) return;

    this.matchState = 'connecting';
    showStatus('Connecting...', 0);

    try {
      await this.multiplayer.createRoom('pong', this.pendingRoomOptions || {});
      this.room = this.multiplayer.room;
      this.wireRoomMessageListeners();

      this.matchState = 'waiting';
      showStatus('Waiting for opponent...', 0);
    } catch (error) {
      console.error('[Pong] Failed to create multiplayer match:', error);
      showStatus('Connection failed', 0);
    }
  }

  /**
   * Only fires the serve if it's genuinely this client's turn — safe to
   * call from any tap/keypress regardless of current match state.
   */
  tryServeMultiplayer() {
    if (!this.latestState || this.latestState.game.gameStatus !== 'ready') return;
    if (this.translateRole(this.latestState.game.currentServer) !== 'player') return;
    this.serveMultiplayer();
  }

  serveMultiplayer() {
    startAudioContext(); // fallback in case start()'s attempt didn't take (e.g. stricter browsers)
    resetBall();
    // Every serving client always serves from its own local-frame origin
    // regardless of assigned role (see mirrorX()'s doc comment) — role only
    // affects the mirror applied when reporting below.
    serveBall('player');
    this.reportServe();
    hideStatus();
  }

  // ---------- Multiplayer coordinate mirror ----------

  /**
   * Mirrors an {x,z} vector through the center line (180° rotation about Y):
   * (x,z) -> (-x,-z). Self-inverse — used both when translating this
   * client's local coordinates into the shared server frame, and vice versa.
   * Only ever applied when this.myRole === 'bot' — every client's own paddle
   * always renders in the same "near the camera, +z side" local frame (see
   * scene.js), so whichever client is assigned the far/'bot' side needs this
   * transform both ways to place its actions on the correct side of the
   * shared field, and to render the shared ball/opponent paddle back into
   * its own view. Mirrors games/tennis/src/index.js's mirrorVec() exactly,
   * just without the unused y component (pong's paddles/ball never move
   * vertically).
   */
  mirrorVec(v) {
    return { x: -v.x, z: -v.z };
  }

  toShared(v) {
    return this.myRole === 'bot' ? this.mirrorVec(v) : v;
  }

  toLocal(v) {
    return this.myRole === 'bot' ? this.mirrorVec(v) : v; // self-inverse
  }

  mirrorX(x) {
    return this.myRole === 'bot' ? -x : x;
  }

  /**
   * Translates a server-side role string ('player'/'bot' — whichever side
   * of the field, from the server's point of view) into this client's own
   * locally-relative terms, where 'player' always means "me" and 'bot'
   * always means "my opponent" (since both clients' local game code always
   * treats itself as 'player' — see hitBall() calls below).
   */
  translateRole(serverRole) {
    return serverRole === this.myRole ? 'player' : 'bot';
  }

  /**
   * Send the resulting serve/hit velocity (already computed locally by
   * serveBall()/hitBall(), reusing the exact same head-tracking/paddle-
   * collision mechanic as solo mode) to the server, which becomes the sole
   * authority over the ball from this point until the next report.
   */
  reportServe() {
    if (!this.room) return;
    const shared = this.toShared({ x: ballState.velocity.x, z: ballState.velocity.z });
    this.room.send('serve', { velocity: shared });
  }

  reportHit() {
    if (!this.room) return;
    const shared = this.toShared({ x: ballState.velocity.x, z: ballState.velocity.z });
    this.room.send('hit', { velocity: shared });
  }

  /**
   * Broadcast this client's own paddle x position, throttled to ~20Hz
   * (matches the throttle MultiplayerService uses elsewhere in this
   * project) — purely for rendering the opponent's paddle on the other
   * client; the server doesn't use this for hit validation (see
   * PongRoom's trust-model comment).
   */
  sendPaddlePosition() {
    if (!this.room) return;
    const now = performance.now();
    if (now - this._lastPaddleSent < 50) return;
    this._lastPaddleSent = now;
    this.room.send('paddle', { x: this.mirrorX(playerPaddle.position.x) });
  }

  /**
   * Begin whichever side's serve turn it is, in multiplayer terms: shows the
   * appropriate prompt and waits for a tap/SPACE (tryServeMultiplayer()) when
   * it's this client's own turn (regardless of assigned server role — see
   * completePlayerServe()-equivalent comment on serveMultiplayer()), or just
   * waits when it's the real opponent's turn.
   */
  beginMultiplayerServeTurn() {
    setAbilitiesEnabled(true);
    if (this.translateRole(this.latestState.game.currentServer) === 'player') {
      showStatus('Your Serve\nTap or press SPACE', 0);
    } else {
      showStatus(`Waiting for ${getOpponentNoun().toLowerCase()} to serve...`, 0);
    }
  }

  /**
   * Fired on every synced room state change (see MultiplayerService's
   * 'stateChange' event, wired in init()) — this includes high-frequency
   * ball/paddle position ticks, not just rare status transitions, so
   * one-shot reactions below are guarded by comparing against the last seen
   * value so they don't re-fire on every unrelated state tick.
   */
  handleMatchStateChange(state) {
    this.latestState = state;

    if (!this.myRole) {
      const me = state.players.get(this.multiplayer.getPlayerId());
      if (me) this.myRole = me.role;
    }
    if (!this.myRole) return; // haven't seen our own player entry yet

    // Continuously mirror the server-authoritative ball into this client's
    // own local frame — checkCollisions()/hitBall() below (and their
    // solo-mode counterparts) operate on these same ball/ballState module
    // singletons unchanged, so this is the only place that needs to know a
    // network sync is happening at all.
    const localBallPos = this.toLocal({ x: state.ball.x, z: state.ball.z });
    ball.position.x = localBallPos.x;
    ball.position.z = localBallPos.z;
    const localBallVel = this.toLocal({ x: state.ball.vx, z: state.ball.vz });
    ballState.velocity.set(localBallVel.x, 0, localBallVel.z);
    ballState.isActive = state.ball.isActive;
    ballState.lastHitBy = state.ball.lastHitBy ? this.translateRole(state.ball.lastHitBy) : null;

    // Opponent paddle, same local-frame translation.
    const myId = this.multiplayer.getPlayerId();
    const opponent = [...state.players.values()].find((p) => p.sessionId !== myId);
    if (opponent) {
      botPaddle.position.x = this.mirrorX(opponent.paddleX);
    }

    // Score — cheap and idempotent, no edge-guard needed.
    const myScore = this.myRole === 'player' ? state.game.playerScore : state.game.botScore;
    const oppScore = this.myRole === 'player' ? state.game.botScore : state.game.playerScore;
    updateScoreDisplay(myScore, oppScore);

    // Ability state snapshots, read each animation frame by
    // applyAbilityEffects() — see this.myRole's doc comment on why these
    // are trusted-but-relayed rather than server-validated.
    const now = Date.now();
    const me = state.players.get(myId);
    this._myPaddleBoostActive = !!(me && now < me.paddleBoostUntil);
    this._myShieldActive = !!(me && now < me.shieldUntil);
    this._oppPaddleBoostActive = !!(opponent && now < opponent.paddleBoostUntil);
    this._oppShieldActive = !!(opponent && now < opponent.shieldUntil);
    this._slowMoActive = now < (state.slowMoUntil || 0);

    // One-shot reactions to actual transitions, edge-detected against the
    // last seen value so they don't re-fire on every unrelated state tick.
    if (state.status === 'countdown' && this._lastRoomStatus !== 'countdown') {
      this.matchState = 'countdown';
      showMultiplayerCountdown(state.startAt);
      const delay = Math.max(0, state.startAt - Date.now());
      setTimeout(() => {
        if (this.matchState !== 'countdown') return; // e.g. match ended during the countdown
        this.matchState = 'playing';
      }, delay);
    }

    if (state.status === 'ended' && this._lastRoomStatus !== 'ended') {
      this.matchState = 'ended';
      setAbilitiesEnabled(false);
      showStatus(`${getOpponentNoun()} disconnected`, 0);
    }

    const justStartedPlaying = state.status === 'playing' && this._lastRoomStatus !== 'playing';
    const justBecameReadyAgain = state.game.gameStatus === 'ready' && this._lastGameStatus !== 'ready';
    if (state.status === 'playing' && (justStartedPlaying || justBecameReadyAgain)) {
      this.beginMultiplayerServeTurn();
    }

    if (state.game.gameStatus === 'playing' && this._lastGameStatus !== 'playing') {
      hideStatus();
    }

    if (state.game.gameStatus === 'point-over' && this._lastGameStatus !== 'point-over') {
      const winner = this.translateRole(state.game.lastPointWinner);
      showPointWinner(winner);
      playPointWin(winner);
    }

    if (state.game.gameStatus === 'game-over' && this._lastGameStatus !== 'game-over') {
      setAbilitiesEnabled(false);
      // WINNING_SCORE=7, matches game-logic.js
      const finalWinnerServerRole = state.game.playerScore >= 7 ? 'player' : 'bot';
      const winner = this.translateRole(finalWinnerServerRole);
      showGameOver(winner);
      playGameOver(winner);
    }

    this._lastRoomStatus = state.status;
    this._lastGameStatus = state.game.gameStatus;
  }

  serve(server) {
    startAudioContext(); // fallback in case start()'s attempt didn't take (e.g. stricter browsers)
    resetBall();
    serveBall(server);
    startServe();
    serveComplete();
    playServe();
    hideStatus();
    // The point is genuinely in play now — allow ability activation (both
    // player gestures and the bot's own auto-activation) from here on;
    // harmless to call again on later serves — see abilities.js.
    setAbilitiesEnabled(true);
  }

  async start() {
    if (this.isRunning) {
      console.warn('[Pong] Already running');
      return;
    }

    console.log('[Pong] Starting...');

    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();

    // Browsers require a user gesture before audio can play; this is called
    // right after the hub's "Play" click, and it's harmless/idempotent to
    // retry from serve() (a more direct keypress gesture) if this doesn't
    // take in stricter browsers.
    await startAudioContext();
    startMusic();

    if (!this.wantsMultiplayer && getCurrentServer() === 'bot') {
      setTimeout(() => this.serve('bot'), 1500);
    }

    this.animate();
    console.log('[Pong] Started');
  }

  pause() {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    showStatus('Paused', 0);
  }

  resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.lastTime = performance.now();
    hideStatus();
  }

  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.isPaused = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    stopMusic();
    updateGlideSound(0, false); // silence the velocity drone immediately
    stopVisionTracking();
  }

  cleanup() {
    console.log('[Pong] Cleaning up...');

    disposeVisionTracking();
    disposeScoreDisplay();

    // Tear down multiplayer — multiplayerService is a singleton reused
    // across game load/unload cycles, so stale listeners from this match
    // must not linger into the next one.
    if (this.wantsMultiplayer) {
      if (this._onStateChange) this.multiplayer.off('stateChange', this._onStateChange);
      if (this._unsubAbilityActivated) this._unsubAbilityActivated();
      this.multiplayer.leaveRoom();
      this.room = null;
      this.matchState = 'idle';
    }

    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
    }

    if (this.serveTapHandler) {
      this.container.removeEventListener('pointerdown', this.serveTapHandler);
    }

    if (this.audioUnlockHandler) {
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
    }

    cleanupUI();

    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }

    if (scene) {
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }

    console.log('[Pong] Cleaned up');
  }

  animate() {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(() => this.animate());
    if (this.isPaused) return;

    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.updateGameLogic(deltaTime);
    renderer.render(scene, camera);
  }

  updateGameLogic(deltaTime) {
    updateAbilities();
    this.applyAbilityEffects();

    if (this.wantsMultiplayer) {
      this.updateMultiplayerGameLogic();
    } else {
      this.updateSoloGameLogic(deltaTime);
    }

    updateGlideSound(ballState.velocity.length(), isBallActive());
  }

  /**
   * Solo-mode ball physics + bot AI + both-sides collision checking —
   * unchanged from the original single-player implementation.
   */
  updateSoloGameLogic(deltaTime) {
    if (isBallActive()) {
      const slowMo = isSlowMoActive('player') || isSlowMoActive('bot');
      const ballDeltaTime = slowMo ? deltaTime * SLOW_MO_FACTOR : deltaTime;

      updateBall(ballDeltaTime, this.fieldBounds);
      this.checkCollisions();

      const missedSide = checkMiss(this.fieldBounds);
      if (missedSide) {
        this.handleMiss(missedSide);
      }
    }

    updateBotAI(deltaTime, ballState);
  }

  /**
   * Multiplayer: the ball's continuous flight (wall bounce/miss/scoring) is
   * entirely server-owned (see handleMatchStateChange(), which keeps
   * ball/ballState synced from the network every tick) — this only needs to
   * check MY OWN paddle against wherever that synced ball currently is, and
   * report the resulting hit. The opponent's hit detection happens on their
   * own client, not here — and botPaddle's position comes from the network
   * (see handleMatchStateChange()), not bot-ai.js, so updateBotAI() must
   * never run here or it would fight that.
   */
  updateMultiplayerGameLogic() {
    if (ballState.isActive && checkPlayerPaddleCollision(playerPaddle, ball, ballState)) {
      hitBall(playerPaddle.position, ball.position, 'player');
      this.reportHit();
    }

    this.sendPaddlePosition();
  }

  /**
   * Reflect current ability state onto the paddles/bot/UI each frame. Solo
   * mode reads abilities.js's local cooldown/active-effect bookkeeping
   * directly; multiplayer reads the network-reported snapshots refreshed by
   * handleMatchStateChange() instead (see this.myRole's doc comment for why
   * activation itself is still driven by abilities.js locally either way —
   * only where the actual boolean state comes from differs).
   */
  applyAbilityEffects() {
    const playerBoostActive = this.wantsMultiplayer ? this._myPaddleBoostActive : isPaddleBoostActive('player');
    const botBoostActive = this.wantsMultiplayer ? this._oppPaddleBoostActive : isPaddleBoostActive('bot');

    playerPaddle.scale.x = playerBoostActive ? PADDLE_BOOST_SCALE : 1;
    botPaddle.scale.x = botBoostActive ? PADDLE_BOOST_SCALE : 1;

    setHeadBoost(playerBoostActive);
    if (!this.wantsMultiplayer) {
      setBotBoost(botBoostActive); // bot-ai.js speed multiplier — solo-only, no bot-ai running in multiplayer
    }

    // Recomputed every frame rather than once at init/resize — a single
    // snapshot risked reading the canvas's layout rect before the browser
    // had actually settled it, silently freezing in a wrong position for
    // the rest of the session. This is cheap enough (two vector projections
    // + a DOM rect read) to just never go stale.
    this.updateAnchoredUIPositions();

    if (this.wantsMultiplayer) {
      const playerType = this._myShieldActive ? 'shield' : this._myPaddleBoostActive ? 'paddleBoost' : this._slowMoActive ? 'slowMo' : null;
      const botType = this._oppShieldActive ? 'shield' : this._oppPaddleBoostActive ? 'paddleBoost' : this._slowMoActive ? 'slowMo' : null;
      updateActiveAbility('player', playerType);
      updateActiveAbility('bot', botType);
    } else {
      updateActiveAbility('player', getActiveAbility('player'));
      updateActiveAbility('bot', getActiveAbility('bot'));
    }

    updateFingerCount(getCurrentCount());
  }

  handleAbilityActivate(side, type) {
    const who = side === 'player' ? 'You' : getOpponentNoun();
    showStatus(`${who} activated ${ABILITY_TYPES[type].name}!`, 1500);

    // Report the LOCAL player's own activation to the server (the opponent
    // side's toast above instead comes from the room's 'ability_activated'
    // broadcast — see handleReady() — never from abilities.js's local bot
    // auto-timer, which is disabled entirely in multiplayer).
    if (this.wantsMultiplayer && side === 'player' && this.room) {
      this.room.send('activate_ability', { type });
    }
  }

  checkCollisions() {
    if (checkPlayerPaddleCollision(playerPaddle, ball, ballState)) {
      hitBall(playerPaddle.position, ball.position, 'player');
    }

    if (checkBotPaddleCollision(botPaddle, ball, ballState)) {
      hitBall(botPaddle.position, ball.position, 'bot');
    }
  }

  handleMiss(missedSide) {
    if (isShieldActive(missedSide)) {
      consumeShield(missedSide);
      this.deflectBall(missedSide);
      return;
    }

    stopBall();
    const winner = missedSide === 'player' ? 'bot' : 'player';
    console.log(`[Pong] ${missedSide} missed the ball`);
    playMiss();
    this.handlePointEnd(winner);
  }

  /**
   * Shield ability: save a would-be miss by bouncing the ball back into
   * play instead of ending the point, consuming the shield in the process.
   */
  deflectBall(side) {
    ballState.velocity.z *= -1;
    // Nudge it back inside the boundary so it doesn't immediately re-trigger checkMiss
    ball.position.z = side === 'bot' ? this.fieldBounds.minZ + 0.3 : this.fieldBounds.maxZ - 0.3;
    playShieldSave();
    showStatus(`🛡️ Shield saved ${side === 'player' ? 'you' : 'the bot'}!`, 1000);
  }

  handlePointEnd(winner) {
    awardPoint(winner);
    this.updateUI();
    showPointWinner(winner);
    playPointWin(winner);

    setTimeout(() => {
      if (!isGameOver()) {
        nextPoint();
        resetBall();
        resetBotState();
        resetHeadTracking();
        resetGestureTracking();
        hideStatus();
        showServePrompt(getCurrentServer());

        if (getCurrentServer() === 'bot') {
          setTimeout(() => this.serve('bot'), 1500);
        }
      } else {
        const finalWinner = getWinner();
        showGameOver(finalWinner);
        playGameOver(finalWinner);
      }
    }, 1200);
  }

  updateUI() {
    const score = getScoreDisplay();
    updateScoreDisplay(score.player, score.bot);
  }

  restartGame() {
    setAbilitiesEnabled(false);
    resetGame();
    resetBall();
    resetBotState();
    resetHeadTracking();
    resetGestureTracking();
    resetAbilities();
    this.updateUI();
    hideStatus();
    showServePrompt(getCurrentServer());

    if (getCurrentServer() === 'bot') {
      setTimeout(() => this.serve('bot'), 1500);
    }
  }
}
