# Dokumentasi Kode Lengkap

**Proyek:** MAYUNG — Sistem Ticketing & Manajemen Jaringan FTTH  
**Stack:** Node.js / Express 5 + MySQL 8 | Vanilla JS Frontend  
**Terakhir diperbarui:** 2026-07-19

---

## 1. Ikhtisar Arsitektur

Multi-Page Application (MPA) dengan:
- **Backend:** Express 5, session-based auth (MySQL store), Helmet, rate limiting, centralized async error handling, CSRF protection
- **Database:** MySQL 8 via `mysql2` connection pool — 7 tabel aplikasi + 1 tabel session (otomatis)
- **Frontend:** Vanilla JavaScript (tanpa framework), HTML5, CSS3 custom properties, PWA service worker, 16 halaman, 19 skrip
- **Notifikasi:** WhatsApp via Fonnte API (fire-and-forget dengan catch handler)
- **Role:** Owner (penuh), Operator (kelola), Teknisi (diri sendiri)
- **Pola:** Server-side pagination, RBAC middleware chain, async handler wrapper, `INSERT ... ON DUPLICATE KEY UPDATE`, soft-delete, double-submit cookie CSRF

### Jumlah File

| Layer | Jumlah |
|---|---|
| Backend JS | 1 server + 9 routes + 4 middleware + 2 utils + 1 service = 17 |
| Frontend HTML | 16 halaman |
| Frontend JS | 19 skrip klien |
| Frontend CSS | 1 stylesheet (~1660 baris) |
| Scripts | 6 migrasi SQL + 1 JS migration + 1 shell backup = 8 |
| Docs | 9 file markdown |
| Test | 1 file test (mocha + supertest) |

---

## 2. Entry Point — `server.js`

Mengimpor dan mengonfigurasi middleware secara berurutan:

1. **Helmet** — CSP (scripts dari cdn.jsdelivr.net, Google Fonts, self)
2. **JSON parsing** — `express.json()` + `express.urlencoded()`
3. **Static files** — `express.static('public')`
4. **Request logging** — Winston per request (method, url, ip, user-agent)
5. **Global rate limiter** — 1000 request per 15 menit per IP
6. **Session** — `express-session` dengan MySQL store (`express-mysql-session`)
   - Key: `session_cookie_name`
   - Secure: false (true untuk HTTPS)
   - httpOnly, sameSite: strict, 24 jam
7. **Uploads directory** — auto-buat `public/uploads/` jika belum ada
8. **CSRF Protection** — double-submit cookie (setelah session, sebelum routes)
9. **Routes** — 9 file route di-mount di `/`
10. **Global error handler** — Error Multer (400), error filter gambar (400), generic (500)

Port: membaca `PORT` dari `.env`, fallback ke **3002**.

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

---

## 4. Routes

Semua route di-mount di `/` (tanpa prefix /api).

### 4.1 `routes/auth.js`
- **`POST /login`** — Rate limited (5/15min). Validasi express-validator, bcrypt.compare → session → redirect
- **`POST /logout`** — Hancurkan session
- **`POST /register`** — Owner only, rate limit 5/jam, upload photo, bcrypt 10 rounds, role whitelist

### 4.2 `routes/users.js`
- **`GET /users`** — Owner/Operator. SELECT kolom eksplisit (tanpa password)
- **`GET /users/:username`** — Self atau Owner/Operator
- **`POST /update-profile`** — Self. Butuh current password
- **`POST /update-role`** — Owner, validasi whitelist `isIn(['Owner','Operator','Teknisi'])`
- **`POST /admin/users/update`** — Owner, express-validator (role whitelist, password min 6)
- **`DELETE /users/:username`** — Owner, self-delete protected

### 4.3 `routes/tickets.js`
- **`POST /tickets`** — Authenticated, upload evidence, WA notification (catch handler)
- **`GET /tickets`** — Paginated, soft-delete filter, filterable, RBAC Teknisi
- **`GET /tickets/:id`** — IDOR protected
- **`POST /tickets/:id/update`** — IDOR protected, role-based field restriction, workflow validation, WA notification
- **`DELETE /tickets/:id`** — Soft-delete (set `deleted_at`)
- **`GET /tickets/:id/history`** — Status timeline

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
- CRUD /api/references — semua role (termasuk edit/delete). Include parent_port.

### 4.7 `routes/geo.js`
- GET /api/geo — OLT/ODC/ODP/ONU dengan koordinat + parentPort

### 4.8 `routes/psb.js`
- CRUD /api/psb — POST semua role, PUT/DELETE Owner/Operator. Upload foto.

### 4.9 `routes/inventory.js`
- CRUD /api/inventory — GET semua role, POST/PUT/DELETE Owner/Operator

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
Sidebar dengan 5 menu utama + sub-nav:
- Dashboard, Tiket (List, New), Laporan (Activity, PSB), Jaringan (FTTH, Peta), Panel (Inventory, Users, Admin)
- State expand/collapse tersimpan di localStorage
- Role-based, collapsible, mobile responsive

### Halaman & Script

| Halaman | Script | Fitur |
|---|---|---|
| **index.html** | `script.js` | Login dengan csrfFetch |
| **dashboard.html** | `dashboard.js` | Statistik, Chart.js, SLA, recent tickets, apiFetch wrapper |
| **user-dashboard.html** | `user-dashboard.js` | Dashboard Teknisi, apiFetch wrapper |
| **ticket-list.html** | `ticket-list.js` | Pagination, sort, filter, export CSV/PDF rekap |
| **ticket-details.html** | `ticket-details.js** | Detail, edit modal, timeline, soft-delete, showConfirm |
| **new-ticket.html** | `new-ticket.js` | Form dengan dropdown dinamis, cascading ODC→ODP |
| **activity.html** | `activity.js` | Log aktivitas, history, export |
| **ftth.html** | `ftth.js` | Tab CRUD (OLT/ODC/ODP/ONU) + port tracking |
| **map.html** | `map.js` | Leaflet map, chain koneksi, flyToDevice, Google Maps link |
| **psb.html** | `psb.js` | Form PSB, upload foto, detail modal, edit inline |
| **admin.html** | `admin.js` | Card grid, CRUD referensi, add user |
| **inventory.html** | `inventory.js** | Stok perangkat, warna status stok |
| **settings.html** | `settings.js` | Update profil, company settings (Owner) |
| **register.html** | — | Redirect ke admin.html |
| **user-list.html** | `user-list.js` | Tabel user, edit/delete (Owner), showConfirm |
| **edit-user.html** | `edit-user.js` | Edit user oleh Owner |

### Shared Utilities
- **`js/csrf.js`** — `csrfFetch(url, opts)` untuk state-changing requests
- **`js/toast.js`** — `showToast()` + `showConfirm()` (modal ganti confirm native)

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
| role | VARCHAR(50) | DEFAULT 'Teknisi' |
| phone | VARCHAR(20) | NULL |
| photo | VARCHAR(255) | NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `tickets`
12 kolom + `deleted_at` untuk soft-delete. Status workflow: Terlapor, Dikerjakan, Selesai, Pending.

#### `activities`
6 kolom. `ticket_id` FK → tickets ON DELETE SET NULL.

#### `ticket_status_history`
6 kolom. FK `ticket_id` → tickets CASCADE. `changed_by` sebagai snapshot (tanpa FK ke users).

#### `settings`
Key-value (company_name, company_logo).

#### `reference_options`
Migration table. Type: aktifitas, sub_node, odc, odp, olt, onu, priority. + parent_port.

#### `psb`
11 kolom + photo. Status: Terdaftar, Terpasang, Aktif, Batal.

#### `inventory` + `inventory_log`
Manajemen stok perangkat.

---

## 8. Alur Kerja Utama

### Pembuatan Tiket → WA
1. Form → POST /tickets → validasi → insert → WA ke pembuat + PIC → 201

### Perubahan Status → Tervalidasi
1. Validasi transisi (Terlapor→Selesai = ditolak)
2. Validasi field per role (Teknisi: status+info+evidence saja)
3. Log ke ticket_status_history
4. WA notification

### Soft-Delete
1. DELETE → set `deleted_at = NOW()`
2. Semua query filter `WHERE deleted_at IS NULL`
3. History tetap bisa diakses

### Hierarki FTTH dengan Port
Parent-child via `group_name`, port tracking via `parent_port`:
- OLT → ODC (Port 1/16) → ODP (Port 3/8) → ONU (Port 1/1)

---

## 9. Keamanan

| Pengukuran | Implementasi |
|---|---|
| **Password** | bcryptjs, 10 rounds |
| **Session** | MySQL store, httpOnly, sameSite: strict, 24 jam |
| **Rate limiting** | Global 1000/15min, Login 5/15min, Register 5/jam |
| **Validasi input** | express-validator (trim, escape, whitelist) |
| **SQL injection** | Parameterized queries via mysql2 |
| **IDOR** | Cek ownership di setiap akses resource |
| **CSRF** | Double-submit cookie |
| **CSP** | Helmet dengan Content Security Policy |
| **Upload file** | Whitelist tipe, 5MB, sanitasi filename |
| **Error handling** | Centralized asyncHandler |
| **Audit trail** | Logger.warn untuk semua operasi delete |

### Catatan
- `innerHTML` digunakan di frontend (backend sudah escape)
- CSP masih `'unsafe-inline'` — perlu diperketat untuk production
- Session cookie `secure: false` — set `true` untuk HTTPS