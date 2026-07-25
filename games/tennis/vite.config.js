import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: isDev ? [
    federation({
      name: 'tennis',
      filename: 'remoteEntry.js',
      exposes: {
        './Game': './src/index.js'
      },
      shared: {
        'three': {
          singleton: true,
          requiredVersion: '^0.185.0'
        }
      }
    })
  ] : [],
  server: {
    port: 5002,
    strictPort: true,
    cors: true
  },
  build: {
    target: 'esnext',
    minify: 'oxc',
    cssCodeSplit: false,
    lib: isDev ? undefined : {
      entry: './src/index.js',
      name: 'TennisGame',
      formats: ['es'],
      fileName: 'game'
    },
    rollupOptions: {
      external: isDev ? [] : ['three', 'tslib'],
      output: isDev ? {
        manualChunks: (id) => {
          if (id.includes('src/scene')) return 'scene';
          if (id.includes('src/physics')) return 'physics';
          if (id.includes('src/game-logic')) return 'game';
          if (id.includes('src/bot')) return 'bot';
        }
      } : {}
    }
  },
  optimizeDeps: {
    include: ['three']
  }
});
