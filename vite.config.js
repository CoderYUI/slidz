import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 600,
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
        leaderboard: '/leaderboard.html'
      },
      output: {
        manualChunks: (id) => {
          // Firebase chunks
          if (id.includes('firebase/app') || 
              id.includes('firebase/firestore') || 
              id.includes('firebase/database')) {
            return 'firebase';
          }
          // Utils chunks
          if (id.includes('timeSync') || 
              id.includes('firebaseConnection') || 
              id.includes('firebase-config')) {
            return 'utils';
          }
          // Puzzle chunks
          if (id.includes('puzzle') && id.endsWith('.js')) {
            return 'puzzle';
          }
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'assets/[name].[hash].css';
          }
          return 'assets/[name].[hash][extname]';
        },
        chunkFileNames: 'assets/[name].[hash].js',
        entryFileNames: 'assets/[name].[hash].js'
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },
  optimizeDeps: {
    include: ['firebase/app', 'firebase/firestore', 'firebase/database'],
    exclude: []
  }
});