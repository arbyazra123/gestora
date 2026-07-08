# e2e

Two-browser Playwright scripts that verify each game's multiplayer flow end-to-end (join, ready-up, synchronized countdown, live match state, disconnect handling). Standalone — not part of the npm workspaces build, uses `playwright-core` directly against the system-installed Chrome (no bundled browser download).

## Setup

```bash
cd e2e
npm install
```

## Run

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
