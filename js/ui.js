/* DISTORSI — tampilan, input, efek, suara, penyimpanan */
(() => {
  'use strict';
  const E = window.Engine;
  let W = E.W, H = E.H;
  const $ = id => document.getElementById(id);
  const $$ = q => [...document.querySelectorAll(q)];
  const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cv = $('game'), ctx = cv.getContext('2d');
  const STEP = 1 / 60;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LAW = Object.fromEntries(E.LAWS.map(l => [l.id, l]));

  /* ---------- Penyimpanan (divalidasi, tahan data rusak) ---------- */
  const KEY = 'distorsi.v1';
  const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 12) || 'Anonim';
  const validRow = r => r && typeof r === 'object' && typeof r.n === 'string' && r.n.length <= 12 &&
    Number.isFinite(r.s) && r.s >= 0 && r.s < 1e9 && Number.isInteger(r.w) && r.w >= 0 && r.w < 1000;
  function loadStore() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { board: (Array.isArray(o.board) ? o.board.filter(validRow) : []).slice(0, 5).map(r => ({ n: cleanName(r.n), s: r.s, w: r.w })),
               mute: o.mute === true, vib: o.vib !== false, q: ['auto', 'high', 'low'].includes(o.q) ? o.q : 'auto' };
    } catch (_) { return { board: [], mute: false, vib: true, q: 'auto' }; }
  }
  function saveStore() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (_) { /* penyimpanan penuh/ditolak */ } }
  const store = loadStore();

  /* ---------- Audio sintetis ---------- */
  let ac = null, master = null, muted = store.mute;
  const lastSfx = {};
  function audio() {
    if (ac === null) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.22; master.connect(ac.destination); }
      catch (_) { ac = false; }
    }
    return ac || null;
  }
  function tone(f, d, type = 'sine', v = 0.3, slide = 0, gap = 0, key = f) {
    if (muted) return;
    const now = performance.now();
    if (gap && now - (lastSfx[key] || 0) < gap) return;
    lastSfx[key] = now;
    const a = audio(); if (!a) return;
    if (a.state === 'suspended') a.resume();
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.03);
  }
  const sfx = {
    shoot: () => tone(660, .05, 'square', .04, .5, 60, 's'),
    hit: () => tone(220, .06, 'sawtooth', .06, .6, 40, 'h'),
    kill: () => { tone(180, .18, 'sawtooth', .16, .3, 30, 'k'); tone(90, .25, 'sine', .2, .4, 30, 'k2'); },
    dash: () => tone(300, .18, 'triangle', .22, 3),
    hurt: () => { tone(140, .4, 'sawtooth', .35, .3); tone(70, .5, 'square', .25, .5); },
    shard: () => tone(1100, .07, 'sine', .08, 1.5, 40, 'sh'),
    heal: () => { tone(520, .15, 'sine', .25, 1.5); tone(780, .25, 'sine', .2, 1.5); },
    wave: () => { tone(330, .2, 'square', .12, 1.5); setTimeout(() => tone(495, .3, 'square', .12, 1.5), 140); },
    clear: () => { tone(523, .15, 'triangle', .22); setTimeout(() => tone(659, .15, 'triangle', .22), 110); setTimeout(() => tone(784, .3, 'triangle', .22), 220); },
    pick: () => tone(880, .3, 'sine', .25, 2),
    pulse: () => tone(100, .5, 'sine', .3, 2),
    over: () => { tone(200, 1, 'sawtooth', .35, .15); tone(100, 1.2, 'square', .25, .2); },
  };

  /* ---------- Input ---------- */
  const keys = new Set();
  let dashUntil = 0, stick = null;
  const KEYMAP = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd' };
  addEventListener('keydown', e => {
    if (e.repeat) { if (KEYMAP[e.key] || e.key === ' ') e.preventDefault(); return; }
    const k = KEYMAP[e.key];
    if (k) { keys.add(k); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Shift') { dashUntil = performance.now() + 120; e.preventDefault(); }
    else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
    else if (/^[1-3]$/.test(e.key) && !$('cards').hidden) choose(+e.key - 1);
  });
  addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) keys.delete(k); });
  addEventListener('blur', () => { keys.clear(); resetStick(); if (running && !paused) togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running && !paused) togglePause(); });
  document.addEventListener('contextmenu', e => e.preventDefault());

  const tz = $('touch'), stickEl = $('stick'), knob = $('knob'), dashHint = document.querySelector('.dashhint');
  let moveId = null, origin = null;
  const STICK_R = 58;
  function updateStick(ev) {
    let dx = (ev.clientX - origin.x) / STICK_R, dy = (ev.clientY - origin.y) / STICK_R;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    stick = { x: dx, y: dy };
    knob.style.transform = `translate(${dx * 50}px, ${dy * 50}px)`;
  }
  function resetStick() { moveId = null; stick = null; origin = null; stickEl.classList.remove('on'); knob.style.transform = 'translate(0px, 0px)'; }
  tz.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    try { tz.setPointerCapture(ev.pointerId); } catch (_) { /* tidak didukung */ }
    if (ev.clientX < innerWidth * 0.5) {       // sisi kiri: joystick melayang di titik sentuh
      if (moveId !== null) return;
      moveId = ev.pointerId; origin = { x: ev.clientX, y: ev.clientY };
      stickEl.style.left = origin.x + 'px'; stickEl.style.top = origin.y + 'px'; stickEl.classList.add('on');
      updateStick(ev);
    } else {                                   // sisi kanan: ketuk di mana saja = dash
      dashUntil = performance.now() + 120;
      dashHint.classList.add('press'); setTimeout(() => dashHint.classList.remove('press'), 110);
    }
  });
  tz.addEventListener('pointermove', ev => { if (ev.pointerId === moveId) { ev.preventDefault(); updateStick(ev); } });
  const endPtr = ev => { if (ev.pointerId === moveId) resetStick(); };
  tz.addEventListener('pointerup', endPtr); tz.addEventListener('pointercancel', endPtr); tz.addEventListener('lostpointercapture', endPtr);

  function readInput() {
    let x = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0), y = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
    if (stick) { x += stick.x; y += stick.y; }
    return { x, y, dash: performance.now() < dashUntil };
  }

  /* ---------- Kualitas grafis adaptif ---------- */
  let autoLow = false, fpsEma = 60, fpsWarm = 0, LQ = false;
  const lowQ = () => store.q === 'low' || (store.q === 'auto' && autoLow);

  /* ---------- Getar (haptic) ---------- */
  function vib(p) { if (store.vib && navigator.vibrate) { try { navigator.vibrate(p); } catch (_) { /* diabaikan */ } } }

  /* ---------- Layar penuh & orientasi ---------- */
  const docEl = document.documentElement;
  const canFull = !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen);
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  async function enterFull() {
    try { const f = docEl.requestFullscreen || docEl.webkitRequestFullscreen; if (f) await f.call(docEl, { navigationUI: 'hide' }); } catch (_) { /* ditolak */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) { /* tidak didukung */ }
  }
  function exitFull() {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) { /* */ }
    try { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f) f.call(document); } catch (_) { /* */ }
  }
  const toggleFull = () => (isFull() ? exitFull() : enterFull());
  const standalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  for (const t of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(t, () => { onResize(); paintSettings(); });

  /* ---------- Cegah layar mati saat bermain ---------- */
  let wl = null;
  async function lockScreen() {
    try { if ('wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } } catch (_) { wl = null; }
  }
  function unlockScreen() { try { if (wl) { wl.release(); wl = null; } } catch (_) { wl = null; } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && running) lockScreen(); });

  /* ---------- Efek visual ---------- */
  const parts = [], texts = [], trail = [];
  let vig = null, vigKey = '';
  let shake = 0, flash = 0, scale = 1, dpr = 1, hue = 210;
  const glowCache = new Map();
  function glow(color, r) {
    const k = color + '|' + r;
    let c = glowCache.get(k);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = r * 4;
      const g = c.getContext('2d'), grd = g.createRadialGradient(r * 2, r * 2, 0, r * 2, r * 2, r * 2);
      grd.addColorStop(0, '#fff'); grd.addColorStop(0.25, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, r * 4, r * 4);
      glowCache.set(k, c);
    }
    return c;
  }
  function burst(x, y, color, n, speed, life = 0.6, size = 3) {
    if (reduce) n = Math.ceil(n / 3);
    if (LQ) n = Math.ceil(n / 2);
    for (let i = 0; i < n && parts.length < 600; i++) {
      const a = Math.random() * 6.283, v = speed * (0.3 + Math.random() * 0.7);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, c: color, s: size * (0.6 + Math.random() * 0.8) });
    }
  }
  const addText = (x, y, txt, c) => { if (texts.length < 40) texts.push({ x, y, txt, c, t: 0.8 }); };
  const doShake = v => { if (!reduce) shake = Math.max(shake, v); };

  function handleEvents() {
    for (const ev of E.drain(g)) {
      switch (ev.type) {
        case 'shoot': sfx.shoot(); break;
        case 'hit': sfx.hit(); burst(ev.x, ev.y, '#fde68a', 3, 140, .3, 2); break;
        case 'kill': sfx.kill(); burst(ev.x, ev.y, '#fb7185', 22, 300, .7, 3.5); addText(ev.x, ev.y - 10, '+' + ev.v, '#fff'); doShake(4); break;
        case 'dash': sfx.dash(); vib(10); burst(ev.x, ev.y, '#22d3ee', 14, 260, .4); break;
        case 'hurt': sfx.hurt(); vib(70); doShake(16); flash = 1; burst(ev.x, ev.y, '#fb7185', 40, 420, .8, 4); pulseHearts(); break;
        case 'shard': sfx.shard(); break;
        case 'heal': sfx.heal(); vib(30); burst(ev.x, ev.y, '#4ade80', 30, 260, .8); addText(ev.x, ev.y - 20, '+1 ♥', '#4ade80'); break;
        case 'bonus': addText(ev.x, ev.y - 20, '+' + ev.v, '#fde68a'); break;
        case 'wave':
          sfx.wave(); hue = (200 + ev.v * 23) % 360;
          if (ev.v % 5 === 0) { showBanner('⚠ BOS', 'RAJA RETAK mendekat'); doShake(10); vib([40, 60, 40]); }
          else showBanner('GELOMBANG ' + ev.v, ev.v === 1 ? 'Bergerak, bertahan, dan bengkokkan hukum' : 'Bertahanlah');
          break;
        case 'bossdead': sfx.clear(); sfx.kill(); vib([30, 40, 30, 40, 120]); doShake(30); burst(ev.x, ev.y, '#e879f9', 90, 520, 1.2, 5); addText(ev.x, ev.y - 30, 'BOS TUMBANG! ♥ maks +1', '#e879f9'); break;
        case 'clear': sfx.clear(); vib(25); break;
        case 'pick': sfx.pick(); break;
        case 'pulse': sfx.pulse(); break;
        case 'spawn': burst(ev.x, ev.y, '#a78bfa', 6, 120, .4, 2); break;
        case 'over': sfx.over(); vib([120, 70, 260]); doShake(26); burst(ev.x, ev.y, '#fb7185', 80, 500, 1.2, 5); break;
      }
    }
  }

  /* ---------- Render ---------- */
  function resize() {
    dpr = Math.min(lowQ() ? 1 : 2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(2, Math.round(r.width * dpr)); cv.height = Math.max(2, Math.round(r.height * dpr));
    scale = cv.width / W;
  }
  function fitStage(ratio) { $('stage').style.setProperty('--ar', String(ratio)); resize(); }
  const winRatio = () => clampN((window.innerWidth || 960) / (window.innerHeight || 600), 1.5, 2.3);
  const portrait = () => coarse && matchMedia('(orientation: portrait)').matches;
  function onResize() {
    if (!running) { W = Math.round(600 * winRatio()); H = 600; fitStage(W / H); } else resize();
    if (portrait() && running && !paused && g && g.mode === 'playing') togglePause();
  }
  addEventListener('resize', onResize); addEventListener('orientationchange', onResize);

  function render(now) {
    const t = now / 1000;
    LQ = lowQ();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `hsl(${hue},45%,5%)`; ctx.fillRect(0, 0, cv.width, cv.height);
    let sx = 0, sy = 0;
    if (shake > 0.2) { sx = (Math.random() - .5) * shake; sy = (Math.random() - .5) * shake; }
    ctx.setTransform(scale, 0, 0, scale, sx * scale, sy * scale);

    // grid parallax
    const px = g ? g.p.x : W / 2, py = g ? g.p.y : H / 2, gs = 48;
    const ox = (-px * 0.04 + t * 6) % gs, oy = (-py * 0.04) % gs;
    ctx.lineWidth = 1; ctx.strokeStyle = `hsla(${hue},80%,60%,.10)`;
    ctx.beginPath();
    for (let x = ox - gs; x < W + gs; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = oy - gs; y < H + gs; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.strokeStyle = `hsla(${hue},90%,65%,.5)`; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

    if (!g) return;
    const L = g.laws;
    ctx.globalCompositeOperation = 'lighter';

    if (L.lubang) { // lubang hitam
      const cx = W / 2, cy = H / 2;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `hsla(${280 + i * 20},90%,65%,${.5 - i * .12})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 28 + i * 14 + Math.sin(t * 3 + i) * 3, t * (i + 1), t * (i + 1) + 4.5); ctx.stroke();
      }
      ctx.drawImage(glow('#7c3aed', 40), cx - 80, cy - 80, 160, 160);
    }
    for (const f of g.patches) { const a = Math.max(0, f.life / 1.6); ctx.globalAlpha = a; ctx.drawImage(glow('#fb923c', 14), f.x - 28, f.y - 28, 56, 56); }
    ctx.globalAlpha = 1;
    for (const h of g.shards) { // serpihan
      const a = h.life < 2 ? (Math.sin(t * 20) > 0 ? 1 : .3) : 1;
      ctx.globalAlpha = a; ctx.drawImage(glow('#22d3ee', 8), h.x - 16, h.y - 16, 32, 32);
      ctx.fillStyle = '#e0faff'; ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(t * 3); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const w of g.pulses) { ctx.strokeStyle = `rgba(244,114,182,${Math.max(0, 1 - w.r / 190)})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 6.283); ctx.stroke(); }
    for (const b of g.bullets) {
      const c = b.fr ? (b.echo ? '#c4b5fd' : '#67e8f9') : '#fb7185', r = b.fr ? 8 : 10;
      ctx.drawImage(glow(c, r), b.x - r * 2, b.y - r * 2, r * 4, r * 4);
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const e of g.enemies) drawEnemy(e, t);
    const bs = g.enemies.find(e => e.type === 'boss');
    if (bs) { // bar nyawa bos
      const bw = W * 0.5, bx = (W - bw) / 2, by = H - 26;
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(bx, by, bw, 8);
      ctx.fillStyle = '#e879f9'; ctx.fillRect(bx, by, bw * Math.max(0, bs.hp / bs.max), 8);
      ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('RAJA RETAK', W / 2, by - 6);
    }

    // pemain
    const p = g.p;
    trail.push({ x: p.x, y: p.y }); if (trail.length > 9) trail.shift();
    ctx.globalCompositeOperation = 'lighter';
    trail.forEach((q, i) => { ctx.globalAlpha = i / trail.length * (p.dash > 0 ? .8 : .25); ctx.drawImage(glow('#22d3ee', 10), q.x - 20, q.y - 20, 40, 40); });
    ctx.globalAlpha = 1;
    if (L.bilah) {
      const n = 2 * L.bilah, orb = 50 + 8 * L.bilah;
      for (let i = 0; i < n; i++) { const a = p.bladeA + i / n * 6.283; ctx.drawImage(glow('#a78bfa', 10), p.x + Math.cos(a) * orb - 20, p.y + Math.sin(a) * orb - 20, 40, 40); }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (g.mode !== 'over') {
      const blink = p.inv > 0 && p.dash <= 0 && Math.floor(t * 20) % 2 === 0;
      if (!blink) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.fy, p.fx));
        ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = LQ ? 0 : 18; ctx.fillStyle = '#e0faff';
        ctx.beginPath(); ctx.moveTo(p.r * 1.3, 0); ctx.lineTo(-p.r, p.r * .8); ctx.lineTo(-p.r * .5, 0); ctx.lineTo(-p.r, -p.r * .8); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    // partikel & teks
    ctx.globalCompositeOperation = 'lighter';
    for (const q of parts) { ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.c; ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.font = '800 16px system-ui'; ctx.textAlign = 'center';
    for (const q of texts) { ctx.globalAlpha = Math.min(1, q.t * 2); ctx.fillStyle = q.c; ctx.fillText(q.txt, q.x, q.y - (0.8 - q.t) * 40); }
    ctx.globalAlpha = 1;

    // lapisan: waktu melambat + kilat luka + vinyet
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (g.ts < 0.95) { ctx.fillStyle = `rgba(40,80,255,${(1 - g.ts) * 0.28})`; ctx.fillRect(0, 0, W, H); }
    if (flash > 0) { ctx.fillStyle = `rgba(251,113,133,${flash * .35})`; ctx.fillRect(0, 0, W, H); }
    if (!LQ) {
      const vk = W + 'x' + H;
      if (vigKey !== vk) { vig = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * .95); vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.55)'); vigKey = vk; }
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
    }
  }

  function drawEnemy(e, t) {
    ctx.save(); ctx.translate(e.x, e.y);
    const warm = e.warm > 0;
    ctx.globalAlpha = warm ? 0.35 + 0.3 * Math.sin(t * 30) : 1;
    const col = e.fl > 0 ? '#ffffff' : ({ drifter: '#fb7185', shooter: '#fb923c', spinner: '#c084fc', tank: '#f43f5e', boss: '#e879f9' })[e.type];
    ctx.shadowColor = col; ctx.shadowBlur = LQ ? 0 : 14; ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    const r = e.r;
    ctx.beginPath();
    if (e.type === 'drifter') { ctx.rotate(t * 2); ctx.moveTo(0, -r * 1.2); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.2); ctx.lineTo(-r, 0); ctx.closePath(); ctx.globalAlpha *= .85; ctx.fill(); }
    else if (e.type === 'shooter') { const a = Math.atan2(g.p.y - e.y, g.p.x - e.x); ctx.rotate(a); ctx.moveTo(r * 1.2, 0); ctx.lineTo(-r, r); ctx.lineTo(-r, -r); ctx.closePath(); ctx.stroke(); ctx.globalAlpha *= .3; ctx.fill(); }
    else if (e.type === 'spinner') { ctx.rotate(e.ang * 3); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283, rr = i % 2 ? r * .6 : r * 1.1; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.stroke(); ctx.globalAlpha *= .35; ctx.fill(); }
    else if (e.type === 'boss') {
      const ph = Math.max(0.04, e.hp / e.max);
      ctx.rotate(e.ang);
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283, rr = r * (i % 2 ? 0.85 : 1.2); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.lineWidth = 4; ctx.stroke(); ctx.globalAlpha *= .3; ctx.fill(); ctx.globalAlpha = 1;
      ctx.rotate(-e.ang * 2); ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, 6.283 * ph); ctx.stroke();
    }
    else { ctx.rect(-r, -r, r * 2, r * 2); ctx.stroke(); ctx.globalAlpha *= .3; ctx.fill(); ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.fillRect(-r + 4, -4, (r * 2 - 8) * Math.max(0, e.hp / e.max), 8); }
    ctx.restore();
  }

  /* ---------- HUD ---------- */
  const hud = { hp: -1, max: -1, wave: -1, score: -1, combo: -1, laws: '', dash: -1 };
  function pulseHearts() { const h = $('hearts').children[g.p.hp]; if (h) { h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); } }
  function updateHud() {
    const p = g.p;
    if (hud.hp !== p.hp || hud.max !== p.max) {
      hud.hp = p.hp; hud.max = p.max;
      const box = $('hearts'); box.textContent = '';
      for (let i = 0; i < p.max; i++) { const s = document.createElement('span'); s.textContent = '♥'; s.className = i < p.hp ? 'full' : 'empty'; box.appendChild(s); }
    }
    if (hud.wave !== g.wave) { hud.wave = g.wave; $('wave').textContent = g.wave; }
    if (hud.score !== g.score) {
      hud.score = g.score; const el = $('score'); el.textContent = g.score.toLocaleString('id-ID');
      if (!reduce) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    }
    const cm = g.combo >= 3 ? 'KOMBO ×' + (1 + Math.min(g.combo, 40) * 0.05).toFixed(2) : '';
    if (hud.combo !== cm) { hud.combo = cm; $('combo').textContent = cm; }
    const sig = JSON.stringify(g.laws);
    if (hud.laws !== sig) {
      hud.laws = sig; const box = $('laws'); box.textContent = '';
      for (const id of E.LAW_IDS) if (g.laws[id]) {
        const d = document.createElement('div'); d.className = 'law'; d.title = LAW[id].nama; d.textContent = LAW[id].ikon;
        if (g.laws[id] > 1) { const i = document.createElement('i'); i.textContent = '×' + g.laws[id]; d.appendChild(i); }
        box.appendChild(d);
      }
    }
    const cd = 1.4 * (1 + 0.4 * (g.laws.jejak | 0)), pct = p.dashCd <= 0 ? 100 : Math.round((1 - p.dashCd / cd) * 100);
    if (hud.dash !== pct) { hud.dash = pct; const d = $('dash'); d.style.setProperty('--p', pct); d.classList.toggle('ready', pct >= 100); }
  }

  /* ---------- Alur permainan ---------- */
  let g = null, running = false, paused = false, daily = false, seedUsed = 0, acc = 0, last = 0, overTimer = 0, cardsShown = false, overShown = false, bannerT = 0;

  function newSeed() {
    if (daily) { const d = new Date(); return ((d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) * 2654435761) >>> 0; }
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (_) { return (Date.now() ^ (Math.random() * 4294967296)) >>> 0; }
  }
  function showOnly(id) { for (const x of ['menu', 'cards', 'pause', 'over']) $(x).hidden = x !== id; $('hud').hidden = id === 'menu'; }
  let starting = false;
  async function start(isDaily) {
    if (starting) return;
    starting = true;
    try {
      audio();
      if (coarse && canFull && !isFull()) { await enterFull(); await new Promise(r => setTimeout(r, 300)); }
      daily = isDaily; seedUsed = newSeed();
      // Harian: arena tetap 960x600 agar adil. Mode bebas: arena menyesuaikan rasio layar.
      g = E.create(seedUsed, { w: isDaily ? 960 : Math.round(600 * winRatio()) });
      W = g.W; H = g.H; fitStage(W / H);
      parts.length = texts.length = trail.length = 0; shake = flash = 0; hue = 210; acc = 0; fpsWarm = 0;
      Object.assign(hud, { hp: -1, max: -1, wave: -1, score: -1, combo: -1, laws: '', dash: -1 });
      running = true; paused = false; cardsShown = overShown = false; clearTimeout(overTimer); overTimer = 0;
      showOnly(null); $('hud').hidden = false; last = performance.now();
      lockScreen(); handleEvents();
      if (portrait()) togglePause();
    } finally { starting = false; }
  }
  function toMenu() { running = false; paused = false; clearTimeout(overTimer); overTimer = 0; g = null; resetStick(); unlockScreen(); onResize(); showOnly('menu'); renderBoard(); }
  function togglePause() {
    if (!running || !g || g.mode === 'over' || g.mode === 'choosing') return;
    paused = !paused; $('pause').hidden = !paused; if (paused) resetStick(); else { last = performance.now(); keys.clear(); }
  }
  function showBanner(t, sub) {
    const b = $('banner'); b.textContent = t; const s = document.createElement('small'); s.textContent = sub; b.appendChild(s);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 2100);
  }

  function showCards() {
    const box = $('cards-list'); box.textContent = '';
    g.cards.forEach((id, i) => {
      const l = LAW[id], lv = g.laws[id] | 0;
      const b = document.createElement('button'); b.className = 'card'; b.type = 'button';
      const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; n.textContent = txt; b.appendChild(n); };
      mk('span', 'key', String(i + 1)); mk('div', 'ico', l.ikon); mk('h4', '', l.nama);
      mk('div', 'lv', lv ? `Tingkat ${lv} → ${lv + 1}` : 'Hukum baru');
      mk('p', 'b', l.boon); mk('p', 'h', l.harga);
      b.addEventListener('click', () => choose(i)); box.appendChild(b);
    });
    showOnly('cards'); $('hud').hidden = false; cardsShown = true;
    const first = box.firstElementChild; if (first) first.focus({ preventScroll: true });
  }
  function choose(i) {
    if (!g || g.mode !== 'choosing') return;
    if (E.pick(g, i)) { cardsShown = false; showOnly(null); $('hud').hidden = false; last = performance.now(); handleEvents(); }
  }

  function renderBoard() {
    const ol = $('board'); ol.textContent = '';
    if (!store.board.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'Belum ada rekor'; ol.appendChild(li); return; }
    for (const r of store.board) {
      const li = document.createElement('li');
      const a = document.createElement('span'); a.textContent = r.n;
      const b = document.createElement('span'); b.textContent = r.s.toLocaleString('id-ID') + ' · G' + r.w;
      li.append(a, b); ol.appendChild(li);
    }
  }
  function showOver() {
    overShown = true; showOnly('over'); $('hud').hidden = true;
    $('f-score').textContent = g.score.toLocaleString('id-ID');
    $('f-info').textContent = `Gelombang ${g.wave} · ${g.kills} musuh · ${daily ? 'Tantangan Harian' : 'Mode Bebas'}`;
    const min = store.board.length < 5 ? -1 : store.board[store.board.length - 1].s;
    const qual = g.score > 0 && g.score > min;
    $('name-form').hidden = !qual;
    if (qual) { $('name').value = ''; setTimeout(() => $('name').focus({ preventScroll: true }), 50); }
  }
  $('name-form').addEventListener('submit', ev => {
    ev.preventDefault();
    if (!g || g.mode !== 'over' || $('name-form').hidden) return;
    store.board.push({ n: cleanName($('name').value), s: g.score, w: g.wave });
    store.board.sort((a, b) => b.s - a.s); store.board.length = Math.min(5, store.board.length);
    saveStore(); renderBoard(); $('name-form').hidden = true;
  });

  /* ---------- Loop utama ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const wantTouch = coarse && running && !paused && !!g && g.mode === 'playing';
    if (tz.hidden === wantTouch) { tz.hidden = !wantTouch; if (!wantTouch) resetStick(); }
    if (running && !paused && g) {
      if (dt > 0) {
        fpsEma = fpsEma * 0.96 + (1 / Math.max(dt, 0.001)) * 0.04; fpsWarm += dt;
        if (store.q === 'auto' && !autoLow && fpsWarm > 4 && fpsEma < 38) { autoLow = true; resize(); }
      }
      if (g.mode === 'playing') {
        acc += dt; let n = 0;
        while (acc >= STEP && n < 5) { E.step(g, STEP, readInput()); handleEvents(); acc -= STEP; n++; if (g.mode !== 'playing') break; }
        if (n === 5) acc = 0;
      } else { handleEvents(); }
      if (g.mode === 'choosing' && !cardsShown) showCards();
      if (g.mode === 'over' && !overShown && !overTimer) overTimer = setTimeout(() => { overTimer = 0; if (g && g.mode === 'over') showOver(); }, 1100);
      for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96; q.life -= dt; }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      for (const q of texts) q.t -= dt;
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].t <= 0) texts.splice(i, 1);
      shake *= Math.pow(0.001, dt); flash = Math.max(0, flash - dt * 2.5);
      updateHud();
    }
    render(now);
  }

  /* ---------- Tombol ---------- */
  $('btn-play').addEventListener('click', () => start(false));
  $('btn-daily').addEventListener('click', () => start(true));
  $('btn-again').addEventListener('click', () => start(daily));
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-resume').addEventListener('click', togglePause);
  $('btn-quit').addEventListener('click', toMenu);
  $('btn-pause').addEventListener('click', togglePause);
  const GFX = { auto: 'Otomatis', high: 'Tinggi', low: 'Rendah' };
  function paintSettings() {
    for (const el of $$('.js-mute')) el.textContent = el.classList.contains('icon-btn') ? (muted ? '🔇' : '🔊') : (muted ? '🔇 Suara: Mati' : '🔊 Suara: Aktif');
    for (const el of $$('.js-full')) {
      el.hidden = !canFull || standalone;
      el.textContent = el.classList.contains('icon-btn') ? (isFull() ? '🗗' : '⛶') : (isFull() ? '🗗 Keluar Layar Penuh' : '⛶ Layar Penuh');
    }
    $('btn-vib').textContent = '📳 Getar: ' + (store.vib ? 'Aktif' : 'Mati');
    $('btn-gfx').textContent = '🎚 Grafis: ' + GFX[store.q];
  }
  for (const el of $$('.js-mute')) el.addEventListener('click', () => { muted = !muted; store.mute = muted; saveStore(); paintSettings(); });
  for (const el of $$('.js-full')) el.addEventListener('click', toggleFull);
  $('btn-vib').addEventListener('click', () => { store.vib = !store.vib; saveStore(); paintSettings(); vib(30); });
  $('btn-gfx').addEventListener('click', () => {
    const o = ['auto', 'high', 'low']; store.q = o[(o.indexOf(store.q) + 1) % 3];
    autoLow = false; fpsEma = 60; fpsWarm = 0; saveStore(); paintSettings(); resize();
  });

  /* ---------- Pasang sebagai aplikasi (PWA) ---------- */
  let deferred = null;
  addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); deferred = ev; $('btn-install').hidden = false; });
  addEventListener('appinstalled', () => { $('btn-install').hidden = true; deferred = null; });
  $('btn-install').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt(); try { await deferred.userChoice; } catch (_) { /* diabaikan */ }
    deferred = null; $('btn-install').hidden = true;
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* offline tidak aktif */ }); });
  }

  paintSettings(); renderBoard(); showOnly('menu'); onResize();
  last = performance.now(); requestAnimationFrame(frame);
})();
