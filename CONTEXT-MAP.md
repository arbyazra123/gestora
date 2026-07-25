# Context Map

## Contexts

- [Host](./host/CONTEXT.md) — the platform shell; loads Games dynamically and provides shared Services (hand tracking, camera, multiplayer, game lifecycle)
- [Hand Sword](./games/hand-sword/CONTEXT.md) — rhythm/combat Game; slice to the beat with hand tracking
- [Pong](./games/pong/CONTEXT.md) — single-player arcade Game against a bot; head + hand gesture control
- [Tennis](./games/tennis/CONTEXT.md) — table tennis Game against a bot or a remote opponent; hand-tracked paddle control
- [Server](./server/CONTEXT.md) — Colyseus multiplayer server; hosts Rooms for Games that support multiplayer

## Language

Cross-cutting terms — these describe the seams between contexts, not any one context's internals.

**Game**:
A self-contained module dynamically loaded by the host via Module Federation, implementing the standard lifecycle interface (`init`, `start`, `pause`, `resume`, `stop`, `cleanup`).
_Avoid_: Game Module, Remote, Federation Module

**Services**:
The fixed bundle of four shared singletons — `MediaPipeService`, `CameraService`, `MultiplayerService`, `GameManager` — the host passes to every Game's constructor. Not an open-ended DI container; exactly these four.
_Avoid_: Dependencies, Context, Providers

**Manifest**:
The `manifest.json` a Game exposes to the host, declaring its id, remote entry URL, hand-tracking mode, multiplayer capabilities, and performance budget. The mirror of Services — how a Game declares itself, rather than what it's given.
_Avoid_: Config, Metadata

**Room**:
A live multiplayer session hosted by the Server (Colyseus). Joined via `MultiplayerService.joinRoom(roomName)` / `createRoom()` — `roomName` here is actually the Game's id (which Room *type* to join), not a specific Room instance's identifier.
_Avoid_: Session

**Match**:
The gameplay lifecycle state machine running inside a Room, tracked via a `status` field: `waiting` → `countdown` → `playing` → `ended`. Distinct from the Room itself — a Room exists (players can join) before its Match begins, and holds Match-specific data (e.g. hand-sword's locked bpm/theme, tennis's ball/score state).

**Relay Room**:
A Room that trusts each client's self-reported state and only rebroadcasts it to the opponent — used when player state is independent and uncontested (e.g. `HandSwordRoom`'s score/combo).

**Authoritative Room**:
A Room where the server owns simulation of shared, contested state and ticks it server-side — used when client state could be fabricated or disputed (e.g. `TennisRoom`'s ball physics via `tennisPhysics.js`/`tennisRules.js`).

**RTT (Round-Trip Time)**:
Client-measured latency via Colyseus's own `room.ping()` on the Host side, reported back to the Server per-connection over a `__rtt_report` message and exposed as a Server metric.

## Relationships

- **Host → Game**: Host dynamically loads a Game via Module Federation, reading its Manifest to know how to load and configure it, and passes it Services through the constructor.
- **Host → Server**: Host's `MultiplayerService` (a thin Colyseus client wrapper) connects to Server over WebSocket; used by any Game whose Manifest declares multiplayer support. Host also reports RTT back to Server for its metrics.
- **Hand Sword ↔ Server**: Joins a Relay Room (`HandSwordRoom`) — server rebroadcasts `hand_data` and trusts each client's reported score/combo.
- **Tennis ↔ Server**: Joins an Authoritative Room (`TennisRoom`) — server owns ball physics and scoring server-side at 60Hz.
- **Pong ↔ Server**: none (yet) — pong is currently single-player, bot-controlled only; its Manifest declares `multiplayer.supported: false`.
