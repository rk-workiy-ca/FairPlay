# FairPlay Rummy - Proof of Concept

A digital Indian Rummy card game platform with real-time multiplayer functionality.

## 🎯 POC Objectives

- Validate core Indian Rummy game mechanics
- Implement 2-deck (104 cards + 2 jokers) card system
- Create turn-based gameplay with draw/discard mechanics
- Build card validation system for sequences and sets
- Develop basic user interface for card interactions
- Support 2-4 players local/network multiplayer

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ installed
- npm or yarn package manager

### Installation

1. **Clone and setup:**
```bash
git clone <repository-url>
cd FairPlay
npm install
```

2. **Start the development server:**
```bash
npm run dev
```

3. **Start the client (in another terminal):**
```bash
npm run client
```

4. **Open your browser:**
```
http://localhost:8080
```

## 📁 Project Structure

```
FairPlay/
├── server/                 # Backend server code
│   ├── app.js             # Main server file
│   ├── game/              # Game engine
│   │   ├── Card.js        # Card class
│   │   ├── Deck.js        # Deck management
│   │   ├── GameEngine.js  # Core game logic
│   │   └── GameValidator.js # Validation rules
│   ├── models/            # Data models
│   └── routes/            # API routes
├── public/                # Frontend client code
│   ├── index.html         # Main HTML file
│   ├── css/              # Stylesheets
│   ├── js/               # Client-side JavaScript
│   └── assets/           # Images, sounds, etc.
├── tests/                # Test files
└── docs/                 # Documentation
```

## 🎮 Game Features (POC)

### Core Game Engine
- ✅ Standard Indian Rummy rules (2 decks, 13 cards per player)
- ✅ Proper card shuffling and dealing
- ✅ Turn-based gameplay (draw/discard)
- ✅ Joker handling (printed + wild card jokers)
- ✅ Sequence and set validation
- ✅ Declaration validation

### User Interface
- ✅ Interactive card display
- ✅ Drag and drop card interactions
- ✅ Real-time game state updates
- ✅ Turn indicators and timers
- ✅ Basic chat functionality

### Multiplayer Support
- ✅ Real-time communication (Socket.io)
- ✅ 2-4 player tables
- ✅ Game state synchronization
- ✅ Player matchmaking (basic)

## 🧪 Testing

```bash
npm test
```

## 📋 Development Status

- [x] Project setup and structure
- [ ] Core card engine implementation
- [ ] Game logic and rules
- [ ] Basic UI components
- [ ] Real-time multiplayer
- [ ] Game validation system
- [ ] Testing and polish

## 🎯 Next Steps (MVP)

After POC completion:
- Real money integration
- AI bot system
- User authentication
- Advanced UI/UX
- Mobile applications
- Performance optimization

## 📚 Game Rules

Indian Rummy rules implemented:
- 2 decks (104 cards) + 2 printed jokers
- 13 cards per player
- Minimum 1 pure sequence required
- Sequences: 3+ consecutive cards of same suit
- Sets: 3-4 cards of same rank, different suits
- Jokers can substitute any card (except in pure sequences)
- Drop penalties: First drop (20 points), Middle drop (40 points)
- Maximum points: 80 per hand

## 🤝 Contributing

This is a POC project. For contributions, please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.