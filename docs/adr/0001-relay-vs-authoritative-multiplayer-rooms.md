# Relay Rooms vs Authoritative Rooms for multiplayer

Multiplayer Rooms fall into two categories depending on whether contested state needs a single, fair source of truth. `HandSwordRoom` is a Relay Room: it rebroadcasts `hand_data` to the opponent and trusts each client's self-reported `score`/`combo`, since combo scoring is a personal rhythm-accuracy metric with nothing to contest between players. `TennisRoom` is an Authoritative Room: it owns ball position, spin, and scoring server-side (`server/src/physics/tennisPhysics.js`, `tennisRules.js`), ticking at 60Hz, because the ball is a single shared object both players' inputs affect and a client-authoritative model would let either player fabricate hits or evade points.

New multiplayer games should decide explicitly which model fits — Relay for independent, self-reported player state; Authoritative for shared, contested state — rather than defaulting to whichever Room happens to be closest at hand.
