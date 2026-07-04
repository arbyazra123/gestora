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
  getFieldBounds
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
  updateScore,
  showStatus,
  hideStatus,
  showGameOver,
  showServePrompt,
  showPointWinner,
  updateAbilityCooldowns,
  updateActiveAbility,
  updateFingerCount,
  cleanupUI
} from './ui.js';
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

      setupHeadTracking(playerPaddle);
      setupBotAI(botPaddle, ball);
      setBotDifficulty('medium');

      // setupUI must run first: setupAbilities() -> resetAbilities() fires
      // onCooldownChange(...) synchronously, which needs the ability panel
      // DOM elements to already exist.
      setupUI(this.container);

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

      resetGame();
      this.updateUI();
      showServePrompt(getCurrentServer());

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

  setupKeyboardControls() {
    this.keyboardHandler = (event) => {
      if (event.code === 'Space' && !event.repeat) {
        this.handleServe();
      } else if (event.code === 'KeyR' && isGameOver()) {
        this.restartGame();
      }
    };

    window.addEventListener('keydown', this.keyboardHandler);
  }

  handleServe() {
    if (gameState.gameStatus !== 'ready') return;

    if (getCurrentServer() === 'player') {
      this.serve('player');
    }
    // Bot serves itself automatically (see start()/handlePointEnd())
  }

  serve(server) {
    startAudioContext(); // fallback in case start()'s attempt didn't take (e.g. stricter browsers)
    resetBall();
    serveBall(server);
    startServe();
    serveComplete();
    playServe();
    hideStatus();
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

    if (getCurrentServer() === 'bot') {
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

    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
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

    updateGlideSound(ballState.velocity.length(), isBallActive());
    updateBotAI(deltaTime, ballState);
  }

  /**
   * Reflect current ability state onto the paddles/bot/UI each frame —
   * activation/expiry timing all lives in abilities.js, this just applies it.
   */
  applyAbilityEffects() {
    playerPaddle.scale.x = isPaddleBoostActive('player') ? PADDLE_BOOST_SCALE : 1;
    botPaddle.scale.x = isPaddleBoostActive('bot') ? PADDLE_BOOST_SCALE : 1;

    setHeadBoost(isPaddleBoostActive('player'));
    setBotBoost(isPaddleBoostActive('bot'));

    updateActiveAbility('player', getActiveAbility('player'));
    updateActiveAbility('bot', getActiveAbility('bot'));

    updateFingerCount(getCurrentCount());
  }

  handleAbilityActivate(side, type) {
    const who = side === 'player' ? 'You' : 'Bot';
    showStatus(`${who} activated ${ABILITY_TYPES[type].name}!`, 1500);
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
    updateScore(score.player, score.bot);
  }

  restartGame() {
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
