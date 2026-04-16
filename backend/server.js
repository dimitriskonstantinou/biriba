const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- DECK & VALIDATION HELPERS ---
function createDeck() { /* ... same as before ... */ 
    const suits = ['Clubs', 'Spades', 'Hearts', 'Diamonds'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    for (let i = 0; i < 2; i++) {
        for (let suit of suits) for (let value of values) deck.push({ suit, value });
    }
    deck.push({ suit: 'Joker', value: 'Black' }); deck.push({ suit: 'Joker', value: 'Red' });
    return deck;
}
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}
function getCardValue(card, useHighAce = false) {
    if (card.value === 'A') return useHighAce ? 14 : 1;
    if (card.value === 'J') return 11;
    if (card.value === 'Q') return 12;
    if (card.value === 'K') return 13;
    return parseInt(card.value);
}
function checkGaps(naturalsArr, numWildcards) {
    if (numWildcards > 1) return false; 
    if (naturalsArr.length <= 1) return true;
    let hasRoyals = naturalsArr.some(c => ['J','Q','K'].includes(c.value));
    let sorted = [...naturalsArr].sort((a,b) => getCardValue(a, hasRoyals) - getCardValue(b, hasRoyals));
    let gaps = 0;
    for(let i = 0; i < sorted.length - 1; i++) {
        let diff = getCardValue(sorted[i+1], hasRoyals) - getCardValue(sorted[i], hasRoyals);
        if (diff <= 0) return false; 
        gaps += (diff - 1);
    }
    return gaps <= numWildcards;
}
function isValidSequence(cards) {
    if (cards.length <= 1) return true;
    const anchor = cards.find(c => c.suit !== 'Joker' && c.value !== '2');
    const targetSuit = anchor ? anchor.suit : cards.find(c => c.suit !== 'Joker')?.suit;
    if (!targetSuit) return true; 
    let jokers = [], twos = [], naturals = [];
    for (let card of cards) {
        if (card.suit === 'Joker') jokers.push(card);
        else if (card.value === '2') twos.push(card);
        else {
            if (card.suit !== targetSuit) return false; 
            naturals.push(card);
        }
    }
    let natural2 = null, wildcard2s = [];
    for (let t of twos) {
        if (t.suit === targetSuit && !natural2) natural2 = t; 
        else wildcard2s.push(t);
    }
    let isValidA = false;
    if (natural2) isValidA = checkGaps([...naturals, natural2], jokers.length + wildcard2s.length);
    let isValidB = checkGaps(naturals, jokers.length + twos.length);
    return isValidA || isValidB;
}
function sortMeldVisually(cards) {
    if (cards.length <= 1) return cards;
    const anchor = cards.find(c => c.suit !== 'Joker' && c.value !== '2');
    const targetSuit = anchor ? anchor.suit : cards.find(c => c.suit !== 'Joker')?.suit;
    let wildcards = [], twos = [], naturals = [];
    for (let card of cards) {
        if (card.suit === 'Joker') wildcards.push(card);
        else if (card.value === '2') twos.push(card);
        else naturals.push(card);
    }
    let natural2 = null;
    for (let t of twos) {
        if (t.suit === targetSuit && !natural2) natural2 = t; 
        else wildcards.push(t);
    }
    let hasRoyals = naturals.some(c => ['J','Q','K'].includes(c.value));
    if (natural2) {
        let tempNaturals = [...naturals, natural2].sort((a,b) => getCardValue(a, hasRoyals) - getCardValue(b, hasRoyals));
        let gaps = 0;
        for(let i=0; i<tempNaturals.length-1; i++) {
            gaps += (getCardValue(tempNaturals[i+1], hasRoyals) - getCardValue(tempNaturals[i], hasRoyals) - 1);
        }
        if (gaps > wildcards.length) wildcards.push(natural2); 
        else naturals.push(natural2); 
    }
    if (naturals.length === 0) return cards;
    naturals.sort((a,b) => getCardValue(a, hasRoyals) - getCardValue(b, hasRoyals));
    let result = [];
    let startVal = getCardValue(naturals[0], hasRoyals);
    let endVal = getCardValue(naturals[naturals.length-1], hasRoyals);
    let currentNatIdx = 0;
    for (let i = startVal; i <= endVal; i++) {
        if (currentNatIdx < naturals.length && getCardValue(naturals[currentNatIdx], hasRoyals) === i) {
            result.push(naturals[currentNatIdx]);
            currentNatIdx++;
        } else {
            if (wildcards.length > 0) result.push(wildcards.shift());
        }
    }
    while (wildcards.length > 0) result.push(wildcards.shift());
    return result;
}
function canFormNewMeld(targetCard, hand) {
    for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
            if (isValidSequence([targetCard, hand[i], hand[j]])) return true;
        }
    }
    return false;
}
function canPlayAnyDiscardCard(pile, hand, melds) {
    for (let card of pile) {
        for (let meld of melds) { if (isValidSequence([...meld, card])) return true; }
        if (canFormNewMeld(card, hand)) return true;
    }
    return false;
}

// --- NEW: 4-PLAYER MULTIPLAYER STATE ---
let gameState = {
    gameStarted: false,
    deck: [], discardPile: [], birimbakia: { 1: [], 2: [] },
    
    // The 4 Seats (0 and 2 are Team 1 | 1 and 3 are Team 2)
    players: [
        { id: null, ready: false, team: 'team1', hand: [] }, // Seat 0 (Player 1)
        { id: null, ready: false, team: 'team2', hand: [] }, // Seat 1 (Player 2)
        { id: null, ready: false, team: 'team1', hand: [] }, // Seat 2 (Player 3)
        { id: null, ready: false, team: 'team2', hand: [] }  // Seat 3 (Player 4)
    ],
    
    melds: { team1: [], team2: [] }, 
    dealerIndex: 0,
    activePlayerIndex: 0,
    turnPhase: 'DRAW', 
    turnHistory: [],
    turnSnapshot: null 
};

function broadcastState() {
    io.emit('game_state_update', {
        gameStarted: gameState.gameStarted,
        players: gameState.players.map(p => ({ id: p.id, ready: p.ready, cardCount: p.hand.length })),
        activePlayerIndex: gameState.activePlayerIndex,
        dealerIndex: gameState.dealerIndex,
        turnPhase: gameState.turnPhase,
        deckCount: gameState.deck.length,
        discardPile: gameState.discardPile,
        melds: gameState.melds
    });
}

// --- NEW: LOBBY & GAME START LOGIC ---
function checkAndStartGame() {
    const allReady = gameState.players.every(p => p.id !== null && p.ready === true);
    if (allReady && !gameState.gameStarted) {
        gameState.gameStarted = true;
        
        // Setup Deck & Deals
        gameState.deck = shuffleDeck(createDeck());
        gameState.birimbakia[1] = gameState.deck.splice(0, 11);
        gameState.birimbakia[2] = gameState.deck.splice(0, 11);
        
        for(let i=0; i<4; i++) {
            gameState.players[i].hand = gameState.deck.splice(0, 11);
        }
        
        gameState.discardPile = [gameState.deck.pop()]; 
        
        // Random Dealer & First Player
        gameState.dealerIndex = Math.floor(Math.random() * 4);
        gameState.activePlayerIndex = (gameState.dealerIndex + 1) % 4; // Clockwise from dealer
        gameState.turnPhase = 'DRAW';

        // Send private hands to each player
        for(let i=0; i<4; i++) {
            io.to(gameState.players[i].id).emit('receive_cards', gameState.players[i].hand);
        }
        
        broadcastState();
    }
}

// SECURITY: Verify it's the sender's turn
function isMyTurn(socketId) {
    if (!gameState.gameStarted) return false;
    const mySeatIndex = gameState.players.findIndex(p => p.id === socketId);
    return mySeatIndex === gameState.activePlayerIndex;
}

function getMyTeam(socketId) {
    const mySeat = gameState.players.find(p => p.id === socketId);
    return mySeat ? mySeat.team : null;
}

function removeCardFromHand(socketId, cardToRemove) {
    let player = gameState.players.find(p => p.id === socketId);
    const index = player.hand.findIndex(c => c.suit === cardToRemove.suit && c.value === cardToRemove.value);
    if (index !== -1) player.hand.splice(index, 1);
}

io.on('connection', (socket) => {
    // Assign to first empty seat
    const emptySeat = gameState.players.findIndex(p => p.id === null);
    if (emptySeat !== -1) {
        gameState.players[emptySeat].id = socket.id;
        console.log(`🟢 Player joined seat ${emptySeat} - ID: ${socket.id}`);
        socket.emit('seat_assignment', emptySeat);
    } else {
        console.log(`👁️ Player spectating - ID: ${socket.id}`);
    }

    broadcastState();

    // PLAYER CLICKS READY
    socket.on('player_ready', () => {
        const mySeat = gameState.players.findIndex(p => p.id === socket.id);
        if (mySeat !== -1) {
            gameState.players[mySeat].ready = true;
            broadcastState();
            checkAndStartGame();
        }
    });

    // --- GAME ACTIONS (NOW PROTECTED BY isMyTurn) ---
    socket.on('draw_from_deck', () => {
        if (!isMyTurn(socket.id) || gameState.turnPhase !== 'DRAW') return;
        
        const player = gameState.players.find(p => p.id === socket.id);
        player.hand.push(gameState.deck.pop());
        gameState.turnPhase = 'PLAY'; 
        
        socket.emit('receive_cards', player.hand);
        broadcastState();
    });

    socket.on('draw_from_discard', () => {
        if (!isMyTurn(socket.id) || gameState.turnPhase !== 'DRAW' || gameState.discardPile.length === 0) return;

        const player = gameState.players.find(p => p.id === socket.id);
        const myTeam = getMyTeam(socket.id);

        if (!canPlayAnyDiscardCard(gameState.discardPile, player.hand, gameState.melds[myTeam])) {
            return socket.emit('error_message', "You cannot use any card from the pile. Pick from the deck!");
        }

        gameState.turnSnapshot = {
            hand: JSON.parse(JSON.stringify(player.hand)),
            melds: JSON.parse(JSON.stringify(gameState.melds[myTeam])),
            discardPile: JSON.parse(JSON.stringify(gameState.discardPile))
        };

        const grabbedCards = gameState.discardPile.map(c => ({...c, fromPile: true})); 
        gameState.discardPile = []; 
        player.hand.push(...grabbedCards);
        gameState.turnPhase = 'PLAY'; 
        
        socket.emit('receive_cards', player.hand);
        socket.emit('snapshot_status', true); 
        broadcastState();
    });

    socket.on('start_new_meld', (card) => {
        if (!isMyTurn(socket.id) || gameState.turnPhase !== 'PLAY') return;
        const myTeam = getMyTeam(socket.id);
        
        removeCardFromHand(socket.id, card);
        gameState.melds[myTeam].push([card]); 
        gameState.turnHistory.push({ action: 'start_new_meld', card: card, meldIndex: gameState.melds[myTeam].length - 1 });
        
        socket.emit('receive_cards', gameState.players.find(p=>p.id === socket.id).hand);
        socket.emit('history_update', gameState.turnHistory);
        broadcastState();
    });

    socket.on('add_to_meld', ({ card, meldIndex }) => {
        if (!isMyTurn(socket.id) || gameState.turnPhase !== 'PLAY') return;
        const myTeam = getMyTeam(socket.id);
        
        let targetMeld = [...gameState.melds[myTeam][meldIndex]];
        targetMeld.push(card); 
        
        if (isValidSequence(targetMeld)) {
            removeCardFromHand(socket.id, card);
            gameState.melds[myTeam][meldIndex] = sortMeldVisually(targetMeld); 
            gameState.turnHistory.push({ action: 'add_to_meld', card: card, meldIndex: meldIndex });
            
            socket.emit('receive_cards', gameState.players.find(p=>p.id === socket.id).hand);
            socket.emit('history_update', gameState.turnHistory); 
            broadcastState();
        }
    });

    socket.on('undo_last_move', () => {
        if (!isMyTurn(socket.id) || gameState.turnHistory.length === 0) return;
        const myTeam = getMyTeam(socket.id);
        const lastMove = gameState.turnHistory.pop();
        const player = gameState.players.find(p => p.id === socket.id);

        if (lastMove.action === 'add_to_meld') {
            let meld = gameState.melds[myTeam][lastMove.meldIndex];
            const cardIndex = meld.findIndex(c => c.suit === lastMove.card.suit && c.value === lastMove.card.value);
            if (cardIndex !== -1) meld.splice(cardIndex, 1);
            gameState.melds[myTeam][lastMove.meldIndex] = sortMeldVisually(meld); 
            player.hand.push(lastMove.card); 
        } else if (lastMove.action === 'start_new_meld') {
            gameState.melds[myTeam].splice(lastMove.meldIndex, 1);
            player.hand.push(lastMove.card); 
        }
        socket.emit('receive_cards', player.hand);
        socket.emit('history_update', gameState.turnHistory);
        broadcastState();
    });

    socket.on('reset_turn', () => {
        if (!isMyTurn(socket.id) || !gameState.turnSnapshot) return;
        const myTeam = getMyTeam(socket.id);
        const player = gameState.players.find(p => p.id === socket.id);

        player.hand = gameState.turnSnapshot.hand;
        gameState.melds[myTeam] = gameState.turnSnapshot.melds;
        gameState.discardPile = gameState.turnSnapshot.discardPile;
        
        gameState.turnPhase = 'DRAW';
        gameState.turnHistory = [];
        gameState.turnSnapshot = null;

        socket.emit('receive_cards', player.hand);
        socket.emit('snapshot_status', false); 
        socket.emit('history_update', gameState.turnHistory);
        broadcastState();
    });

    socket.on('discard_card', (card) => {
        if (!isMyTurn(socket.id) || gameState.turnPhase !== 'PLAY') return;
        const myTeam = getMyTeam(socket.id);
        const player = gameState.players.find(p => p.id === socket.id);

        // --- NEW: 3-CARD MINIMUM CHECK ---
        const invalidMelds = gameState.melds[myTeam].filter(meld => meld.length < 3);
        if (invalidMelds.length > 0) {
            return socket.emit('error_message', "All melds on the table must have at least 3 cards! Add more cards or Undo.");
        }

        // --- EXISTING ENFORCER CHECK (Pile requirement) ---
        if (gameState.turnSnapshot) {
            let playedFromPile = false;
            for (let meld of gameState.melds[myTeam]) {
                if (meld.some(c => c.fromPile)) { playedFromPile = true; break; }
            }
            if (!playedFromPile) {
                return socket.emit('error_message', "You MUST play at least one discarded card into your melds!");
            }
        }

        removeCardFromHand(socket.id, card);
        card.fromPile = false;
        player.hand.forEach(c => c.fromPile = false);
        gameState.melds[myTeam].forEach(meld => meld.forEach(c => c.fromPile = false));

        gameState.discardPile.push(card);
        gameState.turnHistory = []; 
        gameState.turnSnapshot = null; 
        
        socket.emit('receive_cards', player.hand);
        socket.emit('snapshot_status', false);
        socket.emit('history_update', gameState.turnHistory);

        // 🌟 END TURN: SHIFT TURN INDEX TO NEXT PLAYER 🌟
        gameState.turnPhase = 'DRAW'; 
        gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % 4;
        
        broadcastState();
    });

    socket.on('disconnect', () => {
        const seat = gameState.players.findIndex(p => p.id === socket.id);
        if (seat !== -1) {
            console.log(`🔴 Player left seat ${seat}`);
            gameState.players[seat].id = null;
            gameState.players[seat].ready = false;
            // If the game was active, it freezes until someone rejoins that seat!
            broadcastState();
        }
    });
});

server.listen(3000, () => console.log(`🃏 4-Player Engine Running`));