# DISTORSI v2 — Tulis Ulang Hukum Semesta

Game aksi arena (HTML5 Canvas + JavaScript murni, tanpa library, tanpa server, tanpa internet).

## Menjalankan
- **Desktop:** buka `index.html` di browser modern (opsional: `python3 -m http.server` → http://localhost:8000).
- **Android:** lihat bagian "Main di Android" di bawah.

## Baru di v2
- **Bos "Raja Retak"** tiap 5 gelombang, 3 fase serangan (cincin peluru → tembakan sebar → pusaran spiral). Mengalahkannya menambah nyawa maksimum (+1, sampai 7).
- **Arena menyesuaikan rasio layar** (mode Bebas): di HP layar lebar arena ikut melebar tanpa bar hitam. Tantangan Harian tetap 960×600 agar adil.
- **Pengaturan:** suara, getar, kualitas grafis (Otomatis / Tinggi / Rendah). Mode Otomatis menurunkan efek sendiri kalau FPS rendah (HP kentang).

## Main di Android
Fitur kenyamanan: layar penuh + kunci landscape, joystick melayang (sentuh di mana saja di sisi kiri), ketuk sisi kanan = dash,
getar (haptic) saat terkena/dash/bos, layar tidak mati saat bermain, jeda otomatis saat aplikasi ditinggal atau layar dipotret,
peringatan "putar ke landscape", mendukung poni/notch, tanpa zoom/pull-to-refresh, bisa **dipasang seperti aplikasi** dan jalan **offline**.

Cara memainkan (pilih salah satu):
1. **Paling cepat:** buka lewat alamat web (lihat 2/3) di Chrome, tekan **Main** → otomatis layar penuh & landscape.
2. **Pasang sebagai aplikasi (disarankan):** unggah folder ini ke hosting statis HTTPS gratis (Netlify Drop, GitHub Pages, Cloudflare Pages).
   Buka di Chrome Android → tombol **📲 Pasang Aplikasi** di menu (atau menu ⋮ → *Instal aplikasi*). Ikon muncul di layar utama,
   berjalan fullscreen dan offline.
3. **Tanpa hosting:** di Termux jalankan `pkg install python && cd folder-game && python -m http.server 8000`,
   buka `http://localhost:8000` di Chrome (localhost dianggap aman, jadi bisa dipasang).
4. **Jadi APK (opsional):** masukkan URL hosting ke PWABuilder.com atau Bubblewrap (TWA).
Catatan: membuka `index.html` langsung dari pengelola file (`file://`) tetap bisa dimainkan, tetapi tidak bisa dipasang/offline.
iPhone/iPad tidak mendukung API layar penuh; gunakan Safari → Bagikan → *Tambah ke Layar Utama*.

## Ide inti
Di game arena biasa kamu menaikkan *angka* (damage, HP). Di DISTORSI kamu menulis ulang *hukum fisika* dunia.
Tiap gelombang selesai, pilih 1 dari 3 **Hukum Semesta**. Setiap hukum punya untung dan harga, dan hukum-hukum
saling bertabrakan secara kreatif (maks 3 tingkat per hukum):

| Hukum | Untung | Harga |
|---|---|---|
| ⏳ Waktu Mengikuti Gerak | Dunia melambat saat kamu diam | Tembakanmu ikut melambat |
| 🪞 Dinding Cermin | Pelurumu memantul | Peluru musuh memantul juga |
| 🔁 Gema Tembakan | Tembakan diulang oleh gema masa lalu | Tembak 15% lebih lambat |
| 🧲 Magnet Jiwa | Serpihan tersedot dari jauh | Tubuh 15% lebih besar |
| 🔥 Jejak Api | Gerakanmu membakar musuh | Dash lebih lama pulih |
| 🕳️ Lubang Hitam | Menelan peluru, melukai musuh | Menarik dirimu juga |
| 💥 Pecah Belah | Musuh mati jadi pecahan peluru | Musuh lebih cepat |
| 🌀 Bilah Berputar | Bilah mengorbit menebas | Gerak −8% |
| 💓 Denyut Jantung | Gelombang kejut hapus peluru | Kekebalan pasca-luka lebih singkat |

Kontrol: WASD/panah gerak · Spasi/Shift dash · P/Esc jeda · 1/2/3 pilih kartu · sentuh: geser di kiri = gerak, ketuk di kanan = dash.
Tembakan otomatis membidik musuh terdekat. Mode **Tantangan Harian** memakai seed yang sama untuk semua orang hari itu.

## Struktur
- `js/engine.js` mesin logika murni (tanpa DOM, deterministik berdasarkan seed)
- `js/ui.js` render canvas, efek, suara sintetis, input, penyimpanan
- `css/style.css` tampilan neon · `index.html` · `manifest.webmanifest` + `sw.js` + `icons/` (PWA)
- `tests/sim.test.js` uji mesin · `tests/ui.smoke.js` uji asap UI → jalankan `node tests/sim.test.js`

## Keamanan
- CSP ketat di `index.html` (`default-src 'none'`, script hanya dari file sendiri, tanpa koneksi jaringan, tanpa inline script).
- Service worker hanya meng-cache file milik sendiri (same-origin, GET); tidak ada permintaan ke server lain.
- Tanpa `eval`, tanpa `innerHTML`; semua teks dari pengguna memakai `textContent` dan nama papan skor disaring.
- Data `localStorage` divalidasi ketat saat dibaca; data rusak diabaikan.
- Input tak valid (NaN, Infinity, indeks kartu aneh) ditolak oleh mesin.
- Catatan jujur: game client-side tidak bisa dicegah dari manipulasi skor oleh pemainnya sendiri; papan skor bersifat lokal.
