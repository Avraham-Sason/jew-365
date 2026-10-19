const { useState } = React;

/* ══════════════════════════════════════════
   HOME SCREEN
══════════════════════════════════════════ */
function HomeScreen({ t, isDark }) {
  const ALL = [
    { id:'shacharit', name:'תפילת שחרית',  timeLeft:'23 דק׳',    pct:0.18, urgent:true  },
    { id:'tefillin',  name:'הנחת תפילין',  timeLeft:'1:12 שעות', pct:0.36, urgent:false },
    { id:'kshema',    name:'קריאת שמע',    timeLeft:'2:15 שעות', pct:0.58, urgent:false },
  ];
  const INIT_DONE = [
    { id:'brachot', name:'ברכות השחר', time:'07:12' },
    { id:'tzitzit', name:'ציצית',       time:'07:15' },
  ];
  const [active,    setActive]    = useState(ALL.map(m => m.id));
  const [stamping,  setStamping]  = useState(null);
  const [completed, setCompleted] = useState(INIT_DONE);
  const [tab,       setTab]       = useState(0);

  const handleComplete = (id, name) => {
    if (stamping) return;
    setStamping(id);
    setTimeout(() => {
      setActive(p => p.filter(x => x !== id));
      const now  = new Date();
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      setCompleted(p => [{ id, name, time }, ...p]);
      setStamping(null);
    }, 1350);
  };

  const activeMitzvot = ALL.filter(m => active.includes(m.id));
  const total = ALL.length + INIT_DONE.length;

  return (
    <PhoneShell t={t}>
      <StatusBar t={t}/>
      <NavBar t={t} isDark={isDark}
        title="כ״ד ניסן תשפ״ו"
        subtitle="יום שישי · ירושלים"
        left={
          <div style={{
            background:`${t.gold}22`, borderRadius:8,
            paddingInline:8, paddingBlock:4,
            fontSize:11, fontWeight:700, color:t.gold,
          }}>
            {completed.length}/{total}
          </div>
        }
      />
      <div className="hifi-scroll" style={{ flex:1, overflowY:'auto' }}>
        <ScreenSection label="עכשיו — לפי דחיפות" t={t}/>
        <div style={{ paddingInline:14 }}>
          {activeMitzvot.map(m => (
            <MitzvahCard key={m.id} {...m} t={t}
              stamping={stamping === m.id}
              onComplete={() => handleComplete(m.id, m.name)}
            />
          ))}
          {activeMitzvot.length === 0 && (
            <div style={{
              textAlign:'center', padding:'28px 0',
              color:t.textSub, fontSize:13, animation:'fadeIn 0.5s ease',
            }}>
              <div style={{ fontSize:32, marginBottom:10 }}>✦</div>
              כל המצוות הושלמו! 🎉
            </div>
          )}
        </div>
        <ScreenSection label={`הושלמו (${completed.length})`} t={t}/>
        {completed.map(c => (
          <CompletedRow key={c.id} name={c.name} time={c.time} t={t}/>
        ))}
        <div style={{ height:16 }}/>
      </div>
      <BottomTabs t={t} active={tab} onTab={setTab}/>
    </PhoneShell>
  );
}

/* ══════════════════════════════════════════
   SCHEDULE SCREEN
══════════════════════════════════════════ */
function ScheduleScreen({ t, isDark }) {
  const [view, setView] = useState('יום');
  const items = [
    { time:'05:48', name:'עלות השחר',           type:'zman'   },
    { time:'06:18', name:'נץ החמה',              type:'zman'   },
    { time:'07:12', name:'ברכות השחר',           type:'mitzvah', done:true  },
    { time:'07:15', name:'הנחת תפילין',          type:'mitzvah', done:false, urgent:true },
    { time:'07:15', name:'תפילת שחרית',          type:'mitzvah', done:false, urgent:true },
    { time:'09:34', name:'סוף זמן ק"ש (גר"א)',  type:'zman'   },
    { time:'10:42', name:'סוף תפילת שחרית',      type:'zman'   },
    { time:'13:15', name:'מנחה גדולה',           type:'mitzvah', done:false },
    { time:'17:45', name:'פלג המנחה',            type:'zman'   },
    { time:'19:12', name:'שקיעת החמה',           type:'zman'   },
    { time:'19:45', name:'תפילת ערבית',          type:'mitzvah', done:false },
  ];
  const NOW_IDX = 5;
  const Tick = () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M1.5 5.5L4 8L9.5 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  return (
    <PhoneShell t={t}>
      <StatusBar t={t}/>
      <div style={{ background:t.headerBg, paddingInline:18, paddingBottom:12, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:12, marginBottom:10 }}>
          <AppLogo size={26} isDark={isDark}/>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:t.headerText }}>לוח זמנים</div>
            <div style={{ fontSize:10, color:t.headerSub }}>כ״ד ניסן · ירושלים</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:0, background:'rgba(255,255,255,0.08)', borderRadius:10, padding:3 }}>
          {['יום','שבוע','חודש'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              flex:1, padding:'5px 0', borderRadius:7, border:'none', cursor:'pointer',
              background: view===v ? t.gold : 'transparent',
              color: view===v ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize:11, fontWeight:600, fontFamily:'Heebo',
              transition:'all 0.2s',
            }}>{v}</button>
          ))}
        </div>
      </div>
      <div className="hifi-scroll" style={{ flex:1, overflowY:'auto' }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display:'flex', gap:12, alignItems:'flex-start',
            paddingInline:18, paddingBlock:9,
            borderBottom:`1px solid ${t.border}`,
            background: i===NOW_IDX ? `${t.gold}09` : t.surface,
            position:'relative',
          }}>
            {i===NOW_IDX && (
              <div style={{ position:'absolute', right:0, left:0, top:0, height:2, background:t.urgent, opacity:0.5 }}/>
            )}
            <span style={{
              width:36, flexShrink:0, textAlign:'right',
              fontSize:11, color:t.textMuted, paddingTop:2,
              fontVariantNumeric:'tabular-nums',
            }}>{item.time}</span>
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, flex:1, minWidth:0 }}>
              <div style={{
                width:9, height:9, borderRadius:'50%', flexShrink:0, marginTop:4,
                background: item.done ? t.gold : item.urgent ? t.urgent : item.type==='zman' ? 'transparent' : t.textMuted,
                border:`1.5px solid ${item.done ? t.gold : item.urgent ? t.urgent : item.type==='zman' ? t.border : t.textSub}`,
              }}/>
              <div style={{ flex:1 }}>
                <div style={{
                  fontSize:13, lineHeight:1.35,
                  fontWeight: item.type==='mitzvah' ? 600 : 400,
                  color: item.done ? t.textMuted : item.urgent ? t.urgent : item.type==='zman' ? t.textSub : t.text,
                  textDecoration: item.done ? 'line-through' : 'none',
                }}>{item.name}</div>
              </div>
            </div>
            {item.type==='mitzvah' && !item.done && (
              <div style={{
                width:24, height:24, borderRadius:7, flexShrink:0,
                border:`1.5px solid ${item.urgent ? t.urgent : t.border}`,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                {item.urgent && <div style={{ width:7, height:7, borderRadius:'50%', background:t.urgent, opacity:0.35 }}/>}
              </div>
            )}
            {item.done && (
              <div style={{ width:24, height:24, background:t.gold, borderRadius:7, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Tick/>
              </div>
            )}
          </div>
        ))}
        <div style={{ height:14 }}/>
      </div>
      <BottomTabs t={t} active={1}/>
    </PhoneShell>
  );
}

/* ══════════════════════════════════════════
   LIBRARY SCREEN
══════════════════════════════════════════ */
function LibraryScreen({ t }) {
  const MITZVOT = [
    { name:'הנחת תפילין',       cat:'יומית'   },
    { name:'ציצית',             cat:'יומית'   },
    { name:'קריאת שמע שחרית',  cat:'יומית'   },
    { name:'תפילת שחרית',       cat:'יומית'   },
    { name:'תפילת מנחה',        cat:'יומית'   },
    { name:'תפילת ערבית',       cat:'יומית',   off:true },
    { name:'ספירת העומר',       cat:'עונתי'   },
    { name:'הדלקת נרות שבת',   cat:'שבועית',  off:true },
  ];
  const [cat,     setCat]     = useState('הכל');
  const [toggles, setToggles] = useState(Object.fromEntries(MITZVOT.map(m => [m.name, !m.off])));

  const cats     = ['הכל','יומית','שבועית','עונתי'];
  const filtered = cat==='הכל' ? MITZVOT : MITZVOT.filter(m => m.cat===cat);

  return (
    <PhoneShell t={t}>
      <StatusBar t={t}/>
      <NavBar t={t}
        title="מצוות שלי"
        subtitle="נהל מצוות פעילות"
        left={
          <div style={{ width:28, height:28, borderRadius:8, background:t.goldLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:t.gold, cursor:'pointer' }}>＋</div>
        }
      />
      {/* Category pills */}
      <div style={{ paddingInline:14, paddingBlock:'8px 6px', borderBottom:`1px solid ${t.border}`, background:t.surface, flexShrink:0 }}>
        <div style={{ display:'flex', gap:6 }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{
              padding:'5px 12px', borderRadius:20, border:'none', cursor:'pointer',
              background: cat===c ? t.gold : t.surface2,
              color:      cat===c ? '#fff' : t.textSub,
              fontSize:11, fontWeight: cat===c ? 700 : 400,
              fontFamily:'Heebo', transition:'all 0.18s', whiteSpace:'nowrap',
            }}>{c}</button>
          ))}
        </div>
      </div>
      <div className="hifi-scroll" style={{ flex:1, overflowY:'auto', background:t.bg }}>
        {filtered.map((m, i) => {
          const on = toggles[m.name];
          return (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:12,
              paddingInline:18, paddingBlock:12,
              borderBottom:`1px solid ${t.border}`,
              background:t.surface,
            }}>
              <div style={{
                width:40, height:40, borderRadius:12, flexShrink:0,
                background: on ? t.goldLight : t.surface2,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:17, color: on ? t.gold : t.textMuted,
                transition:'all 0.25s',
              }}>✦</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600, color: on ? t.text : t.textMuted, transition:'color 0.2s' }}>{m.name}</div>
                <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>{m.cat}</div>
              </div>
              <div
                onClick={() => setToggles(p => ({ ...p, [m.name]: !p[m.name] }))}
                style={{
                  width:44, height:26, borderRadius:13, flexShrink:0, cursor:'pointer',
                  background: on ? t.gold : t.surface2,
                  border:`1.5px solid ${on ? t.gold : t.border}`,
                  position:'relative', transition:'all 0.2s',
                }}
              >
                <div style={{
                  position:'absolute', top:2, width:20, height:20, borderRadius:'50%',
                  background:'#fff', transition:'left 0.2s',
                  left: on ? 20 : 2, boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
                }}/>
              </div>
            </div>
          );
        })}
        <div style={{ height:14 }}/>
      </div>
      <BottomTabs t={t} active={2}/>
    </PhoneShell>
  );
}

/* ══════════════════════════════════════════
   MITZVAH DETAIL SCREEN
══════════════════════════════════════════ */
function DetailScreen({ t, isDark }) {
  const [reminders, setReminders] = useState([
    { id:1, label:'הגיע זמן הנחת תפילין', anchor:'תחילת הזמן', offset:'+0 דק׳'   },
    { id:2, label:'תזכורת חוזרת',         anchor:'תחילת הזמן', offset:'+90 דק׳'  },
    { id:3, label:'נותרות 45 דקות',       anchor:'סוף הזמן',   offset:'−45 דק׳' },
  ]);

  return (
    <PhoneShell t={t}>
      <StatusBar t={t}/>
      <div style={{ background:t.headerBg, paddingInline:18, paddingBottom:14, flexShrink:0 }}>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', paddingTop:10, marginBottom:8, cursor:'pointer' }}>← מצוות שלי</div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <div style={{ width:46, height:46, borderRadius:14, background:t.goldLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:t.gold, flexShrink:0 }}>✦</div>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:t.headerText }}>הנחת תפילין</div>
            <div style={{ fontSize:10, color:t.headerSub }}>יומית · ממישיכיר עד שקיעה</div>
            <div style={{ fontSize:10, color:t.gold, marginTop:2 }}>ההתראה הבאה: מחר 06:18</div>
          </div>
        </div>
      </div>
      <div className="hifi-scroll" style={{ flex:1, overflowY:'auto', background:t.bg }}>
        {/* Time window card */}
        <div style={{ margin:'14px 14px 10px', background:t.surface, borderRadius:16, padding:14, boxShadow:`0 2px 12px ${t.shadow}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:t.textSub, marginBottom:9 }}>חלון הזמן — מחר</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:7 }}>
            <span style={{ fontSize:10, color:t.textMuted, width:32, textAlign:'right' }}>06:18</span>
            <div style={{ flex:1, height:10, borderRadius:6, overflow:'hidden', background:t.surface2 }}>
              <div style={{ width:'100%', height:'100%', background:`linear-gradient(to left, ${t.urgent}, ${t.warning} 40%, ${t.safe})`, borderRadius:6 }}/>
            </div>
            <span style={{ fontSize:10, color:t.textMuted, width:32 }}>19:12</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:10 }}>
            {[['● בטוח', t.safe],['● זהירות', t.warning],['● דחוף', t.urgent]].map(([l, c]) => (
              <span key={l} style={{ color:c }}>{l}</span>
            ))}
          </div>
        </div>

        {/* Settings card */}
        <div style={{ marginInline:14, marginBottom:10, background:t.surface, borderRadius:16, overflow:'hidden', boxShadow:`0 2px 10px ${t.shadow}` }}>
          {[['נוסח','אשכנז ›'],['מחזור','יומי ›']].map(([k,v], i, arr) => (
            <div key={k} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              paddingInline:16, paddingBlock:12,
              borderBottom: i < arr.length-1 ? `1px solid ${t.border}` : 'none',
              cursor:'pointer',
            }}>
              <span style={{ fontSize:13, fontWeight:600, color:t.text }}>{k}</span>
              <span style={{ fontSize:13, color:t.gold }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Reminders */}
        <div style={{ marginInline:14, background:t.surface, borderRadius:16, overflow:'hidden', boxShadow:`0 2px 10px ${t.shadow}` }}>
          <div style={{ paddingInline:16, paddingBlock:12, borderBottom:`1px solid ${t.border}` }}>
            <span style={{ fontSize:13, fontWeight:700, color:t.text }}>📣 תזכורות</span>
          </div>
          {reminders.map((r, i) => (
            <div key={r.id} style={{
              display:'flex', gap:10, alignItems:'center',
              paddingInline:16, paddingBlock:11,
              borderBottom: i < reminders.length-1 ? `1px solid ${t.border}` : 'none',
            }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500, color:t.text }}>{r.label}</div>
                <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{r.anchor} · {r.offset}</div>
              </div>
              <button onClick={() => setReminders(p => p.filter(x => x.id !== r.id))} style={{
                width:24, height:24, borderRadius:'50%', border:'none',
                background:t.surface2, color:t.textMuted, cursor:'pointer', fontSize:12,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>✕</button>
            </div>
          ))}
          <div style={{
            paddingInline:16, paddingBlock:12, cursor:'pointer',
            display:'flex', alignItems:'center', gap:10,
            borderTop:`1.5px dashed ${t.gold}44`,
          }}>
            <div style={{ width:26, height:26, borderRadius:'50%', background:t.goldLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, color:t.gold }}>＋</div>
            <span style={{ fontSize:13, fontWeight:600, color:t.gold }}>הוסף תזכורת</span>
          </div>
        </div>
        <div style={{ height:20 }}/>
      </div>
    </PhoneShell>
  );
}

/* ══════════════════════════════════════════
   ONBOARDING FLOW
══════════════════════════════════════════ */
function OnboardingFlow({ t, isDark }) {
  const [step, setStep] = useState(0);
  const TOTAL = 4;

  const Dots = () => (
    <div style={{ display:'flex', gap:5, justifyContent:'center', marginTop:8 }}>
      {Array.from({ length:TOTAL }).map((_, i) => (
        <div key={i} style={{
          width: i===step ? 22 : 7, height:7, borderRadius:4,
          background: i===step ? t.gold : t.border,
          transition:'width 0.3s, background 0.3s',
        }}/>
      ))}
    </div>
  );

  const steps = [
    /* 0 — Welcome */
    <div key="w" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 28px', gap:14 }}>
      <AppLogo size={72} isDark={isDark}/>
      <div style={{ fontSize:22, fontWeight:900, color:t.text, textAlign:'center', letterSpacing:-0.5 }}>יהודי 365</div>
      <div style={{ fontSize:13, color:t.textSub, textAlign:'center', lineHeight:1.7 }}>
        אל תפספס שום מצווה —<br/>הזמנים הנכונים, בזמן הנכון
      </div>
      <Dots/>
    </div>,

    /* 1 — Nusach */
    <div key="n" style={{ flex:1, display:'flex', flexDirection:'column', padding:'18px 18px 0', overflow:'hidden' }}>
      <div style={{ fontSize:18, fontWeight:800, color:t.text, marginBottom:3 }}>מה הנוסח שלך?</div>
      <div style={{ fontSize:12, color:t.textSub, marginBottom:14 }}>משפיע על זמני התפילה והחישוב</div>
      <div style={{ display:'flex', flexDirection:'column', gap:8, flex:1, overflowY:'auto' }}>
        {['אשכנז','ספרד','עדות המזרח','חב״ד'].map((n, i) => {
          const sel = i===0;
          return (
            <div key={n} style={{
              padding:'11px 14px', borderRadius:13, cursor:'pointer',
              border:`1.5px solid ${sel ? t.gold : t.border}`,
              background: sel ? t.goldLight : t.surface,
              display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <span style={{ fontSize:14, fontWeight: sel ? 700 : 400, color: sel ? t.gold : t.text }}>{n}</span>
              {sel && (
                <div style={{ width:22, height:22, background:t.gold, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1.5 5.5L4 8L9.5 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Dots/>
    </div>,

    /* 2 — Location */
    <div key="l" style={{ flex:1, display:'flex', flexDirection:'column', padding:'18px 18px 0', justifyContent:'center' }}>
      <div style={{ fontSize:18, fontWeight:800, color:t.text, marginBottom:3 }}>איפה אתה נמצא?</div>
      <div style={{ fontSize:12, color:t.textSub, marginBottom:18 }}>לחישוב זמני ק"ל וק"א מדויקים</div>
      <div style={{ background:t.surface, borderRadius:14, padding:'12px 14px', border:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <span style={{ fontSize:18 }}>📍</span>
        <span style={{ fontSize:13, color:t.textSub }}>ירושלים</span>
        <span style={{ marginRight:'auto', fontSize:11, color:t.gold }}>שנה ›</span>
      </div>
      <div style={{ padding:'13px 14px', borderRadius:14, background:t.goldLight, border:`1.5px solid ${t.gold}`, display:'flex', gap:12, alignItems:'center' }}>
        <span style={{ fontSize:24 }}>🔔</span>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:t.text }}>אפשר התראות</div>
          <div style={{ fontSize:11, color:t.textSub, marginTop:2, lineHeight:1.4 }}>כדי שנוכל להזכיר לך בזמן</div>
        </div>
        <button style={{ marginRight:'auto', padding:'6px 12px', borderRadius:8, border:`1.5px solid ${t.gold}`, background:'transparent', color:t.gold, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Heebo', whiteSpace:'nowrap' }}>אשר</button>
      </div>
      <Dots/>
    </div>,

    /* 3 — Ready */
    <div key="r" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 28px', gap:14 }}>
      <div style={{ width:64, height:64, borderRadius:20, background:t.goldLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:36 }}>✦</div>
      <div style={{ fontSize:19, fontWeight:800, color:t.text, textAlign:'center' }}>הכל מוכן!</div>
      <div style={{ fontSize:13, color:t.textSub, textAlign:'center', lineHeight:1.7 }}>
        מצוות היום כבר מחכות לך —<br/>בהצלחה!
      </div>
      <Dots/>
    </div>,
  ];

  return (
    <PhoneShell t={t}>
      <StatusBar t={t}/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {steps[step]}
      </div>
      <div style={{ padding:'8px 18px 14px', background:t.bg, flexShrink:0 }}>
        <button onClick={() => setStep(s => Math.min(s+1, TOTAL-1))} style={{
          width:'100%', padding:'13px 0', borderRadius:14, border:'none',
          background:t.gold, color:'#fff', fontSize:15, fontWeight:700,
          cursor:'pointer', fontFamily:'Heebo', letterSpacing:0.3,
          transition:'opacity 0.15s', opacity: step===TOTAL-1 ? 0.85 : 1,
        }}>
          {step===0 ? 'בוא נתחיל ←' : step===TOTAL-1 ? 'מעולה! ←' : 'המשך ←'}
        </button>
        {step > 0 && step < TOTAL-1 && (
          <button onClick={() => setStep(s => Math.max(s-1, 0))} style={{
            width:'100%', padding:'7px 0', border:'none', background:'none',
            color:t.textSub, fontSize:12, cursor:'pointer', fontFamily:'Heebo', marginTop:4,
          }}>חזור</button>
        )}
      </div>
    </PhoneShell>
  );
}

Object.assign(window, { HomeScreen, ScheduleScreen, LibraryScreen, DetailScreen, OnboardingFlow });
