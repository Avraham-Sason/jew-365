// Inject global keyframes + scrollbar styles
const _s = document.createElement('style');
_s.textContent = `
  @keyframes stampIn {
    0%   { opacity:0; transform:translate(-50%,-50%) scale(2.8) rotate(-18deg); }
    20%  { opacity:1; transform:translate(-50%,-50%) scale(1.06) rotate(-12deg); }
    72%  { opacity:1; transform:translate(-50%,-50%) scale(1)    rotate(-12deg); }
    100% { opacity:0; transform:translate(-50%,-50%) scale(0.96) rotate(-12deg); }
  }
  @keyframes slideUp {
    from { opacity:0; transform:translateY(7px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  .hifi-scroll::-webkit-scrollbar { width:3px; }
  .hifi-scroll::-webkit-scrollbar-thumb { background:rgba(128,128,128,0.18); border-radius:2px; }
`;
document.head.appendChild(_s);

/* ─── THEME TOKENS ─── */
const T_LIGHT = {
  bg:'#F5EFE4', surface:'#FFFFFF', surface2:'#EDE7DB',
  text:'#1C2B4A', textSub:'#6A7280', textMuted:'#A8B0B8',
  border:'#DDD5C5',
  gold:'#C9922A', goldLight:'#FDF0D8',
  urgent:'#D63030', urgentBg:'#FEF2F2', urgentBorder:'#FECACA',
  warning:'#D97020', safe:'#0F9060',
  headerBg:'#1C2B4A', headerText:'#FFFFFF', headerSub:'rgba(255,255,255,0.55)',
  tabBg:'#FFFFFF', tabBorder:'#EDE7DB',
  shadow:'rgba(28,43,74,0.09)', shadowStrong:'rgba(28,43,74,0.20)',
  bezel:'#111827',
};
const T_DARK = {
  bg:'#0D1925', surface:'#18293C', surface2:'#1F3347',
  text:'#EDE7DB', textSub:'#7A8A99', textMuted:'#445566',
  border:'#253547',
  gold:'#D4A030', goldLight:'#2A2010',
  urgent:'#EF4444', urgentBg:'#2A1515', urgentBorder:'#7F1D1D',
  warning:'#F59E0B', safe:'#10B981',
  headerBg:'#091420', headerText:'#EDE7DB', headerSub:'rgba(237,231,219,0.45)',
  tabBg:'#18293C', tabBorder:'#253547',
  shadow:'rgba(0,0,0,0.30)', shadowStrong:'rgba(0,0,0,0.55)',
  bezel:'#050D18',
};
window.T_LIGHT = T_LIGHT;
window.T_DARK  = T_DARK;

/* ─── APP LOGO ─── */
function AppLogo({ size = 32, isDark = false }) {
  const fill   = isDark ? '#D4A030' : '#1C2B4A';
  const stroke = isDark ? '#0D1925' : '#C9922A';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill={fill}/>
      <polygon points="24,8 37,31 11,31"  fill="none" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round"/>
      <polygon points="24,40 11,17 37,17" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round"/>
      <path d="M19.5,24.5 L22.5,27.5 L28.5,21" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ─── PHONE SHELL ─── */
function PhoneShell({ children, t }) {
  return (
    <div style={{
      width:290, height:584,
      background:t.bezel,
      borderRadius:46, padding:6,
      boxShadow:`0 28px 72px ${t.shadowStrong}, 0 0 0 1px rgba(255,255,255,0.06)`,
      flexShrink:0, position:'relative',
    }}>
      {/* Dynamic island */}
      <div style={{
        position:'absolute', top:18, left:'50%', transform:'translateX(-50%)',
        width:88, height:26, background:t.bezel, borderRadius:13, zIndex:20,
      }}/>
      <div style={{
        width:'100%', height:'100%', background:t.bg,
        borderRadius:40, overflow:'hidden',
        display:'flex', flexDirection:'column',
        direction:'rtl', fontFamily:'Heebo, sans-serif',
      }}>
        {children}
      </div>
    </div>
  );
}

/* ─── STATUS BAR ─── */
function StatusBar({ t }) {
  return (
    <div style={{
      height:46, paddingTop:14, paddingInline:22,
      display:'flex', justifyContent:'space-between', alignItems:'center',
      fontSize:11, fontWeight:600, color:t.textMuted,
      background:t.bg, flexShrink:0,
    }}>
      <span>9:41</span>
      <span>●●● ▐ ▓</span>
    </div>
  );
}

/* ─── NAV BAR ─── */
function NavBar({ t, title, subtitle, right, left, isDark }) {
  return (
    <div style={{
      background:t.headerBg, paddingInline:18, paddingBlock:12,
      display:'flex', alignItems:'center', gap:10, flexShrink:0,
    }}>
      {right !== undefined ? right : <AppLogo size={28} isDark={isDark}/>}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:t.headerText, lineHeight:1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize:10, color:t.headerSub, marginTop:1 }}>{subtitle}</div>}
      </div>
      {left}
    </div>
  );
}

/* ─── BOTTOM TABS ─── */
function BottomTabs({ t, active = 0, onTab }) {
  const HomeIcon = () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
  const CalIcon = () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 2V6M16 2V6M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
  const ListIcon = () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path d="M9 6H20M9 12H20M9 18H20M4 6H4.01M4 12H4.01M4 18H4.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
  const tabs = [
    { label:'בית',   Icon:HomeIcon },
    { label:'לוח',   Icon:CalIcon  },
    { label:'מצוות', Icon:ListIcon },
  ];
  return (
    <div style={{
      height:58, background:t.tabBg, borderTop:`1px solid ${t.tabBorder}`,
      display:'flex', flexShrink:0,
    }}>
      {tabs.map((tab, i) => (
        <button key={i} onClick={() => onTab?.(i)} style={{
          flex:1, display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', gap:3,
          border:'none', background:'none', cursor:'pointer',
          color: i === active ? t.gold : t.textMuted,
          transition:'color 0.18s', padding:0,
        }}>
          <tab.Icon/>
          <span style={{ fontSize:10, fontWeight: i===active ? 700 : 400, fontFamily:'Heebo' }}>{tab.label}</span>
          {i === active && (
            <div style={{ width:18, height:3, borderRadius:2, background:t.gold, marginTop:-1 }}/>
          )}
        </button>
      ))}
    </div>
  );
}

/* ─── TIME RIBBON ─── */
function TimeRibbon({ pct, timeLeft, t }) {
  const p   = typeof pct === 'number' ? pct : 0.5;
  const col = p > 0.5 ? t.safe : p > 0.25 ? t.warning : t.urgent;
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:11, color:col, fontWeight:600 }}>נותר: {timeLeft}</span>
        <span style={{ fontSize:10, color:t.textMuted }}>{Math.round(p*100)}%</span>
      </div>
      <div style={{ height:5, background:t.surface2, borderRadius:4, overflow:'hidden' }}>
        <div style={{
          width:`${p*100}%`, height:'100%', background:col,
          borderRadius:4, transition:'width 0.4s ease',
        }}/>
      </div>
    </div>
  );
}

/* ─── MITZVAH CARD ─── */
function MitzvahCard({ name, timeLeft, pct, urgent, t, onComplete, stamping, done }) {
  const bg  = done ? t.surface2 : urgent ? t.urgentBg : t.surface;
  const bdr = done ? t.border   : urgent ? t.urgentBorder : t.border;
  const Checkmark = ({ color='white', w=1.8 }) => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 6.5L5 9.5L11 3.5" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  return (
    <div style={{
      background:bg, borderRadius:16, border:`1px solid ${bdr}`,
      padding:'13px 14px', marginBottom:10,
      boxShadow: done ? 'none' : `0 2px 14px ${t.shadow}`,
      position:'relative', overflow:'hidden',
      opacity: done ? 0.55 : 1,
      transition:'opacity 0.4s',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
        <div style={{
          width:38, height:38, borderRadius:12, flexShrink:0,
          background: done ? t.surface2 : t.goldLight,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:17, color: done ? t.textMuted : t.gold,
          transition:'all 0.3s',
        }}>✦</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{
            fontSize:14, fontWeight:700, color: done ? t.textSub : t.text,
            lineHeight:1.3, textDecoration: done ? 'line-through' : 'none',
          }}>{name}</div>
          {urgent && !done && <div style={{ fontSize:10, color:t.urgent, fontWeight:600, marginTop:2 }}>⚠ פוג בקרוב</div>}
          {done  && <div style={{ fontSize:10, color:t.safe, fontWeight:600, marginTop:2 }}>✓ הושלם</div>}
        </div>
        {!done ? (
          <button onClick={onComplete} style={{
            width:30, height:30, borderRadius:9, flexShrink:0,
            border:`2px solid ${urgent ? t.urgent : t.border}`,
            background:'transparent', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all 0.18s',
          }}>
            <Checkmark color={urgent ? t.urgent : t.textMuted}/>
          </button>
        ) : (
          <div style={{
            width:30, height:30, borderRadius:9, flexShrink:0,
            background:t.gold, border:`2px solid ${t.gold}`,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Checkmark color="white"/>
          </div>
        )}
      </div>
      {!done && <TimeRibbon pct={pct} timeLeft={timeLeft} t={t}/>}
      {stamping && (
        <div style={{
          position:'absolute', inset:0, display:'flex',
          alignItems:'center', justifyContent:'center',
          pointerEvents:'none', background:`${bg}BB`,
        }}>
          <div style={{
            border:`3px solid ${t.gold}`, color:t.gold,
            fontSize:21, fontWeight:900,
            padding:'5px 18px', borderRadius:6,
            transform:'rotate(-12deg)',
            fontFamily:'Heebo, sans-serif', letterSpacing:3,
            whiteSpace:'nowrap',
            animation:'stampIn 1.3s ease forwards',
            boxShadow:`0 0 0 3px ${t.goldLight}`,
          }}>נעשה!</div>
        </div>
      )}
    </div>
  );
}

/* ─── SCREEN SECTION LABEL ─── */
function ScreenSection({ label, t, right }) {
  return (
    <div style={{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      paddingInline:18, paddingTop:14, paddingBottom:6,
    }}>
      <span style={{ fontSize:11, fontWeight:700, color:t.textSub, letterSpacing:0.8 }}>{label}</span>
      {right && <span style={{ fontSize:11, color:t.gold, fontWeight:600 }}>{right}</span>}
    </div>
  );
}

/* ─── COMPLETED ROW ─── */
function CompletedRow({ name, time, t }) {
  const Tick = () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M1.5 5.5L4 8L9.5 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12,
      paddingInline:18, paddingBlock:9,
      borderBottom:`1px solid ${t.border}`,
      animation:'slideUp 0.3s ease',
    }}>
      <div style={{
        width:24, height:24, borderRadius:7, background:t.gold,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
      }}>
        <Tick/>
      </div>
      <span style={{ flex:1, fontSize:13, color:t.textSub, textDecoration:'line-through' }}>{name}</span>
      <span style={{ fontSize:11, color:t.textMuted }}>{time}</span>
    </div>
  );
}

Object.assign(window, {
  T_LIGHT, T_DARK,
  AppLogo, PhoneShell, StatusBar, NavBar, BottomTabs,
  TimeRibbon, MitzvahCard, ScreenSection, CompletedRow,
});
