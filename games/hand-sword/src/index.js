/**
 * Hand Sword Rhythm Game
 * Game class interface for Motion Platform
 */

import * as THREE from 'three';
import * as Tone from 'tone';
import { initTheme, setupBeatScheduler, getCurrentBPM, stopAudio } from './audio.js';
import {
  boxes,
  createBox,
  updateBoxes,
  checkCollision,
  destroyBox,
  rightBladeBoundingBox,
  leftBladeBoundingBox,
  getCurrentDifficulty,
  clearAllBoxes,
  resetScore
} from './game-logic.js';
import { initHealthMeter, resetHealthMeter } from './health-meter.js';
import { initBackgroundEffects, animateBackgroundEffects, resetBackgroundEffects } from './background-effects.js';
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

    // Hand tracking module
    this.handTrackingModule = null;

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

      // Store hand tracking module reference
      this.handTrackingModule = handTrackingModule;

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

      // Setup window resize
      sceneModule.setupWindowResize();

      // Initialize audio theme
      initTheme('synthwave');

      // Setup beat scheduler
      setupBeatScheduler(
        () => createBox(this.scene, getCurrentBPM()),
        getCurrentDifficulty
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

      // Setup UI
      uiModule.setupUI(this.scene, this.leftSwordGroup);

      // Initialize health meter
      initHealthMeter();

      // Initialize background effects
      initBackgroundEffects(
        this.scene,
        this.ambientLight,
        this.directionalLight,
        this.gridHelper
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

    // Clear all boxes
    if (this.scene) {
      clearAllBoxes(this.scene);
    }

    // Reset game state
    stopAudio();
    resetScore();
    resetHealthMeter();
    resetBackgroundEffects();

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

  /**
   * Enable multiplayer mode
   */
  enableMultiplayer(roomId) {
    console.log('[HandSword] Enabling multiplayer...');

    if (!this.multiplayer.isConnectedToServer()) {
      console.warn('[HandSword] Not connected to multiplayer server');
      return;
    }

    this.multiplayer.joinRoom(roomId);

    // Listen for opponent hand data
    this.multiplayer.on('opponentHand', (data) => {
      // TODO: Render opponent's sword/hands
      console.log('[HandSword] Opponent hand data received');
    });
  }
}
