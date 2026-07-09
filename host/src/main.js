/**
 * Motion Platform Host - Main Entry
 * Initializes the game platform and hub UI
 */

import { GameHub } from './ui/GameHub.js';
import { mediaPipeService } from './core/MediaPipeService.js';
import { cameraService } from './core/CameraService.js';

console.log('🎮 Motion Platform - Starting...');

// Initialize the platform
async function initPlatform() {
  try {
    // Create and initialize game hub
    const container = document.getElementById('app');
    const gameHub = new GameHub(container);
    await gameHub.init();

    console.log('✅ Platform initialized');
    console.log('📊 Performance tracking enabled');
    console.log('🎮 Ready to load games');

  } catch (error) {
    console.error('❌ Platform initialization failed:', error);
    document.getElementById('app').innerHTML = `
      <div class="platform-error">
        <div>
          <h1>⚠️ Platform Error</h1>
          <p>${error.message}</p>
          <button class="platform-error__reload-btn" onclick="location.reload()">Reload</button>
        </div>
      </div>
    `;
  }
}

// Start platform when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlatform);
} else {
  initPlatform();
}

// Performance monitoring
if (import.meta.env.DEV) {
  // Log FPS in dev mode
  setInterval(() => {
    const fps = mediaPipeService.getFPS();
    if (fps > 0) {
      console.log(`[Performance] MediaPipe FPS: ${fps}`);
    }
  }, 5000);
}

// Hot module replacement
if (import.meta.hot) {
  import.meta.hot.accept();
}
