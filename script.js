import { db, realtimeDb } from './firebase-config.js';
import { doc, updateDoc, getDoc, setDoc, collection } from 'firebase/firestore';
import { ref, set, onValue, get } from 'firebase/database';
import { TimeSync } from './timeSync.js';
import { firebaseConnection } from './firebaseConnection.js';

// Your existing code...

class SlidingPuzzle {
    constructor() {
        // Modify session check to include adminStarted
        const hasValidSession = this.checkSession();
        const adminStarted = sessionStorage.getItem('adminStarted') === 'true';

        console.log('Session check:', {
            playerName: sessionStorage.getItem('playerName'),
            playerId: sessionStorage.getItem('playerId'),
            gameStarted: sessionStorage.getItem('gameStarted'),
            adminStarted: adminStarted,
            fromLobby: sessionStorage.getItem('fromLobby')
        });

        // Allow both regular session and admin-started sessions
        if (!hasValidSession && !adminStarted) {
            const currentUrl = window.location.href;
            sessionStorage.setItem('puzzleReturnUrl', currentUrl);
            window.location.replace('/registration.html');
            return;
        }

        // Initialize game with fresh state
        this.initializeGame();
    }

    checkSession() {
        // Modified to be less strict and include fromLobby flag
        return (sessionStorage.getItem('playerName') && 
                sessionStorage.getItem('playerId')) && 
               (sessionStorage.getItem('gameStarted') === 'true' ||
                sessionStorage.getItem('fromLobby') === 'true' ||
                sessionStorage.getItem('adminStarted') === 'true');
    }

    getExistingSession() {
        const savedSession = localStorage.getItem('puzzleSession');
        if (!savedSession) return null;
        
        try {
            const session = JSON.parse(savedSession);
            // Check if session is still valid (e.g., within last 24 hours)
            if (session.timestamp && (Date.now() - session.timestamp) < 24 * 60 * 60 * 1000) {
                return session.data;
            }
            // Clear expired session
            localStorage.removeItem('puzzleSession');
            return null;
        } catch (e) {
            console.error('Error parsing saved session:', e);
            return null;
        }
    }

    initializeGame() {
        this.playerId = sessionStorage.getItem('playerId');
        this.playerName = sessionStorage.getItem('playerName');
        
        // Set game flags
        sessionStorage.setItem('gameStarted', 'true');
        
        this.timeSync = new TimeSync();
        this.initializePuzzleProps();  // Add initial properties setup
        this.initializePuzzleFromGameState();
        this.serverTimeOffset = 0;
        this.syncServerTime();
        this.setupResetListener(); // Add this line to constructor
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchedTile = null;
        this.swipeThreshold = 30; // Minimum swipe distance

        // Get the correct puzzle URL from session
        this.originalPuzzleUrl = sessionStorage.getItem('originalPuzzleUrl');
        if (this.originalPuzzleUrl) {
            // Extract puzzle number from original URL if it exists
            const match = this.originalPuzzleUrl.match(/puzzle(\d+)\.html/);
            if (match) {
                this.puzzleNumber = parseInt(match[1]);
            }
        }

        // Check if user came from registration
        if (!sessionStorage.getItem('playerName')) {
            // Store current URL and redirect to registration
            const currentUrl = window.location.href;
            sessionStorage.setItem('puzzleReturnUrl', currentUrl);
            window.location.href = '/registration.html';
            return;
        }

        // Mark game as started
        localStorage.setItem('gameInProgress', 'true');
        sessionStorage.setItem('gameStarted', 'true');
        
        // Mark game as started
        sessionStorage.setItem('gameStarted', 'true');
    }

    initializePuzzleProps() {
        // Initialize all required properties upfront
        this.tiles = [];
        this.moves = 0;
        this.rows = 3;
        this.cols = 4;
        this.size = this.rows * this.cols;
        this.imageLoaded = false;
        this.imageElement = null;
        this.timeLimit = 5 * 60 * 1000;
        this.startTime = null;
        this.timerInterval = null;
        this.gameStarted = false;
    }

    async syncServerTime() {
        try {
            const serverTimeRef = ref(realtimeDb, '.info/serverTimeOffset');
            onValue(serverTimeRef, (snapshot) => {
                this.serverTimeOffset = snapshot.val() || 0;
            });
        } catch (error) {
            console.error('Error syncing server time:', error);
        }
    }

    getServerTime() {
        return Date.now() + this.serverTimeOffset;
    }

    async initializePuzzleFromGameState() {
        try {
            // Initialize board element first
            this.board = document.getElementById('board');
            this.timerDisplay = document.getElementById('timer');
            
            if (!this.board || !this.timerDisplay) {
                throw new Error('Required elements not found');
            }

            // Use original puzzle number if available
            if (this.puzzleNumber) {
                await this.initializePuzzleData(this.puzzleNumber);
                return;
            }

            // Fallback to game state puzzle number
            const gameState = await this.getCurrentGameState();
            if (!gameState?.puzzleNumber) {
                window.location.href = '/';
                return;
            }

            await this.initializePuzzleData(gameState.puzzleNumber);
        } catch (error) {
            console.error('Error initializing puzzle:', error);
            window.location.href = '/';
        }
    }

    async initializePuzzleData(puzzleNumber) {
        try {
            // Debug log
            console.log('Starting initialization with puzzle number:', puzzleNumber);
            console.log('Current session state:', {
                playerName: sessionStorage.getItem('playerName'),
                playerId: sessionStorage.getItem('playerId'),
                adminStarted: sessionStorage.getItem('adminStarted'),
                gameStarted: sessionStorage.getItem('gameStarted')
            });

            const gameState = await this.getCurrentGameState();
            console.log('Current game state:', gameState);

            const adminStarted = sessionStorage.getItem('adminStarted') === 'true';
            const hasRegistration = sessionStorage.getItem('playerName') && sessionStorage.getItem('playerId');

            // Ensure puzzle data exists in Firebase before proceeding
            const puzzleRef = ref(realtimeDb, `puzzles/puzzle${puzzleNumber}`);
            const puzzleSnapshot = await get(puzzleRef);
            const puzzleExists = puzzleSnapshot.exists();

            if (!puzzleExists) {
                console.error('Puzzle does not exist:', puzzleNumber);
                throw new Error(`Puzzle ${puzzleNumber} not found`);
            }

            if (adminStarted) {
                console.log('Admin started game detected');
                try {
                    await this.loadPuzzle(puzzleNumber);
                } catch (error) {
                    console.error('Failed to load puzzle:', error);
                    alert('Error loading puzzle. Please try again.');
                    window.location.href = '/';
                    return;
                }
                return;
            }

            if (!hasRegistration) {
                console.log('No registration found, redirecting to registration');
                const currentUrl = window.location.href;
                sessionStorage.setItem('puzzleReturnUrl', currentUrl);
                window.location.href = '/registration.html';
                return;
            }

            // If we have registration but game hasn't started
            if (!gameState?.started && !adminStarted) {
                console.log('Game not started, redirecting to lobby');
                window.location.href = 'lobby.html';
                return;
            }

            // Load puzzle if all checks pass
            await this.loadPuzzle(puzzleNumber);

        } catch (error) {
            console.error('Detailed initialization error:', {
                error: error.message,
                stack: error.stack
            });
            alert('Error initializing game. Please try again.');
            window.location.href = '/';
        }
    }

    async loadPuzzle(puzzleNumber) {
        try {
            console.log('Loading puzzle:', puzzleNumber);
            
            const elements = this.getRequiredElements();
            if (!elements) {
                throw new Error('Required DOM elements not found');
            }

            // Show loading immediately
            elements.loadingOverlay.style.display = 'flex';
            elements.container.style.display = 'none';

            // Load puzzle data and image first
            await this.initializeGameComponents(puzzleNumber);

            // Try to restore saved state
            const restored = await this.restoreState();
            console.log('State restored:', restored);

            if (!restored) {
                if (!sessionStorage.getItem('gameAlreadyStarted')) {
                    await this.showCountdown();
                    sessionStorage.setItem('gameAlreadyStarted', 'true');
                    await this.startGame();
                }
            }

            // Show container
            elements.loadingOverlay.style.display = 'none';
            elements.container.style.display = 'block';
            
            return true;
        } catch (error) {
            console.error('Loading error:', error);
            throw error;
        }
    }

    async resumeGame() {
        if (!this.gameStarted) return;

        // Use saved time or get from session
        const savedStartTime = parseInt(sessionStorage.getItem('gameStartTime'));
        const savedTimeLimit = parseInt(sessionStorage.getItem('gameTimeLimit'));

        if (savedStartTime && savedTimeLimit) {
            this.gameStartTime = savedStartTime;
            this.timeLimit = savedTimeLimit;
            
            // Calculate remaining time
            const elapsed = Date.now() - this.gameStartTime;
            const remaining = this.timeLimit - elapsed;

            if (remaining > 0) {
                // Resume timer with correct remaining time
                this.startTimer();
            } else {
                this.gameOver(true);
            }
        }
    }

    async initializeGameComponents(puzzleNumber) {
        // Load puzzle data
        const puzzleRef = ref(realtimeDb, `puzzles/puzzle${puzzleNumber}`);
        const snapshot = await get(puzzleRef);
        const puzzleData = snapshot.val();

        if (!puzzleData || !puzzleData.image || !puzzleData.puzzleNumber) {
            throw new Error('Invalid puzzle data');
        }

        // Set puzzle properties
        this.puzzleData = puzzleData;
        this.board.setAttribute('data-image', puzzleData.image);

        // Load image first
        await this.loadImage();

        // Initialize board
        await this.setupInitialBoard();

        // Set up game state
        this.gameStartTime = parseInt(sessionStorage.getItem('personalStartTime'));
        this.timeLimit = 5 * 60 * 1000;
        this.moves = 0;
        this.updateMoves();

        // Initialize display but don't start timer yet
        this.timerDisplay.textContent = '5:00';

        console.log('Game components initialized');
    }

    async startCountdown() {
        const countdownOverlay = document.getElementById('countdownOverlay');
        const countdownDisplay = document.getElementById('countdown');
        
        if (!countdownOverlay || !countdownDisplay) {
            return;
        }

        countdownOverlay.style.display = 'flex';
        
        for (let i = 5; i >= 0; i--) {
            countdownDisplay.textContent = i === 0 ? 'Start!' : i;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        countdownOverlay.style.display = 'none';
    }

    getRequiredElements() {
        const container = document.getElementById('puzzleContainer');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const board = document.getElementById('board');

        if (!container || !loadingOverlay || !board) {
            return null;
        }

        return { container, loadingOverlay, board };
    }

    getElementsStatus() {
        return {
            container: !!document.getElementById('puzzleContainer'),
            loading: !!document.getElementById('loadingOverlay'),
            board: !!document.getElementById('board')
        };
    }

    getCurrentGameState() {
        return get(ref(realtimeDb, 'gameState'))
            .then(snapshot => {
                const state = snapshot.val();
                console.log('Retrieved game state:', state);
                return state;
            })
            .catch(error => {
                console.error('Error getting game state:', error);
                return null;
            });
    }

    getPuzzleNumberFromUrl() {
        // Extract puzzle number from URL (e.g., puzzle1.html -> 1)
        const match = window.location.pathname.match(/puzzle(\d+)\.html/);
        return match ? parseInt(match[1]) : null;
    }

    isValidAccess() {
        const playerId = sessionStorage.getItem('playerId');
        const playerName = sessionStorage.getItem('playerName');
        const returnUrl = sessionStorage.getItem('returnUrl');
        const gameStarted = sessionStorage.getItem('gameStarted');

        // Allow access only if all required session data exists
        return playerId && playerName && returnUrl && gameStarted;
    }

    checkAuthAndStart() {
        if (!this.isValidAccess()) {
            window.location.href = '/';
            return;
        }

        // If valid access, proceed with game
        this.showPuzzle();
        this.initializePuzzle();
    }

    async showRegistration() {
        // Store current puzzle URL before redirecting
        const currentUrl = window.location.href;
        sessionStorage.setItem('puzzleReturnUrl', currentUrl);
        window.location.href = 'registration.html';
    }

    showSystemResetMessage() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h2>System Reset in Progress</h2>
                <p>The platform is currently being reset.</p>
                <p>Please try again later.</p>
                <button onclick="window.location.href='/'">Return to Home</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    showRegistrationClosed() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <h2>Registration Closed</h2>
                <p>Registration is currently closed for this puzzle.</p>
                <p>Please try again later or contact the administrator.</p>
                <button onclick="window.location.href='/'">Return to Home</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    showPuzzle() {
        try {
            const elements = {
                container: document.getElementById('puzzleContainer'),
                loading: document.getElementById('loadingOverlay'),
                registration: document.getElementById('registrationOverlay')
            };

            // Check if elements exist
            if (!elements.container || !elements.loading) {
                throw new Error('Required DOM elements not found');
            }

            // Update display
            if (elements.registration) {
                elements.registration.style.display = 'none';
            }
            elements.loading.style.display = 'none';
            elements.container.style.display = 'block';
            
            console.log('Puzzle display initialized successfully');
        } catch (error) {
            console.error('Error in showPuzzle:', error);
            throw error;
        }
    }

    async initializePuzzle() {
        try {
            // Show loading overlay first
            const loadingOverlay = document.getElementById('loadingOverlay');
            const container = document.getElementById('puzzleContainer');
            if (loadingOverlay && container) {
                loadingOverlay.style.display = 'flex';
                container.style.display = 'none';
            }

            // Initialize board element
            this.board = document.getElementById('board');
            this.timerDisplay = document.getElementById('timer');
            
            if (!this.board || !this.timerDisplay) {
                throw new Error('Required elements not found');
            }

            // Set initial timer display
            this.timerDisplay.textContent = '5:00';

            // Load resources sequentially
            await this.loadImage();
            
            // Try to restore saved state first
            const restored = await this.restoreState();
            
            if (!restored) {
                // Only create new board if no state was restored
                await this.setupInitialBoard();
            }

            // Get user data
            this.playerId = sessionStorage.getItem('playerId');
            this.playerName = sessionStorage.getItem('playerName');
            
            if (!this.playerId || !this.playerName) {
                window.location.href = '/lobby.html';
                return;
            }

            // Setup event listeners
            this.setupEventListeners();
            
            // Hide loading overlay
            if (loadingOverlay && container) {
                loadingOverlay.style.display = 'none';
                container.style.display = 'block';
            }

            // Only start countdown and game if not already started
            const gameAlreadyStarted = sessionStorage.getItem('gameAlreadyStarted');
            if (!gameAlreadyStarted) {
                await this.showCountdown();
                sessionStorage.setItem('gameAlreadyStarted', 'true');
                this.startGame();
            } else {
                // Resume game with saved state
                this.resumeGame();
            }

        } catch (error) {
            console.error('Initialization error:', error);
            throw error;
        }
    }

    async loadImage() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            let imagePath = '';

            // Get puzzle number either from URL or stored data
            const puzzleNumber = this.getPuzzleNumberFromUrl() || 
                               sessionStorage.getItem('puzzleNumber');

            if (!puzzleNumber) {
                console.error('No puzzle number found');
                reject(new Error('No puzzle number found'));
                return;
            }

            // Construct image path
            imagePath = `/images/puzzle${puzzleNumber}.jpg`;
            console.log('Loading puzzle image:', imagePath);

            img.onload = () => {
                console.log('Successfully loaded image:', imagePath);
                this.imageLoaded = true;
                this.imageElement = img;
                this.imagePath = imagePath;
                resolve();
            };

            img.onerror = (error) => {
                console.error('Failed to load image:', imagePath, error);
                reject(new Error(`Failed to load image: ${imagePath}`));
            };

            img.src = imagePath;
        });
    }

    getPuzzleNumberFromUrl() {
        // First try URL
        const urlMatch = window.location.pathname.match(/puzzle(\d+)\.html/);
        if (urlMatch) return urlMatch[1];

        // Then try puzzle return URL
        const returnUrl = sessionStorage.getItem('puzzleReturnUrl');
        const returnMatch = returnUrl?.match(/puzzle(\d+)\.html/);
        if (returnMatch) return returnMatch[1];

        // Finally try stored puzzle number
        return sessionStorage.getItem('puzzleNumber');
    }

    setupInitialBoard() {
        this.board.innerHTML = '';
        this.tiles = Array.from({length: this.size - 1}, (_, i) => i + 1);
        this.tiles.push(0);
        this.moves = 0;
        this.updateMoves();
        this.timerDisplay.textContent = '5:00';
        this.createBoard();
        this.board.classList.add('complete-state');
        // Position the last tile (empty one) correctly
        const lastTile = this.board.querySelector('.empty');
        if (lastTile) {
            lastTile.style.backgroundPosition = `-300px -200px`;
        }
    }

    init() {
        if (this.gameStarted) return;
        
        // Remove countdown and start game directly
        this.gameStarted = true;
        this.moves = 0;
        this.updateMoves();
        this.board.classList.remove('complete-state');
        this.shuffleBoard();
        
        if (!this.startTime) {
            this.startTime = Date.now();
        }
        
        this.saveState();
    }

    createBoard() {
        if (!this.board || !this.tiles || !Array.isArray(this.tiles)) {
            console.error('Invalid board state');
            return;
        }

        this.board.innerHTML = '';
        this.tiles.forEach((num, index) => {
            const tile = document.createElement('div');
            tile.className = `tile ${num === 0 ? 'empty' : ''}`;
            tile.dataset.value = num;
            
            if (num !== 0) {
                if (this.imageLoaded) {
                    tile.classList.add('has-image');
                    const row = Math.floor((num - 1) / this.cols);
                    const col = (num - 1) % this.cols;
                    tile.style.backgroundImage = `url(${this.imagePath})`;
                    tile.style.backgroundPosition = `-${col * 100}px -${row * 100}px`;
                    tile.style.cursor = 'pointer';
                }
            }
            
            // Add click event to each tile
            tile.addEventListener('click', () => {
                if (!this.gameStarted || num === 0) return;
                this.moveTile(tile);
            });
            
            this.board.appendChild(tile);
        });
    }

    shuffle() {
        const maxShuffles = 200; // Increase shuffle moves for better randomization
        let emptyIndex = this.tiles.indexOf(0);
        let lastMove = null;
        
        for (let i = 0; i < maxShuffles; i++) {
            const validMoves = this.getValidMoves(emptyIndex).filter(move => move !== lastMove);
            if (validMoves.length === 0) continue;
            
            const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
            lastMove = emptyIndex;
            
            [this.tiles[emptyIndex], this.tiles[randomMove]] = 
            [this.tiles[randomMove], this.tiles[emptyIndex]];
            
            emptyIndex = randomMove;
        }
    }

    getValidMoves(emptyIndex) {
        const moves = [];
        const row = Math.floor(emptyIndex / this.cols);
        const col = emptyIndex % this.cols;
        
        // Check all possible moves
        if (row > 0) moves.push(emptyIndex - this.cols); // up
        if (row < this.rows - 1) moves.push(emptyIndex + this.cols); // down
        if (col > 0) moves.push(emptyIndex - 1); // left
        if (col < this.cols - 1) moves.push(emptyIndex + 1); // right
        
        return moves;
    }

    isTooDifficult() {
        let outOfPlaceCount = 0;
        let manhattanDistance = 0;
        
        for (let i = 0; i < this.tiles.length; i++) {
            if (this.tiles[i] !== 0) {
                const currentPos = this.getPosition(i);
                const correctPos = this.getPosition(this.tiles[i] - 1);
                
                manhattanDistance += Math.abs(currentPos.row - correctPos.row) + 
                                   Math.abs(currentPos.col - correctPos.col);
                
                if (this.tiles[i] !== i + 1) {
                    outOfPlaceCount++;
                }
            }
        }
        
        return manhattanDistance < 25 || manhattanDistance > 45 ||
               outOfPlaceCount < (this.size * 0.4) || 
               outOfPlaceCount > (this.size * 0.6);
    }

    shuffleBoard() {
        let attempts = 0;
        const maxAttempts = 10;

        do {
            this.shuffle();
            attempts++;
            if (attempts >= maxAttempts) break;
        } while (!this.isSolvable() || this.isTooDifficult());

        this.createBoard();
    }

    getPosition(index) {
        return {
            row: Math.floor(index / this.cols),
            col: index % this.cols
        };
    }

    isAdjacent(index1, index2) {
        const pos1 = this.getPosition(index1);
        const pos2 = this.getPosition(index2);
        return Math.abs(pos1.row - pos2.row) + Math.abs(pos2.col - pos1.col) === 1;
    }

    moveTile(clickedTile) {
        if (!this.gameStarted) return;
        
        try {
            const tileValue = parseInt(clickedTile.dataset.value);
            const tileIndex = this.tiles.indexOf(tileValue);
            const emptyIndex = this.tiles.indexOf(0);

            if (this.isAdjacent(tileIndex, emptyIndex)) {
                // Swap tiles in array
                [this.tiles[tileIndex], this.tiles[emptyIndex]] = 
                [this.tiles[emptyIndex], this.tiles[tileIndex]];
                
                // Update the board
                this.createBoard();
                this.moves++;
                this.updateMoves();

                // Save state after each move
                this.saveState();

                // Check for win
                if (this.isSolved()) {
                    setTimeout(() => this.handleWin(), 300);
                }
            }
        } catch (error) {
            console.error('Error moving tile:', error);
        }
    }

    setupEventListeners() {
        // Clean up existing listeners
        const oldBoard = this.board;
        const newBoard = oldBoard.cloneNode(true);
        oldBoard.parentNode.replaceChild(newBoard, oldBoard);
        this.board = newBoard;

        // Initialize touch tracking variables with simpler state
        this.touchState = {
            startX: null,
            startY: null,
            tile: null
        };

        // Add touch and click event listeners
        this.board.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.board.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: true });
        this.board.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
        
        // Add click handler for non-touch devices
        this.board.addEventListener('click', (e) => {
            const tile = e.target.closest('.tile');
            if (tile && !tile.classList.contains('empty')) {
                this.moveTile(tile);
            }
        });
    }

    handleTouchStart(e) {
        if (!this.gameStarted) return;
        
        const touch = e.touches[0];
        const tile = document.elementFromPoint(touch.clientX, touch.clientY).closest('.tile');
        
        if (tile && !tile.classList.contains('empty')) {
            this.touchState = {
                startX: touch.clientX,
                startY: touch.clientY,
                tile: tile
            };
            tile.classList.add('touching');
        }
    }

    handleTouchMove(e) {
        if (!this.touchState.tile) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.touchState.startX;
        const deltaY = touch.clientY - this.touchState.startY;
        
        // Simple visual feedback
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            this.touchState.tile.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        }
    }

    handleTouchEnd(e) {
        if (!this.touchState.tile) return;
        
        const tile = this.touchState.tile;
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - this.touchState.startX;
        const deltaY = touch.clientY - this.touchState.startY;
        const threshold = 30; // Minimum swipe distance
        
        // Reset tile appearance
        tile.classList.remove('touching');
        tile.style.transform = '';
        
        // Handle swipe if it exceeds threshold
        if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
            // Move based on primary direction
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                // Horizontal swipe
                this.moveTile(tile);
            } else {
                // Vertical swipe
                this.moveTile(tile);
            }
        } else {
            // Handle as click if swipe was too small
            this.moveTile(tile);
        }
        
        // Reset touch state
        this.touchState = {
            startX: null,
            startY: null,
            tile: null
        };
    }

    isSolvable() {
        let inversions = 0;
        for (let i = 0; i < this.tiles.length - 1; i++) {
            for (let j = i + 1; j < this.tiles.length; j++) {
                if (this.tiles[i] && this.tiles[j] && this.tiles[i] > this.tiles[j]) {
                    inversions++;
                }
            }
        }
        return inversions % 2 === 0;
    }

    updateMoves() {
        document.getElementById('moves').textContent = `Moves: ${this.moves}`;
    }

    isSolved() {
        for (let i = 0; i < this.tiles.length - 1; i++) {
            if (this.tiles[i] !== i + 1) return false;
        }
        return true;
    }

    startTimer() {
        if (!this.gameStartTime) {
            this.gameStartTime = Date.now();
        }

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        // Reset timer display initially
        this.timerDisplay.textContent = this.timeSync.formatTime(this.timeLimit);

        this.timerInterval = this.timeSync.startTimer(
            this.timerDisplay,
            this.gameStartTime,
            () => this.gameOver(true)
        );
    }

    async gameOver(timeout = false) {
        if (!this.gameStarted) return;
        
        this.gameStarted = false;
        clearInterval(this.timerInterval);

        // Clear game state flags
        localStorage.removeItem('gameInProgress');
        sessionStorage.removeItem('gameStarted');

        // Calculate tiles in correct position for timeout case
        let tilesCorrect = 0;
        if (timeout) {
            this.tiles.forEach((tile, index) => {
                if (tile === index + 1) tilesCorrect++;
            });
        }

        // Save completion data for both timeout and successful completion
        const completionData = {
            name: this.playerName,
            moves: this.moves,
            completedAt: new Date().toISOString(),
            status: timeout ? 'timeout' : 'completed',
            time: timeout ? null : Date.now() - this.gameStartTime,
            puzzleNumber: this.getPuzzleNumberFromUrl(),
            timeoutProgress: timeout ? {
                tilesCorrect: tilesCorrect,
                totalTiles: this.tiles.length,
                lastMove: Date.now()
            } : null
        };

        try {
            // Always save to Firestore, even for timeouts
            await setDoc(doc(db, 'completions', this.playerId), completionData);
        } catch (error) {
            console.error('Error saving completion:', error);
            // Store locally as backup
            sessionStorage.setItem('completionData', JSON.stringify(completionData));
        }

        if (timeout) {
            // Redirect to waiting leaderboard page
            window.location.href = 'waiting_leaderboard.html';
        }
    }

    async handleWin() {
        try {
            clearInterval(this.timerInterval);
            this.gameStarted = false;

            // Calculate completion time
            const timeTaken = Date.now() - this.gameStartTime;

            // Create completion data
            const completionData = {
                name: this.playerName || sessionStorage.getItem('playerName'),
                time: timeTaken,
                moves: this.moves,
                completedAt: new Date().toISOString(),
                status: 'completed',
                puzzleNumber: this.getPuzzleNumberFromUrl()
            };

            let savedSuccessfully = false;
            const playerId = this.playerId || sessionStorage.getItem('playerId');

            if (!playerId) {
                throw new Error('No player ID found');
            }

            try {
                // Ensure we have a valid document reference
                const docRef = doc(db, 'completions', playerId);
                await setDoc(docRef, completionData);
                savedSuccessfully = true;
            } catch (error) {
                console.error('Firebase save error:', error);
                // Store locally as backup
                localStorage.setItem(`completion_${playerId}`, JSON.stringify(completionData));
            }

            // Store completion data in session
            sessionStorage.setItem('completionData', JSON.stringify({
                time: timeTaken,
                moves: this.moves,
                savedToLeaderboard: savedSuccessfully,
                status: 'completed'
            }));

            // Show success modal
            const successModal = document.getElementById('successModal');
            if (successModal) {
                const finalTime = successModal.querySelector('#finalTime');
                const finalMoves = successModal.querySelector('#finalMoves');
                const completedImage = successModal.querySelector('#completedImage');

                if (finalTime) finalTime.textContent = this.formatTime(timeTaken);
                if (finalMoves) finalMoves.textContent = this.moves;
                if (completedImage) completedImage.src = this.imagePath;

                successModal.style.display = 'flex';
                successModal.classList.add('active');

                // Redirect after delay
                setTimeout(() => {
                    successModal.classList.remove('active');
                    window.location.href = 'waiting.html';
                }, 3000);
            }

        } catch (error) {
            console.error('Fatal error in handleWin:', error);
            // Ensure we at least store completion locally
            const completionData = {
                time: Date.now() - this.gameStartTime,
                moves: this.moves,
                status: 'completed',
                error: error.message
            };
            sessionStorage.setItem('completionData', JSON.stringify(completionData));
            this.showCompletionMessage(completionData.time, false);
            
            // Still redirect to waiting page
            setTimeout(() => {
                window.location.href = 'waiting.html';
            }, 3000);
        }
    }

    async showLeaderboard() {
        try {
            const leaderboardRef = ref(realtimeDb, 'leaderboard');
            const snapshot = await get(leaderboardRef);
            const leaderboardData = snapshot.val() || {};

            const sortedPlayers = Object.entries(leaderboardData).sort((a, b) => {
                if (a[1].time === null) return 1;
                if (b[1].time === null) return -1;
                return a[1].time - b[1].time;
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
            console.error('Error fetching leaderboard:', error);
            // Show local result if available
            const lastResult = sessionStorage.getItem('lastGameResult');
            if (lastResult) {
                this.showLocalResult(JSON.parse(lastResult));
            } else {
                alert('Could not load leaderboard. Please try again later.');
            }
        }
    }

    formatTime(time) {
        const minutes = Math.floor(time / 60000);
        const seconds = Math.floor((time % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    async recordUnsuccessfulAttempt() {
        try {
            await set(ref(realtimeDb, `leaderboard/${this.playerId}`), {
                name: this.playerName,
                time: null,
                moves: this.moves
            });
        } catch (error) {
            console.error('Error recording unsuccessful attempt:', error);
            // Store unsuccessful attempt locally
            sessionStorage.setItem('lastGameResult', JSON.stringify({
                time: null,
                moves: this.moves,
                completed: false
            }));
        }
    }

    showLocalResult(result) {
        const leaderboardModal = document.createElement('div');
        leaderboardModal.className = 'leaderboard-modal';
        leaderboardModal.innerHTML = `
            <div class="leaderboard-content">
                <h2>Your Result</h2>
                <p>Time: ${result.time ? this.formatTime(result.time) : 'N/A'}</p>
                <p>Moves: ${result.moves}</p>
                <p><em>Note: Leaderboard unavailable. This is your local result.</em></p>
                <button onclick="document.querySelector('.leaderboard-modal').remove()">Close</button>
            </div>
        `;
        document.body.appendChild(leaderboardModal);
    }

    setupResetListener() {
        const resetRef = ref(realtimeDb, 'systemState/reset');
        onValue(resetRef, (snapshot) => {
            const resetData = snapshot.val();
            if (resetData?.action === 'reset') {
                // Clear all device data if fullClean is true
                if (resetData.fullClean) {
                    this.clearAllLocalData();
                }
                window.location.replace('/thankyou.html');
            }
        });
    }

    clearAllLocalData() {
        // Clear all storage
        sessionStorage.clear();
        localStorage.clear();
        
        // Clear cookies
        document.cookie.split(";").forEach(cookie => {
            document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    }

    clearSession() {
        sessionStorage.clear();
    }

    showTimeoutMessage() {
        const modal = document.getElementById('timeoutModal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);

            const timeoutMoves = document.getElementById('timeoutMoves');
            if (timeoutMoves) {
                timeoutMoves.textContent = this.moves;
            }
        } else {
            alert(`Time's up! Your progress: ${this.moves} moves`);
        }
    }

    async saveState() {
        if (!this.playerId) {
            this.playerId = sessionStorage.getItem('playerId');
            if (!this.playerId) return;
        }

        if (!this.playerName) {
            this.playerName = sessionStorage.getItem('playerName');
            if (!this.playerName) return;
        }

        const stateData = {
            tiles: this.tiles || [],
            moves: this.moves || 0,
            gameStarted: this.gameStarted || false,
            gameStartTime: this.gameStartTime || Date.now(),
            timeLimit: this.timeLimit || (5 * 60 * 1000),
            timestamp: Date.now(),
            playerName: this.playerName,
            puzzleNumber: this.getPuzzleNumberFromUrl(),
            imagePath: this.imagePath // Save image path
        };

        try {
            // Validate data before saving
            if (!stateData.tiles.length || !stateData.playerName) {
                console.error('Invalid state data:', stateData);
                return;
            }

            // Save to Firebase
            const stateRef = ref(realtimeDb, `puzzleStates/${this.playerId}`);
            await set(stateRef, stateData);
            console.log('State saved to Firebase:', stateData);

            // Save to session storage
            sessionStorage.setItem('puzzleState', JSON.stringify(stateData));
            sessionStorage.setItem('gameStartTime', stateData.gameStartTime.toString());
            sessionStorage.setItem('gameTimeLimit', stateData.timeLimit.toString());
            sessionStorage.setItem('gameStarted', 'true');
            sessionStorage.setItem('imagePath', stateData.imagePath); // Save image path to session

            // Also save session data
            const sessionData = {
                playerName: this.playerName,
                playerId: this.playerId,
                gameStarted: 'true',
                timestamp: Date.now()
            };

            localStorage.setItem('puzzleSession', JSON.stringify({
                timestamp: Date.now(),
                data: sessionData
            }));
        } catch (error) {
            console.error('Failed to save state:', error);
            // Fallback to session storage only
            sessionStorage.setItem('puzzleState', JSON.stringify(stateData));
            sessionStorage.setItem('imagePath', stateData.imagePath);
        }
    }

    async restoreState() {
        if (!this.playerId) {
            this.playerId = sessionStorage.getItem('playerId');
            if (!this.playerId) return false;
        }

        try {
            // Try to get state from Firebase
            const stateRef = ref(realtimeDb, `puzzleStates/${this.playerId}`);
            const snapshot = await get(stateRef);
            const state = snapshot.val();

            if (state && state.timestamp > Date.now() - 3600000) {
                console.log('Restoring state from Firebase:', state);
                
                // Restore saved image path first
                if (state.imagePath) {
                    this.imagePath = state.imagePath;
                    await this.loadImage(); // Reload image with saved path
                }

                // Restore game state
                this.tiles = state.tiles;
                this.moves = state.moves;
                this.gameStarted = true;
                this.gameStartTime = state.gameStartTime;
                this.timeLimit = state.timeLimit;

                // Update session storage
                sessionStorage.setItem('gameStartTime', state.gameStartTime.toString());
                sessionStorage.setItem('gameTimeLimit', state.timeLimit.toString());
                sessionStorage.setItem('gameStarted', 'true');
                sessionStorage.setItem('puzzleState', JSON.stringify(state));
                sessionStorage.setItem('imagePath', state.imagePath);

                // Recreate board and start timer
                await this.createBoard();
                this.updateMoves();
                if (this.gameStarted) {
                    this.board.classList.remove('complete-state');
                    this.startTimer();
                }

                return true;
            }
        } catch (error) {
            console.error('Error restoring state:', error);
            // Try session storage as fallback
            const savedState = sessionStorage.getItem('puzzleState');
            const savedImagePath = sessionStorage.getItem('imagePath');
            
            if (savedState && savedImagePath) {
                const state = JSON.parse(savedState);
                this.imagePath = savedImagePath;
                await this.loadImage();
                this.tiles = state.tiles;
                this.moves = state.moves;
                this.gameStarted = true;
                this.gameStartTime = state.gameStartTime;
                this.timeLimit = state.timeLimit;
                await this.createBoard();
                this.updateMoves();
                this.startTimer();
                return true;
            }
        }
        return false;
    }

    // Add cleanup method
    cleanup() {
        clearInterval(this.timerInterval);
        // Remove all event listeners
        this.board.removeEventListener('click', this.handleInteraction);
        this.board.removeEventListener('touchstart', this.handleTouch);
    }

    listenForGameStart() {
        const gameStateRef = ref(realtimeDb, 'gameState');
        onValue(gameStateRef, async (snapshot) => {
            const gameState = snapshot.val();
            if (!gameState) return;

            // Store start time immediately when received
            if (gameState.startTime) {
                this.gameStartTime = gameState.startTime;
                this.timeLimit = gameState.timeLimit;
                sessionStorage.setItem('gameStartTime', gameState.startTime);
                sessionStorage.setItem('gameTimeLimit', gameState.timeLimit);
            }

            // Only start when server indicates ready
            if (gameState.started && !this.gameStarted) {
                this.init();
                this.startTimer();
            }
        });
    }

    async startGame() {
        if (this.gameStarted) return;

        // Ensure we have player data
        if (!this.playerName || !this.playerId) {
            this.playerId = sessionStorage.getItem('playerId');
            this.playerName = sessionStorage.getItem('playerName');
            
            if (!this.playerId || !this.playerName) {
                console.error('Missing player data');
                return;
            }
        }

        // Initialize game state
        this.gameStarted = true;
        this.moves = 0;
        this.updateMoves();
        this.board.classList.remove('complete-state');

        // Reset game start time to current time
        this.gameStartTime = Date.now();
        sessionStorage.setItem('personalStartTime', this.gameStartTime.toString());
        
        // Shuffle board and start timer
        this.shuffleBoard();
        
        // Save initial state
        await this.saveState();
        
        // Start timer after everything is ready
        if (!this.timerInterval) {
            this.startTimer();
        }
    }

    async showCountdown() {
        return new Promise(resolve => {
            const countdownOverlay = document.getElementById('countdownOverlay');
            const countdownDisplay = document.getElementById('countdown');
            
            if (!countdownOverlay || !countdownDisplay) {
                console.error('Countdown elements not found');
                resolve();
                return;
            }

            countdownOverlay.style.display = 'flex';
            countdownOverlay.style.opacity = '1';
            let count = 5;
            
            const updateCount = () => {
                if (count <= 0) {
                    countdownDisplay.textContent = 'Start!';
                    setTimeout(() => {
                        countdownOverlay.style.opacity = '0';
                        setTimeout(() => {
                            countdownOverlay.style.display = 'none';
                            resolve();
                        }, 300);
                    }, 500);
                    return;
                }
                
                countdownDisplay.textContent = count;
                count--;
                setTimeout(updateCount, 1000);
            };
            
            updateCount();
        });
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .tile {
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                transition: transform 0.2s ease;
                will-change: transform;
            }
            .tile-dragging {
                opacity: 0.9;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            }
            .tile:not(.empty):active {
                transition: transform 0.1s ease;
            }
        `;
        document.head.appendChild(style);

        const completionStyles = `
            .completion-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            }
            
            .completion-content {
                background: white;
                padding: 2rem;
                border-radius: 12px;
                text-align: center;
                animation: popIn 0.3s ease-out;
            }
            
            .completion-details {
                margin: 1rem 0;
                font-size: 1.2rem;
            }
            
            .completion-message {
                margin-top: 1rem;
                color: #4CAF50;
                font-weight: bold;
            }
            
            .warning {
                color: #f44336;
                margin-top: 1rem;
            }
            
            @keyframes popIn {
                from { transform: scale(0.8); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
        `;

        const styleCompletion = document.createElement('style');
        styleCompletion.textContent = completionStyles;
        document.head.appendChild(styleCompletion);
    }

    async handleGameCompletion(isTimeout = false) {
        // ...existing completion logic...
    
        // Clear game-specific data but keep player identity
        const playerId = sessionStorage.getItem('playerId');
        const playerName = sessionStorage.getItem('playerName');
        const firestoreDocId = sessionStorage.getItem('firestoreDocId');
    
        // Store completion data temporarily
        const completionData = {
            status: isTimeout ? 'timeout' : 'completed',
            moves: this.moves,
            time: isTimeout ? null : (Date.now() - this.gameStartTime)
        };
        sessionStorage.setItem('completionData', JSON.stringify(completionData));
    
        // Clear other game data
        sessionStorage.clear();
    
        // Restore essential data
        sessionStorage.setItem('playerId', playerId);
        sessionStorage.setItem('playerName', playerName);
        sessionStorage.setItem('firestoreDocId', firestoreDocId);
        sessionStorage.setItem('completionData', JSON.stringify(completionData));
    
        // Clear game-specific localStorage
        const gameKeys = ['gameState', 'puzzleState'];
        gameKeys.forEach(key => localStorage.removeItem(key));
    
        // Redirect to appropriate page
        window.location.href = isTimeout ? 'waiting_leaderboard.html' : 'waiting.html';
    }
}

// Add this CSS to your stylesheet
const style = document.createElement('style');
style.textContent = `
    .tile.touching {
        opacity: 0.8;
        z-index: 10;
    }
    .tile {
        touch-action: none;
        transition: transform 0.2s ease;
        will-change: transform;
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
    const puzzle = new SlidingPuzzle();
    puzzle.addStyles();
    window._slidingPuzzle = puzzle; // Store instance for global access if needed
});
