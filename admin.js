import { db, realtimeDb } from './firebase-config.js';
import { firebaseConnection } from './firebaseConnection.js';

// Your existing code...
import { collection, getDocs, doc, setDoc, query, onSnapshot, writeBatch, getDoc } from 'firebase/firestore';
import { ref, onValue, set, get } from 'firebase/database';

class AdminPanel {
    constructor() {
        this.intervals = [];
        this.listeners = [];
        this.setupEventListeners();
        this.setupAllRealtimeListeners();
        this.setupRegistrationControls();
        this.listenToRegistrationState();
        this.getCurrentPuzzle();
        this.restoreAdminState();
        this.setupConnectionMonitoring();
        this.retryAttempts = 3; // Number of retry attempts for operations
        this.lastKnownLeaderboardId = sessionStorage.getItem('lastLeaderboardId');
        this.restorePlayerNames();
    }

    async restoreAdminState() {
        try {
            const gameStateRef = ref(realtimeDb, 'gameState');
            const gameSnapshot = await get(gameStateRef);
            const gameState = gameSnapshot.val();

            // Get lobby data first
            const lobbyRef = ref(realtimeDb, 'lobby');
            const lobbySnapshot = await get(lobbyRef);
            const lobbyData = lobbySnapshot.val() || {};

            // Store lobby data
            this.lobbyPlayers = lobbyData;

            if (gameState?.started) {
                const completionsSnapshot = await getDocs(collection(db, 'completions'));
                const finishedCount = completionsSnapshot.docs.length;

                if (gameState.totalPlayers) {
                    this.totalPlayers = gameState.totalPlayers;
                    this.updateCompletionStatus(finishedCount, gameState.totalPlayers);

                    // Always check if all players have finished and enable button accordingly
                    const publishButton = document.getElementById('publishLeaderboard');
                    if (publishButton) {
                        if (finishedCount >= gameState.totalPlayers) {
                            publishButton.disabled = false;
                            publishButton.classList.add('ready');
                        } else {
                            publishButton.disabled = true;
                            publishButton.classList.remove('ready');
                        }
                    }

                    await this.showCurrentLeaderboard();
                }

                this.listenForCompletions(gameState.totalPlayers);
            }

            // Update player list with stored lobby data
            this.updateAllStatuses();
        } catch (error) {
            console.error('Error restoring admin state:', error);
        }
    }

    async restorePlayerNames() {
        try {
            // First try to get from realtime database
            const playerNamesRef = ref(realtimeDb, 'playerNames');
            const snapshot = await get(playerNamesRef);
            if (snapshot.exists()) {
                this.playerNames = snapshot.val();
                return;
            }

            // Fallback to session storage
            const savedNames = sessionStorage.getItem('playerNames');
            if (savedNames) {
                this.playerNames = JSON.parse(savedNames);
            }
        } catch (error) {
            console.error('Error restoring player names:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('startEvent').addEventListener('click', () => this.startEvent());
        document.getElementById('resetEvent').addEventListener('click', () => this.resetEvent());
    }

    setupAllRealtimeListeners() {
        // Store all unsubscribe functions
        this.unsubscribers = [];

        // Initialize state containers
        this.firestoreCompletions = {};
        this.lobbyPlayers = {};
        this.activePlayers = {};

        // Listen to Firebase Realtime Database
        this.setupRealtimeDatabaseListeners();
        
        // Listen to Firestore
        this.setupFirestoreListeners();
    }

    setupFirestoreListeners() {
        // Listen to Firestore completions
        const completionsUnsubscribe = onSnapshot(
            collection(db, 'completions'),
            (snapshot) => {
                this.firestoreCompletions = {};
                snapshot.forEach(doc => {
                    this.firestoreCompletions[doc.id] = doc.data();
                });
                this.updateAllStatuses();
            },
            (error) => {
                console.error('Firestore completions listener error:', error);
            }
        );

        this.unsubscribers.push(completionsUnsubscribe);
    }

    setupRealtimeDatabaseListeners() {
        // Listen for lobby changes
        const lobbyRef = ref(realtimeDb, 'lobby');
        const lobbyUnsubscribe = onValue(lobbyRef, (snapshot) => {
            this.lobbyPlayers = snapshot.val() || {};
            this.lastKnownPlayers = this.lobbyPlayers; // Store for reference
            this.updateAllStatuses();
        });

        // Listen for puzzle states
        const puzzleStatesRef = ref(realtimeDb, 'puzzleStates');
        const puzzleStatesUnsubscribe = onValue(puzzleStatesRef, (snapshot) => {
            this.activePlayers = snapshot.val() || {};
            this.updateAllStatuses();
        });

        this.unsubscribers.push(lobbyUnsubscribe, puzzleStatesUnsubscribe);
    }

    updateAllStatuses() {
        // First get all player names from our stored data
        const allPlayers = new Map();
        
        // Add stored player names first
        if (this.playerNames) {
            Object.entries(this.playerNames).forEach(([id, name]) => {
                allPlayers.set(id, { name, status: 'unknown' });
            });
        }

        // Update with lobby data
        Object.entries(this.lobbyPlayers || {}).forEach(([id, player]) => {
            if (allPlayers.has(id)) {
                allPlayers.get(id).status = 'inlobby';
            } else {
                allPlayers.set(id, {
                    name: player.name,
                    status: 'inlobby'
                });
            }
        });

        // Update with active players
        Object.entries(this.activePlayers || {}).forEach(([id, player]) => {
            if (allPlayers.has(id)) {
                allPlayers.get(id).status = 'playing';
            } else {
                allPlayers.set(id, {
                    name: player.name || this.playerNames?.[id] || 'Unknown',
                    status: 'playing'
                });
            }
        });

        // Update with Firestore completions
        Object.entries(this.firestoreCompletions || {}).forEach(([id, data]) => {
            if (allPlayers.has(id)) {
                const player = allPlayers.get(id);
                player.status = data.status;
                player.time = data.time;
                player.moves = data.moves;
                player.timeoutProgress = data.timeoutProgress;
            }
        });

        // Update the UI with combined data
        this.updatePlayerListUI(Array.from(allPlayers.entries()));
    }

    updatePlayerListUI(players) {
        const playerList = document.getElementById('playerList');
        const playerCount = document.getElementById('connectedCount');
        
        playerList.innerHTML = '';
        playerCount.textContent = players.length;

        players.forEach(([id, player]) => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-entry';
            
            const statusClass = this.getStatusClass(player.status);
            const statusText = this.getStatusText(player.status);

            let details = '';
            if (player.status === 'completed') {
                details = `<div class="player-details">
                    Time: ${this.formatTime(player.time)}, 
                    Moves: ${player.moves}
                </div>`;
            }

            playerElement.innerHTML = `
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    <span class="player-status ${statusClass}">${statusText}</span>
                </div>
                ${details}
            `;
            
            playerList.appendChild(playerElement);
        });
    }

    // Remove listenToGameState method as we don't need timer updates

    setupRegistrationControls() {
        const toggleRegistrationBtn = document.getElementById('toggleRegistration');
        toggleRegistrationBtn.addEventListener('click', () => this.toggleRegistration());
        
        // Get initial state
        this.updateRegistrationStatus();
    }

    async toggleRegistration() {
        const toggleBtn = document.getElementById('toggleRegistration');
        
        try {
            // Disable button during operation
            toggleBtn.disabled = true;
            
            const registrationRef = ref(realtimeDb, 'systemState/registration');
            const snapshot = await get(registrationRef);
            const currentState = snapshot.val();
            
            // Determine new state
            const newState = {
                isOpen: !(currentState?.isOpen ?? true),
                lastUpdated: Date.now()
            };

            // Update Firebase
            await set(registrationRef, newState);
            
            // Update UI immediately
            this.updateRegistrationStatus(newState);
            
        } catch (error) {
            console.error('Error toggling registration:', error);
            alert('Failed to toggle registration state');
            // Re-enable button on error
            toggleBtn.disabled = false;
        }
    }

    listenToRegistrationState() {
        const registrationRef = ref(realtimeDb, 'systemState/registration');
        onValue(registrationRef, (snapshot) => {
            const state = snapshot.val();
            this.updateRegistrationStatus(state);
        });
    }

    updateRegistrationStatus(state) {
        const toggleBtn = document.getElementById('toggleRegistration');
        const statusIndicator = document.getElementById('registrationStatus');
        
        // Enable button and ensure it's not disabled
        toggleBtn.disabled = false;
        
        // Set default state if none exists
        if (!state) {
            state = { isOpen: true };
        }

        // Reset classes and add new ones
        toggleBtn.className = 'admin-button';
        statusIndicator.className = 'status-indicator';

        if (state.isOpen) {
            toggleBtn.classList.add('btn-danger');
            toggleBtn.textContent = 'Close Registration';
            statusIndicator.classList.add('status-open');
            statusIndicator.textContent = 'Registration Open';
        } else {
            toggleBtn.classList.add('btn-success');
            toggleBtn.textContent = 'Open Registration';
            statusIndicator.classList.add('status-closed');
            statusIndicator.textContent = 'Registration Closed';
        }
    }

    updatePlayerList(players = {}) {  // Add default empty object
        const playerList = document.getElementById('playerList');
        const playerCount = document.getElementById('connectedCount');
        
        if (!playerList || !playerCount) {
            console.log('Required elements not found');
            return;
        }

        playerList.innerHTML = '';
        const count = Object.keys(players).length;
        playerCount.textContent = count;

        if (count === 0) {
            playerList.innerHTML = '<div class="no-players">No players connected</div>';
            return;
        }

        // Continue with existing player list update logic
        this.getPlayerStatuses().then(playerStatuses => {
            // ...existing code...
        });
    }

    async getPlayerStatuses() {
        try {
            const lobbyRef = ref(realtimeDb, 'lobby');
            const lobbySnapshot = await get(lobbyRef);
            const lobbyPlayers = lobbySnapshot.val() || {};

            // Get completions from Firestore instead of realtime DB
            const completionsSnapshot = await getDocs(collection(db, 'completions'));
            const completions = {};
            completionsSnapshot.forEach(doc => {
                completions[doc.id] = doc.data();
            });

            const puzzleStatesRef = ref(realtimeDb, 'puzzleStates');
            const puzzleStatesSnapshot = await get(puzzleStatesRef);
            const puzzleStates = puzzleStatesSnapshot.val() || {};

            const playerStatuses = {};

            // First mark all lobby players as 'inlobby'
            Object.keys(lobbyPlayers).forEach(playerId => {
                playerStatuses[playerId] = 'inlobby';
            });

            // Then check completions from Firestore
            Object.entries(completions).forEach(([playerId, data]) => {
                if (data.status === 'timeout') {
                    playerStatuses[playerId] = 'timeout';
                } else if (data.status === 'completed') {
                    playerStatuses[playerId] = 'completed';
                }
            });

            // Finally, check if they're actively playing
            Object.keys(puzzleStates).forEach(playerId => {
                if (!playerStatuses[playerId] || playerStatuses[playerId] === 'inlobby') {
                    playerStatuses[playerId] = 'playing';
                }
            });

            return playerStatuses;
        } catch (error) {
            console.error('Error getting player statuses:', error);
            return {};
        }
    }

    getStatusClass(status) {
        switch (status) {
            case 'inlobby':
                return 'status-inlobby';
            case 'playing':
                return 'status-playing';
            case 'completed':
                return 'status-completed';
            case 'timeout':
                return 'status-timeout';
            default:
                return '';
        }
    }

    getStatusText(status) {
        switch (status) {
            case 'inlobby':
                return 'In Lobby';
            case 'playing':
                return 'Playing';
            case 'completed':
                return 'Completed';
            case 'timeout':
                return 'Time Up';
            default:
                return 'Unknown';
        }
    }

    async getCurrentPuzzle() {
        try {
            const currentPuzzleRef = ref(realtimeDb, 'currentPuzzle');
            const snapshot = await get(currentPuzzleRef);
            this.currentPuzzle = snapshot.val();
            console.log('Current puzzle loaded:', this.currentPuzzle);
        } catch (error) {
            console.error('Error getting current puzzle:', error);
        }
    }

    async startEvent() {
        try {
            const puzzleRef = ref(realtimeDb, 'currentPuzzle');
            const puzzleSnapshot = await get(puzzleRef);
            const puzzleData = puzzleSnapshot.val();

            if (!puzzleData?.puzzleNumber) {
                this.showStatusMessage('No active puzzle found. Please generate a puzzle first.', true);
                return;
            }

            // Get and store lobby data first
            const lobbyRef = ref(realtimeDb, 'lobby');
            const lobbySnapshot = await get(lobbyRef);
            const players = lobbySnapshot.val() || {};
            const totalPlayers = Object.keys(players).length;

            if (totalPlayers === 0) {
                this.showStatusMessage('No players in lobby!', true);
                return;
            }

            if (!confirm(`Start game with ${totalPlayers} players?`)) {
                return;
            }

            // Create a players map with names preserved
            const playersMap = Object.entries(players).reduce((acc, [id, player]) => {
                acc[id] = {
                    name: player.name,
                    status: 'playing',
                    startTime: Date.now(),
                    registeredAt: player.registeredAt || Date.now()
                };
                return acc;
            }, {});

            // Create game state with preserved player data
            const gameState = {
                started: true,
                puzzleNumber: puzzleData.puzzleNumber,
                startedAt: Date.now(),
                totalPlayers: totalPlayers,
                completedPlayers: 0,
                leaderboardPublished: false,
                timeLimit: 5 * 60 * 1000,
                puzzle: {
                    number: puzzleData.puzzleNumber,
                    url: `/puzzle${puzzleData.puzzleNumber}.html`
                },
                players: playersMap // Store the complete player data
            };

            // Store player names in local state for backup
            this.playerNames = Object.entries(players).reduce((acc, [id, player]) => {
                acc[id] = player.name;
                return acc;
            }, {});

            // Update game state
            await set(ref(realtimeDb, 'gameState'), gameState);

            // Also store player names in a separate location for redundancy
            await set(ref(realtimeDb, 'playerNames'), this.playerNames);

            this.showStatusMessage(`Game started with ${totalPlayers} players!`);
            this.listenForCompletions(totalPlayers);
        } catch (error) {
            console.error('Error starting event:', error);
            this.showStatusMessage('Error starting game. Please try again.', true);
        }
    }

    async listenForCompletions(totalPlayers) {
        this.totalPlayers = totalPlayers;
        const completionsQuery = query(collection(db, 'completions'));
        
        const unsubscribe = onSnapshot(completionsQuery, async (snapshot) => {
            const finishedCount = snapshot.docs.length; // Count all completions
            
            await set(ref(realtimeDb, 'gameState/completedPlayers'), finishedCount);
            this.updateCompletionStatus(finishedCount, totalPlayers);

            // Store state for persistence
            sessionStorage.setItem('adminState', JSON.stringify({
                totalPlayers,
                finishedCount,
                lastUpdate: Date.now()
            }));

            // Enable publish button only when all players have completed
            const publishButton = document.getElementById('publishLeaderboard');
            if (publishButton) {
                if (finishedCount >= totalPlayers) {
                    publishButton.disabled = false;
                    publishButton.classList.add('ready');
                } else {
                    publishButton.disabled = true;
                    publishButton.classList.remove('ready');
                }
            }

            // Show current leaderboard regardless of completion status
            await this.showCurrentLeaderboard();
        });

        this.unsubscribers.push(unsubscribe);
    }

    async createPublishButton() {
        // Store publish button state
        sessionStorage.setItem('adminPublishButtonVisible', 'true');
        
        const controlPanel = document.querySelector('.control-panel');
        if (!controlPanel) return;
        
        // Remove existing publish button if any
        const existingBtn = document.getElementById('publishLeaderboard');
        if (existingBtn) existingBtn.remove();

        const publishBtn = document.createElement('button');
        publishBtn.id = 'publishLeaderboard';
        publishBtn.className = 'admin-button';
        publishBtn.textContent = 'Publish Leaderboard';
        publishBtn.onclick = () => this.publishLeaderboard();

        controlPanel.appendChild(publishBtn);
    }

    async showCurrentLeaderboard() {
        try {
            const completionsSnapshot = await getDocs(collection(db, 'completions'));
            const completions = [];
            
            completionsSnapshot.forEach(doc => {
                const data = doc.data();
                completions.push({
                    id: doc.id,
                    ...data,
                    // Add score calculation
                    score: this.calculateScore(data)
                });
            });

            // Sort players: completed first (by time), then timeouts (by progress)
            const sortedPlayers = completions.sort((a, b) => {
                if (a.status === 'completed' && b.status === 'completed') {
                    return a.time - b.time;
                }
                if (a.status === 'completed') return -1;
                if (b.status === 'completed') return 1;
                
                // For timeouts, compare progress
                const aProgress = a.timeoutProgress?.tilesCorrect || 0;
                const bProgress = b.timeoutProgress?.tilesCorrect || 0;
                if (aProgress !== bProgress) return bProgress - aProgress;
                
                // If same progress, fewer moves is better
                return a.moves - b.moves;
            });

            // Update leaderboard display
            this.updateLeaderboardDisplay(sortedPlayers);
        } catch (error) {
            console.error('Error showing leaderboard:', error);
        }
    }

    calculateScore(playerData) {
        if (playerData.status === 'completed') {
            return 100;
        }
        
        // For timeouts, calculate score based on progress
        const progress = playerData.timeoutProgress?.tilesCorrect || 0;
        const totalTiles = playerData.timeoutProgress?.totalTiles || 11;
        return Math.round((progress / totalTiles) * 100);
    }

    updateLeaderboardDisplay(players) {
        const leaderboardSection = document.getElementById('currentLeaderboard');
        if (!leaderboardSection) {
            const newSection = this.createLeaderboardSection();
            this.updateLeaderboardContent(newSection, players);
        } else {
            this.updateLeaderboardContent(leaderboardSection, players);
        }
    }

    createLeaderboardSection() {
        const leaderboardSection = document.createElement('div');
        leaderboardSection.id = 'currentLeaderboard';
        leaderboardSection.className = 'current-leaderboard';
        document.querySelector('.stats-panel').appendChild(leaderboardSection);
        return leaderboardSection;
    }

    updateLeaderboardContent(section, players) {
        section.innerHTML = `
            <h3>Current Results</h3>
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Team Name</th>
                        <th>Status</th>
                        <th>Time/Progress</th>
                        <th>Moves</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${players.map((player, index) => `
                        <tr class="${player.status}">
                            <td>${index + 1}</td>
                            <td>${player.name || 'Unknown'}</td>
                            <td>${player.status || 'N/A'}</td>
                            <td>${this.formatProgress(player)}</td>
                            <td>${player.moves || 0}</td>
                            <td>${player.score || 0}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    formatProgress(player) {
        if (player.status === 'completed') {
            return this.formatTime(player.time);
        }
        return `${player.timeoutProgress?.tilesCorrect || 0}/${player.timeoutProgress?.totalTiles || 11} tiles`;
    }

    async publishLeaderboard() {
        try {
            const leaderboardId = Date.now().toString();
            
            await this.withRetry(async () => {
                // Get all completions with retry
                const completionsSnapshot = await getDocs(collection(db, 'completions'));
                const leaderboardData = [];
                completionsSnapshot.forEach(doc => {
                    leaderboardData.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });

                // Sort and prepare data
                const sortedLeaderboard = this.sortLeaderboardData(leaderboardData);

                // Save to Firestore with retry
                await setDoc(doc(db, 'leaderboards', leaderboardId), {
                    results: sortedLeaderboard,
                    publishedAt: new Date().toISOString(),
                    puzzleNumber: this.currentPuzzle?.puzzleNumber,
                    totalPlayers: this.totalPlayers,
                    completedPlayers: sortedLeaderboard.filter(p => p.status === 'completed').length,
                    timeoutPlayers: sortedLeaderboard.filter(p => p.status === 'timeout').length
                });

                // Update game state with retry
                await set(ref(realtimeDb, 'gameState'), {
                    leaderboardPublished: true,
                    leaderboardId: leaderboardId,
                    completedAt: new Date().toISOString()
                });

                // Store leaderboard ID for persistence
                sessionStorage.setItem('lastLeaderboardId', leaderboardId);
                this.lastKnownLeaderboardId = leaderboardId;

                // Signal only users to redirect to leaderboard
                await set(ref(realtimeDb, 'systemState/redirect'), {
                    timestamp: Date.now(),
                    destination: 'leaderboard.html',
                    leaderboardId: leaderboardId
                });

                this.showStatusMessage('Leaderboard published successfully! Users will be redirected.');

                // Disable the publish button after successful publish
                const publishButton = document.getElementById('publishLeaderboard');
                if (publishButton) {
                    publishButton.disabled = true;
                    publishButton.classList.remove('ready');
                }

            });

        } catch (error) {
            console.error('Error publishing leaderboard:', error);
            this.showStatusMessage('Error publishing leaderboard. Please try again.', true);
        }
    }

    async resetEvent() {
        if (!confirm('Are you sure you want to reset the event? This will clear ALL data.')) return;

        try {
            // Send reset signal first
            await set(ref(realtimeDb, 'systemState/reset'), {
                timestamp: Date.now(),
                action: 'reset',
                forcedReset: true
            });

            // Clear all Realtime Database data
            await Promise.all([
                set(ref(realtimeDb, 'gameState'), null),
                set(ref(realtimeDb, 'lobby'), null),
                set(ref(realtimeDb, 'puzzleStates'), null),
                set(ref(realtimeDb, 'leaderboard'), null),
                set(ref(realtimeDb, 'currentPuzzle'), null),
                set(ref(realtimeDb, 'playerNames'), null),
                set(ref(realtimeDb, 'puzzles'), null),
                set(ref(realtimeDb, 'players'), null),     // Add players field deletion
                set(ref(realtimeDb, 'gameState/players'), null) // Clear players in gameState
            ]);

            // Clear all Firestore collections
            const collections = ['completions', 'leaderboards'];
            for (const collectionName of collections) {
                const snapshot = await getDocs(collection(db, collectionName));
                const batch = writeBatch(db);
                
                snapshot.docs.forEach((doc) => {
                    batch.delete(doc.ref);
                });

                await batch.commit();
            }

            // Reset system state to default
            await set(ref(realtimeDb, 'systemState'), {
                registration: { isOpen: true },
                reset: {
                    timestamp: Date.now(),
                    action: 'complete',
                    forcedReset: true
                }
            });

            // Clear all local storage and session storage
            this.clearAllLocalData();
            window.isResetting = true;

            this.showStatusMessage('System reset complete. All data has been cleared.');
            
            // Refresh the admin page instead of redirecting
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('Reset error:', error);
            this.showStatusMessage('Reset failed. Please try again.', true);
        }
    }

    clearAllLocalData() {
        // Clear all session storage
        sessionStorage.clear();
        
        // Clear all local storage
        localStorage.clear();
        
        // Clear any cookies related to the app
        document.cookie.split(";").forEach(cookie => {
            document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    }

    async broadcastReset() {
        await set(ref(realtimeDb, 'systemState/reset'), {
            timestamp: Date.now(),
            action: 'reset'
        });
    }

    async showLeaderboard() {
        try {
            // Get completions from Firestore
            const completionsSnapshot = await getDocs(collection(db, 'completions'));
            const completions = [];
            
            completionsSnapshot.forEach(doc => {
                completions.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            const sortedPlayers = completions.sort((a, b) => {
                if (a.time === null) return 1;
                if (b.time === null) return -1;
                return a.time - b.time;
            });

            const leaderboardHtml = sortedPlayers.map(([id, player], index) => {
                const time = player.time !== null ? this.formatTime(player.time) : 'N/A';
                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${player.name}</td>
                        <td>${time}</td>
                        <td>${player.moves}</td>
                    </tr>
                `;
            }).join('');

            const leaderboardModal = document.createElement('div');
            leaderboardModal.className = 'leaderboard-modal';
            leaderboardModal.innerHTML = `
                <div class="leaderboard-content">
                    <h2>Leaderboard</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Name</th>
                                <th>Time</th>
                                <th>Moves</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${leaderboardHtml}
                        </tbody>
                    </table>
                    <button onclick="document.querySelector('.leaderboard-modal').remove()">Close</button>
                </div>
            `;
            document.body.appendChild(leaderboardModal);
        } catch (error) {
            console.error('Error showing leaderboard:', error);
            alert('Error loading leaderboard data');
        }
    }

    formatTime(time) {
        const minutes = Math.floor(time / 60000);
        const seconds = Math.floor((time % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Add proper cleanup
    cleanup() {
        // Don't clear admin state on normal cleanup
        this.unsubscribers.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.intervals.forEach(clearInterval);
    }

    // Add method to clear admin state
    clearAdminState() {
        sessionStorage.removeItem('adminTotalPlayers');
        sessionStorage.removeItem('adminCompletionStatus');
        sessionStorage.removeItem('adminPublishButtonVisible');
        sessionStorage.removeItem('adminLeaderboardVisible');
    }

    showStatusMessage(message, isError = false) {
        const overlay = document.createElement('div');
        overlay.className = 'admin-message-overlay';
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `admin-message ${isError ? 'error' : 'success'}`;
        messageDiv.textContent = message;
        
        overlay.appendChild(messageDiv);
        document.body.appendChild(overlay);

        // Remove the countdown display after successful start
        setTimeout(() => overlay.remove(), 3000);
    }

    updateCompletionStatus(completed, total) {
        // Store current status in sessionStorage
        sessionStorage.setItem('adminCompletionStatus', JSON.stringify({
            completed,
            total,
            timestamp: Date.now()
        }));

        // Create or update completion status display
        const statusHTML = `
            <div class="completion-counter">
                <div class="completion-numbers">
                    <span class="completed">${completed}</span>
                    <span class="separator">/</span>
                    <span class="total">${total}</span>
                </div>
                <div class="completion-progress">
                    <div class="progress-bar" style="width: ${(completed/total * 100)}%"></div>
                </div>
                <div class="completion-text">Players Completed</div>
            </div>
        `;

        // Find or create the status container
        let statusContainer = document.getElementById('completionStatus');
        if (!statusContainer) {
            statusContainer = document.createElement('div');
            statusContainer.id = 'completionStatus';
            statusContainer.className = 'completion-status';
            document.querySelector('.stats-panel').appendChild(statusContainer);
        }

        // Update the content
        statusContainer.innerHTML = statusHTML;

        // Add appropriate status classes
        statusContainer.className = 'completion-status';
        if (completed === total) {
            statusContainer.classList.add('all-completed');
        } else if (completed > 0) {
            statusContainer.classList.add('some-completed');
        }
    }

    setupConnectionMonitoring() {
        const connectedRef = ref(realtimeDb, '.info/connected');
        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                console.log('Connected to Firebase');
            } else {
                console.log('Disconnected from Firebase');
                this.handleDisconnection();
            }
        });
    }

    handleDisconnection() {
        // Show reconnection message
        this.showStatusMessage('Connection lost. Attempting to reconnect...', true);
        
        // Attempt to reconnect
        setTimeout(() => this.reconnect(), 2000);
    }

    async reconnect() {
        try {
            // Test connection with a simple read
            await get(ref(realtimeDb, 'systemState'));
            this.showStatusMessage('Reconnected successfully!');
            
            // Restore data after reconnection
            await this.restorePlayerNames();
            await this.restoreLeaderboard();
            this.setupAllRealtimeListeners();
        } catch (error) {
            console.error('Reconnection failed:', error);
            // Try again after delay
            setTimeout(() => this.reconnect(), 5000);
        }
    }

    async restoreLeaderboard() {
        try {
            if (this.lastKnownLeaderboardId) {
                const leaderboardDoc = await getDoc(doc(db, 'leaderboards', this.lastKnownLeaderboardId));
                if (leaderboardDoc.exists()) {
                    const data = leaderboardDoc.data();
                    this.updateLeaderboardDisplay(data.results);
                    return;
                }
            }

            // If no specific leaderboard ID, try to get latest completions
            const completionsSnapshot = await getDocs(collection(db, 'completions'));
            if (!completionsSnapshot.empty) {
                const completions = [];
                completionsSnapshot.forEach(doc => {
                    completions.push({
                        id: doc.id,
                        ...doc.data(),
                        score: this.calculateScore(doc.data())
                    });
                });
                this.updateLeaderboardDisplay(completions);
            }
        } catch (error) {
            console.error('Error restoring leaderboard:', error);
        }
    }

    async withRetry(operation, maxAttempts = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                lastError = error;
                
                if (attempt < maxAttempts) {
                    // Wait longer between each retry
                    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        
        throw lastError;
    }

    sortLeaderboardData(data) {
        return data.sort((a, b) => {
            // First sort by completion status
            if (a.status === 'completed' && b.status === 'completed') {
                // If both completed, sort by time
                return a.time - b.time;
            }
            if (a.status === 'completed') return -1;
            if (b.status === 'completed') return 1;
            
            // If neither completed (timeouts), sort by progress
            const aProgress = a.timeoutProgress?.tilesCorrect || 0;
            const bProgress = b.timeoutProgress?.tilesCorrect || 0;
            if (aProgress !== bProgress) return bProgress - aProgress;
            
            // If same progress, sort by moves
            return (a.moves || 0) - (b.moves || 0);
        });
    }
}

// Only clear admin state on reset
window.addEventListener('unload', () => {
    const adminPanel = window._adminPanel;
    if (adminPanel && window.isResetting) {
        adminPanel.clearAdminState();
    }
    if (adminPanel) {
        adminPanel.cleanup();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    window._adminPanel = new AdminPanel();
});

// Update the Excel export event listener
document.getElementById('publishLeaderboard').addEventListener('click', async () => {
    try {
        // Get all completions from Firestore
        const completionsRef = collection(db, 'completions');
        const completionsSnapshot = await getDocs(completionsRef);
        const completions = [];

        completionsSnapshot.forEach(doc => {
            const data = doc.data();
            const timeProgress = data.status === 'completed' 
                ? formatTime(data.time) 
                : `${data.timeoutProgress?.tilesCorrect || 0}/${data.timeoutProgress?.totalTiles || 11} tiles`;
            
            // Calculate accuracy
            const accuracy = data.status === 'completed' 
                ? '100%' 
                : `${Math.round((data.timeoutProgress?.tilesCorrect || 0) / (data.timeoutProgress?.totalTiles || 11) * 100)}%`;

            // Calculate points based on completion status
            const points = data.status === 'completed' 
                ? 10 
                : Math.round((data.timeoutProgress?.tilesCorrect || 0) / (data.timeoutProgress?.totalTiles || 11) * 10);

            completions.push({
                Rank: 0, // Will be filled in after sorting
                Team_Name: data.name,
                Time_Progress: timeProgress,
                Moves: data.moves || 0,
                Accuracy: accuracy,
                Points: points,
                Status: data.status
            });
        });

        // Sort completions and assign ranks
        completions.sort((a, b) => {
            if (a.Status === 'completed' && b.Status === 'completed') {
                return convertTimeToSeconds(a.Time_Progress) - convertTimeToSeconds(b.Time_Progress);
            }
            if (a.Status === 'completed') return -1;
            if (b.Status === 'completed') return 1;
            return b.Points - a.Points;
        });

        // Add ranks after sorting
        completions.forEach((player, index) => {
            player.Rank = index + 1;
        });

        // Create Excel workbook
        const worksheet = XLSX.utils.json_to_sheet(completions);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Leaderboard");

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `puzzle_leaderboard_${timestamp}.xlsx`;

        // Download Excel file
        XLSX.writeFile(workbook, filename);

        // Prepare data for realtime database
        const leaderboardData = completions.reduce((acc, player) => {
            acc[player.Team_Name] = {
                name: player.Team_Name,
                timeProgress: player.Time_Progress,
                moves: player.Moves,
                accuracy: player.Accuracy,
                points: player.Points,
                rank: player.Rank,
                status: player.Status
            };
            return acc;
        }, {});

        // Update realtime database
        const leaderboardRef = ref(realtimeDb, 'leaderboard');
        await set(leaderboardRef, leaderboardData);

        // Add leaderboard publication signal
        const gameStateRef = ref(realtimeDb, 'gameState');
        await set(gameStateRef, {
            leaderboardPublished: true,
            leaderboardId: Date.now().toString(),
            completedAt: new Date().toISOString()
        });

        // Signal users to redirect
        await set(ref(realtimeDb, 'systemState/redirect'), {
            timestamp: Date.now(),
            destination: 'leaderboard.html'
        });

        alert('Leaderboard published! Users will be redirected to the leaderboard page.');

        // Disable the publish button
        const publishButton = document.getElementById('publishLeaderboard');
        if (publishButton) {
            publishButton.disabled = true;
            publishButton.classList.remove('ready');
        }

    } catch (error) {
        console.error('Error publishing leaderboard:', error);
        alert('Error publishing leaderboard. Please try again.');
    }
});

// Helper function to format time for Excel
function formatTime(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Helper function to convert time string back to seconds
function convertTimeToSeconds(timeString) {
    const [minutes, seconds] = timeString.split(':').map(Number);
    return minutes * 60 + seconds;
}
