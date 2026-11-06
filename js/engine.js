/* DISTORSI — mesin logika (tanpa DOM, deterministik, bisa diuji di Node) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DW = 960, DH = 600, MAXSTACK = 3;
  const CAP = { bullets: 700, enemies: 90, shards: 120, patches: 90, events: 240, echo: 240 };

  const LAWS = [
    { id: 'waktu',  nama: 'Waktu Mengikuti Gerak', ikon: '⏳', boon: 'Dunia melambat saat kamu diam, peluru mudah dihindari.', harga: 'Tembakanmu ikut melambat saat diam.' },
    { id: 'pantul', nama: 'Dinding Cermin',        ikon: '🪞', boon: 'Pelurumu memantul dari dinding arena.',                  harga: 'Peluru musuh ikut memantul.' },
    { id: 'gema',   nama: 'Gema Tembakan',         ikon: '🔁', boon: 'Setiap tembakan diulang oleh gema masa lalumu.',        harga: 'Tembakan 15% lebih lambat.' },
    { id: 'magnet', nama: 'Magnet Jiwa',           ikon: '🧲', boon: 'Serpihan tersedot dari jauh.',                           harga: 'Tubuhmu 15% lebih besar.' },
    { id: 'jejak',  nama: 'Jejak Api',             ikon: '🔥', boon: 'Gerakanmu meninggalkan api yang membakar musuh.',        harga: 'Dash 40% lebih lama pulih.' },
    { id: 'lubang', nama: 'Lubang Hitam',          ikon: '🕳️', boon: 'Lubang hitam menelan peluru dan melukai musuh.',         harga: 'Menarik dirimu juga.' },
    { id: 'pecah',  nama: 'Pecah Belah',           ikon: '💥', boon: 'Musuh mati meledak jadi pecahan peluru.',                harga: 'Musuh 15% lebih cepat.' },
    { id: 'bilah',  nama: 'Bilah Berputar',        ikon: '🌀', boon: 'Bilah mengorbit, menebas musuh dan peluru.',             harga: 'Kecepatan gerak −8%.' },
    { id: 'denyut', nama: 'Denyut Jantung',        ikon: '💓', boon: 'Gelombang kejut berkala menghapus peluru musuh.',        harga: 'Kekebalan setelah terkena lebih singkat.' },
  ];
  const LAW_IDS = LAWS.map(l => l.id);

  const TYPES = {
    drifter: { r: 12, hp: 2,  speed: 78, cost: 1, val: 10, minWave: 1 },
    shooter: { r: 13, hp: 3,  speed: 60, cost: 2, val: 25, minWave: 2 },
    spinner: { r: 16, hp: 6,  speed: 30, cost: 3, val: 40, minWave: 4 },
    tank:    { r: 22, hp: 16, speed: 42, cost: 5, val: 90, minWave: 6 },
    boss:    { r: 34, hp: 80, speed: 35, cost: 99, val: 600, minWave: 9999 }, // hanya lewat gelombang bos
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fin = v => (Number.isFinite(v) ? v : 0);
  const L = (s, id) => s.laws[id] | 0;

  function create(seed, opts) {
    const W = clamp(Math.round(fin(opts && opts.w) || DW), 800, 1400), H = DH;
    const s = {
      W, H, seed: seed >>> 0, rand: null, t: 0, wt: 0, ts: 1, mode: 'playing',
      wave: 0, score: 0, combo: 0, comboT: 0, kills: 0, shardCount: 0, dashSeq: 0,
      p: { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 12, hp: 5, max: 5, inv: 1, dash: 0, dashCd: 0, fireCd: 0.3,
           fx: 1, fy: 0, trailT: 0, pulseT: 3, bladeA: 0, ddx: 1, ddy: 0, dashId: 0, speed: 250 },
      enemies: [], bullets: [], shards: [], patches: [], echo: [], pulses: [], events: [],
      laws: {}, cards: [], spawnQ: [], spawnT: 1,
    };
    s.rand = mulberry32(seed);
    startWave(s);
    return s;
  }

  function emit(s, type, x, y, v) { if (s.events.length < CAP.events) s.events.push({ type, x, y, v }); }
  function drain(s) { const e = s.events; s.events = []; return e; }

  function startWave(s) {
    const W = s.W, H = s.H;
    s.wave++;
    s.mode = 'playing';
    const boss = s.wave % 5 === 0;
    const avail = Object.keys(TYPES).filter(k => TYPES[k].minWave <= s.wave);
    let budget = 4 + Math.floor(s.wave * 2.6);
    if (boss) budget = Math.floor(budget * 0.45);
    const q = [];
    while (budget >= 1 && q.length < 45) {
      const opts = avail.filter(k => TYPES[k].cost <= budget);
      if (!opts.length) break;
      const k = opts[Math.floor(s.rand() * opts.length)];
      q.push(k); budget -= TYPES[k].cost;
    }
    if (boss) q.unshift('boss');
    s.spawnQ = q;
    s.spawnT = 1.2;
    emit(s, 'wave', W / 2, H / 2, s.wave);
  }

  function spawnEnemy(s, type) {
    const W = s.W, H = s.H;
    const T = TYPES[type];
    let x = 0, y = 0;
    if (type === 'boss') { x = W / 2; y = 70; }
    else for (let i = 0; i < 8; i++) {
      const side = Math.floor(s.rand() * 4);
      const u = s.rand();
      x = side === 0 ? 30 : side === 1 ? W - 30 : 30 + u * (W - 60);
      y = side === 2 ? 30 : side === 3 ? H - 30 : 30 + u * (H - 60);
      if (Math.hypot(x - s.p.x, y - s.p.y) >= 220) break;
    }
    const hp = T.hp * (1 + (type === 'boss' ? 0.1 : 0.05) * s.wave);
    s.enemies.push({ type, x, y, vx: 0, vy: 0, r: T.r, hp, max: hp, warm: type === 'boss' ? 1.6 : 0.9, cd: 1 + s.rand() * 1.2, cd2: 1,
                     ang: s.rand() * 6.283, hitCd: 0, dashId: 0, fl: 0, dead: false });
    emit(s, 'spawn', x, y, type);
  }

  function pushBullet(s, b) { if (s.bullets.length < CAP.bullets) s.bullets.push(b); }
  function enemyShot(s, e, ang, speed) {
    pushBullet(s, { x: e.x, y: e.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 5, fr: false,
                    dmg: 1, life: 9, bn: L(s, 'pantul') });
  }

  function hurt(s) {
    const p = s.p;
    if (p.inv > 0 || p.dash > 0 || s.mode !== 'playing') return false;
    p.hp -= 1;
    p.inv = Math.max(0.5, 1.2 - 0.2 * L(s, 'denyut'));
    s.combo = 0; s.comboT = 0;
    emit(s, 'hurt', p.x, p.y, p.hp);
    for (const b of s.bullets) if (!b.fr && Math.hypot(b.x - p.x, b.y - p.y) < 140) b.life = 0; // belas kasihan
    if (p.hp <= 0) { p.hp = 0; s.mode = 'over'; emit(s, 'over', p.x, p.y, s.score); }
    return true;
  }

  function killEnemy(s, e) {
    e.dead = true;
    const T = TYPES[e.type];
    s.kills++; s.combo++; s.comboT = 2.2;
    const mult = 1 + Math.min(s.combo, 40) * 0.05;
    const gain = Math.round(T.val * mult);
    s.score += gain;
    emit(s, 'kill', e.x, e.y, gain);
    const drops = e.type === 'tank' ? 3 : 1;
    for (let i = 0; i < drops && s.shards.length < CAP.shards; i++)
      s.shards.push({ x: e.x + (s.rand() - .5) * 20, y: e.y + (s.rand() - .5) * 20, life: 9 });
    if (e.type === 'boss') {
      s.p.max = Math.min(7, s.p.max + 1); s.p.hp = Math.min(s.p.max, s.p.hp + 1);
      for (const b of s.bullets) if (!b.fr) b.life = 0;
      for (let i = 0; i < 8 && s.shards.length < CAP.shards; i++) {
        const a = i / 8 * 6.283; s.shards.push({ x: e.x + Math.cos(a) * 30, y: e.y + Math.sin(a) * 30, life: 9 });
      }
      s.score += 500; emit(s, 'bossdead', e.x, e.y, 0);
    }
    const n = L(s, 'pecah');
    if (n) {
      const cnt = 4 + 2 * n, off = s.rand() * 6.283;
      for (let i = 0; i < cnt; i++) {
        const a = off + (i / cnt) * 6.283;
        pushBullet(s, { x: e.x, y: e.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 4, fr: true, dmg: 1, life: 0.6, bn: 0 });
      }
    }
  }

  function nearest(s) {
    let best = null, bd = 520 * 520;
    for (const e of s.enemies) {
      const d = (e.x - s.p.x) ** 2 + (e.y - s.p.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function step(s, dt, inp) {
    if (s.mode !== 'playing') return;
    const W = s.W, H = s.H;
    dt = clamp(fin(dt), 0, 0.05);
    if (dt === 0) return;
    inp = inp || {};
    const p = s.p;
    let ix = clamp(fin(inp.x), -1, 1), iy = clamp(fin(inp.y), -1, 1);
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }
    const moving = il > 0.12;

    // ---- statistik turunan dari hukum ----
    const nB = L(s, 'bilah'), nM = L(s, 'magnet'), nJ = L(s, 'jejak'), nG = L(s, 'gema');
    p.speed = 250 * (1 - 0.08 * nB);
    p.r = 12 * (1 + 0.15 * nM);

    // ---- skala waktu ----
    s.t += dt;
    const nW = L(s, 'waktu');
    let target = 1;
    if (nW) {
      const floor = [0.45, 0.35, 0.28][nW - 1];
      const spd = p.dash > 0 ? 1 : Math.min(1, Math.hypot(p.vx, p.vy) / p.speed);
      target = floor + (1 - floor) * spd;
    }
    s.ts += (target - s.ts) * Math.min(1, dt * 10);
    const wdt = dt * s.ts;
    s.wt += wdt;

    // ---- pemain ----
    p.inv = Math.max(0, p.inv - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    if (moving) { p.fx = ix / il; p.fy = iy / il; }
    if (inp.dash && p.dashCd <= 0 && p.dash <= 0) {
      p.dash = 0.16; p.dashCd = 1.4 * (1 + 0.4 * nJ);
      p.ddx = moving ? ix / il : p.fx; p.ddy = moving ? iy / il : p.fy;
      p.dashId = ++s.dashSeq;
      p.inv = Math.max(p.inv, 0.2);
      emit(s, 'dash', p.x, p.y, 0);
    }
    if (p.dash > 0) {
      p.dash -= dt;
      p.vx = p.ddx * 820; p.vy = p.ddy * 820;
    } else {
      const k = Math.min(1, dt * 14);
      p.vx += (ix * p.speed - p.vx) * k; p.vy += (iy * p.speed - p.vy) * k;
    }
    if (L(s, 'lubang')) { // harga: tertarik ke pusat
      const dx = W / 2 - p.x, dy = H / 2 - p.y, d = Math.hypot(dx, dy);
      if (d > 24) { const f = 90 * L(s, 'lubang'); p.vx += dx / d * f * dt; p.vy += dy / d * f * dt; }
    }
    p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, H - p.r);

    // ---- menembak (bidik otomatis) ----
    p.fireCd -= wdt;
    if (p.fireCd <= 0) {
      const t = nearest(s);
      if (t) {
        const a = Math.atan2(t.y - p.y, t.x - p.x);
        const vx = Math.cos(a) * 560, vy = Math.sin(a) * 560;
        const bn = L(s, 'pantul') ? 1 + L(s, 'pantul') : 0;
        pushBullet(s, { x: p.x, y: p.y, vx, vy, r: 4, fr: true, dmg: 1, life: 1.1, bn });
        for (let k = 1; k <= nG && s.echo.length < CAP.echo; k++)
          s.echo.push({ t: s.wt + 0.6 * k, x: p.x, y: p.y, vx, vy, bn });
        p.fireCd = 0.26 * (1 + 0.15 * nG);
        emit(s, 'shoot', p.x, p.y, 0);
      } else p.fireCd = 0.05;
    }
    for (let i = s.echo.length - 1; i >= 0; i--) {
      const g = s.echo[i];
      if (s.wt >= g.t) {
        pushBullet(s, { x: g.x, y: g.y, vx: g.vx, vy: g.vy, r: 4, fr: true, dmg: 1, life: 1.0, bn: g.bn, echo: true });
        s.echo.splice(i, 1);
      }
    }

    // ---- spawn ----
    s.spawnT -= wdt;
    if (s.spawnQ.length && s.spawnT <= 0 && s.enemies.length < CAP.enemies) {
      spawnEnemy(s, s.spawnQ.shift());
      s.spawnT = Math.max(0.25, 1.1 - s.wave * 0.04);
    }

    // ---- musuh ----
    const spdMul = 1 + 0.15 * L(s, 'pecah');
    for (const e of s.enemies) {
      const T = TYPES[e.type];
      e.warm = Math.max(0, e.warm - wdt); e.hitCd = Math.max(0, e.hitCd - wdt); e.fl = Math.max(0, e.fl - wdt);
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const sp = (T.speed + s.wave * 2) * spdMul;
      let mx = 0, my = 0;
      if (e.type === 'drifter') { mx = ux; my = uy; }
      else if (e.type === 'shooter') {
        if (d > 280) { mx = ux; my = uy; } else if (d < 220) { mx = -ux; my = -uy; } else { mx = -uy; my = ux; }
        e.cd -= wdt;
        if (e.cd <= 0 && e.warm <= 0) { enemyShot(s, e, Math.atan2(dy, dx), 190); e.cd = 1.9 + s.rand() * 0.5; }
      } else if (e.type === 'spinner') {
        e.ang += wdt * 0.8;
        mx = Math.cos(e.ang) * 0.6 + ux * 0.4; my = Math.sin(e.ang) * 0.6 + uy * 0.4;
        e.cd -= wdt;
        if (e.cd <= 0 && e.warm <= 0) {
          const n = 8 + Math.min(6, Math.floor(s.wave / 2)), off = s.rand() * 6.283;
          for (let i = 0; i < n; i++) enemyShot(s, e, off + (i / n) * 6.283, 135);
          e.cd = 2.6;
        }
      } else if (e.type === 'boss') {
        const ratio = e.hp / e.max;
        mx = ux * 0.5; my = uy * 0.5;
        e.cd -= wdt; e.cd2 -= wdt; e.ang += wdt * 0.9;
        if (e.warm <= 0) {
          if (e.cd <= 0) {
            const n = ratio > 0.66 ? 14 : 18;
            for (let i = 0; i < n; i++) enemyShot(s, e, e.ang + (i / n) * 6.283, 125);
            e.cd = ratio > 0.33 ? 2.6 : 3.2;
          }
          if (ratio <= 0.66 && ratio > 0.33 && e.cd2 <= 0) {
            const a = Math.atan2(dy, dx);
            for (let i = -2; i <= 2; i++) enemyShot(s, e, a + i * 0.2, 200);
            e.cd2 = 1.5;
          } else if (ratio <= 0.33 && e.cd2 <= 0) {
            enemyShot(s, e, e.ang * 3, 165); enemyShot(s, e, e.ang * 3 + 3.14159, 165);
            e.cd2 = 0.11;
          }
        }
      } else { // tank
        mx = ux; my = uy;
        e.cd -= wdt;
        if (e.cd <= 0 && e.warm <= 0) {
          const a = Math.atan2(dy, dx);
          for (let i = -1; i <= 1; i++) enemyShot(s, e, a + i * 0.28, 170);
          e.cd = 2.4;
        }
      }
      e.vx += (mx * sp - e.vx) * Math.min(1, wdt * 6); e.vy += (my * sp - e.vy) * Math.min(1, wdt * 6);
      e.x = clamp(e.x + e.vx * wdt, e.r, W - e.r); e.y = clamp(e.y + e.vy * wdt, e.r, H - e.r);
    }
    // saling dorong agar tidak menumpuk
    for (let i = 0; i < s.enemies.length; i++) for (let j = i + 1; j < s.enemies.length; j++) {
      const a = s.enemies[i], b = s.enemies[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d > 0 && d < m) { const k = (m - d) / 2 / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }

    // ---- dash melukai musuh ----
    if (p.dash > 0) for (const e of s.enemies)
      if (e.dashId !== p.dashId && Math.hypot(e.x - p.x, e.y - p.y) < p.r + e.r + 6) {
        e.dashId = p.dashId; e.hp -= 2; e.fl = 0.12; emit(s, 'hit', e.x, e.y, 0);
      }

    // ---- hukum: jejak api ----
    if (nJ) {
      p.trailT -= dt;
      if (moving && p.trailT <= 0 && s.patches.length < CAP.patches) { s.patches.push({ x: p.x, y: p.y, life: 1.6 }); p.trailT = 0.07; }
      for (const f of s.patches) {
        f.life -= wdt;
        for (const e of s.enemies) if ((e.x - f.x) ** 2 + (e.y - f.y) ** 2 < (e.r + 16) ** 2) e.hp -= 2.5 * nJ * wdt;
      }
      s.patches = s.patches.filter(f => f.life > 0);
    } else s.patches.length = 0;

    // ---- hukum: lubang hitam ----
    const nH = L(s, 'lubang');
    if (nH) {
      const cx = W / 2, cy = H / 2;
      for (const b of s.bullets) if (!b.fr) {
        const dx = cx - b.x, dy = cy - b.y, d = Math.hypot(dx, dy) || 1;
        if (d < 24) { b.life = 0; continue; }
        const f = 700 * nH * (1 - Math.min(1, d / 380)) * wdt;
        b.vx += dx / d * f; b.vy += dy / d * f;
        const sp = Math.hypot(b.vx, b.vy); if (sp > 400) { b.vx *= 400 / sp; b.vy *= 400 / sp; }
      }
      for (const e of s.enemies) {
        const dx = cx - e.x, dy = cy - e.y, d = Math.hypot(dx, dy) || 1;
        if (d < 380) { const f = 60 * nH * wdt; e.x += dx / d * f; e.y += dy / d * f; }
        if (d < 46) e.hp -= 4 * nH * wdt;
      }
    }

    // ---- hukum: bilah berputar ----
    if (nB) {
      p.bladeA += dt * 4.2;
      const n = 2 * nB, orb = 50 + 8 * nB;
      for (let i = 0; i < n; i++) {
        const a = p.bladeA + (i / n) * 6.283, bx = p.x + Math.cos(a) * orb, by = p.y + Math.sin(a) * orb;
        for (const e of s.enemies) if (e.hitCd <= 0 && (e.x - bx) ** 2 + (e.y - by) ** 2 < (e.r + 9) ** 2) {
          e.hp -= 1; e.hitCd = 0.35; e.fl = 0.1; emit(s, 'hit', e.x, e.y, 0);
        }
        for (const b of s.bullets) if (!b.fr && (b.x - bx) ** 2 + (b.y - by) ** 2 < 14 * 14) b.life = 0;
      }
    }

    // ---- hukum: denyut jantung ----
    const nD = L(s, 'denyut');
    if (nD) {
      p.pulseT -= dt;
      if (p.pulseT <= 0) { s.pulses.push({ x: p.x, y: p.y, r: 0 }); p.pulseT = 4.5 - 0.8 * nD; emit(s, 'pulse', p.x, p.y, 0); }
    }
    for (const w of s.pulses) {
      w.r += 420 * dt;
      for (const b of s.bullets) if (!b.fr && Math.abs(Math.hypot(b.x - w.x, b.y - w.y) - w.r) < 26) b.life = 0;
    }
    s.pulses = s.pulses.filter(w => w.r < 190);

    // ---- peluru ----
    for (const b of s.bullets) {
      b.x += b.vx * wdt; b.y += b.vy * wdt; b.life -= wdt;
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) {
        if (b.bn > 0) {
          if (b.x < 0 || b.x > W) b.vx = -b.vx;
          if (b.y < 0 || b.y > H) b.vy = -b.vy;
          b.x = clamp(b.x, 0, W); b.y = clamp(b.y, 0, H); b.bn--;
        } else b.life = 0;
      }
      if (b.life <= 0) continue;
      if (b.fr) {
        for (const e of s.enemies) if (!e.dead && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (e.r + b.r) ** 2) {
          e.hp -= b.dmg; e.fl = 0.1; b.life = 0; emit(s, 'hit', b.x, b.y, 0); break;
        }
      } else if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (p.r + b.r) ** 2) { if (hurt(s)) b.life = 0; }
    }
    s.bullets = s.bullets.filter(b => b.life > 0);
    if (s.mode === 'over') return;

    // ---- kontak musuh dengan pemain ----
    for (const e of s.enemies) if (e.warm <= 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r + p.r - 2) ** 2) {
      if (hurt(s)) {
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        e.x = clamp(e.x + dx / d * 60, e.r, W - e.r); e.y = clamp(e.y + dy / d * 60, e.r, H - e.r);
      }
    }
    if (s.mode === 'over') return;

    // ---- kematian musuh ----
    let died = false;
    for (const e of s.enemies) if (!e.dead && e.hp <= 0) killEnemy(s, e);
    for (const e of s.enemies) if (e.dead) { died = true; break; }
    if (died) s.enemies = s.enemies.filter(e => !e.dead);

    // ---- serpihan ----
    const pr = 22 + 55 * nM;
    for (let i = s.shards.length - 1; i >= 0; i--) {
      const h = s.shards[i];
      h.life -= dt;
      const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy) || 1;
      if (d < pr) { const f = 380 * dt; h.x += dx / d * Math.min(f, d); h.y += dy / d * Math.min(f, d); }
      if (d < p.r + 8) { collect(s); s.shards.splice(i, 1); }
      else if (h.life <= 0) s.shards.splice(i, 1);
    }

    // ---- kombo ----
    if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 0; }

    // ---- gelombang selesai ----
    if (s.mode === 'playing' && !s.spawnQ.length && !s.enemies.length) waveClear(s);
  }

  function collect(s) {
    s.shardCount++; s.score += 5;
    emit(s, 'shard', s.p.x, s.p.y, 0);
    if (s.shardCount % 8 === 0) {
      if (s.p.hp < s.p.max) { s.p.hp++; emit(s, 'heal', s.p.x, s.p.y, s.p.hp); }
      else { s.score += 150; emit(s, 'bonus', s.p.x, s.p.y, 150); }
    }
  }

  function waveClear(s) {
    s.score += 100 * s.wave;
    s.bullets = []; s.echo = []; s.pulses = []; s.patches = [];
    for (const h of s.shards) collect(s); // semua serpihan otomatis terkumpul
    s.shards = [];
    s.cards = drawCards(s);
    emit(s, 'clear', s.W / 2, s.H / 2, s.wave);
    if (!s.cards.length) { startWave(s); s.p.inv = 1; return; }
    s.mode = 'choosing';
  }

  function drawCards(s) {
    const pool = LAW_IDS.filter(id => L(s, id) < MAXSTACK);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(s.rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 3);
  }

  function pick(s, i) {
    if (s.mode !== 'choosing' || !Number.isInteger(i) || i < 0 || i >= s.cards.length) return false;
    const id = s.cards[i];
    if (!LAW_IDS.includes(id) || L(s, id) >= MAXSTACK) return false;
    s.laws[id] = L(s, id) + 1;
    s.cards = [];
    startWave(s);
    s.p.inv = 1;
    emit(s, 'pick', s.p.x, s.p.y, id);
    return true;
  }

  return { W: DW, H: DH, CAP, MAXSTACK, LAWS, LAW_IDS, TYPES, create, step, pick, drain, mulberry32 };
});
