import { db, realtimeDb } from './firebase-config.js';
import { ref, onValue, get } from 'firebase/database';
import { collection, getDocs } from 'firebase/firestore';

class LeaderboardManager {
    constructor() {
        this.playerId = sessionStorage.getItem('playerId');
        this.playerName = sessionStorage.getItem('playerName');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.init();

        // Add timer for auto redirect
        setTimeout(() => {
            window.location.replace('/thankyou.html');
        }, 60000); // 1 minute in milliseconds

        this.setupResetListener();
    }

    setupResetListener() {
        const resetRef = ref(realtimeDb, 'systemState/reset');
        onValue(resetRef, (snapshot) => {
            const resetData = snapshot.val();
            if (resetData?.action === 'reset') {
                if (resetData.fullClean) {
                    this.clearAllLocalData();
                }
                window.location.replace('/thankyou.html');
            }
        });
    }

    clearAllLocalData() {
        sessionStorage.clear();
        localStorage.clear();
        document.cookie.split(";").forEach(cookie => {
            document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    }

    async init() {
        try {
            const completions = await this.getCompletions();
            const puzzleStates = await this.getPuzzleStates();
            const players = this.processPlayerData(completions, puzzleStates);
            const rankedPlayers = this.rankPlayers(players);
            
            this.displayPersonalResult(rankedPlayers);
            this.displayLeaderboard(rankedPlayers);
            this.hideLoading();
        } catch (error) {
            console.error('Error initializing leaderboard:', error);
            this.showError('Failed to load leaderboard');
        }
    }

    async getCompletions() {
        const completionsSnapshot = await getDocs(collection(db, 'completions'));
        const completions = {};
        completionsSnapshot.forEach(doc => {
            completions[doc.id] = { ...doc.data(), id: doc.id };
        });
        return completions;
    }

    async getPuzzleStates() {
        const puzzleStatesRef = ref(realtimeDb, 'puzzleStates');
        const snapshot = await get(puzzleStatesRef);
        return snapshot.val() || {};
    }

    calculateAccuracy(player) {
        if (player.status === 'completed') return 100;

        const correctTiles = player.tiles ? player.tiles.filter((tile, index) => 
            tile === index + 1
        ).length : 0;

        // Calculate accuracy based on correct tiles and moves
        const tileAccuracy = (correctTiles / 11) * 100;
        const moveEfficiency = Math.max(0, 100 - (player.moves / 50) * 100); // Penalize for excessive moves
        return Math.round((tileAccuracy + moveEfficiency) / 2);
    }

    processPlayerData(completions, puzzleStates) {
        const players = [];

        // Process completed players first
        Object.values(completions).forEach(completion => {
            const player = {
                id: completion.id,
                name: completion.name,
                status: completion.status,
                time: completion.time,
                moves: completion.moves,
                points: completion.status === 'completed' ? 10 : 0,
                accuracy: 100 // Completed players have 100% accuracy
            };

            if (completion.status === 'timeout') {
                const puzzleState = puzzleStates[completion.id];
                if (puzzleState) {
                    player.accuracy = this.calculateAccuracy(puzzleState);
                    player.tiles = puzzleState.tiles;
                }
            }

            players.push(player);
        });

        return players;
    }

    rankPlayers(players) {
        // Separate completed and timeout players
        const completed = players.filter(p => p.status === 'completed');
        const timeout = players.filter(p => p.status === 'timeout');

        // Sort completed players by time, then moves
        const rankedCompleted = completed.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return a.moves - b.moves;
        });

        // Sort timeout players by correct tiles, then accuracy
        const rankedTimeout = timeout.sort((a, b) => {
            const aTiles = this.getCorrectTileCount(a);
            const bTiles = this.getCorrectTileCount(b);
            
            if (aTiles !== bTiles) return bTiles - aTiles;
            
            const aAccuracy = this.calculateAccuracy(a);
            const bAccuracy = this.calculateAccuracy(b);
            return bAccuracy - aAccuracy;
        });

        // Combine the arrays with completed players first
        return [...rankedCompleted, ...rankedTimeout];
    }

    getCorrectTileCount(player) {
        return player.tiles ? player.tiles.filter((tile, index) => 
            tile === index + 1
        ).length : 0;
    }

    displayLeaderboard(rankedPlayers) {
        const leaderboardBody = document.getElementById('leaderboardBody');
        const playerRankDisplay = document.getElementById('playerRank');
        
        const playerRank = rankedPlayers.findIndex(p => p.id === this.playerId) + 1;
        playerRankDisplay.textContent = playerRank || '-';
        
        leaderboardBody.innerHTML = rankedPlayers.map((player, index) => {
            const isCurrentPlayer = player.id === this.playerId;
            const accuracy = this.calculateAccuracy(player);
            const correctTiles = player.status === 'timeout' ? this.getCorrectTileCount(player) : 11;
            const rank = index + 1;

            return `
                <tr class="${isCurrentPlayer ? 'current-player' : ''}">
                    <td><strong>${rank}</strong></td>
                    <td>${player.name}</td>
                    <td>${player.status === 'completed' ? this.formatTime(player.time) : `Timeout (${correctTiles}/11 tiles)`}</td>
                    <td>${player.moves}</td>
                    <td>${accuracy}%</td>
                    <td>${player.points}</td>
                </tr>
            `;
        }).join('');

        // Start progress bar animation
        const progressFill = document.querySelector('.progress-fill');
        if (progressFill) {
            progressFill.style.animation = 'progressAnimation 60s linear forwards';
        }
    }

    displayPersonalResult(rankedPlayers) {
        const playerRank = rankedPlayers.findIndex(p => p.id === this.playerId) + 1;
        const player = rankedPlayers.find(p => p.id === this.playerId);
        
        if (!player) return;

        const personalResult = document.getElementById('personalResult');
        if (!personalResult) return;

        const resultMessage = this.getResultMessage(playerRank, player, rankedPlayers.length);
        const performance = player.status === 'completed' ? 
            `Time: ${this.formatTime(player.time)}` : 
            `Progress: ${Math.round(player.accuracy)}%`;

        personalResult.innerHTML = `
            <div class="result-card ${player.status}">
                <h2>${resultMessage}</h2>
                <div class="result-details">
                    <p>Your Rank: ${playerRank} of ${rankedPlayers.length}</p>
                    <p>${performance}</p>
                    <p>Moves: ${player.moves}</p>
                    <p>Points: ${player.points}</p>
                </div>
            </div>
        `;
    }

    getResultMessage(rank, player, totalPlayers) {
        if (player.status !== 'completed') {
            return "Time's Up! Keep practicing!";
        }

        if (rank === 1) return "🏆 Congratulations! You're the Winner!";
        if (rank === 2) return "🥈 Amazing! Second Place!";
        if (rank === 3) return "🥉 Great Job! Third Place!";
        if (rank <= Math.ceil(totalPlayers * 0.25)) return "🌟 Excellent! Top 25%!";
        if (rank <= Math.ceil(totalPlayers * 0.5)) return "👏 Well Done! Top 50%!";
        return "Thanks for participating!";
    }

    getRankEmoji(rank) {
        switch(rank) {
            case 1: return '🏆';
            case 2: return '🥈';
            case 3: return '🥉';
            case 4: return '✨';
            case 5: return '⭐';
            default: return '👏';
        }
    }

    formatTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(1);
        return `${minutes}:${seconds.padStart(4, '0')}`;
    }

    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = 'none';
        }
    }

    showError(message) {
        this.hideLoading();
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.innerHTML = `<div class="error-message">${message}</div>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LeaderboardManager();
});
