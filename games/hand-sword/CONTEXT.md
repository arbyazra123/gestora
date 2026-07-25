# Hand Sword

A rhythm/combat Game: slice Boxes to the beat with hand-tracked Swords. See [ADR-0001](./docs/adr/0001-track-owns-tempo-riff-performed-by-hits.md) for why tempo and Difficulty are both fixed properties of the Theme rather than independently controllable.

The client-side multiplayer state machine (`idle → connecting → waiting → countdown → playing → ended`) is a superset of the platform's canonical Match lifecycle — `idle`/`connecting` cover the pre-Room-join phase; `waiting → countdown → playing → ended` map directly onto Match once a Room is joined.

## Language

**Box**:
A cube spawned in time with the beat that must be sliced with a Sword before it passes the hit plane. Hitting it is a Hit (scores, extends Combo); letting it pass is a Miss (breaks Combo).
_Avoid_: Target, Note

**Sword**:
A hand-tracked weapon — right hand is cyan, left is magenta. Its `blade` is the collidable mesh; its `hilt` is the pivot mapped from the wrist landmark.

**Combo**:
A consecutive-Hit streak. Resets to 0 on any Miss. Drives both the score multiplier and Combo Level.

**Combo Level**:
One of five escalating visual-intensity tiers (thresholds at 5/10/20/30 combo), capped at "ULTIMATE MODE." Purely cosmetic — doesn't affect scoring or difficulty.

**Accuracy Meter**:
A rolling gauge computing accuracy from the last 20 Hit/Miss actions. Not a depleting health/fail-state system, despite being labeled "health meter" in code and UI.
_Avoid_: Health (implies depletion/game-over semantics this doesn't have)

**Mode (1-Hand / 2-Hand)**:
Whether the game requires only the right Sword (Boxes spawn near center, easier) or both hands (Boxes spawn left/right).

**Difficulty**:
A fixed property of each Theme (`easy` / `medium` / `hard`), not a separately player-chosen setting — controls Box spawn density only, not tempo.

**Theme**:
A music preset bundling BPM, chord progression, bass line, drum pattern, and instrument timbres. Some Themes are Riffed Tracks.
_Avoid_: Track (as a standalone term — use Theme)

**Riffed Track**:
A Theme (one of three real-song-inspired covers) where Box spawning follows a 16-step melodic Riff Shape instead of plain drum-driven spawning, so hitting Boxes performs the song's actual riff.

**Arrival Beats**:
The fixed number of beats (one measure) a Box takes to travel from spawn to the hit plane — keeps spawn-to-hit timing musically locked regardless of a Theme's BPM.

**Ghost Hand**:
Cosmetic-only rendering of the opponent's hand during a Match, driven by the compressed Hand Data broadcast — not used for hit detection.
