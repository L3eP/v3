# Dokumentasi Kode Lengkap

**Proyek:** MAYUNG — Sistem Ticketing & Manajemen Jaringan FTTH  
**Stack:** Node.js / Express 5 + MySQL 8 | Vanilla JS Frontend  
**Terakhir diperbarui:** 2026-08-27

---

## 1. Ikhtisar Arsitektur

Multi-Page Application (MPA) dengan:
- **Backend:** Express 5, session-based auth (MySQL store), Helmet, rate limiting, centralized async error handling, CSRF protection, health check yang benar-benar cek DB, dan graceful shutdown
- **Database:** MySQL 8 via `mysql2` connection pool — 11 tabel aplikasi + 1 tabel session (otomatis)
- **Frontend:** Vanilla JavaScript (tanpa framework), HTML5, CSS3 custom properties, PWA service worker, 13 halaman, 17 skrip
- **Notifikasi:** WhatsApp via Fonnte API (fire-and-forget dengan catch handler)
- **Role:** Owner (penuh), Operator (kelola), Teknisi (diri sendiri)
- **Pola:** Server-side pagination, RBAC middleware chain, async handler wrapper, `INSERT ... ON DUPLICATE KEY UPDATE`, soft-delete, double-submit cookie CSRF
- **Testing/CI:** Mocha + Supertest (26 test, 4 file) jalan ke database dev asli lewat fixture bertanda yang membersihkan diri sendiri — tidak ada database test terpisah (user DB tidak punya grant `CREATE DATABASE`). GitHub Actions menjalankan lint + test yang sama ke container MySQL baru & sekali-pakai di tiap push/PR.

### Jumlah File

| Layer | Jumlah |
|---|---|
| Backend JS | 1 server + 11 routes + 7 middleware + 4 utils + 1 service = 24 |
| Frontend HTML | 13 halaman |
| Frontend JS | 17 skrip klien |
| Frontend CSS | 1 stylesheet (~4765 baris) |
| Scripts | Migrasi SQL upgrade-only + `seed_ci_users.sql` + 1 JS migration + 1 shell backup |
| Test | 4 file test (mocha + supertest) + 1 helper bersama |

---

## 2. Entry Point — `server.js`

`GET /health` didaftarkan PALING AWAL, sebelum helmet/CSRF/session/rate-limit — tidak perlu cookie/CSRF token dan tidak pernah kena rate limit, penting untuk load balancer/uptime monitor yang polling sering. Menjalankan `SELECT 1` ke DB, balas `{status, db, uptime}` — 200 kalau terjangkau, 503 kalau tidak.

Baru setelah itu middleware lain dikonfigurasi berurutan:

1. **Helmet** — CSP diatur manual per dokumen HTML statis (bukan global — CSP global dengan `'unsafe-inline'` akan menolak registrasi Service Worker)
2. **JSON parsing** — `express.json()` + `express.urlencoded()`
3. **Static files** — `express.static('public')`, dengan `/uploads` di-gate auth (kecuali logo perusahaan) SEBELUM static handler umum
4. **Detail request logging** — Winston `DailyRotateFile` per request (method, url, query, params, body ter-redaksi, status, durasi, user/role/ip) ke `logs/detail-*.log`, terpisah dari audit trail
5. **Global rate limiter** — 1000 request per 15 menit per IP
6. **Session** — `express-session` dengan MySQL store (`express-mysql-session`)
   - Key: `session_cookie_name`
   - `Secure` otomatis true saat `NODE_ENV=production`, false selainnya
   - httpOnly, sameSite: strict, 24 jam
   - Store juga menerima `DB_PORT` opsional
7. **CSRF Protection** — double-submit cookie (sebelum static, supaya cookie ter-set saat GET)
8. **Routes** — 11 file route di-mount di `/`
9. **`GET /api/audit`** — inline di `server.js`, Owner-only, baca `audit_logs` dengan pagination
10. **Global error handler** — Error Multer (400), error filter gambar (400), generic (500)

Port: membaca `PORT` dari `.env`, fallback ke **3000**. Pool DB: `connectionLimit: 10`, `queueLimit: 30` (di mysql2, `queueLimit: 0` berarti antrean TANPA BATAS, bukan nol — dibatasi di sini supaya kelebihan beban gagal cepat, bukan menumpuk tanpa batas di memori).

**Graceful shutdown:** `SIGTERM`/`SIGINT` menutup HTTP server, lalu session store, lalu pool DB, berurutan, dengan fallback paksa-keluar setelah 10 detik kalau ada yang menggantung. Ini terpicu alami tiap `npm run dev` restart karena perubahan file (`node --watch` mengirim `SIGTERM` ke proses lama), dan juga oleh process manager seperti PM2.

---

## 3. Middleware

### `middleware/auth.js`
Tiga guard:
- **`isAuthenticated`** — cek `req.session.user` → 401 jika tidak ada
- **`isAdmin`** — cek role 'Owner' → 403 jika bukan
- **`isOwnerOrOperator`** — cek role 'Owner' atau 'Operator' → 403 jika bukan

### `middleware/upload.js`
Multer: storage disk, filter gambar saja, 5MB max.

### `middleware/asyncHandler.js`
Wrapper untuk menghilangkan duplikasi try/catch. Catch error → Winston log → 500 JSON.

### `middleware/csrf.js`
Double-Submit Cookie CSRF:
- Safe methods (GET): set cookie `csrf-token` jika belum ada, skip validasi
- State-changing methods (POST/PUT/DELETE): validasi header `X-CSRF-Token` atau field `_csrf_token` di body
- Timing-safe comparison via `crypto.timingSafeEqual()`

### `middleware/audit.js`
`audit(req, action, targetType, targetId, details)` — insert ke `audit_logs` (username, IP, JSON details). Kegagalan ditelan diam-diam supaya tidak pernah menggagalkan request utama. Dipanggil dari `tickets.js`, `users.js`, `inventory.js`, `ftth.js` (create/update/delete), dan `psb.js` (termasuk draft ONU otomatis saat transisi Terpasang, dicatat sebagai entri `ftth` terpisah). Dibaca via `GET /api/audit` (Owner-only). **Tidak** dipanggil dari `settings.js` — update nama/logo perusahaan ter-detail-log tapi tanpa audit trail.

### `middleware/detailLog.js` (+ `utils/detailLog.js`)
Sistem logging KEDUA, terpisah dari audit trail — detail request/response teknis (bukan level bisnis "siapa mengubah apa"), ditulis ke `logs/detail-*.log` via Winston `DailyRotateFile`, retensi 7 hari, tidak pernah tampil di UI aplikasi.

### `middleware/rateLimits.js`
`mutationLimiter(label, max)` — rate limit per file route, di atas limit global 1000/15min. Hanya menghitung verb non-GET/HEAD/OPTIONS. `auth.js` pakai `loginLimiter`/`registerLimiter` sendiri (lebih ketat dari mutation limiter generik), dan `users.js` menambahkan `profileUpdateLimiter` di atas limiter genericnya.

---

## 4. Routes

Semua route di-mount di `/` (tanpa prefix /api).

### 4.1 `routes/auth.js`
- **`POST /login`** — Rate limited (5/15min). Validasi express-validator, bcrypt.compare → session → redirect. Menolak user soft-deleted/nonaktif. Session ID di-regenerate saat login (anti-fixation).
- **`POST /logout`** — Hancurkan session
- **`POST /register`** — Owner only (tidak ada UI self-registration, `register.html` sudah dihapus), rate limit 5/jam, upload photo, bcrypt 10 rounds, password min 8 karakter + huruf&angka, role whitelist

### 4.2 `routes/users.js`
- **`GET /users`** — Owner/Operator. SELECT kolom eksplisit (tanpa password), termasuk `default_sub_node`
- **`GET /users/:username`** — Self atau Owner/Operator
- **`POST /update-profile`** — Self. Butuh current password, aturan password sama (min 8 + huruf&angka)
- **`POST /update-role`** — Owner, validasi whitelist `isIn(['Owner','Operator','Teknisi'])`, self-demosi diblok
- **`POST /admin/users/update`** — Owner/Operator, express-validator (role whitelist, password min 8+huruf&angka, `defaultSubNode` opsional). Operator tidak bisa mengubah akun Owner atau menaikkan siapapun ke Owner.
- **`DELETE /users/:username`** — Owner, self-delete protected

### 4.3 `routes/tickets.js`
- **`POST /tickets`** — Authenticated, upload evidence. `odc`/`odp` divalidasi ke `ftth_devices` (bukan `reference_options` — lihat catatan FTTH data split di §7). `psbId` opsional menghubungkan tiket ke record PSB (divalidasi ada). WA notification (catch handler).
- **`GET /tickets`** — Paginated, soft-delete filter, filterable, RBAC Teknisi
- **`GET /tickets/:id`** — IDOR protected
- **`POST /tickets/:id/update`** — IDOR protected, role-based field restriction, workflow validation (`SELECT ... FOR UPDATE`), WA notification. Kalau tiket ini punya `psb_id` dan status baru "Selesai", PSB terkait otomatis maju `Terdaftar → Terpasang` dalam transaksi yang sama (maju saja, tidak pernah menimpa Batal).
- **`DELETE /tickets/:id`** — Soft-delete (set `deleted_at`)
- **`GET /tickets/:id/history`** — Status timeline
- **`GET /api/auto-pic?subNode=`** — Sarankan PIC: Teknisi dengan `default_sub_node` yang cocok diprioritaskan, baru fallback ke beban paling ringan. Response sertakan `matchedSubNode: boolean`.

**Validasi Transisi Status:**
```
Terlapor → Dikerjakan, Pending
Dikerjakan → Selesai, Pending, Terlapor
Selesai → Dikerjakan
Pending → Dikerjakan, Terlapor
```

### 4.4 `routes/activities.js`
- **`POST /activities`** — Authenticated, ticket_id opsional
- **`GET /activities`** — Paginated, RBAC
- **`DELETE /activities/:id`** — Owner/Operator, audit trail

### 4.5 `routes/settings.js`
- Company name & logo — GET public, POST Owner only

### 4.6 `routes/references.js`
- CRUD /api/references — semua role (termasuk edit/delete). Include parent_port. Tipe `olt/odc/odp/onu` di sini adalah **salinan lama** (legacy, one-time-migrated) — lihat catatan FTTH data split di §7; hanya tipe non-FTTH (aktifitas, sub_node, priority, device_brand, inventory_type) yang masih jadi sumber kebenaran di sini.

### 4.7 `routes/geo.js`
- GET /api/geo — OLT/ODC/ODP/ONU dengan koordinat + parentPort, dibaca dari `ftth_devices` (tabel yang benar)

### 4.8 `routes/psb.js`
- CRUD /api/psb — POST semua role, PUT/DELETE Owner/Operator. Upload foto. `PUT` dibungkus transaksi + `SELECT ... FOR UPDATE`. Transisi SUNGGUHAN (pertama kali) ke `status: "Terpasang"` wajib sertakan `inventoryId` — mengurangi stok item itu, mencatat ke `inventory_log` (`reference_type: 'psb'`), dan membuat draft ONU di `ftth_devices` (`is_draft: true`) dari SN/ODP/port/koordinat PSB ini, semua dalam transaksi yang sama. Menyimpan ulang PSB yang sudah Terpasang tidak memicu ini lagi. `status` sendiri tidak punya graf transisi valid — lihat Known Issues.

### 4.9 `routes/inventory.js`
- CRUD /api/inventory — GET semua role, POST/PUT Owner/Operator, DELETE Owner only
- **`GET /api/inventory/log`** — Owner/Operator. Histori pemakaian; entri yang dipicu instalasi PSB punya `reference_type='psb'` + `reference_id=<psb.id>`.

### 4.10 `routes/ftth.js`
Sumber kebenaran topologi FTTH — backed tabel `ftth_devices`, bukan `reference_options`.
- **`GET /api/ftth`** — Authenticated. Grouped by type + `stats` (termasuk `draftCount`).
- **`GET /api/ftth/available-ports`** — Authenticated. Port belum terpakai di bawah satu parent (port 1 di-reserve sebagai uplink untuk ODC/ODP, tidak untuk OLT).
- **`POST /api/ftth`** — Owner/Operator. Validasi brand/total_ports untuk OLT, SN unik untuk ONU, tidak bentrok parent-port dalam group+type yang sama.
- **`PUT /api/ftth/:id`** — Owner/Operator. Juga terima `is_draft: false` untuk konfirmasi draft ONU (draft→resmi saja, tidak pernah sebaliknya). Kalau label device berubah dan punya child (match via `group_name`), semua child ikut di-update dalam transaksi yang sama.
- **`DELETE /api/ftth/:id`** — Owner only. Ditolak kalau masih punya child.

### 4.11 `routes/stats.js`
- **`GET /api/stats/month`** — Authenticated. Statistik dashboard agregat (open ticket count/aging, selesai bulan/minggu ini, rata-rata SLA), plus blok khusus Teknisi (tiket sendiri, perlu perhatian, aktivitas minggu ini) kalau `role === 'Teknisi'`.

---

## 5. Services & Utilities

### `services/notification.js`
WhatsApp via Fonnte API:
- Notifikasi tiket baru → pembuat + PIC
- Notifikasi status berubah → pembuat + PIC
- `Promise.allSettled()` untuk parallel sending
- Semua pemanggilan punya `.catch()` handler

### `utils/logger.js`
Winston daily rotate: error + app log, 14 hari retensi, console di development.

### `utils/phone.js`
Standarisasi nomor Indonesia ke format `62xx`.

---

## 6. Frontend

### Navigasi (`navbar.js`)
Sidebar dinamis, role-based, collapsible, mobile responsive. State expand/collapse tersimpan di localStorage. Semua role melihat menu Dashboard/Tiket/Aktivitas/FTTH/Map/PSB; Owner/Operator tambah Users/Inventory; Owner-only tambah Admin.

### Halaman & Script

| Halaman | Script | Fitur |
|---|---|---|
| **index.html** | `script.js` | Login dengan csrfFetch |
| **dashboard.html** | `dashboard.js` | Semua role (blok khusus Teknisi ditambahkan lewat `GET /api/stats/month`). Statistik, Chart.js, SLA, recent tickets, apiFetch wrapper |
| **ticket-list.html** | `ticket-list.js` | Pagination, sort, filter, export CSV/PDF rekap. Pembuatan tiket adalah modal (`#newTicketModal`) di halaman ini, bukan halaman terpisah — dropdown sub-node memicu ulang `GET /api/auto-pic?subNode=` saat berubah |
| **ticket-details.html** | `ticket-details.js` | Detail, edit modal, timeline, soft-delete, showConfirm |
| **activity.html** | `activity.js` | Log aktivitas, history, export |
| **ftth.html** | `ftth.js` | Tab CRUD (OLT/ODC/ODP/ONU) + port tracking. Entri draft ONU (dari instalasi PSB) tampil dengan badge kuning "perlu konfirmasi" + tombol konfirmasi satu klik |
| **map.html** | `map.js` | Leaflet map, chain koneksi, flyToDevice, Google Maps link |
| **psb.html** | `psb.js` | Form PSB, upload foto, detail modal, edit inline. Mengubah status ke "Terpasang" memunculkan picker item ONU inventory (wajib diisi utk transisi itu) |
| **admin.html** | `admin.js` | Card grid, CRUD referensi, add user. Tree view FTTH-nya masih baca `/api/references` yang lama, BUKAN `/api/ftth` — lihat §7 |
| **inventory.html** | `inventory.js` | Stok perangkat, warna status stok, histori pemakaian |
| **settings.html** | `settings.js` | Update profil, company settings (Owner) |
| **user-list.html** | `user-list.js` | Tabel user, edit (`#editUserModal`, termasuk wilayah `default_sub_node` Teknisi)/delete (Owner), showConfirm |
| **offline.html** | — | Fallback PWA offline, disajikan `sw.js` saat navigasi gagal & tidak ada cache |

**Halaman yang sudah dihapus**: `new-ticket.html` → modal di `ticket-list.html`; `register.html` → self-registration dihapus, Owner buat user lewat modal di `user-list.html`; `edit-user.html` → `#editUserModal` di `user-list.html`; `user-dashboard.html` → digabung ke `dashboard.html` tunggal.

### Shared Utilities
- **`js/csrf.js`** — `csrfFetch(url, opts)` untuk state-changing requests
- **`js/toast.js`** — `showToast()` + `showConfirm()` (modal ganti confirm native)
- **`js/constants.js`** — `ROLES` enum, `formatId()`, `isPrivileged()`, validator telepon, `apiFetch()` (wrapper redirect otomatis saat 401)

---

## 7. Database

### Tabel

#### `users`
| Kolom | Tipe | Constraint |
|---|---|---|
| id | INT | PK, AUTO_INCREMENT |
| username | VARCHAR(255) | UNIQUE, NOT NULL |
| password | VARCHAR(255) | NOT NULL — bcrypt hash |
| full_name | VARCHAR(255) | NOT NULL |
| role | VARCHAR(50) | DEFAULT 'User' |
| phone | VARCHAR(20) | NULL |
| photo | VARCHAR(255) | NULL |
| deleted_at | TIMESTAMP | NULL — soft-delete |
| is_active | BOOLEAN | DEFAULT TRUE — login menolak FALSE |
| default_sub_node | VARCHAR(100) | NULL — teks bebas bukan FK; wilayah Teknisi, dipakai `GET /api/auto-pic` |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `tickets`
Kolom inti + `deleted_at` (soft-delete), `odp`, dan `psb_id` (FK → psb, ON DELETE SET NULL). Status workflow: Terlapor, Dikerjakan, Selesai, Pending.

#### `activities`
`ticket_id` FK → tickets ON DELETE SET NULL.

#### `ticket_status_history`
FK `ticket_id` → tickets CASCADE. `changed_by` FK ke `users.username` dengan **ON DELETE SET NULL** — history tetap ada walau user-nya dihapus, bukan sekadar snapshot lepas.

#### `settings`
Key-value (company_name, company_logo).

#### `reference_options`
Dibuat oleh `scripts/add_reference_table.sql` (tidak ada di `schema.sql`). Masih sumber kebenaran untuk dropdown non-FTTH (aktifitas, sub_node, priority, device_brand, inventory_type). Juga masih menyimpan **salinan lama (legacy, one-time-migrated)** entri `olt/odc/odp/onu` yang dibaca tree view FTTH di `admin.html` — lihat catatan FTTH data split di bawah.

#### `ftth_devices`
Dipisah dari `reference_options` ke tabel sendiri. Kolom: id, type (ENUM olt/odc/odp/onu), label, group_name, parent_port, brand, total_ports, serial_number, latitude, longitude, sort_order, `is_draft` (default FALSE — TRUE untuk entri ONU otomatis dari transisi PSB "Terpasang", menunggu konfirmasi staf). UNIQUE (type, label, group_name). Ini sumber kebenaran topologi FTTH + port tracking sesungguhnya, dilayani via `/api/ftth` dan `/api/geo`.

**FTTH data split (quirk arsitektur):** `ftth.html` (tab CRUD) baca/tulis `ftth_devices` via `/api/ftth`, sedangkan `admin.html` (tree view lama) masih baca `/api/references` (salinan lama). Data yang dibuat/diubah lewat satu UI tidak otomatis benar di UI lain.

#### `psb`
Record instalasi pelanggan: customer_name, address, phone, onu_sn, onu_port, odp_label, latitude, longitude, photo, notes, status (Terdaftar → Terpasang → Aktif, atau Batal), created_by, created_at, updated_at. **Tidak ada state-machine pada `status`** — lihat Known Issues.

#### `inventory` / `inventory_log`
Manajemen stok perangkat + histori pemakaian. `inventory_log` punya kolom `reference_type`/`reference_id` — decrement yang dipicu PSB menulis `reference_type='psb'`, `reference_id=<psb.id>` supaya bisa dilacak balik ke instalasi yang memakai stok itu.

#### `audit_logs`
action/target_type/target_id/username/ip_address/details (JSON), ditulis `middleware/audit.js`, dibaca via `GET /api/audit` (Owner-only).

#### `public_reports`
Dibuat `scripts/add_reports_table.sql`; belum ada route yang membaca/menulisnya.

---

## 8. Alur Kerja Utama

### Pembuatan Tiket → WA
1. Form → POST /tickets → validasi → insert → WA ke pembuat + PIC → 201

### Perubahan Status → Tervalidasi
1. Validasi transisi (Terlapor→Selesai = ditolak), dikunci `SELECT ... FOR UPDATE`
2. Validasi field per role (Teknisi: status+info+evidence saja)
3. Log ke ticket_status_history
4. WA notification
5. Kalau tiket ini punya `psb_id` dan status baru "Selesai" → PSB terkait otomatis maju `Terdaftar → Terpasang` dalam transaksi yang sama (maju saja, tidak pernah menimpa Batal)

### Soft-Delete
1. DELETE → set `deleted_at = NOW()`
2. Semua query filter `WHERE deleted_at IS NULL`
3. History tetap bisa diakses

### Hierarki FTTH dengan Port
Parent-child via `ftth_devices.group_name` (tabel yang benar — lihat catatan data split di §7), port tracking via `parent_port`:
- OLT → ODC (Port 1/16) → ODP (Port 3/8) → ONU (Port 1/1)

### PSB → Tiket → Inventory → FTTH
Tiket dari PSB membawa `psb_id`; saat "Selesai", PSB terkait otomatis maju ke Terpasang (lihat di atas). Terpisah: mengedit PSB langsung ke Terpasang untuk pertama kali wajib pilih item ONU dari `inventory` — mengurangi stoknya & membuat draft ONU di `ftth_devices`, yang staf konfirmasi di halaman FTTH. Kedua transisi dikunci `SELECT ... FOR UPDATE` untuk mencegah dobel-trigger saat request bersamaan.

### Auto-PIC
`GET /api/auto-pic?subNode=` menugaskan Teknisi dengan tiket aktif paling sedikit; kecocokan `subNode` dengan `default_sub_node` Teknisi diprioritaskan dulu, baru fallback ke beban paling ringan secara global.

---

## 9. Keamanan

| Pengukuran | Implementasi |
|---|---|
| **Password** | bcryptjs, 10 rounds, min 8 karakter + huruf&angka |
| **Session** | MySQL store, httpOnly, sameSite: strict, 24 jam |
| **Rate limiting** | Global 1000/15min, Login 5/15min, Register 5/jam |
| **Validasi input** | express-validator (trim, escape, whitelist) |
| **SQL injection** | Parameterized queries via mysql2 |
| **IDOR** | Cek ownership di setiap akses resource |
| **CSRF** | Double-submit cookie |
| **CSP** | Helmet dengan Content Security Policy |
| **Upload file** | Whitelist tipe, 5MB, sanitasi filename, isi file diverifikasi magic bytes |
| **Error handling** | Centralized asyncHandler |
| **Audit trail** | Tabel `audit_logs` (level bisnis, Owner-readable via `GET /api/audit`) — terpisah dari `logs/*.log` (Winston, level teknis, tidak tampil di app) |
| **Pool DB** | `queueLimit: 30` — kelebihan beban gagal cepat, bukan menumpuk tanpa batas |
| **Kesiapan restart** | `GET /health` cek DB sungguhan; graceful shutdown tutup server/session-store/pool dengan rapi saat `SIGTERM`/`SIGINT` |

### Catatan
- `innerHTML` digunakan di frontend (backend sudah escape)
- CSP statis-page masih `'unsafe-inline'` di `script-src` — sengaja (komentar kode: kalau diperketat, registrasi Service Worker ditolak), bukan kelalaian, tapi tetap layak ditinjau ulang kalau constraint itu berubah
- Session cookie `Secure` sekarang otomatis (`NODE_ENV=production`), bukan hardcode — tidak perlu diubah manual, cukup pastikan `NODE_ENV` benar di production
- Lihat §10 Known Issues untuk celah state-machine status PSB

---

## 10. Known Issues / Quirks

- **FTTH data split** — lihat §7. `ftth_devices` vs salinan lama `reference_options` bisa drift; cek tabel/endpoint mana yang benar-benar dipakai permukaan yang Anda edit.
- **`psb.status` tidak punya state-machine** — beda dari `tickets` yang punya `VALID_TRANSITIONS`, `routes/psb.js` cuma cek keanggotaan list, bukan graf transisi valid, dan dropdown edit selalu menampilkan semua 4 status. Record bisa lompat `Terdaftar → Aktif` langsung, melewati otomasi decrement-inventory + draft-ONU yang cuma terpicu di transisi eksplisit `→ Terpasang`. Perbaikannya butuh `VALID_PSB_TRANSITIONS` mirip pola `tickets.js` — keputusan produk (apakah lompat status pernah sah?) sekaligus teknis.
- **Tabel `public_reports` belum dipakai** — dibuat migration script tapi belum ada route yang mereferensikannya.
- **Export tiket** mengambil SEMUA tiket (tanpa pagination) baru difilter di client.
- **Sorting daftar tiket** diterapkan client-side ke halaman yang sedang tampil saja, bukan server-side.
- **`POST /tickets/:id/update`** memakai POST (bukan PUT/PATCH) dengan `multipart/form-data`.
- **Tidak ada database test terpisah** — lihat §1 dan bagian Testing di `docs/developer-guide.md`; test jalan ke database dev asli lewat fixture bertanda & dibersihkan sendiri karena user DB tidak punya grant `CREATE DATABASE`.
- Session cookie `secure: false` — set `true` untuk HTTPS