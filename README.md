# MAYUNG — Sistem Ticketing & Manajemen Jaringan FTTH

Aplikasi web untuk ISP di Lombok, NTB yang menangani pelaporan gangguan jaringan (ticketing), pencatatan aktivitas teknisi, manajemen infrastruktur FTTH (OLT → ODC → ODP → ONU) dengan port tracking, PSB (Pemasangan Baru), inventory stok perangkat, dan visualisasi peta geografis interaktif.

**Stack:** Node.js / Express 5 + MySQL 8 — Vanilla JS frontend, PWA-enabled.

---

## Fitur

| Modul | Deskripsi |
|---|---|
| **Ticketing** | CRUD tiket, status workflow (Terlapor→Dikerjakan→Selesai), soft-delete, riwayat perubahan status, upload evidence, role-based field restriction, auto-assign PIC (beban paling ringan, diprioritaskan berdasar wilayah/`sub_node` Teknisi) |
| **Activity Logging** | Catatan aktivitas teknisi per tiket, export CSV/PDF, delete (Owner/Operator) |
| **Jaringan FTTH** | Hierarki OLT→ODC→ODP→ONU, port tracking (`Port 3/8`), dua interface: tab CRUD (`/ftth.html`) + tree admin. Entri ONU juga bisa dibuat otomatis (draft, perlu konfirmasi staf) dari PSB yang baru "Terpasang" |
| **Peta Interaktif** | Leaflet.js, batas NTB, circle markers, chain koneksi (klik parent → flyTo), Google Maps link |
| **PSB (Pemasangan Baru)** | Form registrasi pelanggan + ONU, upload foto modem, status workflow (Terdaftar→Terpasang→Aktif→Batal). Transisi ke Terpasang mengurangi stok inventory ONU terpilih & membuat draft entri FTTH otomatis |
| **Inventory** | Manajemen stok perangkat (ODP, ONU, kabel, dll), tracking sisa stok, histori pemakaian (dengan referensi balik ke PSB yang memicunya) |
| **SLA Dashboard** | Rata-rata waktu penyelesaian tiket, statistik bulanan, Chart.js bar/pie |
| **RBAC** | 3 role: **Owner** (full), **Operator** (kelola), **Teknisi** (self-only) |
| **Notifikasi WhatsApp** | Otomatis via Fonnte API — tiket baru & status berubah → pembuat + PIC |
| **Export** | CSV (BOM Excel) & PDF dengan summary rekap (by status + priority), filter bulan ini / semua |
| **PWA** | Service worker + manifest — installable di HP |
| **Kesiapan operasional** | `GET /health` (cek koneksi DB), graceful shutdown (`SIGTERM`/`SIGINT`), test suite otomatis + CI (GitHub Actions) |

---

## Struktur Proyek

```
.
├── server.js                 # Entry point Express 5 — juga GET /health + graceful shutdown
├── db.js                     # MySQL2 connection pool (queueLimit dibatasi, DB_PORT opsional)
├── schema.sql                # Database schema — source of truth utk instalasi baru
├── .env.example               # Template environment
├── .eslintrc.json            # ESLint config
├── .prettierrc                # Prettier config
├── .github/workflows/ci.yml   # CI: lint + test tiap push/PR (provisioning DB dari nol)
├── middleware/
│   ├── auth.js                # isAuthenticated, isAdmin, isOwnerOrOperator
│   ├── upload.js               # Multer — image only, 5MB, magic-byte check
│   ├── asyncHandler.js         # Async error wrapper
│   ├── csrf.js                 # Double-submit cookie CSRF
│   ├── audit.js                 # audit_logs writer (dipakai tickets/users/inventory/ftth/psb)
│   ├── detailLog.js             # Request/response detail logger (terpisah dari audit trail)
│   └── rateLimits.js            # mutationLimiter per route file
├── routes/                    # 11 route file, semua di-mount di `/` tanpa prefix
│   ├── auth.js                # POST /login, /logout, /register
│   ├── users.js                # GET /users, POST /update-profile, /admin/users/update
│   ├── tickets.js               # CRUD /tickets + status history + workflow validation + GET /api/auto-pic
│   ├── activities.js            # CRUD /activities
│   ├── settings.js               # Company name/logo
│   ├── references.js             # CRUD /api/references (dropdown non-FTTH + legacy FTTH tree)
│   ├── geo.js                    # GET /api/geo (data peta)
│   ├── psb.js                     # CRUD /api/psb — Terpasang memicu decrement inventory + draft ONU
│   ├── inventory.js                # CRUD /api/inventory + GET /api/inventory/log
│   ├── ftth.js                      # CRUD /api/ftth (sumber kebenaran topologi FTTH) + konfirmasi draft
│   └── stats.js                      # GET /api/stats/month (dashboard)
├── services/
│   └── notification.js        # WhatsApp via Fonnte API
├── utils/
│   ├── logger.js               # Winston daily rotate
│   ├── phone.js                 # Phone sanitizer (62xx format)
│   ├── detailLog.js              # Helper untuk middleware/detailLog.js
│   └── uploads.js                 # cleanupUploadOnError() — hapus file upload kalau DB write gagal
├── scripts/                    # Migrasi upgrade-only (schema.sql sudah mencakup semuanya utk instalasi baru)
│   ├── add_reference_table.sql     # reference_options + seed data (WAJIB dijalankan bahkan di instalasi baru)
│   ├── seed_ci_users.sql            # Seed akun test untuk CI (bukan data asli)
│   ├── backup-db.sh                  # Backup script
│   └── migrate_history.js             # ticket_status_history table (database lama)
├── public/
│   ├── *.html                  # 13 halaman (lihat tabel di bawah)
│   ├── js/                      # 17 file JS
│   ├── css/style.css             # ~4765 baris, single file
│   ├── sw.js                      # PWA service worker
│   ├── manifest.json               # PWA manifest
│   └── vendor/fontawesome/          # Font Awesome 6 local
├── docs/
│   ├── api-reference.md
│   ├── developer-guide.md
│   ├── code_documentation_en.md
│   ├── code_documentation_id.md
│   └── ...beberapa laporan/analisis bertanggal (arsip, bukan dokumentasi hidup)
└── test/
    ├── api.test.js              # Settings + Auth API
    ├── tickets.test.js           # State machine status tiket + IDOR
    ├── ftth.test.js                # Port FTTH tidak boleh dobel-pakai
    ├── fase5.test.js                # Auto-PIC sub_node, auto-decrement inventory, draft ONU
    └── helpers/testApp.js            # App + agent singleton dipakai bersama semua file test
```

---

## Database

11 tabel aplikasi + `sessions` (auto oleh express-mysql-session):

| Tabel | Fungsi |
|---|---|
| `users` | Akun user (bcrypt, default role: Teknisi), `default_sub_node` (wilayah utk auto-PIC), soft-delete |
| `tickets` | Tiket pekerjaan + soft-delete (`deleted_at`), `psb_id` (FK opsional ke `psb`) |
| `activities` | Log aktivitas, FK nullable ke tickets |
| `ticket_status_history` | Riwayat perubahan status tiket |
| `settings` | Key-value (company_name, company_logo) |
| `reference_options` | Dropdown non-FTTH (aktifitas, sub_node, priority, dll) + salinan lama topologi FTTH (legacy, lihat catatan di bawah) |
| `ftth_devices` | **Sumber kebenaran** topologi FTTH (OLT/ODC/ODP/ONU) + port tracking. `is_draft` menandai entri ONU otomatis dari PSB yang belum dikonfirmasi staf |
| `psb` | Pemasangan Baru / registrasi ONU pelanggan, status Terdaftar→Terpasang→Aktif/Batal |
| `inventory` / `inventory_log` | Stok perangkat + histori pemakaian (`reference_type`/`reference_id` melacak balik ke PSB yang memicu) |
| `audit_logs` | Jejak audit level-bisnis (siapa mengubah apa), dibaca via `GET /api/audit` (Owner only) |
| `public_reports` | Belum dipakai route manapun |

> **Catatan penting:** `ftth.html` (tab CRUD) membaca/menulis `ftth_devices` via `/api/ftth`, sedangkan `admin.html` (tree view lama) masih membaca `/api/references` — salinan lama yang tidak ikut ter-update. Data yang dibuat/diubah lewat satu UI tidak otomatis benar di UI lain.

**Lihat:** `schema.sql` (source of truth untuk instalasi baru) + `scripts/` untuk migrasi upgrade database lama.

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

# 3. Setup database — schema.sql sudah mencakup semua tabel & kolom
#    (soft-delete, odp, ftth_devices, audit_logs, dst). Untuk instalasi BARU,
#    dua baris ini SUDAH CUKUP — jangan jalankan scripts/*.sql migration lain,
#    itu untuk upgrade database LAMA yang sudah berjalan sebelum konsolidasi
#    2026-08-26 dan akan gagal (duplicate column/FK) jika dipakai di sini.
mysql -u root -p < schema.sql
mysql -u root -p < scripts/add_reference_table.sql

# 4. (Hanya untuk database LAMA yang mau di-upgrade, lihat komentar di atas)
# node scripts/migrate_history.js
# mysql -u root -p login_app_db < scripts/add_deleted_at_tickets.sql
# mysql -u root -p login_app_db < scripts/add_parent_port.sql
# mysql -u root -p login_app_db < scripts/fix_fk_history.sql

# 5. Jalankan (development — hot reload)
npm run dev
# → http://localhost:3000

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
| `dashboard.html` | `dashboard.js` | All roles | Statistik, Chart.js, SLA, recent tickets, activity log — dipakai semua role (blok khusus Teknisi ditambahkan lewat `GET /api/stats/month`) |
| `ticket-list.html` | `ticket-list.js` | All roles | Tabel + pagination + filter + export CSV/PDF rekap. Pembuatan tiket adalah modal (`#newTicketModal`) di halaman ini — bukan halaman terpisah |
| `ticket-details.html` | `ticket-details.js` | All roles | Detail + edit + delete + status timeline |
| `activity.html` | `activity.js` | All roles | Log + history + export |
| `ftth.html` | `ftth.js` | All roles (write: Owner/Operator) | Tab CRUD (OLT/ODC/ODP/ONU) + port tracking + konfirmasi entri draft dari PSB |
| `map.html` | `map.js` | All roles | Peta Leaflet + chain koneksi interaktif |
| `psb.html` | `psb.js` | All roles (write: Owner/Operator) | Form PSB + upload foto + list. Transisi ke Terpasang minta pilih item ONU inventory |
| `inventory.html` | `inventory.js` | Owner/Operator | Stok perangkat |
| `admin.html` | `admin.js` | Owner | Panel referensi + add user |
| `user-list.html` | `user-list.js` | Owner/Operator | Manajemen user, termasuk wilayah (`default_sub_node`) utk auto-PIC |
| `settings.html` | `settings.js` | All roles | Profil + company settings (Owner) |
| `offline.html` | — | Public | Fallback PWA offline (disajikan `sw.js` saat navigasi gagal & tidak ada cache) |

**Halaman yang sudah dihapus** (fungsinya digabung ke tempat lain): `new-ticket.html` → modal di `ticket-list.html`; `register.html` → self-registration dihapus, Owner buat user lewat modal di `user-list.html`; `edit-user.html` → modal `#editUserModal` di `user-list.html`; `user-dashboard.html` → digabung ke `dashboard.html` tunggal.

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

### References (dropdown non-FTTH + tree FTTH lama)
- `GET /api/references` — All references grouped by type
- `POST /api/references` — Create (all roles)
- `PUT /api/references/:id` — Update (all roles)
- `DELETE /api/references/:id` — Delete (all roles)

### Geo (Map)
- `GET /api/geo` — OLT, ODC, ODP, ONU with coordinates + parentPort (dari `ftth_devices`)

### FTTH (sumber kebenaran topologi)
- `GET /api/ftth` — Semua device grouped by type + stats (termasuk `draftCount`)
- `GET /api/ftth/available-ports` — Port tersedia dari parent (query: `type`, `parent`)
- `POST /api/ftth` — Create (Owner/Operator)
- `PUT /api/ftth/:id` — Update (Owner/Operator) — juga dipakai untuk konfirmasi draft (`is_draft: false`)
- `DELETE /api/ftth/:id` — Delete (Owner only, ditolak kalau masih punya child)

### PSB
- `GET /api/psb` — List (all roles)
- `POST /api/psb` — Create (all roles, multipart)
- `PUT /api/psb/:id` — Update (Owner/Operator). Transisi sungguhan ke `Terpasang` WAJIB sertakan `inventoryId` — mengurangi stok ONU terpilih & membuat draft entri di `ftth_devices` dalam transaksi yang sama
- `DELETE /api/psb/:id` — Delete (Owner/Operator)

### Inventory
- `GET /api/inventory` — List (all roles)
- `GET /api/inventory/log` — Histori pemakaian (Owner/Operator)
- `POST /api/inventory` — Create (Owner/Operator)
- `PUT /api/inventory/:id` — Update (Owner/Operator)
- `DELETE /api/inventory/:id` — Delete (Owner only)

### Stats & Operasional
- `GET /api/stats/month` — Statistik dashboard agregat (semua role); blok tambahan khusus Teknisi kalau `role === 'Teknisi'`
- `GET /api/auto-pic?subNode=` — Sarankan PIC: Teknisi dengan wilayah (`default_sub_node`) yang cocok diprioritaskan, baru fallback ke beban paling ringan
- `GET /health` — Cek koneksi DB (`{status, db, uptime}`), 200/503, tanpa auth — untuk load balancer/uptime monitor

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
npm run dev       # node --watch server.js (hot reload — juga memicu graceful shutdown tiap restart)
npm run prod      # NODE_ENV=production node server.js
npm test          # mocha test/*.test.js --exit — 26 test di 4 file, jalan ke login_app_db asli (fixture bertanda, dibersihkan otomatis)
npx eslint .      # Linting (eslint di-pin sbg devDependency — jangan biarkan npx pakai versi lain yang mengabaikan .eslintrc.json)
npx prettier --check .   # Format check
```

CI (`.github/workflows/ci.yml`) menjalankan urutan yang sama (`npm ci` → lint → provisioning MySQL dari nol via `schema.sql` + `scripts/add_reference_table.sql` + `scripts/seed_ci_users.sql` → test) di setiap push/PR.

---

## Environment Variables

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=login_app_user
DB_PASSWORD=strongpassword
DB_NAME=login_app_db
PORT=3000
SESSION_SECRET=supersecretkey123
FONNTE_TOKEN=token_dari_fonnte
NODE_ENV=development
TRUST_PROXY=
```

> `server.js` fallback ke port **3000** jika PORT tidak diset (disamakan dengan `.env`). `DB_PORT` opsional, fallback ke **3306**. `TRUST_PROXY` — kosongkan/biarkan default kalau ada reverse proxy (nginx dll) di depan Node; set `false` hanya kalau Node benar-benar langsung menghadap internet tanpa proxy.

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
| **File upload** | Image only, 5MB, filename sanitasi, isi file diverifikasi via magic bytes (bukan cuma ekstensi/MIME) |
| **Error handling** | asyncHandler, stack trace aman dari client |
| **Audit trail** | `audit_logs` (level bisnis, dibaca Owner via `GET /api/audit`) — terpisah dari `logs/*.log` (Winston, level teknis, tidak tampil di app) |
| **Koneksi DB** | Pool dibatasi (`queueLimit: 30`) — kelebihan beban gagal cepat, bukan menumpuk tanpa batas di memori |
| **Kesiapan restart** | `GET /health` cek DB sungguhan; graceful shutdown menutup server/session-store/pool DB dengan rapi saat `SIGTERM`/`SIGINT` |

---

## Pengembangan

- **Tidak ada bundler** — edit langsung file di `public/js/*.js`
- **Hot reload** — `npm run dev` = `node --watch` (server.js merestart bersih lewat graceful shutdown tiap kali ada file berubah)
- **Service worker** — nama cache versioned di `public/sw.js` (`CACHE_NAME`) — **naikkan angkanya tiap kali mengubah file frontend** (js/css/html), atau perubahan tidak akan sampai ke browser klien lewat cache lama. Hard refresh (Cmd+Shift+R) untuk verifikasi lokal
- **Logging** — `logs/` daily rotate (app-YYYY-WW.log / error-YYYY-WW.log / detail-*.log), terpisah dari `audit_logs` di database (lihat Fitur Keamanan)
- **CSS** — single file `style.css` (~4765 baris), custom properties
- **Font Awesome 6** — lokal di `vendor/fontawesome/`
- **Test** — mocha + supertest, 4 file (`test/*.test.js`) jalan langsung ke `login_app_db` lewat fixture bertanda & dibersihkan sendiri — bukan database test terpisah (lihat `docs/developer-guide.md` untuk detail kenapa)
- **CI** — GitHub Actions (`.github/workflows/ci.yml`), lint + test tiap push/PR
- **API Reference** — `docs/api-reference.md`
- **Developer Guide** — `docs/developer-guide.md` (setup, ERD, debugging, deployment)
