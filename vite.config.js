import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
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
      }
    }
  }
});