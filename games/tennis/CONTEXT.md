# Tennis

A table-tennis Game against a Bot or a remote opponent, controlled by hand-tracked paddle movement. The ruleset is a deliberate hybrid — table-tennis paddles and one-bounce-fault rule, lawn-tennis-style Point labels (`0/15/30/40/AD`) and Set structure — not a straight simulation of either real sport. See the ADRs in [`docs/adr/`](./docs/adr/) for the multiplayer networking model and the physics fairness override.

## Language

**Set** *(the code still calls this "Game" — `playerGames`/`botGames`/`gameStatus: 'game-over'` — renamed here to avoid colliding with the platform-level Game term)*:
A scoring unit won by reaching 4 Points with a 2-point margin. First to 2 Sets wins the Match.
_Avoid_: Game (reserved for the platform-level loadable-module term)

**Point**:
The basic scoring increment within a Set, labeled `0/15/30/40/AD` in the lawn-tennis style rather than table tennis's 11-point scoring.

**Near Side / Far Side** *(the code still spells these `player`/`bot` internally — `role`, `lastHitBy`, `bot-court`/`player-court` bounce labels)*:
Which court half (z<0 / z>0) a participant occupies — the role a joining client is assigned. In multiplayer, both sides are always human.
_Avoid_: player, bot (as court-side identifiers — see Bot below for the one case where "bot" means something else)

**Bot**:
The AI opponent controlling the Far Side in solo (non-multiplayer) mode. A different concept from the Far Side label itself, which in multiplayer is occupied by a real second player — UI dynamically relabels "BOT" → "OPPONENT" in multiplayer to avoid exactly this confusion.

**Rally**:
The sequence of alternating hits after a serve; increments once per successful racket-ball collision.

**Serve Challenge**:
The gesture mini-game that replaces a button-press serve: the player must show 3 random Finger Counts in sequence within 5 seconds, each held steady for 350ms to confirm. Never blocks the serve outright — it only scales Serve Power.

**Serve Power**:
Serve strength, scaled linearly by how many of the 3 Serve Challenge digits were confirmed before timeout.

**Bounce Fault**:
Umbrella term for the three illegal-bounce outcomes: the ball goes out, bounces back on the hitter's own side, or bounces twice on the same side without an intervening return. Any Bounce Fault ends the Rally and awards the Point.

**Swing Gesture**:
Holding a 1/2/3-finger shape arms a hit direction (left/center/right); center doubles as the dedicated lob/lift gesture.

**Smash**:
A held open-hand (5-finger) gesture that overrides normal swing physics with a flat, high-power, low-arc power shot.

**Spin**:
Magnus-effect lateral/vertical curve applied to the ball after a bounce, derived from racket velocity at contact. Serves always carry fixed topspin.

**Bot Difficulty**:
Governs the Bot's reaction time, accuracy, and hit-detection range. A solo-mode-only concept — has no meaning once the Far Side is a real player.
