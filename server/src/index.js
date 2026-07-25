import { Server } from 'colyseus';
import { HandSwordRoom } from './rooms/HandSwordRoom.js';
import { TennisRoom } from './rooms/TennisRoom.js';
import { register } from './metrics.js';

const port = Number(process.env.PORT) || 2567;
const simulatedLatencyMs = Number(process.env.SIMULATE_LATENCY_MS) || 0;

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
  }
});

// Room name doubles as the game's registry id ("hand-sword"/"tennis"), so
// MultiplayerService can pass gameId straight through with no mapping table.
gameServer.define('hand-sword', HandSwordRoom);
gameServer.define('tennis', TennisRoom);

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
