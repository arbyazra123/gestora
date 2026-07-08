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

### Ports

| Service | Port | Protocol |
|---|---|---|
| host (hub) | 5151 | http |
| hand-sword | 5001 | http |
| tennis | 5002 | http |
| pong | 5003 | http |
| server (multiplayer) | 2567 | ws |

## Playing hand-sword in multiplayer

hand-sword is currently the only game with multiplayer wired up (pong/tennis are single-player only for now — see `docs/multiplayer-networking-research.md` for why). To try it:

1. Run `npm run dev` (or at minimum `dev:host` + `dev:hand-sword` + `dev:server`).
2. Open **http://localhost:5151** in two separate browser windows/profiles (or one normal + one incognito — two tabs in the *same* profile can work too, since each game instance gets its own Colyseus connection).
3. Click hand-sword's **🌐 1v1 Online** button in both.
4. Click the in-game **▶ Play** button in each window — this is the "ready" signal. Once both are ready, a synchronized countdown starts and the beat/box spawning kicks off at the same moment in both windows.
5. Each window shows the other's live score/combo in the panel top-right.

The regular **▶ Play** button (solo mode) works as before and doesn't touch the multiplayer server at all.

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
