/**
 * Multiplayer Service - Singleton
 * Thin wrapper around @colyseus/sdk's Client/Room, keeping the same
 * public surface the rest of the platform (e.g. hand-sword's index.js)
 * already calls, so game code doesn't need to know it's Colyseus underneath.
 */

import { Client } from '@colyseus/sdk';

// A hardcoded 'ws://localhost:2567' only works when the browser and the
// server are the same machine — breaks for any remote client (phone over a
// Cloudflare tunnel, another device on the LAN, etc), since "localhost"
// there means the client's own device. Default to the page's own hostname
// instead (covers LAN-IP access transparently); VITE_MULTIPLAYER_SERVER_URL
// overrides it for setups where the game server is on a different public
// hostname than the static site (e.g. a tunnel that maps one hostname per
// origin port).
const DEFAULT_SERVER_URL = import.meta.env.VITE_MULTIPLAYER_SERVER_URL
  || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:2567`;

// The room-list/online-summary endpoints (server/src/index.js) are plain
// HTTP, served on the same port as the WebSocket transport — derived from
// the same URL rather than configured separately, so there's only one
// place (VITE_MULTIPLAYER_SERVER_URL) to override for a non-default host.
const DEFAULT_HTTP_URL = DEFAULT_SERVER_URL.replace(/^ws/, 'http');

class MultiplayerService {
  constructor() {
    this.client = null;
    this.room = null;
    this.playerId = null;
    this.isConnected = false;

    // Performance: throttle hand data broadcast
    this.lastBroadcast = 0;
    this.BROADCAST_INTERVAL = 50; // 20fps for multiplayer (lower than local 60fps)

    // Event handlers
    this.eventHandlers = new Map();

    // Most recently emitted 'stateChange' payload, replayed immediately to
    // any handler that subscribes via on('stateChange', ...) after the fact
    // (see on() below) — necessary since the Room List flow (see
    // host/src/ui/RoomListModal.js) now often creates/joins a room BEFORE
    // the game that will use it has even loaded, so Colyseus's own "fires
    // immediately with current state" behavior on room.onStateChange() can
    // fire before this game has subscribed to anything at all.
    this._lastState = null;

    this._roomUnsubscribers = [];

    // Most recent round-trip time, in ms, from Colyseus's own room.ping() —
    // polled periodically once joined (see _wireRoomEvents()) and also
    // reported to the server for its /metrics endpoint (see
    // server/src/metrics.js and docs/network-simulation-metrics.md).
    this.lastRTT = null;
    this._rttIntervalId = null;
    this.RTT_POLL_INTERVAL = 5000;
  }

  /**
   * Create the Colyseus client. This does not open a socket by itself —
   * the actual handshake happens on createRoom()/joinRoomById()/quickMatch().
   */
  async connect(serverUrl = DEFAULT_SERVER_URL) {
    if (this.client) {
      console.log('[Multiplayer] Already connected');
      return;
    }

    console.log(`[Multiplayer] Connecting to ${serverUrl}...`);
    this.client = new Client(serverUrl);
    this.isConnected = true;
  }

  /**
   * Explicitly create a brand-new room for the given game — used by the
   * Room List flow's "Create Room" action (see host/src/ui/RoomListModal.js)
   * and, for games with their own pre-match settings UI (e.g. hand-sword's
   * mode/song picker), by the game itself once those settings are chosen.
   * Unlike the old joinOrCreate-based flow this replaced, this never
   * silently pairs into someone else's room.
   * @param {string} gameId - room/game identifier (matches the id
   *   registered via gameServer.define() on the server)
   * @param {object} options - passed to the room's onCreate() (locked match
   *   settings, optional password/name — see server/src/rooms/roomAuth.js)
   */
  async createRoom(gameId, options = {}) {
    if (!this.client) {
      await this.connect();
    }

    console.log(`[Multiplayer] Creating room: ${gameId}`);
    this.room = await this.client.create(gameId, options);
    this.playerId = this.room.sessionId;
    this._wireRoomEvents();

    return this.room;
  }

  /**
   * Join a specific existing room by its id — used by the Room List's
   * "Join" button on a listed room, or its "Join by Code" field (the code
   * IS the room's own Colyseus id, per the room-list design). Rejects if
   * the room requires a password and options.password doesn't match (see
   * each room's onAuth()).
   */
  async joinRoomById(roomId, options = {}) {
    if (!this.client) {
      await this.connect();
    }

    console.log(`[Multiplayer] Joining room by id: ${roomId}`);
    this.room = await this.client.joinById(roomId, options);
    this.playerId = this.room.sessionId;
    this._wireRoomEvents();

    return this.room;
  }

  /**
   * Open rooms for a given game, for the Room List's browsable list —
   * passworded rooms are included (marked via hasPassword), only
   * full/locked rooms are excluded server-side. Plain HTTP, not a Colyseus
   * room join, so it never affects this.room/this.playerId.
   */
  async listRooms(gameId) {
    const res = await fetch(`${DEFAULT_HTTP_URL}/rooms/${gameId}`);
    if (!res.ok) throw new Error(`Failed to list rooms for ${gameId}`);
    return res.json();
  }

  /**
   * Platform-wide open-room/player summary, independent of any specific
   * game — fetched eagerly by the hub as soon as it loads (see
   * host/src/ui/GameHub.js) so a live count is already available before the
   * player has picked a game.
   */
  async getOnlineSummary() {
    const res = await fetch(`${DEFAULT_HTTP_URL}/online-summary`);
    if (!res.ok) throw new Error('Failed to fetch online summary');
    return res.json();
  }

  /**
   * Every open room across every game (each entry tagged with `gameId`),
   * for the dashboard's Rooms tab — deliberately includes full/locked rooms
   * too (see server/src/index.js's /rooms handler), unlike listRooms()
   * above which only lists what's actually still joinable for one game.
   */
  async listAllRooms() {
    const res = await fetch(`${DEFAULT_HTTP_URL}/rooms`);
    if (!res.ok) throw new Error('Failed to list rooms');
    return res.json();
  }

  /**
   * "Quick Match" — the fast, no-decisions entry point (see GameHub.js's
   * ⚡ Quick Match button), distinct from the Room List's deliberate
   * browse/create/join-by-code flow. Joins the first open, unpassworded
   * room for this game if one exists, else creates a fresh one with no
   * options — every room type already has sensible onCreate() defaults
   * (e.g. hand-sword's mode/bpm/theme default to versus/120/synthwave), so
   * this never needs any game-specific settings gathered first.
   *
   * Deliberately reimplemented on top of listRooms()/joinRoomById()/
   * createRoom() rather than Colyseus's own joinOrCreate() — that would
   * happily match into a passworded room (it doesn't know about our custom
   * password concept) and then fail at onAuth() with no fallback.
   */
  async quickMatch(gameId) {
    if (!this.client) {
      await this.connect();
    }

    try {
      const openRooms = await this.listRooms(gameId);
      for (const room of openRooms.filter((r) => !r.hasPassword)) {
        try {
          return await this.joinRoomById(room.roomId);
        } catch (error) {
          // Room likely filled between listing and joining — try the next
          // one instead of giving up entirely.
          console.warn(`[Multiplayer] Quick match: room ${room.roomId} no longer joinable, trying next:`, error);
        }
      }
    } catch (error) {
      console.warn('[Multiplayer] Quick match: failed to list rooms, falling back to create:', error);
    }

    return this.createRoom(gameId, {});
  }

  /**
   * Leave the current room
   */
  leaveRoom() {
    if (!this.room) return;

    this._roomUnsubscribers.forEach((unsub) => unsub && unsub());
    this._roomUnsubscribers = [];
    this._stopRttPolling();

    console.log('[Multiplayer] Leaving room');
    this.room.leave();
    this.room = null;
    this._lastState = null;
  }

  /**
   * Tell the server this player has actually clicked Ready — the pre-match
   * countdown only starts once every seat has sent this (see
   * server/src/rooms/roomReady.js), and only after a short debounce so a
   * fast ready/unready toggle doesn't instantly (and irreversibly) lock the
   * match in. Each game calls this from its own Ready button, once the room
   * exists (see e.g. games/pong/src/index.js) — not automatically on load,
   * so it reflects a real decision rather than "my assets finished loading."
   */
  sendReady() {
    if (!this.room) return;
    this.room.send('ready');
  }

  /**
   * Undo sendReady() — lets a player back out before the match locks in.
   * Safe to call even if the match has already started server-side; the
   * server's debounce re-validates ready state right before committing to
   * the countdown, so a stale unready arriving late just has no effect.
   */
  sendUnready() {
    if (!this.room) return;
    this.room.send('unready');
  }

  /**
   * Broadcast hand tracking data to other players
   * Throttled for performance
   */
  broadcastHandData(handData) {
    const now = Date.now();
    if (now - this.lastBroadcast < this.BROADCAST_INTERVAL) {
      return; // Throttle
    }

    if (!this.room) return;

    const compressed = this.compressHandData(handData);
    if (!compressed) return;

    this.room.send('hand_data', compressed);
    this.lastBroadcast = now;
  }

  /**
   * Compress hand data for network transmission
   * Only send essential landmarks
   */
  compressHandData(handData) {
    if (!handData || !handData.multiHandLandmarks) {
      return null;
    }

    return handData.multiHandLandmarks.map((landmarks) => ({
      // Only send key landmarks: wrist, middle, index, pinky
      w: [landmarks[0].x, landmarks[0].y, landmarks[0].z], // wrist
      m: [landmarks[9].x, landmarks[9].y, landmarks[9].z], // middle
      i: [landmarks[5].x, landmarks[5].y, landmarks[5].z], // index
      p: [landmarks[17].x, landmarks[17].y, landmarks[17].z] // pinky
    }));
  }

  /**
   * Decompress received hand data
   */
  decompressHandData(compressed) {
    // Reconstruct minimal hand data for opponent rendering
    return compressed;
  }

  /**
   * Hand-sword coop only: tell the opponent that box `coopIndex` (their own
   * shared spawn-sequence position — see games/hand-sword/src/game-logic.js's
   * createBox) was just destroyed on this client, so they destroy the same
   * box on their screen instead of watching it fly through untouched.
   */
  sendBoxHit(coopIndex) {
    if (!this.room) return;
    this.room.send('box_hit', { coopIndex });
  }

  /**
   * Send a game-state update (score/combo/etc). Written into the room's
   * synced schema state, so other clients pick it up via onStateChange
   * without any extra relay message.
   */
  sendGameState(state) {
    if (!this.room) return;
    this.room.send('game_state', state);
  }

  /**
   * Wire Colyseus room events to this service's generic event emitter,
   * capturing unsubscribe functions so leaveRoom() can tear them down —
   * this.room is a singleton reused across game load/unload cycles, so
   * stale listeners from a previous match must not linger.
   *
   * Note: room.onMessage() returns a real unsubscribe function, but
   * room.onStateChange/onLeave/onError are signal-style objects whose
   * subscribe call returns an EventEmitter handle, not an unsubscribe
   * function — they're detached via their own `.remove(callback)`.
   */
  _wireRoomEvents() {
    const room = this.room;

    const onOpponentHand = (msg) => this.emit('opponentHand', msg);
    const onOpponentBoxHit = (msg) => this.emit('opponentBoxHit', msg);
    const onStateChange = (state) => {
      this._lastState = state;
      this.emit('stateChange', state);
    };
    const onLeave = (code) => {
      this.emit('disconnected', { code });
      this.room = null;
    };
    const onError = (code, message) => this.emit('error', { code, message });

    const unsubOpponentHand = room.onMessage('opponent_hand', onOpponentHand);
    const unsubOpponentBoxHit = room.onMessage('opponent_box_hit', onOpponentBoxHit);
    room.onStateChange(onStateChange);
    room.onLeave(onLeave);
    room.onError(onError);

    this._roomUnsubscribers.push(
      unsubOpponentHand,
      unsubOpponentBoxHit,
      () => room.onStateChange.remove(onStateChange),
      () => room.onLeave.remove(onLeave),
      () => room.onError.remove(onError)
    );

    this._startRttPolling();
  }

  /**
   * Periodically measure RTT via Colyseus's built-in room.ping() and
   * report it to the server (which feeds it into a Prometheus histogram —
   * see server/src/metrics.js) as well as emitting it locally for any
   * in-game "connection quality" UI to consume.
   */
  _startRttPolling() {
    this._stopRttPolling();
    const poll = () => {
      if (!this.room) return;
      this.room.ping((ms) => {
        this.lastRTT = ms;
        this.emit('rtt', ms);
        this.room?.send('__rtt_report', { latencyMs: ms });
      });
    };
    poll();
    this._rttIntervalId = setInterval(poll, this.RTT_POLL_INTERVAL);
  }

  _stopRttPolling() {
    if (this._rttIntervalId) {
      clearInterval(this._rttIntervalId);
      this._rttIntervalId = null;
    }
    this.lastRTT = null;
  }

  /**
   * Most recent round-trip time in ms, or null if not yet measured /
   * not currently in a room.
   */
  getLatency() {
    return this.lastRTT;
  }

  /**
   * Event emitter pattern. For 'stateChange' specifically, immediately
   * replays the last known state (if any) to the new handler — see
   * this._lastState's doc comment in the constructor for why this matters
   * now that a room is often already joined before anything subscribes.
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);

    if (event === 'stateChange' && this._lastState) {
      handler(this._lastState);
    }
  }

  off(event, handler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  /**
   * Disconnect from server entirely
   */
  disconnect() {
    this.leaveRoom();
    this.client = null;
    this.isConnected = false;
    console.log('[Multiplayer] Disconnected');
  }

  /**
   * Get current player ID (Colyseus session id, set once joined a room)
   */
  getPlayerId() {
    return this.playerId;
  }

  /**
   * Get current room ID
   */
  getRoomId() {
    return this.room?.roomId ?? null;
  }

  /**
   * "Connected" means actively joined to a room — hand-sword's onHandData()
   * already gates broadcastHandData on this, so it naturally stays silent
   * in solo mode with no change needed there.
   */
  isConnectedToServer() {
    return !!this.room;
  }
}

// Export singleton instance
export const multiplayerService = new MultiplayerService();
