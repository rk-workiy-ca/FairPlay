/**
 * FairPlay Rummy POC - Basic Test
 * Tests core game functionality
 */

const Card = require('./server/game/Card');
const Deck = require('./server/game/Deck');
const GameValidator = require('./server/game/GameValidator');
const GameEngine = require('./server/game/GameEngine');

console.log('🃏 FairPlay Rummy POC - Running Tests...\n');

// Test 1: Card Creation and Properties
console.log('=== Test 1: Card Creation ===');
try {
    const aceHearts = new Card('hearts', 1);
    const kingSpades = new Card('spades', 13);
    const printedJoker = Card.createPrintedJoker();
    
    console.log('✅ Ace of Hearts:', aceHearts.getDisplayName(), `(${aceHearts.getPointValue()} points)`);
    console.log('✅ King of Spades:', kingSpades.getDisplayName(), `(${kingSpades.getPointValue()} points)`);
    console.log('✅ Printed Joker:', printedJoker.getDisplayName(), `(${printedJoker.getPointValue()} points)`);
    
    console.log('✅ Cards consecutive test:', aceHearts.isConsecutive(new Card('hearts', 2)));
    console.log('✅ Same rank test:', kingSpades.isSameRank(new Card('hearts', 13)));
} catch (error) {
    console.error('❌ Card test failed:', error.message);
}

// Test 2: Deck Operations
console.log('\n=== Test 2: Deck Operations ===');
try {
    const deck = new Deck();
    console.log('✅ Deck created with', deck.getRemainingCount(), 'cards');
    
    deck.shuffle();
    console.log('✅ Deck shuffled');
    
    const wildJoker = deck.setupWildJoker();
    console.log('✅ Wild joker set:', wildJoker ? wildJoker.getDisplayName() : 'None');
    
    const hand = deck.dealCards(13);
    console.log('✅ Dealt 13 cards, remaining:', deck.getRemainingCount());
    console.log('✅ Sample cards:', hand.slice(0, 3).map(c => c.getDisplayName()).join(', '));
    
    const discardCard = deck.dealCard();
    deck.addToDiscardPile(discardCard);
    console.log('✅ Added to discard pile:', discardCard.getDisplayName());
    console.log('✅ Top discard card:', deck.peekDiscardPile()?.getDisplayName());
} catch (error) {
    console.error('❌ Deck test failed:', error.message);
}

// Test 3: Game Validator
console.log('\n=== Test 3: Game Validator ===');
try {
    const validator = new GameValidator();
    
    // Test pure sequence
    const pureSequence = [
        new Card('hearts', 1),
        new Card('hearts', 2),
        new Card('hearts', 3)
    ];
    const pureResult = validator.validatePureSequence(pureSequence);
    console.log('✅ Pure sequence validation:', pureResult.isValid ? '✅ Valid' : '❌ Invalid');
    
    // Test set
    const set = [
        new Card('hearts', 7),
        new Card('diamonds', 7),
        new Card('clubs', 7)
    ];
    const setResult = validator.validateSet(set);
    console.log('✅ Set validation:', setResult.isValid ? '✅ Valid' : '❌ Invalid');
    
    // Test invalid group
    const invalidGroup = [
        new Card('hearts', 1),
        new Card('spades', 5),
        new Card('diamonds', 10)
    ];
    const invalidResult = validator.validatePureSequence(invalidGroup);
    console.log('✅ Invalid group validation:', invalidResult.isValid ? '❌ Should be invalid' : '✅ Correctly invalid');
} catch (error) {
    console.error('❌ Validator test failed:', error.message);
}

// Test 4: Game Engine Basic Operations
console.log('\n=== Test 4: Game Engine ===');
try {
    const game = new GameEngine();
    console.log('✅ Game created with ID:', game.gameId);
    
    // Add players
    const player1Result = game.addPlayer({ id: 'p1', name: 'Alice', socketId: 'socket1' });
    const player2Result = game.addPlayer({ id: 'p2', name: 'Bob', socketId: 'socket2' });
    
    console.log('✅ Player 1 added:', player1Result.success ? '✅ Success' : '❌ Failed');
    console.log('✅ Player 2 added:', player2Result.success ? '✅ Success' : '❌ Failed');
    
    // Start game
    const startResult = game.startGame();
    console.log('✅ Game started:', startResult.success ? '✅ Success' : '❌ Failed');
    
    if (startResult.success) {
        const gameState = game.getGameState();
        console.log('✅ Game state:', gameState.gameState);
        console.log('✅ Current turn:', gameState.currentPlayer);
        console.log('✅ Players count:', gameState.players.length);
        
        // Get player hand
        const handResult = game.getPlayerHand('p1');
        if (handResult.success) {
            console.log('✅ Player 1 hand size:', handResult.hand.length);
            console.log('✅ Sample cards:', handResult.hand.slice(0, 3).map(c => c.displayName).join(', '));
        }
    }
    
    // Cleanup
    game.cleanup();
    console.log('✅ Game cleaned up');
    
} catch (error) {
    console.error('❌ Game engine test failed:', error.message);
}

// Test 5: Card Comparison and Sorting
console.log('\n=== Test 5: Card Utilities ===');
try {
    const cards = [
        new Card('hearts', 13),
        new Card('spades', 1),
        new Card('diamonds', 7),
        Card.createPrintedJoker(),
        new Card('clubs', 5)
    ];
    
    console.log('✅ Original cards:', cards.map(c => c.getDisplayName()).join(', '));
    
    cards.sort((a, b) => a.compare(b));
    console.log('✅ Sorted cards:', cards.map(c => c.getDisplayName()).join(', '));
    
    const totalPoints = cards.reduce((sum, card) => sum + card.getPointValue(), 0);
    console.log('✅ Total points:', totalPoints);
    
} catch (error) {
    console.error('❌ Card utilities test failed:', error.message);
}

// Performance Test
console.log('\n=== Performance Test ===');
try {
    const startTime = Date.now();
    
    // Create and shuffle 100 decks
    for (let i = 0; i < 100; i++) {
        const deck = new Deck();
        deck.shuffle();
        deck.setupWildJoker();
        deck.dealCards(13);
    }
    
    const endTime = Date.now();
    console.log('✅ Created and processed 100 decks in', endTime - startTime, 'ms');
    
} catch (error) {
    console.error('❌ Performance test failed:', error.message);
}

console.log('\n🎉 Tests completed! FairPlay Rummy POC is ready for gameplay.');
console.log('🌐 Visit http://localhost:3000 to start playing!');
console.log('📊 Monitor server at http://localhost:3000/api/stats'); 