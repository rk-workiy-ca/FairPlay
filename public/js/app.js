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
        this.selectedCards = new Set(); // Track selected cards for grouping
        this.cardGroups = []; // Array of card groups [{id, cards, type, isValid}]
        this.nextGroupId = 1; // Counter for group IDs
        
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
        this.setupGroupingEventListeners();
        
        // Show join screen after brief loading
        setTimeout(() => {
            this.showScreen('join');
        }, 2000);
    }

    /**
     * Initialize Socket.io connection
     */
    initSocket() {
        this.socket = io('http://localhost:3000');
        
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
                // Reset drawn card tracking since turn is over
                this.lastDrawnCardId = null;
                console.log('Reset lastDrawnCardId since turn changed');
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
            const newHand = data.hand;
            
            // Initialize handOrder if it doesn't exist or is invalid
            if (!this.handOrder || !Array.isArray(this.handOrder)) {
                this.handOrder = [];
            }
            
            // Always preserve card arrangement by maintaining handOrder
            if (this.handOrder.length === 0) {
                // First time - initialize with current hand order
                this.handOrder = newHand.map(card => card.id);
                console.log('Initialized handOrder:', this.handOrder);
            } else {
                // Update handOrder based on what changed, but account for grouped cards
                const currentIds = this.hand.map(card => card.id);
                const groupedIds = this.cardGroups.flatMap(group => group.cards.map(card => card.id));
                const allCurrentIds = [...currentIds, ...groupedIds];
                const newIds = newHand.map(card => card.id);
                
                // Find added cards (drawn cards) - cards in newHand that aren't in our current total
                const addedIds = newIds.filter(id => !allCurrentIds.includes(id));
                // Find removed cards (discarded cards) - cards in our current that aren't in newHand
                const removedIds = allCurrentIds.filter(id => !newIds.includes(id));
                
                // Remove discarded cards from handOrder
                this.handOrder = this.handOrder.filter(id => !removedIds.includes(id));
                
                // Add new cards to the RIGHT END of handOrder (as requested)
                addedIds.forEach(id => {
                    if (!this.handOrder.includes(id)) {
                        this.handOrder.push(id); // Add to end
                        console.log('Added card to end:', id);
                    }
                });
                
                // Update hand to only include cards that aren't grouped
                const ungroupedCards = newHand.filter(card => !groupedIds.includes(card.id));
                
                // Clean up handOrder to only include ungrouped card IDs
                this.handOrder = this.handOrder.filter(id => ungroupedCards.some(card => card.id === id));
                console.log('Updated handOrder:', this.handOrder);
            }
            
            // ALWAYS apply the arrangement from handOrder, but only for ungrouped cards
            const groupedIds = this.cardGroups.flatMap(group => group.cards.map(card => card.id));
            const ungroupedCards = newHand.filter(card => !groupedIds.includes(card.id));
            const idToCard = Object.fromEntries(ungroupedCards.map(card => [card.id, card]));
            const orderedHand = this.handOrder.map(id => idToCard[id]).filter(Boolean);
            
            // Use handOrder arrangement for ungrouped cards
            if (orderedHand.length === ungroupedCards.length && orderedHand.length > 0) {
                this.hand = orderedHand;
            } else {
                // If there's a mismatch, use server data for ungrouped cards and update handOrder
                console.log('Hand arrangement mismatch, using server order for ungrouped cards');
                this.hand = ungroupedCards;
                this.handOrder = ungroupedCards.map(card => card.id);
            }
            
            // Update the hand display
            this.updateHandDisplay();
            
            // If we just got a hand update and it's not our turn anymore, stop the timer
            if (this.gameState && !this.isMyTurn()) {
                console.log('Hand updated but not my turn - stopping timer');
                this.stopTurnTimer();
                this.forceResetTimer();
            }
            
            // Reset action tracking (but keep lastDrawnCardId until discard)
            this.lastAction = null;
            this.lastDiscardedCardId = null;
        });

        this.socket.on('card_drawn', (data) => {
            console.log('Card drawn event received:', data);
            this.lastDrawnCardId = data.card.id;
            console.log('Set lastDrawnCardId to:', this.lastDrawnCardId);
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

        // Handle card returned event (when timeout occurs after drawing)
        this.socket.on('card_returned', (data) => {
            console.log('Card returned:', data);
            if (data.playerId === this.playerId) {
                UI.showMessage(`Time expired! Your drawn card was returned to the ${data.returnedTo}`, 'warning');
            } else {
                UI.showMessage(`${data.playerName}'s drawn card was returned due to timeout`, 'info');
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
        
        // Initialize countdown display
        const countdownEl = document.getElementById('timer-countdown');
        if (countdownEl) {
            const initialSeconds = Math.ceil(remaining / 1000);
            countdownEl.textContent = initialSeconds;
            countdownEl.classList.remove('warning');
        }
        
        // Start countdown timer
        this.turnTimer = setInterval(() => {
            const currentTime = Date.now();
            const currentElapsed = currentTime - turnStartTime;
            const currentRemaining = Math.max(0, timeLimit - currentElapsed);
            const percentage = (currentRemaining / timeLimit) * 100;
            
            // Update progress bar
            if (timerElement) {
                timerElement.style.setProperty('--timer-width', `${percentage}%`);
            }
            
            // Update countdown text
            const countdownEl = document.getElementById('timer-countdown');
            if (countdownEl) {
                const secondsLeft = Math.ceil(currentRemaining / 1000);
                countdownEl.textContent = secondsLeft;
                
                // Add warning class when less than 10 seconds
                if (secondsLeft <= 10) {
                    countdownEl.classList.add('warning');
                } else {
                    countdownEl.classList.remove('warning');
                }
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
        
        let timeLeft = 30; // 30 seconds per turn (matching backend)
        const timerElement = document.getElementById('turn-timer');
        
        if (!timerElement) {
            console.error('ERROR: Timer element not found!');
            return;
        }
        
        // Reset timer display
        timerElement.style.setProperty('--timer-width', '100%');
        console.log('Timer display reset to 100%');
        
        // Initialize countdown display
        const countdownEl = document.getElementById('timer-countdown');
        if (countdownEl) {
            countdownEl.textContent = timeLeft;
            countdownEl.classList.remove('warning');
        }
        
        console.log('Creating timer interval...');
        this.turnTimer = setInterval(() => {
            timeLeft--;
            console.log(`Timer: ${timeLeft} seconds left`);
            
            if (timerElement) {
                const percentage = Math.max(0, (timeLeft / 30) * 100);
                timerElement.style.setProperty('--timer-width', `${percentage}%`);
            }
            
            // Update countdown text
            const countdownEl = document.getElementById('timer-countdown');
            if (countdownEl) {
                countdownEl.textContent = timeLeft;
                
                // Add warning class when less than 10 seconds
                if (timeLeft <= 10) {
                    countdownEl.classList.add('warning');
                } else {
                    countdownEl.classList.remove('warning');
                }
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
        
        // Update hand count (include grouped cards in total)
        const handCountEl = document.getElementById('hand-count');
        if (handCountEl) {
            const handCards = this.hand ? this.hand.length : 0;
            const groupedCards = this.cardGroups ? this.cardGroups.reduce((total, group) => total + group.cards.length, 0) : 0;
            const totalCards = handCards + groupedCards;
            handCountEl.textContent = `${totalCards} cards`;
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
     * Make a declaration (using existing groups if available)
     */
    makeDeclaration() {
        if (!this.isMyTurn()) {
            UI.showMessage("It's not your turn", 'error');
            return;
        }

        // Calculate total cards (grouped + ungrouped)
        const groupedCardCount = this.cardGroups.reduce((count, group) => count + group.cards.length, 0);
        const totalCards = groupedCardCount + this.hand.length;

        if (totalCards !== 13) {
            UI.showMessage("You must have exactly 13 cards to declare", 'error');
            return;
        }

        // Use existing groups if available
        if (this.cardGroups.length > 0) {
            // Check if all groups are valid and we have at least one pure sequence
            const allGroupsValid = this.cardGroups.every(group => group.isValid);
            const hasPureSequence = this.cardGroups.some(group => 
                group.type === 'sequence' && group.cards.every(card => !card.isJoker)
            );

            if (allGroupsValid && hasPureSequence && this.hand.length <= 1) {
                // Use existing groups for declaration
                const groups = this.cardGroups.map(group => 
                    group.cards.map(card => card.id)
                );
                
                // Add remaining ungrouped cards as a final group (if any)
                if (this.hand.length > 0) {
                    groups.push(this.hand.map(card => card.id));
                }
                
                console.log('Declaring with existing groups:', groups);
                this.socket.emit('declare_hand', { groups });
                UI.showMessage('🎉 Declaration submitted using your groups!', 'success');
                return;
            } else {
                UI.showMessage('Your groups are not valid for declaration. Need at least one pure sequence and all valid groups.', 'error');
                return;
            }
        }

        // If no groups exist, use only hand cards for automatic arrangement
        if (this.hand.length !== 13) {
            UI.showMessage("You must have exactly 13 cards to declare", 'error');
            return;
        }

        // Try automatic arrangement first using hand cards only
        const autoArrangement = UI.findValidArrangement(this.hand);
        if (autoArrangement && autoArrangement.isValid) {
            // Auto-declare if valid arrangement found
            const groups = autoArrangement.groups.map(group => 
                group.cards.map(card => card.id)
            );
            
            console.log('Auto-declaring with automatic arrangement:', groups);
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

        if (!this.lastDrawnCardId) {
            UI.showMessage("Draw a card first, then double-click a card to discard it", 'error');
            return;
        }

        // Just emit the discard event - let the server handle the logic
        // The UI will be updated when we receive the hand_update event
        console.log(`Discarding card: ${cardId}`);
        this.socket.emit('discard_card', { cardId });
        this.selectedCard = null;
        // Reset drawn card tracking after discarding
        this.lastDrawnCardId = null;
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

    /**
     * Setup card grouping event listeners
     */
    setupGroupingEventListeners() {
        // Auto group button
        const autoGroupBtn = document.getElementById('auto-group-btn');
        if (autoGroupBtn) {
            autoGroupBtn.addEventListener('click', () => {
                this.autoGroupCards();
            });
        }

        // Group selected button
        const groupSelectedBtn = document.getElementById('group-selected-btn');
        if (groupSelectedBtn) {
            groupSelectedBtn.addEventListener('click', () => {
                this.groupSelectedCards();
            });
        }

        // Clear groups button
        const clearGroupsBtn = document.getElementById('clear-groups-btn');
        if (clearGroupsBtn) {
            clearGroupsBtn.addEventListener('click', () => {
                this.clearAllGroups();
            });
        }
    }

    /**
     * Toggle card selection
     */
    toggleCardSelection(cardId) {
        console.log('toggleCardSelection called for card:', cardId);
        console.log('Current selectedCards:', Array.from(this.selectedCards));
        
        if (this.selectedCards.has(cardId)) {
            this.selectedCards.delete(cardId);
            console.log('Removed card from selection');
        } else {
            this.selectedCards.add(cardId);
            console.log('Added card to selection');
        }
        
        console.log('Updated selectedCards:', Array.from(this.selectedCards));
        this.updateCardSelectionUI();
        this.updateSelectedCount();
    }

    /**
     * Update card selection UI
     */
    updateCardSelectionUI() {
        const handCardsEl = document.getElementById('hand-cards');
        if (!handCardsEl) return;

        handCardsEl.querySelectorAll('.card').forEach(cardEl => {
            const cardId = cardEl.dataset.cardId;
            if (this.selectedCards.has(cardId)) {
                cardEl.classList.add('selected');
            } else {
                cardEl.classList.remove('selected');
            }
        });
    }

    /**
     * Update selected card count display
     */
    updateSelectedCount() {
        const selectedCountEl = document.getElementById('selected-count');
        const groupSelectedBtn = document.getElementById('group-selected-btn');
        
        if (selectedCountEl) {
            selectedCountEl.textContent = `${this.selectedCards.size} selected`;
        }
        
        if (groupSelectedBtn) {
            groupSelectedBtn.disabled = this.selectedCards.size < 3;
        }
    }

    /**
     * Group selected cards
     */
    groupSelectedCards() {
        if (this.selectedCards.size < 3) {
            UI.showMessage('Select at least 3 cards to create a group', 'error');
            return;
        }

        const selectedCardIds = Array.from(this.selectedCards);
        const selectedCards = selectedCardIds.map(id => 
            this.hand.find(card => card.id === id)
        ).filter(Boolean);

        // Validate group
        const groupInfo = this.validateCardGroup(selectedCards);
        
        // Create group
        const group = {
            id: this.nextGroupId++,
            cards: selectedCards,
            type: groupInfo.type,
            isValid: groupInfo.isValid
        };

        this.cardGroups.push(group);
        
        // Remove grouped cards from hand
        this.hand = this.hand.filter(card => !this.selectedCards.has(card.id));
        this.handOrder = this.handOrder.filter(id => !this.selectedCards.has(id));
        
        // Clear selection
        this.selectedCards.clear();
        
        // Update displays
        this.updateHandDisplay();
        this.updateGroupsDisplay();
        this.updateSelectedCount();
        
        UI.showMessage(`Created ${groupInfo.isValid ? 'valid' : 'invalid'} ${groupInfo.type}`, 
                      groupInfo.isValid ? 'success' : 'warning');
    }

    /**
     * Auto group cards by color and type
     */
    autoGroupCards() {
        if (this.hand.length < 3) {
            UI.showMessage('Need at least 3 cards to create groups', 'error');
            return;
        }

        console.log('Auto-grouping started. Hand before clear:', this.hand.length, 'Groups before clear:', this.cardGroups.length);

        // Clear existing groups
        this.clearAllGroups();
        
        console.log('After clearAllGroups. Hand:', this.hand.length, 'Groups:', this.cardGroups.length);
        
        const remainingCards = [...this.hand];
        const groups = [];

        // Group by suit (color) first - regardless of validity
        const cardsBySuit = {};
        remainingCards.forEach(card => {
            if (!card.isJoker) {
                const suit = card.suit;
                if (!cardsBySuit[suit]) cardsBySuit[suit] = [];
                cardsBySuit[suit].push(card);
            }
        });

        // Group cards of same suit together (2+ cards)
        Object.keys(cardsBySuit).forEach(suit => {
            const suitCards = cardsBySuit[suit];
            if (suitCards.length >= 2) {
                // Sort by rank
                suitCards.sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
                
                // Create group regardless of sequence validity
                const groupInfo = this.validateCardGroup(suitCards);
                groups.push({
                    id: this.nextGroupId++,
                    cards: [...suitCards],
                    type: groupInfo.type,
                    isValid: groupInfo.isValid
                });
                
                // Remove from remaining cards
                suitCards.forEach(c => {
                    const index = remainingCards.findIndex(rc => rc.id === c.id);
                    if (index !== -1) remainingCards.splice(index, 1);
                });
            }
        });

        // Group remaining cards by rank (same number/face) - regardless of validity
        const cardsByRank = {};
        remainingCards.forEach(card => {
            if (!card.isJoker) {
                const rank = card.rank;
                if (!cardsByRank[rank]) cardsByRank[rank] = [];
                cardsByRank[rank].push(card);
            }
        });

        Object.keys(cardsByRank).forEach(rank => {
            const rankCards = cardsByRank[rank];
            if (rankCards.length >= 2) {
                const groupInfo = this.validateCardGroup(rankCards);
                groups.push({
                    id: this.nextGroupId++,
                    cards: [...rankCards],
                    type: groupInfo.type,
                    isValid: groupInfo.isValid
                });
                
                // Remove from remaining cards
                rankCards.forEach(c => {
                    const index = remainingCards.findIndex(rc => rc.id === c.id);
                    if (index !== -1) remainingCards.splice(index, 1);
                });
            }
        });

        // Add all groups to the game
        this.cardGroups = groups;
        
        // Remove all grouped cards from hand
        groups.forEach(group => {
            group.cards.forEach(card => {
                const handIndex = this.hand.findIndex(hc => hc.id === card.id);
                if (handIndex !== -1) this.hand.splice(handIndex, 1);
                
                const orderIndex = this.handOrder.findIndex(id => id === card.id);
                if (orderIndex !== -1) this.handOrder.splice(orderIndex, 1);
            });
        });

        console.log('After grouping. Hand:', this.hand.length, 'Groups:', this.cardGroups.length, 'Total cards:', this.hand.length + this.cardGroups.reduce((sum, g) => sum + g.cards.length, 0));

        this.updateHandDisplay();
        this.updateGroupsDisplay();
        
        const validGroups = groups.filter(g => g.isValid).length;
        const invalidGroups = groups.length - validGroups;
        UI.showMessage(`Created ${groups.length} groups (${validGroups} valid, ${invalidGroups} invalid)`, 'success');
    }

    /**
     * Validate if cards form a valid group
     */
    validateCardGroup(cards) {
        if (!cards || cards.length < 3) {
            return { isValid: false, type: 'invalid', reason: 'Need at least 3 cards' };
        }

        // Separate jokers from regular cards
        const jokers = cards.filter(c => c.isJoker);
        const nonJokers = cards.filter(c => !c.isJoker);

        // Check for set (same rank, different suits)
        if (nonJokers.length > 0) {
            const ranks = [...new Set(nonJokers.map(c => c.rank))];
            if (ranks.length === 1 && cards.length >= 3 && cards.length <= 4) {
                const suits = [...new Set(nonJokers.map(c => c.suit))];
                // For sets, we need different suits for non-jokers, jokers can fill remaining suits
                const totalSuits = suits.size + jokers.length;
                if (suits.size === nonJokers.length && totalSuits <= 4) {
                    return { isValid: true, type: 'set' };
                }
            }
        }

        // Check for sequence (consecutive ranks, same suit)
        if (cards.length >= 3) {
            if (nonJokers.length > 0) {
                const suits = [...new Set(nonJokers.map(c => c.suit))];
                if (suits.length === 1) {
                    const sortedCards = [...nonJokers].sort((a, b) => this.getCardValue(a) - this.getCardValue(b));
                    
                    // Check if non-jokers can form a sequence with jokers filling gaps
                    let gaps = 0;
                    for (let i = 1; i < sortedCards.length; i++) {
                        const gap = this.getCardValue(sortedCards[i]) - this.getCardValue(sortedCards[i-1]) - 1;
                        if (gap > 0) {
                            gaps += gap;
                        } else if (gap < 0) {
                            // Duplicate ranks - not a valid sequence
                            return { isValid: false, type: 'invalid', reason: 'Duplicate ranks in sequence' };
                        }
                    }
                    
                    // Can form sequence if jokers can fill all gaps
                    if (gaps <= jokers.length) {
                        return { isValid: true, type: 'sequence' };
                    }
                }
            } else if (jokers.length >= 3) {
                // All jokers can form any group
                return { isValid: true, type: 'set' };
            }
        }

        return { isValid: false, type: 'invalid', reason: 'Not a valid set or sequence' };
    }

    /**
     * Get numeric value of card for sorting
     */
    getCardValue(card) {
        if (card.isJoker) return 0;
        if (card.rank === 'A') return 1;
        if (card.rank === 'J') return 11;
        if (card.rank === 'Q') return 12;
        if (card.rank === 'K') return 13;
        return parseInt(card.rank);
    }

    /**
     * Clear all card groups
     */
    clearAllGroups() {
        // Return all grouped cards to hand
        this.cardGroups.forEach(group => {
            group.cards.forEach(card => {
                if (!this.hand.find(hc => hc.id === card.id)) {
                    this.hand.push(card);
                    this.handOrder.push(card.id);
                }
            });
        });

        this.cardGroups = [];
        this.selectedCards.clear();
        
        this.updateHandDisplay();
        this.updateGroupsDisplay();
        this.updateSelectedCount();
        
        UI.showMessage('All groups cleared', 'info');
    }

    /**
     * Update groups display
     */
    updateGroupsDisplay() {
        const groupsContainer = document.getElementById('card-groups');
        if (!groupsContainer) return;

        if (this.cardGroups.length === 0) {
            groupsContainer.innerHTML = '';
            return;
        }

        const groupsHtml = this.cardGroups.map(group => {
            const cardsHtml = group.cards.map(card => {
                return `<div class="card ${UI.getCardSuitClass(card.suit)} ${card.isJoker ? 'joker' : ''}" 
                             data-card-id="${card.id}">
                            ${card.displayName}
                        </div>`;
            }).join('');

            return `
                <div class="card-group ${group.isValid ? 'valid' : 'invalid'}" data-group-id="${group.id}">
                    <div class="card-group-label">
                        ${group.isValid ? '✓' : '✗'} ${group.type.toUpperCase()}
                    </div>
                    ${cardsHtml}
                    <button class="ungroup-btn" onclick="window.app.ungroupCards(${group.id})" title="Ungroup">
                        ✕
                    </button>
                    <button class="add-to-group-btn" onclick="window.app.addSelectedToGroup(${group.id})" title="Add selected cards to this group">
                        +
                    </button>
                </div>
            `;
        }).join('');

        groupsContainer.innerHTML = groupsHtml;

        // Add event listeners for grouped cards
        this.cardGroups.forEach(group => {
            const groupElement = groupsContainer.querySelector(`[data-group-id="${group.id}"]`);
            
            // Add drag and drop support to group container
            if (groupElement) {
                groupElement.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    groupElement.classList.add('drag-over');
                });

                groupElement.addEventListener('dragleave', (e) => {
                    groupElement.classList.remove('drag-over');
                });

                groupElement.addEventListener('drop', (e) => {
                    e.preventDefault();
                    groupElement.classList.remove('drag-over');
                    const draggedCardId = e.dataTransfer.getData('text/plain');
                    
                    if (draggedCardId) {
                        console.log(`Dropped card ${draggedCardId} onto group ${group.id}`);
                        this.addCardToGroupByDrop(draggedCardId, group.id);
                    }
                });
            }
            
            group.cards.forEach(card => {
                const cardElement = groupsContainer.querySelector(`[data-card-id="${card.id}"]`);
                if (cardElement) {
                    // Single click for selection
                    cardElement.addEventListener('click', () => {
                        this.toggleCardSelection(card.id);
                    });
                    
                    // Double click to remove from group
                    cardElement.addEventListener('dblclick', () => {
                        console.log('Double-clicked grouped card:', card.id, 'in group:', group.id);
                        this.removeCardFromGroup(card.id, group.id);
                    });
                }
            });
        });
    }

    /**
     * Add a single card to group via drag and drop
     */
    addCardToGroupByDrop(cardId, groupId) {
        const groupIndex = this.cardGroups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) {
            UI.showMessage('Group not found', 'error');
            return;
        }

        const card = this.hand.find(c => c.id === cardId);
        if (!card) {
            UI.showMessage('Card not found in hand', 'error');
            return;
        }

        const group = this.cardGroups[groupIndex];
        
        // Add card to the group
        group.cards.push(card);
        
        // Remove from hand
        const handIndex = this.hand.findIndex(c => c.id === cardId);
        if (handIndex !== -1) {
            this.hand.splice(handIndex, 1);
        }
        
        // Remove from handOrder
        this.handOrder = this.handOrder.filter(id => id !== cardId);

        // Re-validate the group
        const groupInfo = this.validateCardGroup(group.cards);
        group.type = groupInfo.type;
        group.isValid = groupInfo.isValid;

        // Update displays
        this.updateHandDisplay();
        this.updateGroupsDisplay();

        UI.showMessage(`Added ${card.displayName} to group`, 'success');
    }

    /**
     * Rearrange cards within hand
     */
    rearrangeCards(draggedCardId, targetCardId) {
        const draggedIndex = this.handOrder.indexOf(draggedCardId);
        const targetIndex = this.handOrder.indexOf(targetCardId);

        if (draggedIndex === -1 || targetIndex === -1) {
            console.log('Card not found in handOrder for rearrangement');
            return;
        }

        // Remove dragged card from its current position
        this.handOrder.splice(draggedIndex, 1);
        
        // Insert it at the target position
        const newTargetIndex = this.handOrder.indexOf(targetCardId);
        this.handOrder.splice(newTargetIndex, 0, draggedCardId);

        console.log('New handOrder after rearrangement:', this.handOrder);
        
        // Update hand display
        this.updateHandDisplay();
    }

    /**
     * Add selected cards to an existing group
     */
    addSelectedToGroup(groupId) {
        if (this.selectedCards.size === 0) {
            UI.showMessage('Select cards first to add to the group', 'error');
            return;
        }

        const groupIndex = this.cardGroups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) {
            UI.showMessage('Group not found', 'error');
            return;
        }

        const group = this.cardGroups[groupIndex];
        const selectedCardObjects = [];

        // Get the actual card objects for selected cards
        this.selectedCards.forEach(cardId => {
            const card = this.hand.find(c => c.id === cardId);
            if (card) {
                selectedCardObjects.push(card);
            }
        });

        if (selectedCardObjects.length === 0) {
            UI.showMessage('No valid cards selected', 'error');
            return;
        }

        // Add selected cards to the group
        selectedCardObjects.forEach(card => {
            group.cards.push(card);
            // Remove from hand
            const handIndex = this.hand.findIndex(c => c.id === card.id);
            if (handIndex !== -1) {
                this.hand.splice(handIndex, 1);
            }
            // Remove from handOrder
            this.handOrder = this.handOrder.filter(id => id !== card.id);
        });

        // Re-validate the group
        const groupInfo = this.validateCardGroup(group.cards);
        group.type = groupInfo.type;
        group.isValid = groupInfo.isValid;

        // Clear selection
        this.selectedCards.clear();

        // Update displays
        this.updateHandDisplay();
        this.updateGroupsDisplay();
        this.updateCardSelectionUI();
        this.updateSelectedCount();

        UI.showMessage(`Added ${selectedCardObjects.length} card(s) to group`, 'success');
    }

    /**
     * Remove a single card from a group (double-click handler)
     */
    removeCardFromGroup(cardId, groupId) {
        const groupIndex = this.cardGroups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) return;

        const group = this.cardGroups[groupIndex];
        const cardIndex = group.cards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        // Remove card from group and add back to hand
        const removedCard = group.cards.splice(cardIndex, 1)[0];
        this.hand.push(removedCard);

        // Update handOrder to include the returned card at the end
        if (!this.handOrder.includes(cardId)) {
            this.handOrder.push(cardId);
        }

        // If group becomes empty or has less than 2 cards, remove the group
        if (group.cards.length < 2) {
            // Return all remaining cards to hand
            group.cards.forEach(card => {
                this.hand.push(card);
                if (!this.handOrder.includes(card.id)) {
                    this.handOrder.push(card.id);
                }
            });
            // Remove the group
            this.cardGroups.splice(groupIndex, 1);
            UI.showMessage('Group dissolved (less than 2 cards)', 'info');
        } else {
            // Re-validate the group after card removal
            const groupInfo = this.validateCardGroup(group.cards);
            group.type = groupInfo.type;
            group.isValid = groupInfo.isValid;
        }

        // Update displays
        this.updateHandDisplay();
        this.updateGroupsDisplay();
        
        UI.showMessage(`Card ${removedCard.displayName} removed from group`, 'success');
    }

    /**
     * Ungroup specific group
     */
    ungroupCards(groupId) {
        console.log('Ungrouping cards for group:', groupId);
        const groupIndex = this.cardGroups.findIndex(g => g.id === groupId);
        if (groupIndex === -1) {
            console.error('Group not found:', groupId);
            return;
        }

        const group = this.cardGroups[groupIndex];
        
        // Return cards to hand
        group.cards.forEach(card => {
            if (!this.hand.find(hc => hc.id === card.id)) {
                this.hand.push(card);
                this.handOrder.push(card.id);
            }
        });

        // Remove group
        this.cardGroups.splice(groupIndex, 1);
        
        this.updateHandDisplay();
        this.updateGroupsDisplay();
        
        UI.showMessage('Group disbanded', 'info');
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