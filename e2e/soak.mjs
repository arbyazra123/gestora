/**
 * Continuously plays matches under a single fixed network scenario, so you
 * can watch live data accumulate in Grafana rather than a single one-off
 * spike. Unlike matrix.mjs, the Colyseus server is started ONCE and left
 * running for the whole loop — restarting it every iteration would reset
 * every Prometheus counter/gauge and show up as gaps on the dashboard.
 *
 * Prerequisites (same as matrix.mjs):
 *   - npm install (in this e2e/ directory)
 *   - Port 2567 free (this script owns the Colyseus server's lifecycle —
 *     don't have `npm run dev:server` already running)
 *   - The static dev servers already running:
 *       npm run dev:host & npm run dev:hand-sword & npm run dev:tennis &
 *   - (optional, to actually watch it) monitoring/ stack up:
 *       cd monitoring && docker compose up -d
 *
 * Run: node soak.mjs mobile              # both games, loops forever
 *      node soak.mjs mobile tennis       # just tennis, loops forever
 *      node soak.mjs mobile --once       # single pass then exit
 *
 * Stop with Ctrl+C — cleans up the server process before exiting. Note:
 * a running match blocks synchronously, so Ctrl+C takes effect between
 * test runs, not mid-run.
 */
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScenario } from './network-conditions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverDir = path.join(repoRoot, 'server');
const serverPort = 2567;
const ALL_GAMES = ['hand-sword', 'tennis'];

const args = process.argv.slice(2);
const once = args.includes('--once');
const positional = args.filter((a) => !a.startsWith('--'));
const scenarioName = positional[0];
const requestedGames = positional.slice(1).length ? positional.slice(1) : ALL_GAMES;

if (!scenarioName) {
  console.error('Usage: node soak.mjs <scenario> [game...] [--once]');
  console.error('Scenarios: ideal, good, mobile, poor');
  process.exit(1);
}

const scenario = getScenario(scenarioName); // throws with a clear message on an unknown name

async function waitForPort(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(`http://localhost:${port}`);
      return;
    } catch {
      await sleep(300);
    }
  }
  throw new Error(`port ${port} did not become ready within ${timeoutMs}ms`);
}

console.log(`[soak] starting server for scenario "${scenarioName}" — ${scenario.label} (server latency ${scenario.serverLatencyMs}ms)`);
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(serverPort), SIMULATE_LATENCY_MS: String(scenario.serverLatencyMs) },
  stdio: 'inherit'
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\n[soak] stopping...');
  server.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await waitForPort(serverPort, 15000);
console.log('[soak] server up — looping matches. Watch it in Grafana: http://localhost:3000');
console.log('[soak] press Ctrl+C to stop\n');

let iteration = 0;
while (!stopping) {
  iteration++;
  console.log(`[soak] === iteration ${iteration} (${requestedGames.join(', ')}) ===`);

  for (const game of requestedGames) {
    if (stopping) break;
    const result = spawnSync('node', [`${game}.mjs`], {
      cwd: __dirname,
      env: { ...process.env, NETWORK_SCENARIO: scenarioName, E2E_TIMEOUT_MS: String(scenario.timeoutMs) },
      stdio: 'inherit'
    });
    if (result.status !== 0) {
      console.error(`[soak] ${game} failed this iteration (exit ${result.status}) — continuing anyway`);
    }
  }

  if (once) break;
}

if (!stopping) {
  console.log('[soak] done (--once)');
  server.kill();
  process.exit(0);
}
