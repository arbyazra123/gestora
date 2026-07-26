import { Server, matchMaker } from 'colyseus';
import { HandSwordRoom } from './rooms/HandSwordRoom.js';
import { TennisRoom } from './rooms/TennisRoom.js';
import { PongRoom } from './rooms/PongRoom.js';
import { register } from './metrics.js';

const port = Number(process.env.PORT) || 2567;
const simulatedLatencyMs = Number(process.env.SIMULATE_LATENCY_MS) || 0;

// Room name doubles as the game's registry id — see gameServer.define() calls
// below. Kept as a literal list (rather than deriving from define() calls)
// since the room list/online-summary endpoints need this before the rooms
// are defined further down.
const GAME_IDS = ['hand-sword', 'tennis', 'pong'];

/**
 * Shape returned for each room — deliberately never includes the room's own
 * password (see roomAuth.js). `locked` is Colyseus's own "room is full" flag
 * (each room calls this.lock() once maxClients is reached), unrelated to
 * hasPassword. `gameId` is only included by the cross-game /rooms listing
 * (the dashboard's Rooms tab) — the per-game /rooms/:gameId listing omits it
 * since the caller already knows which game it asked for.
 */
function toRoomListing(room, { includeGameId = false } = {}) {
  return {
    ...(includeGameId ? { gameId: room.name } : {}),
    roomId: room.roomId,
    name: room.metadata?.name || null,
    hasPassword: !!room.metadata?.hasPassword,
    clients: room.clients,
    maxClients: room.maxClients,
    locked: !!room.locked
  };
}

const gameServer = new Server({
  // Registers a plain Express route on the same HTTP server the WebSocket
  // transport already runs, rather than standing up a second listener.
  // See docs/network-simulation-metrics.md for what this endpoint does
  // and doesn't cover.
  express: (app) => {
    // Enable CORS for all routes
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }

      next();
    });

    app.get('/metrics', async (req, res) => {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    });

    // Room list for a specific game — passworded rooms are deliberately
    // still included here (gated at join time instead, via each room's
    // onAuth — see roomAuth.js); this only excludes full/locked rooms, since
    // there's nothing useful to join there.
    app.get('/rooms/:gameId', async (req, res) => {
      if (!GAME_IDS.includes(req.params.gameId)) {
        res.status(404).json({ error: 'Unknown game id' });
        return;
      }
      const rooms = await matchMaker.query({ name: req.params.gameId, locked: false });
      res.json(rooms.map(toRoomListing));
    });

    // Cross-game room list for the dashboard's Rooms tab — unlike
    // /rooms/:gameId (used by the per-game Room List modal), this
    // deliberately INCLUDES full/locked rooms too (marked via `locked`), so
    // the tab reads as "what's happening right now platform-wide" rather
    // than just a join picker.
    app.get('/rooms', async (req, res) => {
      const perGame = await Promise.all(
        GAME_IDS.map((gameId) => matchMaker.query({ name: gameId }))
      );
      res.json(perGame.flat().map((room) => toRoomListing(room, { includeGameId: true })));
    });

    // Platform-wide online-players summary — fetched eagerly by the hub as
    // soon as it loads (see host/src/ui/GameHub.js), independent of picking
    // any specific game, so a live count is already available before the
    // player has picked anything.
    app.get('/online-summary', async (req, res) => {
      const perGame = await Promise.all(
        GAME_IDS.map((gameId) => matchMaker.query({ name: gameId }))
      );
      const allRooms = perGame.flat();
      res.json({
        totalPlayers: allRooms.reduce((sum, r) => sum + r.clients, 0),
        totalRooms: allRooms.length
      });
    });
  }
});

// Room name doubles as the game's registry id ("hand-sword"/"tennis"), so
// MultiplayerService can pass gameId straight through with no mapping table.
gameServer.define('hand-sword', HandSwordRoom);
gameServer.define('tennis', TennisRoom);
gameServer.define('pong', PongRoom);

// listen() sets up gameServer.transport internally — simulateLatency()
// needs that to already exist, so it must run after listen() resolves,
// not before.
await gameServer.listen(port);

// Artificial round-trip latency for testing sync/reconciliation under
// degraded network conditions — set SIMULATE_LATENCY_MS=200 (for example)
// before starting the server. See e2e/network-conditions.mjs and
// e2e/matrix.mjs, which drive this automatically across a scenario matrix.
if (simulatedLatencyMs > 0) {
  gameServer.simulateLatency(simulatedLatencyMs);
}

console.log(`[server] Colyseus listening on ws://localhost:${port}${simulatedLatencyMs > 0 ? ` (simulating ${simulatedLatencyMs}ms RTT)` : ''}`);
