# Host

The platform shell. Loads Games dynamically via Module Federation and provides the shared Services every Game depends on. See [ADR-0002](../docs/adr/0002-mediapipe-single-active-detector-type.md) for the hard constraint behind several terms below. See [docs/dashboard-design.md](./docs/dashboard-design.md) for the Games/Rooms dashboard's UI design.

## Language

**Detector**:
A MediaPipe tracking pipeline instance for one modality (`hands`, `face`, `faceMesh`). Created once and never closed/recreated for the life of the page. Only the Detector(s) belonging to the current sole subscriber Game are active and receive camera frames each tick.
_Avoid_: Tracker, Pipeline

**Tracking Type**:
The `manifest.tracking.type` a Game declares (`hands` / `face` / `tasksVision`), selecting which Detector(s) it needs. A `tasksVision` Game runs its own MediaPipe Tasks Vision pipeline independently of the shared Detector system, but still registers itself so the platform's one-type-per-session guard accounts for it.

**Camera Preview**:
The shared, toggleable webcam overlay. Show/hide is a user preference persisted across game switches, not per-game state.

**Preloaded Game**:
A Game whose Manifest has been fetched and remote entry hinted (`<link rel="modulepreload">`) ahead of the player actually launching it, to shorten the visible load time.

**Pending Game**:
A gameId (and Launch Mode) stashed by the host right before a forced full-page reload, so the platform can auto-relaunch the same Game once the reload completes. Exists because switching Tracking Type requires a reload.

**Games Registry**:
The static `games-registry.json` listing available Games for the hub UI, deployed independently of the host bundle so the catalog can update without a host rebuild.

**Hand Data (compressed)**:
The reduced wire format broadcast during a Match: 4 landmarks only (wrist, middle, index, pinky) as `[x,y,z]` tuples, throttled to 20fps — distinct from the full landmark set tracked locally at 60fps.

**Launch Mode**:
Whether a Game is started Solo or Online (`launchOptions.multiplayer`), threaded from the hub's play button through to the Game. Not to be confused with `MultiplayerService`, the Service that Online mode uses.
