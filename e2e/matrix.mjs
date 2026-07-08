/**
 * Runs both games' e2e tests across the full network-scenario matrix
 * (see network-conditions.mjs), fully automated: for each scenario, spawns
 * the Colyseus server with the matching SIMULATE_LATENCY_MS, waits for it
 * to come up, runs hand-sword.mjs and tennis.mjs against it with the
 * matching CDP throttle + timeout budget, then tears the server down
 * before moving to the next scenario.
 *
 * Prerequisites:
 *   - npm install (in this e2e/ directory)
 *   - Port 2567 free (this script owns the Colyseus server's lifecycle —
 *     don't have `npm run dev:server` already running)
 *   - The static dev servers already running (these don't need restarting
 *     between scenarios, only the multiplayer server's latency changes):
 *       npm run dev:host & npm run dev:hand-sword & npm run dev:tennis &
 *
 * Run: node matrix.mjs                    # all scenarios
 *      node matrix.mjs ideal poor         # just these scenarios
 */
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from './network-conditions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverDir = path.join(repoRoot, 'server');
const serverPort = 2567;

const GAMES = ['hand-sword', 'tennis'];

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

function startServer(simulateLatencyMs) {
  // Spawn node directly (not `npm run dev:server`) so we get a direct
  // process handle to kill between scenarios, and skip --watch (not
  // wanted for a controlled one-shot test run).
  return spawn('node', ['src/index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(serverPort), SIMULATE_LATENCY_MS: String(simulateLatencyMs) },
    stdio: 'inherit'
  });
}

async function runScenario(name, scenario) {
  console.log(`\n=== Scenario: ${name} — ${scenario.label} (server latency ${scenario.serverLatencyMs}ms) ===`);
  const server = startServer(scenario.serverLatencyMs);

  try {
    await waitForPort(serverPort, 15000);
    console.log(`[matrix] server up`);

    for (const game of GAMES) {
      console.log(`[matrix] running ${game} under "${name}" (timeout budget ${scenario.timeoutMs}ms)...`);
      const result = spawnSync('node', [`${game}.mjs`], {
        cwd: __dirname,
        env: { ...process.env, NETWORK_SCENARIO: name, E2E_TIMEOUT_MS: String(scenario.timeoutMs) },
        stdio: 'inherit'
      });
      if (result.status !== 0) {
        throw new Error(`${game} failed under scenario "${name}" (exit code ${result.status})`);
      }
    }
  } finally {
    server.kill();
    await sleep(500); // let the port free up before the next scenario
  }
}

const requested = process.argv.slice(2);
const scenarioNames = requested.length ? requested : Object.keys(SCENARIOS);

(async () => {
  const failures = [];

  for (const name of scenarioNames) {
    const scenario = SCENARIOS[name];
    if (!scenario) {
      console.error(`Unknown scenario "${name}" — valid: ${Object.keys(SCENARIOS).join(', ')}`);
      failures.push(name);
      continue;
    }

    try {
      await runScenario(name, scenario);
      console.log(`[matrix] ✅ ${name} passed`);
    } catch (err) {
      console.error(`[matrix] ❌ ${name} failed: ${err.message}`);
      failures.push(name);
    }
  }

  console.log('\n=== Matrix summary ===');
  for (const name of scenarioNames) {
    console.log(`  ${failures.includes(name) ? '❌' : '✅'} ${name}`);
  }

  if (failures.length) {
    console.error(`\n${failures.length}/${scenarioNames.length} scenario(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log(`\nAll ${scenarioNames.length} scenarios passed ✅`);
})();
