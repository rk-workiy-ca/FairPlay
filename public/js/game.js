/**
 * FairPlay Rummy POC - Game Utilities
 * Helper functions for game logic and client-side validation
 */

class GameUtils {
    /**
     * Card suit constants
     */
    static SUITS = {
        HEARTS: 'hearts',
        DIAMONDS: 'diamonds',
        CLUBS: 'clubs',
        SPADES: 'spades'
    };

    static JOKER_TYPES = {
        PRINTED: 'printed_joker',
        WILD: 'wild_joker'
    };

    /**
     * Sort cards by suit and rank
     */
    static sortCards(cards) {
        return cards.sort((a, b) => {
            // Jokers go to the end
            if (a.isJoker && !b.isJoker) return 1;
            if (!a.isJoker && b.isJoker) return -1;
            if (a.isJoker && b.isJoker) return 0;

            // Sort by suit first
            const suitOrder = ['spades', 'hearts', 'diamonds', 'clubs'];
            const aSuitIndex = suitOrder.indexOf(a.suit);
            const bSuitIndex = suitOrder.indexOf(b.suit);

            if (aSuitIndex !== bSuitIndex) {
                return aSuitIndex - bSuitIndex;
            }

            // Then by rank
            return a.rank - b.rank;
        });
    }

    /**
     * Group cards by suit
     */
    static groupCardsBySuit(cards) {
        const groups = {
            hearts: [],
            diamonds: [],
            clubs: [],
            spades: [],
            jokers: []
        };

        cards.forEach(card => {
            if (card.isJoker) {
                groups.jokers.push(card);
            } else {
                groups[card.suit].push(card);
            }
        });

        // Sort each group by rank
        Object.keys(groups).forEach(suit => {
            if (suit !== 'jokers') {
                groups[suit].sort((a, b) => a.rank - b.rank);
            }
        });

        return groups;
    }

    /**
     * Group cards by rank
     */
    static groupCardsByRank(cards) {
        const groups = {};

        cards.forEach(card => {
            if (!card.isJoker) {
                if (!groups[card.rank]) {
                    groups[card.rank] = [];
                }
                groups[card.rank].push(card);
            }
        });

        return groups;
    }

    /**
     * Check if cards can form a sequence (basic validation)
     */
    static canFormSequence(cards) {
        if (cards.length < 3) return false;

        const nonJokers = cards.filter(card => !card.isJoker);
        if (nonJokers.length === 0) return false;

        // Check if all non-jokers are same suit
        const firstSuit = nonJokers[0].suit;
        if (!nonJokers.every(card => card.suit === firstSuit)) {
            return false;
        }

        // Sort by rank
        const sortedNonJokers = nonJokers.sort((a, b) => a.rank - b.rank);
        
        // Check if we can fill gaps with jokers
        const jokerCount = cards.length - nonJokers.length;
        let gapsNeeded = 0;

        for (let i = 1; i < sortedNonJokers.length; i++) {
            const gap = sortedNonJokers[i].rank - sortedNonJokers[i - 1].rank - 1;
            gapsNeeded += gap;
        }

        return gapsNeeded <= jokerCount;
    }

    /**
     * Check if cards can form a set (basic validation)
     */
    static canFormSet(cards) {
        if (cards.length < 3 || cards.length > 4) return false;

        const nonJokers = cards.filter(card => !card.isJoker);
        if (nonJokers.length === 0) return false;

        // Check if all non-jokers have same rank
        const firstRank = nonJokers[0].rank;
        if (!nonJokers.every(card => card.rank === firstRank)) {
            return false;
        }

        // Check if all non-jokers have different suits
        const suits = new Set(nonJokers.map(card => card.suit));
        if (suits.size !== nonJokers.length) {
            return false;
        }

        // Check if we can complete the set with jokers
        const jokerCount = cards.length - nonJokers.length;
        const remainingSuits = 4 - suits.size;

        return jokerCount <= remainingSuits;
    }

    /**
     * Suggest card arrangements (basic algorithm)
     */
    static suggestArrangements(cards) {
        const suggestions = [];
        const suitGroups = this.groupCardsBySuit(cards);
        
        // Try to find sequences in each suit
        Object.keys(suitGroups).forEach(suit => {
            if (suit === 'jokers') return;
            
            const suitCards = suitGroups[suit];
            if (suitCards.length >= 3) {
                // Check for potential sequences
                const sequences = this.findPotentialSequences(suitCards);
                suggestions.push(...sequences);
            }
        });

        // Try to find sets
        const rankGroups = this.groupCardsByRank(cards);
        Object.keys(rankGroups).forEach(rank => {
            const rankCards = rankGroups[rank];
            if (rankCards.length >= 3) {
                suggestions.push({
                    type: 'set',
                    cards: rankCards,
                    confidence: rankCards.length >= 3 ? 0.8 : 0.6
                });
            }
        });

        return suggestions.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Find potential sequences in suit cards
     */
    static findPotentialSequences(suitCards) {
        const sequences = [];
        const sorted = suitCards.sort((a, b) => a.rank - b.rank);

        for (let start = 0; start < sorted.length - 2; start++) {
            for (let end = start + 2; end < sorted.length; end++) {
                const subCards = sorted.slice(start, end + 1);
                if (this.canFormSequence(subCards)) {
                    sequences.push({
                        type: 'sequence',
                        cards: subCards,
                        confidence: this.calculateSequenceConfidence(subCards)
                    });
                }
            }
        }

        return sequences;
    }

    /**
     * Calculate confidence score for a sequence
     */
    static calculateSequenceConfidence(cards) {
        const nonJokers = cards.filter(card => !card.isJoker);
        const consecutive = this.areConsecutive(nonJokers);
        
        if (consecutive && nonJokers.length === cards.length) {
            return 1.0; // Pure sequence
        } else if (consecutive) {
            return 0.8; // Sequence with jokers
        } else {
            return 0.4; // Might be possible with jokers
        }
    }

    /**
     * Check if cards are consecutive
     */
    static areConsecutive(cards) {
        if (cards.length < 2) return true;

        const sorted = cards.sort((a, b) => a.rank - b.rank);
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].rank - sorted[i - 1].rank !== 1) {
                return false;
            }
        }
        return true;
    }

    /**
     * Calculate hand score (points from ungrouped cards)
     */
    static calculateHandScore(cards) {
        return cards.reduce((total, card) => {
            if (card.isJoker) return total; // Jokers have 0 points
            
            switch (card.rank) {
                case 1: return total + 1; // Ace
                case 11:
                case 12:
                case 13: return total + 10; // Face cards
                default: return total + card.rank;
            }
        }, 0);
    }

    /**
     * Get card display symbol
     */
    static getCardSymbol(suit) {
        const symbols = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        return symbols[suit] || '';
    }

    /**
     * Get rank display name
     */
    static getRankDisplayName(rank) {
        const names = {
            1: 'A',
            11: 'J',
            12: 'Q',
            13: 'K'
        };
        return names[rank] || rank.toString();
    }

    /**
     * Format card display name
     */
    static formatCardDisplay(card) {
        if (card.isJoker) {
            return card.jokerType === 'printed_joker' ? '🃏' : '🃏*';
        }

        const rank = this.getRankDisplayName(card.rank);
        const symbol = this.getCardSymbol(card.suit);
        return `${rank}${symbol}`;
    }

    /**
     * Validate if a declaration is potentially valid (client-side check)
     */
    static validateDeclaration(groups) {
        let hasPureSequence = false;
        let totalCards = 0;
        const results = [];

        groups.forEach((group, index) => {
            totalCards += group.length;
            
            if (group.length < 3) {
                results.push({
                    groupIndex: index,
                    isValid: false,
                    reason: 'Group must have at least 3 cards'
                });
                return;
            }

            // Check if it's a pure sequence
            const isPureSequence = this.isPureSequence(group);
            if (isPureSequence) {
                hasPureSequence = true;
                results.push({
                    groupIndex: index,
                    isValid: true,
                    type: 'pure_sequence'
                });
                return;
            }

            // Check if it's an impure sequence
            if (this.canFormSequence(group)) {
                results.push({
                    groupIndex: index,
                    isValid: true,
                    type: 'impure_sequence'
                });
                return;
            }

            // Check if it's a set
            if (this.canFormSet(group)) {
                results.push({
                    groupIndex: index,
                    isValid: true,
                    type: 'set'
                });
                return;
            }

            results.push({
                groupIndex: index,
                isValid: false,
                reason: 'Not a valid sequence or set'
            });
        });

        return {
            isValid: hasPureSequence && totalCards === 13 && results.every(r => r.isValid),
            hasPureSequence: hasPureSequence,
            totalCards: totalCards,
            groupResults: results
        };
    }

    /**
     * Check if group is a pure sequence (no jokers)
     */
    static isPureSequence(cards) {
        if (cards.length < 3) return false;
        
        // No jokers allowed
        if (cards.some(card => card.isJoker)) return false;
        
        // All same suit
        const firstSuit = cards[0].suit;
        if (!cards.every(card => card.suit === firstSuit)) return false;
        
        // Consecutive ranks
        const sorted = cards.sort((a, b) => a.rank - b.rank);
        return this.areConsecutive(sorted);
    }

    /**
     * Get game statistics
     */
    static getGameStats(gameState) {
        if (!gameState) return null;

        return {
            gameId: gameState.gameId,
            playersCount: gameState.players.length,
            currentTurn: gameState.currentTurn,
            gameState: gameState.gameState,
            deckCount: gameState.deck?.remainingCards || 0,
            discardCount: gameState.deck?.discardPileCount || 0,
            wildJoker: gameState.wildJoker?.displayName || 'None'
        };
    }

    /**
     * Generate random player name (for testing)
     */
    static generateRandomPlayerName() {
        const adjectives = ['Swift', 'Clever', 'Lucky', 'Bold', 'Wise', 'Sharp', 'Quick', 'Smart'];
        const nouns = ['Player', 'Gamer', 'Master', 'Pro', 'Ace', 'Champion', 'Star', 'Hero'];
        
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const number = Math.floor(Math.random() * 999) + 1;
        
        return `${adj}${noun}${number}`;
    }

    /**
     * Check if browser supports required features
     */
    static checkBrowserSupport() {
        const support = {
            websockets: typeof WebSocket !== 'undefined',
            localStorage: typeof Storage !== 'undefined',
            dragAndDrop: 'draggable' in document.createElement('div'),
            css3: typeof document.body.style.transform !== 'undefined'
        };

        const unsupported = Object.keys(support).filter(feature => !support[feature]);
        
        return {
            isSupported: unsupported.length === 0,
            unsupportedFeatures: unsupported,
            support: support
        };
    }

    /**
     * Log game event for debugging
     */
    static logGameEvent(event, data) {
        if (typeof console !== 'undefined' && console.log) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] Game Event: ${event}`, data);
        }
    }
}

// Local storage utilities
class LocalStorage {
    static savePlayerName(name) {
        try {
            localStorage.setItem('fairplay_player_name', name);
        } catch (e) {
            console.warn('Could not save player name to localStorage:', e);
        }
    }

    static getPlayerName() {
        try {
            return localStorage.getItem('fairplay_player_name') || '';
        } catch (e) {
            console.warn('Could not get player name from localStorage:', e);
            return '';
        }
    }

    static saveGameSettings(settings) {
        try {
            localStorage.setItem('fairplay_game_settings', JSON.stringify(settings));
        } catch (e) {
            console.warn('Could not save game settings:', e);
        }
    }

    static getGameSettings() {
        try {
            const settings = localStorage.getItem('fairplay_game_settings');
            return settings ? JSON.parse(settings) : { maxPlayers: 4 };
        } catch (e) {
            console.warn('Could not get game settings:', e);
            return { maxPlayers: 4 };
        }
    }
}

// Performance monitoring
class PerformanceMonitor {
    static marks = {};

    static startMark(name) {
        this.marks[name] = performance.now();
    }

    static endMark(name) {
        if (this.marks[name]) {
            const duration = performance.now() - this.marks[name];
            console.log(`Performance: ${name} took ${duration.toFixed(2)}ms`);
            delete this.marks[name];
            return duration;
        }
        return 0;
    }

    static measureFrameRate() {
        let frameCount = 0;
        const startTime = performance.now();

        function countFrame() {
            frameCount++;
            const elapsed = performance.now() - startTime;
            
            if (elapsed < 1000) {
                requestAnimationFrame(countFrame);
            } else {
                const fps = Math.round((frameCount * 1000) / elapsed);
                console.log(`Frame rate: ${fps} FPS`);
            }
        }

        requestAnimationFrame(countFrame);
    }
}

// Export classes for global use
window.GameUtils = GameUtils;
window.LocalStorage = LocalStorage;
window.PerformanceMonitor = PerformanceMonitor; 