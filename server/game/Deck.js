const Card = require('./Card');

/**
 * Deck class for managing cards in Indian Rummy
 * Handles 2 standard decks (104 cards) + 2 printed jokers = 106 total cards
 */
class Deck {
  /**
   * Create a new deck
   * @param {boolean} includePrintedJokers - Whether to include printed jokers
   */
  constructor(includePrintedJokers = true) {
    this.cards = [];
    this.discardPile = [];
    this.wildJokerCard = null;
    this.includePrintedJokers = includePrintedJokers;
    this._initializeDeck();
  }

  /**
   * Initialize the deck with 2 standard decks + jokers
   * @private
   */
  _initializeDeck() {
    this.cards = [];
    
    // Create 2 standard decks (52 cards each)
    for (let deckNum = 0; deckNum < 2; deckNum++) {
      for (let suitKey in Card.SUITS) {
        const suit = Card.SUITS[suitKey];
        
        // Add all ranks (Ace=1 to King=13)
        for (let rank = 1; rank <= 13; rank++) {
          this.cards.push(new Card(suit, rank));
        }
      }
    }

    // Add 2 printed jokers if enabled
    if (this.includePrintedJokers) {
      this.cards.push(Card.createPrintedJoker());
      this.cards.push(Card.createPrintedJoker());
    }

    console.log(`Deck initialized with ${this.cards.length} cards`);
  }

  /**
   * Shuffle the deck using Fisher-Yates algorithm
   * @returns {Deck} This deck for method chaining
   */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    
    console.log('Deck shuffled');
    return this;
  }

  /**
   * Deal a specific number of cards
   * @param {number} count - Number of cards to deal
   * @returns {Card[]} Array of dealt cards
   */
  dealCards(count) {
    if (count > this.cards.length) {
      throw new Error(`Cannot deal ${count} cards, only ${this.cards.length} cards remaining`);
    }

    const dealtCards = this.cards.splice(0, count);
    console.log(`Dealt ${count} cards, ${this.cards.length} cards remaining in deck`);
    return dealtCards;
  }

  /**
   * Deal a single card
   * @returns {Card|null} The dealt card or null if deck is empty
   */
  dealCard() {
    if (this.cards.length === 0) {
      return null;
    }
    
    return this.cards.shift();
  }

  /**
   * Set up wild joker for this game
   * Draws one card from deck and sets all cards of same rank as wild jokers
   * @returns {Card} The wild joker card
   */
  setupWildJoker() {
    if (this.cards.length === 0) {
      throw new Error('Cannot setup wild joker from empty deck');
    }

    // Draw a card to determine wild joker
    this.wildJokerCard = this.dealCard();
    
    // If we drew a printed joker, draw another card
    while (this.wildJokerCard && this.wildJokerCard.isJoker && this.cards.length > 0) {
      this.wildJokerCard = this.dealCard();
    }

    console.log(`Wild joker set: ${this.wildJokerCard ? this.wildJokerCard.getDisplayName() : 'None'}`);
    return this.wildJokerCard;
  }

  /**
   * Get the current wild joker card
   * @returns {Card|null} The wild joker card
   */
  getWildJoker() {
    return this.wildJokerCard;
  }

  /**
   * Add a card to the discard pile
   * @param {Card} card - Card to discard
   */
  addToDiscardPile(card) {
    this.discardPile.push(card);
    console.log(`Card ${card.getDisplayName()} added to discard pile`);
  }

  /**
   * Get the top card from discard pile without removing it
   * @returns {Card|null} Top card from discard pile
   */
  peekDiscardPile() {
    if (this.discardPile.length === 0) {
      return null;
    }
    return this.discardPile[this.discardPile.length - 1];
  }

  /**
   * Draw the top card from discard pile
   * @returns {Card|null} The drawn card or null if discard pile is empty
   */
  drawFromDiscardPile() {
    if (this.discardPile.length === 0) {
      return null;
    }
    
    const card = this.discardPile.pop();
    console.log(`Drew ${card.getDisplayName()} from discard pile`);
    return card;
  }

  /**
   * Get all cards of same rank as wild joker
   * @returns {Card[]} Array of cards that can act as wild jokers
   */
  getWildJokerCards() {
    if (!this.wildJokerCard || this.wildJokerCard.isJoker) {
      return [];
    }

    return this.getAllCards().filter(card => 
      !card.isJoker && 
      card.suit === this.wildJokerCard.suit && 
      card.rank === this.wildJokerCard.rank
    );
  }

  /**
   * Check if a card can act as a joker in this game
   * @param {Card} card - Card to check
   * @returns {boolean} True if card can act as joker
   */
  isJokerCard(card) {
    return card.canActAsJoker(this.wildJokerCard);
  }

  /**
   * Get remaining cards count in deck
   * @returns {number} Number of cards left
   */
  getRemainingCount() {
    return this.cards.length;
  }

  /**
   * Get discard pile count
   * @returns {number} Number of cards in discard pile
   */
  getDiscardPileCount() {
    return this.discardPile.length;
  }

  /**
   * Check if deck needs reshuffling (low on cards)
   * @param {number} threshold - Minimum cards threshold (default: 10)
   * @returns {boolean} True if deck needs reshuffling
   */
  needsReshuffling(threshold = 10) {
    return this.cards.length <= threshold && this.discardPile.length > 0;
  }

  /**
   * Reshuffle discard pile back into deck (except top card)
   * @returns {Deck} This deck for method chaining
   */
  reshuffleDiscardPile() {
    if (this.discardPile.length <= 1) {
      console.log('Not enough cards in discard pile to reshuffle');
      return this;
    }

    // Keep the top card in discard pile
    const topCard = this.discardPile.pop();
    
    // Move rest of discard pile to deck and shuffle
    this.cards.push(...this.discardPile);
    this.discardPile = [topCard];
    this.shuffle();
    
    console.log(`Reshuffled ${this.cards.length} cards from discard pile back to deck`);
    return this;
  }

  /**
   * Get all cards currently in play (deck + discard pile)
   * @returns {Card[]} Array of all cards
   */
  getAllCards() {
    return [...this.cards, ...this.discardPile];
  }

  /**
   * Reset deck to initial state
   * @returns {Deck} This deck for method chaining
   */
  reset() {
    this._initializeDeck();
    this.discardPile = [];
    this.wildJokerCard = null;
    return this;
  }

  /**
   * Get deck statistics
   * @returns {Object} Deck statistics
   */
  getStats() {
    const totalCards = this.cards.length + this.discardPile.length;
    const expectedTotal = this.includePrintedJokers ? 106 : 104;
    
    return {
      cardsInDeck: this.cards.length,
      cardsInDiscardPile: this.discardPile.length,
      totalCards: totalCards,
      expectedTotal: expectedTotal,
      missingCards: expectedTotal - totalCards,
      wildJoker: this.wildJokerCard ? this.wildJokerCard.getDisplayName() : 'None',
      needsReshuffle: this.needsReshuffling()
    };
  }

  /**
   * Convert deck to JSON for game state
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      remainingCards: this.cards.length,
      discardPileCount: this.discardPile.length,
      topDiscardCard: this.peekDiscardPile()?.toJSON() || null,
      wildJoker: this.wildJokerCard?.toJSON() || null,
      stats: this.getStats()
    };
  }

  /**
   * Create a new shuffled deck ready for game
   * @param {boolean} includePrintedJokers - Include printed jokers
   * @returns {Deck} New shuffled deck
   */
  static createGameDeck(includePrintedJokers = true) {
    const deck = new Deck(includePrintedJokers);
    deck.shuffle();
    deck.setupWildJoker();
    return deck;
  }

  /**
   * Create deck for testing with specific cards
   * @param {Card[]} cards - Specific cards to include
   * @returns {Deck} Deck with specified cards
   */
  static createTestDeck(cards) {
    const deck = new Deck(false);
    deck.cards = [...cards];
    return deck;
  }
}

module.exports = Deck; 