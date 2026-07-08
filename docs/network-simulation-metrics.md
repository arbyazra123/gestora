# Multiplayer Network Simulation — Metrics Report

Real, measured timing data from motion-platform's hand-sword and tennis multiplayer flows, run end-to-end across four network scenarios (ideal → poor) using Colyseus's server-side latency injection combined with Chrome DevTools Protocol client-side throttling. Followed by a reference on what a production deployment should additionally instrument.

Generated from live measurements: `e2e/matrix.mjs` → `e2e/metrics/summary.json` (both games, 4 scenarios, all passing). Interactive version with charts: see the published Artifact from this session, or regenerate via `cd e2e && npm run test:matrix`.

## Headline numbers

| Metric | Ideal → Poor | Note |
|---|---|---|
| Join round-trip | 113ms → 946ms | 8.4× under poor conditions |
| Countdown sync skew | 2ms → 634ms | the clearest fairness signal |
| Asset load time | 1.6s → 75.4s | bandwidth-bound, not multiplayer |
| Game pacing (post-sync) | ±60ms range | **stable across all 4 scenarios** |

## What we measured

Each scenario pairs a server-side round-trip delay (Colyseus's own `Server.simulateLatency()`, via `server/src/index.js`'s `SIMULATE_LATENCY_MS` env var) with a browser-side throttle (Chrome DevTools Protocol's `Network.emulateNetworkConditions`, applied per browser context — affects real socket behavior and asset loading, not just server message timing). Two independent Chrome contexts play a full match against each other for real; nothing here is simulated at the application level.

| Scenario | Description | Server latency | CDP throttle |
|---|---|---|---|
| Ideal | No throttling (LAN-like) | 0ms | — |
| Good wifi | Home broadband | 20ms | 30ms · 10↓/5↑ Mbps |
| 4G/LTE | Typical mobile | 100ms | 150ms · 4↓/2↑ Mbps |
| Poor | Congested connection | 300ms | 400ms · 1↓/0.5↑ Mbps |

## Round-trip-sensitive metrics

These three scale directly with the simulated network — they're the cleanest proxies for "does this feel laggy."

### Join round-trip
`connect()` + `joinRoom()` — time from clicking Ready to seeing "Waiting for opponent"

| Scenario | hand-sword | tennis |
|---|---|---|
| Ideal | 113ms | 76ms |
| Good wifi | 139ms | 127ms |
| 4G/LTE | 396ms | 405ms |
| Poor | 946ms | 1.0s |

### Countdown sync skew
`\|time A saw countdown start − time B saw it\|` — how fair the match-start feels

| Scenario | hand-sword | tennis |
|---|---|---|
| Ideal | 2ms | 2ms |
| Good wifi | 2ms | 8ms |
| 4G/LTE | 233ms | 184ms |
| Poor | 634ms | 617ms |

> **Countdown sync skew is the most player-facing finding here.** Under "poor," one player sees the match countdown start ~600ms before the other — in a competitive 2-player game, that's a real, perceptible fairness gap, not just a number. It's a direct consequence of the two clients' independent connections to the server experiencing different jitter, not a bug in the sync logic itself.

### Disconnect propagation
Time for the remaining player to learn their opponent left

| Scenario | hand-sword | tennis |
|---|---|---|
| Ideal | 114ms | 128ms |
| Good wifi | 124ms | 162ms |
| 4G/LTE | 160ms | 212ms |
| Poor | 274ms | 307ms |

## Bandwidth-bound: initial asset load

Dominated by download throughput, not latency — MediaPipe's hand-tracking models (~2MB+ of WASM/model files, streamed from a CDN, not bundled) have to fully download before either game can even show its "ready" UI. This is unrelated to the multiplayer sync work itself; it would affect solo play identically.

| Scenario | hand-sword | tennis |
|---|---|---|
| Ideal | 1.6s | 1.0s |
| Good wifi | 8.0s | 8.2s |
| 4G/LTE | 20s | 21s |
| Poor | 75s | 76s |

> **75 seconds to load on a throttled 1Mbps connection is the single most actionable finding in this report.** It has nothing to do with multiplayer — it's a solo-play asset-loading problem that multiplayer testing happened to surface. Worth a follow-up: compress/bundle the MediaPipe assets, or add a loading-progress indicator so a slow load doesn't read as a hang.

## Game-pacing stability (the architecture validation)

This is the finding that most directly validates the multiplayer design from `docs/multiplayer-networking-research.md`: once a match starts, its *pacing* — the 3-second countdown, the rhythm of a rally — is driven by each client's own local clock/server tick, not re-synchronized on every network round trip. If the architecture were leaking network latency into gameplay pacing, these numbers would climb steadily like the tables above. They don't.

**hand-sword: countdown → playing** (the fixed 3s countdown duration itself)

| Ideal | Good wifi | 4G/LTE | Poor |
|---|---|---|---|
| 3.06s | 3.04s | 3.02s | 3.00s |

**tennis: countdown → first point** (countdown + serve challenge + physics + scoring)

| Ideal | Good wifi | 4G/LTE | Poor |
|---|---|---|---|
| 9.42s | 9.44s | 9.54s | 9.85s |

## Full data

| Scenario | Game | Join RTT | Countdown skew | Asset load | Disconnect propagation |
|---|---|---|---|---|---|
| Ideal | hand-sword | 113ms | 2ms | 1.6s | 114ms |
| Ideal | tennis | 76ms | 2ms | 1.0s | 128ms |
| Good wifi | hand-sword | 139ms | 2ms | 8.0s | 124ms |
| Good wifi | tennis | 127ms | 8ms | 8.2s | 162ms |
| 4G/LTE | hand-sword | 396ms | 233ms | 20s | 160ms |
| 4G/LTE | tennis | 405ms | 184ms | 21s | 212ms |
| Poor | hand-sword | 946ms | 634ms | 75s | 274ms |
| Poor | tennis | 1.0s | 617ms | 76s | 307ms |

Raw per-run JSON: `e2e/metrics/summary.json`.

## What a production deployment should also track

Our test harness measures wall-clock timing from outside the browser and server. It doesn't (and can't, from that vantage point) see several categories production teams actually monitor. Compiled from Colyseus's own docs/source and how comparable platforms (Nakama, Agones) and general Node.js practice handle this — sourced, not guessed.

**Update:** a first pass at closing some of these gaps has since shipped — see `server/src/metrics.js` and `docs/running-the-app.md`'s Monitoring section. A `prom-client`-based `/metrics` endpoint now exposes default Node.js process metrics, active rooms/connected clients, tennis's per-tick duration + overrun count, and real client-reported RTT via `room.ping()` — visualized in a provisioned Prometheus + Grafana stack (`monitoring/`, `docker compose up -d`). Items below are marked ✅ where this closes the gap, 🔲 where it's still open.

### 1 — Core network layer: RTT, jitter, packet loss

- Track **percentiles (p50/p95/p99), not averages** — latency distributions are long-tailed; a handful of GC-pause/network-hiccup outliers inflate the mean without reflecting most sessions. p99 is the number that correlates with "unplayable."
- **Jitter matters as much as raw RTT** — a 20ms ping with 30ms jitter can play worse than a 40ms ping with 2ms jitter.
- ✅ **Closed:** Colyseus's `room.ping()` is now wired up (`MultiplayerService.getLatency()`), polled every 5s per client, and fed into the `colyseus_client_rtt_seconds` histogram at `/metrics`.

### 2 — Server tick / simulation health

- **"Fix Your Timestep" (Gaffer On Games)** is the canonical reference for fixed-timestep loops and the "spiral of death" failure mode — when a tick runs longer than the time it simulates, catch-up logic can snowball into a death spiral without a max-catch-up clamp.
- ✅ **Partially closed:** tennis's simulation loop now records tick duration + overrun count (`colyseus_room_tick_duration_seconds`, `colyseus_room_tick_overruns_total`) — but this is hand-wrapped per room, not something Colyseus provides generically, and doesn't yet include Node's `perf_hooks.monitorEventLoopDelay()` for the underlying event-loop-lag signal.
- 🔲 **Gap:** known framework quirk — `setSimulationInterval` uses plain `setInterval`, which reapplies its delay *after* the callback finishes — a 20ms tick against a 50ms interval produces a real ~70ms delta, uncompensated by the framework.
- Recommended self-instrumentation: wrap the simulation callback to log per-tick duration vs. budget, paired with Node's built-in `perf_hooks.monitorEventLoopDelay()` (a percentile histogram of event-loop delay — the real bottleneck, since Colyseus runs single-threaded on Node's event loop).

### 3 — Sync quality / reconciliation

- Standard pattern (Gambetta): sequence-numbered inputs, server echoes last-processed sequence, client compares its predicted state at that sequence against server truth and replays unacknowledged inputs on mismatch. No mainstream engine ships a standard "correction magnitude" metric — teams hand-instrument it.
- **Overwatch** (GDC 2017): most mispredictions trace to packet loss starving server input — mitigated via "time dilation," briefly telling the client to simulate faster to refill its input buffer.
- **Rocket League** (GDC 2018): decays correction error over several predicted frames (full → 2/3 → 1/3) instead of a hard snap — undershoot reads better to players than rubber-banding.
- 🔲 **Gap:** recommended metrics we don't currently have — correction frequency, correction magnitude, and (specifically relevant to tennis's server-authoritative ball) how far the ball's client-rendered position drifts from server truth before the next patch arrives.
- Patch bandwidth reference (Gaffer On Games): naive 60Hz sync for ~900 objects ≈ 17.4 Mbps; delta-encoded + bit-packed ≈ 15 kbps — roughly 1000×. `@colyseus/schema` already delta-encodes (only changed fields serialize), but ships no per-client byte-size telemetry — we don't currently measure our own patch sizes.

### 4 — Capacity / scaling

- Commonly monitored: concurrent connections/CCU, concurrent rooms, CPU/memory per process, event-loop lag as the primary Node.js saturation signal.
- 🔲 **Gap:** Colyseus Cloud's dashboard covers this at the infra level (CCU, active rooms, CPU/mem, crash alerts) — but **no auto-scaling**; scaling is a manual dashboard action per Colyseus's own FAQ.
- **`prom-client` + Prometheus + Grafana** is the de facto Node.js standard for the metrics Colyseus doesn't expose — no ready-made Colyseus exporter exists; teams wire it in manually.
- Comparison points: **Nakama** natively exposes Prometheus metrics for sessions/presences/matches and cites ~10,000 CCU/node; **Agones** (K8s game-server orchestration) ships rich Prometheus metrics + prebuilt Grafana dashboards out of the box — a useful reference architecture if this ever moves off Colyseus Cloud.

### 5 — Player experience / business metrics

- Matchmaking time-to-match and match completion/abandonment rate have no standardized industry benchmark — track your own baseline and watch the trend, not an absolute target.
- A vendor-commissioned survey (Liquid Web, n=1,000 — directional only, not peer-reviewed) found 78% of gamers have rage-quit due to latency, self-reported tolerance ~45ms before frustration.
- Genre-informed synthesis (not a single quotable source): competitive/FPS players perceive latency as low as 15ms, esports systems commonly target <50ms; racing games are unusually latency-sensitive for relative-position perception; casual titles (closer to this project) are broadly reported to tolerate ~100–150ms.

### 6 — Tooling actually used in production

| Tool | Colyseus-specific? | What it actually does |
|---|---|---|
| `@colyseus/monitor` | Official, bundled | Room/connection inspector only — no latency, tick, or bandwidth metrics. Must be auth-protected before production use. |
| Colyseus Cloud dashboard | Official (managed hosting) | CCU, active rooms, CPU/memory, crash alerts, deploy history — infra-level only. |
| `prom-client` + Prometheus + Grafana | General Node.js ecosystem | The natural fit for custom metrics Colyseus doesn't expose (tick duration, patch size, correction rate) — no ready-made Colyseus exporter exists. |
| OpenTelemetry for Node.js | General | HTTP/DB auto-instrumented; WebSocket tracing needs add-ons — no official Colyseus/uWebSockets.js OTel instrumentation found. |
| Sentry | General | No WebSocket-specific product, but supports manual trace propagation over WS messages; otherwise standard error tracking + APM. |

## Recommendations

1. **Ship the asset-loading fix first.** It's the largest number in this report (75s) and the easiest to act on independently of multiplayer. *(still open)*
2. ✅ ~~Add Colyseus's built-in `room.ping()`/`client.getLatency()` to the client~~ — **done**: `MultiplayerService.getLatency()` polls RTT every 5s and reports it to `/metrics`. Still open: surfacing it in an actual in-game "connection quality" indicator (the plumbing exists, the UI doesn't yet).
3. ✅ ~~Instrument server tick timing + build a real dashboard~~ — **done**: tennis's tick duration + overrun count are in `/metrics`, and `monitoring/` now has a provisioned Prometheus + Grafana stack (`docker compose up -d`, see `docs/running-the-app.md`) with a 7-panel dashboard — verified rendering real data from actual matches. Still open: `perf_hooks.monitorEventLoopDelay()` specifically (default `prom-client` metrics cover the same signal via `nodejs_eventloop_lag_*`, already on the dashboard, so this is now a nice-to-have rather than a real gap).
4. **Treat 600ms+ countdown skew as a UX question, not just a metric** — decide deliberately whether the game should visually compensate (e.g., start the countdown animation from each client's own message-received time rather than a shared instant) or accept it as within tolerance for a casual game. *(still open)*

## Sources

Colyseus documentation/source (`docs.colyseus.io`, `@colyseus/core`/`@colyseus/schema` package source), Node.js `perf_hooks` docs, Gaffer On Games' netcode series (`gafferongames.com`), Gabriel Gambetta's client-side prediction series, Nakama and Agones public documentation as comparison points, GDC talks (Overwatch 2017, Rocket League 2018).
