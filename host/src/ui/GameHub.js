/**
 * Game Hub UI — a two-tab dashboard (Games / Rooms). See
 * host/docs/dashboard-design.md for the wireframe this implements.
 */

import { gameManager } from '../core/GameManager.js';
import { multiplayerService } from '../core/MultiplayerService.js';
import { openRoomListModal } from './RoomListModal.js';
import { openPlayModeModal } from './PlayModeModal.js';

// Refresh cadence for the hub-wide online-players indicator and the Rooms
// tab's table — frequent enough to feel live, cheap enough (a single small
// JSON fetch) not to matter if it silently fails (see refreshOnlineSummary()
// and refreshRoomsTab()).
const ONLINE_SUMMARY_POLL_MS = 20000;
const ROOMS_TAB_POLL_MS = 8000;

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

    this.activeTab = 'games'; // 'games' | 'rooms'
    this.searchQuery = '';
    this.selectedGameId = null; // Games tab's master/detail selection

    this.roomsData = []; // cached cross-game listing for the Rooms tab
    this._roomsPollIntervalId = null;
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

    this.selectedGameId = this.games.find(g => g.status === 'available')?.id || null;
  }

  /**
   * Initialize and render the hub
   */
  async init() {
    await this.loadRegistry();
    this.render();
    console.log('[GameHub] Initialized');

    // Eagerly connect to the multiplayer server as soon as the hub loads —
    // independent of picking any specific game — so the online-players
    // indicator below (and the Room List modal, once opened) doesn't pay a
    // cold-connect delay. connect() itself is cheap/local (just constructs
    // the Colyseus Client; no socket opens until an actual room join), and
    // failures here are silent by design — the whole platform must keep
    // working fine with no multiplayer server reachable at all.
    multiplayerService.connect().catch(() => {});
    this.refreshOnlineSummary();
    setInterval(() => this.refreshOnlineSummary(), ONLINE_SUMMARY_POLL_MS);

    this.refreshRoomsTab();
    this._roomsPollIntervalId = setInterval(() => this.refreshRoomsTab(), ROOMS_TAB_POLL_MS);

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
   * Platform-wide "X players online, Y rooms open" indicator — silent on
   * failure (matches "okay if users don't have connection").
   */
  async refreshOnlineSummary() {
    const el = document.getElementById('hub-online-summary');
    if (!el) return;
    try {
      const { totalPlayers, totalRooms } = await multiplayerService.getOnlineSummary();
      el.textContent = `${totalPlayers} Online`;
    } catch {
      el.textContent = '';
    }
  }

  /**
   * Refreshes the Rooms tab's cached data and re-renders the body only if
   * that tab is actually the one showing — polls in the background
   * regardless of active tab so the data's already fresh the moment the
   * player switches to it. Silent on failure (see refreshOnlineSummary()).
   */
  async refreshRoomsTab() {
    try {
      this.roomsData = await multiplayerService.listAllRooms();
    } catch {
      this.roomsData = [];
    }
    if (this.activeTab === 'rooms') {
      this.renderBody();
    }
  }

  /**
   * Render the game hub UI shell — the top bar (search/tabs/brand) is only
   * ever built once here; only renderBody() re-runs after that (on tab
   * switch, search input, game selection, or Rooms data refresh), so the
   * search `<input>` itself is never destroyed/recreated and never loses
   * focus/cursor position while the player is typing into it.
   */
  render() {
    this.container.innerHTML = `
      <div id="game-hub" class="game-hub">
        <div class="dashboard-topbar">
          <div class="dashboard-topbar__left">
            <div class="dashboard-brand">Gestora</div>
            <span id="hub-online-summary" class="hub-online-summary"></span>
          </div>
          <div class="dashboard-topbar__right">
            <div class="dashboard-tabs">
              <button class="dashboard-tab ${this.activeTab === 'games' ? 'active' : ''}" data-tab="games">Games</button>
              <button class="dashboard-tab ${this.activeTab === 'rooms' ? 'active' : ''}" data-tab="rooms">Rooms</button>
            </div>
            <input
              id="dashboard-search"
              class="dashboard-search"
              type="text"
              placeholder="Search ${this.activeTab === 'rooms' ? 'rooms' : 'games'}"
              value="${this.searchQuery}"
            >
          </div>
        </div>

        <div id="dashboard-body" class="dashboard-body"></div>

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

    document.getElementById('dashboard-search').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderBody();
    });

    document.querySelectorAll('.dashboard-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        document.querySelectorAll('.dashboard-tab').forEach((b) => {
          b.classList.toggle('active', b.dataset.tab === this.activeTab);
        });
        // The search <input> itself is never recreated (see render()'s doc
        // comment — that's what keeps typing from losing focus), so its
        // placeholder has to be updated imperatively here; it isn't part of
        // whatever renderBody() re-renders.
        document.getElementById('dashboard-search').placeholder = this.activeTab === 'rooms' ? 'Search rooms' : 'Search games';
        this.renderBody();
      });
    });

    document.getElementById('back-to-hub').addEventListener('click', () => {
      this.returnToHub();
    });

    this.renderBody();
  }

  /**
   * Re-renders just the active tab's content (list/detail or table) and
   * re-attaches its listeners — called far more often than render() itself.
   */
  renderBody() {
    const bodyEl = document.getElementById('dashboard-body');
    if (!bodyEl) return;

    bodyEl.innerHTML = this.activeTab === 'games' ? this.renderGamesTab() : this.renderRoomsTab();

    if (this.activeTab === 'games') {
      this.attachGamesTabListeners();
    } else {
      this.attachRoomsTabListeners();
    }
  }

  // ---------- Games tab (master/detail library browser) ----------

  filteredGames() {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.games;
    return this.games.filter((g) =>
      g.name.toLowerCase().includes(query) || g.description.toLowerCase().includes(query)
    );
  }

  renderGamesTab() {
    if (!this.games.length) {
      return '<p class="games-empty">No games available right now — check back soon.</p>';
    }

    const games = this.filteredGames();
    if (!games.length) {
      return '<p class="games-empty">No games match your search.</p>';
    }

    const selected = games.find((g) => g.id === this.selectedGameId) || games[0];

    return `
      <div class="games-tab">
        <div class="games-list">
          ${games.map((game) => `
            <div
              class="games-list__row ${game.id === selected.id ? 'games-list__row--active' : ''} ${game.status !== 'available' ? 'games-list__row--disabled' : ''}"
              data-game-id="${game.id}"
            >
              <h4>${game.name}</h4>
              <p>${game.description}</p>
            </div>
          `).join('')}
        </div>

        <div class="games-detail">
          ${this.renderGameDetail(selected)}
        </div>
      </div>
    `;
  }

  renderGameDetail(game) {
    if (!game) return '<p class="games-empty">Select a game from the list.</p>';

    const isAvailable = game.status === 'available';
    const supportsMultiplayer = !!game.manifest?.multiplayer?.supported;

    return `
      <div class="games-detail__scroll">
        <div class="games-detail__preview">
          <img
            class="games-detail__preview-img"
            src="${game.thumbnail}"
            alt="${game.name} preview"
          >
          <div class="games-detail__preview-placeholder">🎮<span>Preview coming soon</span></div>
        </div>

        <div class="games-detail__info">
          <h3>${game.name}</h3>
          <p class="games-detail__description">${game.description}</p>
          <div class="games-detail__meta">
            <span class="game-players">👥 ${game.players}</span>
            ${game.genre ? `<span class="games-detail__genre">${game.genre}</span>` : ''}
            <div class="game-tags">
              ${game.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}
            </div>
          </div>

          ${this.renderDetailSection('How to Play', game.howToPlay)}
          ${this.renderDetailSection('Rules', game.rules)}
        </div>
      </div>

      <div class="games-detail__actions">
        ${isAvailable
          ? `<button
               class="play-button play-button--floating"
               data-game-id="${game.id}"
               data-game-name="${game.name}"
               data-supports-multiplayer="${supportsMultiplayer}"
             >▶ Play</button>`
          : `<button class="play-button play-button--floating play-button--disabled" disabled>🔒 Coming Soon</button>`}
      </div>
    `;
  }

  /**
   * Renders a titled bullet-list section (How to Play / Rules) — skipped
   * entirely if the registry entry doesn't define that field, so older/
   * incomplete registry entries degrade gracefully instead of showing an
   * empty heading.
   */
  renderDetailSection(title, items) {
    if (!items || !items.length) return '';
    return `
      <div class="games-detail__section">
        <h4>${title}</h4>
        <ul>
          ${items.map((item) => `<li>${item}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  attachGamesTabListeners() {
    document.querySelectorAll('.games-list__row:not(.games-list__row--disabled)').forEach((row) => {
      row.addEventListener('click', () => {
        this.selectedGameId = row.dataset.gameId;
        this.renderBody();
      });
    });

    // A broken/missing thumbnail (every manifest.thumbnail path today —
    // see host/docs/dashboard-design.md) falls back to the placeholder;
    // once real preview images exist, this just stops firing.
    const previewImg = document.querySelector('.games-detail__preview-img');
    if (previewImg) {
      previewImg.addEventListener('error', () => {
        previewImg.classList.add('hidden');
        document.querySelector('.games-detail__preview-placeholder')?.classList.add('visible');
      });
    }

    document.querySelectorAll('.play-button:not(.play-button--disabled)').forEach((button) => {
      button.addEventListener('click', (e) => this.handlePlayClick(e.currentTarget));
    });
  }

  /**
   * The single "▶ Play" button's click handler. Non-multiplayer games just
   * launch solo directly — nothing to choose. Multiplayer-capable games open
   * a small Play Mode picker (see PlayModeModal.js) offering solo, Quick
   * Match, or the existing Room List flow, instead of showing three
   * separate buttons in the detail panel at once.
   */
  async handlePlayClick(button) {
    const { gameId, gameName, supportsMultiplayer } = button.dataset;

    if (supportsMultiplayer !== 'true') {
      this.loadGame(gameId, false);
      return;
    }

    const choice = await openPlayModeModal(gameName);
    if (choice === 'offline') {
      this.loadGame(gameId, false);
    } else if (choice === 'quick') {
      this.startQuickMatch(gameId);
    } else if (choice === 'online') {
      this.openMultiplayerFlow(gameId, gameName);
    }
    // null (cancelled) — do nothing
  }

  // ---------- Rooms tab (cross-game open-rooms table) ----------

  filteredRooms() {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.roomsData;
    return this.roomsData.filter((r) =>
      this.gameName(r.gameId).toLowerCase().includes(query) || r.roomId.toLowerCase().includes(query)
    );
  }

  gameName(gameId) {
    return this.games.find((g) => g.id === gameId)?.name || gameId;
  }

  renderRoomsTab() {
    const rooms = this.filteredRooms();

    return `
      <div class="rooms-tab">
        <div class="rooms-tab__table-wrap">
          <table class="rooms-table">
            <thead>
              <tr><th>Game</th><th>Room ID</th><th>Players</th><th></th></tr>
            </thead>
            <tbody>
              ${rooms.length ? rooms.map((room) => `
                <tr>
                  <td>${this.gameName(room.gameId)}</td>
                  <td>${room.roomId}${room.hasPassword ? ' 🔒' : ''}</td>
                  <td>${room.clients}/${room.maxClients}</td>
                  <td>
                    ${room.locked
                      ? '<span class="rooms-badge rooms-badge--full">FULL</span>'
                      : `<button class="rooms-join-btn" data-room-id="${room.roomId}" data-game-id="${room.gameId}" data-has-password="${room.hasPassword}">JOIN</button>`}
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="4" class="rooms-empty">No open rooms right now.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  attachRoomsTabListeners() {
    document.querySelectorAll('.rooms-join-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.joinRoomFromTable(
        btn.dataset.gameId,
        btn.dataset.roomId,
        btn.dataset.hasPassword === 'true'
      ));
    });
  }

  /**
   * Joins a specific room straight from the Rooms tab's table — same
   * join-then-load flow the per-game Room List modal and Quick Match
   * already use (see each game's index.js, which adopts an already-joined
   * room the same way regardless of which of these three paths produced it).
   */
  async joinRoomFromTable(gameId, roomId, hasPassword) {
    let password;
    if (hasPassword) {
      password = window.prompt('This room requires a password:') || undefined;
      if (password === undefined) return; // cancelled
    }

    try {
      await multiplayerService.joinRoomById(roomId, { password });
      this.loadGame(gameId, true);
    } catch (error) {
      console.error('[GameHub] Failed to join room from table:', error);
      alert(`Failed to join room: ${error.message}`);
    }
  }

  /**
   * "Play Online" entry point — opens the Room List (browse/create/join by
   * code for this specific game) before loading anything, for players who
   * want deliberate control (a password-protected room, inviting a friend
   * by code). See startQuickMatch() below for the instant, no-decisions
   * alternative. Either the player already joined a specific room by the
   * time this resolves ('joined' — the game just adopts
   * multiplayerService.room directly once loaded), or they chose to create
   * one ('create' — the actual room creation is deferred to the game
   * itself, since e.g. hand-sword has its own pre-match settings to fold in
   * first; see GameManager.loadGameWithManifest's doc comment).
   */
  async openMultiplayerFlow(gameId, gameName) {
    const result = await openRoomListModal(gameId, gameName);
    if (!result) return; // cancelled

    if (result.mode === 'joined') {
      this.loadGame(gameId, true);
    } else {
      this.loadGame(gameId, true, { pendingRoomOptions: result.roomOptions });
    }
  }

  /**
   * "⚡ Quick Match" entry point — no room list, no settings, just pair with
   * whoever's around (or wait for someone) as fast as possible. By the time
   * loadGame() runs, multiplayerService.quickMatch() has already either
   * joined an existing open room or created a fresh one — the game itself
   * needs no awareness this is any different from the Room List's "joined"
   * path (see each game's index.js: it just checks whether
   * services.multiplayer.room is already set).
   */
  async startQuickMatch(gameId) {
    try {
      await multiplayerService.quickMatch(gameId);
      this.loadGame(gameId, true);
    } catch (error) {
      console.error('[GameHub] Quick match failed:', error);
      alert(`Failed to start quick match: ${error.message}`);
    }
  }

  /**
   * Load and start a game
   */
  async loadGame(gameId, wantsMultiplayer = false, extraOptions = {}) {
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
      await gameManager.loadGameWithManifest(gameId, game.manifest, { multiplayer: wantsMultiplayer, ...extraOptions });

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
