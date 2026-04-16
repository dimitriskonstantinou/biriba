import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { motion } from 'framer-motion'
import './App.css'

const socket = io('http://localhost:3000');

const sortHand = (cards) => {
  const suitsOrder = ['Spades', 'Hearts', 'Clubs', 'Diamonds', 'Joker'];
  const valuesOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'Black', 'Red'];
  return [...cards].sort((a, b) => {
    if (a.suit !== b.suit) return suitsOrder.indexOf(a.suit) - suitsOrder.indexOf(b.suit);
    return valuesOrder.indexOf(a.value) - valuesOrder.indexOf(b.value);
  });
};

function FaceDownCard({ label, horizontal = false, large = false, scale = 1 }) {
  const w = (large ? 85 : (horizontal ? 110 : 80)) * scale;
  const h = (large ? 125 : (horizontal ? 80 : 120)) * scale;
  const fontSize = (large ? 12 : 10) * scale;
  return (
    <div style={{
      width: `${w}px`, height: `${h}px`, backgroundColor: '#0a2342', border: '2px solid white', borderRadius: '5px',
      display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 8px rgba(0,0,0,0.5)', 
      color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: `${fontSize}px`
    }}>
      {label}
    </div>
  )
}

function OpponentHand({ count, position, active = false, label = "", scale = 1 }) {
  const isVertical = position === 'left' || position === 'right';
  const cardW = (isVertical ? 50 : 35) * scale;
  const cardH = (isVertical ? 35 : 50) * scale;
  const gap = (isVertical ? -35 : -20) * scale;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', filter: active ? 'drop-shadow(0px 0px 10px yellow)' : 'none', transition: '0.3s' }}>
      <div style={{ color: 'white', fontSize: `${12 * scale}px`, fontWeight: 'bold', marginBottom: '5px', textShadow: '1px 1px 2px black' }}>
        {label} ({count})
      </div>
      <div style={{ display: 'flex', flexDirection: isVertical ? 'column' : 'row', gap: `${gap}px` }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ zIndex: i }}>
            <div style={{ width: `${cardW}px`, height: `${cardH}px`, backgroundColor: '#0a2342', border: '1px solid #ddd', borderRadius: '4px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StaticCard({ card, width = '80px', height = '120px' }) {
  const suitsOrder = ['Clubs', 'Spades', 'Hearts', 'Diamonds'];
  const valuesOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  if (card.suit === 'Joker') {
    return <img src={card.value === 'Black' ? '/assets/joker_black.png' : '/assets/joker_red.png'} draggable="false" style={{ width, height, objectFit: 'cover', borderRadius: '4px', pointerEvents: 'none' }} />;
  }
  return (
    <div style={{ 
      width, height, backgroundImage: 'url(/assets/cards_sprite.png)', backgroundSize: '1300% 400%', 
      backgroundPosition: `${(valuesOrder.indexOf(card.value) / 12) * 100}% ${(suitsOrder.indexOf(card.suit) / 3) * 100}%`, 
      borderRadius: '4px', backgroundColor: 'white', border: '1px solid #999', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', pointerEvents: 'none' 
    }} />
  );
}

// --- UPGRADED MELD COLUMN (Smart Vertical Squeeze) ---
function MeldColumn({ meldCards, scaleData }) {
  const { width, height, baseOverlap } = scaleData;
  
  // If a column gets more than 4 cards, tuck them in tighter vertically!
  const calculateVerticalOverlap = (total) => {
    if (total <= 4) return baseOverlap;
    const squeeze = baseOverlap - ((total - 4) * 4); // Squeeze 4px tighter for every extra card
    return Math.max(-height + 15, squeeze); // Never completely cover the card
  };
  const dynamicOverlap = calculateVerticalOverlap(meldCards.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {meldCards.map((card, i) => (
        <div key={i} style={{ marginTop: i === 0 ? '0' : `${dynamicOverlap}px`, zIndex: i, position: 'relative', pointerEvents: 'none' }}>
          <StaticCard card={card} width={`${width}px`} height={`${height}px`} />
        </div>
      ))}
    </div>
  );
}

function Card({ card, onDragEnd, scale = 1 }) {
  return (
    <motion.div 
      drag dragSnapToOrigin onDragEnd={(e, info) => onDragEnd(card, info)} 
      whileHover={{ scale: 1.15, y: -30, zIndex: 999 }} 
      whileTap={{ scale: 1.2, y: -50, zIndex: 999, cursor: 'grabbing' }} 
      style={{ position: 'relative', cursor: 'grab', touchAction: 'none' }}
    >
      <StaticCard card={card} width={`${80 * scale}px`} height={`${120 * scale}px`} />
    </motion.div>
  );
}

function App() {
  const [hand, setHand] = useState([]);
  const [turnHistory, setTurnHistory] = useState([]); 
  const [showFullPile, setShowFullPile] = useState(false);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [mySeat, setMySeat] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [uiScale, setUiScale] = useState(1);

  useEffect(() => {
    // Upgraded: Checks both width and height to save laptop users!
    const handleResize = () => {
      const h = window.innerHeight;
      const w = window.innerWidth;
      if (h < 650 || w < 1000) setUiScale(0.65);       
      else if (h < 800 || w < 1200) setUiScale(0.75);   
      else if (h < 950 || w < 1400) setUiScale(0.85);   
      else setUiScale(1);                  
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 

    socket.on('seat_assignment', setMySeat);
    socket.on('game_state_update', setGameState); 
    socket.on('receive_cards', setHand);
    socket.on('history_update', setTurnHistory); 
    socket.on('snapshot_status', setHasSnapshot);
    socket.on('error_message', (msg) => {
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), 3500);
    });

    return () => { window.removeEventListener('resize', handleResize); socket.off(); }
  }, []);

  const handleDragEnd = (card, info) => {
    if (!isMyTurn || gameState.turnPhase !== 'PLAY') return; 
    const elements = document.elementsFromPoint(info.point.x, info.point.y);
    for (let el of elements) {
      if (el.dataset.zone === 'discard') return socket.emit('discard_card', card);
      if (el.dataset.zone === 'existing_meld') return socket.emit('add_to_meld', { card, meldIndex: parseInt(el.dataset.index) });
      if (el.dataset.zone === 'new_meld') return socket.emit('start_new_meld', card);
    }
  };

  if (!gameState || mySeat === null) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white' }}><h2>Connecting...</h2></div>;

  if (!gameState.gameStarted) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white', backgroundColor: '#0f3822' }}>
        <h1 style={{ fontSize: '40px', marginBottom: '40px' }}>Biriba Game Lobby</h1>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '40px' }}>
          {gameState.players.map((p, index) => (
            <div key={index} style={{
              width: '180px', height: '220px', borderRadius: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              backgroundColor: p.id ? (p.ready ? '#2e8b57' : '#b8860b') : '#333', border: mySeat === index ? '4px solid yellow' : '2px solid black', boxShadow: '0 4px 8px rgba(0,0,0,0.5)'
            }}>
              <h2 style={{ margin: 0 }}>Seat {index + 1}</h2>
              <div style={{ fontSize: '12px', marginTop: '5px' }}>Team {index % 2 === 0 ? '1' : '2'}</div>
              <h3 style={{ marginTop: '20px' }}>{p.id ? (p.ready ? 'READY ✅' : 'JOINED') : 'EMPTY'}</h3>
              {mySeat === index && <div style={{ marginTop: '10px', color: 'yellow', fontWeight: 'bold' }}>(YOU)</div>}
            </div>
          ))}
        </div>
        {!gameState.players[mySeat]?.ready && (
          <button onClick={() => socket.emit('player_ready')} style={{ padding: '15px 40px', fontSize: '20px', fontWeight: 'bold', borderRadius: '30px', cursor: 'pointer', backgroundColor: '#ffd700', border: 'none' }}>I'M READY</button>
        )}
      </div>
    );
  }

  const isMyTurn = gameState.activePlayerIndex === mySeat;
  const myTeam = (mySeat === 0 || mySeat === 2) ? 'team1' : 'team2';
  const enemyTeam = myTeam === 'team1' ? 'team2' : 'team1';
  const leftSeat = (mySeat + 1) % 4;
  const topSeat = (mySeat + 2) % 4;
  const rightSeat = (mySeat + 3) % 4;

  const leftOpponent = gameState.players[leftSeat];
  const topOpponent = gameState.players[topSeat];
  const rightOpponent = gameState.players[rightSeat];

  const sortedHand = sortHand(hand);
  const calculateMargin = (total, s) => {
    if (total <= 1) return 0;
    if (total <= 7) return 15 * s;   
    if (total <= 12) return -30 * s; 
    return Math.max(-65 * s, (-30 - ((total - 12) * 3)) * s); 
  };
  const dynamicMargin = calculateMargin(sortedHand.length, uiScale);
  
  // --- UPGRADED: AGGRESSIVE HORIZONTAL SHRINKING ---
  const getTableScale = (columnsCount, s) => {
    if (columnsCount <= 3) return { width: 70 * s, height: 105 * s, baseOverlap: -75 * s }; 
    if (columnsCount <= 5) return { width: 56 * s, height: 84 * s, baseOverlap: -60 * s };  
    if (columnsCount <= 7) return { width: 46 * s, height: 69 * s, baseOverlap: -50 * s };
    return { width: 36 * s, height: 54 * s, baseOverlap: -38 * s }; // Tiny for 8+ columns!                      
  };

  const ourMelds = gameState.melds[myTeam] || [];
  const enemyMelds = gameState.melds[enemyTeam] || [];
  const tableScale = getTableScale(ourMelds.length, uiScale);
  const enemyScale = getTableScale(enemyMelds.length, uiScale);

  const lastMove = turnHistory[turnHistory.length - 1];
  const activeUndoColumn = lastMove ? lastMove.meldIndex : -1;
  const topDiscardCard = gameState.discardPile.length > 0 ? gameState.discardPile[gameState.discardPile.length - 1] : null;

  const myTurnPhaseStyle = (!isMyTurn || gameState.turnPhase === 'DRAW') ? { opacity: 0.5, pointerEvents: 'none', transition: 'opacity 0.3s' } : { transition: 'opacity 0.3s' };
  const drawAreaStyle = (isMyTurn && gameState.turnPhase === 'DRAW') 
    ? { cursor: 'pointer', filter: 'drop-shadow(0px 0px 8px rgba(255, 255, 0, 0.9))', transition: '0.3s', opacity: 1 } 
    : { opacity: 0.5, pointerEvents: 'none', transition: '0.3s' };

  return (
    <div className="game-layout">
      {toastMsg && (
        <motion.div initial={{ opacity: 0, y: -20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }}
          style={{ position: 'absolute', top: '20px', left: '50%', zIndex: 9999, backgroundColor: '#8b0000', color: 'white', padding: '12px 24px', borderRadius: '8px', border: '1px solid #ff4d4d', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.6)', pointerEvents: 'none' }}
        >⚠️ {toastMsg}</motion.div>
      )}

      <div style={{ position: 'absolute', top: '10px', left: '10px', color: 'yellow', fontWeight: 'bold', zIndex: 1000, fontSize: `${18 * uiScale}px`, textShadow: '2px 2px 4px black' }}>
        {isMyTurn ? "🔥 YOUR TURN" : `Waiting for Seat ${gameState.activePlayerIndex + 1}...`}
      </div>

      <div className="zone-top"><OpponentHand count={topOpponent.cardCount} position="top" active={gameState.activePlayerIndex === topSeat} label="Teammate" scale={uiScale} /></div>
      <div className="zone-left"><OpponentHand count={leftOpponent.cardCount} position="left" active={gameState.activePlayerIndex === leftSeat} label="Enemy L" scale={uiScale} /></div>
      <div className="zone-right"><OpponentHand count={rightOpponent.cardCount} position="right" active={gameState.activePlayerIndex === rightSeat} label="Enemy R" scale={uiScale} /></div>

      <div className="play-area">
        <div className="meld-zone">
          <h3 style={{marginBottom: `${10 * uiScale}px`, textAlign: 'center', fontSize: `${18 * uiScale}px`}}>ENEMY MELDS</h3>
          <div className="meld-scroll">
            {enemyMelds.map((meld, index) => (
              <div key={index} style={{ position: 'relative', minWidth: `${enemyScale.width}px` }}>
                <MeldColumn meldCards={meld} scaleData={enemyScale} />
              </div>
            ))}
          </div>
        </div>
        
        <div className="center-spine" style={{ width: `${160 * uiScale}px` }}>
          <div style={{ display: 'flex', gap: `${15 * uiScale}px`, marginBottom: `${20 * uiScale}px` }}>
            <FaceDownCard label="Μπιριμπάκι 1" large scale={uiScale} />
            <FaceDownCard label="Μπιριμπάκι 2" large scale={uiScale} />
          </div>
          <button onClick={() => socket.emit('draw_from_deck')} style={{ background: 'transparent', padding: 0, border: 'none', ...drawAreaStyle }}>
            <FaceDownCard label={`DECK (${gameState.deckCount})`} horizontal scale={uiScale} />
          </button>
          <button onClick={() => socket.emit('draw_from_discard')} style={{ background: 'transparent', padding: 0, border: 'none', marginTop: `${10 * uiScale}px`, ...drawAreaStyle }}>
            <div data-zone="discard" className="discard-drop-zone" style={{ border: topDiscardCard ? 'none' : '2px dashed rgba(255,255,255,0.4)', backgroundColor: topDiscardCard ? 'transparent' : 'rgba(0,0,0,0.2)', pointerEvents: isMyTurn ? 'auto' : 'none', width: `${100 * uiScale}px`, height: `${140 * uiScale}px`, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '8px' }}>
              {topDiscardCard ? <StaticCard card={topDiscardCard} width={`${80 * uiScale}px`} height={`${120 * uiScale}px`} /> : <div style={{fontSize: `${11 * uiScale}px`, color: 'white', pointerEvents: 'none'}}>DISCARD</div>}
            </div>
          </button>
          <button className="inspect-btn" onClick={() => setShowFullPile(!showFullPile)} style={{marginTop: `${20 * uiScale}px`, padding: `${8*uiScale}px ${12*uiScale}px`, fontSize: `${12*uiScale}px`, borderRadius: '6px', border: 'none', cursor: 'pointer'}}>
            Inspect Pile ({gameState.discardPile.length})
          </button>
        </div>

        <div className="meld-zone" style={{ ...myTurnPhaseStyle }}> 
          <h3 style={{marginBottom: `${10 * uiScale}px`, textAlign: 'center', fontSize: `${18 * uiScale}px`}}>OUR MELDS</h3>
          <div className="meld-scroll">
            {ourMelds.map((meld, index) => (
              <div key={index} data-zone="existing_meld" data-index={index} style={{ minWidth: `${tableScale.width}px`, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', paddingTop: `${25 * uiScale}px`, position: 'relative' }}>
                {activeUndoColumn === index && (
                  <button onClick={() => socket.emit('undo_last_move')} style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', backgroundColor: '#ff4444', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: `${9*uiScale}px`, fontWeight: 'bold', cursor: 'pointer', zIndex: 500 }}>
                    ↩ UNDO
                  </button>
                )}
                <MeldColumn meldCards={meld} scaleData={tableScale} />
              </div>
            ))}
            <div data-zone="new_meld" style={{ minWidth: `${tableScale.width}px`, height: `${tableScale.height}px`, marginTop: `${25 * uiScale}px`, border: '2px dashed rgba(255,255,255,0.5)', borderRadius: '5px', display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: `${9*uiScale}px`, backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <span style={{pointerEvents: 'none'}}>START<br/>NEW</span>
            </div>
          </div>
        </div>
      </div>

      <div className="zone-bottom" style={{ ...myTurnPhaseStyle, position: 'relative' }}>
        {hasSnapshot && isMyTurn && (
          <div style={{ position: 'absolute', top: `${-30 * uiScale}px`, left: '50%', transform: 'translateX(-50%)', zIndex: 600 }}>
            <button onClick={() => socket.emit('reset_turn')} style={{ padding: `${8*uiScale}px ${16*uiScale}px`, fontSize: `${14*uiScale}px`, background: '#ff3333', color: 'white', fontWeight: 'bold', borderRadius: '20px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.5)' }}>
              🔄 RESET TURN
            </button>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
          {sortedHand.map((card, index) => (
            <div key={`${card.suit}-${card.value}-${index}`} style={{ marginLeft: index === 0 ? 0 : dynamicMargin, zIndex: index }}>
              <Card card={card} onDragEnd={handleDragEnd} scale={uiScale} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;