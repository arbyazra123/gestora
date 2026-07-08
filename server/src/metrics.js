/**
 * Prometheus-format metrics for the Colyseus server, via prom-client — the
 * de facto Node.js standard for exposing custom metrics (Colyseus itself
 * ships no tick-timing/bandwidth/RTT telemetry; @colyseus/monitor is a
 * room/connection inspector only). See docs/network-simulation-metrics.md
 * for what this closes vs. what's still a gap.
 *
 * Exposed at GET /metrics (see index.js) in the standard Prometheus
 * exposition format — this file is the whole "integration": scaling up
 * to a dashboard later is pointing a Prometheus instance at that one
 * endpoint, not re-instrumenting anything here.
 */
import client from 'prom-client';

export const register = new client.Registry();

// Free: event loop lag, heap/RSS memory, CPU, GC pause time, active handles —
// exactly the Node.js-level signals flagged as missing from Colyseus's own
// tooling in the network-simulation report.
client.collectDefaultMetrics({ register });

export const roomsActive = new client.Gauge({
  name: 'colyseus_rooms_active',
  help: 'Number of currently active rooms',
  labelNames: ['room'],
  registers: [register]
});

export const clientsConnected = new client.Gauge({
  name: 'colyseus_clients_connected',
  help: 'Number of currently connected clients',
  labelNames: ['room'],
  registers: [register]
});

// Bucket boundaries centered on the 60Hz (~16.6ms) simulation budget, since
// the metric that matters most is "how often do we blow past it," not the
// exact distribution shape.
export const tickDuration = new client.Histogram({
  name: 'colyseus_room_tick_duration_seconds',
  help: 'Wall-clock duration of each simulation tick',
  labelNames: ['room'],
  buckets: [0.001, 0.005, 0.01, 0.0166, 0.025, 0.05, 0.1, 0.25],
  registers: [register]
});

export const tickOverruns = new client.Counter({
  name: 'colyseus_room_tick_overruns_total',
  help: 'Number of simulation ticks that exceeded their time budget',
  labelNames: ['room'],
  registers: [register]
});

// Fed by each client's own room.ping() (Colyseus's built-in RTT
// measurement), reported back to the server over a generic message — see
// MultiplayerService.js. This is real, per-connection RTT, not simulated.
export const clientRTT = new client.Histogram({
  name: 'colyseus_client_rtt_seconds',
  help: 'Client-reported round-trip time via room.ping()',
  labelNames: ['room'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5],
  registers: [register]
});
