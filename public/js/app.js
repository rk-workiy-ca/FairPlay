/**
 * FairPlay Rummy POC - Main Application Controller
 * Handles screen management, socket connections, and game state
 */

class FairPlayApp {
    constructor() {
        this.socket = null;
        this.gameState = null;
        this.playerId = null;
        this.playerName = null;
        this.gameId = null;
        this.currentScreen = 'loading';
        this.hand = [];
        this.selectedCard = null;
        this.turnTimer = null;
        this.handOrder = [];
        this.lastAction = null;
        this.lastDrawnCardId = null;
        this.lastDiscardedCardId = null;
        this.selectedPlayerCount = 4; // Default to 4 players
        this.isDropped = false; // Track if player has been dropped
        
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        console.log('🃏 FairPlay Rummy POC Starting...');
        
        // Initialize socket connection
        this.initSocket();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Show join screen after brief loading
        setTimeout(() => {
            this.showScreen('join');
        }, 2000);
    }

    /**
     * Initialize Socket.io connection
     */
    initSocket() {
        this.socket = io();
        
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server:', this.socket.id);
            UI.showMessage('Connected to server', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            UI.showMessage('Connection lost. Trying to reconnect...', 'error');
        });

        this.socket.on('error', (data) => {
            console.error('Socket error:', data);
            UI.showMessage(data.message, 'error');
        });

        // Game events
        this.socket.on('game_joined', (data) => {
            console.log('Game joined:', data);
            this.playerId = data.playerId;
            this.playerName = data.playerName;
            this.gameId = data.gameId;
            this.showScreen('waiting');
            UI.showMessage(`Joined game as ${data.playerName}`, 'success');
            
            // Start the wait timer for AI bots
            UI.startWaitTimer();
        });

        this.socket.on('game_state_update', (data) => {
            console.log('Game state update received:', data);
            const previousTurn = this.gameState ? this.gameState.currentTurn : null;
            const newTurn = data.currentTurn;
            const wasMyTurn = previousTurn !== null && this.gameState && this.gameState.players[previousTurn] && this.gameState.players[previousTurn].id === this.playerId;
            const isMyTurn = data.players[newTurn] && data.players[newTurn].id === this.playerId;
            
            console.log(`Turn change: Previous turn: ${previousTurn}, New turn: ${newTurn}`);
            console.log(`Was my turn: ${wasMyTurn}, Is my turn: ${isMyTurn}`);
            console.log(`Current timer state: ${!!this.turnTimer}`);
            
            this.gameState = data;
            this.updateGameDisplay();
            
            // ALWAYS stop timer first on any state update - NO EXCEPTIONS
            console.log('=== FORCING TIMER STOP ===');
            this.stopTurnTimer();
            this.forceResetTimer();
            
            // Double-check timer is stopped
            if (this.turnTimer) {
                console.log('ERROR: Timer still running after stop! Forcing stop again...');
                clearInterval(this.turnTimer);
                this.turnTimer = null;
            }
            
            // If turn changed from me to someone else, ensure timer is stopped
            if (wasMyTurn && !isMyTurn) {
                console.log('=== TURN CHANGED FROM ME TO SOMEONE ELSE ===');
                console.log('Ensuring timer is completely stopped...');
                this.stopTurnTimer();
                this.forceResetTimer();
                UI.disablePlayerActions();
            }
            
            // If it's not my turn, ensure timer is stopped
            if (!isMyTurn) {
                console.log('=== NOT MY TURN ===');
                console.log('Ensuring timer is stopped and actions disabled...');
                this.stopTurnTimer();
                this.forceResetTimer();
                UI.disablePlayerActions();
            }
            
            // Only start timer if it's actually my turn
            if (isMyTurn) {
                console.log('=== IT IS MY TURN ===');
                console.log('Starting timer after delay...');
                UI.enablePlayerActions();
                setTimeout(() => {
                    console.log('Starting timer now...');
                    this.synchronizeTimer();
                }, 100);
            }
            
            console.log(`Timer state after update: ${!!this.turnTimer}`);
        });

        // Handle hand updates (when player draws or discards)
        this.socket.on('hand_update', (data) => {
            console.log('Hand updated:', data);
            this.hand = data.hand;
            
            // Use handOrder to preserve arrangement
            if (!this.handOrder || !Array.isArray(this.handOrder)) {
                this.handOrder = this.hand.map(card => card.id);
            }
            if (this.lastAction === 'draw' && this.lastDrawnCardId) {
                // Add the drawn card to the end if not present
                if (!this.handOrder.includes(this.lastDrawnCardId)) {
                    this.handOrder.push(this.lastDrawnCardId);
                }
            }
            if (this.lastAction === 'discard' && this.lastDiscardedCardId) {
                // Remove the discarded card from handOrder
                this.handOrder = this.handOrder.filter(id => id !== this.lastDiscardedCardId);
            }
            // Remove any IDs not in the new hand (e.g., after server-side changes)
            this.handOrder = this.handOrder.filter(id => this.hand.some(card => card.id === id));
            // Add any new card IDs at the end (should only happen on draw)
            this.hand.forEach(card => {
                if (!this.handOrder.includes(card.id)) {
                    this.handOrder.push(card.id);
                }
            });
            // Reorder hand array
            const idToCard = Object.fromEntries(this.hand.map(card => [card.id, card]));
            const ordered = this.handOrder.map(id => idToCard[id]).filter(Boolean);
            if (ordered.length === this.hand.length) {
                this.hand = ordered;
            }
            
            // Update the hand display with the arranged cards
            this.updateHandDisplay();
            
            // If we just got a hand update and it's not our turn anymore, stop the timer
            if (this.gameState && !this.isMyTurn()) {
                console.log('Hand updated but not my turn - stopping timer');
                this.stopTurnTimer();
                this.forceResetTimer();
            }
            
            // Reset lastAction
            this.lastAction = null;
            this.lastDrawnCardId = null;
            this.lastDiscardedCardId = null;
        });

        this.socket.on('card_drawn', (data) => {
            console.log('Card drawn:', data);
            this.lastDrawnCardId = data.card.id;
            UI.showMessage(`Drew ${data.card.displayName} from ${data.source}`, 'info');
        });

        // Handle card discarded event
        this.socket.on('card_discarded', (data) => {
            console.log('Card discarded:', data);
            // Update discard pile display
            UI.updateDiscardPile(data.discardedCard);
            
            // If this was our discard, immediately stop timer
            if (data.playerId === this.playerId) {
                console.log('I discarded a card - stopping timer immediately');
                this.stopTurnTimer();
                this.forceResetTimer();
            }
        });

        this.socket.on('player_dropped', (data) => {
            console.log('Player dropped:', data);
            if (data.playerId === this.playerId) {
                // Current player was dropped - log them out
                this.isDropped = true;
                UI.showMessage(`You were dropped from the game due to timeouts.`, 'error');
                setTimeout(() => {
                    this.goHome();
                }, 3000);
            } else {
                UI.showMessage(`${data.playerName} dropped from the game`, 'info');
            }
        });

        this.socket.on('player_disconnected', (data) => {
            console.log('Player disconnected:', data);
            UI.showMessage(`${data.playerName} disconnected`, 'info');
        });

        this.socket.on('player_timeout', (data) => {
            console.log('Player timeout:', data);
            if (data.playerId === this.playerId) {
                if (data.timeoutCount >= 3) {
                    UI.showMessage(`You timed out 3 times and were automatically dropped from the game.`, 'error');
                } else {
                    UI.showMessage(`You timed out (${data.timeoutCount}/3). ${data.remainingChances} chances left. Turn skipped.`, 'warning');
                }
            } else {
                UI.showMessage(`${data.playerName} timed out (${data.timeoutCount}/3). Turn skipped.`, 'info');
            }
        });

        this.socket.on('declaration_result', (data) => {
            console.log('Declaration result:', data);
            this.handleDeclarationResult(data);
        });

        this.socket.on('game_started', (data) => {
            console.log('Game started:', data);
            this.gameState = data.gameState;
            this.showScreen('game');
            // Stop the wait timer
            UI.hideWaitTimer();
            // Immediately update the game display to show other players
            this.updateGameDisplay();
            
            // ALWAYS stop and reset timer first
            console.log('Game started - stopping and resetting timer');
            this.stopTurnTimer();
            this.forceResetTimer();
            
            // Start periodic timer check
            this.startTimerCheck();
            
            // Request current hand
            this.socket.emit('get_hand');
            
            // Only start timer if it's our turn
            if (this.isMyTurn()) {
                console.log('Game started and it is my turn - starting timer');
                setTimeout(() => {
                    this.synchronizeTimer();
                }, 200);
            } else {
                console.log('Game started but not my turn - timer will remain stopped');
            }
            
            UI.showMessage('Game started! Your turn.', 'success');
        });

        this.socket.on('game_ended', (data) => {
            console.log('Game ended:', data);
            this.handleGameEnd(data);
        });

        // Handle turn timer start from backend
        this.socket.on('turn_timer_start', (data) => {
            console.log('=== TURN TIMER START FROM BACKEND ===', data);
            
            // Only start timer if it's our turn
            if (data.currentPlayerId === this.playerId) {
                console.log('Starting synchronized timer for my turn');
                this.startSynchronizedTimer(data.turnStartTime, data.timeLimit);
            } else {
                console.log('Not my turn, ensuring timer is stopped');
                this.stopTurnTimer();
                this.forceResetTimer();
            }
        });

        // Handle turn timer stop from backend
        this.socket.on('turn_timer_stop', (data) => {
            console.log('=== TURN TIMER STOP FROM BACKEND ===', data);
            console.log('Stopping timer due to backend timer stop');
            this.stopTurnTimer();
            this.forceResetTimer();
        });
    }

    /**
     * Start synchronized timer based on backend data
     */
    startSynchronizedTimer(turnStartTime, timeLimit) {
        console.log('=== STARTING SYNCHRONIZED TIMER ===');
        
        // Stop any existing timer
        this.stopTurnTimer();
        
        const timerElement = document.getElementById('turn-timer');
        if (!timerElement) {
            console.error('Timer element not found!');
            return;
        }
        
        // Calculate elapsed time since turn started
        const now = Date.now();
        const elapsed = now - turnStartTime;
        const remaining = Math.max(0, timeLimit - elapsed);
        
        console.log(`Turn started at: ${turnStartTime}, Now: ${now}, Elapsed: ${elapsed}ms, Remaining: ${remaining}ms`);
        
        // If time is already up, don't start timer
        if (remaining <= 0) {
            console.log('Time already expired, not starting timer');
            this.forceResetTimer();
            return;
        }
        
        // Calculate initial percentage
        const initialPercentage = (remaining / timeLimit) * 100;
        timerElement.style.setProperty('--timer-width', `${initialPercentage}%`);
        console.log(`Initial timer percentage: ${initialPercentage}%`);
        
        // Start countdown timer
        this.turnTimer = setInterval(() => {
            const currentTime = Date.now();
            const currentElapsed = currentTime - turnStartTime;
            const currentRemaining = Math.max(0, timeLimit - currentElapsed);
            const percentage = (currentRemaining / timeLimit) * 100;
            
            console.log(`Timer update - Remaining: ${currentRemaining}ms, Percentage: ${percentage}%`);
            
            if (timerElement) {
                timerElement.style.setProperty('--timer-width', `${percentage}%`);
            }
            
            if (currentRemaining <= 0) {
                console.log('Timer reached 0, stopping');
                this.stopTurnTimer();
            }
        }, 100); // Update every 100ms for smooth animation
        
        console.log('=== SYNCHRONIZED TIMER STARTED ===');
    }

    /**
     * Start turn timer (legacy method - now uses synchronized timer)
     */
    startTurnTimer() {
        console.log('=== STARTING TURN TIMER ===');
        
        // Double-check it's actually our turn before starting timer
        if (!this.isMyTurn()) {
            console.log('ERROR: Not my turn, refusing to start timer');
            return;
        }
        
        // Ensure any existing timer is stopped first
        this.stopTurnTimer();
        
        let timeLeft = 10; // 10 seconds per turn (matching backend)
        const timerElement = document.getElementById('turn-timer');
        
        if (!timerElement) {
            console.error('ERROR: Timer element not found!');
            return;
        }
        
        // Reset timer display
        timerElement.style.setProperty('--timer-width', '100%');
        console.log('Timer display reset to 100%');
        
        console.log('Creating timer interval...');
        this.turnTimer = setInterval(() => {
            timeLeft--;
            console.log(`Timer: ${timeLeft} seconds left`);
            
            if (timerElement) {
                const percentage = Math.max(0, (timeLeft / 10) * 100);
                timerElement.style.setProperty('--timer-width', `${percentage}%`);
            }
            
            if (timeLeft <= 0) {
                console.log('Timer reached 0, stopping');
                this.stopTurnTimer();
                // Don't show message here - let the server handle timeout
            }
        }, 1000);
        
        console.log('=== TIMER STARTED SUCCESSFULLY ===');
    }

    /**
     * Stop turn timer
     */
    stopTurnTimer() {
        console.log('=== STOPPING TURN TIMER ===');
        
        if (this.turnTimer) {
            console.log('Clearing timer interval...');
            clearInterval(this.turnTimer);
            this.turnTimer = null;
            console.log('Timer interval cleared');
        } else {
            console.log('No timer interval to clear');
        }
        
        // Force reset timer display
        const timerElement = document.getElementById('turn-timer');
        if (timerElement) {
            timerElement.style.setProperty('--timer-width', '100%');
            console.log('Timer display reset to 100% after stopping');
        } else {
            console.log('Timer element not found for reset');
        }
        
        console.log('=== TIMER STOPPED ===');
    }

    /**
     * Setup event listeners for UI elements
     */
    setupEventListeners() {
        // Join game button
        document.getElementById('join-game-btn').addEventListener('click', () => {
            this.joinGame();
        });

        // Player name input (Enter key)
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinGame();
            }
        });

        // Game action buttons
        document.getElementById('draw-deck-btn').addEventListener('click', () => {
            this.drawCard('deck');
        });

        document.getElementById('draw-discard-btn').addEventListener('click', () => {
            this.drawCard('discard');
        });

        document.getElementById('drop-btn').addEventListener('click', () => {
            this.dropGame();
        });

        document.getElementById('declare-btn').addEventListener('click', () => {
            this.openDeclarationModal();
        });

        // Declaration modal buttons
        document.getElementById('validate-btn').addEventListener('click', () => {
            this.validateDeclaration();
        });

        document.getElementById('confirm-declare-btn').addEventListener('click', () => {
            this.confirmDeclaration();
        });

        document.getElementById('cancel-declare-btn').addEventListener('click', () => {
            this.closeDeclarationModal();
        });

        // Game over buttons
        document.getElementById('play-again-btn').addEventListener('click', () => {
            this.playAgain();
        });

        document.getElementById('home-btn').addEventListener('click', () => {
            this.goHome();
        });

        // Deck and discard pile clicks
        document.getElementById('deck-pile').addEventListener('click', () => {
            this.drawCard('deck');
        });

        document.getElementById('discard-pile').addEventListener('click', () => {
            this.drawCard('discard');
        });
    }

    /**
     * Join a game
     */
    joinGame() {
        const playerNameInput = document.getElementById('player-name');
        const playerName = playerNameInput.value.trim();
        
        if (!playerName) {
            UI.showError('join-error', 'Please enter your name');
            playerNameInput.focus();
            return;
        }

        const selectedPlayers = document.querySelector('input[name="players"]:checked').value;
        this.selectedPlayerCount = parseInt(selectedPlayers);
        
        console.log(`Joining game: ${playerName}, ${selectedPlayers} players`);
        
        this.socket.emit('join_game', {
            playerName: playerName,
            maxPlayers: this.selectedPlayerCount
        });

        // Disable the button to prevent multiple requests
        document.getElementById('join-game-btn').disabled = true;
        UI.clearError('join-error');
    }

    /**
     * Draw a card from deck or discard pile
     */
    drawCard(source = 'deck') {
        if (!this.isMyTurn()) {
            UI.showMessage("It's not your turn", 'error');
            return;
        }

        if (this.hand.length >= 14) {
            UI.showMessage("You already have 14 cards. Discard one first.", 'error');
            return;
        }

        console.log(`Drawing card from ${source}`);
        this.lastAction = 'draw';
        
        // Immediately stop timer when drawing
        console.log('Drawing card - stopping timer');
        this.stopTurnTimer();
        
        this.socket.emit('draw_card', { source });
    }

    /**
     * Discard a card
     */
    discardCard(cardId) {
        if (!this.isMyTurn()) {
            UI.showMessage("It's not your turn", 'error');
            return;
        }

        if (this.hand.length <= 13) {
            UI.showMessage("Draw a card first, then double-click a card to discard it", 'error');
            return;
        }

        console.log(`Discarding card: ${cardId}`);
        this.lastAction = 'discard';
        this.lastDiscardedCardId = cardId;
        
        // Immediately stop timer when discarding
        console.log('Discarding card - stopping timer');
        this.stopTurnTimer();
        
        this.socket.emit('discard_card', { cardId });
        this.selectedCard = null;
    }

    /**
     * Drop from the game
     */
    dropGame() {
        if (confirm('Are you sure you want to drop from the game? You will get penalty points.')) {
            console.log('Dropping from game');
            this.socket.emit('drop_game', { dropType: 'middle' });
        }
    }

    /**
     * Open declaration modal
     */
    openDeclarationModal() {
        if (!this.isMyTurn()) {
            UI.showMessage("It's not your turn", 'error');
            return;
        }

        if (this.hand.length !== 13) {
            UI.showMessage("You must have exactly 13 cards to declare", 'error');
            return;
        }

        UI.openDeclarationModal(this.hand);
    }

    /**
     * Close declaration modal
     */
    closeDeclarationModal() {
        UI.closeDeclarationModal();
    }

    /**
     * Validate declaration in modal
     */
    validateDeclaration() {
        const groups = UI.getDeclarationGroups();
        // For now, just show a placeholder validation
        UI.showValidationResult(true, "Validation feature coming soon!");
    }

    /**
     * Confirm declaration
     */
    confirmDeclaration() {
        const groups = UI.getDeclarationGroups();
        
        if (groups.length === 0) {
            UI.showMessage("Please arrange your cards into groups", 'error');
            return;
        }

        console.log('Declaring hand with groups:', groups);
        this.socket.emit('declare_hand', { groups });
        this.closeDeclarationModal();
    }

    /**
     * Handle declaration result
     */
    handleDeclarationResult(data) {
        if (data.isValid) {
            UI.showMessage("Valid declaration! You won!", 'success');
        } else {
            UI.showMessage("Invalid declaration. 80 point penalty.", 'error');
        }
    }

    /**
     * Handle game end
     */
    handleGameEnd(data) {
        console.log('Game ended:', data);
        
        setTimeout(() => {
            this.showScreen('game-over');
            UI.showGameResult(data);
        }, 2000);
    }

    /**
     * Play again
     */
    playAgain() {
        this.resetGame();
        this.showScreen('join');
    }

    /**
     * Go to home screen
     */
    goHome() {
        this.resetGame();
        this.showScreen('join');
    }

    /**
     * Reset game state
     */
    resetGame() {
        this.gameState = null;
        this.playerId = null;
        this.playerName = null;
        this.gameId = null;
        this.hand = [];
        this.selectedCard = null;
        this.isDropped = false; // Reset dropped status
        
        if (this.turnTimer) {
            clearInterval(this.turnTimer);
            this.turnTimer = null;
        }
        
        // Stop periodic timer check
        this.stopTimerCheck();

        // Re-enable join button
        document.getElementById('join-game-btn').disabled = false;
        
        // Clear forms
        document.getElementById('player-name').value = '';
        UI.clearError('join-error');
    }

    /**
     * Check if it's the current player's turn
     */
    isMyTurn() {
        if (!this.gameState || !this.playerId) return false;
        
        const currentPlayer = this.gameState.players[this.gameState.currentTurn];
        return currentPlayer && currentPlayer.id === this.playerId;
    }

    /**
     * Force reset timer display
     */
    forceResetTimer() {
        const timerElement = document.getElementById('turn-timer');
        if (timerElement) {
            timerElement.style.setProperty('--timer-width', '100%');
            console.log('Force reset timer display to 100%');
            console.log('Timer element found and width set to 100%');
        } else {
            console.error('Timer element not found for force reset!');
        }
    }

    /**
     * Synchronize timer with game state
     */
    synchronizeTimer() {
        if (!this.gameState || this.currentScreen !== 'game') {
            console.log('SynchronizeTimer: Not in game or no game state');
            return;
        }
        
        const isMyTurn = this.isMyTurn();
        const currentPlayer = this.gameState.players[this.gameState.currentTurn];
        console.log(`Synchronizing timer - Is my turn: ${isMyTurn}, Is dropped: ${this.isDropped}, Current player: ${currentPlayer ? currentPlayer.name : 'unknown'}`);
        
        // ALWAYS stop the timer first to ensure clean reset
        console.log('Stopping timer before synchronization');
        this.stopTurnTimer();
        
        // Force reset timer display
        this.forceResetTimer();
        
        // If player is dropped, disable all actions
        if (this.isDropped) {
            console.log('Player is dropped, disabling actions');
            UI.disablePlayerActions();
            return;
        }
        
        // If it's our turn, start the timer and enable actions
        if (isMyTurn) {
            console.log('Starting timer for my turn');
            UI.enablePlayerActions();
            // Small delay to ensure UI is updated before starting timer
            setTimeout(() => {
                console.log('Starting timer after delay');
                this.startTurnTimer();
            }, 100);
        } else {
            // If it's not our turn, disable actions and ensure timer is stopped
            console.log('Not my turn, disabling actions and ensuring timer is stopped');
            UI.disablePlayerActions();
            // Double-check timer is stopped
            if (this.turnTimer) {
                console.log('Timer was still running, stopping it again');
                this.stopTurnTimer();
            }
        }
    }

    /**
     * Update hand display
     */
    updateHandDisplay() {
        if (this.hand && this.hand.length > 0) {
            UI.updatePlayerHand(this.hand);
        }
    }

    /**
     * Update game display
     */
    updateGameDisplay() {
        if (!this.gameState) return;

        // Update game state display
        UI.updateGameState(this.gameState, this.playerId);
        
        // Update turn display
        UI.updateTurnDisplay(this.gameState, this.playerId);
        
        // Update hand count
        const handCountEl = document.getElementById('hand-count');
        if (handCountEl) {
            handCountEl.textContent = `${this.hand ? this.hand.length : 0} cards`;
        }
    }

    /**
     * Show a specific screen
     */
    showScreen(screenName) {
        console.log(`Switching to screen: ${screenName}`);
        
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show target screen
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenName;
        }
    }

    /**
     * Handle card selection
     */
    selectCard(cardElement, cardId) {
        // Remove previous selection
        document.querySelectorAll('.card.selected').forEach(card => {
            card.classList.remove('selected');
        });

        // Select new card
        if (this.selectedCard === cardId) {
            this.selectedCard = null;
        } else {
            this.selectedCard = cardId;
            cardElement.classList.add('selected');
        }
    }

    /**
     * Make a declaration (automatic or manual)
     */
    makeDeclaration() {
        if (!this.isMyTurn()) {
            UI.showMessage("It's not your turn", 'error');
            return;
        }

        if (this.hand.length !== 13) {
            UI.showMessage("You must have exactly 13 cards to declare", 'error');
            return;
        }

        // Try automatic arrangement first
        const autoArrangement = UI.findValidArrangement(this.hand);
        if (autoArrangement && autoArrangement.isValid) {
            // Auto-declare if valid arrangement found
            const groups = autoArrangement.groups.map(group => 
                group.cards.map(card => card.id)
            );
            
            console.log('Auto-declaring with groups:', groups);
            this.socket.emit('declare_hand', { groups });
            UI.showMessage('🎉 Auto-declaration submitted!', 'success');
        } else {
            // Fallback to manual declaration modal
            UI.openDeclarationModal(this.hand);
        }
    }

    /**
     * Handle card discard with improved feedback
     */
    handleCardDiscard(cardId) {
        if (!this.isMyTurn()) {
            UI.showMessage("It's not your turn", 'error');
            return;
        }

        if (this.hand.length <= 13) {
            UI.showMessage("Draw a card first, then double-click a card to discard it", 'error');
            return;
        }

        // Find and remove card from local hand for immediate UI feedback
        const cardIndex = this.hand.findIndex(card => card.id === cardId);
        if (cardIndex !== -1) {
            const discardedCard = this.hand[cardIndex];
            
            // Remove card from UI immediately
            const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
            if (cardEl) {
                cardEl.style.transition = 'all 0.3s ease';
                cardEl.style.transform = 'scale(0)';
                cardEl.style.opacity = '0';
                setTimeout(() => {
                    if (cardEl.parentNode) {
                        cardEl.parentNode.removeChild(cardEl);
                    }
                }, 300);
            }
            
            // Update hand count immediately
            const handCountEl = document.getElementById('hand-count');
            if (handCountEl) {
                handCountEl.textContent = `${this.hand.length - 1} cards`;
            }
            // Remove from handOrder
            if (this.handOrder) {
                this.handOrder = this.handOrder.filter(id => id !== cardId);
            }
        }

        console.log(`Discarding card: ${cardId}`);
        this.socket.emit('discard_card', { cardId });
        this.selectedCard = null;
    }

    /**
     * Start periodic timer check
     */
    startTimerCheck() {
        // Check timer every 500ms to ensure it stays synchronized
        this.timerCheckInterval = setInterval(() => {
            if (this.currentScreen === 'game' && this.gameState) {
                const isMyTurn = this.isMyTurn();
                const timerElement = document.getElementById('turn-timer');
                
                console.log(`Timer check: Is my turn: ${isMyTurn}, Timer running: ${!!this.turnTimer}`);
                
                // If it's my turn but no timer is running, restart it
                if (isMyTurn && !this.turnTimer && timerElement) {
                    console.log('Timer check: Restarting timer for my turn');
                    this.startTurnTimer();
                }
                // If it's not my turn but timer is running, stop it immediately
                else if (!isMyTurn && this.turnTimer) {
                    console.log('Timer check: ERROR - Timer running when not my turn! Stopping immediately...');
                    this.stopTurnTimer();
                    this.forceResetTimer();
                    UI.disablePlayerActions();
                }
                // If it's not my turn, ensure timer display is reset
                else if (!isMyTurn) {
                    this.forceResetTimer();
                }
            }
        }, 500); // Check every 500ms for faster response
    }

    /**
     * Stop periodic timer check
     */
    stopTimerCheck() {
        if (this.timerCheckInterval) {
            clearInterval(this.timerCheckInterval);
            this.timerCheckInterval = null;
        }
    }

    /**
     * Test timer functionality (for debugging)
     */
    testTimer() {
        console.log('=== TESTING TIMER ===');
        const timerElement = document.getElementById('turn-timer');
        if (timerElement) {
            console.log('Timer element found');
            console.log('Current timer width:', timerElement.style.getPropertyValue('--timer-width'));
            
            // Test setting different widths
            timerElement.style.setProperty('--timer-width', '50%');
            console.log('Set timer to 50%');
            
            setTimeout(() => {
                timerElement.style.setProperty('--timer-width', '25%');
                console.log('Set timer to 25%');
            }, 1000);
            
            setTimeout(() => {
                timerElement.style.setProperty('--timer-width', '100%');
                console.log('Reset timer to 100%');
            }, 2000);
        } else {
            console.error('Timer element not found!');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FairPlayApp();
});

// Add updateCardOrder method to FairPlayApp prototype
FairPlayApp.prototype.updateCardOrder = function() {
    // Get current card order from DOM
    const handCardsEl = document.getElementById('hand-cards');
    if (!handCardsEl || !this.gameState || !this.gameState.playerHand) return;
    
    const cardElements = handCardsEl.querySelectorAll('.card[data-card-id]');
    const newOrder = Array.from(cardElements).map(el => el.dataset.cardId);
    
    // Reorder the hand array to match DOM order
    const reorderedHand = [];
    newOrder.forEach(cardId => {
        const card = this.gameState.playerHand.find(c => c.id === cardId);
        if (card) {
            reorderedHand.push(card);
        }
    });
    
    // Update the game state
    if (reorderedHand.length === this.gameState.playerHand.length) {
        this.gameState.playerHand = reorderedHand;
    }
    // Also update handOrder for persistence
    if (window.app) {
        window.app.handOrder = newOrder;
    }
};

// Export for use in other files
window.FairPlayApp = FairPlayApp;