# MAYUNG — Sistem Ticketing & Manajemen Jaringan FTTH

Aplikasi web untuk ISP di Lombok, NTB yang menangani pelaporan gangguan jaringan (ticketing), pencatatan aktivitas teknisi, manajemen infrastruktur FTTH (OLT → ODC → ODP → ONU) dengan port tracking, PSB (Pemasangan Baru), inventory stok perangkat, dan visualisasi peta geografis interaktif.

**Stack:** Node.js / Express 5 + MySQL 8 — Vanilla JS frontend (19 script), PWA-enabled, 16 halaman.

---

## Fitur

| Modul | Deskripsi |
|---|---|
| **Ticketing** | CRUD tiket, status workflow (Terlapor→Dikerjakan→Selesai), soft-delete, riwayat perubahan status, upload evidence, role-based field restriction |
| **Activity Logging** | Catatan aktivitas teknisi per tiket, export CSV/PDF, delete (Owner/Operator) |
| **Jaringan FTTH** | Hierarki OLT→ODC→ODP→ONU, port tracking (`Port 3/8`), dua interface: tab CRUD (`/ftth.html`) + tree admin |
| **Peta Interaktif** | Leaflet.js, batas NTB, circle markers, chain koneksi (klik parent → flyTo), Google Maps link |
| **PSB (Pemasangan Baru)** | Form registrasi pelanggan + ONU, upload foto modem, status workflow (Terdaftar→Terpasang→Aktif→Batal) |
| **Inventory** | Manajemen stok perangkat (ODP, ONU, kabel, dll), tracking sisa stok, histori pemakaian |
| **SLA Dashboard** | Rata-rata waktu penyelesaian tiket, statistik bulanan, Chart.js bar/pie |
| **RBAC** | 3 role: **Owner** (full), **Operator** (kelola), **Teknisi** (self-only) |
| **Notifikasi WhatsApp** | Otomatis via Fonnte API — tiket baru & status berubah → pembuat + PIC |
| **Export** | CSV (BOM Excel) & PDF dengan summary rekap (by status + priority), filter bulan ini / semua |
| **PWA** | Service worker + manifest — installable di HP |

---

## Struktur Proyek

```
.
├── server.js                 # Entry point Express 5
├── db.js                     # MySQL2 connection pool
├── schema.sql                # Database schema (6 tabel + auto sessions)
├── deploy.sh                 # Deployment script (dev/prod)
├── .env.example              # Template environment
├── .eslintrc.json            # ESLint config
├── .prettierrc               # Prettier config
├── middleware/
│   ├── auth.js               # isAuthenticated, isAdmin, isOwnerOrOperator
│   ├── upload.js             # Multer — image only, 5MB
│   ├── asyncHandler.js       # Async error wrapper
│   └── csrf.js               # Double-submit cookie CSRF
├── routes/                   # 9 route files
│   ├── auth.js               # POST /login, /logout, /register
│   ├── users.js              # GET /users, POST /update-profile, /admin/users/update
│   ├── tickets.js            # CRUD /tickets + status history + workflow validation
│   ├── activities.js         # CRUD /activities
│   ├── settings.js           # Company name/logo
│   ├── references.js         # CRUD /api/references (dropdowns + FTTH topology)
│   ├── geo.js                # GET /api/geo (map data)
│   ├── psb.js                # CRUD /api/psb (Pemasangan Baru)
│   └── inventory.js          # CRUD /api/inventory
├── services/
│   └── notification.js       # WhatsApp via Fonnte API
├── utils/
│   ├── logger.js             # Winston daily rotate
│   └── phone.js              # Phone sanitizer (62xx format)
├── scripts/
│   ├── add_reference_table.sql    # reference_options + seed data
│   ├── add_indexes.sql            # Performance indexes
│   ├── add_deleted_at_tickets.sql # Soft-delete migration
│   ├── add_parent_port.sql        # Port tracking migration
│   ├── fix_fk_history.sql         # FK fix migration
│   ├── backup-db.sh              # Backup script
│   └── migrate_history.js         # ticket_status_history table
├── public/
│   ├── *.html                # 16 halaman (lihat tabel di bawah)
│   ├── js/                   # 19 JS files
│   ├── css/style.css         # ~1660 baris, single file
│   ├── sw.js                 # PWA service worker
│   ├── manifest.json         # PWA manifest
│   └── vendor/fontawesome/   # Font Awesome 6 local
├── docs/
│   ├── api-reference.md
│   ├── developer-guide.md
│   ├── deployment-checklist.md
│   ├── code_documentation_en.md
│   ├── code_documentation_id.md
│   ├── review.md
│   ├── analisis.md
│   ├── analisis-mendalam.md
│   └── master-roadmap.md
└── test/
    └── api.test.js           # Mocha + supertest
```

---

## Database

7 tabel aplikasi + `sessions` (auto oleh express-mysql-session):

| Tabel | Fungsi |
|---|---|
| `users` | Akun user (bcrypt, default role: Teknisi) |
| `tickets` | Tiket pekerjaan + soft-delete (`deleted_at`) |
| `activities` | Log aktivitas, FK nullable ke tickets |
| `ticket_status_history` | Riwayat perubahan status tiket |
| `settings` | Key-value (company_name, company_logo) |
| `reference_options` | Data referensi + topologi FTTH dengan koordinat |
| `psb` | Pemasangan Baru / registrasi ONU pelanggan |
| `inventory` | Stok perangkat |
| `inventory_log` | Histori pemakaian inventory |

**Lihat:** `schema.sql` + `scripts/` untuk DDL lengkap dan migrasi.

---

## Instalasi

```bash
# 1. Clone & install
git clone <repo-url>
cd mayung-app
npm install

# 2. Copy environment
cp .env.example .env
# Isi: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, SESSION_SECRET, PORT, FONNTE_TOKEN

# 3. Setup database
mysql -u root -p < schema.sql
mysql -u root -p < scripts/add_reference_table.sql

# 4. Migration
node scripts/migrate_history.js
mysql -u root -p login_app_db < scripts/add_deleted_at_tickets.sql
mysql -u root -p login_app_db < scripts/add_parent_port.sql
mysql -u root -p login_app_db < scripts/fix_fk_history.sql

# 5. Jalankan (development — hot reload)
npm run dev
# → http://localhost:3002

# Atau production
npm run prod
```

---

## RBAC

| Role | Akses |
|---|---|
| **Owner** | Full — referensi, user, role, settings, admin panel, inventory |
| **Operator** | Lihat user, kelola tiket, hapus aktivitas, PSB, inventory, edit FTTH |
| **Teknisi** | Tiket sendiri, aktivitas sendiri, FTTH view, map, daftarkan PSB |

**Middleware:** `middleware/auth.js` — `isAuthenticated`, `isAdmin` (Owner), `isOwnerOrOperator`

---

## Halaman Frontend

| Halaman | JS | Auth | Fitur |
|---|---|---|---|
| `index.html` | `script.js` | Public | Login |
| `dashboard.html` | `dashboard.js` | Owner/Operator | Statistik, Chart.js, SLA, recent tickets, activity log |
| `user-dashboard.html` | `user-dashboard.js` | Teknisi | Dashboard terbatas |
| `ticket-list.html` | `ticket-list.js` | All roles | Tabel + pagination + filter + export CSV/PDF rekap |
| `ticket-details.html` | `ticket-details.js` | All roles | Detail + edit + delete + status timeline |
| `new-ticket.html` | `new-ticket.js` | All roles | Form create tiket |
| `activity.html` | `activity.js` | All roles | Log + history + export |
| `ftth.html` | `ftth.js` | All roles | Tab CRUD (OLT/ODC/ODP/ONU) + port tracking |
| `map.html` | `map.js` | All roles | Peta Leaflet + chain koneksi interaktif |
| `psb.html` | `psb.js` | All roles | Form PSB + upload foto + list |
| `inventory.html` | `inventory.js` | Owner/Operator | Stok perangkat |
| `admin.html` | `admin.js` | Owner | Panel referensi + add user |
| `register.html` | — | Redirect | Redirect ke admin.html |
| `user-list.html` | `user-list.js` | Owner/Operator | Manajemen user |
| `settings.html` | `settings.js` | All roles | Profil + company settings (Owner) |
| `edit-user.html` | `edit-user.js` | Owner | Edit user by admin |

---

## API Endpoints

Semua route di-mount di `/`. Lihat `docs/api-reference.md` untuk dokumentasi lengkap dengan contoh request/response.

### Auth
- `POST /login` — Login (rate limit: 5/15min)
- `POST /logout` — Logout
- `POST /register` — Register (Owner only, rate limit: 5/jam)

### Tickets
- `GET /tickets` — List (pagination + filter: search, status, priority, tanggal)
- `POST /tickets` — Create (multipart, evidence opsional)
- `GET /tickets/:id` — Detail (IDOR protected)
- `POST /tickets/:id/update` — Update (role-based field restriction + workflow validation)
- `DELETE /tickets/:id` — Soft-delete (creator/Owner/Operator)
- `GET /tickets/:id/history` — Status timeline

### Activities
- `GET /activities` — List (pagination, RBAC)
- `POST /activities` — Log activity
- `DELETE /activities/:id` — Owner/Operator only

### Users
- `GET /users` — List all (Owner/Operator)
- `GET /users/:username` — Detail
- `POST /update-profile` — Self
- `POST /update-role` — Owner only (validated whitelist)
- `POST /admin/users/update` — Owner (validated)
- `DELETE /users/:username` — Owner (self-delete protected)

### Settings
- `GET /settings/company-name` — Public
- `POST /settings/company-name` — Owner only
- `GET /settings/company-logo` — Public
- `POST /settings/company-logo` — Owner only (multipart)

### References & FTTH
- `GET /api/references` — All references grouped by type
- `POST /api/references` — Create (all roles)
- `PUT /api/references/:id` — Update (all roles)
- `DELETE /api/references/:id` — Delete (all roles)

### Geo (Map)
- `GET /api/geo` — OLT, ODC, ODP, ONU with coordinates + parentPort

### PSB
- `GET /api/psb` — List (all roles)
- `POST /api/psb` — Create (all roles, multipart)
- `PUT /api/psb/:id` — Update (Owner/Operator)
- `DELETE /api/psb/:id` — Delete (Owner/Operator)

### Inventory
- `GET /api/inventory` — List (all roles)
- `POST /api/inventory` — Create (Owner/Operator)
- `PUT /api/inventory/:id` — Update (Owner/Operator)
- `DELETE /api/inventory/:id` — Delete (Owner/Operator)

---

## Notifikasi WhatsApp

```env
FONNTE_TOKEN=token_dari_fonnte
```
- Tiket baru → pembuat tiket + PIC
- Status berubah → pembuat tiket + PIC
- Nomor otomatis distandarisasi ke format `62xx`

---

## Commands

```bash
npm start         # node server.js
npm run dev       # node --watch server.js (hot reload)
npm run prod      # NODE_ENV=production node server.js
npm test          # mocha test/*.test.js
npx eslint .      # Linting
npx prettier --check .   # Format check
```

---

## Environment Variables

```
DB_HOST=localhost
DB_USER=login_app_user
DB_PASSWORD=strongpassword
DB_NAME=login_app_db
PORT=3000
SESSION_SECRET=supersecretkey123
FONNTE_TOKEN=token_dari_fonnte
NODE_ENV=development
```

> `server.js` fallback ke port **3002** jika PORT tidak diset.

---

## Fitur Keamanan

| Aspek | Implementasi |
|---|---|
| **Password** | bcrypt 10 rounds |
| **Session** | MySQL store, httpOnly, sameSite: strict, 24 jam |
| **Rate limiting** | Global 1000/15min, Login 5/15min, Register 5/jam |
| **SQL injection** | Parameterized queries (mysql2) |
| **IDOR** | Ownership check di setiap endpoint tiket |
| **CSRF** | Double-submit cookie pattern |
| **Input validation** | express-validator + whitelist role |
| **Helmet** | Security headers dengan CSP |
| **File upload** | Image only, 5MB, filename sanitasi |
| **Error handling** | asyncHandler, stack trace aman dari client |
| **Audit trail** | Log semua operasi delete via Winston |

---

## Pengembangan

- **Tidak ada bundler** — edit langsung file di `public/js/*.js`
- **Hot reload** — `npm run dev` = `node --watch`
- **Service worker** — cache name `login-app-v2`. Hard refresh (Cmd+Shift+R) jika perubahan tidak muncul
- **Logging** — `logs/` daily rotate (app-YYYY-WW.log / error-YYYY-WW.log)
- **CSS** — single file `style.css` (~1660 baris), custom properties
- **Font Awesome 6** — lokal di `vendor/fontawesome/`
- **Test** — mocha + supertest, running via `npm test`
- **API Reference** — `docs/api-reference.md`
- **Developer Guide** — `docs/developer-guide.md`
- **Deployment** — `docs/deployment-checklist.md`
