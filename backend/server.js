const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- DECK & VALIDATION HELPERS ---
function createDeck() { 
    const suits = ['Clubs', 'Spades', 'Hearts', 'Diamonds'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    let idCounter = 1; 
    for (let i = 0; i < 2; i++) {
        for (let suit of suits) {
            for (let value of values) {
                deck.push({ suit, value, id: `card_${idCounter++}` });
            }
        }
    }
    deck.push({ suit: 'Joker', value: 'Black', id: `card_${idCounter++}` }); 
    deck.push({ suit: 'Joker', value: 'Red', id: `card_${idCounter++}` });
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

function getCardPoints(card) {
    if (card.suit === 'Joker') return 2.5;
    if (card.value === '2') return 2.0;
    if (card.value === 'A') return 1.5;
    if (['8', '9', '10', 'J', 'Q', 'K'].includes(card.value)) return 1.0;
    return 0.5; 
}

function hasBiriba(team) {
    return gameState.melds[team].some(meld => meld.length >= 7);
}

function calculateMeldScore(meld, kozerSuit) {
    if (!meld || meld.length === 0) return 0;
    
    // In the frontend, you might not have getCardPoints isolated. Ensure this points calculation exists inside:
    const getPts = (card) => {
        if (card.suit === 'Joker') return 2.5;
        if (card.value === '2') return 2.0;
        if (card.value === 'A') return 1.5;
        if (['8', '9', '10', 'J', 'Q', 'K'].includes(card.value)) return 1.0;
        return 0.5; 
    };

    let points = 0; let jokers = 0; let twos = []; let naturals = []; let targetSuit = null;

    for (let c of meld) {
        points += getPts(c); 
        if (c.suit === 'Joker') { jokers++; }
        else if (c.value === '2') { twos.push(c); }
        else { naturals.push(c); if (!targetSuit) targetSuit = c.suit; }
    }

    let isClean = true;
    if (jokers > 0) isClean = false;
    else if (twos.length > 0) {
        let wildcard2s = twos.filter(t => t.suit !== targetSuit);
        if (wildcard2s.length > 0) { isClean = false; } 
        else {
            let getVal = (c, high) => {
                if (c.value === 'A') return high ? 14 : 1;
                if (c.value === 'J') return 11;
                if (c.value === 'Q') return 12;
                if (c.value === 'K') return 13;
                return parseInt(c.value);
            };
            
            let allNats = [...naturals, ...twos]; // Group natural 2s correctly
            
            let hasGapsLow = false;
            let valsLow = allNats.map(c => getVal(c, false)).sort((a,b)=>a-b);
            for(let i=0; i<valsLow.length-1; i++) if (valsLow[i+1] - valsLow[i] !== 1) hasGapsLow = true;
            
            let hasGapsHigh = false;
            let valsHigh = allNats.map(c => getVal(c, true)).sort((a,b)=>a-b);
            for(let i=0; i<valsHigh.length-1; i++) if (valsHigh[i+1] - valsHigh[i] !== 1) hasGapsHigh = true;
            
            if (hasGapsLow && hasGapsHigh) isClean = false; 
        }
    }

    const isKozer = (targetSuit === kozerSuit); const len = meld.length;

    if (len === 13) {
        if (isKozer && isClean) points += 2000; else if (isKozer && !isClean) points += 1000;
        else if (!isKozer && isClean) points += 1000; else if (!isKozer && !isClean) points += 600;
    } else if (len >= 7) {
        if (isKozer && isClean) points += 600; else if (isKozer && !isClean) points += 300;
        else if (!isKozer && isClean) points += 300; else if (!isKozer && !isClean) points += 100;
    }
    return points;
}

function checkGaps(naturalsArr, numWildcards, useHighAce) {
    if (numWildcards > 1) return false; 
    if (naturalsArr.length <= 1) return true;
    let sorted = [...naturalsArr].sort((a,b) => getCardValue(a, useHighAce) - getCardValue(b, useHighAce));
    let gaps = 0;
    for(let i = 0; i < sorted.length - 1; i++) {
        let diff = getCardValue(sorted[i+1], useHighAce) - getCardValue(sorted[i], useHighAce);
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
        else { if (card.suit !== targetSuit) return false; naturals.push(card); }
    }
    let natural2 = null, wildcard2s = [];
    for (let t of twos) {
        if (t.suit === targetSuit && !natural2) natural2 = t; 
        else wildcard2s.push(t);
    }
    let totalWilds = jokers.length + wildcard2s.length;
    let isValidA = false;
    if (natural2) {
        isValidA = checkGaps([...naturals, natural2], totalWilds, false) || checkGaps([...naturals, natural2], totalWilds, true);
    }
    let isValidB = checkGaps(naturals, jokers.length + twos.length, false) || checkGaps(naturals, jokers.length + twos.length, true);
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

    const getRank = (c, highAce) => {
        if (c.value === 'A') return highAce ? 14 : 1;
        if (c.value === 'J') return 11;
        if (c.value === 'Q') return 12;
        if (c.value === 'K') return 13;
        return parseInt(c.value);
    };

    let natsWith2 = natural2 ? [...naturals, natural2] : naturals;
    
    let rHigh = natsWith2.map(c => getRank(c, true)).sort((a,b)=>a-b);
    let gHigh = 0; for(let i=0; i<rHigh.length-1; i++) gHigh += (rHigh[i+1] - rHigh[i] - 1);
    
    let rLow = natsWith2.map(c => getRank(c, false)).sort((a,b)=>a-b);
    let gLow = 0; for(let i=0; i<rLow.length-1; i++) gLow += (rLow[i+1] - rLow[i] - 1);

    let useHighAce = false; let targetNaturals = natsWith2; let targetGaps = 0;

    if (gHigh <= wildcards.length && (gHigh <= gLow || gLow > wildcards.length)) {
        useHighAce = true; targetGaps = gHigh;
    } else if (gLow <= wildcards.length) {
        useHighAce = false; targetGaps = gLow;
    } else {
        if (natural2) {
            wildcards.push(natural2); targetNaturals = naturals;
            
            let rH = naturals.map(c => getRank(c, true)).sort((a,b)=>a-b);
            let gH = 0; for(let i=0; i<rH.length-1; i++) gH += (rH[i+1] - rH[i] - 1);
            let rL = naturals.map(c => getRank(c, false)).sort((a,b)=>a-b);
            let gL = 0; for(let i=0; i<rL.length-1; i++) gL += (rL[i+1] - rL[i] - 1);
            
            if (gH <= wildcards.length && (gH <= gL || gL > wildcards.length)) {
                useHighAce = true; targetGaps = gH;
            } else {
                useHighAce = false; targetGaps = gL;
            }
        }
    }

    if (targetNaturals.length === 0) return cards;
    targetNaturals.sort((a,b) => getRank(a, useHighAce) - getRank(b, useHighAce));
    
    let startRank = getRank(targetNaturals[0], useHighAce);
    let endRank = getRank(targetNaturals[targetNaturals.length-1], useHighAce);
    let extraWildcards = wildcards.length - targetGaps;
    
    while (extraWildcards > 0 && startRank > 1) { startRank--; extraWildcards--; }
    while (extraWildcards > 0 && endRank < 14) { endRank++; extraWildcards--; }
    
    let result = []; let natIdx = 0;
    for (let r = startRank; r <= endRank; r++) {
        if (natIdx < targetNaturals.length && getRank(targetNaturals[natIdx], useHighAce) === r) {
            result.push(targetNaturals[natIdx]); natIdx++;
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
    let combinedHand = [...hand, ...pile];
    
    for (let card of pile) {
        for (let meld of melds) { 
            if (isValidSequence([...meld, card])) return true; 
        }
        
        for (let i = 0; i < combinedHand.length; i++) {
            for (let j = i + 1; j < combinedHand.length; j++) {
                let cardA = combinedHand[i];
                let cardB = combinedHand[j];
                
                if (cardA.id === card.id || cardB.id === card.id) continue;
                if (isValidSequence([card, cardA, cardB])) return true;
            }
        }
    }
    return false;
}

let gameState = {
    gameStarted: false,
    deck: [], discardPile: [], 
    birimbakia: { team1: [], team2: [] }, 
    kozerSuit: null, 
    totalScores: { team1: 0, team2: 0 },
    players: [
        { id: null, sessionId: null, name: null, ready: false, team: 'team1', hand: [], publicCardCount: 0 }, 
        { id: null, sessionId: null, name: null, ready: false, team: 'team2', hand: [], publicCardCount: 0 }, 
        { id: null, sessionId: null, name: null, ready: false, team: 'team1', hand: [], publicCardCount: 0 }, 
        { id: null, sessionId: null, name: null, ready: false, team: 'team2', hand: [], publicCardCount: 0 }  
    ],
    melds: { team1: [], team2: [] }, 
    publicMelds: { team1: [], team2: [] },
    dealerIndex: 0, activePlayerIndex: 0, turnPhase: 'DRAW', turnHistory: [], turnSnapshot: null 
};

function broadcastState() {
    const spectatorState = {
        gameStarted: gameState.gameStarted,
        players: gameState.players.map(p => ({ 
            id: p.id, 
            name: p.name, 
            ready: p.ready, 
            cardCount: p.publicCardCount,
            connected: p.id !== null
        })),
        activePlayerIndex: gameState.activePlayerIndex,
        dealerIndex: gameState.dealerIndex,
        turnPhase: gameState.turnPhase,
        deckCount: gameState.deck.length,
        discardPile: gameState.discardPile,
        melds: gameState.publicMelds, 
        kozerSuit: gameState.kozerSuit,
        totalScores: gameState.totalScores,
        birimbakia: { 
            team1: gameState.birimbakia.team1 ? gameState.birimbakia.team1.length : 0, 
            team2: gameState.birimbakia.team2 ? gameState.birimbakia.team2.length : 0 
        }
    };

    io.sockets.sockets.forEach((socket) => {
        const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
        const isMyTurnNow = gameState.gameStarted && (playerIndex === gameState.activePlayerIndex);
        
        socket.emit('game_state_update', {
            ...spectatorState,
            melds: isMyTurnNow ? gameState.melds : gameState.publicMelds
        });
    });
}

function checkAndStartGame() {
    const allReady = gameState.players.every(p => p.sessionId !== null && p.ready === true);
    if (allReady && !gameState.gameStarted) {
        gameState.gameStarted = true;
        gameState.deck = shuffleDeck(createDeck());
        gameState.birimbakia['team1'] = gameState.deck.splice(0, 11);
        gameState.birimbakia['team2'] = gameState.deck.splice(0, 11);
        
        for(let i=0; i<4; i++) {
            gameState.players[i].hand = gameState.deck.splice(0, 11);
            gameState.players[i].publicCardCount = 11;
        }
        
        const firstCard = gameState.deck.pop();
        gameState.discardPile = [firstCard]; 
        gameState.kozerSuit = firstCard.suit === 'Joker' ? null : firstCard.suit;
        
        gameState.melds = { team1: [], team2: [] };
        gameState.publicMelds = { team1: [], team2: [] }; 
        
        gameState.dealerIndex = Math.floor(Math.random() * 4);
        gameState.activePlayerIndex = (gameState.dealerIndex + 1) % 4; 
        gameState.turnPhase = 'DRAW';

        for(let i=0; i<4; i++) {
            if (gameState.players[i].id) {
                io.to(gameState.players[i].id).emit('receive_cards', gameState.players[i].hand);
            }
        }
        broadcastState();
    }
}

/*function checkAndStartGame() {
    const allReady = gameState.players.every(p => p.sessionId !== null && p.ready === true);
    if (allReady && !gameState.gameStarted) {
        gameState.gameStarted = true;
        gameState.deck = shuffleDeck(createDeck());
        gameState.birimbakia['team1'] = gameState.deck.splice(0, 11);
        gameState.birimbakia['team2'] = gameState.deck.splice(0, 11);
        
        for(let i=0; i<4; i++) {
            gameState.players[i].hand = gameState.deck.splice(0, 11);
            gameState.players[i].publicCardCount = 11;
        }

        // 🌟 --- BEGIN TEST HAND OVERRIDE FOR SEAT 1 --- 🌟
        gameState.players[0].hand = [
            { suit: 'Spades', value: 'A', id: 'test_1' },
            { suit: 'Spades', value: 'K', id: 'test_2' },
            { suit: 'Spades', value: 'Q', id: 'test_3' },
            { suit: 'Spades', value: '2', id: 'test_4' },   // Match 2
            { suit: 'Joker', value: 'Red', id: 'test_5' },  // Joker
            { suit: 'Hearts', value: '2', id: 'test_6' },   // Off-suit 2
            { suit: 'Spades', value: '3', id: 'test_7' },
            { suit: 'Spades', value: '4', id: 'test_8' },
            { suit: 'Spades', value: '5', id: 'test_9' },
            { suit: 'Spades', value: '6', id: 'test_10' },
            { suit: 'Spades', value: '7', id: 'test_11' }   // 11th card
        ];
        
        const firstCard = gameState.deck.pop();
        gameState.discardPile = [firstCard]; 
        gameState.kozerSuit = firstCard.suit === 'Joker' ? null : firstCard.suit;
        
        gameState.melds = { team1: [], team2: [] };
        gameState.publicMelds = { team1: [], team2: [] }; 
        
        gameState.dealerIndex = Math.floor(Math.random() * 4);
        gameState.activePlayerIndex = (gameState.dealerIndex + 1) % 4; 
        gameState.turnPhase = 'DRAW';

        for(let i=0; i<4; i++) {
            if (gameState.players[i].id) {
                io.to(gameState.players[i].id).emit('receive_cards', gameState.players[i].hand);
            }
        }
        broadcastState();
    }
}*/

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
    let index = player.hand.findIndex(c => c.id === cardToRemove.id);
    if (index === -1) index = player.hand.findIndex(c => c.suit === cardToRemove.suit && c.value === cardToRemove.value);
    if (index !== -1) player.hand.splice(index, 1);
}

function processEndOfRound(closingTeam = null) {
    let roundScores = { team1: 0, team2: 0 };
    let breakdown = {
        team1: { melds: 0, handPenalty: 0, biribakiPenalty: 0, closingBonus: 0, net: 0 },
        team2: { melds: 0, handPenalty: 0, biribakiPenalty: 0, closingBonus: 0, net: 0 }
    };
    
    if (closingTeam) breakdown[closingTeam].closingBonus = 100;
    
    for (const team of ['team1', 'team2']) {
        for (let meld of gameState.melds[team]) {
            breakdown[team].melds += calculateMeldScore(meld, gameState.kozerSuit);
        }
        let teamPlayers = gameState.players.filter(p => p.team === team);
        for (let player of teamPlayers) {
            for (let card of player.hand) {
                breakdown[team].handPenalty += getCardPoints(card);
            }
        }
        if (gameState.birimbakia[team].length > 0) {
            breakdown[team].biribakiPenalty = 100;
        }

        breakdown[team].net = breakdown[team].melds + breakdown[team].closingBonus - breakdown[team].handPenalty - breakdown[team].biribakiPenalty;
        roundScores[team] = breakdown[team].net;
    }

    gameState.totalScores.team1 += roundScores.team1;
    gameState.totalScores.team2 += roundScores.team2;
    
    io.emit('round_summary', { breakdown: breakdown, totalScores: gameState.totalScores });

    gameState.deck = shuffleDeck(createDeck());
    gameState.birimbakia['team1'] = gameState.deck.splice(0, 11);
    gameState.birimbakia['team2'] = gameState.deck.splice(0, 11);
    
    for(let i=0; i<4; i++) {
        gameState.players[i].hand = gameState.deck.splice(0, 11);
        gameState.players[i].publicCardCount = 11;
    }

    const firstCard = gameState.deck.pop();
    gameState.discardPile = [firstCard]; 
    gameState.kozerSuit = firstCard.suit === 'Joker' ? null : firstCard.suit;
    
    gameState.melds = { team1: [], team2: [] };
    gameState.publicMelds = { team1: [], team2: [] }; 
    
    gameState.dealerIndex = (gameState.dealerIndex + 1) % 4; 
    gameState.activePlayerIndex = (gameState.dealerIndex + 1) % 4; 
    gameState.turnPhase = 'DRAW';

    for(let i=0; i<4; i++) {
        if (gameState.players[i].id) {
            io.to(gameState.players[i].id).emit('receive_cards', gameState.players[i].hand);
        }
    }
    broadcastState();
}

function handleEmptyHand(socket, player, myTeam) {
    if (player.hand.length === 0) {
        if (gameState.birimbakia[myTeam].length > 0) {
            player.hand = gameState.birimbakia[myTeam];
            player.publicCardCount = player.hand.length;
            gameState.birimbakia[myTeam] = []; 
            gameState.turnSnapshot = null;
            gameState.turnHistory = [];
            
            gameState.publicMelds = JSON.parse(JSON.stringify(gameState.melds));

            socket.emit('receive_cards', player.hand);
            socket.emit('error_message', "🎉 BIRIBAKI UNLOCKED! 🎉");
            return "BIRIBAKI_TAKEN";
        } else {
            gameState.publicMelds = JSON.parse(JSON.stringify(gameState.melds));
            socket.emit('error_message', "🏆 ROUND OVER! Calculating Scores...");
            processEndOfRound(myTeam);
            return "ROUND_OVER";
        }
    }
    return "CONTINUE";
}

io.on('connection', (socket) => {
    broadcastState();

    socket.on('reconnect_session', (sessionId) => {
        const seat = gameState.players.findIndex(p => p.sessionId === sessionId);
        if (seat !== -1) {
            gameState.players[seat].id = socket.id; // Update to the new socket!
            console.log(`🟢 Player ${gameState.players[seat].name} instantly reconnected to seat ${seat}!`);
            
            socket.emit('seat_assignment', seat);
            socket.emit('receive_cards', gameState.players[seat].hand);
            socket.emit('history_update', gameState.turnHistory);
            
            if (gameState.turnSnapshot && gameState.activePlayerIndex === seat) {
                socket.emit('snapshot_status', true);
            }
            broadcastState();
        }
    });

    socket.on('join_with_name', ({ name, sessionId }) => {
        let seat = gameState.players.findIndex(p => p.sessionId === sessionId);
        
        if (seat !== -1) {
            gameState.players[seat].id = socket.id;
            gameState.players[seat].name = name;
        } else {
            seat = gameState.players.findIndex(p => p.sessionId === null);
            if (seat !== -1) {
                gameState.players[seat].id = socket.id;
                gameState.players[seat].sessionId = sessionId;
                gameState.players[seat].name = name || `Player ${seat + 1}`;
                io.emit('chat_message', { sender: 'System', text: `${gameState.players[seat].name} has joined the game!` });
            } else {
                return socket.emit('error_message', "Game is full! You can only spectate right now.");
            }
        }
        
        socket.emit('seat_assignment', seat);
        broadcastState();
    });

    socket.on('send_chat', (text) => {
        const player = gameState.players.find(p => p.id === socket.id);
        const senderName = player ? player.name : 'Spectator';
        io.emit('chat_message', { sender: senderName, text: text });
    });

    socket.on('player_ready', () => {
        const mySeat = gameState.players.findIndex(p => p.id === socket.id);
        if (mySeat !== -1) {
            gameState.players[mySeat].ready = true;
            broadcastState();
            checkAndStartGame();
        }
    });

    socket.on('draw_from_deck', () => {
        if (!isMyTurn(socket.id) || gameState.turnPhase !== 'DRAW') return;
        const player = gameState.players.find(p => p.id === socket.id);
        player.hand.push(gameState.deck.pop());
        player.publicCardCount = player.hand.length;
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
        player.publicCardCount = player.hand.length;
        gameState.turnPhase = 'PLAY'; 
        
        socket.emit('receive_cards', player.hand);
        socket.emit('snapshot_status', true); 
        broadcastState();
    });

    socket.on('start_new_meld', (card) => {
        if (!isMyTurn(socket.id) || gameState.turnPhase !== 'PLAY') return;
        const myTeam = getMyTeam(socket.id);
        const player = gameState.players.find(p => p.id === socket.id);

        if (player.hand.length === 1 && gameState.birimbakia[myTeam].length === 0) {
            return socket.emit('error_message', "You must keep one card to discard and end the round!");
        }
        
        if (player.hand.length === 1 && gameState.birimbakia[myTeam].length > 0 && !hasBiriba(myTeam)) {
            return socket.emit('error_message', "You need a 7-Card Biriba to empty your hand for the Biribaki!");
        }

        removeCardFromHand(socket.id, card);
        gameState.melds[myTeam].push([card]); 
        gameState.turnHistory.push({ action: 'start_new_meld', card: card, meldIndex: gameState.melds[myTeam].length - 1 });
        
        socket.emit('receive_cards', player.hand);
        socket.emit('history_update', gameState.turnHistory);
        
        if (handleEmptyHand(socket, player, myTeam) !== "ROUND_OVER") {
            broadcastState(); 
        }
    });

    socket.on('add_to_meld', ({ card, meldIndex }) => {
        if (!isMyTurn(socket.id) || gameState.turnPhase !== 'PLAY') return;
        const myTeam = getMyTeam(socket.id);
        const player = gameState.players.find(p => p.id === socket.id);
        
        if (player.hand.length === 1 && gameState.birimbakia[myTeam].length === 0) {
            return socket.emit('error_message', "You must keep one card to discard and end the round!");
        }
        
        let targetMeld = [...gameState.melds[myTeam][meldIndex]];
        targetMeld.push(card); 
        
        if (player.hand.length === 1 && gameState.birimbakia[myTeam].length > 0) {
            let alreadyHas = hasBiriba(myTeam);
            let thisCreates = targetMeld.length >= 7; 
            if (!alreadyHas && !thisCreates) {
                return socket.emit('error_message', "You need a 7-Card Biriba to empty your hand for the Biribaki!");
            }
        }

        if (isValidSequence(targetMeld)) {
            removeCardFromHand(socket.id, card);
            gameState.melds[myTeam][meldIndex] = sortMeldVisually(targetMeld); 
            gameState.turnHistory.push({ action: 'add_to_meld', card: card, meldIndex: meldIndex });
            
            socket.emit('receive_cards', player.hand);
            socket.emit('history_update', gameState.turnHistory); 
            
            if (handleEmptyHand(socket, player, myTeam) !== "ROUND_OVER") {
                broadcastState(); 
            }
        }
    });

    socket.on('undo_last_move', () => {
        if (!isMyTurn(socket.id) || gameState.turnHistory.length === 0) return;
        const myTeam = getMyTeam(socket.id);
        const lastMove = gameState.turnHistory.pop();
        const player = gameState.players.find(p => p.id === socket.id);

        if (lastMove.action === 'add_to_meld') {
            let meld = gameState.melds[myTeam][lastMove.meldIndex];
            let cardIndex = meld.findIndex(c => c.id === lastMove.card.id);
            if (cardIndex === -1) cardIndex = meld.findIndex(c => c.suit === lastMove.card.suit && c.value === lastMove.card.value);
            
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

        const hasCard = player.hand.some(c => c.id === card.id || (c.suit === card.suit && c.value === card.value));
        if (!hasCard) return;

        const invalidMelds = gameState.melds[myTeam].filter(meld => meld.length < 3);
        if (invalidMelds.length > 0) return socket.emit('error_message', "All melds must have at least 3 cards!");

        if (gameState.turnSnapshot) {
            let playedFromPile = false;
            for (let meld of gameState.melds[myTeam]) {
                if (meld.some(c => c.fromPile)) { playedFromPile = true; break; }
            }
            if (!playedFromPile) {
                return socket.emit('error_message', "You MUST play a card from the pile you picked up! (Or click Reset Turn)");
            }
        }

        if (player.hand.length === 1 && !hasBiriba(myTeam)) {
            let message = gameState.birimbakia[myTeam].length > 0 
                ? "You need a 7-Card Biriba to discard your last card and take the Biribaki!"
                : "You need a 7-Card Biriba to discard your last card and end the round!";
            return socket.emit('error_message', message);
        }

        removeCardFromHand(socket.id, card);
        card.fromPile = false;
        player.hand.forEach(c => c.fromPile = false);
        gameState.melds[myTeam].forEach(meld => meld.forEach(c => c.fromPile = false));

        gameState.discardPile.push(card);
        gameState.turnHistory = []; 
        gameState.turnSnapshot = null; 
        
        gameState.publicMelds = JSON.parse(JSON.stringify(gameState.melds));
        player.publicCardCount = player.hand.length;
        
        let status = handleEmptyHand(socket, player, myTeam);
        
        if (status !== "ROUND_OVER") {
            socket.emit('receive_cards', player.hand);
            socket.emit('snapshot_status', false);
            socket.emit('history_update', gameState.turnHistory);

            gameState.turnPhase = 'DRAW'; 
            gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % 4;
            broadcastState();
        }
    });

    socket.on('end_round_empty_deck', () => {
        if (!isMyTurn(socket.id) || gameState.deck.length > 0) return;
        io.emit('chat_message', { sender: 'System', text: 'The deck ran out of cards! The round is over.' });
        processEndOfRound();
    });

    socket.on('disconnect', () => {
        const seat = gameState.players.findIndex(p => p.id === socket.id);
        if (seat !== -1) {
            // 🌟 UPGRADED: Do NOT delete the player! Just mark their socket as null (Offline)
            console.log(`🔴 Player ${gameState.players[seat].name || seat} went offline.`);
            gameState.players[seat].id = null; 
            broadcastState();
        }
    });
});

server.listen(3000, () => console.log(`🃏 4-Player Engine Running`));