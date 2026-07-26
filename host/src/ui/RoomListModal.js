/**
 * Room List modal — the "Play Online" entry point for every multiplayer
 * game (replaces the old instant anonymous auto-pair flow). Lets a player
 * browse open rooms for one game, create a new one (optionally password-
 * protected), or join directly by room id ("code").
 *
 * Deliberately never creates a room itself for ANY game — "Create Room"
 * here only resolves with the chosen password/name; the actual
 * multiplayerService.createRoom() call happens in the game itself (see
 * each game's index.js), since hand-sword has its own pre-match settings
 * (song/mode) to fold in first, and it keeps this modal identical across
 * all three games rather than special-casing one of them here. Joining an
 * existing room, on the other hand, needs no game-specific settings, so it
 * happens directly from here — by the time this modal resolves with
 * `{ mode: 'joined' }`, multiplayerService.room is already set.
 */
import { multiplayerService } from '../core/MultiplayerService.js';

/**
 * @param {string} gameId
 * @param {string} gameName
 * @returns {Promise<null | { mode: 'joined' } | { mode: 'create', roomOptions: { password: string|null, name: string|null } }>}
 */
export function openRoomListModal(gameId, gameName) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(result);
    };

    const overlay = document.createElement('div');
    overlay.className = 'room-list-overlay';
    overlay.innerHTML = `
      <div class="room-list-modal">
        <div class="room-list-modal__header">
          <h2>${gameName} — Play Online</h2>
          <span id="room-list-online-summary" class="room-list-online-summary"></span>
          <button id="room-list-close" class="room-list-close-btn" aria-label="Close">✕</button>
        </div>

        <div class="room-list-modal__section">
          <div class="room-list-modal__section-title">
            Open Rooms
            <button id="room-list-refresh" class="room-list-refresh-btn" title="Refresh">⟳</button>
          </div>
          <div id="room-list-rooms" class="room-list-rooms">
            <p class="room-list-status">Loading...</p>
          </div>
        </div>

        <div class="room-list-modal__section">
          <div class="room-list-modal__section-title">Create Room</div>
          <div class="room-list-create-row">
            <input id="room-list-create-name" class="room-list-input" type="text" placeholder="Room name (optional)" maxlength="40">
            <input id="room-list-create-password" class="room-list-input" type="text" placeholder="Password (optional)" maxlength="40">
            <button id="room-list-create-btn" class="room-list-action-btn">Create</button>
          </div>
        </div>

        <div class="room-list-modal__section">
          <div class="room-list-modal__section-title">Join by Code</div>
          <div class="room-list-create-row">
            <input id="room-list-code" class="room-list-input" type="text" placeholder="Room code" maxlength="20">
            <input id="room-list-code-password" class="room-list-input" type="text" placeholder="Password (if needed)" maxlength="40">
            <button id="room-list-code-btn" class="room-list-action-btn">Join</button>
          </div>
          <p id="room-list-code-error" class="room-list-error hidden"></p>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const roomsEl = overlay.querySelector('#room-list-rooms');
    const onlineSummaryEl = overlay.querySelector('#room-list-online-summary');
    const codeErrorEl = overlay.querySelector('#room-list-code-error');

    overlay.querySelector('#room-list-close').addEventListener('click', () => settle(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) settle(null); // click on the backdrop itself
    });

    overlay.querySelector('#room-list-refresh').addEventListener('click', () => refreshRooms());

    overlay.querySelector('#room-list-create-btn').addEventListener('click', () => {
      const name = overlay.querySelector('#room-list-create-name').value.trim() || null;
      const password = overlay.querySelector('#room-list-create-password').value.trim() || null;
      settle({ mode: 'create', roomOptions: { name, password } });
    });

    overlay.querySelector('#room-list-code-btn').addEventListener('click', () => {
      const roomId = overlay.querySelector('#room-list-code').value.trim();
      const password = overlay.querySelector('#room-list-code-password').value.trim() || undefined;
      if (!roomId) return;
      attemptJoin(roomId, password, codeErrorEl);
    });

    async function attemptJoin(roomId, password, errorEl) {
      errorEl.classList.add('hidden');
      try {
        await multiplayerService.joinRoomById(roomId, { password });
        settle({ mode: 'joined' });
      } catch (error) {
        console.error('[RoomList] Failed to join room:', error);
        errorEl.textContent = error?.message || 'Failed to join room';
        errorEl.classList.remove('hidden');
      }
    }

    function renderRooms(rooms) {
      if (!rooms.length) {
        roomsEl.innerHTML = '<p class="room-list-status">No open rooms — be the first to create one!</p>';
        return;
      }

      roomsEl.innerHTML = rooms.map((room, i) => `
        <div class="room-list-row" data-room-id="${room.roomId}">
          <div class="room-list-row__info">
            <span class="room-list-row__name">${room.hasPassword ? '🔒 ' : ''}${room.name || 'Quick Match'}</span>
            <span class="room-list-row__count">${room.clients}/${room.maxClients} players</span>
          </div>
          ${room.hasPassword ? `
            <input class="room-list-input room-list-row__password" type="text" placeholder="Password" data-room-index="${i}">
          ` : ''}
          <button class="room-list-action-btn room-list-row__join-btn" data-room-index="${i}">Join</button>
          <p class="room-list-error hidden" data-room-error="${i}"></p>
        </div>
      `).join('');

      roomsEl.querySelectorAll('.room-list-row__join-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const room = rooms[Number(btn.dataset.roomIndex)];
          const passwordInput = roomsEl.querySelector(`.room-list-row__password[data-room-index="${btn.dataset.roomIndex}"]`);
          const errorEl = roomsEl.querySelector(`[data-room-error="${btn.dataset.roomIndex}"]`);
          const password = passwordInput ? passwordInput.value.trim() || undefined : undefined;
          attemptJoin(room.roomId, password, errorEl);
        });
      });
    }

    async function refreshRooms() {
      roomsEl.innerHTML = '<p class="room-list-status">Loading...</p>';
      try {
        const rooms = await multiplayerService.listRooms(gameId);
        renderRooms(rooms);
      } catch (error) {
        console.error('[RoomList] Failed to list rooms:', error);
        roomsEl.innerHTML = `
          <p class="room-list-status room-list-status--error">
            Couldn't reach the multiplayer server. You can still try joining by code below,
            or create a new room once it's back.
          </p>
        `;
      }
    }

    async function loadOnlineSummary() {
      try {
        const { totalPlayers, totalRooms } = await multiplayerService.getOnlineSummary();
        onlineSummaryEl.textContent = `🟢 ${totalPlayers} online · ${totalRooms} open room${totalRooms === 1 ? '' : 's'}`;
      } catch {
        onlineSummaryEl.textContent = ''; // silent — matches "okay if users don't have connection"
      }
    }

    refreshRooms();
    loadOnlineSummary();
  });
}
