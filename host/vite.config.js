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
    minify: 'oxc',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks for shared libraries
          if (id.includes('node_modules/three')) {
            return 'three-vendor';
          }
          if (id.includes('node_modules/tone')) {
            return 'tone-vendor';
          }
          // Core services chunk
          if (id.includes('/src/core/')) {
            return 'core-services';
          }
        }
      }
    },
    chunkSizeWarningLimit: 500
  },
  optimizeDeps: {
    include: ['three', 'tone']
  }
});
