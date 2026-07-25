import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: isDev ? [
    federation({
      name: 'pong',
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
    port: 5003,
    strictPort: true,
    cors: true
  },
  build: {
    target: 'esnext',
    minify: 'oxc',
    cssCodeSplit: false,
    lib: isDev ? undefined : {
      entry: './src/index.js',
      name: 'PongGame',
      formats: ['es'],
      fileName: 'game'
    },
    rollupOptions: {
      external: isDev ? [] : ['three', 'tslib', '@mediapipe/tasks-vision'],
      output: isDev ? {
        manualChunks: (id) => {
          if (id.includes('src/scene')) return 'scene';
          if (id.includes('src/physics')) return 'physics';
          if (id.includes('src/game-logic')) return 'game';
          if (id.includes('src/bot')) return 'bot';
          if (id.includes('src/audio')) return 'audio';
          if (id.includes('src/vision-tracking') || id.includes('@mediapipe/tasks-vision')) return 'vision';
        }
      } : {}
    }
  },
  optimizeDeps: {
    include: ['three', 'tone', '@mediapipe/tasks-vision']
  }
});
