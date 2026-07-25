# Client-local coordinate frame, mirrored only at the network boundary

Every client always renders its own paddle/racket in the same "near the camera" local coordinate frame, regardless of whether it's assigned Near Side or Far Side for a given Match — physics, rendering, and hand-tracking code has no notion of "I'm playing from the far side today." Whichever client is assigned Far Side gets its inputs and the opponent's state mirrored at the network send/receive boundary instead.

This is hard to reverse once built this way, since all of physics/rendering/hand-tracking code assumes the single local frame — but it also means adding a third court configuration (e.g. a spectator view) only touches the mirroring code, not gameplay code.
