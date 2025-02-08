export const CONFIG = {
    MAX_PLAYERS: 50,
    TIME_LIMIT: 5 * 60 * 1000, // 5 minutes
    PUZZLE_COUNT: 5,
    ADMIN_PASSWORD: 'your-admin-password', // Change this in production
    FIREBASE_COLLECTIONS: {
        PLAYERS: 'players',
        LEADERBOARD: 'leaderboard'
    },
    REALTIME_PATHS: {
        LOBBY: 'lobby',
        GAME_STATE: 'gameState',
        LEADERBOARD: 'leaderboard'
    }
};
