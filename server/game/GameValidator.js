const Card = require('./Card');

/**
 * GameValidator class for validating Indian Rummy game rules
 * Handles validation of sequences, sets, and complete declarations
 */
class GameValidator {
  constructor(wildJokerCard = null) {
    this.wildJokerCard = wildJokerCard;
  }

  /**
   * Set the wild joker card for this game
   * @param {Card} wildJokerCard - The designated wild joker card
   */
  setWildJoker(wildJokerCard) {
    this.wildJokerCard = wildJokerCard;
  }

  /**
   * Check if a card can act as a joker
   * @param {Card} card - Card to check
   * @returns {boolean} True if card can act as joker
   */
  isJokerCard(card) {
    return card.canActAsJoker(this.wildJokerCard);
  }

  /**
   * Validate if cards form a pure sequence (no jokers allowed)
   * @param {Card[]} cards - Array of cards to validate
   * @returns {Object} Validation result with isValid flag and details
   */
  validatePureSequence(cards) {
    if (!cards || cards.length < 3) {
      return { isValid: false, reason: 'Pure sequence requires at least 3 cards' };
    }

    // Check if any card is a joker (not allowed in pure sequence)
    if (cards.some(card => this.isJokerCard(card))) {
      return { isValid: false, reason: 'Pure sequence cannot contain jokers' };
    }

    // Check if all cards are of the same suit
    const firstSuit = cards[0].suit;
    if (!cards.every(card => card.suit === firstSuit)) {
      return { isValid: false, reason: 'All cards must be of the same suit' };
    }

    // Sort cards by rank for sequence validation
    const sortedCards = [...cards].sort((a, b) => a.rank - b.rank);

    // Check for consecutive ranks
    if (this._isConsecutiveSequence(sortedCards)) {
      return { 
        isValid: true, 
        type: 'pure_sequence',
        cards: sortedCards,
        points: 0 
      };
    }

    return { isValid: false, reason: 'Cards are not in consecutive order' };
  }

  /**
   * Validate if cards form an impure sequence (jokers allowed)
   * @param {Card[]} cards - Array of cards to validate
   * @returns {Object} Validation result with isValid flag and details
   */
  validateImpureSequence(cards) {
    if (!cards || cards.length < 3) {
      return { isValid: false, reason: 'Impure sequence requires at least 3 cards' };
    }

    const nonJokers = cards.filter(card => !this.isJokerCard(card));
    const jokers = cards.filter(card => this.isJokerCard(card));

    if (nonJokers.length === 0) {
      return { isValid: false, reason: 'Sequence must have at least one non-joker card' };
    }

    // Check if all non-joker cards are of the same suit
    const firstSuit = nonJokers[0].suit;
    if (!nonJokers.every(card => card.suit === firstSuit)) {
      return { isValid: false, reason: 'All non-joker cards must be of the same suit' };
    }

    // Try to form a valid sequence with jokers filling gaps
    if (this._canFormSequenceWithJokers(nonJokers, jokers.length)) {
      return { 
        isValid: true, 
        type: 'impure_sequence',
        cards: cards,
        points: 0 
      };
    }

    return { isValid: false, reason: 'Cannot form valid sequence even with jokers' };
  }

  /**
   * Validate if cards form a set (3-4 cards of same rank, different suits)
   * @param {Card[]} cards - Array of cards to validate
   * @returns {Object} Validation result with isValid flag and details
   */
  validateSet(cards) {
    if (!cards || cards.length < 3 || cards.length > 4) {
      return { isValid: false, reason: 'Set requires 3 or 4 cards' };
    }

    const nonJokers = cards.filter(card => !this.isJokerCard(card));
    const jokers = cards.filter(card => this.isJokerCard(card));

    if (nonJokers.length === 0) {
      return { isValid: false, reason: 'Set must have at least one non-joker card' };
    }

    // Check if all non-joker cards have the same rank
    const firstRank = nonJokers[0].rank;
    if (!nonJokers.every(card => card.rank === firstRank)) {
      return { isValid: false, reason: 'All non-joker cards must have the same rank' };
    }

    // Check if all non-joker cards have different suits
    const suits = new Set(nonJokers.map(card => card.suit));
    if (suits.size !== nonJokers.length) {
      return { isValid: false, reason: 'All non-joker cards must have different suits' };
    }

    // Validate that we can form a valid set with available suits
    const maxPossibleCards = 4; // Maximum 4 suits
    if (cards.length > maxPossibleCards) {
      return { isValid: false, reason: 'Set cannot have more than 4 cards' };
    }

    // Check if we have enough different suits for the jokers
    const remainingSuits = 4 - suits.size;
    if (jokers.length > remainingSuits) {
      return { isValid: false, reason: 'Too many jokers for remaining suits' };
    }

    return { 
      isValid: true, 
      type: 'set',
      cards: cards,
      points: 0 
    };
  }

  /**
   * Validate a complete hand declaration (all 13 cards)
   * @param {Card[]} hand - Player's complete hand (13 cards)
   * @param {Card[][]} groups - Proposed grouping of cards
   * @returns {Object} Validation result with detailed breakdown
   */
  validateDeclaration(hand, groups) {
    if (!hand || hand.length !== 13) {
      return { 
        isValid: false, 
        reason: 'Hand must contain exactly 13 cards' 
      };
    }

    if (!groups || groups.length === 0) {
      return { 
        isValid: false, 
        reason: 'No card groups provided' 
      };
    }

    // Check if all cards are accounted for
    const groupedCards = groups.flat();
    if (groupedCards.length !== 13) {
      return { 
        isValid: false, 
        reason: 'All 13 cards must be grouped' 
      };
    }

    // Validate each group
    const validatedGroups = [];
    let hasPureSequence = false;
    let totalPoints = 0;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      
      // Try to validate as pure sequence first
      let validation = this.validatePureSequence(group);
      if (validation.isValid) {
        hasPureSequence = true;
        validatedGroups.push({ ...validation, groupIndex: i });
        continue;
      }

      // Try to validate as impure sequence
      validation = this.validateImpureSequence(group);
      if (validation.isValid) {
        validatedGroups.push({ ...validation, groupIndex: i });
        continue;
      }

      // Try to validate as set
      validation = this.validateSet(group);
      if (validation.isValid) {
        validatedGroups.push({ ...validation, groupIndex: i });
        continue;
      }

      // If none of the validations work, calculate points for ungrouped cards
      const groupPoints = group.reduce((sum, card) => sum + card.getPointValue(), 0);
      totalPoints += groupPoints;
      validatedGroups.push({
        isValid: false,
        type: 'invalid',
        cards: group,
        points: groupPoints,
        groupIndex: i,
        reason: 'Invalid card combination'
      });
    }

    // Check if at least one pure sequence exists
    if (!hasPureSequence) {
      return { 
        isValid: false, 
        reason: 'At least one pure sequence is required',
        groups: validatedGroups,
        totalPoints: 80 // Full penalty
      };
    }

    // Calculate total points from invalid groups
    const isValidDeclaration = validatedGroups.every(group => group.isValid);

    return {
      isValid: isValidDeclaration,
      groups: validatedGroups,
      totalPoints: isValidDeclaration ? 0 : Math.min(totalPoints, 80),
      hasPureSequence: hasPureSequence,
      reason: isValidDeclaration ? 'Valid declaration' : 'Some card groups are invalid'
    };
  }

  /**
   * Calculate points for ungrouped cards
   * @param {Card[]} cards - Array of ungrouped cards
   * @returns {number} Total points (max 80)
   */
  calculatePoints(cards) {
    const totalPoints = cards.reduce((sum, card) => {
      // Jokers have 0 points
      if (this.isJokerCard(card)) return sum;
      return sum + card.getPointValue();
    }, 0);

    return Math.min(totalPoints, 80); // Maximum 80 points
  }

  /**
   * Auto-arrange cards into optimal groups
   * @param {Card[]} cards - Cards to arrange
   * @returns {Object} Suggested arrangement with validation
   */
  autoArrangeCards(cards) {
    if (!cards || cards.length !== 13) {
      return { success: false, reason: 'Invalid card count' };
    }

    // This is a simplified auto-arrangement
    // In a full implementation, this would use more sophisticated algorithms
    const arrangements = this._findBestArrangement(cards);
    
    if (arrangements.length > 0) {
      const bestArrangement = arrangements[0];
      const validation = this.validateDeclaration(cards, bestArrangement);
      
      return {
        success: true,
        groups: bestArrangement,
        validation: validation
      };
    }

    return { 
      success: false, 
      reason: 'No valid arrangement found',
      suggestedGroups: this._groupCardsBySuitAndRank(cards)
    };
  }

  /**
   * Check if cards form a consecutive sequence
   * @param {Card[]} sortedCards - Cards sorted by rank
   * @returns {boolean} True if consecutive
   * @private
   */
  _isConsecutiveSequence(sortedCards) {
    for (let i = 1; i < sortedCards.length; i++) {
      const current = sortedCards[i];
      const previous = sortedCards[i - 1];

      // Handle Ace as both 1 and 14
      if (previous.rank === 13 && current.rank === 1) {
        continue; // K-A is valid
      }
      
      if (current.rank - previous.rank !== 1) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if non-joker cards can form sequence with jokers filling gaps
   * @param {Card[]} nonJokers - Non-joker cards
   * @param {number} jokerCount - Number of available jokers
   * @returns {boolean} True if sequence can be formed
   * @private
   */
  _canFormSequenceWithJokers(nonJokers, jokerCount) {
    if (nonJokers.length === 0) return false;

    const sortedCards = [...nonJokers].sort((a, b) => a.rank - b.rank);
    const minRank = sortedCards[0].rank;
    const maxRank = sortedCards[sortedCards.length - 1].rank;
    
    // Calculate required sequence length
    const requiredLength = maxRank - minRank + 1;
    const gapsToFill = requiredLength - sortedCards.length;
    
    return gapsToFill <= jokerCount;
  }

  /**
   * Find the best possible arrangement of cards
   * @param {Card[]} cards - Cards to arrange
   * @returns {Array} Array of possible arrangements
   * @private
   */
  _findBestArrangement(cards) {
    // Simplified implementation - returns basic grouping
    // A full implementation would try multiple combinations
    return [this._groupCardsBySuitAndRank(cards)];
  }

  /**
   * Group cards by suit and rank for basic arrangement
   * @param {Card[]} cards - Cards to group
   * @returns {Array} Grouped cards
   * @private
   */
  _groupCardsBySuitAndRank(cards) {
    const groups = [];
    const remaining = [...cards];

    // Group by suit for potential sequences
    const suitGroups = {};
    remaining.forEach(card => {
      if (!this.isJokerCard(card)) {
        if (!suitGroups[card.suit]) {
          suitGroups[card.suit] = [];
        }
        suitGroups[card.suit].push(card);
      }
    });

    // Sort each suit group by rank
    Object.values(suitGroups).forEach(group => {
      group.sort((a, b) => a.rank - b.rank);
      if (group.length >= 3) {
        groups.push(group);
      }
    });

    return groups;
  }
}

module.exports = GameValidator; 