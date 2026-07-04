/**
 * Multiplayer Service - Singleton
 * Handles WebSocket connections and WebRTC peer-to-peer
 * Optimized for low-latency hand tracking data transmission
 */

class MultiplayerService {
  constructor() {
    this.ws = null;
    this.peers = new Map(); // peer-id -> { pc, channel }
    this.room = null;
    this.playerId = this.generatePlayerId();
    this.isConnected = false;

    // Performance: Throttle hand data broadcast
    this.lastBroadcast = 0;
    this.BROADCAST_INTERVAL = 50; // 20fps for multiplayer (lower than local 60fps)

    // Event handlers
    this.eventHandlers = new Map();
  }

  /**
   * Generate unique player ID
   */
  generatePlayerId() {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Connect to multiplayer server
   * @param {string} serverUrl - WebSocket server URL
   */
  async connect(serverUrl = 'ws://localhost:8080') {
    if (this.isConnected) {
      console.log('[Multiplayer] Already connected');
      return;
    }

    console.log(`[Multiplayer] Connecting to ${serverUrl}...`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
          console.log('[Multiplayer] Connected');
          this.isConnected = true;
          this.send({ type: 'REGISTER', playerId: this.playerId });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('[Multiplayer] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[Multiplayer] WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[Multiplayer] Disconnected');
          this.isConnected = false;
          this.emit('disconnected');
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create a new game room
   * @param {string} gameId - Game identifier
   */
  createRoom(gameId) {
    if (!this.isConnected) {
      console.warn('[Multiplayer] Not connected to server');
      return;
    }

    this.send({
      type: 'CREATE_ROOM',
      gameId,
      playerId: this.playerId
    });

    console.log(`[Multiplayer] Creating room for game: ${gameId}`);
  }

  /**
   * Join an existing room
   * @param {string} roomId - Room ID to join
   */
  joinRoom(roomId) {
    if (!this.isConnected) {
      console.warn('[Multiplayer] Not connected to server');
      return;
    }

    this.send({
      type: 'JOIN_ROOM',
      roomId,
      playerId: this.playerId
    });

    this.room = roomId;
    console.log(`[Multiplayer] Joining room: ${roomId}`);
  }

  /**
   * Leave current room
   */
  leaveRoom() {
    if (!this.room) return;

    this.send({
      type: 'LEAVE_ROOM',
      roomId: this.room,
      playerId: this.playerId
    });

    this.room = null;
    console.log('[Multiplayer] Left room');
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

    // Compress hand data for network efficiency
    const compressed = this.compressHandData(handData);

    this.send({
      type: 'HAND_DATA',
      roomId: this.room,
      data: compressed,
      timestamp: now
    });

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

    return handData.multiHandLandmarks.map(landmarks => ({
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
   * Send game state update
   */
  sendGameState(state) {
    if (!this.room) return;

    this.send({
      type: 'GAME_STATE',
      roomId: this.room,
      state,
      timestamp: Date.now()
    });
  }

  /**
   * Handle incoming messages
   */
  handleMessage(data) {
    switch (data.type) {
      case 'ROOM_CREATED':
        console.log('[Multiplayer] Room created:', data.roomId);
        this.room = data.roomId;
        this.emit('roomCreated', data);
        break;

      case 'ROOM_JOINED':
        console.log('[Multiplayer] Joined room:', data.roomId);
        this.emit('roomJoined', data);
        break;

      case 'PLAYER_JOINED':
        console.log('[Multiplayer] Player joined:', data.playerId);
        this.emit('playerJoined', data);
        break;

      case 'PLAYER_LEFT':
        console.log('[Multiplayer] Player left:', data.playerId);
        this.emit('playerLeft', data);
        break;

      case 'HAND_DATA':
        // Received opponent hand data
        this.emit('opponentHand', {
          playerId: data.playerId,
          data: this.decompressHandData(data.data),
          timestamp: data.timestamp
        });
        break;

      case 'GAME_STATE':
        this.emit('gameState', data.state);
        break;

      case 'ERROR':
        console.error('[Multiplayer] Server error:', data.message);
        this.emit('error', data);
        break;

      default:
        console.warn('[Multiplayer] Unknown message type:', data.type);
    }
  }

  /**
   * Send message to server
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[Multiplayer] Cannot send, not connected');
    }
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
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      console.log('[Multiplayer] Disconnected');
    }
  }

  /**
   * Get current player ID
   */
  getPlayerId() {
    return this.playerId;
  }

  /**
   * Get current room ID
   */
  getRoomId() {
    return this.room;
  }

  /**
   * Check if connected
   */
  isConnectedToServer() {
    return this.isConnected;
  }
}

// Export singleton instance
export const multiplayerService = new MultiplayerService();
