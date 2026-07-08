import { Room } from 'colyseus';
import { schema, MapSchema } from '@colyseus/schema';
import { roomsActive, clientsConnected, clientRTT } from '../metrics.js';

const ROOM_LABEL = 'hand-sword';

const PlayerState = schema({
  sessionId: 'string',
  score: 'number',
  combo: 'number',
  maxCombo: 'number',
  connected: 'boolean'
});

const MatchState = schema({
  status: 'string', // "waiting" | "countdown" | "playing" | "ended"
  bpm: 'number',
  difficulty: 'string',
  theme: 'string',
  startAt: 'number', // epoch ms; 0 until countdown begins
  players: { map: PlayerState }
});

const COUNTDOWN_MS = 3000;

export class HandSwordRoom extends Room {
  maxClients = 2;

  onCreate(options = {}) {
    // First player's currently-selected local settings become the match's
    // locked settings — no settings-negotiation UI is in scope here.
    this.state = new MatchState({
      status: 'waiting',
      bpm: options.bpm ?? 120,
      difficulty: options.difficulty ?? 'medium',
      theme: options.theme ?? 'synthwave',
      startAt: 0,
      players: new MapSchema()
    });

    this.onMessage('game_state', (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.score = payload.score ?? player.score;
      player.combo = payload.combo ?? player.combo;
      player.maxCombo = payload.maxCombo ?? player.maxCombo;
    });

    this.onMessage('hand_data', (client, data) => {
      this.broadcast('opponent_hand', { sessionId: client.sessionId, data }, { except: client });
    });

    // Fed by the client's own room.ping() (Colyseus's built-in RTT
    // measurement) — see MultiplayerService.js. Reported back over a
    // message since the server has no direct way to read the client's
    // own ping result.
    this.onMessage('__rtt_report', (client, { latencyMs }) => {
      if (typeof latencyMs === 'number') clientRTT.observe({ room: ROOM_LABEL }, latencyMs / 1000);
    });

    roomsActive.inc({ room: ROOM_LABEL });
  }

  onJoin(client) {
    this.state.players.set(client.sessionId, new PlayerState({
      sessionId: client.sessionId,
      score: 0,
      combo: 0,
      maxCombo: 0,
      connected: true
    }));
    clientsConnected.inc({ room: ROOM_LABEL });

    if (this.state.players.size === this.maxClients) {
      this.lock();
      this.state.status = 'countdown';
      this.state.startAt = Date.now() + COUNTDOWN_MS;
      this.clock.setTimeout(() => { this.state.status = 'playing'; }, COUNTDOWN_MS);
    }
  }

  onLeave(client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    clientsConnected.dec({ room: ROOM_LABEL });

    // v1: no reconnection window — a drop ends the match for both players.
    // Room.allowReconnection() is a future upgrade, not built here.
    if (this.state.status === 'playing' || this.state.status === 'countdown') {
      this.state.status = 'ended';
    }
  }

  onDispose() {
    roomsActive.dec({ room: ROOM_LABEL });
  }
}
