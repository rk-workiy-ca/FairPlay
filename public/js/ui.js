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
     * Update turn display
     */
    static updateTurnDisplay(gameState, currentPlayerId) {
        // Update current turn indicator
        const currentTurnEl = document.getElementById('current-turn');
        if (currentTurnEl && gameState.players[gameState.currentTurn]) {
            const currentPlayer = gameState.players[gameState.currentTurn];
            currentTurnEl.textContent = currentPlayer.id === currentPlayerId 
                ? "Your Turn" 
                : `${currentPlayer.name}'s Turn`;
        }

        // Update game status
        const gameStatusEl = document.getElementById('game-status');
        if (gameStatusEl && gameState.players[gameState.currentTurn]) {
            const currentPlayer = gameState.players[gameState.currentTurn];
            gameStatusEl.textContent = currentPlayer.id === currentPlayerId 
                ? "Your turn - Draw a card" 
                : `Waiting for ${currentPlayer.name}`;
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

        // Update turn display
        this.updateTurnDisplay(gameState, currentPlayerId);

        // Update deck count
        const deckCountEl = document.getElementById('deck-count');
        if (deckCountEl && gameState.deck) {
            deckCountEl.textContent = gameState.deck.remainingCards;
        }

        // Update discard pile
        this.updateDiscardPile(gameState.deck);

        // Update other players
        this.updateOtherPlayers(gameState.players, currentPlayerId);
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
     * Update other players display with dynamic positioning
     */
    static updateOtherPlayers(players, currentPlayerId) {
        const playersArea = document.getElementById('players-area');
        if (!playersArea) return;

        const otherPlayers = players.filter(p => p.id !== currentPlayerId);
        const totalPlayers = players.length;
        
        // Set the data-players attribute for CSS positioning
        playersArea.setAttribute('data-players', totalPlayers);
        
        // Clear existing player slots
        playersArea.innerHTML = '';
        
        // Create player slots dynamically
        otherPlayers.forEach((player, index) => {
            const playerSlot = document.createElement('div');
            playerSlot.className = 'player-slot';
            playerSlot.id = `player-${index + 1}`;
            
            const playerInfo = document.createElement('div');
            playerInfo.className = 'player-info';
            
            const playerName = document.createElement('span');
            playerName.className = 'player-name';
            playerName.textContent = player.name;
            
            const cardCount = document.createElement('span');
            cardCount.className = 'card-count';
            cardCount.textContent = `${player.handCount} cards`;
            
            const playerCards = document.createElement('div');
            playerCards.className = 'player-cards fanned';
            
            // Create fanned-out card backs for other players
            const cardsHtml = Array(player.handCount)
                .fill(0)
                .map(() => '<div class="card card-back"></div>')
                .join('');
            playerCards.innerHTML = cardsHtml;
            
            playerInfo.appendChild(playerName);
            playerInfo.appendChild(cardCount);
            playerSlot.appendChild(playerInfo);
            playerSlot.appendChild(playerCards);
            
            // Highlight if it's their turn
            const currentTurnIndex = window.app && window.app.gameState ? window.app.gameState.currentTurn : 0;
            const playerIndex = players.findIndex(p => p.id === player.id);
            if (playerIndex === currentTurnIndex) {
                playerSlot.classList.add('current-turn');
            } else {
                playerSlot.classList.remove('current-turn');
            }
            
            playersArea.appendChild(playerSlot);
        });
    }

    /**
     * Update player's hand display with drag-and-drop arrangement
     * Preserves existing arrangement when possible
     */
    static updatePlayerHand(hand) {
        const handCardsEl = document.getElementById('hand-cards');
        if (!handCardsEl) return;

        const handCountEl = document.getElementById('hand-count');
        if (handCountEl) {
            handCountEl.textContent = `${hand.length} cards`;
        }

        // Use handOrder from app if available and valid
        let orderedHand = hand;
        if (window.app && window.app.handOrder && Array.isArray(window.app.handOrder)) {
            const idToCard = Object.fromEntries(hand.map(card => [card.id, card]));
            const ordered = window.app.handOrder.map(id => idToCard[id]).filter(Boolean);
            // Only use if all cards are present
            if (ordered.length === hand.length) {
                orderedHand = ordered;
            }
        }

        // Check if this is just adding a new card (preserve arrangement)
        const currentCards = Array.from(handCardsEl.querySelectorAll('.card[data-card-id]'));
        const currentCardIds = currentCards.map(el => el.dataset.cardId);
        const newHandIds = orderedHand.map(card => card.id);
        // If we're just adding one card, preserve the current arrangement
        if (currentCardIds.length === orderedHand.length - 1 && 
            currentCardIds.every(id => newHandIds.includes(id))) {
            // Find the new card
            const newCard = orderedHand.find(card => !currentCardIds.includes(card.id));
            if (newCard) {
                // Add the new card at the end
                const newCardHtml = `<div class="card ${this.getCardSuitClass(newCard.suit)} ${newCard.isJoker ? 'joker' : ''}" 
                                         data-card-id="${newCard.id}"
                                         draggable="true">
                                        ${newCard.displayName}
                                    </div>`;
                handCardsEl.insertAdjacentHTML('beforeend', newCardHtml);
                // Add event listeners to the new card only
                const newCardEl = handCardsEl.querySelector(`[data-card-id="${newCard.id}"]`);
                if (newCardEl) {
                    this.addCardEventListeners(newCardEl, handCardsEl);
                }
                // Check for auto-declaration after drawing
                this.checkAutoDeclaration(orderedHand);
                return;
            }
        }

        // Complete rebuild if it's not just adding a card
        const cardsHtml = orderedHand.map(card => {
            return `<div class="card ${this.getCardSuitClass(card.suit)} ${card.isJoker ? 'joker' : ''}" 
                         data-card-id="${card.id}"
                         draggable="true">
                        ${card.displayName}
                    </div>`;
        }).join('');

        handCardsEl.innerHTML = cardsHtml;
        // Set up auto-arrange button listener
        this.setupAutoArrangeButton(orderedHand);
        // Add event listeners to all cards
        handCardsEl.querySelectorAll('.card').forEach(cardEl => {
            this.addCardEventListeners(cardEl, handCardsEl);
        });
        // Check for auto-declaration
        this.checkAutoDeclaration(orderedHand);
    }

    /**
     * Add event listeners to a card element
     */
    static addCardEventListeners(cardEl, handCardsEl) {
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

        // Drag and drop for card arrangement
        this.addDragAndDropListeners(cardEl, handCardsEl);
    }

    /**
     * Set up auto-arrange button functionality
     */
    static setupAutoArrangeButton(hand) {
        const autoArrangeBtn = document.getElementById('auto-arrange-btn');
        if (!autoArrangeBtn) return;
        
        // Remove existing listeners
        autoArrangeBtn.replaceWith(autoArrangeBtn.cloneNode(true));
        const newBtn = document.getElementById('auto-arrange-btn');
        
        newBtn.addEventListener('click', () => {
            this.autoArrangeCards(hand);
        });
    }

    /**
     * Auto-arrange cards by suit and rank
     */
    static autoArrangeCards(hand) {
        if (!hand || !Array.isArray(hand)) return;
        
        const handCardsEl = document.getElementById('hand-cards');
        if (!handCardsEl) return;
        
        // Sort cards by suit priority and then by rank
        const suitPriority = { 'spades': 1, 'hearts': 2, 'diamonds': 3, 'clubs': 4, 'joker': 5 };
        const rankPriority = { 
            'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 
            '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'Joker': 14 
        };
        
        const sortedHand = [...hand].sort((a, b) => {
            // Jokers go to the end
            if (a.isJoker && !b.isJoker) return 1;
            if (!a.isJoker && b.isJoker) return -1;
            if (a.isJoker && b.isJoker) return 0;
            
            // Sort by suit first
            const suitDiff = (suitPriority[a.suit] || 6) - (suitPriority[b.suit] || 6);
            if (suitDiff !== 0) return suitDiff;
            
            // Then by rank
            return (rankPriority[a.rank] || 15) - (rankPriority[b.rank] || 15);
        });
        
        // Re-render with sorted order
        const cardsHtml = sortedHand.map(card => {
            return `<div class="card ${this.getCardSuitClass(card.suit)} ${card.isJoker ? 'joker' : ''}" 
                         data-card-id="${card.id}"
                         draggable="true">
                        ${card.displayName}
                    </div>`;
        }).join('');
        
        handCardsEl.innerHTML = cardsHtml;
        
        // Re-add event listeners to the newly arranged cards
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

            // Drag and drop for card arrangement
            this.addDragAndDropListeners(cardEl, handCardsEl);
        });
        
        // Update app state to match new order
        if (window.app && window.app.updateCardOrder) {
            window.app.gameState.playerHand = sortedHand;
        }
        
        // Show feedback
        this.showMessage('Cards auto-arranged by suit and rank!', 'success');
    }

    /**
     * Add drag and drop event listeners for card arrangement
     */
    static addDragAndDropListeners(cardEl, containerEl) {
        // Store references globally for access across events
        if (!window.dragDropState) {
            window.dragDropState = {};
        }

        // Drag start
        cardEl.addEventListener('dragstart', (e) => {
            window.dragDropState.draggedCard = cardEl;
            cardEl.classList.add('dragging');
            
            // Create placeholder
            window.dragDropState.placeholder = document.createElement('div');
            window.dragDropState.placeholder.className = 'card-placeholder';
            window.dragDropState.placeholder.style.width = cardEl.offsetWidth + 'px';
            window.dragDropState.placeholder.style.height = cardEl.offsetHeight + 'px';
            
            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', cardEl.dataset.cardId);
            
            console.log('Drag started for card:', cardEl.dataset.cardId);
            
            // Insert placeholder initially
            setTimeout(() => {
                if (window.dragDropState.placeholder) {
                    containerEl.insertBefore(window.dragDropState.placeholder, cardEl.nextSibling);
                }
            }, 0);
        });

        // Drag end
        cardEl.addEventListener('dragend', (e) => {
            if (window.dragDropState.draggedCard) {
                window.dragDropState.draggedCard.classList.remove('dragging');
            }
            if (window.dragDropState.placeholder && window.dragDropState.placeholder.parentNode) {
                window.dragDropState.placeholder.parentNode.removeChild(window.dragDropState.placeholder);
            }
            // Clean up
            window.dragDropState = {};
        });

        // Drag over - handle on individual cards
        cardEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (window.dragDropState.draggedCard && cardEl !== window.dragDropState.draggedCard && window.dragDropState.placeholder) {
                const rect = cardEl.getBoundingClientRect();
                const midpoint = rect.left + rect.width / 2;
                
                if (e.clientX < midpoint) {
                    // Insert before this card
                    if (cardEl.previousSibling !== window.dragDropState.placeholder) {
                        containerEl.insertBefore(window.dragDropState.placeholder, cardEl);
                    }
                } else {
                    // Insert after this card
                    if (cardEl.nextSibling !== window.dragDropState.placeholder) {
                        containerEl.insertBefore(window.dragDropState.placeholder, cardEl.nextSibling);
                    }
                }
            }
        });

        // Drop on cards
        cardEl.addEventListener('drop', (e) => {
            e.preventDefault();
            console.log('Drop event triggered on card:', cardEl.dataset.cardId);
            this.handleCardDrop(containerEl);
        });

        // Set up container-level drag and drop (only once)
        if (!containerEl.hasAttribute('data-drop-listeners')) {
            containerEl.setAttribute('data-drop-listeners', 'true');
            
            // Container drag over (for empty spaces)
            containerEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                // If dragging over empty space, move placeholder to end
                if (window.dragDropState.draggedCard && window.dragDropState.placeholder && 
                    !e.target.classList.contains('card') && e.target === containerEl) {
                    containerEl.appendChild(window.dragDropState.placeholder);
                }
            });

            // Container drop
            containerEl.addEventListener('drop', (e) => {
                e.preventDefault();
                console.log('Drop event triggered on container');
                this.handleCardDrop(containerEl);
            });
        }
    }

    /**
     * Handle the drop operation
     */
    static handleCardDrop(containerEl) {
        if (window.dragDropState.draggedCard && window.dragDropState.placeholder && window.dragDropState.placeholder.parentNode) {
            // Move the dragged card to the placeholder position
            const draggedCard = window.dragDropState.draggedCard;
            const placeholder = window.dragDropState.placeholder;
            
            // Insert the dragged card before the placeholder
            placeholder.parentNode.insertBefore(draggedCard, placeholder);
            
            // Remove the placeholder
            placeholder.parentNode.removeChild(placeholder);
            
            // Update the card order in the app state
            if (window.app && window.app.updateCardOrder) {
                window.app.updateCardOrder();
            }
            
            // Show feedback
            this.showMessage('Cards rearranged!', 'success');
            
            console.log('Card dropped successfully at new position');
        }
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

    /**
     * Check for automatic declaration when hand is valid
     */
    static checkAutoDeclaration(hand) {
        if (!hand || hand.length !== 13) return;
        
        // Simple auto-validation logic
        const autoArrangement = this.findValidArrangement(hand);
        if (autoArrangement && autoArrangement.isValid) {
            // Show auto-declaration option
            this.showAutoDeclarationOption(autoArrangement);
        }
    }

    /**
     * Find a valid arrangement for the hand
     */
    static findValidArrangement(hand) {
        if (!hand || hand.length !== 13) return null;
        
        try {
            // Try to find valid sequences and sets
            const arrangement = this.analyzeHandForDeclaration(hand);
            return arrangement;
        } catch (error) {
            console.log('Error analyzing hand:', error);
            return null;
        }
    }

    /**
     * Analyze hand for potential declaration
     */
    static analyzeHandForDeclaration(hand) {
        // Group cards by suit for sequences
        const suitGroups = this.groupBySuit(hand);
        const validGroups = [];
        let usedCards = new Set();
        let hasPureSequence = false;

        // Try to find pure sequences first
        Object.keys(suitGroups).forEach(suit => {
            if (suit === 'jokers') return;
            
            const suitCards = suitGroups[suit].filter(card => !usedCards.has(card.id));
            if (suitCards.length >= 3) {
                const sequences = this.findSequencesInSuit(suitCards);
                sequences.forEach(seq => {
                    if (seq.length >= 3 && seq.every(card => !card.isJoker)) {
                        validGroups.push({ type: 'pure_sequence', cards: seq });
                        seq.forEach(card => usedCards.add(card.id));
                        hasPureSequence = true;
                    }
                });
            }
        });

        // Try to find impure sequences and sets with remaining cards
        const remainingCards = hand.filter(card => !usedCards.has(card.id));
        const additionalGroups = this.findSetsAndSequences(remainingCards);
        validGroups.push(...additionalGroups);

        // Check if all cards are grouped
        const groupedCardCount = validGroups.reduce((count, group) => count + group.cards.length, 0);
        const isComplete = groupedCardCount === 13;
        
        return {
            isValid: isComplete && hasPureSequence,
            groups: validGroups,
            hasPureSequence: hasPureSequence,
            remainingCards: hand.filter(card => !validGroups.some(group => 
                group.cards.some(groupCard => groupCard.id === card.id)
            ))
        };
    }

    /**
     * Group cards by suit
     */
    static groupBySuit(cards) {
        const groups = { hearts: [], diamonds: [], clubs: [], spades: [], jokers: [] };
        
        cards.forEach(card => {
            if (card.isJoker) {
                groups.jokers.push(card);
            } else {
                groups[card.suit].push(card);
            }
        });

        // Sort each suit by rank
        Object.keys(groups).forEach(suit => {
            if (suit !== 'jokers') {
                groups[suit].sort((a, b) => {
                    const aRank = a.rank === 1 ? 14 : a.rank; // Ace high
                    const bRank = b.rank === 1 ? 14 : b.rank;
                    return aRank - bRank;
                });
            }
        });

        return groups;
    }

    /**
     * Find sequences in a suit
     */
    static findSequencesInSuit(suitCards) {
        if (suitCards.length < 3) return [];
        
        const sorted = [...suitCards].sort((a, b) => a.rank - b.rank);
        const sequences = [];
        let currentSeq = [sorted[0]];
        
        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const previous = sorted[i - 1];
            
            if (current.rank === previous.rank + 1) {
                currentSeq.push(current);
            } else {
                if (currentSeq.length >= 3) {
                    sequences.push([...currentSeq]);
                }
                currentSeq = [current];
            }
        }
        
        if (currentSeq.length >= 3) {
            sequences.push(currentSeq);
        }
        
        return sequences;
    }

    /**
     * Find sets and remaining sequences
     */
    static findSetsAndSequences(cards) {
        const groups = [];
        const used = new Set();
        
        // Group by rank for sets
        const rankGroups = {};
        cards.forEach(card => {
            if (!used.has(card.id)) {
                const rank = card.rank;
                if (!rankGroups[rank]) rankGroups[rank] = [];
                rankGroups[rank].push(card);
            }
        });
        
        // Find sets (3+ cards of same rank, different suits)
        Object.values(rankGroups).forEach(rankCards => {
            if (rankCards.length >= 3) {
                const suits = new Set(rankCards.map(c => c.suit));
                if (suits.size === rankCards.length) { // All different suits
                    groups.push({ type: 'set', cards: rankCards });
                    rankCards.forEach(card => used.add(card.id));
                }
            }
        });
        
        return groups;
    }

    /**
     * Show auto-declaration option to user
     */
    static showAutoDeclarationOption(arrangement) {
        // Create or update auto-declare button
        let autoBtn = document.getElementById('auto-declare-btn');
        if (!autoBtn) {
            autoBtn = document.createElement('button');
            autoBtn.id = 'auto-declare-btn';
            autoBtn.className = 'btn btn-success';
            autoBtn.textContent = '🎉 Auto Declare & Win!';
            autoBtn.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 2000;
                padding: 15px 25px;
                font-size: 16px;
                font-weight: bold;
                border: none;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                animation: pulse 1s infinite;
            `;
            
            // Add CSS animation if not exists
            if (!document.getElementById('auto-declare-styles')) {
                const style = document.createElement('style');
                style.id = 'auto-declare-styles';
                style.textContent = `
                    @keyframes pulse {
                        0% { transform: translate(-50%, -50%) scale(1); }
                        50% { transform: translate(-50%, -50%) scale(1.05); }
                        100% { transform: translate(-50%, -50%) scale(1); }
                    }
                `;
                document.head.appendChild(style);
            }
            
            autoBtn.addEventListener('click', () => {
                this.executeAutoDeclaration(arrangement);
                autoBtn.remove();
            });
            
            document.body.appendChild(autoBtn);
            
            // Auto-remove after 10 seconds
            setTimeout(() => {
                if (autoBtn.parentNode) {
                    autoBtn.remove();
                }
            }, 10000);
        }
    }

    /**
     * Execute automatic declaration
     */
    static executeAutoDeclaration(arrangement) {
        if (window.app && arrangement.isValid) {
            // Convert groups to the format expected by the server
            const groups = arrangement.groups.map(group => 
                group.cards.map(card => card.id)
            );
            
            console.log('Auto-declaring with groups:', groups);
            window.app.socket.emit('declare_hand', { groups });
            
            this.showMessage('🎉 Auto-declaration submitted! Checking for win...', 'success');
        }
    }
}

// Export UI class for global use
window.UI = UI; 