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

        this.socket.on('game_state_update', (gameState) => {
            console.log('Game state update:', gameState);
            this.gameState = gameState;
            this.updateGameDisplay();
        });

        this.socket.on('hand_update', (data) => {
            console.log('Hand update:', data);
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
            UI.updatePlayerHand(this.hand);
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

        this.socket.on('card_discarded', (data) => {
            console.log('Card discarded:', data);
            if (data.playerId !== this.playerId) {
                UI.showMessage(`${data.playerName} discarded ${data.discardedCard.displayName}`, 'info');
            }
        });

        this.socket.on('player_dropped', (data) => {
            console.log('Player dropped:', data);
            UI.showMessage(`${data.playerName} dropped from the game`, 'info');
        });

        this.socket.on('player_disconnected', (data) => {
            console.log('Player disconnected:', data);
            UI.showMessage(`${data.playerName} disconnected`, 'info');
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
            // Request current hand
            this.socket.emit('get_hand');
            UI.showMessage('Game started! Your turn.', 'success');
        });

        this.socket.on('game_ended', (data) => {
            console.log('Game ended:', data);
            this.handleGameEnd(data);
        });
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
        
        console.log(`Joining game: ${playerName}, ${selectedPlayers} players`);
        
        this.socket.emit('join_game', {
            playerName: playerName,
            maxPlayers: parseInt(selectedPlayers)
        });

        // Disable the button to prevent multiple requests
        document.getElementById('join-game-btn').disabled = true;
        UI.clearError('join-error');
    }

    /**
     * Draw a card from deck or discard pile
     */
    drawCard(source) {
        if (!this.isMyTurn()) {
            UI.showMessage("It's not your turn", 'error');
            return;
        }

        if (this.hand.length >= 14) {
            UI.showMessage("You must discard a card first", 'error');
            return;
        }

        this.lastAction = 'draw';
        this.lastDrawnCardId = null; // Will be set on card_drawn event
        console.log(`Drawing card from ${source}`);
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

        this.lastAction = 'discard';
        this.lastDiscardedCardId = cardId;
        console.log(`Discarding card: ${cardId}`);
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
        
        if (this.turnTimer) {
            clearInterval(this.turnTimer);
            this.turnTimer = null;
        }

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
     * Update game display based on current game state
     */
    updateGameDisplay() {
        if (!this.gameState) return;

        // Update game screen if we're in playing state
        if (this.gameState.gameState === 'playing' && this.currentScreen === 'waiting') {
            this.showScreen('game');
            // Request current hand
            this.socket.emit('get_hand');
        }

        // Update UI elements
        if (this.currentScreen === 'game') {
            UI.updateGameState(this.gameState, this.playerId);
            
            // Update turn-specific UI
            if (this.isMyTurn()) {
                UI.enablePlayerActions();
                this.startTurnTimer();
            } else {
                UI.disablePlayerActions();
                this.stopTurnTimer();
            }
        } else if (this.currentScreen === 'waiting') {
            UI.updateWaitingScreen(this.gameState);
        }
    }

    /**
     * Start turn timer
     */
    startTurnTimer() {
        this.stopTurnTimer();
        
        let timeLeft = 60;
        const timerElement = document.getElementById('turn-timer');
        
        this.turnTimer = setInterval(() => {
            timeLeft--;
            
            if (timerElement) {
                timerElement.style.setProperty('--timer-width', `${(timeLeft / 60) * 100}%`);
            }
            
            if (timeLeft <= 0) {
                this.stopTurnTimer();
                UI.showMessage("Time's up! You were automatically dropped.", 'error');
            }
        }, 1000);
    }

    /**
     * Stop turn timer
     */
    stopTurnTimer() {
        if (this.turnTimer) {
            clearInterval(this.turnTimer);
            this.turnTimer = null;
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