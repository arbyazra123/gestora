/**
 * Motion Table Tennis
 * Play table tennis against a bot using hand tracking
 * Game class interface for Motion Platform
 */

import * as THREE from 'three';
import {
  initScene,
  setupWindowResize,
  scene,
  camera,
  renderer,
  playerRacket,
  botRacket,
  getCourtBounds
} from './scene.js';
import {
  setupHandTracking,
  handleHandTrackingResults,
  getRacketVelocity,
  consumePendingSwing,
  updateSwingAnimation,
  getCurrentFingerCount,
  getArmedDirection,
  consumePendingSmash,
  isSmashArmed,
  setGestureDetectionEnabled
} from './hand-tracking.js';
import {
  createBall,
  updateBall,
  serveBall,
  hitBall,
  resetBallPosition,
  ball,
  ballState,
  getBallBoundingBox,
  isBallActive,
  stopBall,
  consumeBounceResult
} from './physics.js';
import {
  setupBotAI,
  updateBotAI,
  shouldBotHit,
  getBotHitVelocity,
  setBotDifficulty,
  resetBotState,
  getBotRacketVelocity
} from './bot-ai.js';
import {
  resetGame,
  startServe,
  serveComplete,
  checkPlayerRacketCollision,
  checkBotRacketCollision,
  awardPoint,
  getScoreDisplay,
  getGameScore,
  isPointOver,
  isGameOver,
  getWinner,
  nextPoint,
  getRallyCount,
  getCurrentServer,
  gameState
} from './game-logic.js';
import {
  setupUI,
  updateScore,
  updateGameScore,
  updateRallyCount,
  updateFingerCount,
  updateSwingDirection,
  updateSmashStatus,
  showStatus,
  hideStatus,
  showGameOver,
  showServePrompt,
  showPointWinner,
  showServeChallenge,
  updateServeChallengeDisplay,
  hideServeChallenge,
  cleanupUI
} from './ui.js';
import {
  initAudio,
  startAudioContext,
  startMusic,
  stopMusic,
  playPoint,
  playDeuce,
  playGameOver
} from './audio.js';
import {
  startServeChallenge,
  isServeChallengeActive,
  getServeChallengeState,
  updateServeChallenge,
  cancelServeChallenge,
  setServeChallengeResolveCallback
} from './serve-challenge.js';

const MIN_SERVE_POWER = 4; // power for a serve where 0/3 digits were confirmed in time
const MAX_SERVE_POWER = 12; // power for a full 3/3 serve

export default class TableTennisGame {
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
    this.courtBounds = null;

    // Tracks whether the ball has already had its one legal bounce on the
    // current side since the last hit — a second bounce before either
    // player touches it again is a fault (see handleBounce()).
    this.awaitingReturnHit = false;

    // Whether we're waiting on the player to press SPACE to kick off the
    // start-of-game countdown (see promptGameStart()) — this only gates
    // the game actually beginning/restarting, not individual serves,
    // which are handled entirely by the finger-count challenge.
    this.awaitingGameStart = false;

    // Keyboard controls
    this.keyboardHandler = null;

    console.log('[Table Tennis] Game instance created');
  }

  /**
   * Initialize the game
   */
  async init() {
    console.log('[Table Tennis] Initializing...');

    try {
      // Initialize scene
      initScene(this.container);
      setupWindowResize();

      // Get court boundaries
      this.courtBounds = getCourtBounds();

      // Create the ball
      createBall(scene);

      initAudio();
      this.setupAudioUnlock();

      // Setup hand tracking
      setupHandTracking(playerRacket, this.camera, this.mediaPipe);

      // Setup bot AI
      setupBotAI(botRacket, ball, this.courtBounds);
      setBotDifficulty('medium');

      // Setup UI
      setupUI(this.container);

      // Subscribe to MediaPipe hand tracking
      this.mediaPipe.subscribe('tennis', (results) => {
        handleHandTrackingResults(results);
      });

      // Setup keyboard controls
      this.setupKeyboardControls();

      // Resolve the player's serve once their finger-count challenge
      // completes (in full or via timeout — see completePlayerServe())
      setServeChallengeResolveCallback((powerRatio, completedCount) => {
        this.completePlayerServe(powerRatio, completedCount);
      });

      // Initialize game state
      resetGame();
      this.updateUI();

      console.log('[Table Tennis] Initialized successfully');
    } catch (error) {
      console.error('[Table Tennis] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Browsers only resume a suspended AudioContext from inside a genuine,
   * direct user-gesture event handler — calling Tone.start() several awaits
   * deep inside start()'s promise chain isn't reliably recognized as one.
   * This listens for the very first raw pointerdown/keydown on the page and
   * calls it synchronously as the first thing that handler does, which
   * browsers do accept.
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
   * Setup keyboard controls
   */
  setupKeyboardControls() {
    this.keyboardHandler = (event) => {
      if (event.code === 'Space' && !event.repeat && this.awaitingGameStart) {
        this.awaitingGameStart = false;
        this.runStartCountdown();
      } else if (event.code === 'KeyR' && isGameOver()) {
        this.restartGame();
      }
    };

    window.addEventListener('keydown', this.keyboardHandler);
  }

  /**
   * Wait for the player to press SPACE before the game (or a restarted
   * game) actually begins — individual serves within the game are never
   * gated behind this, only the initial kickoff.
   */
  promptGameStart() {
    this.awaitingGameStart = true;
    setGestureDetectionEnabled(false);
    showStatus('Press SPACE to Start', 0);
  }

  /**
   * 3-2-1 countdown after SPACE is pressed, then hands off to the normal
   * serve flow.
   */
  runStartCountdown() {
    let count = 3;
    showStatus(String(count), 0);

    const tick = () => {
      if (!this.isRunning) return; // game was stopped mid-countdown

      count--;
      if (count > 0) {
        showStatus(String(count), 0);
        setTimeout(tick, 1000);
      } else {
        showStatus('GO!', 600);
        setTimeout(() => {
          if (!this.isRunning) return;
          hideStatus();
          this.beginServeTurn();
        }, 600);
      }
    };

    setTimeout(tick, 1000);
  }

  /**
   * Begin whichever side's serve turn it is: the player serves via the
   * finger-count challenge below (no button press), the bot serves itself
   * automatically after a short delay, same as before.
   */
  beginServeTurn() {
    if (gameState.gameStatus !== 'ready') return;

    // The game is genuinely underway once a serve turn begins — allow swing/
    // smash gestures from here on (harmless to call again on later points).
    setGestureDetectionEnabled(true);

    if (getCurrentServer() === 'player') {
      this.startPlayerServeChallenge();
    } else {
      showServePrompt('bot');
      setTimeout(() => this.handleBotServe(), 2000);
    }
  }

  /**
   * Start the 3-digit finger-count challenge that drives the player's serve.
   */
  startPlayerServeChallenge() {
    startAudioContext(); // fallback in case start()'s attempt didn't take (e.g. stricter browsers)
    console.log('[Table Tennis] Player serve challenge started');

    const digits = startServeChallenge();
    showServeChallenge(digits);
  }

  /**
   * Resolve callback for the serve challenge (full completion or timeout) —
   * serve power scales with how many of the 3 digits were confirmed in time.
   */
  completePlayerServe(powerRatio, completedCount) {
    console.log(`[Table Tennis] Player serving (${completedCount}/3 digits, power ratio ${powerRatio.toFixed(2)})`);

    hideServeChallenge();

    const power = MIN_SERVE_POWER + powerRatio * (MAX_SERVE_POWER - MIN_SERVE_POWER);

    this.awaitingReturnHit = false;
    resetBallPosition();
    serveBall(power);
    startServe();
    serveComplete();
    hideStatus();
  }

  /**
   * Handle bot serve
   */
  handleBotServe() {
    this.awaitingReturnHit = false;
    resetBallPosition();
    ball.position.set(0, 1.9, 4);

    // Bot serves towards player (magnitude matches the player's serveBall(8) power
    // so it actually clears the net given the same arc time — -6 fell short and
    // landed back on the bot's own side almost every time, faulting the serve)
    ballState.velocity.set(
      (Math.random() - 0.5) * 2,
      1,
      -8
    );
    ballState.spin.set(0, 0, 2);
    ballState.isActive = true;
    ballState.lastHitBy = 'bot';

    startServe();
    serveComplete();
    hideStatus();
  }

  /**
   * Start the game loop
   */
  async start() {
    if (this.isRunning) {
      console.warn('[Table Tennis] Already running');
      return;
    }

    console.log('[Table Tennis] Starting...');

    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();

    // Browsers require a user gesture before audio can play; this is called
    // right after the hub's "Play" click, and it's harmless/idempotent to
    // retry from startPlayerServeChallenge() (a more direct keypress/pointer
    // gesture) if this doesn't take in stricter browsers.
    await startAudioContext();
    startMusic();

    this.promptGameStart();

    // Start animation loop
    this.animate();

    console.log('[Table Tennis] Started');
  }

  /**
   * Pause the game
   */
  pause() {
    if (!this.isRunning || this.isPaused) return;

    console.log('[Table Tennis] Paused');
    this.isPaused = true;
    showStatus('Paused', 0);
  }

  /**
   * Resume the game
   */
  resume() {
    if (!this.isRunning || !this.isPaused) return;

    console.log('[Table Tennis] Resumed');
    this.isPaused = false;
    this.lastTime = performance.now();
    hideStatus();
  }

  /**
   * Stop the game
   */
  stop() {
    if (!this.isRunning) return;

    console.log('[Table Tennis] Stopping...');

    this.isRunning = false;
    this.isPaused = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    stopMusic();
    cancelServeChallenge();
    hideServeChallenge();
    this.awaitingGameStart = false;
    setGestureDetectionEnabled(false);

    console.log('[Table Tennis] Stopped');
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('[Table Tennis] Cleaning up...');

    // Unsubscribe from hand tracking
    this.mediaPipe.unsubscribe('tennis');

    // Remove keyboard listener
    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
    }

    if (this.audioUnlockHandler) {
      window.removeEventListener('pointerdown', this.audioUnlockHandler);
      window.removeEventListener('keydown', this.audioUnlockHandler);
    }

    // Cleanup UI
    cleanupUI();

    // Dispose Three.js resources
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
            object.material.forEach(mat => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }

    console.log('[Table Tennis] Cleaned up');
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
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    // Update game logic
    this.updateGameLogic(deltaTime);

    // Render scene
    renderer.render(scene, camera);
  }

  /**
   * Update game logic
   */
  updateGameLogic(deltaTime) {
    // Play the swing gesture's visual snap, if one is active
    updateSwingAnimation();

    // Drive the player's serve challenge, if one is in progress
    if (isServeChallengeActive()) {
      updateServeChallenge(getCurrentFingerCount());
      updateServeChallengeDisplay(getServeChallengeState());
    }

    // Update ball physics
    if (isBallActive()) {
      updateBall(deltaTime, this.courtBounds);

      // Handle whatever the ball's most recent bounce (if any) means for the
      // rally, before checking whether a racket just returned it.
      const bounceResult = consumeBounceResult();
      if (bounceResult) {
        this.handleBounce(bounceResult);
      }

      // Check for collisions
      this.checkCollisions();
    }

    // Update bot AI
    updateBotAI(deltaTime, ballState);

    // Check bot collision
    if (shouldBotHit(ball.position, botRacket.position)) {
      const botVelocity = getBotHitVelocity(ball.position);
      hitBall(ball.position, botVelocity, 'bot');
      this.awaitingReturnHit = false;
    }

    // Update UI
    updateRallyCount(getRallyCount());
    updateFingerCount(getCurrentFingerCount());
    updateSwingDirection(getArmedDirection());
    updateSmashStatus(isSmashArmed());
  }

  /**
   * Check for racket-ball collisions
   */
  checkCollisions() {
    // Check player racket collision
    if (checkPlayerRacketCollision(playerRacket, ball, ballState)) {
      const velocity = getRacketVelocity();
      const swing = consumePendingSwing();
      const smash = consumePendingSmash();
      hitBall(ball.position, velocity, 'player', swing, smash);
      this.awaitingReturnHit = false;
    }

    // Check bot racket collision
    if (checkBotRacketCollision(botRacket, ball, ballState)) {
      const botVelocity = getBotRacketVelocity();
      hitBall(ball.position, botVelocity, 'bot');
      this.awaitingReturnHit = false;
    }
  }

  /**
   * Handle ball going out of bounds
   */
  handleBallOut() {
    stopBall();
    console.log('[Table Tennis] Ball out of bounds');

    // If the ball already had its one legal in-bounds bounce and nobody
    // returned it before it rolled out, that's a failure to return — the
    // same fault as a same-side double bounce, so the last hitter still
    // wins the point. Only a shot that goes out WITHOUT landing in first
    // (awaitingReturnHit still false) is the hitter's own fault.
    const winner = this.awaitingReturnHit
      ? ballState.lastHitBy
      : ballState.lastHitBy === 'player' ? 'bot' : 'player';

    this.awaitingReturnHit = false;
    this.handlePointEnd(winner);
  }

  /**
   * A point ends immediately once the ball bounces twice on the same side
   * without an intervening hit — the receiver had their one chance to
   * return it and missed, so whoever hit it last wins the point, same as
   * real table tennis (rather than waiting for the ball to eventually roll
   * off the table, which is what checkBallOut alone used to require).
   */
  handleBounce(result) {
    if (result === 'out') {
      this.handleBallOut();
      return;
    }

    // The ball's first bounce after a hit must land on the opponent's side.
    // If it lands back on the hitter's own side instead — e.g. clipping the
    // net and failing to cross over — that's the hitter's own mistake, so
    // the opponent wins immediately rather than this being treated as a
    // legal rally bounce awaiting a return.
    const expectedSide = ballState.lastHitBy === 'player' ? 'bot-court' : 'player-court';
    if (result !== expectedSide) {
      stopBall();
      const winner = ballState.lastHitBy === 'player' ? 'bot' : 'player';
      this.awaitingReturnHit = false;
      this.handlePointEnd(winner);
      return;
    }

    if (this.awaitingReturnHit) {
      stopBall();
      this.handlePointEnd(ballState.lastHitBy);
      this.awaitingReturnHit = false;
    } else {
      this.awaitingReturnHit = true;
    }
  }

  /**
   * Handle point end
   */
  handlePointEnd(winner) {
    const score = awardPoint(winner);
    this.updateUI();

    showPointWinner(winner);

    if (isGameOver()) {
      playGameOver(getWinner());
    } else if (score.player === 'Deuce' && score.bot === 'Deuce') {
      playDeuce();
    } else {
      playPoint(winner);
    }

    // Reset for next point
    setTimeout(() => {
      if (!isGameOver()) {
        nextPoint();
        resetBallPosition();
        resetBotState();
        hideStatus();
        this.beginServeTurn();
      } else {
        const finalWinner = getWinner();
        showGameOver(finalWinner);
      }
    }, 2000);
  }

  /**
   * Update UI with current scores
   */
  updateUI() {
    const score = getScoreDisplay();
    updateScore(score.player, score.bot);

    const gameScore = getGameScore();
    updateGameScore(gameScore.playerGames, gameScore.botGames);
  }

  /**
   * Restart game
   */
  restartGame() {
    resetGame();
    resetBallPosition();
    resetBotState();
    this.awaitingReturnHit = false;
    cancelServeChallenge();
    hideServeChallenge();
    this.updateUI();
    hideStatus();
    this.promptGameStart();
  }
}
