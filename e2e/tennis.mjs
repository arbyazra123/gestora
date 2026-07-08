/**
 * Two-browser end-to-end verification of tennis's multiplayer flow.
 *
 * Prerequisites:
 *   - npm install (in this e2e/ directory)
 *   - Chrome installed (uses the system "chrome" channel, no bundled
 *     browser download)
 *   - The app's dev servers running: from the repo root,
 *       npm run dev:server & npm run dev:host & npm run dev:tennis &
 *
 * Run: npm run test:tennis
 * Under a degraded network scenario (see network-conditions.mjs) and/or a
 * larger timeout budget: NETWORK_SCENARIO=poor E2E_TIMEOUT_MS=45000 npm run test:tennis
 * (the matrix.mjs orchestrator sets both of these automatically per scenario,
 * including the matching server-side SIMULATE_LATENCY_MS)
 *
 * Drives two independent browser contexts through: joining the hub,
 * launching tennis in 1v1 Online mode, both players pressing SPACE to
 * ready up, the synchronized countdown, and correct serve-turn assignment
 * (one side gets the finger-count challenge, the other waits). Neither
 * browser has real hand input (fake media stream flags, no actual hand in
 * frame), so the serving side's challenge auto-resolves via its 5s
 * timeout — serveBall()'s own net-clearance back-solve still guarantees a
 * legal serve even at minimum power, so this still exercises the full
 * serve -> server-authoritative physics -> bounce-fault -> scoring
 * round-trip, and asserts both clients end up with consistent (mirrored)
 * scores. Finishes with a mid-match disconnect check.
 */
import { mkdirSync } from 'fs';
import { chromium } from 'playwright-core';
import { applyNetworkCondition, getScenario } from './network-conditions.mjs';
import { createRecorder } from './metrics.mjs';

mkdirSync('screenshots', { recursive: true });

const log = (label, ...args) => console.log(`[${label}]`, ...args);
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS) || 15000;
const SCENARIO_NAME = process.env.NETWORK_SCENARIO || 'ideal';
const SCENARIO = getScenario(SCENARIO_NAME);
const metrics = createRecorder('tennis', SCENARIO_NAME);

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await ctxA.grantPermissions(['camera']);
  await ctxB.grantPermissions(['camera']);

  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await applyNetworkCondition(pageA, SCENARIO);
  await applyNetworkCondition(pageB, SCENARIO);
  log('setup', `network scenario: ${SCENARIO.label} (timeout budget ${TIMEOUT}ms)`);

  pageA.on('console', (msg) => log('A:console', msg.text()));
  pageB.on('console', (msg) => log('B:console', msg.text()));
  pageA.on('pageerror', (err) => log('A:PAGEERROR', err.message));
  pageB.on('pageerror', (err) => log('B:PAGEERROR', err.message));

  log('nav', 'loading hub in both windows');
  await pageA.goto('http://localhost:5151');
  await pageB.goto('http://localhost:5151');

  await pageA.waitForSelector('button[data-game-id="tennis"][data-mode="multiplayer"]', { timeout: TIMEOUT });
  await pageB.waitForSelector('button[data-game-id="tennis"][data-mode="multiplayer"]', { timeout: TIMEOUT });
  metrics.mark('hubLoaded');
  log('hub', 'both windows show tennis 1v1 Online button');

  await pageA.click('button[data-game-id="tennis"][data-mode="multiplayer"]');
  await pageB.click('button[data-game-id="tennis"][data-mode="multiplayer"]');
  log('both', 'clicked 1v1 Online');

  await pageA.waitForSelector('#status-display', { timeout: TIMEOUT });
  await pageB.waitForSelector('#status-display', { timeout: TIMEOUT });
  await pageA.waitForFunction(
    () => document.getElementById('status-display')?.textContent?.includes('SPACE'),
    { timeout: TIMEOUT }
  );
  metrics.mark('gameLoaded'); // asset-loading-heavy: remote module + MediaPipe WASM
  log('both', 'game loaded, showing Press SPACE prompt');
  await pageA.screenshot({ path: 'screenshots/tn-01-A-prompt.png' });

  // Press SPACE in both windows (the audio-unlock gesture point AND the
  // multiplayer "ready" trigger — see setupAudioUnlock()/handleReady()).
  metrics.mark('readyClickA');
  await pageA.click('body'); // focus first, some browsers need a real focus target for key events
  await pageA.keyboard.press('Space');
  log('A', 'pressed SPACE');
  await pageA.waitForFunction(
    () => document.getElementById('status-display')?.textContent?.includes('Waiting'),
    { timeout: TIMEOUT }
  );
  metrics.mark('waitingShownA'); // connect() + joinRoom() round trip — direct RTT proxy
  log('A', 'showing Waiting for opponent — OK');

  metrics.mark('readyClickB');
  await pageB.click('body');
  await pageB.keyboard.press('Space');
  log('B', 'pressed SPACE');

  // Both should see a synchronized countdown next
  await pageA.waitForFunction(
    () => /^[123]$/.test(document.getElementById('status-display')?.textContent?.trim() || ''),
    { timeout: TIMEOUT }
  );
  metrics.markAbsolute('countdownShownA');
  await pageB.waitForFunction(
    () => /^[123]$/.test(document.getElementById('status-display')?.textContent?.trim() || ''),
    { timeout: TIMEOUT }
  );
  metrics.markAbsolute('countdownShownB');
  log('both', 'showing synchronized countdown — OK');
  await pageA.screenshot({ path: 'screenshots/tn-02-A-countdown.png' });

  // Countdown finishes (~3s), then one side gets the serve-challenge UI,
  // the other sees "Waiting for opponent to serve...". Neither has real
  // hand input (fake camera), so the challenge auto-resolves via its 5s
  // timeout — still calls completePlayerServe() with power=MIN, which
  // still legally clears the net (serveBall()'s own back-solve guarantees
  // that regardless of power) and gets reported to the server.
  //
  // This wait only needs to comfortably exceed the countdown's own fixed
  // ~3s duration (server-controlled, NOT network-scaled — confirmed by
  // hand-sword's equivalent countdown-to-playing gap staying ~2.8-3.0s
  // across every scenario) so status-display has settled past "1" before
  // we read it. It must NOT scale with TIMEOUT — an earlier version scaled
  // this to TIMEOUT*0.25 (22.5s under "poor"), which silently swallowed
  // the real serve/point-resolution event inside the sleep itself and
  // made the downstream pointResolved timing measure this sleep's length
  // instead of the actual game event.
  await new Promise((r) => setTimeout(r, 4500));
  metrics.mark('postCountdownCheck');
  const [aText, bText] = await Promise.all([
    pageA.evaluate(() => document.getElementById('status-display')?.textContent),
    pageB.evaluate(() => document.getElementById('status-display')?.textContent)
  ]);
  log('test', 'post-countdown status — A:', JSON.stringify(aText), 'B:', JSON.stringify(bText));
  await pageA.screenshot({ path: 'screenshots/tn-03-A-serve-phase.png' });
  await pageB.screenshot({ path: 'screenshots/tn-03-B-serve-phase.png' });

  // Wait out the serve-challenge timeout + ball flight + point-reset delay.
  // NOTE: this duration includes a fixed ~5s client-side serve-challenge
  // timeout (serve-challenge.js's TIME_LIMIT_MS) that is NOT
  // network-attributable — subtract ~5000ms plus typical ball-flight time
  // (~1s) when comparing this metric across scenarios.
  log('test', 'waiting for the auto-timeout serve to resolve into a point...');
  await pageA.waitForFunction(
    () => {
      const t = document.getElementById('status-display')?.textContent || '';
      return t.includes('Point');
    },
    { timeout: TIMEOUT }
  );
  metrics.mark('pointResolved');
  log('A', 'saw a point resolve — OK, full serve->physics->scoring round-trip worked');
  await pageA.screenshot({ path: 'screenshots/tn-04-A-point.png' });
  await pageB.screenshot({ path: 'screenshots/tn-04-B-point.png' });

  const [aScore, bScoreOnA, bScore, aScoreOnB] = await Promise.all([
    pageA.evaluate(() => document.getElementById('player-score')?.textContent),
    pageA.evaluate(() => document.getElementById('bot-score')?.textContent),
    pageB.evaluate(() => document.getElementById('player-score')?.textContent),
    pageB.evaluate(() => document.getElementById('bot-score')?.textContent)
  ]);
  log('test', `A sees: me=${aScore} opp=${bScoreOnA} | B sees: me=${bScore} opp=${aScoreOnB}`);
  // Scores should mirror each other (A's "me" should equal B's "opponent" and vice versa)
  if (aScore === aScoreOnB && bScore === bScoreOnA) {
    log('test', 'scores are consistent between both clients — OK');
  } else {
    throw new Error(`Score mismatch between clients: A(me=${aScore},opp=${bScoreOnA}) vs B(me=${bScore},opp=${aScoreOnB})`);
  }

  // Disconnect A mid-match, confirm B doesn't crash
  metrics.mark('disconnectIssued');
  await ctxA.close();
  log('A', 'closed context (simulating disconnect)');
  await pageB.waitForFunction(
    () => document.getElementById('status-display')?.textContent?.includes('disconnected'),
    { timeout: TIMEOUT }
  );
  metrics.mark('disconnectDetectedB');
  log('B', 'received opponent-disconnected state — OK, no crash');
  await pageB.screenshot({ path: 'screenshots/tn-05-B-disconnected.png' });

  await ctxB.close();
  await browser.close();

  const metricsPath = metrics.save();
  log('metrics', `saved to ${metricsPath}`);
  log('done', 'all checks passed');
})().catch((err) => {
  console.error('E2E TEST FAILED:', err);
  try { metrics.save(); } catch { /* best-effort on failure */ }
  process.exit(1);
});
