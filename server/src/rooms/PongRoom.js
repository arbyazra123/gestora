import { Room } from 'colyseus';
import { schema, MapSchema } from '@colyseus/schema';
import * as pongPhysics from '../physics/pongPhysics.js';
import * as rules from '../physics/pongRules.js';
import { roomsActive, clientsConnected, tickDuration, tickOverruns, clientRTT } from '../metrics.js';
import { setupLobbyMetadata, checkRoomPassword } from './roomAuth.js';
import { markReady } from './roomReady.js';

const ROOM_LABEL = 'pong';
const TICK_BUDGET_S = 1 / 60; // matches Colyseus's default setSimulationInterval rate

// 'role' below is a court-side identifier ('player' = +z side, 'bot' = -z
// side), carried over from the original single-player code's naming — in
// multiplayer neither side is an actual bot, both are human players. See
// games/pong/src/index.js multiplayer wiring for the coordinate mirror
// applied at the network boundary for the 'bot'-role client.
//
// Ability trust model — deliberately NOT the same as the ball/hit legality
// below (settled via /grilling session, 2026-07-26): activation is
// client-trusted-and-relayed, not server-validated. The server doesn't
// check whether a player's cooldown has genuinely elapsed before accepting
// an "activate_ability" message — it only looks up that ability's OWN
// duration from its own catalog (never a client-supplied number) and
// stores the resulting expiry as a trusted timestamp. This still matters
// for two of the three abilities because their EFFECTS touch state this
// room owns outright: Shield needs the server to know a miss should become
// a deflect instead of a point (see handleMiss()), and Slow-Mo — redesigned
// here as a shared/global effect, since a single authoritative ball can't
// simultaneously move at two different speeds for two players — needs the
// server's own tick to actually slow down. Paddle Boost never touches
// server-owned state at all (the wider hitbox only matters to the
// activating client's own local collision check, since hits are computed
// client-side either way), so its expiry is tracked here purely so the
// opponent's renderer can show the boosted paddle.
const PlayerState = schema({
  sessionId: 'string',
  role: 'string',
  paddleX: 'number',
  connected: 'boolean',
  paddleBoostUntil: 'number', // epoch ms, 0 = inactive
  shieldUntil: 'number', // epoch ms, 0 = inactive
  ready: 'boolean' // see roomReady.js — set once this client's game has actually finished loading
});

const BallState = schema({
  x: 'number',
  z: 'number',
  vx: 'number',
  vz: 'number',
  isActive: 'boolean',
  lastHitBy: 'string' // '' means no hit yet (schema strings can't hold null)
});

const GameState = schema({
  playerScore: 'number',
  botScore: 'number',
  currentServer: 'string',
  gameStatus: 'string', // ready | serving | playing | point-over | game-over
  lastPointWinner: 'string'
});

const MatchState = schema({
  status: 'string', // waiting | countdown | playing | ended (room lifecycle)
  startAt: 'number',
  players: { map: PlayerState },
  ball: BallState,
  game: GameState,
  slowMoUntil: 'number' // epoch ms, 0 = inactive — global effect, see class doc above
});

const COUNTDOWN_MS = 3000;
const POINT_RESET_MS = 1200; // matches games/pong/src/index.js's handlePointEnd() setTimeout
const SLOW_MO_FACTOR = 0.4; // matches games/pong/src/index.js's SLOW_MO_FACTOR

// Mirrors games/pong/src/abilities.js's ABILITY_TYPES durations — the
// server owns this copy so it never trusts a client-supplied duration, even
// though it doesn't validate cooldown legitimacy (see class doc above).
const ABILITY_DURATIONS_MS = {
  paddleBoost: 6000,
  slowMo: 5000,
  shield: 10000
};

// Ported from games/pong/src/scene.js's getFieldBounds()
const FIELD_WIDTH = 7;
const FIELD_LENGTH = 10;
const FIELD_BOUNDS = {
  minX: -FIELD_WIDTH / 2,
  maxX: FIELD_WIDTH / 2,
  minZ: -FIELD_LENGTH / 2,
  maxZ: FIELD_LENGTH / 2
};

export class PongRoom extends Room {
  maxClients = 2;

  onCreate(options = {}) {
    setupLobbyMetadata(this, options);

    this.state = new MatchState({
      status: 'waiting',
      startAt: 0,
      players: new MapSchema(),
      ball: new BallState({ x: 0, z: 0, vx: 0, vz: 0, isActive: false, lastHitBy: '' }),
      game: new GameState({
        playerScore: 0, botScore: 0,
        currentServer: 'player', gameStatus: 'ready', lastPointWinner: ''
      }),
      slowMoUntil: 0
    });

    // Internal physics/rules state (plain objects, not schema) — the actual
    // simulation runs on this each tick, then gets copied into this.state
    // (the network-replicated schema) via syncState(). See tennisPhysics.js's
    // module comment (same pattern) for why they're kept separate.
    this.ballState = pongPhysics.createBallState();
    this.matchState = rules.createMatchState();
    this.pointEndScheduled = false;

    this.onMessage('paddle', (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || typeof payload?.x !== 'number') return;
      player.paddleX = payload.x;
    });

    // Trust model for hits/serves: same hybrid as TennisRoom — each client
    // computes its own hit/serve locally (reusing the existing head-tracking/
    // paddle-collision/physics code unchanged) and reports the resulting
    // velocity here; the server doesn't re-derive hit trajectories, only
    // validates whether a hit/serve is currently legal (ball state/turn),
    // then owns continuous simulation between reports.
    this.onMessage('hit', (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !rules.canHit(this.ballState, player.role)) return;
      if (typeof payload?.velocity?.x !== 'number' || typeof payload?.velocity?.z !== 'number') return;

      this.ballState.vx = payload.velocity.x;
      this.ballState.vz = payload.velocity.z;
      this.ballState.lastHitBy = player.role;
      this.ballState.isActive = true;
      this.syncState();
    });

    this.onMessage('serve', (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !rules.canServe(this.matchState, player.role)) return;
      if (typeof payload?.velocity?.x !== 'number' || typeof payload?.velocity?.z !== 'number') return;

      // Serve always starts from center, unlike tennis — no position field
      // to trust from the client, just the served velocity.
      pongPhysics.resetBallPosition(this.ballState);
      this.ballState.vx = payload.velocity.x;
      this.ballState.vz = payload.velocity.z;
      this.ballState.lastHitBy = player.role;
      this.ballState.isActive = true;
      rules.startServe(this.matchState);
      rules.serveComplete(this.matchState);
      this.syncState();
    });

    // See class doc comment above for the trust model here.
    this.onMessage('activate_ability', (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      const duration = ABILITY_DURATIONS_MS[payload?.type];
      if (!player || !duration) return;

      const until = Date.now() + duration;
      if (payload.type === 'slowMo') {
        this.state.slowMoUntil = until;
      } else if (payload.type === 'shield') {
        player.shieldUntil = until;
      } else if (payload.type === 'paddleBoost') {
        player.paddleBoostUntil = until;
      }

      // except: client — the activating client already shows its own
      // "You activated X!" toast optimistically the moment its local gesture
      // pattern completes (see games/pong/src/index.js's handleAbilityActivate());
      // this broadcast is only for informing the OPPONENT.
      this.broadcast('ability_activated', { side: player.role, type: payload.type }, { except: client });
    });

    // Fed by the client's own room.ping() (Colyseus's built-in RTT
    // measurement) — see MultiplayerService.js.
    this.onMessage('__rtt_report', (client, { latencyMs }) => {
      if (typeof latencyMs === 'number') clientRTT.observe({ room: ROOM_LABEL }, latencyMs / 1000);
    });

    // See roomReady.js's doc comment — the countdown no longer starts just
    // because both sockets connected (onJoin below); it waits for both
    // clients' games to actually finish loading and report in here.
    this.onMessage('ready', (client) => {
      markReady(this, client, COUNTDOWN_MS);
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000));
    roomsActive.inc({ room: ROOM_LABEL });
  }

  onAuth(client, options) {
    return checkRoomPassword(this, options);
  }

  onJoin(client) {
    const role = this.state.players.size === 0 ? 'player' : 'bot';
    this.state.players.set(client.sessionId, new PlayerState({
      sessionId: client.sessionId,
      role,
      paddleX: 0,
      connected: true,
      paddleBoostUntil: 0,
      shieldUntil: 0,
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

    // v1: no reconnection window — a drop ends the match for both players
    // (same policy as TennisRoom/HandSwordRoom; a reconnection grace window
    // is a good future upgrade across all three rooms, not just this one).
    // Includes 'waiting' now too: with the ready-gate (see roomReady.js),
    // both seats can be filled but still sitting in 'waiting' for a while
    // if one client is slow to load — a disconnect during that window
    // should still end the match instead of leaving the other player
    // stuck with no timeout.
    const bothHadJoined = this.state.players.size === this.maxClients;
    if (bothHadJoined && (this.state.status === 'playing' || this.state.status === 'countdown' || this.state.status === 'waiting')) {
      this.state.status = 'ended';
    }
  }

  onDispose() {
    roomsActive.dec({ room: ROOM_LABEL });
  }

  update(deltaTime) {
    if (this.state.status !== 'playing') return;

    // Only measures ticks that actually did simulation work — idle waiting/
    // countdown ticks return above and would just dilute the histogram.
    const tickStart = process.hrtime.bigint();

    const now = Date.now();
    // Global Slow-Mo: scales the room's own tick for BOTH players, not just
    // whoever activated it — see class doc comment above for why this
    // couldn't stay a per-client local effect once the ball became
    // server-authoritative.
    const slowMoActive = now < this.state.slowMoUntil;
    const effectiveDeltaTime = slowMoActive ? deltaTime * SLOW_MO_FACTOR : deltaTime;

    if (this.ballState.isActive) {
      const missedSide = pongPhysics.updateBall(this.ballState, effectiveDeltaTime, FIELD_BOUNDS);
      if (missedSide) {
        this.handleMiss(missedSide, now);
      }
    }

    if (this.matchState.gameStatus === 'point-over' && !this.pointEndScheduled) {
      this.pointEndScheduled = true;
      this.clock.setTimeout(() => {
        this.pointEndScheduled = false;
        if (!rules.isGameOver(this.matchState)) {
          rules.nextPoint(this.matchState);
          pongPhysics.resetBallPosition(this.ballState);
        }
        this.syncState();
      }, POINT_RESET_MS);
    }

    this.syncState();

    const elapsedS = Number(process.hrtime.bigint() - tickStart) / 1e9;
    tickDuration.observe({ room: ROOM_LABEL }, elapsedS);
    if (elapsedS > TICK_BUDGET_S) tickOverruns.inc({ room: ROOM_LABEL });
  }

  /**
   * missedSide is who FAILED to return (loses the point unless Shield saves
   * them) — matches games/pong/src/physics.js's checkMiss() naming.
   */
  handleMiss(missedSide, now) {
    const missedPlayer = [...this.state.players.values()].find((p) => p.role === missedSide);

    if (missedPlayer && missedPlayer.shieldUntil > now) {
      // Shield save: deflect instead of ending the point, consuming the
      // shield — mirrors games/pong/src/index.js's deflectBall().
      missedPlayer.shieldUntil = 0;
      this.ballState.vz *= -1;
      this.ballState.z = missedSide === 'bot' ? FIELD_BOUNDS.minZ + 0.3 : FIELD_BOUNDS.maxZ - 0.3;
      return;
    }

    const winner = missedSide === 'player' ? 'bot' : 'player';
    pongPhysics.stopBall(this.ballState);
    rules.awardPoint(this.matchState, winner);
  }

  syncState() {
    const b = this.state.ball;
    b.x = this.ballState.x;
    b.z = this.ballState.z;
    b.vx = this.ballState.vx;
    b.vz = this.ballState.vz;
    b.isActive = this.ballState.isActive;
    b.lastHitBy = this.ballState.lastHitBy || '';

    const g = this.state.game;
    g.playerScore = this.matchState.playerScore;
    g.botScore = this.matchState.botScore;
    g.currentServer = this.matchState.currentServer;
    g.gameStatus = this.matchState.gameStatus;
    g.lastPointWinner = this.matchState.lastPointWinner || '';
  }
}
