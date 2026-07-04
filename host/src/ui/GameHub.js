/**
 * Game Hub UI
 * Displays available games and handles game selection
 */

import { gameManager } from '../core/GameManager.js';

// Game registry with manifests
// In development, manifest is inlined for simplicity
const GAMES = [
  {
    id: 'hand-sword',
    name: 'Hand Sword Rhythm',
    description: 'Slice boxes to the beat with your hands',
    thumbnail: '/games/hand-sword/thumb.jpg',
    manifest: {
      id: 'hand-sword',
      name: 'Hand Sword Rhythm',
      remoteEntry: 'http://localhost:5001/assets/remoteEntry.js',
      handTracking: { mode: 'dual', maxHands: 2 }
    },
    tags: ['rhythm', 'music', 'action'],
    players: '1-2',
    status: 'available'
  },
  {
    id: 'tennis',
    name: 'Motion Tennis',
    description: 'Play tennis against a bot using hand tracking to control your racket',
    thumbnail: '/games/tennis/thumb.jpg',
    manifest: {
      id: 'tennis',
      name: 'Motion Tennis',
      remoteEntry: 'http://localhost:5002/assets/remoteEntry.js',
      handTracking: { mode: 'single', maxHands: 1 }
    },
    tags: ['sports', 'tennis', 'bot'],
    players: '1',
    status: 'available'
  },
  {
    id: 'pong',
    name: 'Motion Pong',
    description: 'Classic pong — move your head left and right to control your paddle, and hold up finger-count gestures to trigger special abilities',
    thumbnail: '/games/pong/thumb.jpg',
    manifest: {
      id: 'pong',
      name: 'Motion Pong',
      remoteEntry: 'http://localhost:5003/assets/remoteEntry.js',
      tracking: { type: 'tasksVision' }
    },
    tags: ['arcade', 'pong', 'bot'],
    players: '1',
    status: 'available'
  }
  // Future games will be added here
];

export class GameHub {
  constructor(container) {
    this.container = container;
    this.hubElement = null;
    this.gameContainerElement = null;
    this.isGameActive = false;
  }

  /**
   * Initialize and render the hub
   */
  init() {
    this.render();
    this.attachEventListeners();
    console.log('[GameHub] Initialized');

    // Resume straight into a game after a reload forced by a tracking-type
    // switch (see GameManager.loadGameWithManifest)
    const pendingGameId = sessionStorage.getItem('motion-platform:pending-game');
    if (pendingGameId) {
      sessionStorage.removeItem('motion-platform:pending-game');
      this.loadGame(pendingGameId);
    }
  }

  /**
   * Render the game hub UI
   */
  render() {
    this.container.innerHTML = `
      <div id="game-hub" class="game-hub">
        <header class="hub-header">
          <h1>🎮 Motion Game Platform</h1>
          <p class="subtitle">Hand-tracking powered games</p>
        </header>

        <div class="games-grid">
          ${GAMES.map(game => this.renderGameCard(game)).join('')}
        </div>

        <div id="loading-overlay" class="loading-overlay hidden">
          <div class="loading-spinner"></div>
          <p>Loading game...</p>
        </div>
      </div>

      <div id="game-container" class="game-container hidden"></div>

      <button id="back-to-hub" class="back-button hidden">
        ← Back to Games
      </button>
    `;

    this.hubElement = document.getElementById('game-hub');
    this.gameContainerElement = document.getElementById('game-container');

    this.injectStyles();
  }

  /**
   * Render individual game card
   */
  renderGameCard(game) {
    return `
      <div class="game-card" data-game-id="${game.id}">
        <div class="game-thumbnail">
          <div class="thumbnail-placeholder">🎮</div>
        </div>
        <div class="game-info">
          <h3>${game.name}</h3>
          <p class="game-description">${game.description}</p>
          <div class="game-meta">
            <span class="game-players">👥 ${game.players}</span>
            <div class="game-tags">
              ${game.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
          </div>
          <button class="play-button" data-game-id="${game.id}">
            ▶ Play
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Play button clicks
    document.querySelectorAll('.play-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const gameId = e.target.dataset.gameId;
        this.loadGame(gameId);
      });
    });

    // Back to hub button
    const backButton = document.getElementById('back-to-hub');
    backButton.addEventListener('click', () => {
      this.returnToHub();
    });
  }

  /**
   * Load and start a game
   */
  async loadGame(gameId) {
    const game = GAMES.find(g => g.id === gameId);
    if (!game) {
      console.error(`[GameHub] Game "${gameId}" not found`);
      return;
    }

    try {
      // Show loading
      this.showLoading();

      // Initialize game manager if not already
      if (!gameManager.gameContainer) {
        gameManager.init(this.gameContainerElement);
      }

      // Load the game with inlined manifest
      await gameManager.loadGameWithManifest(gameId, game.manifest);

      // Hide hub, show game
      this.showGame();

    } catch (error) {
      console.error(`[GameHub] Failed to load game:`, error);
      alert(`Failed to load game: ${error.message}`);
      this.hideLoading();
    }
  }

  /**
   * Return to hub from game
   */
  async returnToHub() {
    if (!confirm('Are you sure you want to exit the game?')) {
      return;
    }

    try {
      this.showLoading();

      // Unload current game
      await gameManager.unloadGame();

      // Show hub, hide game
      this.hideGame();
      this.hideLoading();

    } catch (error) {
      console.error('[GameHub] Error returning to hub:', error);
      this.hideLoading();
    }
  }

  /**
   * Show loading overlay
   */
  showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
  }

  /**
   * Hide loading overlay
   */
  hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
  }

  /**
   * Show game container, hide hub
   */
  showGame() {
    this.hubElement.classList.add('hidden');
    this.gameContainerElement.classList.remove('hidden');
    document.getElementById('back-to-hub').classList.remove('hidden');
    this.isGameActive = true;
  }

  /**
   * Show hub, hide game container
   */
  hideGame() {
    this.hubElement.classList.remove('hidden');
    this.gameContainerElement.classList.add('hidden');
    document.getElementById('back-to-hub').classList.add('hidden');
    this.isGameActive = false;
  }

  /**
   * Inject CSS styles
   */
  injectStyles() {
    if (document.getElementById('gamehub-styles')) return;

    const style = document.createElement('style');
    style.id = 'gamehub-styles';
    style.textContent = `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 100%);
        color: #fff;
        overflow-x: hidden;
      }

      .game-hub {
        padding: 40px 20px;
        max-width: 1400px;
        margin: 0 auto;
      }

      .hub-header {
        text-align: center;
        margin-bottom: 60px;
      }

      .hub-header h1 {
        font-size: 3em;
        margin-bottom: 10px;
        background: linear-gradient(90deg, #00ffff, #ff00ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .subtitle {
        font-size: 1.2em;
        color: #aaa;
      }

      .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 30px;
        padding: 20px;
      }

      .game-card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 15px;
        overflow: hidden;
        border: 2px solid rgba(0, 255, 255, 0.2);
        transition: all 0.3s ease;
        cursor: pointer;
      }

      .game-card:hover {
        transform: translateY(-10px);
        border-color: rgba(0, 255, 255, 0.6);
        box-shadow: 0 10px 40px rgba(0, 255, 255, 0.3);
      }

      .game-thumbnail {
        height: 200px;
        background: linear-gradient(135deg, #1a1a3a, #2a2a4a);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .thumbnail-placeholder {
        font-size: 4em;
        opacity: 0.5;
      }

      .game-info {
        padding: 20px;
      }

      .game-info h3 {
        font-size: 1.5em;
        margin-bottom: 10px;
        color: #00ffff;
      }

      .game-description {
        color: #ccc;
        margin-bottom: 15px;
        line-height: 1.6;
      }

      .game-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding: 10px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .game-players {
        color: #aaa;
        font-size: 0.9em;
      }

      .game-tags {
        display: flex;
        gap: 5px;
      }

      .tag {
        background: rgba(255, 0, 255, 0.2);
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 0.8em;
        color: #ff00ff;
      }

      .play-button {
        width: 100%;
        padding: 15px;
        background: linear-gradient(90deg, #00ffff, #ff00ff);
        border: none;
        border-radius: 8px;
        color: #fff;
        font-size: 1.1em;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
      }

      .play-button:hover {
        transform: scale(1.05);
        box-shadow: 0 5px 20px rgba(0, 255, 255, 0.5);
      }

      .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(10, 10, 26, 0.95);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }

      .loading-spinner {
        width: 60px;
        height: 60px;
        border: 4px solid rgba(0, 255, 255, 0.2);
        border-top-color: #00ffff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .loading-overlay p {
        margin-top: 20px;
        font-size: 1.2em;
        color: #00ffff;
      }

      .game-container {
        width: 100vw;
        height: 100vh;
        position: fixed;
        top: 0;
        left: 0;
      }

      .back-button {
        position: fixed;
        top: 20px;
        left: 20px;
        z-index: 1000;
        padding: 12px 24px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid #00ffff;
        border-radius: 8px;
        color: #00ffff;
        font-size: 1em;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
      }

      .back-button:hover {
        background: #00ffff;
        color: #000;
        transform: translateX(-5px);
      }

      .hidden {
        display: none !important;
      }
    `;

    document.head.appendChild(style);
  }
}
