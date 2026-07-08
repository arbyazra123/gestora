# e2e

Two-browser Playwright scripts that verify each game's multiplayer flow end-to-end (join, ready-up, synchronized countdown, live match state, disconnect handling). Standalone — not part of the npm workspaces build, uses `playwright-core` directly against the system-installed Chrome (no bundled browser download).

## Setup

```bash
cd e2e
npm install
```

## Run a single test

Start the app's dev servers first (from the repo root):

```bash
npm run dev:server & npm run dev:host & npm run dev:hand-sword & npm run dev:tennis &
```

Then, from `e2e/`:

```bash
npm run test:hand-sword
npm run test:tennis
```

Screenshots from each run are written to `e2e/screenshots/` (gitignored).

## Simulating network conditions

`network-conditions.mjs` defines named scenarios from `ideal` to `poor`, each pairing:
- **Server-side round-trip latency** — Colyseus's own `Server.simulateLatency()` (see `server/src/index.js`'s `SIMULATE_LATENCY_MS` env var), which delays message processing/delivery. This is what actually stresses this project's client prediction/reconciliation/interpolation logic.
- **Browser-side throttling** — Chrome DevTools Protocol's `Network.emulateNetworkConditions` (latency + bandwidth caps), applied per browser context. This affects real socket behavior, not just server-side message timing, and also slows asset loading (relevant since MediaPipe's hand-tracking models are ~2MB+, streamed from a CDN, not bundled).

Run a single test under a specific scenario manually:

```bash
NETWORK_SCENARIO=poor E2E_TIMEOUT_MS=90000 npm run test:tennis
```

(`E2E_TIMEOUT_MS` is a manual override here — normally the matrix runner below sets it to match each scenario's expected asset-load/round-trip time automatically. The server also needs the matching latency: `SIMULATE_LATENCY_MS=300 npm run dev:server`.)

### Automated matrix (recommended)

`matrix.mjs` fully automates this: for each scenario it spawns the Colyseus server with the matching `SIMULATE_LATENCY_MS`, waits for it to come up, runs both `hand-sword.mjs` and `tennis.mjs` against it with the matching CDP throttle + timeout budget, tears the server down, and moves to the next scenario. **It owns the Colyseus server's lifecycle** — don't have `npm run dev:server` already running (port 2567 must be free); the static dev servers (`dev:host`/`dev:hand-sword`/`dev:tennis`) do need to already be running, same as above.

```bash
npm run test:matrix              # all scenarios
node matrix.mjs ideal poor       # just these scenarios
```

Prints a pass/fail summary across the matrix at the end.
