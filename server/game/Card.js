/**
 * Card class representing a single playing card in Indian Rummy
 * Supports standard cards (2-A in 4 suits) and jokers
 */
class Card {
  // Define constants for suits and ranks
  static SUITS = {
    HEARTS: 'hearts',
    DIAMONDS: 'diamonds',
    CLUBS: 'clubs',
    SPADES: 'spades'
  };

  static RANKS = {
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
    SIX: 6,
    SEVEN: 7,
    EIGHT: 8,
    NINE: 9,
    TEN: 10,
    JACK: 11,
    QUEEN: 12,
    KING: 13,
    ACE: 1
  };

  static JOKER_TYPES = {
    PRINTED: 'printed_joker',
    WILD: 'wild_joker'
  };

  /**
   * Create a new Card
   * @param {string} suit - Card suit (hearts, diamonds, clubs, spades, or joker)
   * @param {number|string} rank - Card rank (1-13 for normal cards, 'joker' for jokers)
   * @param {string} jokerType - Type of joker if applicable
   */
  constructor(suit, rank, jokerType = null) {
    this.suit = suit;
    this.rank = rank;
    this.jokerType = jokerType;
    this.isJoker = jokerType !== null;
    this.id = this._generateId();
  }

  /**
   * Generate unique ID for the card
   * @returns {string} Unique card ID
   */
  _generateId() {
    if (this.isJoker) {
      return `${this.jokerType}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return `${this.suit}_${this.rank}`;
  }

  /**
   * Get card value for points calculation
   * @returns {number} Point value of the card
   */
  getPointValue() {
    if (this.isJoker) return 0;
    
    switch (this.rank) {
      case Card.RANKS.ACE:
        return 1;
      case Card.RANKS.JACK:
      case Card.RANKS.QUEEN:
      case Card.RANKS.KING:
        return 10;
      default:
        return this.rank;
    }
  }

  /**
   * Get display name of the card
   * @returns {string} Human-readable card name
   */
  getDisplayName() {
    if (this.isJoker) {
      return this.jokerType === Card.JOKER_TYPES.PRINTED ? 'Printed Joker' : 'Wild Joker';
    }

    const rankNames = {
      1: 'A',
      11: 'J',
      12: 'Q',
      13: 'K'
    };

    const suitSymbols = {
      'hearts': '♥',
      'diamonds': '♦',
      'clubs': '♣',
      'spades': '♠'
    };

    const displayRank = rankNames[this.rank] || this.rank.toString();
    const displaySuit = suitSymbols[this.suit] || this.suit;

    return `${displayRank}${displaySuit}`;
  }

  /**
   * Check if card can be used as joker
   * @param {Card} wildJokerCard - The designated wild joker card for this game
   * @returns {boolean} True if card can act as joker
   */
  canActAsJoker(wildJokerCard) {
    if (this.isJoker) return true;
    
    if (wildJokerCard && !wildJokerCard.isJoker) {
      return this.suit === wildJokerCard.suit && this.rank === wildJokerCard.rank;
    }
    
    return false;
  }

  /**
   * Check if this card is consecutive to another card
   * @param {Card} other - Other card to compare
   * @returns {boolean} True if cards are consecutive
   */
  isConsecutive(other) {
    if (this.isJoker || other.isJoker) return false;
    if (this.suit !== other.suit) return false;

    const rank1 = this.rank;
    const rank2 = other.rank;

    // Handle Ace as both 1 and 14
    if (rank1 === 1 && rank2 === 2) return true;
    if (rank1 === 2 && rank2 === 1) return true;
    if (rank1 === 13 && rank2 === 1) return true; // K-A sequence
    if (rank1 === 1 && rank2 === 13) return true; // A-K sequence

    return Math.abs(rank1 - rank2) === 1;
  }

  /**
   * Check if this card has the same rank as another card
   * @param {Card} other - Other card to compare
   * @returns {boolean} True if same rank
   */
  isSameRank(other) {
    if (this.isJoker || other.isJoker) return false;
    return this.rank === other.rank;
  }

  /**
   * Check if this card has the same suit as another card
   * @param {Card} other - Other card to compare
   * @returns {boolean} True if same suit
   */
  isSameSuit(other) {
    if (this.isJoker || other.isJoker) return false;
    return this.suit === other.suit;
  }

  /**
   * Compare cards for sorting
   * @param {Card} other - Other card to compare
   * @returns {number} Comparison result (-1, 0, 1)
   */
  compare(other) {
    // Jokers go to the end
    if (this.isJoker && !other.isJoker) return 1;
    if (!this.isJoker && other.isJoker) return -1;
    if (this.isJoker && other.isJoker) return 0;

    // Compare by suit first
    const suitOrder = ['spades', 'hearts', 'diamonds', 'clubs'];
    const thisSuitIndex = suitOrder.indexOf(this.suit);
    const otherSuitIndex = suitOrder.indexOf(other.suit);

    if (thisSuitIndex !== otherSuitIndex) {
      return thisSuitIndex - otherSuitIndex;
    }

    // Then by rank
    return this.rank - other.rank;
  }

  /**
   * Create a copy of this card
   * @returns {Card} New card instance with same properties
   */
  clone() {
    return new Card(this.suit, this.rank, this.jokerType);
  }

  /**
   * Convert card to JSON for network transmission
   * @returns {Object} JSON representation of the card
   */
  toJSON() {
    return {
      id: this.id,
      suit: this.suit,
      rank: this.rank,
      isJoker: this.isJoker,
      jokerType: this.jokerType,
      pointValue: this.getPointValue(),
      displayName: this.getDisplayName()
    };
  }

  /**
   * Create card from JSON data
   * @param {Object} data - JSON data
   * @returns {Card} New Card instance
   */
  static fromJSON(data) {
    return new Card(data.suit, data.rank, data.jokerType);
  }

  /**
   * Create a printed joker card
   * @returns {Card} New printed joker card
   */
  static createPrintedJoker() {
    return new Card('joker', 'joker', Card.JOKER_TYPES.PRINTED);
  }

  /**
   * Create a wild joker card based on a regular card
   * @param {Card} baseCard - The base card that becomes wild joker
   * @returns {Card} New wild joker card
   */
  static createWildJoker(baseCard) {
    return new Card(baseCard.suit, baseCard.rank, Card.JOKER_TYPES.WILD);
  }
}

module.exports = Card; 