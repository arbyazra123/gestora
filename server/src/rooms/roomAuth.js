/**
 * Shared room-list/password support, used by every room type (HandSwordRoom,
 * TennisRoom, PongRoom) instead of each re-implementing the same thing.
 *
 * Design (settled with the user, 2026-07-26): passworded rooms still show up
 * in the browsable room list — /rooms/:gameId in server/src/index.js queries
 * matchMaker with no password-based filtering at all — they're just gated at
 * JOIN time via onAuth() below. This is deliberately NOT the same as
 * Colyseus's own room.setPrivate(), which hides a room from listing/
 * matchmaking entirely; that's a different, stronger privacy level the user
 * explicitly chose not to use here.
 */
import { ServerError } from 'colyseus';

/**
 * Call from onCreate(options). Stores the room's own password (never sent
 * to clients) and publishes only a boolean + optional display name via
 * Colyseus room metadata, which IS visible to every client's room-list query.
 */
export function setupLobbyMetadata(room, options = {}) {
  room._password = options.password || null;
  room.setMetadata({
    name: options.name || null,
    hasPassword: !!room._password
  });
}

/**
 * Call from onAuth(client, options). Throws (rejecting the join, surfaced to
 * the joining client's join()/joinById() promise) if the room has a password
 * and the supplied one doesn't match. Rooms with no password never gate here.
 */
export function checkRoomPassword(room, options = {}) {
  if (room._password && options.password !== room._password) {
    throw new ServerError(403, 'Incorrect password');
  }
  return true;
}
