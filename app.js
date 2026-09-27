(() => {
/* ---------- constants ---------- */
/* ---------- test mode ----------
   Add ?date=2026-10-01 to the page address to pretend it's that day.
   Test mode keeps its own save (separate from your real game) and cloud sync is off. */
const TEST_DATE = (() => {
  const v = new URLSearchParams(location.search).get("date");
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 ? dt : null;
})();
function clock(){
  if (!TEST_DATE) return new Date();
  const n = new Date(), t = new Date(TEST_DATE);
  t.setHours(n.getHours(), n.getMinutes(), n.getSeconds());
  return t;
}

const now0 = clock();
const YEAR = now0.getMonth() === 11 ? now0.getFullYear() + 1 : now0.getFullYear();
const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const FIRST_OFFSET = (new Date(YEAR, 9, 1).getDay() + 6) % 7; // Monday-first

const SAMPLE_PROMPTS = ["Lantern","Moth","Crooked house","Teacup","Fog","Key","Mushroom","Raven","Candle","Map","Bones","Umbrella","Potion","Owl","Clockwork","Harvest","Mask","Spider","Lighthouse","Broom","Ghost ship","Feather","Cauldron","Fox","Midnight snack","Portrait","Scarecrow","Comet","Bats","Treasure","Costume"];

const MODS = [
  {id:"e1",t:"Only three colours",tier:"easy"},
  {id:"e2",t:"Use a pen you rarely reach for",tier:"easy"},
  {id:"e3",t:"Hide a pumpkin somewhere",tier:"easy"},
  {id:"e4",t:"Add hand lettering",tier:"easy"},
  {id:"e5",t:"Draw it tiny, under 5 cm",tier:"easy"},
  {id:"e6",t:"Include a cat",tier:"easy"},
  {id:"e7",t:"Give it a dramatic shadow",tier:"easy"},
  {id:"e8",t:"Use a photo you took as reference",tier:"easy"},
  {id:"m1",t:"20-minute timer",tier:"medium"},
  {id:"m2",t:"Straight to ink, no pencil",tier:"medium"},
  {id:"m3",t:"Straight lines only",tier:"medium"},
  {id:"m4",t:"Bird's-eye view",tier:"medium"},
  {id:"m5",t:"One colour only",tier:"medium"},
  {id:"m6",t:"Mash it up with yesterday's prompt",tier:"medium"},
  {id:"m7",t:"Turn it into a character",tier:"medium"},
  {id:"m8",t:"Fill the page edge to edge",tier:"medium"},
  {id:"h1",t:"Non-dominant hand",tier:"hard"},
  {id:"h2",t:"10-minute timer",tier:"hard"},
  {id:"h3",t:"One continuous line",tier:"hard"},
  {id:"h4",t:"Stippling only, dots all the way",tier:"hard"},
  {id:"h5",t:"Negative space only",tier:"hard"},
  {id:"h6",t:"Circles and triangles only",tier:"hard"},
  {id:"h7",t:"Draw it upside down",tier:"hard"},
];
const MOD = Object.fromEntries(MODS.map(m => [m.id, m]));
const TIER_XP = {easy:25, medium:50, hard:75};

const LEVELS = [[0,"Doodler"],[250,"Scribbler"],[600,"Sketcher"],[1050,"Inker"],[1600,"Line Tamer"],[2250,"Illustrator"],[3000,"Night Artist"],[3900,"Ink Witch"],[4900,"Master of Marks"],[6000,"Drawtober Legend"]];

const WEEKENDS = [];
for (let d=1; d<=31; d++){ const w = new Date(YEAR,9,d).getDay(); if (w===0||w===6) WEEKENDS.push(d); }

/* ---------- state ---------- */
const blank = () => ({v:1, prompts:null, days:{}, rolls:{}});
let state = blank();

/* ---------- date helpers ---------- */
const pad = n => String(n).padStart(2,"0");
const isoToday = () => { const n = clock(); return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`; };
function todayIndex(){ // 0 = before October, 1..31 in October, 32 = after
  const n = clock();
  if (n.getFullYear() < YEAR || (n.getFullYear()===YEAR && n.getMonth() < 9)) return 0;
  if (n.getFullYear()===YEAR && n.getMonth()===9) return n.getDate();
  return 32;
}
function daysUntilStart(){
  const n = clock(); const a = new Date(n.getFullYear(),n.getMonth(),n.getDate()); const b = new Date(YEAR,9,1);
  return Math.round((b-a)/864e5);
}
const weekday = d => new Date(YEAR,9,d).toLocaleDateString(undefined,{weekday:"long"});

/* ---------- derived ---------- */
const prompts = () => (state.prompts && state.prompts.length ? state.prompts : SAMPLE_PROMPTS);
const promptFor = d => prompts()[d-1] || "Free choice";
const day = d => state.days[d];
function streakEndingAt(d){ let s=0; for (let k=d; k>=1 && state.days[k]?.onTime; k--) s++; return s; }
function currentStreak(){
  const t = Math.min(todayIndex(), 31); if (!t) return 0;
  return state.days[t]?.onTime ? streakEndingAt(t) : streakEndingAt(t-1);
}
function bestStreak(){ let best=0,run=0; for (let d=1; d<=31; d++){ run = state.days[d]?.onTime ? run+1 : 0; best=Math.max(best,run);} return best; }
const totalXP = () => Object.values(state.days).reduce((a,x)=>a+(x.xp||0),0);
const doneCount = () => Object.keys(state.days).length;
const diceBeaten = () => Object.values(state.days).reduce((a,x)=>a+(x.honoured?.length||0),0);
function levelInfo(xp){
  let i=0; while (i+1<LEVELS.length && xp>=LEVELS[i+1][0]) i++;
  const [base,name]=LEVELS[i]; const next = LEVELS[i+1]?.[0];
  return {n:i+1, name, base, next, pct: next ? (xp-base)/(next-base)*100 : 100};
}

const BADGES = [
  {id:"first",name:"First Mark",desc:"Log your first drawing",test:()=>doneCount()>=1,shape:"dot"},
  {id:"s3",name:"Hat Trick",desc:"3 days in a row",test:()=>bestStreak()>=3,shape:"tri"},
  {id:"s7",name:"Week Warrior",desc:"7-day streak",test:()=>bestStreak()>=7,shape:"shield"},
  {id:"s14",name:"Fortnight of Ink",desc:"14-day streak",test:()=>bestStreak()>=14,shape:"star"},
  {id:"half",name:"Halfway Hex",desc:"16 drawings logged",test:()=>doneCount()>=16,shape:"half"},
  {id:"hard",name:"Daredevil",desc:"Beat a hard die",test:()=>Object.values(state.days).some(x=>x.honoured?.some(id=>MOD[id]?.tier==="hard")),shape:"bolt"},
  {id:"double",name:"Double Trouble",desc:"Beat two dice in one day",test:()=>Object.values(state.days).some(x=>(x.honoured?.length||0)>=2),shape:"dice"},
  {id:"dice10",name:"Dice Addict",desc:"Beat 10 dice in total",test:()=>diceBeaten()>=10,shape:"dice"},
  {id:"comeback",name:"Comeback",desc:"Catch up a missed day",test:()=>Object.values(state.days).some(x=>!x.onTime),shape:"arrow"},
  {id:"notes",name:"Sketchbook Diary",desc:"Write notes on 5 days",test:()=>Object.values(state.days).filter(x=>x.note&&x.note.trim()).length>=5,shape:"page"},
  {id:"weekend",name:"Weekend Warrior",desc:"Draw every October weekend day",test:()=>WEEKENDS.every(d=>state.days[d]),shape:"sun"},
  {id:"hallow",name:"Hallowe'en Hero",desc:"Draw day 31 on the 31st",test:()=>!!state.days[31]?.onTime,shape:"moon"},
  {id:"all",name:"Finisher",desc:"All 31 drawings logged",test:()=>doneCount()>=31,shape:"crown"},
  {id:"unbroken",name:"Unbroken",desc:"All 31 on time",test:()=>bestStreak()>=31,shape:"crown"},
];
const earnedBadges = () => BADGES.filter(b=>b.test()).map(b=>b.id);

function badgeSVG(shape, color){
  const s = `fill="${color}"`;
  const paths = {
    dot:`<circle cx="20" cy="20" r="9" ${s}/>`,
    tri:`<path d="M20 8 32 30H8z" ${s}/>`,
    shield:`<path d="M20 7 31 11v9c0 7-5 11-11 13-6-2-11-6-11-13v-9z" ${s}/>`,
    star:`<path d="M20 6l4 9 10 1-7.5 6.5L29 33l-9-5-9 5 2.5-10.5L6 16l10-1z" ${s}/>`,
    half:`<path d="M20 8a12 12 0 0 1 0 24z" ${s}/><circle cx="20" cy="20" r="12" fill="none" stroke="${color}" stroke-width="2.5"/>`,
    bolt:`<path d="M22 6 10 23h8l-2 11 12-17h-8z" ${s}/>`,
    dice:`<rect x="9" y="9" width="22" height="22" rx="5" ${s}/><circle cx="15" cy="15" r="2.2" fill="var(--surface)"/><circle cx="25" cy="25" r="2.2" fill="var(--surface)"/><circle cx="20" cy="20" r="2.2" fill="var(--surface)"/>`,
    arrow:`<path d="M28 20a8 8 0 1 1-3-6.2V10h3v8h-8v-3h3.4A5 5 0 1 0 25 20z" ${s}/>`,
    page:`<path d="M12 7h12l6 6v20H12z" ${s}/><path d="M16 19h10M16 24h10M16 29h6" stroke="var(--surface)" stroke-width="2"/>`,
    sun:`<circle cx="20" cy="20" r="6" ${s}/><g stroke="${color}" stroke-width="2.5" stroke-linecap="round"><path d="M20 6v4M20 30v4M6 20h4M30 20h4M10 10l3 3M27 27l3 3M10 30l3-3M27 13l3-3"/></g>`,
    moon:`<path d="M26 8a13 13 0 1 0 6 20A11 11 0 0 1 26 8z" ${s}/>`,
    crown:`<path d="M8 28 6 12l8 6 6-10 6 10 8-6-2 16z" ${s}/>`,
  };
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${paths[shape]}</svg>`;
}

/* ---------- storage ---------- */
// Everything lives in this browser's localStorage. Use "Download backup" to keep a copy.
const LS_KEY = TEST_DATE ? "drawtober-quest-test" : "drawtober-quest-v1";
const saveState = document.getElementById("saveState");
function lsRead(){ try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
const listeners = [];
function persist(){
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    saveState.textContent = "Saved in this browser";
  } catch {
    saveState.textContent = "Not saved";
    toast("Couldn't save. Your browser may be blocking storage for this page.");
  }
  listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
}
function normalise(s){
  const b = blank();
  if (!s || typeof s !== "object") return b;
  return {v:1, prompts:Array.isArray(s.prompts)?s.prompts:null, days:s.days||{}, rolls:s.rolls||{}};
}

/* ---------- UI helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let toastTimer;
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),Math.max(3200,msg.length*70)); }
const DIE_ICON = `<svg class="dieicon" viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7" cy="7" r="1.6" fill="currentColor"/><circle cx="13" cy="13" r="1.6" fill="currentColor"/><circle cx="13" cy="7" r="1.6" fill="currentColor"/><circle cx="7" cy="13" r="1.6" fill="currentColor"/></svg>`;

let selected = Math.min(Math.max(todayIndex(),1),31);
let logOpen = false, confirmUndo = false, confirmReset = false;
let practice = {mods:[], rerolls:{}}; // pre-October, not saved

/* ---------- XP calc ---------- */
function calcXP(d, honoured){
  const onTime = d === todayIndex();
  const base = onTime ? 100 : 60;
  const bonus = honoured.reduce((a,id)=>a+(TIER_XP[MOD[id]?.tier]||0),0);
  const streakBefore = onTime ? streakEndingAt(d-1) : 0;
  const mult = onTime ? 1 + Math.min(streakBefore,5)*0.1 : 1;
  const hallow = (onTime && d===31) ? 50 : 0;
  return {onTime, base, bonus, streakBefore, mult, hallow, xp: Math.round((base+bonus)*mult)+hallow};
}

/* ---------- render ---------- */
function render(){
  renderHUD(); renderDay(); renderCal(); renderBadges();
  $("yearLbl").textContent = YEAR;
  const isSample = !(state.prompts && state.prompts.length);
  const pi = $("promptInput");
  if (document.activeElement !== pi) pi.value = prompts().join("\n");
  $("resetAllRow").innerHTML = confirmReset
    ? `<span>This wipes every logged drawing, roll and badge.</span><button class="btn danger" id="resetYes">Yes, reset everything</button><button class="btn ghost" id="resetNo">Keep my progress</button>`
    : `<button class="btn danger" id="resetAll">Reset all progress</button>`;
}

function renderHUD(){
  const xp = totalXP(), L = levelInfo(xp);
  $("lvlNum").innerHTML = `<small>Lvl</small>${L.n}`;
  $("lvlName").textContent = L.name;
  $("xpText").textContent = L.next ? `${xp.toLocaleString()} / ${L.next.toLocaleString()} XP` : `${xp.toLocaleString()} XP · max level`;
  $("xpBar").style.width = Math.min(100,L.pct).toFixed(1)+"%";
  $("xpBarWrap").setAttribute("aria-valuenow", Math.round(L.pct));
  $("stStreak").textContent = currentStreak();
  $("stBest").textContent = bestStreak();
  $("stDone").textContent = doneCount();
  $("stDice").textContent = diceBeaten();
  $("stBadges").textContent = `${earnedBadges().length}/${BADGES.length}`;
}

function dieHTML(id, idx, canReroll, rollingText){
  if (rollingText){
    return `<div class="die filled rolling ${rollingText.tier}"><div class="t">${esc(rollingText.t)}</div><div class="meta"><span class="tier">rolling…</span></div></div>`;
  }
  if (!id) return `<div class="die empty">Empty die slot</div>`;
  const m = MOD[id];
  return `<div class="die filled ${m.tier}">
    <div class="t">${esc(m.t)}</div>
    <div class="meta"><span class="tier">${m.tier} · +${TIER_XP[m.tier]} XP</span>
    ${canReroll!==null ? `<button class="linkbtn" data-reroll="${idx}" ${canReroll?"":"disabled"}>${canReroll?"Reroll once":"Rerolled"}</button>`:""}</div>
  </div>`;
}

function renderDay(){
  const t = todayIndex(), d = selected, rec = day(d);
  const card = $("dayCard");
  const isSample = !(state.prompts && state.prompts.length);
  const preOct = t === 0;
  const isFuture = d > t;
  const isToday = d === t;
  const missed = !rec && d < t;
  let status;
  if (rec) status = rec.onTime ? `<span class="pill gold">Done on the day</span>` : `<span class="pill muted">Caught up on ${esc(rec.at)}</span>`;
  else if (isToday) status = `<span class="pill gold">Today's prompt</span>`;
  else if (missed) status = `<span class="pill muted">Missed, catch up for 60 XP base</span>`;
  else if (preOct) status = `<span class="pill muted">Starts in ${daysUntilStart()} day${daysUntilStart()===1?"":"s"}</span>`;
  else status = `<span class="pill muted">Unlocks ${weekday(d)} ${d} Oct</span>`;

  let html = `<div class="card-head"><span class="day-no">Day ${pad(d)} · ${weekday(d)}</span>${status}</div>`;
  if (isSample) html += `<div class="banner"><span><b>Sample prompts.</b> Paste your own list in the Prompts &amp; data section.</span><button class="linkbtn" id="gotoSettings">Add my prompts</button></div>`;
  html += `<div class="prompt">${esc(promptFor(d))}</div>`;

  if (rec){
    html += `<div class="done-box"><span class="label">Earned</span><span class="big">+${rec.xp} XP</span>
      <span class="status-line">${rec.honoured?.length ? "Dice beaten: "+rec.honoured.map(id=>esc(MOD[id]?.t||id)).join(", ") : "No dice this time."}</span>
      ${rec.note ? `<span class="status-line">“${esc(rec.note)}”</span>`:""}</div>`;
    html += confirmUndo
      ? `<div class="inline-confirm"><span>Remove this drawing and its ${rec.xp} XP?</span><button class="btn danger" id="undoYes">Remove it</button><button class="btn ghost" id="undoNo">Keep it</button></div>`
      : `<div class="actions"><button class="btn ghost" id="undoBtn">Undo this log</button></div>`;
  } else if (isFuture && !preOct){
    html += `<p class="status-line" style="margin:0">Come back on ${weekday(d)} ${d} October to roll the dice and log this one.</p>`;
  } else {
    const practising = preOct;
    const roll = practising ? practice : (state.rolls[d] || {mods:[],rerolls:{}});
    const mods = roll.mods || [];
    const canRoll = mods.length < 2 && !logOpen;
    html += `<div class="dice-tray"><div class="card-head"><span class="label">${practising?"Practice dice (not saved)":"Challenge dice"}</span><span class="label">${mods.length}/2 rolled</span></div>
      <div class="dice" id="diceRow">${[0,1].map(i=>dieHTML(mods[i],i, mods[i] ? (logOpen ? null : !roll.rerolls?.[i]) : null)).join("")}</div></div>`;
    if (practising){
      html += `<p class="status-line" style="margin:0">Drawtober starts on Thursday 1 October. Try the dice now to see what you might get.</p>
        <div class="actions"><button class="btn primary" id="rollBtn" ${canRoll?"":"disabled"}>${DIE_ICON} Roll a die</button>${mods.length?`<button class="btn ghost" id="clearPractice">Clear practice dice</button>`:""}</div>`;
    } else if (!logOpen){
      html += `<div class="actions"><button class="btn ghost" id="rollBtn" ${canRoll?"":"disabled"}>${DIE_ICON} Roll a die</button><button class="btn primary" id="openLog">I drew it!</button></div>`;
    } else {
      html += `<div class="log"><span class="label">Log your drawing</span>
        ${mods.length ? mods.map(id=>`<label class="check"><input type="checkbox" data-hon="${id}" checked> I did “${esc(MOD[id].t)}” (+${TIER_XP[MOD[id].tier]})</label>`).join("") : `<span class="status-line">No dice rolled. You can still log it for base XP.</span>`}
        <textarea id="noteInput" rows="2" placeholder="Optional note: medium, time spent, what you'd try next"></textarea>
        <div class="xp-preview" id="xpPreview"></div>
        <div class="actions"><button class="btn primary" id="confirmLog">Log drawing</button><button class="btn ghost" id="cancelLog">Cancel</button></div></div>`;
    }
  }
  card.innerHTML = html;
  if (logOpen) updatePreview();
}

function honouredNow(){ return [...document.querySelectorAll("[data-hon]")].filter(c=>c.checked).map(c=>c.dataset.hon); }
function updatePreview(){
  const el = $("xpPreview"); if (!el) return;
  const c = calcXP(selected, honouredNow());
  const parts = [`Base ${c.base}`];
  if (c.bonus) parts.push(`Dice +${c.bonus}`);
  if (c.mult>1) parts.push(`Streak ×${c.mult.toFixed(1)}`);
  if (c.hallow) parts.push(`Hallowe'en +50`);
  el.innerHTML = `<span class="total">+${c.xp} XP</span><span>${parts.join(" · ")}</span>`;
}

function renderCal(){
  const t = todayIndex(); let html = DOW.map(x=>`<div class="dow">${x}</div>`).join("");
  for (let i=0;i<FIRST_OFFSET;i++) html += `<div></div>`;
  for (let d=1; d<=31; d++){
    const rec = day(d); const cls = ["tile"];
    if (rec) cls.push(rec.onTime?"done":"late"); else if (d<t) cls.push("missed"); else if (d>t) cls.push("future");
    if (d===t) cls.push("today"); if (d===selected) cls.push("sel");
    const stamp = rec ? `<span class="stamp">${rec.honoured?.length ? "★".repeat(rec.honoured.length) : "✓"}</span>` : "";
    html += `<button class="${cls.join(" ")}" data-day="${d}" aria-label="Day ${d}: ${esc(promptFor(d))}${rec?", done":""}">${stamp}<span class="d">${d}</span><span class="p">${esc(promptFor(d))}</span></button>`;
  }
  $("cal").innerHTML = html;
  $("calInfo").textContent = t===0 ? `Starts in ${daysUntilStart()} days` : t>31 ? "Finished" : `${Math.max(0,31-t)} days left`;
}

function renderBadges(){
  const got = new Set(earnedBadges());
  $("badgeCount").textContent = `${got.size} of ${BADGES.length}`;
  $("badges").innerHTML = BADGES.map(b=>`<div class="badge ${got.has(b.id)?"got":"locked"}">${badgeSVG(b.shape, got.has(b.id)?"var(--gold)":"var(--ink-3)")}<div><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div></div>`).join("");
}

/* ---------- dice ---------- */
let rolling = false;
function pickMod(exclude){ const pool = MODS.filter(m=>!exclude.includes(m.id)); return pool[Math.floor(Math.random()*pool.length)]; }
function animateRoll(slot, final, done){
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce){ done(); return; }
  rolling = true; let n = 0;
  const row = $("diceRow");
  const iv = setInterval(()=>{
    const m = MODS[Math.floor(Math.random()*MODS.length)];
    const dies = row?.children; if (dies && dies[slot]) dies[slot].outerHTML = dieHTML(null,slot,null,m);
    if (++n > 9){ clearInterval(iv); rolling=false; done(); }
  }, 60);
}
function roll(slotToReroll){
  if (rolling) return;
  const t = todayIndex(), practising = t===0;
  const r = practising ? practice : (state.rolls[selected] ||= {mods:[],rerolls:{}});
  r.rerolls ||= {};
  let slot;
  if (slotToReroll !== undefined){ if (r.rerolls[slotToReroll]) return; slot = slotToReroll; }
  else { if (r.mods.length>=2) return; slot = r.mods.length; }
  const m = pickMod(r.mods.filter((_,i)=>i!==slot).concat(slotToReroll!==undefined ? [r.mods[slot]] : []));
  animateRoll(slot, m, ()=>{
    r.mods[slot] = m.id;
    if (slotToReroll !== undefined) r.rerolls[slot] = true;
    if (!practising) persist();
    render();
  });
}

/* ---------- log / undo ---------- */
function logDrawing(){
  const before = new Set(earnedBadges()), lvlBefore = levelInfo(totalXP()).n;
  const hon = honouredNow();
  const c = calcXP(selected, hon);
  const note = ($("noteInput")?.value || "").trim().slice(0,500);
  state.days[selected] = {at: isoToday(), onTime:c.onTime, mods:(state.rolls[selected]?.mods||[]), honoured:hon, xp:c.xp, note};
  logOpen = false; persist(); render();
  const newB = earnedBadges().filter(id=>!before.has(id));
  const lvlAfter = levelInfo(totalXP());
  let msg = `+${c.xp} XP for “${promptFor(selected)}”`;
  if (lvlAfter.n > lvlBefore){ msg = `Level up! You're now a ${lvlAfter.name}. ` + msg; burst(); }
  else if (newB.length) burst(true);
  if (newB.length) msg += ` · Badge: ${newB.map(id=>BADGES.find(b=>b.id===id).name).join(", ")}`;
  toast(msg);
}

/* ---------- prompts ---------- */
function parsePrompts(text){
  let lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (lines.length===1 && lines[0].includes(",")) lines = lines[0].split(",").map(s=>s.trim()).filter(Boolean);
  lines = lines.map(l=>l.replace(/^(day\s*)?\d{1,2}\s*[.):\-–—]?\s*/i,"").trim()).filter(Boolean);
  return lines.slice(0,31).map(s=>s.slice(0,80));
}

/* ---------- confetti ---------- */
function burst(small){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = $("fx"), ctx = cv.getContext("2d"); const W = cv.width = innerWidth, H = cv.height = innerHeight;
  const cs = getComputedStyle(document.documentElement);
  const cols = ["--accent","--gold","--easy","--hard","--med"].map(v=>cs.getPropertyValue(v).trim());
  const P = Array.from({length: small?50:140}, ()=>({x:W/2,y:H*0.35,vx:(Math.random()-.5)*14,vy:-Math.random()*12-4,r:Math.random()*5+3,c:cols[Math.floor(Math.random()*cols.length)],a:Math.random()*6}));
  let f=0; (function step(){ ctx.clearRect(0,0,W,H);
    P.forEach(p=>{p.vy+=.35;p.x+=p.vx;p.y+=p.vy;p.a+=.2;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle=p.c;ctx.fillRect(-p.r,-p.r/2,p.r*2,p.r);ctx.restore();});
    if (++f<90) requestAnimationFrame(step); else ctx.clearRect(0,0,W,H); })();
}

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("button"); if (!el) return;
  if (el.dataset.day){ selected = +el.dataset.day; logOpen=false; confirmUndo=false; render(); return; }
  if (el.dataset.reroll !== undefined){ roll(+el.dataset.reroll); return; }
  switch (el.id){
    case "rollBtn": roll(); break;
    case "clearPractice": practice = {mods:[],rerolls:{}}; render(); break;
    case "openLog": logOpen = true; render(); break;
    case "cancelLog": logOpen = false; render(); break;
    case "confirmLog": logDrawing(); break;
    case "undoBtn": confirmUndo = true; render(); break;
    case "undoNo": confirmUndo = false; render(); break;
    case "undoYes": delete state.days[selected]; confirmUndo=false; persist(); render(); toast("Log removed"); break;
    case "gotoSettings": $("settings").open = true; $("promptInput").focus(); $("settings").scrollIntoView({behavior:"smooth",block:"start"}); break;
    case "savePrompts": {
      const p = parsePrompts($("promptInput").value);
      if (!p.length){ toast("Add at least one prompt, one per line."); break; }
      state.prompts = p; persist(); $("promptInput").blur(); render();
      toast(p.length<31 ? `Saved ${p.length} prompts. Days ${p.length+1}–31 show “Free choice”.` : "Saved 31 prompts");
      break; }
    case "resetPrompts": state.prompts = null; persist(); $("promptInput").blur(); render(); toast("Using sample prompts"); break;
    case "exportBtn": downloadBackup(); break;
    case "importBtn": $("importFile").click(); break;
    case "resetAll": confirmReset = true; render(); break;
    case "resetNo": confirmReset = false; render(); break;
    case "resetYes": state = blank(); confirmReset=false; logOpen=false; persist(); render(); toast("Progress reset"); break;
  }
});
document.addEventListener("change", e => {
  if (e.target.matches("[data-hon]")) updatePreview();
  if (e.target.id === "importFile") importBackup(e.target.files[0]);
});

/* ---------- backup ---------- */
function downloadBackup(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `drawtober-quest-backup-${isoToday()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
function importBackup(file){
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || typeof data !== "object" || !("days" in data)) throw new Error();
      state = normalise(data); persist(); render(); toast("Backup restored");
    } catch { toast("That file isn't a Drawtober Quest backup."); }
    $("importFile").value = "";
  };
  r.readAsText(file);
}

/* ---------- theme ---------- */
// "auto" follows the device setting; "light"/"dark" override it. Saved per browser.
const THEME_KEY = "drawtober-quest-theme";
function applyTheme(choice){
  if (choice === "light" || choice === "dark") document.documentElement.dataset.theme = choice;
  else { choice = "auto"; delete document.documentElement.dataset.theme; }
  document.querySelectorAll("[data-theme-choice]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === choice)));
  return choice;
}
let themeChoice = "auto";
try { themeChoice = localStorage.getItem(THEME_KEY) || "auto"; } catch {}
applyTheme(themeChoice);
document.addEventListener("click", e => {
  const b = e.target.closest("[data-theme-choice]"); if (!b) return;
  const choice = applyTheme(b.dataset.themeChoice);
  try { localStorage.setItem(THEME_KEY, choice); } catch {}
});

/* ---------- bridge for sync.js ---------- */
// sync.js (cloud sync) talks to the game only through this object.
window.drawtoberQuest = {
  testMode: !!TEST_DATE,
  getState: () => JSON.parse(JSON.stringify(state)),
  // Replace the game with a copy from the cloud. Doesn't notify listeners, so it won't echo back.
  replaceState(next){
    state = normalise(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
    if (!logOpen && !rolling) render(); else renderHUD();
  },
  onChange(fn){ listeners.push(fn); },
  setStatus(text){ saveState.textContent = text; },
  toast,
};

/* ---------- test mode banner ---------- */
if (TEST_DATE){
  const shift = n => { const d = new Date(TEST_DATE); d.setDate(d.getDate() + n); return `?date=${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const bar = document.createElement("div");
  bar.className = "banner test-banner";
  bar.innerHTML = `<span><b>Test mode:</b> pretending it's ${TEST_DATE.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"})}. This progress is kept separately from your real game.</span>
    <span class="actions"><a class="linkbtn" href="${shift(-1)}">← Previous day</a><a class="linkbtn" href="${shift(1)}">Next day →</a><a class="linkbtn" href="${location.pathname}">Leave test mode</a></span>`;
  document.querySelector(".wrap").prepend(bar);
}

/* ---------- boot ---------- */
const local = lsRead(); if (local) state = normalise(local);
saveState.textContent = local ? "Saved in this browser" : "Nothing saved yet";
render();
// Move "today" forward when the date changes while the page is open
let lastT = todayIndex();
setInterval(()=>{ const t=todayIndex(); if (t!==lastT){ lastT=t; if (!logOpen) { selected=Math.min(Math.max(t,1),31); render(); } } }, 60000);
})();
