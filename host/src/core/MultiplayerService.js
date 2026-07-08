/**
 * Multiplayer Service - Singleton
 * Thin wrapper around @colyseus/sdk's Client/Room, keeping the same
 * public surface the rest of the platform (e.g. hand-sword's index.js)
 * already calls, so game code doesn't need to know it's Colyseus underneath.
 */

import { Client } from '@colyseus/sdk';

const DEFAULT_SERVER_URL = 'ws://localhost:2567';

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
   * the actual handshake happens on joinRoom()/joinOrCreate().
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
   * Join (or create, if none is waiting) a room for the given game.
   * Colyseus's joinOrCreate auto-pairs the first two waiting clients —
   * no manual room codes needed.
   * @param {string} roomName - room/game identifier (matches the id
   *   registered via gameServer.define() on the server)
   * @param {object} options - passed to the room's onCreate() the first
   *   time it's created (e.g. locked match settings)
   */
  async joinRoom(roomName, options = {}) {
    if (!this.client) {
      await this.connect();
    }

    console.log(`[Multiplayer] Joining room: ${roomName}`);
    this.room = await this.client.joinOrCreate(roomName, options);
    this.playerId = this.room.sessionId;
    this._wireRoomEvents();

    return this.room;
  }

  /**
   * @deprecated joinOrCreate() unifies create+join — kept only so any
   * existing caller of createRoom(gameId) doesn't hard-break.
   */
  createRoom(gameId, options = {}) {
    console.warn('[Multiplayer] createRoom() is deprecated; use joinRoom() — Colyseus auto-creates via joinOrCreate');
    return this.joinRoom(gameId, options);
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
    const onStateChange = (state) => this.emit('stateChange', state);
    const onLeave = (code) => {
      this.emit('disconnected', { code });
      this.room = null;
    };
    const onError = (code, message) => this.emit('error', { code, message });

    const unsubOpponentHand = room.onMessage('opponent_hand', onOpponentHand);
    room.onStateChange(onStateChange);
    room.onLeave(onLeave);
    room.onError(onError);

    this._roomUnsubscribers.push(
      unsubOpponentHand,
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
   * Event emitter pattern
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
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
