import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';
import path from 'path';

export default defineConfig({
  plugins: [
    federation({
      name: 'host',
      remotes: {
        // Games will be loaded dynamically via GameManager
        // No static remotes needed for now
      },
      shared: {
        'three': {
          singleton: true,
          requiredVersion: '^0.185.0'
        },
        'tone': {
          singleton: true,
          requiredVersion: '^15.1.0'
        }
      }
    })
  ],
  resolve: {
    alias: {
      '@games': path.resolve(__dirname, '../games')
    }
  },
  server: {
    port: 5151,
    strictPort: true,
    cors: true,
    host: true,
    // Vite validates the incoming Host header against this list regardless
    // of server.host — needed for any domain proxied in front of the dev
    // server (e.g. a Cloudflare tunnel), not just direct localhost access.
    allowedHosts: ['game.orpheus.my.id'],
    fs: {
      strict: false,
      // Allow serving files from parent directory (for games)
      allow: ['..']
    }
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console in production for now
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'three-vendor': ['three'],
          'tone-vendor': ['tone'],
          'core-services': [
            './src/core/MediaPipeService.js',
            './src/core/CameraService.js',
            './src/core/MultiplayerService.js',
            './src/core/GameManager.js'
          ]
        }
      }
    },
    chunkSizeWarningLimit: 500
  },
  optimizeDeps: {
    include: ['three', 'tone']
  }
});
