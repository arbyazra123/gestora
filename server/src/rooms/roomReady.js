/**
 * Shared "both clients actually loaded, and actually clicked Ready" gate,
 * used by every Authoritative/Relay room that has a pre-match countdown
 * (HandSwordRoom, TennisRoom, PongRoom).
 *
 * Bug this fixes (found via real production testing, 2026-07-26): the
 * countdown used to start the instant the 2nd client's websocket joined —
 * onJoin() alone triggered it. But a client's websocket connecting happens
 * long before that client's game has actually finished loading assets/WASM/
 * MediaPipe models, which can easily take longer than COUNTDOWN_MS on a
 * slow connection or first load. If the countdown (and worse, the
 * 'countdown'→'playing' transition) elapsed before the joining client had
 * even subscribed to room state, that client's handleMatchStateChange()
 * would never see the 'countdown' status at all — its edge-detection
 * (`state.status === 'countdown' && ...`) only fires on that specific
 * transition, so arriving to find the room already 'playing' silently skips
 * every one-time setup a game does on that edge (hand-sword: setCoopSeed/
 * setCoopSide/beginPlayback — this is what caused "boxes only spawn on one
 * client" and "can't see partner's sword" in co-op; tennis/pong don't have
 * per-client setup gated there, but would still start blind).
 *
 * Fix: each client now sends a `ready` message once its own game has
 * actually finished loading (see each game's index.js), and the countdown
 * only starts once every connected seat has done so — not merely once
 * their socket exists.
 *
 * Second iteration (2026-07-27): `ready` was originally sent automatically
 * the instant a client's own load finished — no real user decision behind
 * it, and no way to back out. Every game now instead surfaces an explicit
 * Ready button the player must click (see each game's ui.js/index.js), and
 * can un-click before the match locks in. Toggling ready state that fast is
 * exactly the kind of thing a real player does (misclick, sees the
 * opponent isn't there yet, changes their mind), so the countdown doesn't
 * fire the instant the last seat flips ready — it waits out READY_DEBOUNCE_MS
 * first, and only actually commits if everyone is still ready once that
 * window elapses. A late unready during the window cancels the pending
 * start outright rather than letting a stale timer fire.
 */

const READY_DEBOUNCE_MS = 1200;

function allPlayersReady(room) {
  if (room.state.players.size !== room.maxClients) return false;
  return [...room.state.players.values()].every((p) => p.ready);
}

export function markReady(room, client, countdownMs) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;
  player.ready = true;
  scheduleCountdownIfAllReady(room, countdownMs);
}

export function markUnready(room, client) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;
  player.ready = false;
  // Whatever the reason they un-readied, a pending start must not still
  // fire behind their back once the debounce window elapses.
  cancelPendingCountdown(room);
}

function scheduleCountdownIfAllReady(room, countdownMs) {
  if (room.state.status !== 'waiting') return;
  if (!allPlayersReady(room)) return;

  cancelPendingCountdown(room);
  room._readyDebounce = room.clock.setTimeout(() => {
    room._readyDebounce = null;
    // Re-check rather than trusting the state from when this was
    // scheduled — a player may have un-readied, left, or the match may
    // have already ended during the debounce window.
    if (room.state.status !== 'waiting') return;
    if (!allPlayersReady(room)) return;

    room.state.status = 'countdown';
    room.state.startAt = Date.now() + countdownMs;
    room.clock.setTimeout(() => {
      room.state.status = 'playing';
    }, countdownMs);
  }, READY_DEBOUNCE_MS);
}

export function cancelPendingCountdown(room) {
  if (room._readyDebounce) {
    room._readyDebounce.clear();
    room._readyDebounce = null;
  }
}
