# Multiplayer Networking Architecture — Research Report

Research question: for real-time multiplayer browser games with contested/shared physics state (e.g. two players hitting the same ball, like Pong or Tennis), what is the proven, industry-standard networking architecture — and does it require WebRTC/WebTransport/UDP-style transport, or is a plain WebSocket (TCP) transport sufficient when paired with an authoritative server?

This cross-validates claims from an initial reference article ([Colyseus/PixiJS-based cooperative herding game](https://arnauld-alex.com/guiding-the-flock-building-a-realtime-multiplayer-game-architecture-in-typescript)) against independent sources via a fanned-out research pass (21 sources fetched, 92 claims extracted, 25 adversarially verified with a 3-vote consensus process). The run was cut short by a session limit right before the final synthesis step and 2 of 25 claim-verifications — this report is the manual synthesis of the 18 confirmed claims that survived verification.

## Verdict summary

| Claim | Verdict |
|---|---|
| A — authoritative server + prediction + reconciliation + interpolation is the canonical pattern | **CONFIRMED**, independently of the Colyseus article |
| B — is plain WebSocket sufficient, or does contested physics require unreliable/unordered transport | **MIXED** — real documented cost, but not a hard requirement |
| C — WebSocket/TCP failure modes (HOL blocking) | **CONFIRMED mechanism**, magnitude-in-practice unverified (gap) |
| D — credible sources recommending WebTransport specifically for this reason | **CONFIRMED**, at browser-vendor level (Chrome, MDN) |
| E — concrete shipped web-based examples | **WEAK** — only one verified data point |

---

## A) Authoritative server + prediction + reconciliation + interpolation — confirmed as the canonical pattern

This is the strongest result. **Gabriel Gambetta's "Fast-Paced Multiplayer" series** — independently, not tied to the Colyseus article — lays out the identical three-part architecture, each piece confirmed with a direct quote at 3-0 consensus:

- Foundational rule: *"don't trust the player. Always assume the worst"* — server is sole authority ([client-server-game-architecture.html](https://www.gabrielgambetta.com/client-server-game-architecture.html))
- Client-side prediction: client simulates its own input locally immediately, without waiting on the network round-trip ([client-side-prediction-server-reconciliation.html](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html))
- **Reconciliation mechanism, concretely**: client tags each input with a sequence number; the server's authoritative update includes the last sequence number it processed; the client replays any un-acknowledged inputs on top of that authoritative state to rebuild its predicted position. This is more precise than what the Colyseus article described.
- Entity interpolation: needed because low-frequency broadcasts (~100ms) would otherwise look choppy; the fix is to render remote entities on a ~100ms delay, interpolating between the last two snapshots ([entity-interpolation.html](https://www.gabrielgambetta.com/entity-interpolation.html))
- One passage explicitly ties all three together as "authoritative server ... validating all state changes ... while using client-side prediction to mask network latency for the local player" — the same pattern, described independently.

Independently again, a [Microsoft/MSDN Game Development piece](https://learn.microsoft.com/en-us/archive/msdn-magazine/2017/october/game-development-multiplayer-networked-physics-for-web-game-development) (2017) confirms the same core shape (authoritative server, clients forward inputs, clients predict locally) outside the Gambetta/Colyseus lineage. So: this is not one blogger's idiosyncratic take — it's the field's standard answer, corroborated by two unrelated lineages.

## B) Does contested physics actually require unreliable/unordered transport?

This is genuinely nuanced, not a clean yes/no.

**In favor of unreliable transport mattering:**
- TCP head-of-line blocking is real and documented at the protocol level: a lost packet holds *all* subsequent already-arrived data in the receive buffer until retransmission completes, producing jitter (confirmed 3-0, source: [*High Performance Browser Networking*](https://hpbn.co/building-blocks-of-tcp/), a well-regarded primary reference).
- That same source explicitly recommends UDP-style transport for latency/jitter-sensitive, loss-tolerant applications — exactly what real-time game state is.
- WebTransport was *purpose-built* to solve this: the [W3C explainer](https://github.com/w3c/webtransport/blob/main/explainer.md) states WebSockets-over-TCP cause "a single lost packet delays all subsequent data," making them "inadequate for latency-sensitive applications" (confirmed 3-0).

**Against it being a hard requirement:**
- **[Lance.gg](https://github.com/lance-gg/lance)**, a real production-oriented JS multiplayer game engine that implements exactly this pattern (authoritative server, prediction, reconciliation), ships today on plain WebSocket/TCP — with WebRTC/UDP support listed only as a *future, planned* feature, not something required to ship (confirmed 2-1). That's direct evidence a serious framework considers WebSocket "good enough" for v1.
- The entire point of prediction + reconciliation + interpolation (confirmed in A) is to absorb exactly this kind of latency/jitter — the technique was invented because transports aren't perfect, which is why it works acceptably even over TCP.

**Read:** unreliable transport is the *technically cleaner* fit and removes a real, documented cost — but it is an optimization on top of a working WebSocket architecture, not a prerequisite for one.

## C) WebSocket/TCP failure modes — confirmed mechanism, unconfirmed magnitude

The HOL-blocking mechanism itself is solidly confirmed (twice, 3-0) from a primary source. What could **not** be confirmed in this pass: how often this actually bites in practice on typical consumer connections. One promising claim (a production game reporting "still felt smooth at 150ms latency over TCP") was found but **failed adversarial verification** (0-3) — the source didn't actually support it as stated, so it's dropped rather than passed along as an unverified number. This is a genuine gap; closing it would need a follow-up pass specifically targeting packet-loss-rate-vs-perceived-lag data (Gaffer On Games' articles were surfaced but ran out of verification budget before being checked).

## D) Credible sources recommending WebTransport specifically for contested state

Confirmed at the highest credibility tier available — browser vendor documentation, not a blog:
- **[Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/webtransport)** docs name *"sending game state at a regular interval with minimal latency ... in small, unreliable, out-of-order messages"* as a canonical WebTransport use case (2-1).
- **[MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API)** is even more specific: *"you might want to transmit regular game state updates where each message supersedes the last one that arrives, and order is not important"* (3-0) — this describes ball-position ticks almost exactly.

Condition for when it applies: state where **staleness matters more than completeness** — i.e., you only care about the latest position, not every intermediate one. That's true for ball position, not necessarily true for scoring/hit events (which need reliable delivery — so a real implementation would mix WebTransport datagrams for position with a reliable stream/WebSocket for events).

## E) Production examples — weakest part of the findings

Only one claim survived verification here: **Lance.gg ships production multiplayer games on WebSocket**, treating UDP as a roadmap item. A more specific example — a Rocket-League-style shared-ball-physics web game running on Lance.gg over WebSocket — was found in an MSDN article but its specific claims **failed adversarial verification** (0-3 twice), so it's not passed along as confirmed. A dedicated "building an online Pong game with WebSockets" tutorial was also found and fetched but didn't make the final verified set before the session limit hit. Net: there's no rock-solid example of a shipped, contested-ball-physics web game to point to here — this would be the best target for a follow-up research pass.

---

## Bottom line for motion-platform

The research supports the direction already discussed: **WebSocket + authoritative server + client-side prediction/reconciliation + interpolation buffer** is a well-established, independently-corroborated pattern (not just one article's opinion), and it's realistic to ship pong/tennis's contested ball physics on it. WebTransport's unreliable datagrams are a legitimate, vendor-recommended upgrade specifically for supersede-able state like ball position — worth keeping on the roadmap, but not something needed before shipping v1, especially given this repo currently has zero backend infrastructure and Safari's WebTransport support only became Baseline in March 2026.

## Sources

21 fetched, quality-rated by the research pass:

| Source | Quality |
|---|---|
| [gabrielgambetta.com/client-server-game-architecture.html](https://www.gabrielgambetta.com/client-server-game-architecture.html) | blog (primary reference) |
| [gabrielgambetta.com/client-side-prediction-server-reconciliation.html](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html) | blog (primary reference) |
| [gabrielgambetta.com/entity-interpolation.html](https://www.gabrielgambetta.com/entity-interpolation.html) | blog (primary reference) |
| [gabrielgambetta.com](https://www.gabrielgambetta.com/) | blog |
| [github.com/QXSoftware/Game-Networking-Resources](https://github.com/QXSoftware/Game-Networking-Resources) | secondary |
| [gabrielgambetta.com/client-side-prediction-live-demo.html](https://www.gabrielgambetta.com/client-side-prediction-live-demo.html) | blog |
| [diogodanielsoaresferreira.github.io/websockets](https://diogodanielsoaresferreira.github.io/websockets/) | blog |
| [blog.brkho.com — Dive into client/server web games + WebRTC](https://blog.brkho.com/2017/03/15/dive-into-client-server-web-games-webrtc/) | blog |
| [gafferongames.com/post/udp_vs_tcp](https://gafferongames.com/post/udp_vs_tcp/) | blog |
| [gafferongames.com — why can't I send UDP from a browser](https://www.gafferongames.com/post/why_cant_i_send_udp_packets_from_a_browser/) | blog |
| [developers.rune.ai — WebRTC vs WebSockets for multiplayer games](https://developers.rune.ai/blog/webrtc-vs-websockets-for-multiplayer-games) | blog |
| [vroble.com — Beyond WebSockets](https://www.vroble.com/2025/11/beyond-websockets-mastering.html) | blog |
| [gamedev.net forum thread](https://gamedev.net/forums/topic/700489-using-concurrent-tcpwebsockets-to-mitigate-head-of-line-blocking/) | unreliable |
| [hpbn.co — High Performance Browser Networking](https://hpbn.co/building-blocks-of-tcp/) | primary |
| [developer.chrome.com — How to use WebTransport](https://developer.chrome.com/docs/capabilities/web-apis/webtransport) | primary |
| [developer.mozilla.org — WebTransport API](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API) | secondary |
| [websocket.org — WebTransport comparison](https://websocket.org/comparisons/webtransport/) | blog |
| [github.com/w3c/webtransport explainer](https://github.com/w3c/webtransport/blob/main/explainer.md) | primary |
| [github.com/lance-gg/lance](https://github.com/lance-gg/lance) | primary |
| [learn.microsoft.com — MSDN Magazine, multiplayer networked physics](https://learn.microsoft.com/en-us/archive/msdn-magazine/2017/october/game-development-multiplayer-networked-physics-for-web-game-development) | secondary (claims partially refuted) |
| [news.ycombinator.com discussion](https://news.ycombinator.com/item?id=18519432) | forum |
