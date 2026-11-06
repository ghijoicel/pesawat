// Uji otomatis mesin: invarian, determinisme, validasi input, stres semua hukum.
const E = require('../js/engine.js');
const assert = require('assert');
let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };

function allFinite(s) {
  const p = s.p;
  for (const k of ['x', 'y', 'vx', 'vy', 'hp', 'r', 'inv']) ok(Number.isFinite(p[k]), 'player.' + k);
  for (const e of s.enemies) for (const k of ['x', 'y', 'hp']) ok(Number.isFinite(e[k]), 'enemy.' + k);
  for (const b of s.bullets) for (const k of ['x', 'y', 'vx', 'vy']) ok(Number.isFinite(b[k]), 'bullet.' + k);
  ok(Number.isFinite(s.score) && Number.isFinite(s.ts) && s.ts > 0.2 && s.ts <= 1.0001, 'score/ts');
}
function invariants(s) {
  const p = s.p;
  ok(p.hp >= 0 && p.hp <= p.max, 'hp range');
  ok(p.x >= 0 && p.x <= s.W && p.y >= 0 && p.y <= s.H, 'player in arena');
  ok(s.bullets.length <= E.CAP.bullets && s.enemies.length <= E.CAP.enemies && s.shards.length <= E.CAP.shards, 'caps');
  ok(s.patches.length <= E.CAP.patches && s.echo.length <= E.CAP.echo && s.events.length <= E.CAP.events, 'caps2');
  for (const id in s.laws) ok(s.laws[id] <= E.MAXSTACK, 'stack max');
  for (const e of s.enemies) ok(e.x >= 0 && e.x <= s.W && e.y >= 0 && e.y <= s.H, 'enemy in arena');
  allFinite(s);
}

// 1) Lari acak biasa (tanpa kebal): tidak boleh error, harus berakhir wajar
for (let seed = 1; seed <= 30; seed++) {
  const s = E.create(seed), r = E.mulberry32(seed * 7);
  let ix = 0, iy = 0, dash = false;
  for (let f = 0; f < 60 * 120 && s.mode !== 'over'; f++) {
    if (f % 12 === 0) { ix = r() * 2 - 1; iy = r() * 2 - 1; dash = r() < 0.1; }
    if (s.mode === 'choosing') ok(E.pick(s, Math.floor(r() * 3)) || s.cards.length < 3, 'pick');
    E.step(s, 1 / 60, { x: ix, y: iy, dash });
    E.drain(s); invariants(s);
  }
}

// 2) Stres: pemain kebal, semua hukum bertumpuk, 25 menit permainan simulasi
let bossSeen = 0, bossKilled = 0;
for (let seed = 100; seed < 106; seed++) {
  const s = E.create(seed, { w: [800, 960, 1100, 1320, 1400, 99999][seed - 100] }), r = E.mulberry32(seed);
  let ix = 0, iy = 0, maxWave = 0;
  for (let f = 0; f < 60 * 1500 && s.mode !== 'over'; f++) {
    s.p.inv = 1e9;
    if (f % 20 === 0) { ix = r() * 2 - 1; iy = r() * 2 - 1; }
    if (s.mode === 'choosing') E.pick(s, 0);
    E.step(s, 1 / 60, { x: ix, y: iy, dash: f % 90 === 0 });
    if (s.enemies.some(e => e.type === 'boss')) bossSeen++;
    for (const ev of s.events) if (ev.type === 'bossdead') bossKilled++;
    if (f % 30 === 0) { E.drain(s); invariants(s); } else E.drain(s);
    maxWave = Math.max(maxWave, s.wave);
  }
  ok(maxWave >= 12, 'harus mencapai gelombang tinggi, dapat ' + maxWave);
  ok(Object.keys(s.laws).length >= 6, 'banyak hukum terkumpul');
}

ok(bossSeen > 0 && bossKilled >= 6, 'bos muncul & bisa dikalahkan: ' + bossSeen + '/' + bossKilled);

// 3) Determinisme: seed & input sama => hasil sama persis
function run(seed) {
  const s = E.create(seed), r = E.mulberry32(5);
  for (let f = 0; f < 6000 && s.mode !== 'over'; f++) {
    if (s.mode === 'choosing') E.pick(s, 1);
    E.step(s, 1 / 60, { x: Math.sin(f / 40), y: Math.cos(f / 55), dash: f % 100 === 0 });
    E.drain(s);
  }
  return JSON.stringify([s.score, s.wave, s.kills, s.p.hp, s.p.x.toFixed(4)]);
}
ok(run(42) === run(42), 'deterministik');
ok(run(42) !== run(43), 'seed berbeda => hasil berbeda');

// 4) Validasi input jahat / rusak
const s = E.create(9);
for (const bad of [NaN, Infinity, -Infinity, 1e308, 'x', null, undefined, {}]) {
  E.step(s, bad, { x: bad, y: bad, dash: bad }); allFinite(s);
}
E.step(s, 1 / 60, null); E.step(s, 1 / 60); E.step(s, 5, { x: 1, y: 1 }); allFinite(s);
ok(E.pick(s, 0) === false, 'pick di luar fase memilih ditolak');
s.mode = 'choosing'; s.cards = ['waktu', 'gema', 'bilah'];
for (const bad of [-1, 3, 1.5, NaN, '0', null, undefined, Infinity]) ok(E.pick(s, bad) === false, 'pick invalid ' + bad);
ok(E.pick(s, 1) === true && s.laws.gema === 1 && s.mode === 'playing', 'pick valid');
s.mode = 'choosing'; s.cards = ['__proto__']; ok(E.pick(s, 0) === false, 'id kartu tak dikenal ditolak');
s.mode = 'over'; const before = JSON.stringify(s.p); E.step(s, 1 / 60, { x: 1 }); ok(JSON.stringify(s.p) === before, 'tidak bergerak setelah kalah');

// 5) Mekanik: dash membuat kebal, kena peluru mengurangi nyawa & tidak lewat 0
const t = E.create(3); t.p.inv = 0; t.enemies = []; t.spawnQ = ['drifter'];
t.bullets.push({ x: t.p.x, y: t.p.y, vx: 0, vy: 0, r: 5, fr: false, dmg: 1, life: 5, bn: 0 });
E.step(t, 1 / 60, {}); ok(t.p.hp === 4, 'kena peluru -1 hp');
t.p.inv = 0; t.p.dash = 0.1; t.bullets.push({ x: t.p.x, y: t.p.y, vx: 0, vy: 0, r: 5, fr: false, dmg: 1, life: 5, bn: 0 });
E.step(t, 1 / 60, {}); ok(t.p.hp === 4, 'dash kebal');

console.log('SEMUA UJI LULUS —', checks, 'pemeriksaan');
