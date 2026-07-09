/**
 * Game Hub UI
 * Displays available games and handles game selection
 */

import { gameManager } from '../core/GameManager.js';

// Registry URL is a plain static file (see host/public/games-registry.json),
// not part of the JS bundle — it can be updated/replaced on the deployed
// host independently of any game's own deploy, without rebuilding or
// restarting the host.
const REGISTRY_URL = '/games-registry.json';

export class GameHub {
  constructor(container) {
    this.container = container;
    this.hubElement = null;
    this.gameContainerElement = null;
    this.isGameActive = false;
    this.games = [];
  }

  /**
   * Fetch the game registry. `cache: 'no-store'` avoids the browser HTTP
   * cache masking a just-updated registry within the same session.
   */
  async loadRegistry() {
    try {
      const response = await fetch(REGISTRY_URL, { cache: 'no-store' });
      this.games = await response.json();
    } catch (error) {
      console.error('[GameHub] Failed to load games registry:', error);
      this.games = [];
    }
  }

  /**
   * Initialize and render the hub
   */
  async init() {
    await this.loadRegistry();
    this.render();
    this.attachEventListeners();
    console.log('[GameHub] Initialized');

    // Resume straight into a game after a reload forced by a tracking-type
    // switch (see GameManager.loadGameWithManifest)
    const pendingGameId = sessionStorage.getItem('motion-platform:pending-game');
    if (pendingGameId) {
      const wantsMultiplayer = sessionStorage.getItem('motion-platform:pending-game-multiplayer') === 'true';
      sessionStorage.removeItem('motion-platform:pending-game');
      sessionStorage.removeItem('motion-platform:pending-game-multiplayer');
      this.loadGame(pendingGameId, wantsMultiplayer);
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
          ${this.games.length
            ? this.games.map(game => this.renderGameCard(game)).join('')
            : '<p class="games-empty">No games available right now — check back soon.</p>'}
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
  }

  /**
   * Render individual game card
   */
  renderGameCard(game) {
    const isAvailable = game.status === 'available';
    const supportsMultiplayer = !!game.manifest?.multiplayer?.supported;
    return `
      <div class="game-card ${isAvailable ? '' : 'game-card--disabled'}" data-game-id="${game.id}">
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
          ${isAvailable
            ? `<button class="play-button" data-game-id="${game.id}" data-mode="solo">▶ Play</button>
               ${supportsMultiplayer
                 ? `<button class="play-button play-button--online" data-game-id="${game.id}" data-mode="multiplayer">🌐 1v1 Online</button>`
                 : ''}`
            : `<button class="play-button play-button--disabled" disabled>🔒 Coming Soon</button>`}
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Play button clicks (disabled "Coming Soon" buttons have no gameId to load)
    document.querySelectorAll('.play-button:not(.play-button--disabled)').forEach(button => {
      button.addEventListener('click', (e) => {
        const { gameId, mode } = e.target.dataset;
        this.loadGame(gameId, mode === 'multiplayer');
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
  async loadGame(gameId, wantsMultiplayer = false) {
    const game = this.games.find(g => g.id === gameId);
    if (!game || game.status !== 'available') {
      console.error(`[GameHub] Game "${gameId}" not found or not available`);
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
      await gameManager.loadGameWithManifest(gameId, game.manifest, { multiplayer: wantsMultiplayer });

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

}
