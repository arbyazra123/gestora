# Pong

A single-player arcade Game against a Bot: move your paddle with your head, trigger Abilities with hand gestures. See [ADR-0002](../../docs/adr/0002-mediapipe-single-active-detector-type.md) for why Pong runs its own tracking pipeline instead of the platform's shared one.

Pong's `services.mediaPipe` and `services.multiplayer` are injected per the standard Services contract but unused — Pong runs Vision-tracking independently and currently has no multiplayer support.

## Language

**Vision-tracking**:
Pong's own low-level tracking pipeline: loads MediaPipe Tasks Vision (`HandLandmarker` + `FaceLandmarker` sharing one WASM runtime) and dispatches raw per-frame results to Head-tracking and Gesture-tracking. Runs independently of the platform's shared Detector system.

**Head-tracking**:
Consumes Vision-tracking's face results (nose-tip x position) to move the paddle. Controls movement only.

**Gesture-tracking**:
Consumes Vision-tracking's hand results to produce Finger Count / Gesture Pattern events. Drives Ability activation only, never movement.

**Finger Count**:
The number of extended fingers (0–5) read per frame from Gesture-tracking. A debounced ("registered," held ≥400ms) version feeds Gesture Pattern matching; the raw live value is shown to the player separately.

**Gesture Pattern**:
A specific, ordered, consecutive run of Finger Counts (e.g. `[5,4,3]`) that activates an Ability once completed. Deliberately consecutive: an intermediate count during the transition (e.g. 4, between 5 and 3) is treated as an intended step, not noise to filter out.

**Ability**:
One of exactly three special moves — Paddle Boost, Slow-Mo, Shield — always available, each on its own cooldown, each triggered by its own Gesture Pattern.

**Paddle Boost**:
Ability that widens the paddle and speeds up its movement for a duration.

**Slow-Mo**:
Ability that slows ball simulation time — not the whole game loop — for a duration.

**Shield**:
Ability that converts one would-be Miss into a deflect-and-continue save instead of ending the point. Consumed on use.

**Current Server**:
Pong awards the next serve to whoever won the last point — the inverse of the more common "loser serves" convention. Stated explicitly here since it's easy to assume the opposite.

**Miss**:
The ball crossing a side's back line, ending the point — unless a Shield is active.

**Bot Difficulty**:
Preset pairs of bot paddle speed and accuracy (easy/medium/hard); accuracy drives randomized targeting error, not reaction time.
