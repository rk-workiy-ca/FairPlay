const OpenAI = require('openai');
const Card = require('../game/Card');
const GameValidator = require('../game/GameValidator');

class AIService {
    constructor() {
        // Make OpenAI optional for testing
        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
            this.aiEnabled = true;
        } else {
            console.log('Warning: OPENAI_API_KEY not set. AI bots will use basic logic.');
            this.openai = null;
            this.aiEnabled = false;
        }
        this.validator = new GameValidator();
    }

    /**
     * AI makes a decision for a turn - whether to pick from deck or discard pile
     * and which card to discard
     */
    async makeDecision(gameState, playerIndex) {
        try {
            const player = gameState.players[playerIndex];
            
            // Use basic logic if OpenAI is not available
            if (!this.aiEnabled) {
                return this.makeBasicDecision(gameState, playerIndex);
            }
            
            const gameContext = this.prepareGameContext(gameState, playerIndex);
            
            const prompt = this.createDecisionPrompt(gameContext);
            
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert Indian Rummy player. Analyze the game state and make the best strategic decision. You must respond with a valid JSON object containing your decision."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7, // Add some randomness to make it more human-like
                max_tokens: 500
            });

            const aiResponse = response.choices[0].message.content;
            return this.parseAIResponse(aiResponse, gameContext);
            
        } catch (error) {
            console.log('AI Service error, falling back to random play:', error.message);
            // Fallback to simple random decision if AI fails
            return this.makeRandomDecision(gameState, playerIndex);
        }
    }

    /**
     * Prepare game context for AI analysis
     */
    prepareGameContext(gameState, playerIndex) {
        const player = gameState.players[playerIndex];
        
        // Validate player and hand data
        if (!player || !player.hand || !Array.isArray(player.hand)) {
            console.log('Invalid player or hand data in prepareGameContext');
            throw new Error('Invalid player or hand data');
        }
        
        const hand = player.hand.map(card => this.cardToString(card));
        const discardPile = (gameState.discardPile || []).map(card => this.cardToString(card));
        const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
        
        // Analyze current hand for sequences and sets
        const analysis = this.analyzeHand(player.hand);
        
        return {
            hand,
            topDiscard,
            remainingDeckCards: gameState.deck?.cards?.length || 0,
            wildJoker: gameState.wildJoker ? this.cardToString(gameState.wildJoker) : null,
            handAnalysis: analysis,
            gamePhase: this.determineGamePhase(gameState),
            opponentCardCounts: gameState.players.map((p, i) => 
                i !== playerIndex && p.hand ? p.hand.length : null
            ).filter(count => count !== null)
        };
    }

    /**
     * Create decision prompt for AI
     */
    createDecisionPrompt(context) {
        return `You are playing Indian Rummy. Analyze this game state and make your next move:

CURRENT HAND: ${context.hand.join(', ')}
TOP DISCARD CARD: ${context.topDiscard || 'None'}
WILD JOKER: ${context.wildJoker}
REMAINING DECK CARDS: ${context.remainingDeckCards}
OPPONENT CARD COUNTS: ${context.opponentCardCounts.join(', ')}

HAND ANALYSIS:
- Potential sequences: ${context.handAnalysis.sequences.length}
- Potential sets: ${context.handAnalysis.sets.length}
- Ungrouped cards: ${context.handAnalysis.ungrouped.join(', ')}
- Current points: ${context.handAnalysis.points}

GAME PHASE: ${context.gamePhase}

RUMMY RULES REMINDER:
- Need at least 1 pure sequence (without joker) to declare
- Can form sequences (3+ consecutive cards of same suit) and sets (3-4 same rank cards)
- Jokers can substitute any card except in pure sequences
- Goal is to minimize points in ungrouped cards

DECISION REQUIRED:
1. Should you pick from DISCARD pile (the ${context.topDiscard}) or from DECK?
2. Which card should you discard after picking?

Respond with ONLY a JSON object in this format:
{
    "pickFromDiscard": true/false,
    "cardToDiscard": "rank_of_suit" (e.g., "A_hearts", "K_spades"),
    "reasoning": "brief explanation of strategy"
}`;
    }

    /**
     * Parse AI response and validate decision
     */
    parseAIResponse(response, context) {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            
            const decision = JSON.parse(jsonMatch[0]);
            
            // Validate decision format
            if (typeof decision.pickFromDiscard !== 'boolean') {
                throw new Error('Invalid pickFromDiscard value');
            }
            
            if (!decision.cardToDiscard || typeof decision.cardToDiscard !== 'string') {
                throw new Error('Invalid cardToDiscard value');
            }
            
            // Validate that the card to discard exists in hand
            if (!context.hand.includes(decision.cardToDiscard)) {
                throw new Error('Card to discard not in hand');
            }
            
            return decision;
            
        } catch (error) {
            console.log('Failed to parse AI response:', error.message);
            console.log('AI Response was:', response);
            throw error;
        }
    }

    /**
     * Analyze hand for sequences and sets
     */
    analyzeHand(hand) {
        const sequences = [];
        const sets = [];
        const ungrouped = [...hand];
        let points = 0;

        // Sort hand for analysis
        const sortedHand = [...hand].sort((a, b) => {
            if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
            return this.getCardValue(a) - this.getCardValue(b);
        });

        // Find potential sequences
        for (let suit of ['hearts', 'diamonds', 'clubs', 'spades']) {
            const suitCards = sortedHand.filter(card => card.suit === suit && !card.isJoker);
            for (let i = 0; i < suitCards.length - 2; i++) {
                const sequence = [suitCards[i]];
                let expectedValue = this.getCardValue(suitCards[i]) + 1;
                
                for (let j = i + 1; j < suitCards.length; j++) {
                    if (this.getCardValue(suitCards[j]) === expectedValue) {
                        sequence.push(suitCards[j]);
                        expectedValue++;
                    }
                }
                
                if (sequence.length >= 3) {
                    sequences.push(sequence.map(c => this.cardToString(c)));
                }
            }
        }

        // Find potential sets
        const rankGroups = {};
        hand.forEach(card => {
            if (!card.isJoker) {
                if (!rankGroups[card.rank]) rankGroups[card.rank] = [];
                rankGroups[card.rank].push(card);
            }
        });

        Object.values(rankGroups).forEach(group => {
            if (group.length >= 3) {
                sets.push(group.map(c => this.cardToString(c)));
            }
        });

        // Calculate points for ungrouped cards
        hand.forEach(card => {
            if (card && typeof card.getPoints === 'function') {
                points += card.getPoints();
            } else if (card && card.rank) {
                // Fallback point calculation
                const cardPoints = card.rank === 'A' ? 1 : 
                                 ['J', 'Q', 'K'].includes(card.rank) ? 10 : 
                                 parseInt(card.rank) || 10;
                points += cardPoints;
            }
        });

        return {
            sequences,
            sets,
            ungrouped: ungrouped.map(c => this.cardToString(c)),
            points
        };
    }

    /**
     * Determine current game phase
     */
    determineGamePhase(gameState) {
        const maxCards = Math.max(...gameState.players.map(p => p.hand.length));
        const minCards = Math.min(...gameState.players.map(p => p.hand.length));
        
        if (minCards <= 5) return 'ENDGAME';
        if (minCards <= 8) return 'MIDGAME';
        return 'OPENING';
    }

    /**
     * Fallback random decision maker
     */
    makeRandomDecision(gameState, playerIndex) {
        const player = gameState.players[playerIndex];
        const topDiscard = gameState.discardPile && gameState.discardPile.length > 0 ? 
                          gameState.discardPile[gameState.discardPile.length - 1] : null;
        
        // Check if we have hand data
        if (!player.hand || !Array.isArray(player.hand) || player.hand.length === 0) {
            console.log('No hand data available for AI fallback decision');
            return {
                pickFromDiscard: false,
                cardToDiscard: null,
                reasoning: "No hand data available for fallback"
            };
        }
        
        // Simple random logic
        const pickFromDiscard = topDiscard && Math.random() < 0.3; // 30% chance to pick from discard
        const randomCardIndex = Math.floor(Math.random() * player.hand.length);
        const cardToDiscard = this.cardToString(player.hand[randomCardIndex]);
        
        return {
            pickFromDiscard,
            cardToDiscard,
            reasoning: "Random decision (AI fallback)"
        };
    }

    /**
     * Helper methods
     */
    cardToString(card) {
        if (!card) return null;
        return `${card.rank}_${card.suit}`;
    }

    stringToCard(cardString) {
        const [rank, suit] = cardString.split('_');
        return new Card(rank, suit);
    }

    getCardValue(card) {
        const values = {
            'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
        };
        return values[card.rank] || 0;
    }

    /**
     * Basic AI decision making when OpenAI is not available
     */
    makeBasicDecision(gameState, playerIndex) {
        const player = gameState.players[playerIndex];
        const discardPile = gameState.discardPile;
        
        // Basic strategy: always draw from deck, discard highest value card
        const handCopy = [...player.hand];
        handCopy.sort((a, b) => this.getCardValue(b) - this.getCardValue(a));
        
        return {
            pickFromDiscard: false, // Always draw from deck for simplicity
            cardToDiscard: handCopy[0].id, // Discard highest value card
            reasoning: "Basic AI: Drawing from deck and discarding highest value card"
        };
    }

    /**
     * Add human-like delay to make AI less obvious
     */
    async addHumanLikeDelay() {
        // Random delay between 2-6 seconds to simulate thinking
        const delay = 2000 + Math.random() * 4000;
        return new Promise(resolve => setTimeout(resolve, delay));
    }
}

module.exports = AIService; 