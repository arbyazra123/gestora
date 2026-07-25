# Server

The Colyseus multiplayer server. Hosts Rooms for Games that declare multiplayer support in their Manifest, and is the deployment target for any Game's Authoritative-Room simulation.

## Language

**Tick**:
One iteration of a Room's server-side simulation loop, driven by `setSimulationInterval` at ~60Hz. Only Authoritative Rooms run a Tick loop — Relay Rooms have no simulation of their own.
_Avoid_: Frame, Update loop

**Tick Budget**:
The wall-clock time (~16.6ms, matching 60Hz) a single Tick is expected to complete within.

**Tick Overrun**:
A Tick whose actual duration exceeded its Tick Budget — tracked per Room, the signal that a Room's simulation is falling behind real time.

**Latency Simulation**:
Artificial round-trip delay (`SIMULATE_LATENCY_MS` env var, applied via `gameServer.simulateLatency()`) injected for testing how Rooms behave under degraded network conditions. Used by the e2e network-conditions test matrix — never present in production.
_Avoid_: RTT (RTT is real, measured latency — see `CONTEXT-MAP.md`; Latency Simulation is synthetic and server-only)
