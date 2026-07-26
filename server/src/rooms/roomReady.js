/**
 * Shared "both clients actually loaded" gate, used by every Authoritative/
 * Relay room that has a pre-match countdown (HandSwordRoom, TennisRoom,
 * PongRoom).
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
 */

export function markReady(room, client, countdownMs) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;
  player.ready = true;
  tryStartCountdown(room, countdownMs);
}

export function tryStartCountdown(room, countdownMs) {
  if (room.state.status !== 'waiting') return;
  if (room.state.players.size !== room.maxClients) return;

  const allReady = [...room.state.players.values()].every((p) => p.ready);
  if (!allReady) return;

  room.state.status = 'countdown';
  room.state.startAt = Date.now() + countdownMs;
  room.clock.setTimeout(() => {
    room.state.status = 'playing';
  }, countdownMs);
}
