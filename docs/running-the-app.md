# Running the App

## Prerequisites

- Node.js (no version is pinned in this repo — anything reasonably current works; developed against Node 22)
- npm (this repo uses npm workspaces, not yarn/pnpm)
- A webcam (all games use hand/head tracking)

## Install

From the repo root:

```bash
npm run install:all
```

This installs the root workspace plus each package's own dependencies individually: `host`, `games/hand-sword`, `games/tennis`, `games/pong`, and `server`.

## Run everything

```bash
npm run dev
```

This runs every `dev:*` script in parallel (`npm-run-all --parallel dev:*`) — the host, all three games, and the multiplayer server all start together. Open **http://localhost:5151** — that's the platform hub.

### Run pieces individually

Useful when you only need a subset (e.g. iterating on one game, or don't need multiplayer running):

```bash
npm run dev:host        # Platform hub — http://localhost:5151
npm run dev:hand-sword  # Hand Sword Rhythm game — http://localhost:5001
npm run dev:tennis      # Motion Tennis — http://localhost:5002
npm run dev:pong        # Motion Pong — http://localhost:5003
npm run dev:server      # Multiplayer server (Colyseus) — ws://localhost:2567
```

The host dynamically loads whichever games are running via Module Federation, so `dev:host` alone is enough to browse the hub, but a game only actually launches if its own dev server is also running.

### Run everything in Docker (recommended if you're juggling ports)

If native `npm run dev` leaves you tracking down stray processes with `lsof -ti:PORT | xargs kill` every time you switch tasks, use the containerized stack instead — one command starts (or stops) all 7 services together, or any subset by name, with no manual process management:

```bash
cd docker
docker compose up -d --build   # first run, or after a package.json change
docker compose up -d           # subsequent runs (no rebuild needed)
```

This starts host, hand-sword, tennis, pong, the multiplayer server, Prometheus, and Grafana — same ports as the native setup (5151/5001/5002/5003/2567), plus 9090 and 3000 for monitoring (see below). Bring up a subset the same way native `dev:*` scripts work individually:

```bash
docker compose up -d host hand-sword server   # just these three
```

Simulate server-side network latency without touching env files:

```bash
SIMULATE_LATENCY_MS=100 docker compose up -d server
```

Stop everything cleanly:

```bash
docker compose down
```

Source lives in `docker/` (a bind mount, so edits on the host are picked up live — no rebuild needed unless a `package.json` changed). See `docker/docker-compose.yml` for the full service list.

### Ports

| Service | Port | Protocol |
|---|---|---|
| host (hub) | 5151 | http |
| hand-sword | 5001 | http |
| tennis | 5002 | http |
| pong | 5003 | http |
| server (multiplayer) | 2567 | ws |

## Playing in multiplayer

hand-sword and tennis both have multiplayer wired up (pong is still single-player only — see `docs/multiplayer-networking-research.md` for the architecture, and `docs/network-simulation-metrics.md` for measured performance across network conditions). To try it:

1. Run `npm run dev` (or at minimum `dev:host` + the game(s) you want + `dev:server`).
2. Open **http://localhost:5151** in two separate browser windows/profiles (or one normal + one incognito — two tabs in the *same* profile can work too, since each game instance gets its own Colyseus connection).
3. Click the game's **🌐 1v1 Online** button in both.
4. hand-sword: click the in-game **▶ Play** button in each window (the "ready" signal). tennis: press **SPACE** in each window instead. Once both are ready, a synchronized countdown starts.
5. hand-sword shows the opponent's live score/combo top-right; tennis shows the opponent's score in the main scoreboard, labeled "OPPONENT."

The regular solo entry point (hand-sword's **▶ Play** button / tennis's SPACE-to-start) works as before and doesn't touch the multiplayer server at all.

## Monitoring

The multiplayer server exposes Prometheus-format metrics at **http://localhost:2567/metrics** (via `prom-client` — see `server/src/metrics.js`) whenever it's running. No extra setup needed to view it raw:

```bash
curl http://localhost:2567/metrics
```

Covers: default Node.js process metrics (event-loop lag, memory, CPU, GC — free from `prom-client`), active rooms/connected clients per game, tennis's per-tick simulation duration + overrun count, and real client-reported RTT (fed by each client's own `room.ping()`, polled every 5s — see `MultiplayerService.js`'s `getLatency()`).

### Dashboard (Prometheus + Grafana)

Prometheus + Grafana are part of the same `docker/` stack described above — Prometheus scrapes the server's `/metrics` endpoint, Grafana visualizes it with a pre-built dashboard (7 panels: active rooms, connected clients, tick overrun rate, tick duration percentiles, client RTT percentiles, event-loop lag, memory). Nothing to configure by hand — both the Prometheus scrape target and the Grafana dashboard/datasource are provisioned from files in this repo.

```bash
cd docker
docker compose up -d prometheus grafana server   # or just `docker compose up -d` for the full stack
```

Then open **http://localhost:3000** (login `admin` / `admin`) → the "motion-platform — multiplayer server" dashboard is already there. Prometheus itself is at **http://localhost:9090** if you want to run raw PromQL queries. Since the server runs as a container on the same Docker network here (not on the host), Prometheus reaches it via the service name `server:2567` — see `docker/prometheus.yml`.

Tear down with `docker compose down` from `docker/`. This is deliberately the "simple but scalable" version — no auth hardening, no persistent Grafana storage (dashboards are provisioned from `docker/grafana/dashboards/*.json`, not clicked together, so nothing is lost between `docker compose down`/`up`), not meant to be exposed beyond localhost. See `docs/network-simulation-metrics.md` for what this covers and what's still a gap (e.g. reconciliation/patch-bandwidth metrics, `perf_hooks.monitorEventLoopDelay()`).

## Production build

```bash
npm run build
```

This builds `host` and all three games (`build:host` + `build:games`). The multiplayer `server/` package is a plain Node process with nothing to bundle, so it's intentionally **not** part of `npm run build` — it just runs directly:

```bash
cd server && npm start
```

There's no CI/CD or containerization in this repo yet — deploying `server/` (or putting it behind a process manager/reverse proxy) is a manual step for whoever hosts it.

## Troubleshooting

- **Camera permission prompt**: every game asks for webcam access on load; browsers won't proceed without it.
- **`Failed to load resource` for `thumb.jpg` paths**: harmless — game thumbnail images referenced in `host/public/games-registry.json` don't exist yet (placeholder), and the hub renders a 🎮 emoji instead.
- **MediaPipe CDN fetch errors** (`cdn.jsdelivr.net`): the legacy hand-tracking models load from a CDN, not bundled locally — a flaky network will show up as failed hand tracking, not an app bug.
