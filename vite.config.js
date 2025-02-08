import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: true, // Change to true to generate separate CSS files
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: '/index.html',
        admin: '/admin.html',
        leaderboard: '/leaderboard.html',
        lobby: '/lobby.html',
        puzzle1: '/puzzle1.html',
        puzzle2: '/puzzle2.html',
        puzzle3: '/puzzle3.html',
        puzzle4: '/puzzle4.html',
        puzzle5: '/puzzle5.html',
        registration: '/registration.html',
        thankyou: '/thankyou.html',
        waiting_leaderboard: '/waiting_leaderboard.html',
        waiting: '/waiting.html',
        // Add CSS entries explicitly
        styles: '/styles.css',
        adminStyles: '/admin-styles.css',
        leaderboardStyles: '/leaderboard.css',
        lobbyStyles: '/lobby-styles.css',
        registrationStyles: '/registration.css',
        thankyouStyles: '/thankyou.css',
        waitingStyles: '/waiting.css',
        waitingLeaderboardStyles: '/waiting_leaderboard.css'
      },
      output: {
        manualChunks: (id) => {
          // Firebase related chunks
          if (id.includes('firebase')) {
            return 'firebase';
          }

          // CSS chunks
          if (id.includes('.css')) {
            if (id.includes('admin-styles')) return 'admin-styles';
            if (id.includes('leaderboard')) return 'leaderboard-styles';
            if (id.includes('lobby-styles')) return 'lobby-styles';
            if (id.includes('registration')) return 'registration-styles';
            if (id.includes('thankyou')) return 'thankyou-styles';
            if (id.includes('waiting')) return 'waiting-styles';
            return 'styles';
          }

          // JS chunks
          if (id.includes('admin.js')) return 'admin';
          if (id.includes('leaderboard.js')) return 'leaderboard';
          if (id.includes('lobby.js')) return 'lobby';
          if (id.includes('registration.js')) return 'registration';
          if (id.includes('thankyou.js')) return 'thankyou';
          if (id.includes('waiting')) return 'waiting';
          if (id.includes('timeSync.js')) return 'utils';
          if (id.includes('firebase')) return 'firebase-utils';
        },
        assetFileNames: ({name}) => {
          // Put CSS files in a dedicated directory
          if (/\.css$/.test(name)) {
            return 'assets/css/[name].[hash][extname]';
          }
          // Handle other assets
          if (/\.(gif|jpe?g|png|svg)$/.test(name)) {
            return 'assets/images/[name].[hash][extname]';
          }
          return 'assets/[name].[hash][extname]';
        },
        chunkFileNames: 'assets/js/[name].[hash].js',
        entryFileNames: 'assets/js/[name].[hash].js'
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
    include: [
      'firebase/app',
      'firebase/firestore',
      'firebase/database'
    ]
  },
  css: {
    modules: false,
    devSourcemap: true,
    // Ensure CSS is processed
    postcss: {},
    // Generate separate CSS files
    extract: true
  }
});