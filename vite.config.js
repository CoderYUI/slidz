import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        main: '/index.html',
        script: '/script.js',
        admin: '/admin.html',
        registration: '/registration.html',
        lobby: '/lobby.html',
        puzzle1: '/puzzle1.html',
        puzzle2: '/puzzle2.html',
        puzzle3: '/puzzle3.html',
        puzzle4: '/puzzle4.html',
        puzzle5: '/puzzle5.html',
        waiting: '/waiting.html',
        waiting_leaderboard: '/waiting_leaderboard.html',
        thankyou: '/thankyou.html',
        leaderboard: '/leaderboard.html',
        timeSync: '/timeSync.js',
        firebaseConfig: '/firebase-config.js',
        firebaseConnection: '/firebaseConnection.js'
      },
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'assets/[name].[hash].css';
          }
          return 'assets/[name].[hash][extname]';
        },
        chunkFileNames: 'assets/[name].[hash].js',
        entryFileNames: 'assets/[name].[hash].js',
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/database'],
          vendors: ['qrcodejs']
        }
      }
    },
    manifest: true,
    assetsInlineLimit: 4096,
    minify: true,
    sourcemap: false
  },
  optimizeDeps: {
    include: ['firebase/app', 'firebase/firestore', 'firebase/database']
  }
});