# Guaranteed net clearance overrides honest physics

Every hit and serve is back-solved to guarantee it clears the net, rather than letting real projectile physics decide — a fast, flat-ish hit can otherwise arrive at the net well before a physically "honest" arc would have lifted it high enough. This applies identically to serves and Smashes.

This is an arcade-fairness override chosen deliberately over physical accuracy: a "correct" simulation would let players net the ball on fast flat shots, which read as unfair given the game's control scheme rather than as a skill expression. Worth stating explicitly since a reader modifying `physics.js` could reasonably "fix" this back toward realism without realizing it was intentional.
