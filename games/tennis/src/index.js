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
  getBotRacketVelocity,
  updateRacketOrientation
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
import { createScoreDisplay, updateScoreDisplay, disposeScoreDisplay } from './score-display.js';
import {
  setupUI,
  updateGameScore,
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
  cleanupUI,
  setMultiplayerMode,
  showMultiplayerCountdown,
  showReadyButton,
  hideReadyButton
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

    // Multiplayer state
    this.wantsMultiplayer = !!services.launchOptions?.multiplayer;
    this.matchState = 'idle'; // idle | connecting | waiting | countdown | playing | ended
    this.room = null;
    this.isReady = false; // this player's own Ready-button state, see showReadyPrompt()
    this.myRole = null; // 'player' | 'bot' — assigned by the server on join
    this.latestState = null;
    this._onStateChange = null;
    this._lastRoomStatus = null;
    this._lastGameStatus = null;
    this._lastRacketSent = 0;

    // Set only when the player chose "Create Room" in the hub's Room List
    // (see host/src/ui/RoomListModal.js) — tennis has no pre-match settings
    // of its own to gather first, so handleReady() creates the room
    // directly with these once the player taps Play. Null when they instead
    // joined an existing room from the list (services.multiplayer.room is
    // already set in that case — see init()).
    this.pendingRoomOptions = services.launchOptions?.pendingRoomOptions || null;

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
      createScoreDisplay(scene);

      initAudio();
      this.setupAudioUnlock();

      // Setup hand tracking
      setupHandTracking(playerRacket, this.camera, this.mediaPipe);

      // Setup bot AI
      setupBotAI(botRacket, ball, this.courtBounds);
      setBotDifficulty('medium');

      // Setup UI
      setupUI(this.container, { onPlay: () => this.triggerGameStart() });

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

      if (this.wantsMultiplayer) {
        setMultiplayerMode(true);
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
          this.matchState = 'waiting';
          showStatus("You're in! Tap Ready when you're set.", 0);
          // Everything else in init() has already run by this point, so the
          // room is playable now — but sendReady() only fires once the
          // player actually clicks Ready (see showReadyPrompt()), not
          // automatically just because loading finished.
          this.showReadyPrompt();
        }
      }

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
        this.triggerGameStart();
      } else if (event.code === 'KeyR' && !this.wantsMultiplayer && isGameOver()) {
        this.restartGame();
      }
    };

    window.addEventListener('keydown', this.keyboardHandler);
  }

  /**
   * Shared by the SPACE keydown handler and the intro overlay's tap-to-play
   * button (see ui.js's onPlay callback) — one touch-friendly trigger for
   * both input paths, since mobile has no keyboard to press SPACE on.
   */
  triggerGameStart() {
    if (!this.awaitingGameStart) return;
    this.awaitingGameStart = false;
    if (this.wantsMultiplayer) {
      this.handleReady();
    } else {
      this.runStartCountdown();
    }
  }

  /**
   * Wait for the player to press SPACE before the game (or a restarted
   * game) actually begins — individual serves within the game are never
   * gated behind this, only the initial kickoff.
   */
  promptGameStart() {
    this.awaitingGameStart = true;
    setGestureDetectionEnabled(false);
    showStatus(this.wantsMultiplayer ? 'Press SPACE to Find Opponent' : 'Press SPACE to Start', 0);
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
    // Every serving client — regardless of assigned server role — always
    // serves from their own local side (resetBallPosition()'s fixed local
    // origin), exactly like the original solo player serve. Whichever role
    // this client was assigned only affects the coordinate mirror applied
    // when reporting the result to the server below (see mirrorVec()).
    resetBallPosition();
    serveBall(power);

    if (this.wantsMultiplayer) {
      this.reportServe();
    } else {
      startServe();
      serveComplete();
    }
    hideStatus();
  }

  // ---------- Multiplayer ----------

  /**
   * Mirrors a {x,y,z} vector through the net (180° rotation about Y):
   * (x,y,z) -> (-x,y,-z). Self-inverse — used both when translating this
   * client's local coordinates into the shared server frame, and vice
   * versa. Only ever applied when this.myRole === 'bot' — see the class
   * doc comment above for why: every client's hand-tracking always
   * renders its own paddle in the same "near the camera" local frame, so
   * whichever client is assigned the far/'bot' side needs this transform
   * to place their actions on the correct side of the shared court, and
   * to render the shared ball/opponent paddle back into their own view.
   */
  mirrorVec(v) {
    return { x: -v.x, y: v.y, z: -v.z };
  }

  toShared(v) {
    return this.myRole === 'bot' ? this.mirrorVec(v) : v;
  }

  toLocal(v) {
    return this.myRole === 'bot' ? this.mirrorVec(v) : v; // self-inverse
  }

  /**
   * Translates a server-side role string ('player'/'bot' — whichever side
   * of the court, from the server's point of view) into this client's own
   * locally-relative terms, where 'player' always means "me" and 'bot'
   * always means "my opponent" (since both clients' local game code always
   * treats itself as 'player' — see hitBall() calls below).
   */
  translateRole(serverRole) {
    return serverRole === this.myRole ? 'player' : 'bot';
  }

  /**
   * Send the resulting serve velocity/spin (already computed locally by
   * serveBall(), reusing the exact same finger-count-challenge-driven
   * mechanic as solo mode) to the server, which becomes the sole authority
   * over the ball from this point until the next hit/serve report.
   */
  reportServe() {
    if (!this.room) return;
    this.room.send('serve', {
      position: this.toShared({ x: ball.position.x, y: ball.position.y, z: ball.position.z }),
      velocity: this.toShared({ x: ballState.velocity.x, y: ballState.velocity.y, z: ballState.velocity.z }),
      spin: this.toShared({ x: ballState.spin.x, y: ballState.spin.y, z: ballState.spin.z })
    });
  }

  /**
   * Same idea as reportServe(), for a rally hit — the resulting velocity
   * already comes from hitBall()'s existing gesture/smash-aware math,
   * called exactly as in solo mode.
   */
  reportHit() {
    if (!this.room) return;
    this.room.send('hit', {
      velocity: this.toShared({ x: ballState.velocity.x, y: ballState.velocity.y, z: ballState.velocity.z }),
      spin: this.toShared({ x: ballState.spin.x, y: ballState.spin.y, z: ballState.spin.z })
    });
  }

  /**
   * Broadcast this client's own racket position, throttled to ~20Hz
   * (matches the throttle MultiplayerService uses elsewhere in this
   * project) — purely for rendering the opponent's paddle on the other
   * client; the server doesn't use this for hit validation (see the
   * trust-model comment in server/src/rooms/TennisRoom.js).
   */
  sendRacketPosition() {
    if (!this.room) return;
    const now = performance.now();
    if (now - this._lastRacketSent < 50) return;
    this._lastRacketSent = now;
    this.room.send('racket', this.toShared({
      x: playerRacket.position.x, y: playerRacket.position.y, z: playerRacket.position.z
    }));
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
      await this.multiplayer.createRoom('tennis', this.pendingRoomOptions || {});
      this.room = this.multiplayer.room;
      this.matchState = 'waiting';
      showStatus("Room created! Tap Ready when you're set.", 0);
      // The room existing doesn't mean this player is actually ready — that
      // now requires an explicit click (see showReadyPrompt()), not just
      // "the room happens to exist by the time Play was tapped."
      this.showReadyPrompt();
    } catch (error) {
      console.error('[Table Tennis] Failed to create multiplayer match:', error);
      showStatus('Connection failed', 0);
    }
  }

  /**
   * Show the Ready toggle and wire it to actually send ready/unready — the
   * only place that calls multiplayer.sendReady()/sendUnready() now. See
   * server/src/rooms/roomReady.js's doc comment for why the server
   * debounces the countdown instead of committing the instant the last
   * seat reports ready.
   */
  showReadyPrompt() {
    this.isReady = false;
    showReadyButton((isReady) => {
      this.isReady = isReady;
      if (isReady) {
        this.multiplayer.sendReady();
      } else {
        this.multiplayer.sendUnready();
      }
    });
  }

  /**
   * Begin whichever side's serve turn it is, in multiplayer terms: reuses
   * the exact same finger-count challenge as solo mode when it's this
   * client's own turn (regardless of assigned server role — see
   * completePlayerServe()'s comment), or just waits when it's the real
   * opponent's turn.
   */
  beginMultiplayerServeTurn() {
    setGestureDetectionEnabled(true);
    if (this.translateRole(this.latestState.game.currentServer) === 'player') {
      this.startPlayerServeChallenge();
    } else {
      showStatus('Waiting for opponent to serve...', 0);
    }
  }

  /**
   * Fired on every synced room state change (see MultiplayerService's
   * 'stateChange' event, wired in init()) — this includes high-frequency
   * ball/racket position ticks, not just rare status transitions, so
   * one-shot reactions below are guarded by comparing against the last
   * seen value rather than assuming this only fires on meaningful edges.
   */
  handleMatchStateChange(state) {
    this.latestState = state;

    if (!this.myRole) {
      const me = state.players.get(this.multiplayer.getPlayerId());
      if (me) this.myRole = me.role;
    }
    if (!this.myRole) return; // haven't seen our own player entry yet

    // Continuously mirror the server-authoritative ball into this client's
    // own local frame — checkPlayerRacketCollision()/hitBall() below (and
    // their solo-mode counterparts) operate on these same `ball`/`ballState`
    // module singletons unchanged, so this is the only place that needs to
    // know a network sync is happening at all.
    // Captured before overwriting ball.position below — see
    // ballState.previousPosition's doc comment in physics.js. Multiplayer
    // never calls updateBall() locally (the server owns ball motion), so
    // this is the only place that ever advances it in that mode.
    ballState.previousPosition.copy(ball.position);

    const localBallPos = this.toLocal({ x: state.ball.position.x, y: state.ball.position.y, z: state.ball.position.z });
    ball.position.set(localBallPos.x, localBallPos.y, localBallPos.z);
    const localBallVel = this.toLocal({ x: state.ball.velocity.x, y: state.ball.velocity.y, z: state.ball.velocity.z });
    ballState.velocity.set(localBallVel.x, localBallVel.y, localBallVel.z);
    const localBallSpin = this.toLocal({ x: state.ball.spin.x, y: state.ball.spin.y, z: state.ball.spin.z });
    ballState.spin.set(localBallSpin.x, localBallSpin.y, localBallSpin.z);
    ballState.isActive = state.ball.isActive;
    ballState.lastHitBy = state.ball.lastHitBy ? this.translateRole(state.ball.lastHitBy) : null;

    // Opponent paddle, same local-frame translation, then face it toward
    // wherever the (also just-synced) ball currently is — reuses bot-ai.js's
    // existing orientation math unchanged.
    const myId = this.multiplayer.getPlayerId();
    const opponent = [...state.players.values()].find((p) => p.sessionId !== myId);
    if (opponent) {
      const localRacket = this.toLocal({ x: opponent.racket.x, y: opponent.racket.y, z: opponent.racket.z });
      botRacket.position.set(localRacket.x, localRacket.y, localRacket.z);
      updateRacketOrientation();
    }

    // Score/rally display — cheap and idempotent, no edge-guard needed.
    const rawScore = getScoreDisplay({ playerScore: state.game.playerScore, botScore: state.game.botScore });
    const myLabel = this.myRole === 'player' ? rawScore.player : rawScore.bot;
    const oppLabel = this.myRole === 'player' ? rawScore.bot : rawScore.player;
    updateScoreDisplay(myLabel, oppLabel);
    const myGames = this.myRole === 'player' ? state.game.playerGames : state.game.botGames;
    const oppGames = this.myRole === 'player' ? state.game.botGames : state.game.playerGames;
    updateGameScore(myGames, oppGames);

    // While still waiting (pre-countdown), reflect the opponent's Ready
    // state in the status text so the player knows why the match hasn't
    // started yet — either they haven't clicked Ready themselves, or
    // they're stuck waiting on the other player to.
    if (state.status === 'waiting' && this.matchState === 'waiting') {
      const myId = this.multiplayer.getPlayerId();
      const opponent = [...state.players.values()].find((p) => p.sessionId !== myId);
      if (!opponent) {
        showStatus("You're in! Tap Ready when you're set.", 0);
      } else if (this.isReady && !opponent.ready) {
        showStatus('Waiting for opponent to be ready...', 0);
      } else if (!this.isReady) {
        showStatus("Tap Ready when you're set!", 0);
      }
    }

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
      setGestureDetectionEnabled(false);
      showStatus('Opponent disconnected', 0);
    }

    // gameStatus defaults to 'ready' from room creation onward (i.e. before
    // state.status ever reaches 'playing'), so a plain "gameStatus just
    // became ready" edge-check alone would get silently consumed during
    // the waiting/countdown phase — this.​_lastGameStatus would already
    // equal 'ready' by the time the room is actually live, and the real
    // first-serve edge would never fire. Two separate edges cover it: the
    // room's own waiting/countdown -> playing transition (the first serve)
    // and gameStatus cycling back to 'ready' after a point (every serve
    // after that, which cleanly passes through 'serving'/'playing'/
    // 'point-over' in between, so its edge-detection isn't pre-consumed).
    const justStartedPlaying = state.status === 'playing' && this._lastRoomStatus !== 'playing';
    const justBecameReadyAgain = state.game.gameStatus === 'ready' && this._lastGameStatus !== 'ready';
    if (state.status === 'playing' && (justStartedPlaying || justBecameReadyAgain)) {
      this.beginMultiplayerServeTurn();
    }

    // The opponent's serve just completed (rally is live) — clear the
    // "Waiting for opponent to serve..." status from beginMultiplayerServeTurn()
    // above. Our own serve already clears it via completePlayerServe()'s
    // hideStatus(), but that only covers this client's own turn — this edge
    // is what previously left the message stuck once the opponent served.
    if (state.game.gameStatus === 'playing' && this._lastGameStatus !== 'playing') {
      hideStatus();
    }

    if (state.game.gameStatus === 'point-over' && this._lastGameStatus !== 'point-over') {
      const winner = this.translateRole(state.game.lastPointWinner);
      showPointWinner(winner);
      if (rawScore.player === 'Deuce') playDeuce();
      else playPoint(winner);
    }

    if (state.game.gameStatus === 'game-over' && this._lastGameStatus !== 'game-over') {
      const finalWinnerServerRole = state.game.playerGames >= 2 ? 'player' : 'bot';
      const winner = this.translateRole(finalWinnerServerRole);
      showGameOver(winner);
      playGameOver(winner);
    }

    this._lastRoomStatus = state.status;
    this._lastGameStatus = state.game.gameStatus;
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

    // Set synchronously, before any await, so a tap on the intro overlay's
    // Play button (see ui.js) can never race ahead of awaitingGameStart
    // actually being true.
    this.promptGameStart();

    // Browsers require a user gesture before audio can play; this is called
    // right after the hub's "Play" click, and it's harmless/idempotent to
    // retry from startPlayerServeChallenge() (a more direct keypress/pointer
    // gesture) if this doesn't take in stricter browsers.
    await startAudioContext();
    startMusic();

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

    // Tear down multiplayer — multiplayerService is a singleton reused
    // across game load/unload cycles, so stale listeners from this match
    // must not linger into the next one.
    if (this.wantsMultiplayer) {
      if (this._onStateChange) this.multiplayer.off('stateChange', this._onStateChange);
      this.multiplayer.leaveRoom();
      this.room = null;
      this.matchState = 'idle';
      this.isReady = false;
    }

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
    disposeScoreDisplay();

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

    if (this.wantsMultiplayer) {
      this.updateMultiplayerGameLogic();
    } else {
      this.updateSoloGameLogic(deltaTime);
    }

    // Update UI (debug readouts — harmless/identical in both modes)
    updateFingerCount(getCurrentFingerCount());
    updateSwingDirection(getArmedDirection());
    updateSmashStatus(isSmashArmed());
  }

  /**
   * Solo-mode ball physics + bot AI + both-sides collision checking —
   * unchanged from the original single-player implementation.
   */
  updateSoloGameLogic(deltaTime) {
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
  }

  /**
   * Multiplayer: the ball's continuous flight (gravity/bounce/net/scoring)
   * is entirely server-owned (see handleMatchStateChange(), which keeps
   * `ball`/`ballState` synced from the network every tick) — this only
   * needs to check MY OWN racket against wherever that synced ball
   * currently is, and report the resulting hit. The opponent's hit
   * detection happens on their own client, not here.
   */
  updateMultiplayerGameLogic() {
    if (ballState.isActive && checkPlayerRacketCollision(playerRacket, ball, ballState)) {
      const velocity = getRacketVelocity();
      const swing = consumePendingSwing();
      const smash = consumePendingSmash();
      hitBall(ball.position, velocity, 'player', swing, smash);
      this.reportHit();
    }

    this.sendRacketPosition();
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
    updateScoreDisplay(score.player, score.bot);

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
