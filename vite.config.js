import firebase from 'firebase/compat/app';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Makes paths relative for better mobile compatibility
  server: {
    port: 3000,
    host: '0.0.0.0', // Allow external access
    cors: true // Enable CORS for mobile access
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: 'index.html',
        registration: 'registration.html',
        admin: 'admin.html',
        lobby: 'lobby.html',
        puzzle1: 'puzzle1.html',
        puzzle2: 'puzzle2.html',
        puzzle3: 'puzzle3.html',
        puzzle4: 'puzzle4.html',
        puzzle5: 'puzzle5.html',
        waiting: 'waiting.html',
        waiting_leaderboard: 'waiting_leaderboard.html',
        thankyou: 'thankyou.html',
        leaderboard: 'leaderboard.html'
      },
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/database']
        }
      }
    },
    copyPublicDir: true,
    chunkSizeWarningLimit: 600
  },
  publicDir: 'public'
});