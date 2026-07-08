import { Room } from 'colyseus';
import { schema, MapSchema } from '@colyseus/schema';

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
  }

  onJoin(client) {
    this.state.players.set(client.sessionId, new PlayerState({
      sessionId: client.sessionId,
      score: 0,
      combo: 0,
      maxCombo: 0,
      connected: true
    }));

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

    // v1: no reconnection window — a drop ends the match for both players.
    // Room.allowReconnection() is a future upgrade, not built here.
    if (this.state.status === 'playing' || this.state.status === 'countdown') {
      this.state.status = 'ended';
    }
  }
}
