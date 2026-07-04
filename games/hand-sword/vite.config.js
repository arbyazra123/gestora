import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    federation({
      name: 'handSword',
      filename: 'remoteEntry.js',
      exposes: {
        './Game': './src/index.js'
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
  server: {
    port: 5001,
    strictPort: true,
    cors: true
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        experimentalMinChunkSize: 10000,
        manualChunks(id) {
          if (id.includes('src/audio')) return 'audio';
          if (id.includes('src/scene')) return 'scene';
          if (id.includes('src/game-logic')) return 'game';
          if (id.includes('src/hand-tracking')) return 'tracking';
        }
      }
    }
  },
  optimizeDeps: {
    include: ['three', 'tone']
  }
});
