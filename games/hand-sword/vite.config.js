import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: isDev ? [
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
  ] : [],
  server: {
    port: 5001,
    strictPort: true,
    cors: true
  },
  build: {
    target: 'esnext',
    minify: 'oxc',
    cssCodeSplit: false,
    lib: isDev ? undefined : {
      entry: './src/index.js',
      name: 'HandSwordGame',
      formats: ['es'],
      fileName: 'game'
    },
    rollupOptions: {
      external: isDev ? [] : ['three', 'tone', 'tslib', 'standardized-audio-context'],
      output: isDev ? {
        manualChunks: (id) => {
          if (id.includes('src/audio')) return 'audio';
          if (id.includes('src/scene')) return 'scene';
          if (id.includes('src/game-logic')) return 'game';
          if (id.includes('src/hand-tracking')) return 'tracking';
        }
      } : {}
    }
  },
  optimizeDeps: {
    include: ['three', 'tone']
  }
});
