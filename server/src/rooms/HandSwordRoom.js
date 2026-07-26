import { Room } from 'colyseus';
import { schema, MapSchema } from '@colyseus/schema';
import { roomsActive, clientsConnected, clientRTT } from '../metrics.js';
import { setupLobbyMetadata, checkRoomPassword } from './roomAuth.js';
import { markReady, markUnready, cancelPendingCountdown } from './roomReady.js';

const ROOM_LABEL = 'hand-sword';

const PlayerState = schema({
  sessionId: 'string',
  score: 'number',
  combo: 'number',
  maxCombo: 'number',
  hits: 'number',
  misses: 'number',
  side: 'string', // 'left' | 'right' | '' — only meaningful when MatchState.mode === 'coop'
  connected: 'boolean',
  ready: 'boolean' // see roomReady.js — set once this client's game has actually finished loading
});

const MatchState = schema({
  status: 'string', // "waiting" | "countdown" | "playing" | "ended"
  mode: 'string', // 'versus' | 'coop'
  bpm: 'number',
  theme: 'string', // difficulty is a fixed property of the theme, not a separate synced field — see games/hand-sword/src/audio.js
  startAt: 'number', // epoch ms; 0 until countdown begins
  // Shared seed for coop's client-side box-side PRNG (see game-logic.js) —
  // box spawn *timing* is already fully deterministic from bpm/difficulty/
  // theme/beat count, so this one seed is all that's needed for both
  // clients to independently spawn an identical sequence of boxes without
  // the server owning box state itself (HandSwordRoom stays a Relay Room).
  coopSeed: 'number',
  players: { map: PlayerState }
});

const COUNTDOWN_MS = 3000;

export class HandSwordRoom extends Room {
  maxClients = 2;

  onCreate(options = {}) {
    setupLobbyMetadata(this, options);

    // First player's currently-selected local settings become the match's
    // locked settings — no settings-negotiation UI is in scope here.
    const mode = options.mode === 'coop' ? 'coop' : 'versus';
    this.state = new MatchState({
      status: 'waiting',
      mode,
      bpm: options.bpm ?? 120,
      theme: options.theme ?? 'synthwave',
      startAt: 0,
      coopSeed: mode === 'coop' ? Math.floor(Math.random() * 2 ** 31) : 0,
      players: new MapSchema()
    });

    this.onMessage('game_state', (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.score = payload.score ?? player.score;
      player.combo = payload.combo ?? player.combo;
      player.maxCombo = payload.maxCombo ?? player.maxCombo;
      player.hits = payload.hits ?? player.hits;
      player.misses = payload.misses ?? player.misses;
    });

    this.onMessage('hand_data', (client, data) => {
      this.broadcast('opponent_hand', { sessionId: client.sessionId, data }, { except: client });
    });

    // Coop only: relay "I destroyed box N" so the other client destroys the
    // same box on their own screen instead of watching it fly through
    // untouched (see game-logic.js's destroyRemoteBox/findBoxByCoopIndex).
    // Plain relay, no validation — same trust level as hand_data/game_state.
    this.onMessage('box_hit', (client, data) => {
      this.broadcast('opponent_box_hit', { sessionId: client.sessionId, coopIndex: data.coopIndex }, { except: client });
    });

    // Fed by the client's own room.ping() (Colyseus's built-in RTT
    // measurement) — see MultiplayerService.js. Reported back over a
    // message since the server has no direct way to read the client's
    // own ping result.
    this.onMessage('__rtt_report', (client, { latencyMs }) => {
      if (typeof latencyMs === 'number') clientRTT.observe({ room: ROOM_LABEL }, latencyMs / 1000);
    });

    // See roomReady.js's doc comment — the countdown no longer starts just
    // because both sockets connected (onJoin below); it waits for both
    // clients' games to actually finish loading and report in here. This is
    // exactly what was causing co-op's "boxes only spawn on one client" /
    // "can't see partner's sword": if the countdown elapsed before the
    // slower client had even subscribed to room state, that client's
    // handleMatchStateChange() never saw the 'countdown' status edge, so
    // setCoopSeed/setCoopSide/beginPlayback never ran for it at all.
    this.onMessage('ready', (client) => {
      markReady(this, client, COUNTDOWN_MS);
    });

    // Lets a player un-click Ready before the match locks in — see
    // roomReady.js's doc comment on why this needs a debounce rather than
    // just gating the initial 'ready' message.
    this.onMessage('unready', (client) => {
      markUnready(this, client);
    });

    roomsActive.inc({ room: ROOM_LABEL });
  }

  onAuth(client, options) {
    return checkRoomPassword(this, options);
  }

  onJoin(client) {
    // Join order decides side in coop, same pattern as TennisRoom's role
    // assignment — first joiner takes the left side.
    const side = this.state.mode === 'coop'
      ? (this.state.players.size === 0 ? 'left' : 'right')
      : '';

    this.state.players.set(client.sessionId, new PlayerState({
      sessionId: client.sessionId,
      score: 0,
      combo: 0,
      maxCombo: 0,
      hits: 0,
      misses: 0,
      side,
      connected: true,
      ready: false
    }));
    clientsConnected.inc({ room: ROOM_LABEL });

    // maxClients itself already refuses a 3rd join attempt regardless of
    // lock() — this call's real job is removing the room from the public
    // listing (see server/src/index.js's /rooms query) the moment it's
    // full, independent of whether either client has reported ready yet.
    if (this.state.players.size === this.maxClients) {
      this.lock();
    }
  }

  onLeave(client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    clientsConnected.dec({ room: ROOM_LABEL });

    // v1: no reconnection window — a drop ends the match for both players.
    // Room.allowReconnection() is a future upgrade, not built here.
    // Includes 'waiting' now too: with the ready-gate (see roomReady.js),
    // both seats can be filled but still sitting in 'waiting' for a while
    // if one client is slow to load — a disconnect during that window
    // should still end the match instead of leaving the other player
    // stuck with no timeout.
    const bothHadJoined = this.state.players.size === this.maxClients;
    if (bothHadJoined && (this.state.status === 'playing' || this.state.status === 'countdown' || this.state.status === 'waiting')) {
      this.state.status = 'ended';
    }
    cancelPendingCountdown(this);
  }

  onDispose() {
    roomsActive.dec({ room: ROOM_LABEL });
  }
}
