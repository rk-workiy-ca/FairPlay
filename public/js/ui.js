/**
 * FairPlay Rummy POC - UI Controller
 * Handles all user interface updates and interactions
 */

class UI {
    /**
     * Show a message to the user
     */
    static showMessage(message, type = 'info') {
        const container = document.getElementById('message-container');
        
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;
        
        container.appendChild(messageEl);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 5000);
    }

    /**
     * Show error message in a specific element
     */
    static showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    /**
     * Clear error message
     */
    static clearError(elementId) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }

    /**
     * Update waiting screen with player information
     */
    static updateWaitingScreen(gameState) {
        const waitingPlayersEl = document.getElementById('waiting-players');
        if (!waitingPlayersEl) return;

        const playersHtml = gameState.players.map(player => 
            `<div class="waiting-player">
                <span class="player-name">${player.name}</span>
                <span class="player-status">${player.isConnected ? '🟢' : '🔴'}</span>
            </div>`
        ).join('');

        waitingPlayersEl.innerHTML = `
            <h3>Players (${gameState.players.length}/${gameState.maxPlayers || 4})</h3>
            ${playersHtml}
        `;

        // Show wait timer if game is waiting and not full
        if (gameState.gameState === 'waiting' && gameState.players.length < (gameState.maxPlayers || 4)) {
            this.startWaitTimer();
        } else {
            this.hideWaitTimer();
        }
    }

    /**
     * Start the wait timer countdown
     */
    static startWaitTimer() {
        const waitTimerEl = document.getElementById('wait-timer');
        const countdownEl = document.getElementById('countdown-time');
        const progressEl = document.getElementById('timer-progress');
        
        if (!waitTimerEl || !countdownEl || !progressEl) return;

        // Show timer
        waitTimerEl.style.display = 'block';

        // Get current hour to determine wait time (same logic as server)
        const currentHour = new Date().getHours();
        let maxWaitSeconds;
        
        if (currentHour >= 18 && currentHour < 23) {
            // Peak hours: 6 PM - 11 PM
            maxWaitSeconds = 30 + Math.random() * 15; // 30-45 seconds
        } else if ((currentHour >= 10 && currentHour < 18) || (currentHour >= 23 && currentHour < 24)) {
            // Regular hours: 10 AM - 6 PM and 11 PM - 12 AM  
            maxWaitSeconds = 60 + Math.random() * 30; // 60-90 seconds
        } else {
            // Off-peak hours: 12 AM - 10 AM
            maxWaitSeconds = 90 + Math.random() * 30; // 90-120 seconds
        }

        let timeLeft = Math.ceil(maxWaitSeconds);
        const totalTime = timeLeft;

        // Clear any existing timer
        if (this.waitTimerInterval) {
            clearInterval(this.waitTimerInterval);
        }

        // Update countdown every second
        this.waitTimerInterval = setInterval(() => {
            timeLeft--;
            countdownEl.textContent = Math.max(0, timeLeft);
            
            // Update progress bar
            const progress = Math.max(0, (timeLeft / totalTime) * 100);
            progressEl.style.width = `${progress}%`;

            if (timeLeft <= 0) {
                clearInterval(this.waitTimerInterval);
                this.hideWaitTimer();
            }
        }, 1000);

        // Initial display
        countdownEl.textContent = timeLeft;
        progressEl.style.width = '100%';
    }

    /**
     * Hide the wait timer
     */
    static hideWaitTimer() {
        const waitTimerEl = document.getElementById('wait-timer');
        if (waitTimerEl) {
            waitTimerEl.style.display = 'none';
        }
        
        if (this.waitTimerInterval) {
            clearInterval(this.waitTimerInterval);
            this.waitTimerInterval = null;
        }
    }

    /**
     * Update game state display
     */
    static updateGameState(gameState, currentPlayerId) {
        // Update game ID
        const gameIdEl = document.getElementById('game-id');
        if (gameIdEl) {
            gameIdEl.textContent = `Game: ${gameState.gameId.substr(0, 8)}`;
        }

        // Update wild joker
        const wildJokerEl = document.getElementById('wild-joker');
        if (wildJokerEl && gameState.wildJoker) {
            wildJokerEl.textContent = `Wild: ${gameState.wildJoker.displayName}`;
        }

        // Update current turn
        const currentTurnEl = document.getElementById('current-turn');
        if (currentTurnEl) {
            const currentPlayer = gameState.players[gameState.currentTurn];
            if (currentPlayer) {
                currentTurnEl.textContent = currentPlayer.id === currentPlayerId 
                    ? "Your Turn" 
                    : `${currentPlayer.name}'s Turn`;
            }
        }

        // Update deck count
        const deckCountEl = document.getElementById('deck-count');
        if (deckCountEl && gameState.deck) {
            deckCountEl.textContent = gameState.deck.remainingCards;
        }

        // Update discard pile
        this.updateDiscardPile(gameState.deck);

        // Update other players
        this.updateOtherPlayers(gameState.players, currentPlayerId);

        // Update game status
        const gameStatusEl = document.getElementById('game-status');
        if (gameStatusEl) {
            const currentPlayer = gameState.players[gameState.currentTurn];
            if (currentPlayer) {
                gameStatusEl.textContent = currentPlayer.id === currentPlayerId 
                    ? "Your turn - Draw a card" 
                    : `Waiting for ${currentPlayer.name}`;
            }
        }
    }

    /**
     * Update discard pile
     */
    static updateDiscardPile(deckInfo) {
        const discardCardEl = document.getElementById('discard-card');
        if (!discardCardEl || !deckInfo) return;

        if (deckInfo.topDiscardCard) {
            const card = deckInfo.topDiscardCard;
            discardCardEl.className = `card ${this.getCardSuitClass(card.suit)}`;
            discardCardEl.textContent = card.displayName;
        } else {
            discardCardEl.className = 'card empty';
            discardCardEl.textContent = 'Empty';
        }
    }

    /**
     * Update other players display
     */
    static updateOtherPlayers(players, currentPlayerId) {
        const otherPlayers = players.filter(p => p.id !== currentPlayerId);
        
        for (let i = 0; i < 3; i++) {
            const playerSlot = document.getElementById(`player-${i + 1}`);
            if (!playerSlot) continue;

            if (i < otherPlayers.length) {
                const player = otherPlayers[i];
                const playerNameEl = playerSlot.querySelector('.player-name');
                const cardCountEl = playerSlot.querySelector('.card-count');
                const playerCardsEl = playerSlot.querySelector('.player-cards');

                if (playerNameEl) {
                    playerNameEl.textContent = player.name;
                }
                
                if (cardCountEl) {
                    cardCountEl.textContent = `${player.handCount} cards`;
                }

                if (playerCardsEl) {
                    // Show card backs for other players
                    const cardsHtml = Array(player.handCount)
                        .fill(0)
                        .map(() => '<div class="card card-back"></div>')
                        .join('');
                    playerCardsEl.innerHTML = cardsHtml;
                }

                playerSlot.style.display = 'block';
                
                // Highlight if it's their turn
                if (players.findIndex(p => p.id === player.id) === players.findIndex(p => p.id === currentPlayerId)) {
                    playerSlot.classList.add('current-turn');
                } else {
                    playerSlot.classList.remove('current-turn');
                }
            } else {
                playerSlot.style.display = 'none';
            }
        }
    }

    /**
     * Update player's hand display
     */
    static updatePlayerHand(hand) {
        const handCardsEl = document.getElementById('hand-cards');
        if (!handCardsEl) return;

        const handCountEl = document.getElementById('hand-count');
        if (handCountEl) {
            handCountEl.textContent = `${hand.length} cards`;
        }

        const cardsHtml = hand.map(card => {
            return `<div class="card ${this.getCardSuitClass(card.suit)} ${card.isJoker ? 'joker' : ''}" 
                         data-card-id="${card.id}">
                        ${card.displayName}
                    </div>`;
        }).join('');

        handCardsEl.innerHTML = cardsHtml;
        
        // Add event listeners to cards (CSP-compliant)
        handCardsEl.querySelectorAll('.card').forEach(cardEl => {
            const cardId = cardEl.dataset.cardId;
            
            // Single click to select
            cardEl.addEventListener('click', () => {
                if (window.app) {
                    window.app.selectCard(cardEl, cardId);
                }
            });
            
            // Double click to discard
            cardEl.addEventListener('dblclick', () => {
                if (window.app) {
                    window.app.handleCardDiscard(cardId);
                }
            });
        });
    }

    /**
     * Get CSS class for card suit
     */
    static getCardSuitClass(suit) {
        switch (suit) {
            case 'hearts': return 'hearts';
            case 'diamonds': return 'diamonds';
            case 'clubs': return 'clubs';
            case 'spades': return 'spades';
            case 'joker': return 'joker';
            default: return '';
        }
    }

    /**
     * Enable player actions (when it's their turn)
     */
    static enablePlayerActions() {
        const drawDeckBtn = document.getElementById('draw-deck-btn');
        const drawDiscardBtn = document.getElementById('draw-discard-btn');
        const declareBtn = document.getElementById('declare-btn');
        const dropBtn = document.getElementById('drop-btn');

        if (drawDeckBtn) drawDeckBtn.disabled = false;
        if (drawDiscardBtn) drawDiscardBtn.disabled = false;
        if (declareBtn) declareBtn.disabled = false;
        if (dropBtn) dropBtn.disabled = false;

        // Enable deck and discard pile clicking
        const deckPile = document.getElementById('deck-pile');
        const discardPile = document.getElementById('discard-pile');
        if (deckPile) deckPile.style.cursor = 'pointer';
        if (discardPile) discardPile.style.cursor = 'pointer';
    }

    /**
     * Disable player actions (when it's not their turn)
     */
    static disablePlayerActions() {
        const drawDeckBtn = document.getElementById('draw-deck-btn');
        const drawDiscardBtn = document.getElementById('draw-discard-btn');
        const declareBtn = document.getElementById('declare-btn');
        const dropBtn = document.getElementById('drop-btn');

        if (drawDeckBtn) drawDeckBtn.disabled = true;
        if (drawDiscardBtn) drawDiscardBtn.disabled = true;
        if (declareBtn) declareBtn.disabled = true;
        // Don't disable drop button - players can always drop

        // Disable deck and discard pile clicking
        const deckPile = document.getElementById('deck-pile');
        const discardPile = document.getElementById('discard-pile');
        if (deckPile) deckPile.style.cursor = 'not-allowed';
        if (discardPile) discardPile.style.cursor = 'not-allowed';
    }

    /**
     * Open declaration modal
     */
    static openDeclarationModal(hand) {
        const modal = document.getElementById('declaration-modal');
        if (!modal) return;

        // Clear previous state
        this.clearDeclarationModal();

        // Add cards to ungrouped area
        const modalHandCards = document.getElementById('modal-hand-cards');
        if (modalHandCards && hand) {
            const cardsHtml = hand.map(card => {
                return `<div class="card ${this.getCardSuitClass(card.suit)} ${card.isJoker ? 'joker' : ''}" 
                             data-card-id="${card.id}"
                             draggable="true">
                            ${card.displayName}
                        </div>`;
            }).join('');
            modalHandCards.innerHTML = cardsHtml;
            
            // Add event listeners to modal cards (CSP-compliant)
            modalHandCards.querySelectorAll('.card').forEach(cardEl => {
                // Drag start event
                cardEl.addEventListener('dragstart', (event) => {
                    UI.handleDragStart(event);
                });
                
                // Click to select
                cardEl.addEventListener('click', () => {
                    UI.toggleCardSelection(cardEl);
                });
            });
        }

        // Setup drag and drop for group slots
        this.setupDeclarationDragDrop();

        modal.classList.add('active');
    }

    /**
     * Close declaration modal
     */
    static closeDeclarationModal() {
        const modal = document.getElementById('declaration-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.clearDeclarationModal();
    }

    /**
     * Clear declaration modal
     */
    static clearDeclarationModal() {
        // Clear all group slots
        document.querySelectorAll('.group-cards').forEach(groupEl => {
            groupEl.innerHTML = '';
        });

        // Clear validation result
        const validationResult = document.getElementById('validation-result');
        if (validationResult) {
            validationResult.innerHTML = '';
            validationResult.className = 'validation-result';
        }
    }

    /**
     * Setup drag and drop for declaration
     */
    static setupDeclarationDragDrop() {
        // Setup drop zones
        document.querySelectorAll('.group-cards').forEach(groupEl => {
            groupEl.addEventListener('dragover', this.handleDragOver);
            groupEl.addEventListener('drop', this.handleDrop);
        });
    }

    /**
     * Handle drag start
     */
    static handleDragStart(event) {
        event.dataTransfer.setData('text/plain', event.target.dataset.cardId);
        event.target.classList.add('dragging');
    }

    /**
     * Handle drag over
     */
    static handleDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('drop-zone');
    }

    /**
     * Handle drop
     */
    static handleDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drop-zone');

        const cardId = event.dataTransfer.getData('text/plain');
        const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
        
        if (cardEl) {
            cardEl.classList.remove('dragging');
            cardEl.classList.remove('selected');
            event.currentTarget.appendChild(cardEl);
        }

        // Remove drop zone highlighting from all areas
        document.querySelectorAll('.drop-zone').forEach(el => {
            el.classList.remove('drop-zone');
        });
    }

    /**
     * Toggle card selection in modal
     */
    static toggleCardSelection(cardEl) {
        cardEl.classList.toggle('selected');
    }

    /**
     * Get declaration groups from modal
     */
    static getDeclarationGroups() {
        const groups = [];
        
        document.querySelectorAll('.group-slot').forEach((groupSlot, index) => {
            const cards = groupSlot.querySelectorAll('.card');
            if (cards.length > 0) {
                const cardIds = Array.from(cards).map(card => card.dataset.cardId);
                groups.push(cardIds);
            }
        });

        return groups;
    }

    /**
     * Show validation result in modal
     */
    static showValidationResult(isValid, message) {
        const validationResult = document.getElementById('validation-result');
        if (!validationResult) return;

        validationResult.className = `validation-result ${isValid ? 'valid' : 'invalid'}`;
        validationResult.innerHTML = `
            <div class="validation-icon">${isValid ? '✅' : '❌'}</div>
            <div class="validation-message">${message}</div>
        `;
    }

    /**
     * Show game result
     */
    static showGameResult(gameData) {
        const gameResultEl = document.getElementById('game-result');
        const finalScoresEl = document.getElementById('final-scores');

        if (gameResultEl) {
            if (gameData.winner) {
                gameResultEl.textContent = `🎉 ${gameData.winnerName} Won!`;
            } else {
                gameResultEl.textContent = 'Game Over';
            }
        }

        if (finalScoresEl && gameData.gameStats) {
            const scoresHtml = gameData.gameStats.playerStats.map(player => {
                return `
                    <div class="score-row ${player.id === gameData.winner ? 'winner' : ''}">
                        <span class="player-name">${player.name}</span>
                        <span class="player-score">${player.score} points</span>
                        ${player.hasDropped ? '<span class="drop-indicator">(Dropped)</span>' : ''}
                    </div>
                `;
            }).join('');

            finalScoresEl.innerHTML = `
                <h3>Final Scores</h3>
                ${scoresHtml}
                <div class="game-stats">
                    <p>Game Duration: ${this.formatDuration(gameData.gameStats.duration)}</p>
                </div>
            `;
        }
    }

    /**
     * Format duration in milliseconds to readable format
     */
    static formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${remainingSeconds}s`;
        }
    }

    /**
     * Animate card movement
     */
    static animateCard(cardEl, fromPos, toPos, callback) {
        const startTime = performance.now();
        const duration = 500; // milliseconds

        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            // Calculate current position
            const currentX = fromPos.x + (toPos.x - fromPos.x) * easeProgress;
            const currentY = fromPos.y + (toPos.y - fromPos.y) * easeProgress;

            // Apply transform
            cardEl.style.transform = `translate(${currentX}px, ${currentY}px)`;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Animation complete
                cardEl.style.transform = '';
                if (callback) callback();
            }
        }

        requestAnimationFrame(animate);
    }

    /**
     * Add card enter animation
     */
    static addCardEnterAnimation(cardEl) {
        cardEl.classList.add('card-enter');
        setTimeout(() => {
            cardEl.classList.remove('card-enter');
        }, 500);
    }

    /**
     * Highlight player's turn
     */
    static highlightPlayerTurn(playerId, gameState) {
        // Remove all turn highlights
        document.querySelectorAll('.player-slot').forEach(slot => {
            slot.classList.remove('current-turn');
        });

        // Add highlight to current player
        const currentPlayerIndex = gameState.players.findIndex(p => p.id === playerId);
        if (currentPlayerIndex !== -1) {
            const playerSlot = document.getElementById(`player-${currentPlayerIndex + 1}`);
            if (playerSlot) {
                playerSlot.classList.add('current-turn');
            }
        }
    }

    /**
     * Show connection status
     */
    static showConnectionStatus(isConnected) {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.textContent = isConnected ? '🟢 Connected' : '🔴 Disconnected';
            statusEl.className = `connection-status ${isConnected ? 'connected' : 'disconnected'}`;
        }
    }

    /**
     * Update turn timer visual
     */
    static updateTurnTimer(timeLeft, totalTime) {
        const timerEl = document.getElementById('turn-timer');
        if (timerEl) {
            const percentage = (timeLeft / totalTime) * 100;
            timerEl.style.setProperty('--timer-width', `${percentage}%`);
            
            // Change color based on time left
            if (percentage < 25) {
                timerEl.style.setProperty('--timer-color', '#dc3545'); // Red
            } else if (percentage < 50) {
                timerEl.style.setProperty('--timer-color', '#ffc107'); // Yellow
            } else {
                timerEl.style.setProperty('--timer-color', '#28a745'); // Green
            }
        }
    }
}

// Export UI class for global use
window.UI = UI; 