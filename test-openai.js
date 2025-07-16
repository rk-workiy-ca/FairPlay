const AIService = require('./server/ai/AIService');
const Card = require('./server/game/Card');

async function testOpenAI() {
    console.log('Testing OpenAI Integration for FairPlay Rummy...');
    
    const aiService = new AIService();
    
    // Create a sample game state for testing
    const sampleHand = [
        new Card('7', 'hearts'),
        new Card('8', 'hearts'),
        new Card('9', 'hearts'),
        new Card('K', 'spades'),
        new Card('K', 'clubs'),
        new Card('K', 'diamonds'),
        new Card('A', 'spades'),
        new Card('2', 'clubs'),
        new Card('5', 'diamonds'),
        new Card('J', 'hearts'),
        new Card('Q', 'hearts'),
        new Card('10', 'spades'),
        new Card('4', 'clubs')
    ];
    
    const mockGameState = {
        players: [
            { hand: sampleHand, hasDropped: false },
            { hand: new Array(13).fill(null), hasDropped: false }
        ],
        discardPile: [new Card('3', 'hearts')],
        deck: { cards: new Array(50).fill(null) },
        wildJoker: new Card('6', 'spades')
    };
    
    try {
        console.log('\nSample hand:', sampleHand.map(c => c.getDisplayName()).join(', '));
        console.log('Top discard card: 3♥');
        console.log('Wild joker: 6♠');
        
        const decision = await aiService.makeDecision(mockGameState, 0);
        
        console.log('\n🤖 AI Decision:');
        console.log('Pick from discard:', decision.pickFromDiscard);
        console.log('Card to discard:', decision.cardToDiscard);
        console.log('Reasoning:', decision.reasoning);
        
        console.log('\n✅ OpenAI integration test successful!');
        
    } catch (error) {
        console.error('\n❌ OpenAI integration test failed:', error.message);
        
        // Test fallback functionality
        console.log('\n🔄 Testing fallback random decision...');
        const fallbackDecision = aiService.makeRandomDecision(mockGameState, 0);
        console.log('Fallback decision:', fallbackDecision);
        console.log('✅ Fallback system working!');
    }
}

testOpenAI(); 