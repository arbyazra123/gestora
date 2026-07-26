import { Room } from 'colyseus';
import { schema, MapSchema } from '@colyseus/schema';
import * as tennisPhysics from '../physics/tennisPhysics.js';
import * as rules from '../physics/tennisRules.js';
import { roomsActive, clientsConnected, tickDuration, tickOverruns, clientRTT } from '../metrics.js';
import { setupLobbyMetadata, checkRoomPassword } from './roomAuth.js';

const ROOM_LABEL = 'tennis';
const TICK_BUDGET_S = 1 / 60; // matches Colyseus's default setSimulationInterval rate

const Vec3 = schema({ x: 'number', y: 'number', z: 'number' });

// 'role' below is a court-side identifier ('player' = z<0 side, 'bot' =
// z>0 side), carried over from the original single-player code's naming —
// in multiplayer neither side is an actual bot, both are human players.
// See games/tennis/src/index.js multiplayer wiring for the coordinate
// mirror applied at the network boundary for the 'bot'-role client.
const PlayerState = schema({
  sessionId: 'string',
  role: 'string',
  racket: Vec3,
  connected: 'boolean'
});

const BallState = schema({
  position: Vec3,
  velocity: Vec3,
  spin: Vec3,
  isActive: 'boolean',
  lastHitBy: 'string' // '' means no hit yet (schema strings can't hold null)
});

const GameState = schema({
  playerScore: 'number',
  botScore: 'number',
  playerGames: 'number',
  botGames: 'number',
  currentServer: 'string',
  rallyCount: 'number',
  gameStatus: 'string', // ready | serving | playing | point-over | game-over
  lastPointWinner: 'string'
});

const MatchState = schema({
  status: 'string', // waiting | countdown | playing | ended (room lifecycle)
  startAt: 'number',
  players: { map: PlayerState },
  ball: BallState,
  game: GameState
});

const COUNTDOWN_MS = 3000;
const POINT_RESET_MS = 2000; // matches games/tennis/src/index.js's handlePointEnd() setTimeout

// Ported from games/tennis/src/scene.js's getCourtBounds()
const COURT_WIDTH = 10.97;
const COURT_LENGTH = 23.77;
const COURT_SCALE = 0.33;
const COURT_BOUNDS = {
  minX: -COURT_WIDTH * COURT_SCALE / 2,
  maxX: COURT_WIDTH * COURT_SCALE / 2,
  minZ: -COURT_LENGTH * COURT_SCALE / 2,
  maxZ: COURT_LENGTH * COURT_SCALE / 2
};

export class TennisRoom extends Room {
  maxClients = 2;

  onCreate(options = {}) {
    setupLobbyMetadata(this, options);

    this.state = new MatchState({
      status: 'waiting',
      startAt: 0,
      players: new MapSchema(),
      ball: new BallState({
        position: new Vec3({ x: 0, y: 0.9, z: -5 }),
        velocity: new Vec3({ x: 0, y: 0, z: 0 }),
        spin: new Vec3({ x: 0, y: 0, z: 0 }),
        isActive: false,
        lastHitBy: ''
      }),
      game: new GameState({
        playerScore: 0, botScore: 0, playerGames: 0, botGames: 0,
        currentServer: 'player', rallyCount: 0, gameStatus: 'ready', lastPointWinner: ''
      })
    });

    // Internal physics/rules state (THREE.Vector3-based, not schema) — the
    // actual simulation runs on this each tick, then gets copied into
    // this.state (the network-replicated schema) via syncState(). See
    // tennisPhysics.js's module comment for why they're kept separate.
    this.ballState = tennisPhysics.createBallState();
    this.matchState = rules.createMatchState();
    this.pointEndScheduled = false;

    this.onMessage('racket', (client, pos) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || typeof pos?.x !== 'number') return;
      player.racket.x = pos.x;
      player.racket.y = pos.y;
      player.racket.z = pos.z;
    });

    // Trust model: each client computes its own hit/serve locally (reusing
    // the existing hand-tracking/gesture/physics code unchanged) and
    // reports the resulting velocity/spin here — the server doesn't
    // re-derive hit trajectories, only validates *whether* a hit/serve is
    // currently legal (ball state / turn), then takes over continuous
    // simulation from that point. See docs/multiplayer-networking-research.md.
    this.onMessage('hit', (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !rules.canHit(this.ballState, player.role)) return;
      if (!payload?.velocity || !payload?.spin) return;

      this.ballState.velocity.set(payload.velocity.x, payload.velocity.y, payload.velocity.z);
      this.ballState.spin.set(payload.spin.x, payload.spin.y, payload.spin.z);
      this.ballState.lastHitBy = player.role;
      this.ballState.isActive = true;
      rules.registerHit(this.matchState);
      this.syncState();
    });

    this.onMessage('serve', (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !rules.canServe(this.matchState, player.role)) return;
      if (!payload?.velocity || !payload?.spin || !payload?.position) return;

      this.ballState.position.set(payload.position.x, payload.position.y, payload.position.z);
      this.ballState.velocity.set(payload.velocity.x, payload.velocity.y, payload.velocity.z);
      this.ballState.spin.set(payload.spin.x, payload.spin.y, payload.spin.z);
      this.ballState.lastHitBy = player.role;
      this.ballState.isActive = true;
      rules.startServe(this.matchState);
      rules.serveComplete(this.matchState);
      this.syncState();
    });

    // Fed by the client's own room.ping() (Colyseus's built-in RTT
    // measurement) — see MultiplayerService.js. Reported back over a
    // message since the server has no direct way to read the client's
    // own ping result.
    this.onMessage('__rtt_report', (client, { latencyMs }) => {
      if (typeof latencyMs === 'number') clientRTT.observe({ room: ROOM_LABEL }, latencyMs / 1000);
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
      racket: new Vec3({ x: 0, y: 1, z: role === 'player' ? -5 : 4.5 }),
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
    if (this.state.status === 'playing' || this.state.status === 'countdown') {
      this.state.status = 'ended';
    }
  }

  onDispose() {
    roomsActive.dec({ room: ROOM_LABEL });
  }

  update(deltaTime) {
    if (this.state.status !== 'playing') return;

    // Only measures ticks that actually did simulation work (status ===
    // 'playing') — idle waiting/countdown ticks return above and would
    // just dilute the histogram with near-zero values.
    const tickStart = process.hrtime.bigint();

    if (this.ballState.isActive) {
      const bounceResult = tennisPhysics.updateBall(this.ballState, deltaTime, COURT_BOUNDS);
      if (bounceResult) {
        rules.processBounce(this.ballState, this.matchState, bounceResult);
      }
    }

    if (this.matchState.gameStatus === 'point-over' && !this.pointEndScheduled) {
      this.pointEndScheduled = true;
      this.clock.setTimeout(() => {
        this.pointEndScheduled = false;
        if (!rules.isGameOver(this.matchState)) {
          rules.nextPoint(this.matchState);
          tennisPhysics.resetBallPosition(this.ballState);
        }
        this.syncState();
      }, POINT_RESET_MS);
    }

    this.syncState();

    const elapsedS = Number(process.hrtime.bigint() - tickStart) / 1e9;
    tickDuration.observe({ room: ROOM_LABEL }, elapsedS);
    if (elapsedS > TICK_BUDGET_S) tickOverruns.inc({ room: ROOM_LABEL });
  }

  syncState() {
    const b = this.state.ball;
    b.position.x = this.ballState.position.x;
    b.position.y = this.ballState.position.y;
    b.position.z = this.ballState.position.z;
    b.velocity.x = this.ballState.velocity.x;
    b.velocity.y = this.ballState.velocity.y;
    b.velocity.z = this.ballState.velocity.z;
    b.spin.x = this.ballState.spin.x;
    b.spin.y = this.ballState.spin.y;
    b.spin.z = this.ballState.spin.z;
    b.isActive = this.ballState.isActive;
    b.lastHitBy = this.ballState.lastHitBy || '';

    const g = this.state.game;
    g.playerScore = this.matchState.playerScore;
    g.botScore = this.matchState.botScore;
    g.playerGames = this.matchState.playerGames;
    g.botGames = this.matchState.botGames;
    g.currentServer = this.matchState.currentServer;
    g.rallyCount = this.matchState.rallyCount;
    g.gameStatus = this.matchState.gameStatus;
    g.lastPointWinner = this.matchState.lastPointWinner || '';
  }
}
