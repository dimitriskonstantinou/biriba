import { useEffect, useState, useRef, useMemo } from 'react'
import { io } from 'socket.io-client'
import { motion } from 'framer-motion'
import './App.css'

const socket = io('http://localhost:3000');
//const socket = io('https://biriba.onrender.com/');

const sortHand = (cards) => {
  const suitsOrder = ['Spades', 'Hearts', 'Clubs', 'Diamonds', 'Joker'];
  const valuesOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'Black', 'Red'];
  return [...cards].sort((a, b) => {
    if (a.suit !== b.suit) return suitsOrder.indexOf(a.suit) - suitsOrder.indexOf(b.suit);
    return valuesOrder.indexOf(a.value) - valuesOrder.indexOf(b.value);
  });
};

const calculateMeldScore = (meld, kozerSuit) => {
  if (!meld || meld.length === 0) return 0;
  
  let points = 0; let jokers = 0; let twos = []; let naturals = []; let targetSuit = null;

  for (let c of meld) {
      if (c.suit === 'Joker') { points += 2.5; jokers++; }
      else if (c.value === '2') { points += 2.0; twos.push(c); }
      else {
          if (c.value === 'A') points += 1.5;
          else if (['8','9','10','J','Q','K'].includes(c.value)) points += 1;
          else points += 0.5;
          naturals.push(c);
          if (!targetSuit) targetSuit = c.suit;
      }
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
          
          let allNats = [...naturals, ...twos]; 
          
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
};

const getMeldStatus = (meld, kozerSuit) => {
  if (!meld || meld.length === 0) return { isClean: false, isComplete: false };
  let jokers = 0; let twos = []; let naturals = []; let targetSuit = null;
  for (let c of meld) {
      if (c.suit === 'Joker') jokers++;
      else if (c.value === '2') twos.push(c);
      else { naturals.push(c); if (!targetSuit) targetSuit = c.suit; }
  }
  let isClean = true;
  if (jokers > 0) isClean = false;
  else if (twos.length > 0) {
      let wildcard2s = twos.filter(t => t.suit !== targetSuit);
      if (wildcard2s.length > 0) isClean = false;
      else {
          let getVal = (c, high) => {
              if (c.value === 'A') return high ? 14 : 1;
              if (c.value === 'J') return 11;
              if (c.value === 'Q') return 12;
              if (c.value === 'K') return 13;
              return parseInt(c.value);
          };
          let allNats = [...naturals, ...twos]; 
          let hasGapsLow = false; let valsLow = allNats.map(c => getVal(c, false)).sort((a,b)=>a-b);
          for(let i=0; i<valsLow.length-1; i++) if (valsLow[i+1] - valsLow[i] !== 1) hasGapsLow = true;
          let hasGapsHigh = false; let valsHigh = allNats.map(c => getVal(c, true)).sort((a,b)=>a-b);
          for(let i=0; i<valsHigh.length-1; i++) if (valsHigh[i+1] - valsHigh[i] !== 1) hasGapsHigh = true;
          if (hasGapsLow && hasGapsHigh) isClean = false; 
      }
  }
  return { isClean, isComplete: meld.length >= 13 };
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
      <div style={{ color: 'white', fontSize: `${12 * scale}px`, fontWeight: 'bold', marginBottom: '5px', textShadow: '1px 1px 2px black', textAlign: 'center' }}>
        {label}
        {/* 🌟 NEW: The live card counter is right below the name! */}
        <div style={{ color: '#ffd700', fontSize: `${14 * scale}px`, marginTop: '2px' }}>{count} Cards</div>
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

function MeldColumn({ meldCards, scaleData }) {
  const { width, height, baseOverlap } = scaleData;
  const calculateVerticalOverlap = (total) => {
    if (total <= 4) return baseOverlap;
    const squeeze = baseOverlap - ((total - 4) * 4); 
    return Math.max(-height + 15, squeeze); 
  };
  const dynamicOverlap = calculateVerticalOverlap(meldCards.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {meldCards.map((card, i) => (
        <motion.div 
          key={card.id || `meld_${i}`} 
          // 🌟 NEW: This makes the cards pop out on hover!
          whileHover={{ scale: 1.3, x: 20, zIndex: 9999 }}
          style={{ marginTop: i === 0 ? '0' : `${dynamicOverlap}px`, zIndex: i, position: 'relative', pointerEvents: 'auto' }}
        >
          <StaticCard card={card} width={`${width}px`} height={`${height}px`} />
        </motion.div>
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
  const [isMobile, setIsMobile] = useState(false);
  const [roundSummary, setRoundSummary] = useState(null); 

  const [inputName, setInputName] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(true); 
  const messagesEndRef = useRef(null);

  // 🌟 FIX: We now use sessionStorage so multiple tabs act as multiple devices!
  const mySessionId = useMemo(() => {
    let s = sessionStorage.getItem('biriba_sessionId');
    if (!s) {
        s = Math.random().toString(36).substring(2, 10);
        sessionStorage.setItem('biriba_sessionId', s);
    }
    return s;
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const h = window.innerHeight; 
      const w = window.innerWidth;
      
      // 1. Check if it's a phone first
      const mobileCheck = w < 800;
      setIsMobile(mobileCheck);
      
      // 2. Apply the correct scale ONLY ONCE
      if (mobileCheck) setUiScale(0.55); 
      else if (h < 650 || w < 1000) setUiScale(0.65); 
      else if (h < 800 || w < 1200) setUiScale(0.75); 
      else if (h < 950 || w < 1400) setUiScale(0.85); 
      else setUiScale(1);                  
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 

    socket.emit('reconnect_session', mySessionId);

    socket.on('seat_assignment', setMySeat);
    socket.on('game_state_update', (state) => {
        setGameState(state);
        if (state.gameStarted) setRoundSummary(null); 
    }); 
    socket.on('receive_cards', setHand);
    socket.on('history_update', setTurnHistory); 
    socket.on('snapshot_status', setHasSnapshot);
    socket.on('error_message', (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3500); });
    socket.on('round_summary', setRoundSummary);
    
    socket.on('chat_message', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });

    return () => { window.removeEventListener('resize', handleResize); socket.off(); }
  }, [mySessionId]);

  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  const handleDragEnd = (card, info) => {
    const isMyTurnNow = gameState.activePlayerIndex === mySeat;
    if (!isMyTurnNow || gameState.turnPhase !== 'PLAY') return; 

    const elements = document.elementsFromPoint(info.point.x, info.point.y);
    for (let el of elements) {
      if (el.dataset.zone === 'discard') return socket.emit('discard_card', card);
      if (el.dataset.zone === 'existing_meld') return socket.emit('add_to_meld', { card, meldIndex: parseInt(el.dataset.index) });
      if (el.dataset.zone === 'new_meld') return socket.emit('start_new_meld', card);
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim() !== "") {
      socket.emit('send_chat', chatInput);
      setChatInput("");
    }
  };

  if (!gameState) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white' }}><h2>Connecting to Server...</h2></div>;

  if (mySeat === null) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white', backgroundColor: '#0f3822' }}>
        {toastMsg && (
          <div style={{ position: 'absolute', top: '20px', backgroundColor: '#8b0000', padding: '12px 24px', borderRadius: '8px', border: '1px solid #ff4d4d', fontWeight: 'bold' }}>⚠️ {toastMsg}</div>
        )}
        <h1 style={{ fontSize: '50px', marginBottom: '30px', textShadow: '2px 2px 5px black' }}>Biriba Online</h1>
        <div style={{ background: 'rgba(0,0,0,0.6)', padding: '40px', borderRadius: '15px', textAlign: 'center', border: '2px solid #ffd700', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <h2 style={{ marginBottom: '25px', color: '#ffd700' }}>Enter Your Name!!!!!!!</h2>
            <form onSubmit={(e) => { e.preventDefault(); if(inputName.trim()) socket.emit('join_with_name', { name: inputName, sessionId: mySessionId }); }}>
                <input autoFocus value={inputName} onChange={e=>setInputName(e.target.value)} placeholder="Player Name" style={{ padding: '15px', fontSize: '20px', borderRadius: '8px', border: 'none', marginBottom: '25px', width: '250px', textAlign: 'center', color: 'black' }} />
                <br/>
                <button type="submit" style={{ padding: '15px 40px', fontSize: '20px', fontWeight: 'bold', background: '#ffd700', color: 'black', border: 'none', borderRadius: '30px', cursor: 'pointer', transition: '0.2s' }}>Join Table</button>
            </form>
        </div>
      </div>
    );
  }

  const team1Names = [gameState.players[0], gameState.players[2]].filter(p => p && p.name).map(p => p.name).join(' & ') || 'Team 1';
  const team2Names = [gameState.players[1], gameState.players[3]].filter(p => p && p.name).map(p => p.name).join(' & ') || 'Team 2';

  if (roundSummary) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.92)', zIndex: 999999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ background: '#1a4a38', padding: '40px', border: '3px solid #ffd700', borderRadius: '15px', textAlign: 'center', width: '90%', maxWidth: '800px', boxShadow: '0 0 50px rgba(255,215,0,0.3)' }}>
            <h1 style={{ color: '#ffd700', fontSize: '36px', margin: '0 0 30px 0', textShadow: '2px 2px 4px black' }}>🏆 Round Complete!</h1>
            
            <div style={{ display: 'flex', justifyContent: 'space-around', color: 'white', marginBottom: '30px' }}>
                <div style={{ width: '45%', background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '10px' }}>
                    <h2 style={{ color: '#4CAF50', margin: '0 0 15px 0' }}>{team1Names}</h2>
                    <p style={{ margin: '5px 0', fontSize: '18px' }}>Table Points: <span style={{color: '#4CAF50'}}>+{roundSummary.breakdown.team1.melds}</span></p>
                    <p style={{ margin: '5px 0', fontSize: '18px' }}>Cards in Hand: <span style={{color: '#ff4444'}}>-{roundSummary.breakdown.team1.handPenalty}</span></p>
                    {roundSummary.breakdown.team1.biribakiPenalty > 0 && <p style={{ margin: '5px 0', fontSize: '18px', color: '#ff4444' }}>Missed Biribaki: -100</p>}
                    {roundSummary.breakdown.team1.closingBonus > 0 && <p style={{ margin: '5px 0', fontSize: '18px', color: '#4CAF50' }}>Going Out Bonus: +100</p>}
                    <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '15px 0' }} />
                    <h3 style={{ color: '#ffd700', fontSize: '24px', margin: 0 }}>Round Net: {roundSummary.breakdown.team1.net}</h3>
                </div>
                
                <div style={{ width: '45%', background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '10px' }}>
                    <h2 style={{ color: '#2196F3', margin: '0 0 15px 0' }}>{team2Names}</h2>
                    <p style={{ margin: '5px 0', fontSize: '18px' }}>Table Points: <span style={{color: '#4CAF50'}}>+{roundSummary.breakdown.team2.melds}</span></p>
                    <p style={{ margin: '5px 0', fontSize: '18px' }}>Cards in Hand: <span style={{color: '#ff4444'}}>-{roundSummary.breakdown.team2.handPenalty}</span></p>
                    {roundSummary.breakdown.team2.biribakiPenalty > 0 && <p style={{ margin: '5px 0', fontSize: '18px', color: '#ff4444' }}>Missed Biribaki: -100</p>}
                    {roundSummary.breakdown.team2.closingBonus > 0 && <p style={{ margin: '5px 0', fontSize: '18px', color: '#4CAF50' }}>Going Out Bonus: +100</p>}
                    <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '15px 0' }} />
                    <h3 style={{ color: '#ffd700', fontSize: '24px', margin: 0 }}>Round Net: {roundSummary.breakdown.team2.net}</h3>
                </div>
            </div>
            
            <h2 style={{ color: 'white', borderTop: '1px solid rgba(255,215,0,0.3)', paddingTop: '20px', margin: '0 0 10px 0', fontSize: '20px' }}>Global Scoreboard</h2>
            <h3 style={{ color: '#ffd700', fontSize: '32px', margin: 0, textShadow: '2px 2px 4px black' }}>
              {team1Names}: {roundSummary.totalScores.team1} <span style={{color:'white', margin:'0 15px'}}>|</span> {team2Names}: {roundSummary.totalScores.team2}
            </h3>
            
            <button onClick={() => setRoundSummary(null)} style={{ marginTop: '35px', padding: '15px 40px', fontSize: '18px', fontWeight: 'bold', background: '#ffd700', color: 'black', border: 'none', borderRadius: '30px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
              Continue to Next Round
            </button>
        </div>
      </div>
    );
  }

  const renderGameContent = () => {
    if (!gameState.gameStarted) {
      return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white', backgroundColor: '#0f3822' }}>
          {/* 🌟 FIX: Force white text to fight Dark Mode extensions */}
          <h1 style={{ fontSize: '40px', marginBottom: '20px', color: '#ffffff', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>Biriba Game Lobby</h1>
          <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px 30px', borderRadius: '20px', border: '2px solid #ffd700', marginBottom: '40px', fontSize: '20px', fontWeight: 'bold' }}>
            🏆 {team1Names}: <span style={{color: '#ffd700'}}>{gameState.totalScores?.team1 || 0}</span> | {team2Names}: <span style={{color: '#ffd700'}}>{gameState.totalScores?.team2 || 0}</span>
          </div>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {gameState.players.map((p, index) => (
              <div key={index} style={{
                width: '180px', height: '220px', borderRadius: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                backgroundColor: p.name ? (p.id ? (p.ready ? '#2e8b57' : '#b8860b') : '#666') : '#333', 
                border: mySeat === index ? '4px solid yellow' : '2px solid black', boxShadow: '0 4px 8px rgba(0,0,0,0.5)'
              }}>
                <h2 style={{ margin: 0 }}>Seat {index + 1}</h2>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>Team {index % 2 === 0 ? '1' : '2'}</div>
                <h3 style={{ marginTop: '20px', textAlign: 'center', padding: '0 10px' }}>
                  {p.name ? (p.id ? (p.ready ? 'READY ✅' : p.name) : 'OFFLINE ❌') : 'EMPTY'}
                </h3>
                {mySeat === index && <div style={{ marginTop: '10px', color: 'yellow', fontWeight: 'bold' }}>(YOU)</div>}
              </div>
            ))}
          </div>
          {!gameState.players[mySeat]?.ready && (
            <div onClick={() => socket.emit('player_ready')} style={{ padding: '15px 40px', fontSize: '20px', fontWeight: 'bold', borderRadius: '30px', cursor: 'pointer', backgroundColor: '#ffd700', color: 'black' }}>I'M READY</div>
          )}
        </div>
      );
    }

    const isMyTurn = gameState.activePlayerIndex === mySeat;
    const myTeam = (mySeat === 0 || mySeat === 2) ? 'team1' : 'team2';
    const enemyTeam = myTeam === 'team1' ? 'team2' : 'team1';
    const leftSeat = (mySeat + 1) % 4; const topSeat = (mySeat + 2) % 4; const rightSeat = (mySeat + 3) % 4;
    const leftOpponent = gameState.players[leftSeat]; const topOpponent = gameState.players[topSeat]; const rightOpponent = gameState.players[rightSeat];

    const sortedHand = sortHand(hand);
    const calculateMargin = (total, s) => {
      if (total <= 1) return 0; if (total <= 7) return 15 * s; if (total <= 12) return -30 * s; 
      return Math.max(-65 * s, (-30 - ((total - 12) * 3)) * s); 
    };
    const dynamicMargin = calculateMargin(sortedHand.length, uiScale);
    
    const getTableScale = (columnsCount, s) => {
      if (columnsCount <= 4) return { width: 70 * s, height: 105 * s, baseOverlap: -75 * s }; 
      return { width: 58 * s, height: 87 * s, baseOverlap: -62 * s }; 
    };

    const ourMelds = gameState.melds[myTeam] || []; const enemyMelds = gameState.melds[enemyTeam] || [];
    const tableScale = getTableScale(ourMelds.length, uiScale); const enemyScale = getTableScale(enemyMelds.length, uiScale);
    const lastMove = turnHistory[turnHistory.length - 1]; const activeUndoColumn = lastMove ? lastMove.meldIndex : -1;
    const topDiscardCard = gameState.discardPile.length > 0 ? gameState.discardPile[gameState.discardPile.length - 1] : null;

    const deckAreaStyle = (isMyTurn && gameState.turnPhase === 'DRAW') 
      ? { cursor: 'pointer', filter: 'drop-shadow(0px 0px 8px rgba(255, 255, 0, 0.9))', transition: '0.3s', opacity: 1 } 
      : { opacity: 0.5, pointerEvents: 'none', transition: '0.3s' };

    const discardAreaStyle = isMyTurn 
      ? { cursor: gameState.turnPhase === 'DRAW' ? 'pointer' : 'default', filter: gameState.turnPhase === 'DRAW' ? 'drop-shadow(0px 0px 8px rgba(255, 255, 0, 0.9))' : 'none', transition: '0.3s', opacity: 1, pointerEvents: 'auto' } 
      : { opacity: 0.5, pointerEvents: 'none', transition: '0.3s' };

    const myTurnPhaseStyle = (!isMyTurn || gameState.turnPhase === 'DRAW') ? { opacity: 0.5, pointerEvents: 'none', transition: 'opacity 0.3s' } : { transition: 'opacity 0.3s' };

    return (
      // 🌟 Allow vertical scrolling on mobile
      <div className="game-layout" style={{ height: '100dvh', overflowY: isMobile ? 'auto' : 'hidden', overflowX: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {toastMsg && (
          <motion.div initial={{ opacity: 0, y: -20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }}
            style={{ position: 'absolute', top: '20px', left: '50%', zIndex: 9999, backgroundColor: '#8b0000', color: 'white', padding: '12px 24px', borderRadius: '8px', border: '1px solid #ff4d4d', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.6)', pointerEvents: 'none' }}
          >⚠️ {toastMsg}</motion.div>
        )}

        {/* 🌟 Adjust Top UI for Mobile */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', color: 'yellow', fontWeight: 'bold', zIndex: 1000, fontSize: `${18 * uiScale}px`, textShadow: '2px 2px 4px black' }}>
          {isMyTurn ? "🔥 YOUR TURN" : `Waiting for ${gameState.players[gameState.activePlayerIndex]?.name || 'Opponent'}...`}
        </div>
        {!isMobile && (
          <div style={{ position: 'absolute', top: '10px', right: '10px', color: 'white', fontWeight: 'bold', zIndex: 1000, fontSize: `${16 * uiScale}px`, backgroundColor: 'rgba(0,0,0,0.7)', padding: `${8 * uiScale}px ${16 * uiScale}px`, borderRadius: '20px', border: '2px solid #ffd700', boxShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>
            🏆 OVERALL: {team1Names}: <span style={{color: '#ffd700'}}>{gameState.totalScores?.team1 || 0}</span> | {team2Names}: <span style={{color: '#ffd700'}}>{gameState.totalScores?.team2 || 0}</span>
          </div>
        )}

        {/* 🌟 MOBILE OPPONENT GROUPING */}
        {isMobile ? (
          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-evenly', paddingTop: '60px', paddingBottom: '15px' }}>
            <OpponentHand count={leftOpponent.cardCount} position="top" active={gameState.activePlayerIndex === leftSeat} label={leftOpponent.name || "Left"} scale={uiScale} />
            <OpponentHand count={topOpponent.cardCount} position="top" active={gameState.activePlayerIndex === topSeat} label={topOpponent.name || "Top"} scale={uiScale} />
            <OpponentHand count={rightOpponent.cardCount} position="top" active={gameState.activePlayerIndex === rightSeat} label={rightOpponent.name || "Right"} scale={uiScale} />
          </div>
        ) : (
          <>
            <div className="zone-top"><OpponentHand count={topOpponent.cardCount} position="top" active={gameState.activePlayerIndex === topSeat} label={topOpponent.name || "Teammate"} scale={uiScale} /></div>
            <div className="zone-left"><OpponentHand count={leftOpponent.cardCount} position="left" active={gameState.activePlayerIndex === leftSeat} label={leftOpponent.name || "Enemy L"} scale={uiScale} /></div>
            <div className="zone-right"><OpponentHand count={rightOpponent.cardCount} position="right" active={gameState.activePlayerIndex === rightSeat} label={rightOpponent.name || "Enemy R"} scale={uiScale} /></div>
          </>
        )}

        {/* 🌟 DYNAMIC PLAY AREA (Stacks vertically on phone) */}
        <div className="play-area" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', width: '100%', gap: isMobile ? '30px' : '0', position: isMobile ? 'relative' : 'absolute', top: isMobile ? '0' : '50%', transform: isMobile ? 'none' : 'translateY(-50%)' }}>
          
          <div className="meld-zone" style={{ width: isMobile ? '95vw' : 'auto' }}>
            <h3 style={{marginBottom: `${10 * uiScale}px`, textAlign: 'center', fontSize: `${18 * uiScale}px`}}>ENEMY MELDS</h3>
            <div className="meld-scroll" style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', overflowX: isMobile ? 'auto' : 'visible', gap: '10px', paddingBottom: '15px' }}>
              {enemyMelds.map((meld, index) => {
                const score = calculateMeldScore(meld, gameState.kozerSuit); const status = getMeldStatus(meld, gameState.kozerSuit);
                let badgeColor = 'rgba(0,0,0,0.6)'; let textColor = 'white'; if (meld.length >= 7) { badgeColor = status.isClean ? '#4CAF50' : '#ffd700'; textColor = 'black'; }
                const lockedStyle = status.isComplete ? { opacity: 0.8, border: '2px solid #ffd700', backgroundColor: 'rgba(255,215,0,0.05)' } : { border: '1px solid rgba(255,255,255,0.1)' };
                return (
                  <div key={index} style={{ minWidth: `${enemyScale.width + (24 * uiScale)}px`, minHeight: `${enemyScale.height + (80 * uiScale)}px`, borderRadius: '6px', padding: `${25 * uiScale}px ${12 * uiScale}px ${50 * uiScale}px ${12 * uiScale}px`, position: 'relative', display: 'flex', justifyContent: 'center', ...lockedStyle }}>
                    <MeldColumn meldCards={meld} scaleData={enemyScale} />
                    <div style={{ position: 'absolute', bottom: `${15 * uiScale}px`, left: '50%', transform: 'translateX(-50%)', backgroundColor: badgeColor, color: textColor, padding: '4px 10px', borderRadius: '12px', fontSize: `${12 * uiScale}px`, fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {status.isComplete && <span>🔒</span>} <span>{score} pts</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="center-spine" style={{ width: isMobile ? '95vw' : `${160 * uiScale}px`, display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
            <div style={{ backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid #ffd700', borderRadius: '8px', padding: `${6 * uiScale}px ${16 * uiScale}px`, textAlign: 'center', boxShadow: '0 0 10px rgba(255, 215, 0, 0.3)' }}>
              <div style={{ fontSize: `${10 * uiScale}px`, color: '#ffd700', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Kozer</div>
              {gameState.kozerSuit ? ( <div style={{ fontSize: `${28 * uiScale}px`, color: ['Hearts', 'Diamonds'].includes(gameState.kozerSuit) ? '#ff4444' : '#ffffff', textShadow: '1px 1px 2px black', lineHeight: '1' }}>{gameState.kozerSuit === 'Hearts' ? '♥' : gameState.kozerSuit === 'Diamonds' ? '♦' : gameState.kozerSuit === 'Spades' ? '♠' : '♣'}</div> ) : ( <div style={{ fontSize: `${12 * uiScale}px`, color: '#ccc', marginTop: '4px' }}>NONE</div> )}
            </div>
            <div style={{ display: 'flex', gap: `${15 * uiScale}px` }}>
              {gameState.birimbakia?.team1 > 0 && <FaceDownCard label="Μπιριμπάκι 1" large scale={uiScale} />}
              {gameState.birimbakia?.team2 > 0 && <FaceDownCard label="Μπιριμπάκι 2" large scale={uiScale} />}
            </div>
            {gameState.deckCount > 0 ? (
              <div onClick={() => { if(isMyTurn && gameState.turnPhase === 'DRAW') socket.emit('draw_from_deck') }} style={{ cursor: (isMyTurn && gameState.turnPhase === 'DRAW') ? 'pointer' : 'default', filter: (isMyTurn && gameState.turnPhase === 'DRAW') ? 'drop-shadow(0px 0px 8px rgba(255, 255, 0, 0.9))' : 'none', opacity: (isMyTurn && gameState.turnPhase === 'DRAW') ? 1 : 0.5, transition: '0.3s' }}>
                <FaceDownCard label={`DECK (${gameState.deckCount})`} horizontal scale={uiScale} />
              </div>
            ) : (
              <div onClick={() => { if(isMyTurn && gameState.turnPhase === 'DRAW') socket.emit('end_round_empty_deck') }} style={{ background: '#d32f2f', color: 'white', border: '2px solid white', borderRadius: '8px', cursor: (isMyTurn && gameState.turnPhase === 'DRAW') ? 'pointer' : 'not-allowed', width: `${110 * uiScale}px`, height: `${80 * uiScale}px`, display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 8px rgba(0,0,0,0.5)', opacity: (isMyTurn && gameState.turnPhase === 'DRAW') ? 1 : 0.5, fontWeight: 'bold', fontSize: `${14 * uiScale}px` }}>END GAME</div>
            )}
            <div data-zone="discard" onClick={() => { if(isMyTurn && gameState.turnPhase === 'DRAW') socket.emit('draw_from_discard') }} style={{ width: `${120 * uiScale}px`, height: `${160 * uiScale}px`, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '8px', border: topDiscardCard ? 'none' : '2px dashed rgba(255,255,255,0.4)', backgroundColor: topDiscardCard ? 'transparent' : 'rgba(0,0,0,0.2)', cursor: (isMyTurn && gameState.turnPhase === 'DRAW') ? 'pointer' : 'default', filter: (isMyTurn && gameState.turnPhase === 'DRAW') ? 'drop-shadow(0px 0px 8px rgba(255, 255, 0, 0.9))' : 'none', opacity: 1, pointerEvents: 'auto', transition: '0.3s' }}>
              <div className="discard-drop-zone" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                {topDiscardCard ? <StaticCard card={topDiscardCard} width={`${80 * uiScale}px`} height={`${120 * uiScale}px`} /> : <div style={{fontSize: `${11 * uiScale}px`, color: 'white'}}>DISCARD</div>}
              </div>
            </div>
            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowFullPile(true); }} style={{ padding: `${8*uiScale}px ${12*uiScale}px`, fontSize: `${12*uiScale}px`, borderRadius: '6px', border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.1)', cursor: 'pointer', pointerEvents: 'auto', textAlign: 'center' }}>
              Inspect Pile ({gameState.discardPile.length})
            </div>
            {hasSnapshot && isMyTurn && (
              <div onClick={() => socket.emit('reset_turn')} style={{ padding: `${8*uiScale}px ${12*uiScale}px`, fontSize: `${11*uiScale}px`, background: '#d32f2f', color: 'white', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.5)', textAlign: 'center' }}>🔄 RESET</div>
            )}
          </div>

          <div className="meld-zone" style={{ ...myTurnPhaseStyle, width: isMobile ? '95vw' : 'auto' }}> 
            <h3 style={{marginBottom: `${10 * uiScale}px`, textAlign: 'center', fontSize: `${18 * uiScale}px`}}>OUR MELDS</h3>
            <div className="meld-scroll" style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', overflowX: isMobile ? 'auto' : 'visible', gap: '10px', paddingBottom: '15px' }}>
              {ourMelds.map((meld, index) => {
                const score = calculateMeldScore(meld, gameState.kozerSuit); const status = getMeldStatus(meld, gameState.kozerSuit);
                let badgeColor = 'rgba(0,0,0,0.6)'; let textColor = 'white'; if (meld.length >= 7) { badgeColor = status.isClean ? '#4CAF50' : '#ffd700'; textColor = 'black'; }
                const dropProps = status.isComplete ? {} : { "data-zone": "existing_meld", "data-index": index };
                const lockedStyle = status.isComplete ? { opacity: 0.8, border: '2px solid #ffd700', backgroundColor: 'rgba(255,215,0,0.05)' } : { border: '1px solid rgba(255,255,255,0.1)' };
                return (
                  <div key={index} {...dropProps} style={{ minWidth: `${tableScale.width + (24 * uiScale)}px`, minHeight: `${tableScale.height + (80 * uiScale)}px`, borderRadius: '6px', padding: `${25 * uiScale}px ${12 * uiScale}px ${50 * uiScale}px ${12 * uiScale}px`, position: 'relative', display: 'flex', justifyContent: 'center', ...lockedStyle }}>
                    {activeUndoColumn === index && !status.isComplete && ( <div onClick={() => socket.emit('undo_last_move')} style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#d32f2f', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: `${9*uiScale}px`, fontWeight: 'bold', cursor: 'pointer', zIndex: 500, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>↩ UNDO</div> )}
                    <MeldColumn meldCards={meld} scaleData={tableScale} />
                    <div style={{ position: 'absolute', bottom: `${15 * uiScale}px`, left: '50%', transform: 'translateX(-50%)', backgroundColor: badgeColor, color: textColor, padding: '4px 10px', borderRadius: '12px', fontSize: `${12 * uiScale}px`, fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {status.isComplete && <span>🔒</span>} <span>{score} pts</span>
                    </div>
                  </div>
                );
              })}
              <div data-zone="new_meld" style={{ minWidth: `${tableScale.width + (24 * uiScale)}px`, minHeight: `${tableScale.height + (80 * uiScale)}px`, border: '2px dashed rgba(255,255,255,0.5)', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: `${10*uiScale}px`, backgroundColor: 'rgba(0,0,0,0.2)', cursor: 'pointer' }}>
                <span style={{pointerEvents: 'none'}}>START<br/>NEW</span>
              </div>
            </div>
          </div>
        </div>

        {/* 🌟 BOTTOM HAND (Scrollable horizontally) */}
        <div className="zone-bottom" style={{ transition: 'opacity 0.3s', position: isMobile ? 'relative' : 'absolute', width: isMobile ? '100vw' : 'auto', overflowX: isMobile ? 'auto' : 'visible', paddingTop: isMobile ? '20px' : '0', paddingBottom: isMobile ? '80px' : '0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 'max-content', padding: '0 20px' }}>
            {sortedHand.map((card, index) => (
              <div key={card.id || `hand-${index}`} style={{ marginLeft: index === 0 ? 0 : dynamicMargin, zIndex: index }}>
                <Card card={card} onDragEnd={handleDragEnd} scale={uiScale} />
              </div>
            ))}
          </div>
        </div>

        {showFullPile && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ background: '#1a4a38', padding: '30px', border: '2px solid white', borderRadius: '10px', textAlign: 'center', width: '80%', maxWidth: '800px', boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '24px' }}>Discarded Cards ({gameState.discardPile.length})</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', maxHeight: '50vh', overflowY: 'auto', padding: '10px' }}>
                {gameState.discardPile.map((c, i) => <StaticCard key={i} card={c} width="80px" height="120px" />)}
              </div>
              <div onClick={() => setShowFullPile(false)} style={{ display: 'inline-block', marginTop: '25px', padding: '10px 30px', cursor: 'pointer', background: '#ffd700', color: 'black', fontWeight: 'bold', borderRadius: '5px', fontSize: '16px' }}>Close</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {renderGameContent()}
      <div style={{
        position: 'fixed', 
        bottom: isMobile ? '0' : '20px', 
        left: isMobile ? '0' : '20px', 
        width: isMobile ? '100vw' : `${260 * uiScale}px`, 
        height: isChatOpen ? (isMobile ? '40vh' : `${300 * uiScale}px`) : `${35 * uiScale}px`, 
        backgroundColor: 'rgba(0,0,0,0.85)', 
        border: '1px solid rgba(255,255,255,0.2)', 
        borderRadius: isMobile ? '15px 15px 0 0' : '10px', 
        display: 'flex', flexDirection: 'column', zIndex: 9000, boxShadow: '0 -4px 15px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(5px)', transition: 'height 0.3s ease', overflow: 'hidden'
      }}>
        <div 
          onClick={() => setIsChatOpen(!isChatOpen)}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '8px 12px', fontSize: `${12 * uiScale}px`, fontWeight: 'bold', color: '#ffd700', borderBottom: isChatOpen ? '1px solid rgba(255,255,255,0.1)' : 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>💬 Game Chat</span>
          <span>{isChatOpen ? '▼' : '▲'}</span>
        </div>
        
        {isChatOpen && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chatMessages.map((m, i) => (
                <div key={i} style={{ fontSize: `${12 * uiScale}px`, color: 'white', lineHeight: '1.4', wordWrap: 'break-word' }}>
                  <span style={{ color: m.sender === 'System' ? '#aaa' : '#4CAF50', fontWeight: 'bold' }}>{m.sender}:</span> {m.text}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendChat} style={{ display: 'flex', padding: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <input 
                value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type a message..." 
                style={{ flex: 1, padding: '6px 10px', borderRadius: '5px', border: 'none', outline: 'none', fontSize: `${12 * uiScale}px`, backgroundColor: 'rgba(255,255,255,0.9)', color: 'black' }} 
              />
              <button type="submit" style={{ marginLeft: '8px', padding: '6px 12px', background: '#ffd700', color: 'black', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: `${12 * uiScale}px` }}>Send</button>
            </form>
          </>
        )}
      </div>
    </>
  );
}

export default App;