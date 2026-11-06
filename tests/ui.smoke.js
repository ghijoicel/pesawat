// Uji asap UI (DOM palsu, mode Android/sentuh): menu -> layar penuh -> main -> joystick/dash -> kartu -> bos -> game over -> menu.
const E = require('../js/engine.js');
const els = {}, wh = {}, clicks = {};
let fatal = null;
process.on('uncaughtException', e => { console.error('ERROR:', e.stack.split('\n').slice(0, 5).join('\n')); process.exit(1); });
process.on('unhandledRejection', e => { console.error('REJECT:', e && e.stack || e); process.exit(1); });

function mk(id, cls) {
  const st = { hidden: false, children: [], style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: c => (cls || '').includes(c) }, id };
  const px = new Proxy(function () {}, {
    get(_, k) {
      if (k === 'addEventListener') return (t, h) => { (st.h ||= {})[t] = h; };
      if (k === 'getBoundingClientRect') return () => ({ width: 800, height: 360, left: 0, top: 0 });
      if (k === 'getContext') return () => ctx;
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'toLocaleString') return () => '0';
      if (k in st) return st[k];
      return px;
    },
    set(_, k, v) { st[k] = v; return true; }, apply() { return px; },
  });
  return px;
}
const cs = { globalAlpha: 1, shadowBlur: 0 };
const ctx = new Proxy(function () {}, { get: (_, k) => (k in cs ? cs[k] : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 1 }) : ctx), set: (_, k, v) => { cs[k] = v; return true; }, apply: () => ctx });

const vibCalls = []; let fsCalls = 0, lockCalls = 0, wakeCalls = 0, swReg = 0;
const docEl = { requestFullscreen: async () => { fsCalls++; global.document.fullscreenElement = docEl; } };
global.window = { Engine: E, devicePixelRatio: 3, innerWidth: 800, innerHeight: 360 };
global.innerWidth = 800; global.innerHeight = 360;
global.document = { documentElement: docEl, hidden: false, fullscreenElement: null,
  getElementById: id => (els[id] ||= mk(id)),
  createElement: () => mk('x'),
  querySelector: () => (els.__q ||= mk('__q')),
  querySelectorAll: q => (q === '.js-mute' ? [mk('m1', 'icon-btn js-mute'), mk('m2', 'chipbtn js-mute')] : q === '.js-full' ? [mk('f1', 'icon-btn js-full'), mk('f2', 'chipbtn js-full')] : []),
  addEventListener(t, h) { (wh['doc:' + t] ||= []).push(h); },
};
global.matchMedia = q => ({ matches: q.includes('coarse') });
global.addEventListener = (t, h) => { (wh[t] ||= []).push(h); };
Object.defineProperty(global, 'navigator', { configurable: true, writable: true, value: { vibrate: p => { vibCalls.push(p); return true; }, wakeLock: { request: async () => { wakeCalls++; return { addEventListener() {}, release() {} }; } }, serviceWorker: { register: () => { swReg++; return Promise.resolve(); } } } });
global.screen = { orientation: { lock: async () => { lockCalls++; }, unlock() {} } };
global.location = { protocol: 'https:' };
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; } };
global.crypto = require('crypto').webcrypto;
let t = 1000, raf = null;
global.performance = { now: () => t };
global.requestAnimationFrame = f => { raf = f; };
global.AudioContext = undefined;
const origCreate = E.create; let lastOpts = null, lastG = null;
E.create = (s, o) => { lastOpts = o; const g = origCreate(s, o); lastG = g; g.p.inv = 1e12; return g; }; // kebal agar sampai bos

require('../js/ui.js');
const fire = (type, ev = {}) => (wh[type] || []).forEach(h => h({ preventDefault() {}, repeat: false, ...ev }));
const tick = n => { for (let i = 0; i < n; i++) { t += 16.7; const f = raf; raf = null; f(t); } };
const ptr = (el, type, ev) => els[el].h[type]({ preventDefault() {}, pointerId: 1, ...ev });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fire('load'); tick(5);
  els['btn-play'].h.click();                 // klik "Main" (async: masuk layar penuh)
  await sleep(450); tick(2);
  if (fsCalls < 1 || lockCalls < 1) throw new Error('layar penuh/kunci orientasi tidak dipanggil');
  if (wakeCalls < 1) throw new Error('wake lock tidak dipanggil');
  if (!lastOpts || lastOpts.w < 900 || lastOpts.w > 1400) throw new Error('lebar arena tidak menyesuaikan layar: ' + JSON.stringify(lastOpts));
  console.log('arena', lastOpts.w + 'x600 | fullscreen', fsCalls, '| orientasi', lockCalls, '| wakeLock', wakeCalls);

  // layer sentuh harus tampil saat bermain; joystick melayang kiri + dash kanan
  tick(3);
  if (els.touch.hidden !== false) throw new Error('layer sentuh tidak tampil');
  ptr('touch', 'pointerdown', { clientX: 120, clientY: 250 });
  for (let i = 0; i < 20; i++) { ptr('touch', 'pointermove', { clientX: 120 + i * 4, clientY: 250 - i * 2 }); tick(3); }
  ptr('touch', 'pointerdown', { pointerId: 2, clientX: 700, clientY: 200 });  // ketuk kanan = dash
  tick(5);
  if (!vibCalls.length) throw new Error('getar tidak dipicu');
  ptr('touch', 'pointerup', {});

  let picks = 0, g = 0, maxWave = 0, sawBossBanner = false;
  while (g++ < 300000 && maxWave < 7) {
    lastG.p.inv = 1e12; tick(1);
    if (els.cards.hidden === false) { fire('keydown', { key: '1' }); picks++; }
    maxWave = Math.max(maxWave, lastG.wave);
    if (g % 40 === 0) { ptr('touch', 'pointerdown', { pointerId: 3, clientX: 90 + (g % 70), clientY: 240 }); tick(2); ptr('touch', 'pointerup', { pointerId: 3 }); }
    if (g % 90 === 0) ptr('touch', 'pointerdown', { pointerId: 4, clientX: 650, clientY: 220 });
  }
  if (maxWave < 7) throw new Error('tidak sampai gelombang 7 (bos di 5), wave=' + maxWave + ' mode=' + lastG.mode + ' en=' + lastG.enemies.length + ' q=' + lastG.spawnQ.length + ' hp=' + lastG.p.hp + ' picks=' + picks + ' cardsHidden=' + els.cards.hidden + ' t=' + lastG.t.toFixed(1));
  console.log('lewati bos: wave', maxWave, '| pilih kartu', picks, '| getar', vibCalls.length, 'kali | frame', g);

  fire('keydown', { key: 'p' }); tick(3); fire('keydown', { key: 'p' }); tick(3);          // jeda/lanjut
  global.matchMedia = q => ({ matches: q.includes('coarse') || q.includes('portrait') });  // putar ke potret
  fire('orientationchange'); tick(2);
  lastG.p.inv = 0; lastG.p.hp = 1; lastG.bullets.push({ x: lastG.p.x, y: lastG.p.y, vx: 0, vy: 0, r: 5, fr: false, dmg: 1, life: 5, bn: 0 });
  fire('keydown', { key: 'p' }); tick(2);                       // lanjutkan dari jeda otomatis potret
  tick(120); if (lastG.mode !== 'over') throw new Error('seharusnya kalah, mode=' + lastG.mode);
  await sleep(1300); tick(3);
  if (els.over.hidden !== false) throw new Error('layar game over tidak tampil');
  els.name.value = '<b>Bud!i</b>  '; els['name-form'].h.submit({ preventDefault() {} });
  const saved = JSON.parse(localStorage.getItem('distorsi.v1')).board;
  if (!saved.length || /[<>!]/.test(saved[0].n)) throw new Error('nama tidak disaring: ' + JSON.stringify(saved));
  console.log('skor tersimpan:', JSON.stringify(saved[0]));
  els['btn-menu'].h.click(); tick(3);
  if (els.menu.hidden !== false) throw new Error('menu tidak tampil');
  els['btn-vib'].h.click(); els['btn-gfx'].h.click(); els['btn-gfx'].h.click(); els['btn-gfx'].h.click(); tick(10);
  if (swReg < 1) throw new Error('service worker tidak didaftarkan');
  console.log('OK — UI Android lolos (tanpa error runtime)');
  process.exit(0);
})();
