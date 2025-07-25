const Card = require('./Card');
const Deck = require('./Deck');
const GameValidator = require('./GameValidator');
const AIService = require('../ai/AIService');
const { v4: uuidv4 } = require('uuid');

/**
 * GameEngine class that manages the complete Indian Rummy game flow
 * Handles players, turns, card dealing, game state, and validation
 */
class GameEngine {
  constructor(gameId = null, maxPlayers = 4) {
    this.gameId = gameId || uuidv4();
    this.maxPlayers = Math.min(Math.max(maxPlayers, 2), 4); // 2-4 players only
    this.players = [];
    this.currentTurn = 0;
    this.gameState = 'waiting'; // waiting, dealing, playing, finished
    this.deck = null;
    this.validator = null;
    this.aiService = new AIService(); // Initialize AI service
    this.turnTimer = null;
    this.turnTimeLimit = 10000; // 10 seconds per turn (matching frontend)
    this.turnStartTime = null; // Track when turn started for synchronization
    this.gameStartTime = null;
    this.gameEndTime = null;
    this.winner = null;
    this.dropPenalties = {
      first: 20,
      middle: 40,
      full: 80
    };
    this.onStateChange = null; // Callback for state changes
    
    console.log(`Game ${this.gameId} created for ${this.maxPlayers} players`);
  }

  /**
   * Add a player to the game
   * @param {Object} playerInfo - Player information {id, name, socketId}
   * @returns {Object} Result with success flag and player data
   */
  addPlayer(playerInfo) {
    if (this.gameState !== 'waiting') {
      return { success: false, reason: 'Game already started' };
    }

    if (this.players.length >= this.maxPlayers) {
      return { success: false, reason: 'Game is full' };
    }

    if (this.players.find(p => p.id === playerInfo.id)) {
      return { success: false, reason: 'Player already in game' };
    }

    const player = {
      id: playerInfo.id,
      name: playerInfo.name,
      socketId: playerInfo.socketId || null,
      hand: [],
      score: 0,
      hasDropped: false,
      dropType: null,
      isConnected: true,
      joinedAt: new Date(),
      timeoutCount: 0, // Track number of timeouts
      maxTimeouts: 3   // Allow 3 timeouts before auto-drop
    };

    this.players.push(player);
    console.log(`Player ${player.name} joined game ${this.gameId}`);

    // Auto-start if we have enough players
    if (this.players.length === this.maxPlayers) {
      setTimeout(() => this.startGame(), 1000);
    }

    return { 
      success: true, 
      player: player,
      playersCount: this.players.length,
      maxPlayers: this.maxPlayers
    };
  }

  /**
   * Remove a player from the game
   * @param {string} playerId - Player ID to remove
   * @returns {Object} Result with success flag
   */
  removePlayer(playerId) {
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return { success: false, reason: 'Player not found' };
    }

    const player = this.players[playerIndex];
    
    if (this.gameState === 'playing') {
      // Player drops during game
      this._handlePlayerDrop(playerId, 'middle');
    } else {
      // Remove player completely if game hasn't started
      this.players.splice(playerIndex, 1);
    }

    console.log(`Player ${player.name} removed from game ${this.gameId}`);
    return { success: true };
  }

  /**
   * Start the game
   * @returns {Object} Result with success flag and game state
   */
  startGame() {
    if (this.gameState !== 'waiting') {
      return { success: false, reason: 'Game already started' };
    }

    if (this.players.length < 2) {
      return { success: false, reason: 'Need at least 2 players to start' };
    }

    console.log(`Starting game ${this.gameId} with ${this.players.length} players`);

    this.gameState = 'dealing';
    this.gameStartTime = new Date();

    // Initialize deck and validator
    this.deck = Deck.createGameDeck();
    this.validator = new GameValidator(this.deck.getWildJoker());

    // Deal cards to all players
    this._dealCards();

    // Set first turn
    this.currentTurn = 0;
    this.gameState = 'playing';

    // Start turn timer
    this._startTurnTimer();

    return { 
      success: true, 
      gameState: this.getGameState()
    };
  }

  /**
   * Handle player's draw action
   * @param {string} playerId - Player ID
   * @param {string} source - 'deck' or 'discard'
   * @returns {Object} Result with drawn card
   */
  drawCard(playerId, source = 'deck') {
    const validation = this._validatePlayerAction(playerId);
    if (!validation.success) {
      return validation;
    }

    const player = validation.player;
    let drawnCard = null;

    if (source === 'deck') {
      drawnCard = this.deck.dealCard();
      if (!drawnCard) {
        // Reshuffle if deck is empty
        if (this.deck.needsReshuffling()) {
          this.deck.reshuffleDiscardPile();
          drawnCard = this.deck.dealCard();
        }
      }
    } else if (source === 'discard') {
      drawnCard = this.deck.drawFromDiscardPile();
    }

    if (!drawnCard) {
      return { success: false, reason: 'No cards available to draw' };
    }

    player.hand.push(drawnCard);
    
    // Reset timeout count on successful action
    player.timeoutCount = 0;
    
    console.log(`Player ${player.name} drew ${drawnCard.getDisplayName()} from ${source}`);

    return { 
      success: true, 
      card: drawnCard.toJSON(),
      source: source
    };
  }

  /**
   * Handle player's discard action
   * @param {string} playerId - Player ID
   * @param {string} cardId - Card ID to discard
   * @returns {Object} Result with success flag
   */
  discardCard(playerId, cardId) {
    const validation = this._validatePlayerAction(playerId);
    if (!validation.success) {
      return validation;
    }

    const player = validation.player;
    const cardIndex = player.hand.findIndex(card => card.id === cardId);
    
    if (cardIndex === -1) {
      return { success: false, reason: 'Card not found in hand' };
    }

    const discardedCard = player.hand.splice(cardIndex, 1)[0];
    this.deck.addToDiscardPile(discardedCard);

    // Reset timeout count on successful action
    player.timeoutCount = 0;

    console.log(`Player ${player.name} discarded ${discardedCard.getDisplayName()}`);

    // Move to next turn
    this._nextTurn();

    return { 
      success: true, 
      discardedCard: discardedCard.toJSON()
    };
  }

  /**
   * Handle player's declaration
   * @param {string} playerId - Player ID
   * @param {Array} groups - Grouped cards for declaration
   * @returns {Object} Result with validation details
   */
  declareHand(playerId, groups) {
    const validation = this._validatePlayerAction(playerId);
    if (!validation.success) {
      return validation;
    }

    const player = validation.player;
    
    if (player.hand.length !== 13) {
      return { success: false, reason: 'Must have exactly 13 cards to declare' };
    }

    // Convert card IDs to Card objects
    const cardGroups = groups.map(group => 
      group.map(cardId => player.hand.find(card => card.id === cardId))
    );

    // Validate declaration
    const declarationResult = this.validator.validateDeclaration(player.hand, cardGroups);

    if (declarationResult.isValid) {
      // Valid declaration - player wins
      this._endGame(playerId, declarationResult);
    } else {
      // Invalid declaration - penalty
      player.score = 80; // Invalid declaration penalty
      console.log(`Player ${player.name} made invalid declaration: ${declarationResult.reason}`);
    }

    return {
      success: true,
      isValid: declarationResult.isValid,
      validation: declarationResult
    };
  }

  /**
   * Handle player dropping from game
   * @param {string} playerId - Player ID
   * @param {string} dropType - 'first', 'middle'
   * @returns {Object} Result with success flag
   */
  dropPlayer(playerId, dropType = 'middle') {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, reason: 'Player not found' };
    }

    return this._handlePlayerDrop(playerId, dropType);
  }

  /**
   * Get current game state
   * @returns {Object} Complete game state
   */
  getGameState() {
    return {
      gameId: this.gameId,
      gameState: this.gameState,
      players: this.players.map(player => ({
        id: player.id,
        name: player.name,
        handCount: player.hand.length,
        score: player.score,
        hasDropped: player.hasDropped,
        dropType: player.dropType,
        isConnected: player.isConnected,
        isBot: player.isBot || false,
        timeoutCount: player.timeoutCount || 0,
        maxTimeouts: player.maxTimeouts || 3,
        isAutoDropped: player.isAutoDropped || false
      })),
      currentTurn: this.currentTurn,
      currentPlayer: this.players[this.currentTurn]?.name || null,
      deck: this.deck?.toJSON() || null,
      wildJoker: this.deck?.getWildJoker()?.toJSON() || null,
      discardPile: this.deck?.discardPile?.map(card => card.toJSON()) || [],
      deckCount: this.deck?.cards?.length || 0,
      winner: this.winner,
      gameStartTime: this.gameStartTime,
      gameEndTime: this.gameEndTime
    };
  }

  /**
   * Get game state for AI decision making (includes hand data)
   * @returns {Object} Game state with hand data
   */
  getGameStateForAI() {
    return {
      gameId: this.gameId,
      gameState: this.gameState,
      players: this.players.map(player => ({
        id: player.id,
        name: player.name,
        hand: player.hand.map(card => card.toJSON()),
        handCount: player.hand.length,
        score: player.score,
        hasDropped: player.hasDropped,
        dropType: player.dropType,
        isConnected: player.isConnected,
        isBot: player.isBot || false,
        timeoutCount: player.timeoutCount || 0,
        maxTimeouts: player.maxTimeouts || 3,
        isAutoDropped: player.isAutoDropped || false
      })),
      currentTurn: this.currentTurn,
      currentPlayer: this.players[this.currentTurn]?.name || null,
      deck: this.deck?.toJSON() || null,
      wildJoker: this.deck?.getWildJoker()?.toJSON() || null,
      discardPile: this.deck?.discardPile?.map(card => card.toJSON()) || [],
      deckCount: this.deck?.cards?.length || 0,
      winner: this.winner,
      gameStartTime: this.gameStartTime,
      gameEndTime: this.gameEndTime
    };
  }

  /**
   * Get player's hand (for the specific player only)
   * @param {string} playerId - Player ID
   * @returns {Object} Player's hand cards
   */
  getPlayerHand(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, reason: 'Player not found' };
    }

    return {
      success: true,
      hand: player.hand.map(card => card.toJSON())
    };
  }

  /**
   * Deal initial cards to all players
   * @private
   */
  _dealCards() {
    const cardsPerPlayer = 13;
    
    this.players.forEach(player => {
      player.hand = this.deck.dealCards(cardsPerPlayer);
      player.hand.sort((a, b) => a.compare(b));
      console.log(`Dealt ${cardsPerPlayer} cards to ${player.name}`);
    });

    // Put one card in discard pile to start
    const firstDiscard = this.deck.dealCard();
    if (firstDiscard) {
      this.deck.addToDiscardPile(firstDiscard);
    }
  }

  /**
   * Validate if player can perform action
   * @param {string} playerId - Player ID
   * @returns {Object} Validation result
   * @private
   */
  _validatePlayerAction(playerId) {
    if (this.gameState !== 'playing') {
      return { success: false, reason: 'Game is not in playing state' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, reason: 'Player not found' };
    }

    if (player.hasDropped) {
      return { success: false, reason: 'Player has already dropped' };
    }

    if (this.players[this.currentTurn].id !== playerId) {
      return { success: false, reason: 'Not your turn' };
    }

    return { success: true, player: player };
  }

  /**
   * Move to next player's turn
   * @private
   */
  _nextTurn() {
    // Stop current turn timer
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    
    // Send timer stop event to frontend
    if (this.onStateChange) {
      this.onStateChange(this, 'turn_timer_stop', {
        currentPlayerId: this.players[this.currentTurn] ? this.players[this.currentTurn].id : null
      });
    }

    // Move to next player
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    
    // Skip dropped players
    while (this.players[this.currentTurn].hasDropped) {
      this.currentTurn = (this.currentTurn + 1) % this.players.length;
    }

    // Start timer for new turn
    this._startTurnTimer();

    // Notify about turn change
    if (this.onStateChange) {
      this.onStateChange(this, 'game_state_update', this.getGameState());
    }
  }

  /**
   * Start turn timer
   * @private
   */
  _startTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
    }

    const currentPlayer = this.players[this.currentTurn];
    
    // Record turn start time for synchronization
    this.turnStartTime = Date.now();
    
    // Send timer start event to frontend
    if (this.onStateChange) {
      this.onStateChange(this, 'turn_timer_start', {
        turnStartTime: this.turnStartTime,
        timeLimit: this.turnTimeLimit,
        currentPlayerId: currentPlayer ? currentPlayer.id : null
      });
    }
    
    // If current player is an AI bot, handle their turn automatically
    if (currentPlayer && currentPlayer.isBot) {
      this._handleAITurn(currentPlayer).catch(console.error);
      return;
    }

    this.turnTimer = setTimeout(() => {
      // Handle player timeout with 3-chances system
      const currentPlayer = this.players[this.currentTurn];
      if (currentPlayer && !currentPlayer.hasDropped && !currentPlayer.isBot) {
        this._handlePlayerTimeout(currentPlayer);
      }
    }, this.turnTimeLimit);
  }

  /**
   * Handle player timeout with 3-chances system
   * @param {Object} player - Player object
   * @private
   */
  _handlePlayerTimeout(player) {
    player.timeoutCount += 1;
    
    if (player.timeoutCount >= player.maxTimeouts) {
      // Player has reached maximum timeouts, auto-drop them
      console.log(`Player ${player.name} timed out ${player.timeoutCount} times, auto-dropping`);
      this._handlePlayerDrop(player.id, 'middle', true); // true indicates auto-drop
    } else {
      // Player still has chances left, skip their turn
      const remainingChances = player.maxTimeouts - player.timeoutCount;
      console.log(`Player ${player.name} timed out (${player.timeoutCount}/${player.maxTimeouts}), skipping turn. ${remainingChances} chances left`);
      
      // Notify about timeout before moving to next turn
      if (this.onStateChange) {
        this.onStateChange(this, 'player_timeout', {
          playerId: player.id,
          playerName: player.name,
          timeoutCount: player.timeoutCount,
          remainingChances: remainingChances
        });
      }
      
      // Move to next player's turn
      this._nextTurn();
    }
  }

  /**
   * Handle player drop
   * @param {string} playerId - Player ID
   * @param {string} dropType - Drop type
   * @param {boolean} isAutoDropped - Whether this is an auto-drop due to timeouts
   * @returns {Object} Result
   * @private
   */
  _handlePlayerDrop(playerId, dropType, isAutoDropped = false) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.hasDropped) {
      return { success: false, reason: 'Player already dropped or not found' };
    }

    player.hasDropped = true;
    player.dropType = dropType;
    player.score = this.dropPenalties[dropType] || this.dropPenalties.middle;
    player.isAutoDropped = isAutoDropped; // Track if this was an auto-drop

    if (isAutoDropped) {
      console.log(`Player ${player.name} auto-dropped after ${player.timeoutCount} timeouts with ${dropType} penalty (${player.score} points)`);
    } else {
      console.log(`Player ${player.name} dropped with ${dropType} penalty (${player.score} points)`);
    }

    // Notify about player drop
    if (this.onStateChange) {
      this.onStateChange(this, 'player_dropped', {
        playerId: player.id,
        playerName: player.name,
        dropType: dropType,
        isAutoDropped: isAutoDropped
      });
    }

    // Check if we need to end the game
    const activePlayers = this.players.filter(p => !p.hasDropped);
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      console.log(`Game ${this.gameId} ended. Winner: ${winner.name}`);
      this._endGame(winner.id, { isValid: true, totalPoints: 0, winReason: 'Last player remaining' });
    } else if (activePlayers.length === 0) {
      console.log(`Game ${this.gameId} ended. No winner - all players dropped`);
      this._endGame(null, { isValid: false, reason: 'All players dropped' });
    } else {
      // Continue with next turn
      this._nextTurn();
    }

    return { success: true };
  }

  /**
   * End the game
   * @param {string} winnerId - Winner player ID
   * @param {Object} result - Game result details
   * @private
   */
  _endGame(winnerId, result) {
    this.gameState = 'finished';
    this.gameEndTime = new Date();
    this.winner = winnerId;

    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    // Calculate final scores for all players
    this.players.forEach(player => {
      if (player.id === winnerId) {
        player.score = 0; // Winner gets 0 points
      } else if (!player.hasDropped) {
        // Calculate points based on remaining cards
        player.score = this.validator.calculatePoints(player.hand);
      }
      // Dropped players already have their penalty scores set
    });

    const winner = this.players.find(p => p.id === winnerId);
    console.log(`Game ${this.gameId} ended. Winner: ${winner ? winner.name : 'None'}`);
  }

  /**
   * Get game statistics
   * @returns {Object} Game statistics
   */
  getGameStats() {
    const duration = this.gameEndTime 
      ? this.gameEndTime.getTime() - this.gameStartTime.getTime()
      : Date.now() - this.gameStartTime.getTime();

    return {
      gameId: this.gameId,
      duration: duration,
      playersCount: this.players.length,
      gameState: this.gameState,
      winner: this.winner,
      playerStats: this.players.map(player => ({
        id: player.id,
        name: player.name,
        score: player.score,
        hasDropped: player.hasDropped,
        dropType: player.dropType
      }))
    };
  }

  /**
   * Add AI bot to fill empty slots
   * @param {number} count - Number of bots to add
   * @returns {Array} Array of added bot players
   */
  addAIBots(count = 1) {
    const botsAdded = [];
    const botNames = ['Alex', 'Maya', 'Raj', 'Priya', 'Sam', 'Nisha', 'Arjun', 'Kavya'];
    
    for (let i = 0; i < count && this.players.length < this.maxPlayers; i++) {
      const botName = botNames[Math.floor(Math.random() * botNames.length)];
      const bot = {
        id: `bot_${Date.now()}_${i}`,
        name: botName,
        socketId: null,
        isBot: true,
        hand: [],
        score: 0,
        hasDropped: false,
        dropType: null,
        timeoutCount: 0,
        maxTimeouts: 3,
        isAutoDropped: false
      };
      
      this.players.push(bot);
      botsAdded.push(bot);
      console.log(`AI Bot ${bot.name} added to game ${this.gameId}`);
    }
    
    return botsAdded;
  }

  /**
   * Handle AI bot's turn automatically
   * @param {Object} aiPlayer - AI player object
   * @private
   */
  async _handleAITurn(aiPlayer) {
    try {
      // Add human-like delay before AI makes decision
      await this.aiService.addHumanLikeDelay();
      
      // Get AI decision
      const playerIndex = this.players.findIndex(p => p.id === aiPlayer.id);
      const decision = await this.aiService.makeDecision(this.getGameStateForAI(), playerIndex);
      
      console.log(`AI ${aiPlayer.name} decision:`, decision.reasoning);
      
      // Execute AI's draw decision
      let drawResult;
      if (decision.pickFromDiscard) {
        drawResult = this.drawCard(aiPlayer.id, 'discard');
      } else {
        drawResult = this.drawCard(aiPlayer.id, 'deck');
      }
      
      if (!drawResult.success) {
        console.log(`AI ${aiPlayer.name} failed to draw:`, drawResult.reason);
        this._nextTurn();
        return;
      }
      
      // Handle discard decision
      if (!decision.cardToDiscard || decision.cardToDiscard === null) {
        console.log(`AI ${aiPlayer.name} decision returned null card, using random discard`);
        // Fallback to random discard
        const randomCard = aiPlayer.hand[Math.floor(Math.random() * aiPlayer.hand.length)];
        const discardResult = this.discardCard(aiPlayer.id, randomCard.id);
        if (!discardResult.success) {
          console.log(`AI ${aiPlayer.name} failed to discard random card:`, discardResult.reason);
        }
      } else {
        // Find the card to discard
        const cardToDiscard = aiPlayer.hand.find(card => 
          this.aiService.cardToString(card) === decision.cardToDiscard
        );
        
        if (!cardToDiscard) {
          console.log(`AI ${aiPlayer.name} couldn't find specified card to discard, using random card`);
          // Fallback to random discard
          const randomCard = aiPlayer.hand[Math.floor(Math.random() * aiPlayer.hand.length)];
          const discardResult = this.discardCard(aiPlayer.id, randomCard.id);
          if (!discardResult.success) {
            console.log(`AI ${aiPlayer.name} failed to discard fallback card:`, discardResult.reason);
          }
        } else {
          // Execute AI's discard decision
          const discardResult = this.discardCard(aiPlayer.id, cardToDiscard.id);
          
          if (!discardResult.success) {
            console.log(`AI ${aiPlayer.name} failed to discard:`, discardResult.reason);
          }
        }
      }
      
      // Check if AI wants to declare (simple logic for now)
      const handAnalysis = this.aiService.analyzeHand(aiPlayer.hand);
      if (handAnalysis.sequences.length > 0 && handAnalysis.points < 10) {
        // AI might consider declaring if they have good sequences and low points
        const declaration = this.validator.validateDeclaration(aiPlayer.hand);
        if (declaration.isValid) {
          console.log(`AI ${aiPlayer.name} declares with valid hand!`);
          this.declareHand(aiPlayer.id, aiPlayer.hand.map(card => card.id));
          return;
        }
      }
      
      // Note: _nextTurn() is already called by discardCard(), so we don't call it again
      
      // Notify server of state change
      this._notifyStateChange();
      
    } catch (error) {
      console.error(`Error in AI turn for ${aiPlayer.name}:`, error);
      // Fallback: make random moves with proper turn management
      this._makeRandomAIMove(aiPlayer, true);
    }
  }

  /**
   * Notify server of state change
   * @private
   */
  _notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange(this);
    }
  }

  /**
   * Fallback random AI move when OpenAI fails
   * @param {Object} aiPlayer - AI player object
   * @param {boolean} manageTurns - Whether to manage turns and broadcasting (default true)
   * @private
   */
  _makeRandomAIMove(aiPlayer, manageTurns = true) {
    try {
      // Random draw
      const drawFromDiscard = Math.random() < 0.3;
      const drawResult = this.drawCard(aiPlayer.id, drawFromDiscard ? 'discard' : 'deck');
      
      if (drawResult.success) {
        // Random discard
        const randomCard = aiPlayer.hand[Math.floor(Math.random() * aiPlayer.hand.length)];
        this.discardCard(aiPlayer.id, randomCard.id);
        // Note: discardCard() already calls _nextTurn(), so we don't call it again
      } else if (manageTurns) {
        // If draw failed and we're managing turns, still advance turn
        this._nextTurn();
      }
      
      // Notify server of state change after AI fallback move (only if managing turns)
      if (manageTurns) {
        this._notifyStateChange();
      }
      
    } catch (error) {
      console.error(`Error in random AI move for ${aiPlayer.name}:`, error);
      if (manageTurns) {
        this._nextTurn();
        this._notifyStateChange();
      }
    }
  }

  /**
   * Fill remaining slots with AI bots when game starts
   * @param {number} minPlayers - Minimum players needed
   */
  fillWithBots(minPlayers = 2) {
    const currentPlayers = this.players.length;
    if (currentPlayers < minPlayers) {
      const botsNeeded = minPlayers - currentPlayers;
      this.addAIBots(botsNeeded);
    }
  }

  /**
   * Cleanup game resources
   */
  cleanup() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    console.log(`Game ${this.gameId} cleaned up`);
  }
}

module.exports = GameEngine; 