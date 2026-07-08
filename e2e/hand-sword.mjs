/**
 * Two-browser end-to-end verification of hand-sword's multiplayer flow.
 *
 * Prerequisites:
 *   - npm install (in this e2e/ directory)
 *   - Chrome installed (uses the system "chrome" channel, no bundled
 *     browser download)
 *   - The app's dev servers running: from the repo root,
 *       npm run dev:server & npm run dev:host & npm run dev:hand-sword &
 *
 * Run: npm run test:hand-sword
 * Under a degraded network scenario (see network-conditions.mjs) and/or a
 * larger timeout budget: NETWORK_SCENARIO=poor E2E_TIMEOUT_MS=45000 npm run test:hand-sword
 * (the matrix.mjs orchestrator sets both of these automatically per scenario,
 * including the matching server-side SIMULATE_LATENCY_MS)
 *
 * Drives two independent browser contexts through: joining the hub,
 * launching hand-sword in 1v1 Online mode, both players readying up,
 * the synchronized countdown, live match state (opponent panel), and a
 * mid-match disconnect — asserting each stage renders/behaves correctly
 * without relying on real camera/hand input (fake media stream flags).
 */
import { mkdirSync } from 'fs';
import { chromium } from 'playwright-core';
import { applyNetworkCondition, getScenario } from './network-conditions.mjs';

mkdirSync('screenshots', { recursive: true });

const log = (label, ...args) => console.log(`[${label}]`, ...args);
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS) || 15000;
const SCENARIO = getScenario(process.env.NETWORK_SCENARIO || 'ideal');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
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
  pageA.on('pageerror', (err) => log('A:pageerror', err.message));
  pageB.on('pageerror', (err) => log('B:pageerror', err.message));
  pageA.on('requestfailed', (req) => log('A:requestfailed', req.url(), req.failure()?.errorText));
  pageB.on('requestfailed', (req) => log('B:requestfailed', req.url(), req.failure()?.errorText));
  pageA.on('response', (res) => { if (res.status() >= 400) log('A:http-error', res.status(), res.url()); });
  pageB.on('response', (res) => { if (res.status() >= 400) log('B:http-error', res.status(), res.url()); });

  log('nav', 'loading hub in both windows');
  await pageA.goto('http://localhost:5151');
  await pageB.goto('http://localhost:5151');

  await pageA.waitForSelector('button[data-game-id="hand-sword"][data-mode="multiplayer"]', { timeout: TIMEOUT });
  await pageB.waitForSelector('button[data-game-id="hand-sword"][data-mode="multiplayer"]', { timeout: TIMEOUT });
  log('hub', 'both windows show the 1v1 Online button');

  await pageA.screenshot({ path: 'screenshots/hs-01-hub-A.png' });

  await pageA.click('button[data-game-id="hand-sword"][data-mode="multiplayer"]');
  log('A', 'clicked 1v1 Online');
  await pageA.waitForSelector('#play-btn', { timeout: TIMEOUT });
  await pageA.screenshot({ path: 'screenshots/hs-02-A-loaded.png' });

  await pageB.click('button[data-game-id="hand-sword"][data-mode="multiplayer"]');
  log('B', 'clicked 1v1 Online');
  await pageB.waitForSelector('#play-btn', { timeout: TIMEOUT });

  // Click "Play" (the gesture-bound ready signal) in A first, confirm it shows "Waiting for opponent"
  await pageA.click('#play-btn');
  log('A', 'clicked Play (ready)');
  await pageA.waitForFunction(
    () => document.getElementById('multiplayer-status-text')?.textContent?.includes('Waiting'),
    { timeout: TIMEOUT }
  );
  await pageA.screenshot({ path: 'screenshots/hs-03-A-waiting.png' });
  log('A', 'showing Waiting for opponent — OK');

  // Now B clicks Play too — should trigger both into countdown
  await pageB.click('#play-btn');
  log('B', 'clicked Play (ready)');

  await pageA.waitForFunction(
    () => document.getElementById('multiplayer-status-text')?.textContent?.includes('Starting in'),
    { timeout: TIMEOUT }
  );
  await pageB.waitForFunction(
    () => document.getElementById('multiplayer-status-text')?.textContent?.includes('Starting in'),
    { timeout: TIMEOUT }
  );
  log('both', 'showing synchronized countdown — OK');
  await pageA.screenshot({ path: 'screenshots/hs-04-A-countdown.png' });
  await pageB.screenshot({ path: 'screenshots/hs-04-B-countdown.png' });

  // Wait for countdown to finish (overlay hides once playing starts)
  await pageA.waitForFunction(
    () => document.getElementById('multiplayer-overlay')?.classList.contains('hidden'),
    { timeout: TIMEOUT }
  );
  await pageB.waitForFunction(
    () => document.getElementById('multiplayer-overlay')?.classList.contains('hidden'),
    { timeout: TIMEOUT }
  );
  log('both', 'countdown finished, overlay hidden — match is playing on both');
  await pageA.screenshot({ path: 'screenshots/hs-05-A-playing.png' });
  await pageB.screenshot({ path: 'screenshots/hs-05-B-playing.png' });

  // Confirm the opponent panel elements exist and are visible on both sides
  // (score/combo are live-binding module exports in game-logic.js — not
  // reachable/reassignable from outside that module — so this test verifies
  // the panel wiring rather than faking a specific score value).
  await pageA.waitForSelector('#opponent-panel:not(.hidden)', { timeout: TIMEOUT });
  await pageB.waitForSelector('#opponent-panel:not(.hidden)', { timeout: TIMEOUT });
  log('both', 'opponent panel visible on both sides — OK');

  await new Promise((r) => setTimeout(r, 2000));
  await pageA.screenshot({ path: 'screenshots/hs-06-A-mid-match.png' });
  await pageB.screenshot({ path: 'screenshots/hs-06-B-mid-match.png' });

  // Close A mid-match, confirm B receives an ended/win state without crashing
  await ctxA.close();
  log('A', 'closed context (simulating disconnect)');

  await pageB.waitForFunction(
    () => {
      const t = document.getElementById('multiplayer-status-text')?.textContent || '';
      return t.includes('Win') || t.includes('Ended');
    },
    { timeout: TIMEOUT }
  ).catch(async (e) => {
    const text = await pageB.evaluate(() => document.getElementById('multiplayer-status-text')?.textContent);
    log('B', 'FAILED waiting for ended state, current text:', text);
    throw e;
  });
  await pageB.screenshot({ path: 'screenshots/hs-07-B-ended.png' });
  log('B', 'received match-ended state after A disconnected — OK, no crash');

  await ctxB.close();
  await browser.close();
  log('done', 'all checks passed');
})().catch((err) => {
  console.error('E2E TEST FAILED:', err);
  process.exit(1);
});
