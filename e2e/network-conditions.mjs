/**
 * Named network scenarios spanning "ideal" to "poor" — each pairs a
 * server-side round-trip latency (server/src/index.js's SIMULATE_LATENCY_MS,
 * via Colyseus's own Server.simulateLatency()) with a matching browser-side
 * CDP throttle (Chrome DevTools Protocol's Network.emulateNetworkConditions,
 * which affects WebSocket traffic too, not just HTTP).
 *
 * These two layers model different things and are deliberately combined:
 * simulateLatency delays message *processing* on the server (stresses the
 * game's own reconciliation/interpolation logic), while CDP throttling
 * delays/limits the actual socket (stresses real transport behavior —
 * bursty delivery, slow asset loading, etc). Real bad connections exhibit
 * both at once.
 *
 * Bandwidth values are intentionally less extreme than literal real-world
 * 3G to keep automated runs in a reasonable amount of time (heavy MediaPipe
 * WASM assets over a truly throttled 3G profile can take a minute-plus per
 * asset) — the point is exercising degraded-but-plausible conditions, not
 * reproducing an exact carrier spec.
 */

function mbps(n) {
  return (n * 1024 * 1024) / 8;
}

function kbps(n) {
  return (n * 1024) / 8;
}

export const SCENARIOS = {
  ideal: {
    label: 'Ideal (LAN-like, no throttling)',
    serverLatencyMs: 0,
    cdp: null,
    timeoutMs: 15000
  },
  good: {
    label: 'Good home wifi',
    serverLatencyMs: 20,
    cdp: { latency: 30, downloadThroughput: mbps(10), uploadThroughput: mbps(5) },
    timeoutMs: 20000
  },
  mobile: {
    label: 'Typical 4G/LTE',
    serverLatencyMs: 100,
    cdp: { latency: 150, downloadThroughput: mbps(4), uploadThroughput: mbps(2) },
    timeoutMs: 30000
  },
  poor: {
    label: 'Poor/congested connection',
    serverLatencyMs: 300,
    cdp: { latency: 400, downloadThroughput: mbps(1), uploadThroughput: kbps(500) },
    // Generous on purpose: at 1Mbps, just downloading MediaPipe's ~2MB+ of
    // WASM/model assets (streamed from a CDN, not bundled — see README)
    // measurably eats into this before any multiplayer networking even
    // starts, independent of anything this project's sync code does.
    timeoutMs: 90000
  }
};

/**
 * Apply a scenario's CDP throttle to a page (no-op for scenarios with no
 * `cdp` config, e.g. 'ideal'). Chromium-only — matches this project's e2e
 * scripts, which already launch with { channel: 'chrome' }.
 */
export async function applyNetworkCondition(page, scenario) {
  if (!scenario?.cdp) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...scenario.cdp });
}

export function getScenario(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) {
    throw new Error(`Unknown network scenario "${name}" — valid: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  return scenario;
}
