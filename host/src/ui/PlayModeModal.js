/**
 * Play Mode modal — shown when a multiplayer-capable game's single "▶ Play"
 * button is clicked, letting the player pick how to play: solo, an instant
 * Quick Match, or the existing Room List flow (browse/create/join by code).
 * Non-multiplayer games skip this entirely and launch solo directly (see
 * GameHub.js) — nothing to choose there.
 */

export function openPlayModeModal(gameName) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(result);
    };

    const overlay = document.createElement('div');
    overlay.className = 'play-mode-overlay';
    overlay.innerHTML = `
      <div class="play-mode-modal">
        <div class="play-mode-modal__header">
          <h2>${gameName}</h2>
          <button id="play-mode-close" class="play-mode-close-btn" aria-label="Close">✕</button>
        </div>

        <div class="play-mode-modal__options">
          <button class="play-mode-option" data-choice="offline">
            <span class="play-mode-option__icon">🎮</span>
            <span class="play-mode-option__text">
              <span class="play-mode-option__label">Play Offline</span>
              <span class="play-mode-option__desc">Solo, against the bot</span>
            </span>
          </button>
          <button class="play-mode-option" data-choice="quick">
            <span class="play-mode-option__icon">⚡</span>
            <span class="play-mode-option__text">
              <span class="play-mode-option__label">Quick Match</span>
              <span class="play-mode-option__desc">Instant pairing, no setup</span>
            </span>
          </button>
          <button class="play-mode-option" data-choice="online">
            <span class="play-mode-option__icon">🔑</span>
            <span class="play-mode-option__text">
              <span class="play-mode-option__label">Create / Join Room</span>
              <span class="play-mode-option__desc">Browse rooms, set a password, or join by code</span>
            </span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#play-mode-close').addEventListener('click', () => settle(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) settle(null); // click on the backdrop itself
    });

    overlay.querySelectorAll('.play-mode-option').forEach((btn) => {
      btn.addEventListener('click', () => settle(btn.dataset.choice));
    });
  });
}
