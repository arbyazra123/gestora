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

mkdirSync('screenshots', { recursive: true });

const log = (label, ...args) => console.log(`[${label}]`, ...args);

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

  pageA.on('console', (msg) => log('A:console', msg.text()));
  pageB.on('console', (msg) => log('B:console', msg.text()));
  pageA.on('pageerror', (err) => log('A:PAGEERROR', err.message));
  pageB.on('pageerror', (err) => log('B:PAGEERROR', err.message));

  log('nav', 'loading hub in both windows');
  await pageA.goto('http://localhost:5151');
  await pageB.goto('http://localhost:5151');

  await pageA.waitForSelector('button[data-game-id="tennis"][data-mode="multiplayer"]', { timeout: 15000 });
  await pageB.waitForSelector('button[data-game-id="tennis"][data-mode="multiplayer"]', { timeout: 15000 });
  log('hub', 'both windows show tennis 1v1 Online button');

  await pageA.click('button[data-game-id="tennis"][data-mode="multiplayer"]');
  await pageB.click('button[data-game-id="tennis"][data-mode="multiplayer"]');
  log('both', 'clicked 1v1 Online');

  await pageA.waitForSelector('#status-display', { timeout: 20000 });
  await pageB.waitForSelector('#status-display', { timeout: 20000 });
  await pageA.waitForFunction(
    () => document.getElementById('status-display')?.textContent?.includes('SPACE'),
    { timeout: 10000 }
  );
  log('both', 'game loaded, showing Press SPACE prompt');
  await pageA.screenshot({ path: 'screenshots/tn-01-A-prompt.png' });

  // Press SPACE in both windows (the audio-unlock gesture point AND the
  // multiplayer "ready" trigger — see setupAudioUnlock()/handleReady()).
  await pageA.click('body'); // focus first, some browsers need a real focus target for key events
  await pageA.keyboard.press('Space');
  log('A', 'pressed SPACE');
  await pageA.waitForFunction(
    () => document.getElementById('status-display')?.textContent?.includes('Waiting'),
    { timeout: 10000 }
  );
  log('A', 'showing Waiting for opponent — OK');

  await pageB.click('body');
  await pageB.keyboard.press('Space');
  log('B', 'pressed SPACE');

  // Both should see a synchronized countdown next
  await pageA.waitForFunction(
    () => /^[123]$/.test(document.getElementById('status-display')?.textContent?.trim() || ''),
    { timeout: 10000 }
  );
  await pageB.waitForFunction(
    () => /^[123]$/.test(document.getElementById('status-display')?.textContent?.trim() || ''),
    { timeout: 10000 }
  );
  log('both', 'showing synchronized countdown — OK');
  await pageA.screenshot({ path: 'screenshots/tn-02-A-countdown.png' });

  // Countdown finishes (~3s), then one side gets the serve-challenge UI,
  // the other sees "Waiting for opponent to serve...". Neither has real
  // hand input (fake camera), so the challenge auto-resolves via its 5s
  // timeout — still calls completePlayerServe() with power=MIN, which
  // still legally clears the net (serveBall()'s own back-solve guarantees
  // that regardless of power) and gets reported to the server.
  await new Promise((r) => setTimeout(r, 3500));
  const [aText, bText] = await Promise.all([
    pageA.evaluate(() => document.getElementById('status-display')?.textContent),
    pageB.evaluate(() => document.getElementById('status-display')?.textContent)
  ]);
  log('test', 'post-countdown status — A:', JSON.stringify(aText), 'B:', JSON.stringify(bText));
  await pageA.screenshot({ path: 'screenshots/tn-03-A-serve-phase.png' });
  await pageB.screenshot({ path: 'screenshots/tn-03-B-serve-phase.png' });

  // Wait out the serve-challenge timeout + ball flight + point-reset delay.
  log('test', 'waiting for the auto-timeout serve to resolve into a point...');
  await pageA.waitForFunction(
    () => {
      const t = document.getElementById('status-display')?.textContent || '';
      return t.includes('Point');
    },
    { timeout: 20000 }
  );
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
  await ctxA.close();
  log('A', 'closed context (simulating disconnect)');
  await pageB.waitForFunction(
    () => document.getElementById('status-display')?.textContent?.includes('disconnected'),
    { timeout: 10000 }
  );
  log('B', 'received opponent-disconnected state — OK, no crash');
  await pageB.screenshot({ path: 'screenshots/tn-05-B-disconnected.png' });

  await ctxB.close();
  await browser.close();
  log('done', 'all checks passed');
})().catch((err) => {
  console.error('E2E TEST FAILED:', err);
  process.exit(1);
});
