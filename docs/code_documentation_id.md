# Dokumentasi Kode Lengkap

**Proyek:** MAYUNG — Sistem Ticketing & Manajemen Jaringan FTTH untuk sebuah ISP di Lombok, NTB.
**Stack:** Node.js / Express 5 + MySQL 8 · frontend multi-halaman JavaScript vanilla (tanpa framework, tanpa bundler) · PWA · notifikasi WhatsApp via Fonnte.
**Terakhir diperbarui:** 2026-09-07 (branch `chore/sync-working-tree`, sesudah rangkaian "Sprint 1–4" + pekerjaan SLA/KPI + `overrides` mysql2).

Semua teks campur Indonesia/Inggris. Skema DB memakai nama kolom Indonesia (`aktifitas`, `lokasi`, `sub_node`, `date_selesai`). Status tiket: `Terlapor → Dikerjakan → Selesai`, plus `Pending`. Status PSB: `Terdaftar → Terpasang → Aktif`, atau `Batal`.

---

## Daftar isi

1. [Ikhtisar arsitektur](#1-ikhtisar-arsitektur)
2. [Request lifecycle — `server.js`](#2-request-lifecycle--serverjs)
3. [Middleware](#3-middleware)
4. [Routes](#4-routes)
5. [Services & utilities](#5-services--utilities)
6. [Frontend](#6-frontend)
7. [Database](#7-database)
8. [Pola yang berulang](#8-pola-yang-berulang)
9. [Alur kerja utama](#9-alur-kerja-utama)
10. [Keamanan](#10-keamanan)
11. [Testing & CI](#11-testing--ci)
12. [Known issues / sharp edges](#12-known-issues--sharp-edges)

---

## 1. Ikhtisar arsitektur

Aplikasi multi-halaman (MPA), bukan SPA — tiap navigasi = full page load. Tiap `*.html` memuat file JS senama plus beberapa file bersama.

| Layer | File |
|---|---|
| Backend JS | `server.js` + 11 routes + 7 middleware + 5 utils + 1 service |
| Frontend | 13 halaman HTML + 17 skrip JS (5 bersama + 12 per-halaman) + 1 CSS (~5070 baris) |
| Database | 11 tabel aplikasi + `sessions` (dikelola otomatis oleh `express-mysql-session`) |
| Scripts | Migrasi SQL upgrade-only + seed SQL + 2 backfill Node + 2 skrip shell |
| Tests | 9 file `*.test.js` (Mocha + Supertest) + 1 helper bersama — ~55 kasus `it()` |

**Keputusan desain inti**

- **Auth berbasis session** dengan store MySQL — session bertahan lewat restart server (dan reload `node --watch`).
- **RBAC** dipaksakan di server oleh `middleware/auth.js` (tiga guard) dan sekadar kosmetik oleh `navbar.js`. Guard server yang menentukan.
- **`asyncHandler`** membungkus tiap handler route, jadi kode route tidak punya boilerplate `try/catch`; kegagalan validasi yang disengaja tetap `return res.status(4xx).json(...)`.
- **Transaksi dengan `SELECT … FOR UPDATE`** untuk setiap write yang punya invariant lintas-baris atau efek samping sekali-saja (lihat §8.6).
- **Dua sistem logging terpisah**: `audit_logs` (level bisnis, dibaca Owner di app) dan `logs/detail-*.log` (level teknis, hanya file).
- **Tanpa bundler / build step** — library CDN di-lazy-load saat dibutuhkan.

---

## 2. Request lifecycle — `server.js`

Urutan middleware penting — beberapa masalah keamanan nyata muncul persis karena urutan yang salah. Rantai lengkapnya, dan alasan tiap posisi:

1. **`GET /health`** — didaftarkan *paling awal*, sebelum helmet/CSRF/session/rate-limit. Load balancer & uptime monitor tidak butuh cookie/token dan tidak boleh kena rate limit. Menjalankan `SELECT 1` ke DB dan mengembalikan `{status, db, uptime}` — 200 kalau terjangkau, 503 kalau tidak.
2. **`app.set('trust proxy', 1)`** kecuali `TRUST_PROXY=false`. Tanpa ini `req.ip` selalu jadi alamat reverse proxy untuk *semua* klien — rate limiter jadi satu counter bersama untuk seluruh kantor, dan `audit_logs` mencatat IP salah.
3. **Body parser** — `express.json()` + `express.urlencoded()`. Multipart ditangani per-route oleh multer, bukan di sini.
4. **Helmet** dengan `contentSecurityPolicy: false`. CSP global dengan `'unsafe-inline'` pada `script-src` akan menolak skrip registrasi service worker, jadi CSP di-set manual per dokumen HTML di langkah 6. Referrer-Policy diubah dari default `no-referrer` ke `strict-origin-when-cross-origin` — kalau tidak, OpenStreetMap menolak request tile dengan 403.
5. **`csrfMiddleware`** — *harus sebelum* `express.static`. Kalau tidak, cookie `csrf-token` tidak pernah di-set saat browser meng-GET halaman HTML statis, dan POST pertama selalu 403.
6. **Header CSP per-dokumen** — hanya untuk `req.path === '/'` atau `*.html`. Mengizinkan Google Fonts, cdnjs (Leaflet, jsPDF), jsdelivr (Chart.js), tile OSM.
7. **Session** (`express-session` + `express-mysql-session`). Dipindah *sebelum* `express.static` pada suatu perbaikan keamanan: dulu `public/uploads/` (foto bukti tiket, foto profil, foto PSB pelanggan — semua privat) terlayani ke internet tanpa login karena session di-setup setelahnya. Cookie: `httpOnly`, `sameSite: strict`, `Secure` saat `NODE_ENV=production`, 24 jam. Store: expiry 24 jam, pembersihan tiap 15 menit; juga membaca `DB_PORT`.
8. **Gate auth `/uploads`** — middleware kecil sebelum static handler umum: butuh session, *kecuali* file itu adalah `settings.company_logo` yang sedang aktif (tampil di halaman login, pra-auth). Dicek terhadap nilai settings live, jadi logo baru otomatis ikut terlindungi.
9. **`express.static('public')`** — HTML, CSS, JS, gambar, `sw.js`, `manifest.json`.
10. **`detailLog`** — mencatat tiap request ke `logs/detail-*.log` saat `res.on('finish')` (method, url, query, params, body dengan redaksi key sensitif, status, durasi, user/role/ip, UA). Teknis, tidak tampil di app, retensi 7 hari.
11. **`globalLimiter`** — 1000 request / 15 menit per IP. Aset statis (langkah 9) sudah lolos duluan, jadi ini praktis cuma menghitung request dinamis. Lihat §12 — angka ini punya interaksi berbahaya dengan polling bawaan dan loop export.
12. **Mount 11 router** di `/`. Urutan mount penting untuk rate limiter per-route (§8.2).
13. **`GET /api/audit`** inline (Owner-only, terpaginasi) — membaca `audit_logs`.
14. **Error handler global** — menangkap `MulterError` (400), konten bukan-gambar (`INVALID_IMAGE_CONTENT`, 400), sisanya 500.
15. **`app.listen`** + **graceful shutdown**: `SIGTERM`/`SIGINT` → tutup HTTP server → session store → pool DB, dengan timeout paksa 10 detik. Terjadi otomatis tiap `npm run dev` restart karena file berubah.

Pool DB: `connectionLimit: 10`, `queueLimit: 30`. `queueLimit: 0` di mysql2 berarti antrean *tak terbatas* (bukan "tidak boleh antre"); dibatasi supaya kelebihan beban gagal cepat dengan `ER_CON_COUNT_ERROR` alih-alih menumpuk di memori.

---

## 3. Middleware

### `middleware/auth.js`
Tiga guard: `isAuthenticated` (`req.session.user` ada → else 401), `isAdmin` (`role === 'Owner'` → else 403), `isOwnerOrOperator` (`Owner`/`Operator` → else 403).

### `middleware/asyncHandler.js`
`Promise.resolve(fn(req,res,next)).catch(...)` — me-log error via Winston lalu mengirim 500. Menghapus `try/catch` dari kode route.

### `middleware/csrf.js`
Pola double-submit cookie. GET/HEAD/OPTIONS: set cookie `csrf-token` (non-httpOnly, `sameSite: strict`, `Secure` di production) kalau belum ada. POST/PUT/PATCH/DELETE: bandingkan cookie vs header `X-CSRF-Token` pakai `crypto.timingSafeEqual` → 403 kalau tidak cocok, lalu **rotasi token**. Di-mount sebelum body parser multipart, jadi token FormData harus lewat header (frontend `csrfFetch` juga meng-append field `_csrf_token` sebagai cadangan).

### `middleware/rateLimits.js`
Factory `mutationLimiter(label, max = 60)` — satu instance per file route, hanya menghitung non-GET/HEAD/OPTIONS, jendela 15 menit per IP. **`message` tiap limiter berupa objek** (`{ message: '...' }`), bukan string — handler default `express-rate-limit` melakukan `res.send(message)` apa adanya, jadi string keluar sebagai `text/html` dan `await response.json()` frontend melempar `SyntaxError` pada 429, menyembunyikan pesan asli dengan "An error occurred" generik. **Dipasang per-route, bukan lewat `router.use()`** — semua router di-mount di `/`, jadi `router.use(fn)` tanpa path juga jalan untuk request yang ujungnya ditangani router yang di-mount *lebih belakang*, membocorkan kuota lintas grup endpoint (ketahuan saat kuota `users` habis oleh trafik `/tickets`+`/psb`+`/ftth` gabungan).

### `middleware/upload.js`
Multer: storage disk di `public/uploads/`, nama file `<timestamp>-<disanitasi>`, batas 5 MB, gambar saja. `.single(field)` yang diekspor **dibungkus verifikasi magic bytes** — setelah file ditulis, byte pertamanya dicek (JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `47 49 46 38`, WebP `RIFF`…`WEBP`). File `x.png` yang isinya HTML dihapus & ditolak dengan `INVALID_IMAGE_CONTENT`.

### `middleware/detailLog.js` (+ `utils/detailLog.js`)
Logging request/response teknis ke `logs/detail-*.log` (Winston `DailyRotateFile`, tanpa transport console, retensi 7 hari). Key sensitif (`password`, `newPassword`, `currentPassword`, `token`, `cookie`, `secret`, …) jadi `***`; kedalaman objek dibatasi; string panjang dipotong.

### `middleware/audit.js`
`audit(req, action, targetType, targetId, details)` → `INSERT audit_logs` (username, IP, JSON `details`). Kegagalan ditelan — masalah logging tidak pernah menggagalkan request. Dipanggil dari `tickets.js`, `users.js`, `inventory.js`, `ftth.js`, `references.js`, `psb.js` (termasuk draft ONU auto pada transisi Terpasang, dicatat sebagai entri `ftth` terpisah). **Tidak** dipanggil dari `settings.js` — update-nya ter-detail-log tapi tidak punya jejak audit yang bisa di-query.

---

## 4. Routes

Semua di-mount di `/` (tanpa prefix). Tidak ada yang menyimpan data sendiri — semua lewat `db.js`. Tiap file mengekspor `express.Router()` dan mendefinisikan helper DTO `mapX()` (baris DB snake_case → JSON camelCase).

### 4.1 `routes/auth.js`
- **`POST /login`** — `loginLimiter` 5/15 mnt. `body('username').trim().escape()`, `body('password').trim().notEmpty()` (password di-trim tapi **tidak** di-escape — hanya dibandingkan bcrypt, dan trim harus sama dengan jalur set-password di `register`/`update-profile`/`admin/users/update`). `SELECT * FROM users WHERE username = ? AND deleted_at IS NULL AND is_active = TRUE`. Kalau user tidak ada, tetap jalankan `bcrypt.compare(password, DUMMY_HASH)` untuk menyamakan waktu respons, lalu 401. Kalau sukses: `req.session.regenerate()` (anti session-fixation) *sebelum* set `req.session.user`.
- **`POST /logout`** — hancurkan session, hapus cookie.
- **`POST /register`** — `isAuthenticated + isAdmin` (Owner saja; tidak ada UI registrasi mandiri). `registerLimiter` 5/jam. `upload.single('photo')`. Password bcrypt 10 rounds, min 8 + huruf DAN angka. Nomor disanitasi. Role di-whitelist.

### 4.2 `routes/users.js`
- **`GET /users`** — `isOwnerOrOperator`. SELECT kolom eksplisit (tanpa password), termasuk `default_sub_node`.
- **`GET /users/:username`** — self atau Owner/Operator.
- **`POST /update-profile`** — self saja, `profileUpdateLimiter` 5/15 mnt, `upload.single('photo')`. Butuh password lama (`bcrypt.compare`). Aturan password baru = milik register. Hapus foto profil lama dari disk (kecuali `/uploads/default.png`).
- **`POST /update-role`** — Owner saja. `isIn(['Owner','Operator','Teknisi'])`; blokir menurunkan diri sendiri; panggil `revokeUserSessions(username)` supaya session user yang diubah langsung mati.
- **`POST /admin/users/update`** — Owner/Operator. Operator tidak bisa mengubah akun Owner atau promote siapa pun ke Owner.
- **`DELETE /users/:username`** + **`POST /users/:username/restore`** — Owner saja. Soft-delete (`deleted_at`), blokir hapus diri sendiri, cabut session.

### 4.3 `routes/tickets.js`
File inti. Helper: `validateRef` (odc/odp → `ftth_devices`, sisanya → `reference_options`), `lookupFtthDeviceId` (mengisi `ftth_odc_id`/`ftth_odp_id`), `validateUsername` (PIC harus ada & tidak soft-deleted), `validatePsbId`, `escapeLike`, `buildTicketWhere`, `SORT_MAP` (whitelist kolom sort), `VALID_TRANSITIONS`.

- **`GET /tickets`** — terpaginasi (`?page=&limit=`, default 10, maks 100) atau, tanpa `?page`, semua baris (dashboard + loop export). Filter: `search` (`LIKE … ESCAPE '\\'` di aktifitas/sub_node/lokasi/pic/info), `status` (list koma → `IN`), `priority`, `startDate`/`endDate` (tanggal tak valid diabaikan, bukan 500). Sort server-side via `SORT_MAP` + `?order=ASC|DESC`, default `created_at DESC`. RBAC: Teknisi dapat `AND (created_by = ? OR pic = ?)`.
- **`POST /tickets`** — `ticketsMutationLimiter`, `upload.single('evidence')`, express-validator. `createdBy` harus sama dengan session user. Status awal hanya `Terlapor`/`Pending`. **Transaksi**: `INSERT tickets` + `INSERT ticket_status_history (old=NULL, new=status)` di koneksi yang sama → commit. Setelah commit: `notifyTicketCreated()` (fire-and-forget) + `audit()`.
- **`GET /tickets/:id`** — IDOR: creator / PIC / Owner / Operator.
- **`POST /tickets/:id/update`** — IDOR (sama). Pembatasan field per-role: untuk Teknisi, hanya `status`/`info`/`evidence` yang diterapkan; field lain (aktifitas/pic/priority/odc/odp/lokasi) di-drop diam-diam. **Transaksi**: `SELECT … FOR UPDATE` tiket → validasi transisi terhadap `current.status` (baris terkunci, bukan snapshot basi) → kalau masuk `Selesai` dan tidak ada file baru dan `current.evidence` kosong, **tolak** (foto bukti wajib, semua role) → `UPDATE tickets` → `INSERT ticket_status_history` → set/kosongkan `date_selesai` → kalau `current.psb_id` dan status baru `Selesai`, `UPDATE psb SET status='Terpasang' WHERE id=? AND status='Terdaftar'` (hanya maju, tidak pernah menimpa `Batal` atau status yang sudah lebih maju). Setelah commit: notifikasi WA, hapus file evidence lama, `audit()` (dua kali kalau PSB ikut ter-sync). `ftth_odc_id`/`ftth_odp_id` di-derive ulang kapan pun teks `odc`/`odp` diperbarui.
- **`GET /tickets/:id/history`** — riwayat status `LEFT JOIN users`.
- **`DELETE /tickets/:id`** — **`isAdmin` (Owner saja)**. Soft-delete (`deleted_at = NOW()`).
- **`GET /api/auto-pic?subNode=`** — lihat §9.4.

**Transisi status valid:**
```
Terlapor   → Dikerjakan, Pending
Dikerjakan → Selesai, Pending, Terlapor
Selesai    → Dikerjakan          (satu-satunya jalan keluar)
Pending    → Dikerjakan, Terlapor
```

### 4.4 `routes/activities.js`
- **`POST /activities`** — `activitiesMutationLimiter`, cek `username` sama dengan session. `ticket_id` opsional. **IDOR guard**: kalau `ticket_id` diisi, tiket di-fetch dan — untuk Teknisi — harus `created_by`/`pic` milik pemanggil (Owner/Operator boleh melampirkan ke tiket mana pun). Tanpa ini, Teknisi bisa POST dengan `ticket_id` orang lain lalu baca balik `tickets.aktifitas` lewat `GET /activities` (join-nya tidak dibatasi kepemilikan). **Auto-start**: kalau pemanggil Teknisi dan status tiket `Terlapor`/`Pending`, sebuah transaksi mengunci tiket, memvalidasi ulang, lalu memindahkannya ke `Dikerjakan` + tulis history + insert aktivitas secara atomik; kalau tidak, insert biasa. Pada auto-transisi: `audit()` + notifikasi WA.
- **`GET /activities`** — terpaginasi. Owner/Operator lihat semua (filter `search`/`username`); Teknisi lihat miliknya saja.
- **`DELETE /activities/:id`** — Owner/Operator (dicek di handler). *Catatan:* `activity.js` hanya menampilkan tombol hapus untuk Owner, jadi Operator hanya bisa lewat API.

### 4.5 `routes/psb.js`
Helper: `validateOdpLabel` (→ `ftth_devices`), `lookupOdpId` (mengisi `ftth_odp_id`), `checkOnuConflicts` (bersama, `utils/ftthConflicts.js`). `VALID_PSB_STATUS = ['Terdaftar','Terpasang','Aktif','Batal']` (cek keanggotaan saja — **tidak ada graf transisi**).
- **`GET /api/psb`** / **`GET /api/psb/:id`** — authenticated.
- **`POST /api/psb`** — semua role, `upload.single('photo')`. `customerName` + `address` wajib; `odpLabel` divalidasi; nomor disanitasi; `ftth_odp_id` diisi.
- **`PUT /api/psb/:id`** — Owner/Operator, `upload.single('photo')`. **Transaksi** + `SELECT … FOR UPDATE`. Bangun `UPDATE … SET` dari field yang dikirim (masing-masing divalidasi). Lalu efek samping inventory/FTTH terpicu saat **`status === 'Terpasang' && !existing.ftth_device_id`** (`needsInventoryLink`, cacat #1 Sprint 3 — lihat §9.6): wajib `inventoryId`, kunci baris inventory itu, cek `remaining >= 1`, jalankan `checkOnuConflicts()` *sebelum* menyentuh stok, lalu `UPDATE inventory SET used_stock = used_stock + 1` + `INSERT inventory_log ('out', 1, 'psb', <id>)` + `INSERT ftth_devices ('onu', …, is_draft=TRUE)` + `UPDATE psb SET ftth_device_id = <draft.insertId>`. `ftth_device_id` yang non-NULL itu sendiri jadi penjaga terhadap decrement stok kedua.
- **`DELETE /api/psb/:id`** — **`isAdmin` (Owner saja)**. Hard-delete.

### 4.6 `routes/ftth.js`
Topologi FTTH otoritatif (`ftth_devices`, bukan `reference_options`). `VALID_TYPES = ['olt','odc','odp','onu']`.
- **`GET /api/ftth`** — authenticated. `{ data: <dikelompokkan per type>, stats }` di mana `stats` termasuk `draftCount`.
- **`GET /api/ftth/available-ports?type=&parent=`** — authenticated. **Harus dideklarasikan sebelum `/:id`.** Port terpakai = anak dengan `group_name = parent` **dan `type` yang cocok** (filter type penting — tanpanya, ODC dan ODP yang berbagi `group_name` akan saling mengunci port). Untuk induk ODC/ODP, **Port 1 di-reserve sebagai uplink**, jadi anak mulai dari Port 2; anak OLT mulai dari Port 1.
- **`POST /api/ftth`** — Owner/Operator. Validasi spesifik tipe (OLT: brand + `total_ports >= 1`). Untuk ONU: `checkOnuConflicts()`. Untuk ODC/ODP: cek konflik inline `WHERE group_name=? AND type=? AND parent_port=?`. Tangani `ER_DUP_ENTRY` → pesan ramah.
- **`PUT /api/ftth/:id`** — Owner/Operator. Juga menerima `is_draft: false` untuk **mengonfirmasi draft** (draft→resmi saja; `confirmingDraft` menjalankan ulang `checkOnuConflicts()` terhadap nilai *efektif* — nilai tersimpan kalau field tidak dikirim ulang — menutup celah di mana draft yang bentrok bisa dikonfirmasi dengan menghilangkan field-nya). Kalau `label` berubah dan device punya anak, sebuah **transaksi** memperbarui `group_name` tiap anak (hierarki berbasis label) *dan* meng-cascade label baru ke `tickets.odc`/`tickets.odp` (lewat `ftth_odc_id`/`ftth_odp_id`) dan `psb.odp_label` (lewat `ftth_odp_id`) — cacat #5, Sprint 2.
- **`DELETE /api/ftth/:id`** — **`isAdmin` (Owner saja)**. Ditolak kalau `SELECT … WHERE group_name = <label>` menemukan anak (error-nya menyebut mereka).

### 4.7 `routes/geo.js`
- **`GET /api/geo`** — authenticated, read-only. Empat query (OLT/ODC/ODP/ONU) difilter ke `latitude IS NOT NULL AND longitude IS NOT NULL`, plus hitungan `stats`. Menyuplai `map.html`.

### 4.8 `routes/references.js`
CRUD atas `reference_options`. `referencesMutationLimiter` (max 100 — referensi sering di-bulk-edit).
- **`GET /api/references`** — authenticated. Dikelompokkan per `type`.
- **`POST` / `PUT` / `DELETE /api/references/:id`** — **`isAdmin` (Owner saja)**. Whitelist `validTypes`. `ER_DUP_ENTRY` → pesan ramah. `DELETE` lebih dulu memanggil `countReferenceUsage()` — `aktifitas`/`sub_node`/`priority` terhadap `tickets`, `sub_node` juga terhadap `users.default_sub_node`, `inventory_type` terhadap `inventory` — dan menolak dengan 400 kalau label masih dipakai (cacat #6, Sprint 2).

### 4.9 `routes/inventory.js`
- **`GET /api/inventory`** — authenticated. `SELECT *, (total_stock - used_stock) AS remaining`.
- **`GET /api/inventory/log`** — Owner/Operator. `LEFT JOIN inventory` (bukan INNER — supaya histori pemakaian item yang dihapus tetap terlihat; FK-nya `ON DELETE SET NULL`).
- **`POST /api/inventory`** — Owner/Operator. `validateDeviceType` terhadap `reference_options` (`type='inventory_type'`). `attributes` disimpan sebagai JSON.
- **`PUT /api/inventory/:id`** — Owner/Operator. **Transaksi** + `SELECT … FOR UPDATE`: delta dihitung dari baris terkunci; `total_stock`/`used_stock` dijaga (`>= 0`, `used <= total`); tiap perubahan menulis baris `inventory_log` yang konsisten dengan nilai akhir.
- **`DELETE /api/inventory/:id`** — **`isAdmin` (Owner saja)**.

### 4.10 `routes/settings.js`
- **`GET /settings/company-name`** / **`/company-logo`** — **publik** (tampil di halaman login). Nama default `'MAYUNG'`.
- **`POST` keduanya** — **`isAdmin` (Owner saja)**. `settingsMutationLimiter`. Disimpan di `settings` via `INSERT … ON DUPLICATE KEY UPDATE`. File logo lama di-unlink dari disk.

### 4.11 `routes/stats.js`
- **`GET /api/stats/month`** — authenticated. Satu ambilan agregat untuk dashboard:
  - Total tiket terbuka + bucket aging (`today` / `1–2 hari` / `older`), selesai bulan/pekan/total, `sla.avgHours` = `AVG(TIMESTAMPDIFF(HOUR, created_at, date_selesai))`, `statusBreakdown`.
  - **Target & kepatuhan SLA**: `SLA_TARGET_HOURS = { Urgent: 2, Critical: 4, Moderate: 12, Low: 48 }` (hardcoded, dikonfirmasi pemilik produk). Prioritas di luar 4 nama ini sengaja dikecualikan dari semua angka SLA (tidak ada target untuk menilainya — tidak pernah ditebak): absen dari `sla.byPriority` dan tidak dihitung di numerator/denominator `sla.metPercent`. Juga `sla.breached` (tiket terbuka sudah lewat target) dan `sla.atRisk` (tiket terbuka lewat 80% target tapi belum breached) — sinyal peringatan dini, bukan cuma pelaporan setelah kejadian.
  - **`teknisiPerformance`** — per-PIC `doneCount`/`avgHours`/`slaMetPercent` untuk tiket selesai bulan ini. **Owner/Operator saja** — field-nya `undefined` (absen dari JSON) untuk pemanggil Teknisi.
  - Blok **`teknisi`** (hanya saat `role === 'Teknisi'`): my open / my attention / aktivitas pekan & hari ini / selesai bulan ini (sebagai PIC) / SLA rata-rata saya.
  - Breakdown by-priority dan per-Teknisi diturunkan dari *satu* result set mentah "selesai bulan ini" yang sama (di-fetch sekali, di-agregasi di Node), jadi tidak bisa saling drift.

---

## 5. Services & utilities

### `services/notification.js`
WhatsApp via [Fonnte API](https://fonnte.com).
- **`sendWhatsApp(phone, message)`** — normalisasi nomor ke `62xx` (`utils/phone.js`), 3 retry exponential backoff (1s / 3s / 7s), timeout 10s, skip diam-diam kalau `FONNTE_TOKEN` kosong, tidak retry 4xx permanen.
- **`notifyTicketCreated(ticket)`** / **`notifyTicketUpdated(ticketId, oldStatus, newStatus, changedBy, ticketData)`** — fire-and-forget ke pembuat tiket + PIC. **Operator sengaja tidak diikutkan** ("sesuai permintaan client"). `getAllOperatorPhones()` ada tapi tidak dipakai (sisa desain lama). Juga dipanggil dari `activities.js` pada transisi auto-start.
- Tiap badan pesan diakhiri `Detail: <APP_URL>/ticket-details.html?id=<id>` — link membuka tiket setelah penerima login (halaman tetap redirect ke login tanpa session; bukan bypass auth). `getAppUrl()` memangkas trailing slash, dan menulis warning sekali kalau `APP_URL` tidak diisi di production (link jatuh ke `http://localhost:<PORT>`, tidak bisa dibuka penerima).

### `utils/logger.js`
Winston + `winston-daily-rotate-file`. Dua transport: `logs/error-*.log` (level `error`) dan `logs/app-*.log` (semua), rotasi harian, `datePattern: 'YYYY-MM-DD'`, maks 20 MB per file, **retensi 7 hari**. Menambah transport console berwarna saat `NODE_ENV !== 'production'`.

### `utils/detailLog.js`
Logger Winston kedua untuk `logs/detail-*.log` — **tanpa transport console** (detail log tidak boleh muncul di terminal). Dipakai `middleware/detailLog.js`.

### `utils/phone.js`
`sanitizePhone(str)` → nomor Indonesia (`08xx`, `+628xx`, `628xx`) dinormalisasi ke `628xxxxxxxxxx`, atau `null` kalau tidak valid (min 10 digit). `isValidPhone` = wrapper boolean.

### `utils/uploads.js`
`cleanupUploadOnError(req)` — unlink file yang sudah ditulis multer ke disk kalau `INSERT`/`UPDATE` setelahnya gagal, supaya `public/uploads/` tidak menumpuk file yatim. Dipanggil dari catch path setiap route upload.

### `utils/ftthConflicts.js`
`checkOnuConflicts(queryable, { serialNumber, groupName, parentPort, excludeId })` — cek `serial_number` (unik global) dan `parent_port` (unik dalam `group_name`-nya, yaitu ODP induk) kandidat ONU terhadap `ftth_devices`. `queryable` bisa pool *atau* transaction connection. Dipakai bersama tiga call site supaya aturannya tidak bisa menyimpang: `ftth.js` `POST`, `ftth.js` `PUT` (termasuk konfirmasi draft), dan blok `needsInventoryLink` di `psb.js` (cacat #2, Sprint 3).

---

## 6. Frontend

### 6.1 Model
- **State** ada di `localStorage.user` = `{id, username, fullName, role, phone, photo}`. Tiap halaman (kecuali login/offline) mulai dengan `if (!user) location.href = 'index.html'`.
- **Setiap write lewat `csrfFetch()`** (`js/csrf.js`) — membaca cookie `csrf-token` di *setiap* panggilan (tidak di-cache), menambah header `X-CSRF-Token` dan, untuk FormData, juga meng-append field `_csrf_token`.
- **Global bersama** (dideklarasikan di `.eslintrc.json`): `ROLES`, `isPrivileged()`, `formatId()`, `phoneOnly`/`validatePhone`, `apiFetch()` (401 → redirect), `getTheme/applyTheme/toggleTheme` (dark mode: `localStorage.theme` + `<html data-theme>`), `initPasswordToggle()`, `compressImageFile()` (downscale ≤1920px + turunkan kualitas JPEG sampai <~4,5 MB sebelum upload, hormati orientasi EXIF), `esc()`, `showModal/showToast/showConfirm`.
- **Dark mode** toggle hanya di Settings (satu-satunya halaman yang bisa diakses semua role); state-nya berlaku seluruh app karena localStorage dibagi per origin.

### 6.2 Sidebar (`navbar.js`)
Dirender dari array `MENU`, difilter per role:
- **Dashboard**, **Aktivitas** (top-level, semua role)
- **Tiket** → Ticket List, PSB
- **Jaringan** → FTTH, Inventory, Peta
- **Panel** (Owner/Operator) → Users; **Referensi** (`admin.html`) hanya ditambahkan untuk Owner
State expand/collapse di localStorage; collapsible di desktop, hamburger di mobile; dropdown user (Settings, Logout); tombol "Stop Impersonating" saat `localStorage.originalUser` di-set. Badge tiket polling `GET /tickets?status=Terlapor&limit=1` tiap 30 dtk. Event `storage` (logout di tab lain) me-redirect ke login.

### 6.3 Halaman & script

| Halaman | Script | Catatan |
|---|---|---|
| `index.html` | `script.js` (~32 baris) | Form login → `csrfFetch('/login')` → simpan user → redirect. |
| `dashboard.html` | `dashboard.js` (~580) | `/api/stats/month` → kartu KPI + Chart.js + feed aktivitas + Recent Tickets. Adaptif per role (hub privileged vs strip "Tugas Saya" Teknisi). Auto-refresh 60 dtk (4 fetch paralel). |
| `ticket-list.html` | `ticket-list.js` (~1330) | Pagination/sort/filter server-side, modal "tiket baru" (auto-isi dari PSB, auto-assign PIC), export CSV/PDF dengan blok ringkasan (`fetchAllFilteredTicketsForExport()` loop `?page=N&limit=100` s/d `MAX_PAGES=1000`; ringkasan = aktifitas terbanyak, wilayah terbanyak, tren per bulan, rentang tanggal dari min/max `created_at`). `compressImageFile` untuk evidence. |
| `ticket-details.html` | `ticket-details.js` (~460) | Detail + timeline, modal edit (dropdown dari `/api/references` + `/api/ftth` + `/users`), "foto bukti wajib saat ke Selesai" (label/hint berubah live). Tombol Hapus disembunyikan dari non-Owner. |
| `activity.html` | `activity.js` (~390) | Form + riwayat + export. Tombol hapus aktivitas hanya untuk Owner. |
| `ftth.html` | `ftth.js` (~520) | Tab CRUD OLT/ODC/ODP/ONU, chip port tersedia, konfirmasi draft ONU. `canWrite = isPrivileged(role)` menggate Tambah/Edit/Konfirmasi; hapus khusus Owner. Auto-refresh 30 dtk (skip kalau modal terbuka atau tab hidden). |
| `map.html` | `map.js` (~210) | Leaflet, bounds NTB, marker lingkaran per tipe, `flyToDevice()` dari popup, terima `?lat=&lng=&name=` (dipakai link dari `ftth.html`). |
| `psb.html` | `psb.js` (~490) | Form (pilih ODP → chip port dari `/api/ftth/available-ports`), upload foto, daftar terpaginasi (8/halaman, search-aware), modal edit (Owner/Operator). Pemilih ONU inventory terbuka kapan pun `!ftth_device_id` — jadi PSB yang macet "Terpasang tapi belum lengkap" bisa dilengkapi belakangan. |
| `inventory.html` | `inventory.js` (~340) | CRUD + log pemakaian, field dinamis per `TYPE_FIELDS`. Read terbuka untuk semua role (tombol Tambah/Edit/Hapus disembunyikan dari Teknisi); Edit digate `isPrivileged`, hapus `isOwner`. |
| `admin.html` | `admin.js` (~385) | Owner-only (redirect kalau bukan). Section referensi + modal tambah user. **Tree FTTH-nya masih membaca salinan legacy `/api/references`, bukan `/api/ftth`** — lihat §7. |
| `user-list.html` | `user-list.js` (~256) | Tabel user + modal edit/tambah + hapus/restore (hapus: Owner). Termasuk `default_sub_node`. Fallback avatar data-URI lokal (offline-safe). |
| `settings.html` | `settings.js` (~74) | Profil/password diri sendiri, toggle tema global, nama/logo perusahaan (Owner). |
| `offline.html` | — | Disajikan `sw.js` saat navigasi gagal & tidak ada cache. |

**Halaman yang sudah dihapus** (digabung): `new-ticket.html` → modal di `ticket-list.html`; `register.html` → registrasi mandiri dihapus; `edit-user.html` → `#editUserModal`; `user-dashboard.html` → `dashboard.html` tunggal.

### 6.4 JS bersama
- `js/constants.js` — global di §6.1.
- `js/csrf.js` — `getCsrfToken()` + `csrfFetch()`.
- `js/toast.js` — `esc()` (sanitasi innerHTML), `showModal/showToast/showConfirm`.
- `js/navbar.js` — §6.2.
- `js/pdf-loader.js` — `loadPdfLibs()` lazy-load jsPDF + jspdf-autotable dari cdnjs saat klik "Export PDF" pertama (idempotent, promise di-cache).

### 6.5 CSS
Satu `public/css/style.css` (~5070 baris, ~38 query `@media`). CSS custom properties untuk theming; dark mode via `<html data-theme>`; aksen role `--owner` (merah `#DC2626`) / `--teknisi` (biru).

### 6.6 PWA (`sw.js`)
`CACHE_NAME` bernomor versi — **naikkan tiap perubahan frontend fungsional**. Strategi fetch:
- Tile peta OSM: dilewati SW sama sekali.
- **Navigasi (`.html`) + `/js/*.js` same-origin + endpoint data (`/tickets`, `/api/*`, non-GET, …): network-first** — coba jaringan, fallback ke cache saat offline, lalu `offline.html` untuk navigasi yang gagal. Diubah dari stale-while-revalidate (yang mengembalikan cache dulu lalu memperbaruinya di background) supaya deploy sampai ke klien pada load *berikutnya* alih-alih butuh reload dua kali, dan supaya HTML baru tidak pernah disajikan bareng bundle JS lama yang basi.
- Gambar / CSS / font / manifest: stale-while-revalidate.
`skipWaiting()` + `clients.claim()` mengaktifkan SW baru segera; `activate` menghapus cache versi lama. Chart.js dan jsPDF di-lazy-load, tidak di-precache.

---

## 7. Database

MySQL `login_app_db`. `schema.sql` adalah source of truth tunggal untuk instalasi baru. `scripts/*.sql` adalah riwayat upgrade-only (gagal "duplicate column/FK" terhadap `schema.sql` baru).

### 7.1 Tabel

#### `users`
`id` · `username` (UNIQUE) · `password` (bcrypt) · `full_name` · `role` (`Owner`/`Operator`/`Teknisi`) · `phone` · `photo` · `deleted_at` + `is_active` (soft-delete; login menolak keduanya) · `default_sub_node` (teks bebas, bukan FK — wilayah teknisi, dipakai `GET /api/auto-pic`) · `created_at`.

#### `tickets`
`id` · `aktifitas` · `sub_node` · `odc` · **`ftth_odc_id`** · `odp` · **`ftth_odp_id`** · `lokasi` · `pic` · `priority` · `status` (default `Terlapor`) · `info` · `evidence` (path upload) · `created_by` · `created_at` · `date_selesai` · `deleted_at` · `psb_id`.
Index: created_by, status, created_at, priority, sub_node, lokasi, odp, deleted_at, psb_id, ftth_odc_id, ftth_odp_id.
- `psb_id` FK → `psb` **SET NULL** — hapus PSB tidak boleh menghapus tiketnya.
- `ftth_odc_id` / `ftth_odp_id` FK → `ftth_devices` **SET NULL** — tautan id yang *menemani* teks bebas `odc`/`odp`. Diisi kapan pun teks itu divalidasi terhadap `ftth_devices` (`routes/tickets.js`), dipakai `PUT /api/ftth/:id` untuk meng-cascade label ODC/ODP yang di-rename ke tiket lama (cacat #5). Ditambah oleh `scripts/add_ftth_rename_links.sql` + `node scripts/backfill_ftth_rename_links.js`.

#### `ticket_status_history`
`ticket_id` FK → tickets **CASCADE** · `old_status` · `new_status` · `changed_by` FK → `users.username` **SET NULL** (riwayat bertahan walau user dihapus; diperbaiki via `scripts/fix_fk_history.sql`/`fix_user_history_fk.sql`) · `changed_at`.

#### `activities`
`description` · `username` · `date` · `created_at` · `date_selesai` · `ticket_id` FK → tickets **CASCADE** (hapus tiket juga menghapus baris aktivitasnya — beda dari `ticket_status_history.changed_by` yang benar-benar SET NULL).

#### `reference_options`
`type` · `label` · `group_name` · `parent_port` · `latitude` · `longitude` · `sort_order`. UNIQUE `(type, label, group_name)`. Dibuat oleh `scripts/add_reference_table.sql` (bukan `schema.sql`). Otoritatif untuk `aktifitas`, `sub_node`, `priority`, `device_brand`, `inventory_type`. Juga menyimpan salinan legacy hasil migrasi satu-kali `olt/odc/odp/onu` yang dibaca tree di `admin.html` — lihat quirk di bawah.

#### `ftth_devices`
`type` (ENUM `olt`/`odc`/`odp`/`onu`) · `label` · `group_name` (= `label` induk — hierarki **tanpa FK**) · `parent_port` · `brand` · `total_ports` · `serial_number` · `latitude` · `longitude` · `sort_order` · `is_draft` (default 0 — 1 untuk ONU auto dari transisi PSB Terpasang, menunggu konfirmasi staf) · `created_at` · `updated_at`. UNIQUE `(type, label, group_name)`. Sumber kebenaran sesungguhnya untuk topologi FTTH + port tracking, disajikan via `/api/ftth` dan `/api/geo`.

> **FTTH data split (quirk arsitektur).** Tab CRUD di `ftth.html` membaca/menulis `ftth_devices` via `/api/ftth`; tree view di `admin.html` masih membaca `/api/references` (salinan legacy). Data yang dibuat/diedit lewat satu UI tidak tampak benar di UI lain. Cek endpoint/tabel yang dipakai surface yang kamu edit.

#### `psb`
`customer_name` · `address` · `phone` · `onu_sn` · `latitude` · `longitude` · `odp_label` · `onu_port` · **`ftth_device_id`** · **`ftth_odp_id`** · `photo` · `notes` · `status` (default `Terdaftar`) · `created_by` · `created_at` · `updated_at`.
- `ftth_device_id` FK → `ftth_devices` **SET NULL** — tautan permanen ke ONU yang PSB ini pasang, ditulis di dalam transaksi Terpasang. PSB dan baris ONU secara konsep adalah hal yang sama di dunia nyata, tetap dua tabel (workflow pemasangan vs. topologi jaringan) — kolom ini yang menjoin-kannya, bukan menggabungkan tabel. `NULL` itu wajar & permanen untuk PSB yang belum Terpasang dan untuk ONU yang dientri langsung di `ftth.html`. Juga bertindak sebagai penjaga "sudah diproses" terhadap decrement stok kedua.
- `ftth_odp_id` FK → `ftth_devices` **SET NULL** — tautan rename untuk `odp_label` (pola sama dengan `tickets.ftth_odc_id`).
- **Tidak ada state machine yang dipaksakan pada `status`** — lihat §12.

#### `inventory` / `inventory_log`
`inventory`: `device_type` · `device_name` · `total_stock` · `used_stock` · `location` · `notes` · `attributes` (JSON) · `created_by` · `created_at` · `updated_at`.
`inventory_log`: `inventory_id` FK → inventory **SET NULL** · `change_type` (ENUM `in`/`out`) · `quantity` · `reference_type` / `reference_id` (mis. `'psb'` + `psb.id`) · `notes` · `created_by` · `created_at`.

#### `audit_logs`
`action` (CREATE/UPDATE/DELETE/LOGIN/LOGOUT) · `target_type` · `target_id` · `details` (JSON) · `username` · `ip_address` · `created_at`.

#### `settings`
`setting_key` (PK) · `setting_value` · `updated_at`. Kunci: `company_name`, `company_logo`.

#### `sessions`
`session_id` (PK) · `expires` · `data` (JSON `req.session`). Dibuat otomatis; baris kadaluarsa dibersihkan tiap 15 menit; expiry 24 jam. `DELETE /users/:username` dan `update-role` menghapus baris session yang relevan.

#### `public_reports`
Dibuat oleh `scripts/add_reports_table.sql` — **tidak ada route yang membaca atau menulisnya**.

### 7.2 Migrasi & seed (`scripts/`)
- **Instalasi baru:** `schema.sql` + `scripts/add_reference_table.sql` (yang terakhir juga men-seed data dropdown). Tidak ada yang lain.
- **Upgrade DB lama:** jalankan `add_*.sql` / `fix_*.sql` yang relevan secara berurutan, lalu backfill Node-nya. Terbaru: `add_ftth_rename_links.sql` + `backfill_ftth_rename_links.js` (DB sebelum 2026-09-07); `add_psb_ftth_link.sql` + `backfill_psb_ftth_link.js` (sebelum 2026-09-04). Backfill hanya menautkan kecocokan *persis* (`serial_number == psb.onu_sn`, atau `(type, label)`), melaporkan baris ambigu alih-alih menebak, aman diulang, dan punya `--dry-run`.
- **Seed:** `seed_ci_users.sql` (akun `pfizer`/`ijang1`, password `test123`, untuk DB CI sekali pakai), `seed_dummy_data.js` / `seed_dummy_august.js` (data dummy skala besar non-destruktif, nama Indonesia, dipetakan ke referensi riil).
- **Ops:** `backup-db.sh` (`mysqldump` ber-timestamp, retensi 30 hari), `verify-roles.sh` (smoke test RBAC berbasis curl terhadap server yang sedang jalan).

---

## 8. Pola yang berulang

### 8.1 `asyncHandler` — tidak ada try/catch di route
`asyncHandler(fn)` menangkap, me-log (Winston), dan 500. Kode route cukup `await`.

### 8.2 Rate limiter per-route, bukan `router.use()`
Semua router di-mount di `/`, jadi `router.use(mutationLimiter('x'))` tanpa path juga jalan untuk request yang ditangani router yang di-mount *lebih belakang* — membocorkan kuota. Perbaikannya: pasang limiter sebagai argumen middleware di tiap route yang butuh. Message selalu objek (lihat §3, `rateLimits.js`).

### 8.3 DTO: `mapX()`
`mapTicket`, `mapUser`, `mapDevice` — baris DB snake_case → JSON camelCase. Frontend selalu bicara camelCase; SQL selalu snake_case. Menambah kolom = dua edit (SELECT/INSERT + `mapX`).

### 8.4 Validasi referensi — `.escape()` berbahaya di sini
`aktifitas`/`odc`/`priority`/… divalidasi via `validateRef()` terhadap label yang tersimpan *apa adanya* di `reference_options` / `ftth_devices` (kedua tabel tidak escape saat insert). Kalau di sini di-escape, label berisi `& < > " '` jadi ter-entity-encode dan tidak pernah cocok — tiket ditolak "tidak valid" padahal dipilih dari dropdown app sendiri. Rendering aman tetap dilakukan: frontend `esc()` sebelum masuk DOM.

### 8.5 `escapeLike()`
Search box membuat `%term%`. Tanpa meng-escape `%` dan `_` dari input user, mengetik `%` cocok dengan semua baris. Helper 1 baris + `LIKE ? ESCAPE '\\'`.

### 8.6 Transaksi + `SELECT … FOR UPDATE`
Pola paling penting. Kapan pun sebuah write punya invariant lintas-baris atau efek samping sekali-saja:
1. `connection = await db.getConnection()` (koneksi khusus, bukan pool langsung).
2. `beginTransaction()`.
3. `SELECT … FOR UPDATE` baris target — mengunci mereka. Request kedua yang paralel **block** di sini sampai yang pertama commit, lalu membaca state terbaru.
4. Validasi (transisi, stok, konflik) **terhadap baris terkunci**, bukan snapshot yang dibaca di luar transaksi.
5. `UPDATE` + `INSERT` ke tabel turunan (history, log) — semua di koneksi yang sama.
6. `commit()`. Kalau apa pun gagal: `rollback()` + `cleanupUploadOnError(req)` + lempar ulang.
7. `connection.release()` di `finally`.
8. Efek fire-and-forget (notifikasi WA) & `audit()` dijalankan *setelah* commit, tidak di-`await`.

Dipakai di: create tiket, update tiket, auto-start dari aktivitas, PSB → Terpasang, update inventory, rename FTTH.

---

## 9. Alur kerja utama

### 9.1 Login & session
Lihat §4.1. Dummy compare timing-safe, `regenerate()`, session store MySQL, pencabutan session saat delete/demote, sinkron logout multi-tab.

### 9.2 Pembuatan tiket → WhatsApp
Form → `POST /tickets` (FormData) → validasi + cek kepemilikan + guard status awal → **transaksi** (`INSERT tickets` + `INSERT ticket_status_history`) → commit → `notifyTicketCreated()` (fire-and-forget) + `audit()` → 201.

### 9.3 Perubahan status → tervalidasi + efek samping
`POST /tickets/:id/update` → IDOR → buang field yang tidak boleh untuk Teknisi → **transaksi**: `FOR UPDATE` → validasi terhadap `VALID_TRANSITIONS[current.status]` → foto bukti wajib kalau masuk `Selesai` → `UPDATE` + `INSERT` history + set/kosongkan `date_selesai` → kalau `psb_id` dan sekarang `Selesai`: `psb.status Terdaftar → Terpasang` (hanya maju) → commit → notifikasi WA + hapus file evidence lama + `audit()`.

### 9.4 Auto-PIC
`GET /api/auto-pic?subNode=` memakai `is_local` sebagai *kunci urut pertama*, bukan filter `WHERE`:
```sql
SELECT u.username, u.full_name, u.default_sub_node,
  COUNT(t.id) AS active_tickets,
  (u.default_sub_node IS NOT NULL AND u.default_sub_node = ?) AS is_local
FROM users u
LEFT JOIN tickets t ON t.pic = u.username
  AND t.status IN ('Terlapor','Dikerjakan') AND t.deleted_at IS NULL
WHERE u.role = 'Teknisi' AND u.deleted_at IS NULL
GROUP BY u.username, u.full_name, u.default_sub_node
ORDER BY is_local DESC, active_tickets ASC
LIMIT 1;
```
Kalau `?subNode=` cocok dengan `default_sub_node` seorang teknisi, dia diprioritaskan; di antara yang cocok, beban paling ringan. Kalau *tidak ada* yang cocok, `is_local` semuanya 0 dan query jatuh ke teknisi paling ringan secara global — bukan malah "tidak dapat PIC". `LEFT JOIN` supaya teknisi tanpa tiket aktif tetap terhitung (`active_tickets = 0`).

### 9.5 Auto-start dari aktivitas
Lihat §4.4. Teknisi yang mencatat aktivitas ke tiket `Terlapor`/`Pending` miliknya memindahkannya ke `Dikerjakan` di dalam transaksi (dijaga IDOR, `FOR UPDATE`, notifikasi WA).

### 9.6 Loop PSB ↔ Inventory ↔ FTTH
Efek samping terpadat di sistem. `PUT /api/psb/:id`, di dalam satu transaksi `FOR UPDATE`:
- **Guard:** `needsInventoryLink = status === 'Terpasang' && !existing.ftth_device_id`. Bukan "status sedang berubah" — karena jalan pintas penyelesaian tiket (§9.3) meng-set `psb.status = 'Terpasang'` *tanpa* memilih inventory, meninggalkan PSB yang `Terpasang` tapi `ftth_device_id IS NULL` tanpa cara melengkapinya di bawah kondisi lama "berubah *menjadi* Terpasang". `ftth_device_id` non-NULL itu penanda "sudah diproses".
- Langkah: kunci PSB → bangun `UPDATE` field → kalau `needsInventoryLink`: wajib `inventoryId`, kunci baris inventory itu, cek `remaining >= 1` (tolak seluruh transisi kalau habis), jalankan `checkOnuConflicts()` *sebelum* menyentuh stok (tolak kalau SN/port bentrok) → `UPDATE psb` → `UPDATE inventory SET used_stock = used_stock + 1` → `INSERT inventory_log ('out', 1, 'psb', <id>)` → `INSERT ftth_devices ('onu', label=<nama> - <SN>, group_name=<odp>, parent_port=<port>, is_draft=TRUE)` → `UPDATE psb SET ftth_device_id = <draft.insertId>` → commit → `audit()` ×2.
- Draft ONU (`is_draft=1`) muncul di `ftth.html` dengan chip "perlu konfirmasi"; staf mengonfirmasi via `PUT /api/ftth/:id { is_draft: false }`, yang menjalankan ulang `checkOnuConflicts()` terhadap nilai tersimpan.

### 9.7 Cascade rename FTTH
`PUT /api/ftth/:id` saat `label` berubah dan device punya anak: sebuah transaksi memperbarui `group_name` tiap anak (hierarki berbasis label), lalu — lewat tautan `ftth_odc_id`/`ftth_odp_id` — `UPDATE tickets SET odc = ? WHERE ftth_odc_id = ?` (atau `odp`), dan `UPDATE psb SET odp_label = ? WHERE ftth_odp_id = ?`. Tanpa ini, rename cuma membetulkan pohon FTTH dan meninggalkan teks basi di tiket/PSB lama.

### 9.8 Alokasi port
`GET /api/ftth/available-ports` — port terpakai = anak dengan `group_name` **dan `type`** yang cocok; Port 1 di-reserve sebagai uplink untuk induk ODC/ODP (anak mulai Port 2), anak OLT mulai Port 1. Konflik ONU via `checkOnuConflicts()`; ODC/ODP via `WHERE group_name=? AND type=? AND parent_port=?` inline.

---

## 10. Keamanan

| Aspek | Implementasi |
|---|---|
| Password | bcryptjs 10 rounds; min 8 + huruf & angka; input di-trim konsisten di semua jalur set-password & login. |
| Session | Store MySQL; `httpOnly`, `sameSite: strict`, 24 jam; `Secure` saat `NODE_ENV=production`; id di-regenerate saat login; dicabut saat user delete/demote. |
| Timing | Login gagal karena user tidak ada tetap menjalankan `bcrypt.compare` dummy. |
| Rate limiting | Global 1000/15mnt per IP; login 5/15mnt; register 5/jam; `profileUpdateLimiter` 5/15mnt; `mutationLimiter` per grup endpoint. Semua message berupa objek (429 JSON). |
| SQL injection | Query berparameter (mysql2); `LIKE … ESCAPE` untuk search; kolom sort dari whitelist. |
| IDOR | Cek kepemilikan per-request di setiap endpoint tiket dan di `POST /activities`. |
| CSRF | Double-submit cookie, `timingSafeEqual`, token dirotasi setelah tiap mutasi. |
| Upload | Gambar saja, 5 MB, nama file disanitasi, **isi diverifikasi via magic bytes** (bukan cuma ekstensi/MIME). |
| Aset privat | `public/uploads/` di-gate cek session di `server.js` — kecuali `company_logo` yang aktif. |
| Helmet + CSP | CSP per-dokumen (CSP global dengan `'unsafe-inline'` menolak SW). |
| Audit trail | `audit_logs` (level bisnis, dibaca Owner) — terpisah dari `logs/*.log` (teknis). |
| DB pool | `queueLimit: 30` — kelebihan beban gagal cepat, tidak antre tak terbatas di memori. |
| Kesiapan restart | `GET /health` cek konektivitas DB sungguhan; graceful shutdown menutup server/session-store/pool dengan rapi. |
| Dependency | `overrides` di `package.json` men-dedupe `mysql2` bersarang milik `express-mysql-session` ke `mysql2` top-level yang sudah dipatch (CVE auth-plugin-downgrade + decompression-bomb). Verifikasi dengan `npm ls mysql2` → yang bersarang harus `deduped`, bukan versi. Bukan bump `express-mysql-session` sendiri (3.0.3 sudah terbaru; satu-satunya "fix" yang ditawarkan `npm audit` adalah downgrade ke 2.x yang membuang `mysql2` demi driver `mysql` lama yang tak dipelihara). |

**Catatan lain**
- `innerHTML` dipakai luas di frontend, tapi nilainya di-`esc()` sebelum dimasukkan dan backend juga meng-escape field teks bebas.
- CSP per-dokumen tetap `'unsafe-inline'` pada `script-src` — sengaja (kebijakan lebih ketat menolak skrip registrasi SW), tapi layak ditinjau ulang kalau constraint itu berubah.
- Pastikan `NODE_ENV=production` benar-benar di-set di production (menentukan flag cookie `Secure`).

---

## 11. Testing & CI

- **Mocha + Supertest**, `npm test` = `mocha test/*.test.js --timeout 10000 --exit` — ~55 kasus `it()` di 9 file.
- **Tidak ada database test terpisah.** `login_app_user` tidak punya grant `CREATE DATABASE`, jadi test menembak `login_app_db` yang sama dengan app. Isolasi lewat fixture bertanda `AUTOTEST_` yang dibersihkan di `afterEach`/`after`. **Jangan pernah** menyentuh data yang bukan dibuat test itu.
- **`test/helpers/testApp.js`** — memoize satu app Express + satu session login per akun untuk *seluruh* proses mocha, karena `loginLimiter` in-memory (5/15mnt) dibagi setiap file yang `require` `routes/auth.js`. Juga `delete process.env.FONNTE_TOKEN` supaya tidak ada WhatsApp asli terkirim. `routes/inventory.js` dan `routes/references.js` ditambahkan ke test app pada 2026-09-07 (sebelumnya tak bisa dites).
- **Caveat rate-limit:** `mutationLimiter('tickets')` (60/15mnt) juga satu counter per proses mocha. Menjalankan `npm test` berkali-kali dalam 15 menit bisa menghabiskannya dan menjatuhkan test file dengan 429. Beberapa file sengaja memakai satu tiket bergilir alih-alih create/delete per `it()`.
- **Cakupan per file:**
  - `tickets.test.js` — state machine status (tidak boleh lompat; evidence wajib untuk `Selesai`) + IDOR.
  - `activities.test.js` — auto-start (Teknisi memajukan tiket `Terlapor`/`Pending`; Owner/Operator tidak).
  - `ftth.test.js` — tolak dobel-pakai port + regresi PUT-tanpa-`group_name`.
  - `fase5.test.js` — auto-PIC sub_node + PSB → Terpasang (decrement stok, draft ONU, guard dobel-decrement, tolak stok habis).
  - `validation.test.js` — validasi referensi (tiket `odp`, PSB `odpLabel`, inventory `deviceType`, user `defaultSubNode`), proteksi hapus referensi yang dipakai (cacat #6), cascade rename ODC/ODP end-to-end.
  - `sprint3.test.js` — tolak konflik SN/port ONU di jalur draft PSB, cek-ulang saat konfirmasi draft tanpa mengirim ulang field, dan PSB "Terpasang tapi belum lengkap" bisa dilengkapi belakangan tanpa dobel-kurangi stok.
  - `stats.test.js` — `SLA_TARGET_HOURS` per prioritas, `metPercent` mengecualikan prioritas di luar set, bucket `breached`/`atRisk`, `teknisiPerformance` absen untuk pemanggil Teknisi.
  - `password-trim.test.js` — password dengan spasi tak sengaja tetap bisa login setelah trim konsisten.
  - `api.test.js` — smoke: login menolak kosong/salah, logout, settings publik.
- **CI** (`.github/workflows/ci.yml`): tiap push/PR → `npm ci` → `npx eslint .` → MySQL 8 container di-provision dari `schema.sql` + `scripts/add_reference_table.sql` + `scripts/seed_ci_users.sql` → `npm test`. Prettier *tidak* dijalankan di CI (manual saja).

---

## 12. Known issues / sharp edges

- **`psb.status` tidak punya state machine yang dipaksakan.** `routes/psb.js` cuma cek keanggotaan list (`VALID_PSB_STATUS`), bukan graf transisi, dan dropdown edit selalu menampilkan semua 4. Sebuah record bisa lompat `Terdaftar → Aktif` langsung — dan karena efek samping inventory/draft-ONU digate pada `status === 'Terpasang' && !ftth_device_id`, lompat ke `Aktif` tanpa pernah `Terpasang` berarti ONU tidak pernah tercatat dan stok tidak pernah berkurang. Perbaikannya butuh `VALID_PSB_TRANSITIONS` — keputusan produk (apakah lompat pernah sah?) sekaligus teknis.
- **FTTH data split** (§7) — `ftth_devices` vs. salinan legacy `reference_options` bisa drift; tree di `admin.html` membaca yang legacy.
- **Rate limit global dibagi per IP.** 1000/15mnt, key IP, plus polling bawaan (navbar 30 dtk di tiap halaman, dashboard 60 dtk × 4 request, ftth 30 dtk). Beberapa staf di belakang satu NAT/CGNAT bisa mendekati 1000 tanpa mengklik. **Dan** loop export di `ticket-list.js` bisa menembak sampai `MAX_PAGES=1000` request tanpa jeda — satu export besar bisa 429-kan semua orang di IP itu selama sisa window.
- **Export adalah loop paginasi**, bukan streaming — `GET /tickets?page=N&limit=100` dengan filter server-side, lalu ringkasan yang dibangun di klien + baris mentah.
- **`activity.js` menyembunyikan tombol hapus aktivitas dari Operator** padahal backend mengizinkan Owner *dan* Operator.
- **`public_reports`** ada tapi mati — tidak ada route yang menyentuhnya.
- **Notifikasi WhatsApp fire-and-forget** — kegagalan hanya di-log, nomor tidak valid diam, Operator sengaja tidak dinotifikasi.
- **`POST /tickets/:id/update`** memakai POST (bukan PUT/PATCH) dengan `multipart/form-data`.
- **Test menembak DB nyata** — hanya jalankan `npm test` di dev/staging.
