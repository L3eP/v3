# Analisis Project: Sistem Ticketing & Manajemen Jaringan FTTH

**Project:** MAYUNG  
**Tanggal:** 2026-07-15  
**Stack:** Node.js / Express 5 + MySQL 8 | Vanilla JS Frontend  
**Arsitektur:** Monolith (Backend API + Frontend from same server)

---

## Daftar Isi

- [1. Identitas Aplikasi](#1-identitas-aplikasi)
- [2. Struktur Database](#2-struktur-database)
- [3. Arsitektur Aplikasi](#3-arsitektur-aplikasi)
- [4. Flowchart Aplikasi](#4-flowchart-aplikasi)
- [5. Daftar API Endpoint](#5-daftar-api-endpoint)
- [6. Daftar Halaman Frontend](#6-daftar-halaman-frontend)
- [7. Middleware](#7-middleware)
- [8. Keamanan](#8-keamanan)
- [9. Environment & Konfigurasi](#9-environment--konfigurasi)
- [10. Catatan Teknis](#10-catatan-teknis)

---

## 1. Identitas Aplikasi

| Atribut | Detail |
|---|---|
| **Nama** | MAYUNG — Ticketing & FTTH Network Management System |
| **Tujuan** | Manajemen tiket gangguan ISP + inventarisasi jaringan FTTH |
| **Role** | Owner (penuh), Operator (kelola), Teknisi (diri sendiri) |
| **Database** | MySQL 8, 6 tabel + sessions (auto) |
| **Frontend Libraries** | Chart.js (CDN), Leaflet (CDN), jsPDF (CDN), FontAwesome 6 (lokal) |
| **External Services** | Fonnte API (WhatsApp), OpenStreetMap tiles |
| **PWA** | Service worker + manifest — installable |
| **Autentikasi** | Session-based dengan MySQL store |

---

## 2. Struktur Database

### 2.1 `users` — Manajemen User

| Field | Type | Constraint | Keterangan |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | ID user |
| `username` | VARCHAR(255) | UNIQUE, NOT NULL | Login identifier |
| `password` | VARCHAR(255) | NOT NULL | bcrypt hash (10 rounds) |
| `full_name` | VARCHAR(255) | NOT NULL | Nama lengkap |
| `role` | VARCHAR(50) | DEFAULT 'User' | `Owner`, `Operator`, atau `Teknisi` |
| `phone` | VARCHAR(20) | NULL | Nomor telepon (format 62xx) |
| `photo` | VARCHAR(255) | NULL | Path foto profil |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Waktu dibuat |

### 2.2 `tickets` — Tiket Pekerjaan

| Field | Type | Constraint | Keterangan |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | ID tiket |
| `aktifitas` | VARCHAR(255) | NOT NULL | Jenis aktifitas |
| `sub_node` | VARCHAR(50) | NULL | Sub-node area |
| `odc` | VARCHAR(50) | NULL | ODC tujuan |
| `lokasi` | VARCHAR(100) | NOT NULL | Lokasi pekerjaan |
| `pic` | VARCHAR(255) | NULL | Person in charge |
| `priority` | VARCHAR(50) | NULL | Low / Moderate / Critical |
| `status` | VARCHAR(50) | DEFAULT 'Terlapor' | Terlapor / Dikerjakan / Selesai / Pending |
| `info` | TEXT | NULL | Deskripsi tambahan |
| `evidence` | VARCHAR(255) | NULL | Path file bukti |
| `created_by` | VARCHAR(255) | NULL | Pembuat tiket |
| `date_selesai` | TIMESTAMP | NULL | Tanggal selesai |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Tanggal dibuat |

**Indexes:** created_by, status, created_at, priority, sub_node, lokasi

### 2.3 `activities` — Log Aktivitas

| Field | Type | Constraint | Keterangan |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | ID aktivitas |
| `description` | TEXT | NOT NULL | Deskripsi aktivitas |
| `username` | VARCHAR(255) | NOT NULL | Pelaku |
| `date` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Waktu aktivitas |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Waktu dibuat |
| `date_selesai` | TIMESTAMP | NULL | Waktu selesai |
| `ticket_id` | INT | FK → tickets(id) ON DELETE SET NULL | Tiket terkait (opsional) |

**Indexes:** username, ticket_id, date

### 2.4 `ticket_status_history` — Riwayat Status

| Field | Type | Constraint | Keterangan |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | ID riwayat |
| `ticket_id` | INT | NOT NULL, FK → tickets(id) ON DELETE CASCADE | Tiket |
| `old_status` | VARCHAR(50) | NULL | Status sebelumnya |
| `new_status` | VARCHAR(50) | NOT NULL | Status baru |
| `changed_by` | VARCHAR(255) | NOT NULL, FK → users(username) ON DELETE CASCADE | Pengubah |
| `changed_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Waktu perubahan |

### 2.5 `settings` — Pengaturan Aplikasi

| Field | Type | Constraint | Keterangan |
|---|---|---|---|
| `setting_key` | VARCHAR(50) | PK | Key (company_name, company_logo) |
| `setting_value` | TEXT | NULL | Value |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | Waktu update |

### 2.6 `reference_options` — Data Referensi Dinamis

> Migration file: `scripts/add_reference_table.sql` (tidak ada di schema.sql)

| Field | Type | Constraint | Keterangan |
|---|---|---|---|
| `id` | INT | PK, AUTO_INCREMENT | ID |
| `type` | VARCHAR(50) | NOT NULL, INDEX | Tipe: aktifitas, sub_node, odc, odp, olt, onu, priority |
| `label` | VARCHAR(255) | NOT NULL | Nilai tampilan |
| `group_name` | VARCHAR(100) | NULL | Parent/group (untuk hierarki FTTH) |
| `latitude` | DECIMAL(10,7) | NULL | Koordinat latitude |
| `longitude` | DECIMAL(10,7) | NULL | Koordinat longitude |
| `sort_order` | INT | DEFAULT 0 | Urutan tampilan |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Waktu dibuat |

**UNIQUE:** (type, label, group_name) — mencegah duplikasi

**Seed data:**

| Type | Data |
|---|---|
| aktifitas | PSB, Maintenance, loss, migrasi |
| sub_node | ANJ, SKM, JRG, DMS, SKJ, RKM, MBL |
| odc | 15 ODC entries (grouped by OLT JRG/SKM/HNM/DMS/HIOSO) |
| odp | 8 ODP entries (grouped by parent ODC) |
| priority | Low, Moderate, Critical, Urgent |

### 2.7 `sessions` — Session Store

Dibuat otomatis oleh `express-mysql-session`. Berisi data session user.

---

## 3. Arsitektur Aplikasi

### 3.1 Struktur Backend

```
server.js
├── middleware/
│   ├── auth.js           # isAuthenticated, isAdmin, isOwnerOrOperator
│   ├── upload.js         # Multer (gambar, 5MB)
│   └── asyncHandler.js   # Centralized async error wrapper
├── routes/
│   ├── auth.js           # Login/logout/register
│   ├── users.js          # CRUD user
│   ├── tickets.js        # CRUD tiket + riwayat status + WA notif
│   ├── activities.js     # CRUD aktivitas
│   ├── settings.js       # Company name/logo
│   ├── references.js     # CRUD referensi + FTTH
│   └── geo.js            # Data peta
├── services/
│   └── notification.js   # WhatsApp via Fonnte
├── utils/
│   ├── logger.js         # Winston daily rotate
│   └── phone.js          # Sanitasi nomor telepon
└── db.js                 # MySQL2 connection pool
```

### 3.2 Struktur Frontend

```
public/
├── *.html                # 14 halaman (1 per fitur)
├── css/style.css         # ~1650 baris, single file
├── js/
│   ├── script.js         # Login form handler
│   ├── navbar.js         # Sidebar dinamis (shared semua halaman)
│   ├── dashboard.js      # Dashboard Owner/Operator
│   ├── user-dashboard.js # Dashboard Teknisi
│   ├── ticket-list.js    # Table + pagination + sort + export
│   ├── ticket-details.js # Detail + edit + history
│   ├── new-ticket.js     # Form create dengan dropdown dinamis
│   ├── activity.js       # Log + history + export
│   ├── ftth.js           # Tab-based FTTH CRUD
│   ├── map.js            # Leaflet map
│   ├── admin.js          # Admin panel card grid + tree
│   ├── register.js       # Register form (Owner only)
│   ├── user-list.js      # User table
│   ├── settings.js       # Profile + company settings
│   ├── edit-user.js      # Edit user (Owner only)
│   └── toast.js          # Shared toast utility
├── sw.js                 # Service Worker
├── manifest.json         # PWA manifest
└── vendor/fontawesome/   # Font Awesome 6 local
```

### 3.3 Arsitektur Keamanan

```
Client Request
  │
  ├─ helmet (CSP headers)
  ├─ Global Rate Limit (1000/15min)
  ├─ Session Check (if applicable)
  │
  ├─ Route-specific Middleware
  │   ├─ isAuthenticated → 401 if no session
  │   ├─ isAdmin → 403 if not Owner
  │   └─ isOwnerOrOperator → 403 if not Owner/Operator
  │
  ├─ Rate Limit Spesifik (login: 5/15min, register: 5/jam)
  ├─ express-validator (trim, escape, whitelist)
  │
  ├─ Route Handler
  │   ├─ IDOR Check (ownership verification)
  │   ├─ Parameterized Query (SQL injection safe)
  │   └─ Response
  │
  └─ asyncHandler (catch errors → Winston log → 500 JSON)
```

---

## 4. Flowchart Aplikasi

### 4.1 Alur Autentikasi

```
User → Input username/password → POST /login
  ↓
bcrypt.compare(password, hash)
  ↓
Match? ──Ya──→ Set session (req.session.user = {...})
  │              ↓
  │            Role check:
  │              ├─ Owner/Operator → redirect /dashboard.html
  │              ├─ Teknisi → redirect /activity.html
  │              └─ default → redirect /user-dashboard.html
  │
  Tidak
  ↓
401 "Invalid credentials"
```

### 4.2 Alur Pembuatan Tiket

```
User → Isi form new-ticket → POST /tickets (FormData)
  ↓
Middleware:
  ├─ isAuthenticated → cek session
  └─ upload.single('evidence') → proses file (opsional)
  ↓
Route Handler:
  ├─ validasi express-validator
  ├─ cek createdBy === session.username
  ├─ INSERT INTO tickets (...)
  ├─ Fire WA notification (async, non-blocking)
  └─ Response 201 { ticket }
```

### 4.3 Alur Dashboard

```
Dashboard load → GET /tickets (paginated)
  ↓
Hitung statistik bulan ini:
  ├─ Total
  ├─ Selesai
  ├─ Dikerjakan
  └─ Pending
  ↓
Render Chart.js (bar/pie) — group by subNode/ODC/aktifitas
  ↓
Render Recent Tickets (filter non-Selesai, top 10)
Render Activity Log (filter by user if selected)
```

### 4.4 Alur FTTH Management

```
Dua interface:

1. ftth.html (Tab-based):
   Tab OLT → List OLT → Add/Edit/Delete OLT
   Tab ODC → List ODC (filter by parent OLT) → Add/Edit/Delete ODC
   Tab ODP → List ODP (filter by parent ODC) → Add/Edit/Delete ODP
   Tab ONU → List ONU (filter by parent ODP) → Add/Edit/Delete ONU

2. admin.html (Tree view):
   OLT
   ├── ODC_A
   │   ├── ODP_1
   │   └── ODP_2
   └── ODC_B
       └── ODP_3

Semua CRUD → /api/references (POST/PUT/DELETE)
Data hierarki via group_name column
```

---

## 5. Daftar API Endpoint

### 5.1 Auth
| Method | Endpoint | Auth | Rate Limit | Deskripsi |
|---|---|---|---|---|
| POST | `/login` | - | 5/15min | Login |
| POST | `/logout` | Authenticated | - | Logout |
| POST | `/register` | Owner | 5/jam | Register user baru |

### 5.2 Tickets
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| GET | `/tickets` | Authenticated | List (pagination + filter) |
| GET | `/tickets/:id` | Authenticated | Detail (IDOR protected) |
| GET | `/tickets/:id/history` | Authenticated | Riwayat status |
| POST | `/tickets` | Authenticated | Buat baru |
| POST | `/tickets/:id/update` | Authenticated | Update (IDOR protected) |
| DELETE | `/tickets/:id` | Authenticated | Hapus (creator/Owner/Operator) |

### 5.3 Activities
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| GET | `/activities` | Authenticated | List (pagination, RBAC) |
| POST | `/activities` | Authenticated | Log aktivitas baru |
| DELETE | `/activities/:id` | Owner/Operator | Hapus log |

### 5.4 Users
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| GET | `/users` | Owner/Operator | List semua user |
| GET | `/users/:username` | Authenticated | Detail user |
| POST | `/update-profile` | Self | Update profil sendiri |
| POST | `/update-role` | Owner | Update role user |
| POST | `/admin/users/update` | Owner | Admin update user |
| DELETE | `/users/:username` | Owner | Hapus user |

### 5.5 Settings
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| GET | `/settings/company-name` | Public | Ambil nama perusahaan |
| POST | `/settings/company-name` | Owner | Update nama perusahaan |
| GET | `/settings/company-logo` | Public | Ambil logo perusahaan |
| POST | `/settings/company-logo` | Owner | Upload logo (multipart) |

### 5.6 References
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| GET | `/api/references` | Authenticated | Semua referensi (grouped by type) |
| POST | `/api/references` | Owner | Tambah referensi baru |
| PUT | `/api/references/:id` | Owner | Edit referensi |
| DELETE | `/api/references/:id` | Owner | Hapus referensi |

### 5.7 Geo
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| GET | `/api/geo` | Authenticated | Data peta (OLT/ODC/ODP/ONU + koordinat) |

---

## 6. Daftar Halaman Frontend

| Halaman | File JS | Auth | Deskripsi |
|---|---|---|---|
| `index.html` | `script.js` | Public | Login form |
| `dashboard.html` | `dashboard.js`, `navbar.js` | Owner/Operator | Dashboard + statistik + chart + activity log |
| `user-dashboard.html` | `user-dashboard.js`, `navbar.js` | Teknisi | Dashboard terbatas |
| `ticket-list.html` | `ticket-list.js`, `navbar.js` | All roles | Table + pagination + filter + export |
| `ticket-details.html` | `ticket-details.js`, `navbar.js` | All roles | Detail + edit + delete + history |
| `new-ticket.html` | `new-ticket.js`, `navbar.js` | All roles | Form create tiket |
| `activity.html` | `activity.js`, `navbar.js` | All roles | Log + history + export |
| `ftth.html` | `ftth.js`, `navbar.js` | All roles | FTTH tab-based CRUD |
| `map.html` | `map.js`, `navbar.js` | All roles | Peta Leaflet |
| `admin.html` | `admin.js`, `navbar.js` | Owner | Admin panel card grid + FTTH tree |
| `register.html` | `register.js`, `navbar.js` | Owner | Register user |
| `user-list.html` | `user-list.js`, `navbar.js` | Owner/Operator | Manajemen user |
| `settings.html` | `settings.js`, `navbar.js` | All roles | Profil + company settings (Owner) |
| `edit-user.html` | `edit-user.js`, `navbar.js` | Owner | Edit user by admin |

---

## 7. Middleware

### 7.1 `middleware/auth.js`

| Fungsi | Cek | Response |
|---|---|---|
| `isAuthenticated` | `req.session.user` exists | 401 `Unauthorized: Please log in` |
| `isAdmin` | `role === 'Owner'` | 403 `Forbidden: Owner access required` |
| `isOwnerOrOperator` | `role === 'Owner' or 'Operator'` | 403 `Forbidden: Owner or Operator access required` |

### 7.2 `middleware/upload.js`
- Storage: `public/uploads/` (disk)
- Filename sanitasi: ganti karakter non-alfanumerik dengan `_`
- Filter: image only (jpeg, jpg, png, gif, webp)
- Limit: 5MB

### 7.3 `middleware/asyncHandler.js`
- Wrapper async function → catch error → Winston log → 500 JSON response
- Mengeliminasi ~20+ blok try/catch di semua route

---

## 8. Keamanan

### 8.1 Yang Sudah Baik

| Aspek | Detail |
|---|---|
| **Password** | bcrypt 10 rounds |
| **Session** | httpOnly, sameSite: strict, 24 jam, MySQL store |
| **Rate limiting** | Global 1000/15min, Login 5/15min, Register 5/jam |
| **SQL Injection** | Parameterized queries (mysql2) |
| **IDOR Protection** | Cek ownership di setiap akses tiket |
| **Input Validation** | express-validator (trim, escape, whitelist) |
| **Helmet** | CSP headers untuk XSS protection |
| **File Upload** | Type filter, 5MB limit, filename sanitasi |
| **Error Handling** | asyncHandler, stack trace aman dari client |

### 8.2 Yang Perlu Ditingkatkan

| Issue | Severity | Detail |
|---|---|---|
| **CSRF Protection** | 🟠 Medium | Tidak ada CSRF token |
| **innerHTML di Frontend** | 🟠 Medium | XSS potensial via innerHTML |
| **Rate Limit Tiket** | 🟢 Low | POST /tickets tidak di-rate-limit |
| **Admin Update Validasi** | 🟢 Low | `POST /admin/users/update` tanpa express-validator |

---

## 9. Environment & Konfigurasi

File `.env`:

```env
DB_HOST=localhost
DB_USER=login_app_user
DB_PASSWORD=strongpassword
DB_NAME=login_app_db
PORT=3000
SESSION_SECRET=supersecretkey123
FONNTE_TOKEN=token_fonnte
```

> Catatan: PORT default di kode adalah 3002 (fallback jika tidak diset di .env)

**Dependencies Utama:**
| Package | Versi | Fungsi |
|---|---|---|
| express | ^5.1.0 | Framework web |
| mysql2 | ^3.15.3 | Database driver (promise-based) |
| bcryptjs | ^3.0.3 | Password hashing |
| express-session | ^1.18.2 | Session management |
| express-mysql-session | ^3.0.3 | MySQL session store |
| express-rate-limit | ^8.2.1 | Rate limiting |
| express-validator | ^7.3.1 | Input validation |
| helmet | ^8.1.0 | Security headers |
| multer | ^2.0.2 | File uploads |
| winston | ^3.19.0 | Logging |
| axios | ^1.13.2 | HTTP client (Fonnte API) |

---

## 10. Catatan Teknis

### 10.1 Logging
- File: `logs/app-YYYY-WW.log` + `logs/error-YYYY-WW.log`
- Rotasi: mingguan, max 20MB/file, retain 14 hari
- Console aktif jika `NODE_ENV !== 'production'`

### 10.2 Service Worker
- Cache name: `login-app-v2`
- Pre-cache: semua HTML + JS + CSS + manifest
- Strategy: network-first untuk API, stale-while-revalidate untuk assets
- Hapus cache lama di event activate

### 10.3 PWA Manifest
- Theme color: `#DC2626` (merah)
- Background: `#f8fafc` (slate 50)
- Ikon: 512×512 maskable
- Orientation: any

### 10.4 Notifikasi WhatsApp
- Provider: Fonnte API
- Trigger: tiket baru + status berubah
- Penerima: PIC (teknisi) + semua Operator
- Phone format: 62xx (dengan sanitasi)

### 10.5 Known Bugs
1. **CSS typo** — `form-.action-buttons` di style.css:1340 (selector tidak valid)
2. **Export overfetch** — Export tiket fetch semua data tanpa pagination
3. **Sorting client-side** — Sorting tiket hanya di halaman aktif, tidak server-side
4. **Global fetch override** — window.fetch di-override untuk intercept 401

### 10.6 Deployment
- Script: `./deploy.sh dev` atau `./deploy.sh prod`
- Dev: nodemon / node server.js
- Prod: PM2 (`pm2 start server.js --name "login-app"`)
