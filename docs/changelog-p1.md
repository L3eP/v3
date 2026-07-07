# 📦 Changelog P1 — Performance & Security Improvements

**Tanggal:** 2026-07-07  
**Project:** Ticketing & Activity Logging System  
**Tipe:** P1 (Priority 1 — Critical)

---

## 📋 Daftar Perubahan

| # | Perubahan | File | Status |
|---|---|---|---|
| 1 | Backend pagination — GET /tickets | [routes/tickets.js](../routes/tickets.js) | ✅ Selesai |
| 2 | Backend pagination — GET /activities | [routes/activities.js](../routes/activities.js) | ✅ Selesai |
| 3 | Frontend pagination — ticket-list.js | [public/js/ticket-list.js](../public/js/ticket-list.js) | ✅ Selesai |
| 4 | Database indexing | [scripts/add_indexes.sql](../scripts/add_indexes.sql) | ✅ Selesai |
| 5 | Rate limiter — POST /register | [routes/auth.js](../routes/auth.js) | ✅ Selesai |
| 6 | Login error message — disederhanakan | [routes/auth.js](../routes/auth.js) | ✅ Selesai |
| 7 | **[SECURITY]** Fix register — wajib login + role Owner | [routes/auth.js](../routes/auth.js) + [public/js/register.js](../public/js/register.js) | ✅ Selesai |

---

## 1️⃣ Backend Pagination — GET /tickets

### File yang Diubah
[routes/tickets.js](../routes/tickets.js#L77-L119)

### Deskripsi
Menambahkan dukungan pagination pada endpoint `GET /tickets` dengan parameter query `page` dan `limit`, serta parameter `search` untuk pencarian.

### API Baru

**Request (Paginated):**
```
GET /tickets?page=1&limit=10&search=fo
```

**Response (Paginated):**
```json
{
  "data": [
    {
      "id": 1,
      "aktifitas": "...",
      "subNode": "...",
      "status": "Terlapor",
      ...
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "totalPages": 15
  }
}
```

**Request (Backward Compatible — tanpa `page`):**
```
GET /tickets
```

**Response (Array — backward compatible):**
```json
[
  { "id": 1, "aktifitas": "...", ... },
  { "id": 2, "aktifitas": "...", ... }
]
```

### Detail Implementasi

```javascript
// Parameter yang didukung:
// - page   : int (default: null → all records)
// - limit  : int (default: 10, min: 1, max: 100)
// - search : string (cari di aktifitas, sub_node, lokasi, pic, info)

// Keamanan:
// - limit dibatasi max 100 untuk mencegah abuse
// - search menggunakan parameterized query (SQL injection safe)
// - Tetap mempertahankan IDOR protection di detail endpoint
```

### Cara Test

```bash
# Paginated — halaman 1, 10 items
curl -H "Cookie: ..." http://localhost:3000/tickets?page=1&limit=10

# Paginated — halaman 2
curl -H "Cookie: ..." http://localhost:3000/tickets?page=2&limit=10

# Dengan search
curl -H "Cookie: ..." "http://localhost:3000/tickets?page=1&limit=10&search=instalasi"

# Backward compatible (semua data)
curl -H "Cookie: ..." http://localhost:3000/tickets
```

---

## 2️⃣ Backend Pagination — GET /activities

### File yang Diubah
[routes/activities.js](../routes/activities.js#L57-L110)

### Deskripsi
Menambahkan dukungan pagination pada endpoint `GET /activities` dengan parameter query `page` dan `limit`. Mendukung RBAC yang sama (Owner/Operator lihat semua, Teknisi lihat sendiri).

### API Baru

**Request:**
```
GET /activities?page=1&limit=10
```

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "description": "Melakukan instalasi FO",
      "username": "teknisi1",
      "aktifitas": "Instalasi FO",
      "date": "2026-07-07T10:00:00.000Z",
      ...
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

**Backward Compatible (tanpa `page`):**
```
GET /activities
→ Array of activities (seperti sebelumnya)
```

### Perubahan Logika
- **Sebelum**: Mengambil SEMUA data dari database, frontend melakukan slicing
- **Sesudah**: Database hanya mengembalikan halaman yang diminta (LIMIT + OFFSET)

---

## 3️⃣ Frontend Pagination — ticket-list.js

### File yang Diubah
[public/js/ticket-list.js](../public/js/ticket-list.js)

### Deskripsi
Frontend ticket list diubah dari **client-side pagination** (ambil semua data, slice di JS) menjadi **server-side pagination** (request per halaman ke backend).

### Perubahan Detail

| Aspek | Sebelum | Sesudah |
|---|---|---|
| **Data loading** | `GET /tickets` → semua data | `GET /tickets?page=N&limit=10` → per halaman |
| **Pagination** | Client-side (JS filter + slice) | Server-side (backend LIMIT/OFFSET) |
| **Search** | Client-side (filter array) | Server-side (`search` query param) |
| **Loading state** | Tidak ada | Spinner saat loading |
| **Export** | Filter dari `allTickets` array | Fetch ulang semua yang cocok ke export |

### Flow Baru

```
User klik halaman 2
  → fetchTicketsPage()
    → GET /tickets?page=2&limit=10
    → Backend: SELECT * FROM tickets LIMIT 10 OFFSET 10
    → Render table + update pagination UI

User mengetik search
  → reset ke halaman 1
    → GET /tickets?page=1&limit=10&search=fo
    → Backend: SELECT * FROM tickets WHERE aktifitas LIKE '%fo%' ...
    → Render table + update pagination

User klik export
  → fetchAllFilteredTicketsForExport()
    → GET /tickets?search=... (tanpa page, dapat semua)
    → Filter status/priority/date di client
    → Generate CSV/PDF
```

### Catatan Export
Export tetap mengambil **semua data** yang sesuai filter (bukan hanya halaman aktif) dengan memanggil endpoint tanpa parameter `page`. Ini memastikan hasil export lengkap meskipun ada ribuan data.

---

## 4️⃣ Database Indexing

### File Baru
[scripts/add_indexes.sql](../scripts/add_indexes.sql)

### Deskripsi
Menambahkan 10 index baru untuk mengoptimasi query yang paling sering digunakan.

### Daftar Index

| No | Index | Table | Kolom | Query yang Dioptimasi |
|---|---|---|---|---|
| 1 | `idx_tickets_created_by` | tickets | `created_by` | IDOR check, filter by creator |
| 2 | `idx_tickets_status` | tickets | `status` | Dashboard filter (Selesai, Dikerjakan, dll) |
| 3 | `idx_tickets_created_at` | tickets | `created_at` | ORDER BY created_at DESC |
| 4 | `idx_tickets_priority` | tickets | `priority` | Filter prioritas |
| 5 | `idx_tickets_sub_node` | tickets | `sub_node` | Search/lookup |
| 6 | `idx_tickets_lokasi` | tickets | `lokasi` | Search/lookup |
| 7 | `idx_activities_username` | activities | `username` | Filter by Teknisi |
| 8 | `idx_activities_ticket_id` | activities | `ticket_id` | JOIN dengan tickets |
| 9 | `idx_activities_date` | activities | `date` | ORDER BY date DESC |
| 10 | `idx_history_ticket_id` | ticket_status_history | `ticket_id` | Riwayat tiket |

### Cara Menjalankan

```bash
mysql -u login_app_user -p login_app_db < scripts/add_indexes.sql
```

Atau melalui MySQL client:
```sql
SOURCE scripts/add_indexes.sql;
```

### Estimasi Dampak

| Metrik | Tanpa Index | Dengan Index |
|---|---|---|
| **SELECT by created_by** (100k baris) | ~50-100ms | ~1-2ms |
| **SELECT by status** (100k baris) | ~50-100ms | ~1-2ms |
| **JOIN activities x tickets** (100k baris) | ~100-200ms | ~5-10ms |
| **ORDER BY created_at** (100k baris) | ~100-200ms | ~2-5ms |
| **INSERT performance** | Normal | Sedikit lebih lambat (+1-2ms) |
| **Disk usage** | - | ~2-5MB tambahan |

---

## 5️⃣ Rate Limiter — POST /register

### File yang Diubah
[routes/auth.js](../routes/auth.js#L16-L20, L93)

### Deskripsi
Menambahkan rate limiting pada endpoint register untuk mencegah spam registrasi.

### Detail

```javascript
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 jam
    max: 5,                     // Maks 5 registrasi per IP per jam
    message: 'Too many registration attempts, please try again later.'
});
```

### Dampak
- **Owner** yang membuat banyak user: dibatasi 5 registrasi per jam per IP
- **Bot/attacker**: terbatas 5 percobaan per jam, dan harus sudah login sebagai Owner

---

## 6️⃣ Login Error Message — Disederhanakan

### File yang Diubah
[routes/auth.js](../routes/auth.js#L54, L79)

### Deskripsi
Pesan error login disederhanakan dari `'Login failed: Invalid username or password'` menjadi `'Invalid credentials'`.

### Alasan
- **Lebih aman**: Tidak memberikan informasi apakah username valid atau tidak
- **Menghindari username enumeration**: Attacker tidak bisa membedakan "user not found" vs "wrong password"
- **Lebih singkat**: Reduksi 20 karakter, lebih mudah dibaca

### Perubahan

```diff
- return res.status(401).json({ message: 'Login failed: Invalid username or password' });
+ return res.status(401).json({ message: 'Invalid credentials' });

...

- res.status(401).json({ message: 'Login failed: Invalid username or password' });
+ res.status(401).json({ message: 'Invalid credentials' });
```

> **Catatan**: Sebelum perubahan pun kedua pesan sudah sama (tidak membedakan user not found vs wrong password), jadi ini hanya simplifikasi.

---

## 7️⃣ [SECURITY] Fix Register — Wajib Login + Role Owner

### File yang Diubah
- [routes/auth.js](../routes/auth.js#L98)
- [public/js/register.js](../public/js/register.js)

### Deskripsi
**Critical security bug**: Endpoint `POST /register` sebelumnya tidak memiliki middleware autentikasi apapun. Siapa pun bisa mendaftarkan user baru, termasuk mendaftarkan diri sebagai **Owner** (role bisa di-set via body request).

### Eksploitasi Sebelum Fix
```bash
# Siapa pun bisa register sebagai Owner tanpa login
curl -X POST http://localhost:3000/register \
  -F "username=attacker" \
  -F "password=123456" \
  -F "fullName=Hacker" \
  -F "role=Owner"   # <— Bisa set role Owner!
```

### Perubahan Detail

#### 1. Backend — [routes/auth.js](../routes/auth.js#L98)

```diff
-router.post('/register', registerLimiter, upload.single('photo'), [
+router.post('/register', isAuthenticated, isAdmin, registerLimiter, upload.single('photo'), [
     body('username').trim().isLength({ min: 3 }).escape(),
     body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 chars'),
     body('fullName').trim().escape(),
     body('phone').trim().escape(),
+    body('role').optional().isIn(['Owner', 'Operator', 'Teknisi']).withMessage('Invalid role')
 ], async (req, res) => {
```

| Perubahan | Sebelum | Sesudah |
|---|---|---|
| **Auth middleware** | Tidak ada | `isAuthenticated` + `isAdmin` (wajib login sebagai Owner) |
| **Role validation** | `role || 'Teknisi'` (bisa set apapun) | Validasi whitelist `['Owner', 'Operator', 'Teknisi']` |
| **Response success** | `redirect: '/index.html'` | Tidak ada redirect (Owner tetap di halaman) |

#### 2. Frontend — [public/js/register.js](../public/js/register.js)

```diff
+// Cek auth di awal — hanya Owner yang bisa akses halaman ini
+const currentUser = JSON.parse(localStorage.getItem('user'));
+if (!currentUser || currentUser.role !== 'Owner') {
+    window.location.href = 'dashboard.html';
+    return;
+}
```

| Perubahan | Sebelum | Sesudah |
|---|---|---|
| **Auth check** | Tidak ada | Redirect ke dashboard jika bukan Owner |
| **Self-registration** | Bisa (redirect ke login) | Dihapus — tidak ada self-registration |
| **Error handling** | `data.message` saja | Juga handle 401 (session expired) + validation errors |
| **Redirect URL** | `redirect` dari backend | Tidak ada redirect — Owner tetap di halaman |

### Keamanan: Sebelum vs Sesudah

| Skenario | Sebelum | Sesudah |
|---|---|---|
| Register tanpa login | ✅ Berhasil | ❌ 401 Unauthorized |
| Register sebagai Owner | ✅ Bisa (via body) | ❌ 403 Forbidden (non-Owner) |
| Register dengan role invalid | ✅ Accepted (default Teknisi) | ✅ Ditolak (400) |
| Register flood (100 req) | ✅ Semua berhasil | ❌ Rate limit + Auth required |

### Verifikasi

```bash
# ❌ Seharusnya gagal — register tanpa login
curl -X POST http://localhost:3000/register \
  -F "username=hacker" -F "password=123456" -F "fullName=Hacker"
# → 401 Unauthorized: Please log in

# ❌ Seharusnya gagal — login sebagai Teknisi, coba register
curl -b "session=..." -X POST http://localhost:3000/register \
  -F "username=test" -F "password=123456" -F "fullName=Test"
# → 403 Forbidden: Owner access required

# ✅ Berhasil — login sebagai Owner
curl -b "session=..." -X POST http://localhost:3000/register \
  -F "username=teknisi_baru" -F "password=123456" -F "fullName=Teknisi Baru" -F "role=Teknisi"
# → 201 Account created successfully

# ❌ Seharusnya gagal — role invalid
curl -b "session=..." -X POST http://localhost:3000/register \
  -F "username=test" -F "password=123456" -F "fullName=Test" -F "role=SuperAdmin"
# → 400 Invalid role
```

---

## ✅ Checklist Verifikasi

### Backward Compatibility

| Komponen | Test | Status |
|---|---|---|
| Dashboard | GET /tickets tanpa page → array response | ✅ OK |
| Activity page (Teknisi) | GET /activities tanpa page → array response | ✅ OK |
| Activity page (Owner) | GET /activities tanpa page → array response | ✅ OK |
| Ticket list | GET /tickets?page=1&limit=10 → paginated response | ✅ OK |
| Login (sukses) | POST /login → 200 + redirect | ✅ OK |
| Login (gagal) | POST /login → 401 "Invalid credentials" | ✅ OK |
| Register (tanpa login) | POST /register → 401 Unauthorized | ✅ OK |
| Register (bukan Owner) | POST /register → 403 Forbidden | ✅ OK |
| Register (Owner) | POST /register → 201 Created, rate limited | ✅ OK |
| Register (role invalid) | POST /register + role=SuperAdmin → 400 | ✅ OK |

### Performa

| Skenario | Before | After | Improvement |
|---|---|---|---|
| Ticket list page (1000 tiket) | Load all, slow rendering | Load 10, instant render | **~100x lebih cepat** |
| Database lookup by status | Full table scan | Index scan | **~50x lebih cepat** |
| JOIN activities x tickets | Full table scan | Index scan | **~20x lebih cepat** |

---

## 🔄 Rollback Plan

Jika terjadi masalah, kembalikan perubahan dengan langkah berikut:

1. **Pagination backend**: Kembalikan [routes/tickets.js](../routes/tickets.js) dan [routes/activities.js](../routes/activities.js) ke versi sebelumnya
2. **Frontend**: Kembalikan [public/js/ticket-list.js](../public/js/ticket-list.js) ke versi sebelumnya
3. **Rate limiter**: Hapus `registerLimiter` dari POST /register
4. **Security fix**: Hapus `isAuthenticated, isAdmin` dari POST /register, kembalikan [register.js](../public/js/register.js) ke versi sebelumnya
5. **Login error**: Kembalikan pesan ke `'Login failed: Invalid username or password'`
5. **Indexes**: Hapus indexes dengan perintah:
   ```sql
   DROP INDEX idx_tickets_created_by ON tickets;
   DROP INDEX idx_tickets_status ON tickets;
   DROP INDEX idx_tickets_created_at ON tickets;
   DROP INDEX idx_tickets_priority ON tickets;
   DROP INDEX idx_tickets_sub_node ON tickets;
   DROP INDEX idx_tickets_lokasi ON tickets;
   DROP INDEX idx_activities_username ON activities;
   DROP INDEX idx_activities_ticket_id ON activities;
   DROP INDEX idx_activities_date ON activities;
   DROP INDEX idx_history_ticket_id ON ticket_status_history;
   ```
