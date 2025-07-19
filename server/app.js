require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const GameEngine = require('./game/GameEngine');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Game management
const games = new Map(); // gameId -> GameEngine
const playerSockets = new Map(); // socketId -> {playerId, gameId, playerName}
const waitingPlayers = []; // Players waiting for a game

/**
 * Create a new game or join existing one
 * @param {number} maxPlayers - Maximum players for the game
 * @returns {GameEngine} Game instance
 */
function findOrCreateGame(maxPlayers = 4) {
  // Look for a waiting game with same player count
  for (let [gameId, game] of games.entries()) {
    if (game.gameState === 'waiting' && 
        game.maxPlayers === maxPlayers && 
        game.players.length < maxPlayers) {
      return game;
    }
  }

  // Create new game if none found
  const newGame = new GameEngine(null, maxPlayers);
  
  // Set up state change callback for broadcasting
  newGame.onStateChange = (game, eventType, eventData) => {
    if (eventType === 'player_timeout') {
      // Broadcast timeout event to all players
      broadcastToGame(game.gameId, 'player_timeout', eventData);
    }
    // Always broadcast game state update
    broadcastToGame(game.gameId, 'game_state_update', game.getGameState());
  };
  
  games.set(newGame.gameId, newGame);
  
  // Cleanup finished games periodically
  setInterval(() => cleanupFinishedGames(), 300000); // 5 minutes
  
  return newGame;
}

/**
 * Clean up finished games to free memory
 */
function cleanupFinishedGames() {
  for (let [gameId, game] of games.entries()) {
    if (game.gameState === 'finished') {
      const timeSinceEnd = Date.now() - (game.gameEndTime?.getTime() || 0);
      if (timeSinceEnd > 600000) { // 10 minutes after game end
        game.cleanup();
        games.delete(gameId);
        console.log(`Cleaned up finished game ${gameId}`);
      }
    }
  }
}

/**
 * Broadcast game state to all players in a game
 * @param {string} gameId - Game ID
 * @param {string} event - Event name
 * @param {Object} data - Data to send
 */
function broadcastToGame(gameId, event, data) {
  const game = games.get(gameId);
  if (!game) return;

  game.players.forEach(player => {
    if (player.socketId) {
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.emit(event, data);
      }
    }
  });
}

/**
 * Send private data to specific player
 * @param {string} playerId - Player ID
 * @param {string} event - Event name
 * @param {Object} data - Data to send
 */
function sendToPlayer(playerId, event, data) {
  for (let [socketId, playerInfo] of playerSockets.entries()) {
    if (playerInfo.playerId === playerId) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
      }
      break;
    }
  }
}

/**
 * Check if game should start with AI bots and start if needed
 * @param {GameEngine} game - Game instance
 */
function checkAndStartGameWithBots(game) {
  // Fast 10-second wait time for development/testing
  let maxWaitTimeSeconds = 10; // Fixed 10 seconds for all times

  // Start countdown timer for this game if not already started
  if (!game.waitTimer && game.gameState === 'waiting') {
    game.waitStartTime = Date.now();
    game.maxWaitTime = maxWaitTimeSeconds * 1000; // Convert to milliseconds
    
    console.log(`Game ${game.gameId}: Starting wait timer for ${maxWaitTimeSeconds.toFixed(1)} seconds`);
    
    game.waitTimer = setTimeout(() => {
      // Time's up - fill remaining slots with AI bots and start game
      if (game.gameState === 'waiting') {
        console.log(`Game ${game.gameId}: Wait time expired, filling with AI bots`);
        
        // Add AI bots to fill ALL remaining seats up to maxPlayers
        const humanPlayers = game.players.filter(p => !p.isBot).length;
        if (humanPlayers >= 1) {
          // Fill ALL remaining seats with AI bots
          const botsNeeded = game.maxPlayers - game.players.length;
          
          console.log(`Game ${game.gameId}: Current players: ${game.players.length}/${game.maxPlayers} (${humanPlayers} human)`);
          console.log(`Game ${game.gameId}: Need to add ${botsNeeded} AI bots to fill all seats`);
          
          if (botsNeeded > 0) {
            const addedBots = game.addAIBots(botsNeeded);
            console.log(`Game ${game.gameId}: Added ${addedBots.length} AI bots`);
          }
          
          // Start the game
          const startResult = game.startGame();
          if (startResult.success) {
            console.log(`Game ${game.gameId}: Started with ${game.players.length} players (${humanPlayers} human, ${game.players.length - humanPlayers} AI)`);
            
            // Broadcast game started to all players
            broadcastToGame(game.gameId, 'game_started', {
              gameState: game.getGameState(),
              message: 'Game started! Let the cards be dealt.'
            });
            
            // Send hands to human players
            game.players.forEach(player => {
              if (!player.isBot && player.socketId) {
                const handResult = game.getPlayerHand(player.id);
                if (handResult.success) {
                  io.to(player.socketId).emit('hand_update', { hand: handResult.hand });
                }
              }
            });
          }
        }
      }
      
      // Clear the timer
      if (game.waitTimer) {
        clearTimeout(game.waitTimer);
        game.waitTimer = null;
      }
    }, game.maxWaitTime);
  }

  // If game is full, start immediately
  if (game.players.length >= game.maxPlayers && game.gameState === 'waiting') {
    console.log(`Game ${game.gameId}: Game full, starting immediately`);
    
    // Clear wait timer if it exists
    if (game.waitTimer) {
      clearTimeout(game.waitTimer);
      game.waitTimer = null;
    }
    
    // Start the game
    const startResult = game.startGame();
    if (startResult.success) {
      console.log(`Game ${game.gameId}: Started with ${game.players.length} players`);
      
      // Broadcast game started to all players
      broadcastToGame(game.gameId, 'game_started', {
        gameState: game.getGameState(),
        message: 'Game started! All players joined.'
      });
      
      // Send hands to human players
      game.players.forEach(player => {
        if (!player.isBot && player.socketId) {
          const handResult = game.getPlayerHand(player.id);
          if (handResult.success) {
            io.to(player.socketId).emit('hand_update', { hand: handResult.hand });
          }
        }
      });
    }
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle player joining a game
  socket.on('join_game', (data) => {
    try {
      const { playerName, maxPlayers = 4 } = data;
      
      if (!playerName || playerName.trim().length === 0) {
        socket.emit('error', { message: 'Player name is required' });
        return;
      }

      // Find or create a game
      const game = findOrCreateGame(maxPlayers);
      const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Add player to game
      const result = game.addPlayer({
        id: playerId,
        name: playerName.trim(),
        socketId: socket.id
      });

      if (!result.success) {
        socket.emit('error', { message: result.reason });
        return;
      }

      // Store player info
      playerSockets.set(socket.id, {
        playerId: playerId,
        gameId: game.gameId,
        playerName: playerName.trim()
      });

      // Join socket room for the game
      socket.join(game.gameId);

      // Send success response to player
      socket.emit('game_joined', {
        success: true,
        gameId: game.gameId,
        playerId: playerId,
        playerName: playerName.trim()
      });

      // Check if we should start the game with AI bots
      checkAndStartGameWithBots(game);

      // Broadcast updated game state to all players
      broadcastToGame(game.gameId, 'game_state_update', game.getGameState());

      console.log(`Player ${playerName} joined game ${game.gameId}`);

    } catch (error) {
      console.error('Error in join_game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Handle drawing a card
  socket.on('draw_card', (data) => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const { source = 'deck' } = data;
      const result = game.drawCard(playerInfo.playerId, source);

      if (!result.success) {
        socket.emit('error', { message: result.reason });
        return;
      }

      // Send drawn card to player (private)
      socket.emit('card_drawn', result);

      // Send updated hand to player
      const handResult = game.getPlayerHand(playerInfo.playerId);
      if (handResult.success) {
        socket.emit('hand_update', { hand: handResult.hand });
      }

      // Broadcast game state update to all players
      broadcastToGame(game.gameId, 'game_state_update', game.getGameState());

    } catch (error) {
      console.error('Error in draw_card:', error);
      socket.emit('error', { message: 'Failed to draw card' });
    }
  });

  // Handle discarding a card
  socket.on('discard_card', (data) => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const { cardId } = data;
      const result = game.discardCard(playerInfo.playerId, cardId);

      if (!result.success) {
        socket.emit('error', { message: result.reason });
        return;
      }

      // Send updated hand to player
      const handResult = game.getPlayerHand(playerInfo.playerId);
      if (handResult.success) {
        socket.emit('hand_update', { hand: handResult.hand });
      }

      // Broadcast game state update to all players
      broadcastToGame(game.gameId, 'game_state_update', game.getGameState());
      broadcastToGame(game.gameId, 'card_discarded', {
        playerId: playerInfo.playerId,
        playerName: playerInfo.playerName,
        discardedCard: result.discardedCard
      });

    } catch (error) {
      console.error('Error in discard_card:', error);
      socket.emit('error', { message: 'Failed to discard card' });
    }
  });

  // Handle player declaration
  socket.on('declare_hand', (data) => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const { groups } = data;
      const result = game.declareHand(playerInfo.playerId, groups);

      // Send declaration result to player
      socket.emit('declaration_result', result);

      // Broadcast game state update to all players
      broadcastToGame(game.gameId, 'game_state_update', game.getGameState());

      if (result.isValid) {
        broadcastToGame(game.gameId, 'game_ended', {
          winner: playerInfo.playerId,
          winnerName: playerInfo.playerName,
          gameStats: game.getGameStats()
        });
      }

    } catch (error) {
      console.error('Error in declare_hand:', error);
      socket.emit('error', { message: 'Failed to declare hand' });
    }
  });

  // Handle player dropping
  socket.on('drop_game', (data) => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const { dropType = 'middle' } = data;
      const result = game.dropPlayer(playerInfo.playerId, dropType);

      if (!result.success) {
        socket.emit('error', { message: result.reason });
        return;
      }

      // Broadcast game state update to all players
      broadcastToGame(game.gameId, 'game_state_update', game.getGameState());
      broadcastToGame(game.gameId, 'player_dropped', {
        playerId: playerInfo.playerId,
        playerName: playerInfo.playerName,
        dropType: dropType
      });

    } catch (error) {
      console.error('Error in drop_game:', error);
      socket.emit('error', { message: 'Failed to drop from game' });
    }
  });

  // Handle getting current hand
  socket.on('get_hand', () => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const handResult = game.getPlayerHand(playerInfo.playerId);
      if (handResult.success) {
        socket.emit('hand_update', { hand: handResult.hand });
      } else {
        socket.emit('error', { message: handResult.reason });
      }

    } catch (error) {
      console.error('Error in get_hand:', error);
      socket.emit('error', { message: 'Failed to get hand' });
    }
  });

  // Handle getting game state
  socket.on('get_game_state', () => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const game = games.get(playerInfo.gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      socket.emit('game_state_update', game.getGameState());

    } catch (error) {
      console.error('Error in get_game_state:', error);
      socket.emit('error', { message: 'Failed to get game state' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (playerInfo) {
        const game = games.get(playerInfo.gameId);
        if (game) {
          // Mark player as disconnected but don't remove them immediately
          const player = game.players.find(p => p.id === playerInfo.playerId);
          if (player) {
            player.isConnected = false;
            player.socketId = null;
            
            // Auto-drop after 30 seconds if still disconnected
            setTimeout(() => {
              const currentGame = games.get(playerInfo.gameId);
              if (currentGame) {
                const currentPlayer = currentGame.players.find(p => p.id === playerInfo.playerId);
                if (currentPlayer && !currentPlayer.isConnected) {
                  currentGame.dropPlayer(playerInfo.playerId, 'middle');
                  broadcastToGame(playerInfo.gameId, 'game_state_update', currentGame.getGameState());
                }
              }
            }, 30000);

            broadcastToGame(playerInfo.gameId, 'player_disconnected', {
              playerId: playerInfo.playerId,
              playerName: playerInfo.playerName
            });
          }
        }
        
        playerSockets.delete(socket.id);
      }

      console.log(`Client disconnected: ${socket.id}`);
    } catch (error) {
      console.error('Error in disconnect:', error);
    }
  });
});

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeGames: games.size,
    connectedPlayers: playerSockets.size
  });
});

app.get('/api/stats', (req, res) => {
  const stats = {
    activeGames: games.size,
    connectedPlayers: playerSockets.size,
    games: []
  };

  for (let [gameId, game] of games.entries()) {
    stats.games.push({
      gameId: gameId,
      state: game.gameState,
      players: game.players.length,
      maxPlayers: game.maxPlayers,
      startTime: game.gameStartTime
    });
  }

  res.json(stats);
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
server.listen(PORT, () => {
  console.log(`FairPlay Rummy POC Server running on port ${PORT}`);
  console.log(`Access the game at: http://localhost:${PORT}`);
}); 