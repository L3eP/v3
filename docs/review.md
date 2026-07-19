# Developer Review — Ticketing & Activity Logging System

**Project:** MAYUNG — Sistem Ticketing & Manajemen Jaringan FTTH  
**Tanggal:** 2026-07-15  
**Status:** Review berdasarkan kondisi kode terkini (setelah P1 fixes & berbagai penambahan fitur)

---

## 1. Ringkasan

| Aspek | Penilaian |
|---|---|
| **Overall** | ⭐⭐⭐⭐ (7/10) |
| **Kelebihan** | Fitur lengkap (ticketing, FTTH, map, WA notif), security practices solid untuk skala kecil, logging tersistem, arsitektur route rapih dengan asyncHandler |
| **Kekurangan** | Fat routes (business logic campur query), zero testing, XSS risk via innerHTML, beberapa endpoint kurang validasi |
| **Cocok untuk** | Internal ISP skala kecil-menengah (10-100 user, ribuan tiket) |

---

## 2. Hal yang Sudah Baik

### 2.1 Keamanan ✅

| Aspek | Implementasi | Keterangan |
|---|---|---|
| **Helmet** | CSP headers, XSS protection | CDN jsDelivr di-whitelist |
| **Rate limiting** | 3 level: Global (1000/15min), Login (5/15min), Register (5/jam) | Mencegah brute force & spam |
| **bcrypt** | 10 salt rounds | Standar industri |
| **Session-based auth** | MySQL store (bukan MemoryStore) | Persistent, survive restart |
| **IDOR protection** | Cek ownership di setiap endpoint tiket | Creator, PIC, Owner/Operator saja |
| **RBAC** | 3 guard functions + navbar filtering | Owner, Operator, Teknisi |
| **File upload** | Type whitelist (gambar), 5MB, filename sanitasi | Cegah RCE via upload |
| **Parameterized queries** | mysql2 prepared statements | SQL injection safe |
| **Input validation** | express-validator (trim, escape, whitelist) | XSS mitigation via backend |
| **Error handling** | Centralized asyncHandler, Winston logging | Stack trace tidak bocor ke client |

### 2.2 Fitur ✅

| Fitur | Detail |
|---|---|
| **Ticketing** | Full CRUD + status workflow + evidence gambar + status history timeline |
| **Activity Logging** | Log per tiket (opsional), export CSV/PDF, delete (Owner/Operator) |
| **Dashboard** | Statistik real-time, Chart.js bar/pie, search, activity log filter |
| **FTTH Management** | Dua interface: tab CRUD (`ftth.html`) + tree view (`admin.html`) |
| **Peta Geografis** | Leaflet.js bounded NTB, circle markers per device type |
| **WA Notifications** | Otomatis via Fonnte API (tiket baru + status berubah) |
| **Export** | CSV (BOM untuk Excel) & PDF (jsPDF) untuk tiket + aktivitas |
| **PWA** | Service worker + manifest — installable di HP |
| **RBAC** | 3 role dengan akses berbeda, diterapkan server + client side |

### 2.3 Logging ✅

- Winston dengan daily rotate file (error + app log)
- Rotasi mingguan (YYYY-WW), 20MB/file, retain 14 hari
- Console di development, file-only di production
- Semua error otomatis tercatat via asyncHandler

### 2.4 UX ✅

- Sidebar collapsible dengan state persistence
- Mobile responsive (hamburger menu)
- Company branding dari database (nama + logo)
- Status badges berwarna, priority badges
- Modal untuk feedback (bukan alert/confirm native)

---

## 3. Area Perbaikan

### 3.1 Arsitektur

#### ⚠️ Fat Route Pattern
Semua business logic dan query SQL ditulis langsung di route handler. Tidak ada pemisahan service/repository layer.

```javascript
// Kondisi sekarang — Semua di route handler
router.post('/tickets', isAuthenticated, upload.single('evidence'), async (req, res) => {
    // ... validasi express-validator
    // ... business logic
    // ... query SQL
    // ... mapping response
});
```

**Dampak:** Sulit di-test, duplikasi query, debugging campur aduk.

#### ✅ Sudah Diperbaiki Sejak P1
- Centralized async error handler → hilangkan 20+ try/catch duplikasi
- Backend pagination → SELECT hanya data per halaman (bukan semua)
- Database indexing → 10 index baru untuk query umum

### 3.2 Frontend

#### ⚠️ innerHTML XSS Risk
Hampir semua rendering frontend menggunakan `innerHTML`, termasuk data dari API. Meski backend sudah melakukan escape dengan express-validator, ini tetap riskan jika ada endpoint yang mengembalikan data user-generated tanpa sanitasi.

**Saran:** Gunakan `textContent` untuk teks biasa, atau buat fungsi `esc()` yang sudah diimplementasikan di `ftth.js` dan `admin.js` secara manual — perlu diterapkan di semua file.

#### ⚠️ Global fetch Override
`dashboard.js` dan `user-dashboard.js` meng-override `window.fetch` untuk intercept HTTP 401. Ini global — bisa mengganggu fetch dari library pihak ketiga.

**Saran:** Buat wrapper fetch sendiri (misal `apiFetch()`) daripada override global.

#### ⚠️ API Response Tidak Seragam
Beberapa endpoint mengembalikan `{ message }`, yang lain `{ errors: [...] }`, ada juga yang langsung array. Ini menyulitkan error handling frontend.

### 3.3 Testing

| Masalah | Detail |
|---|---|
| **Zero test** | Tidak ada test file sama sekali |
| **package.json** | `"test": "echo no test specified"` |
| **Route testing** | Tidak bisa test business logic tanpa HTTP request |
| **Regression risk** | Tidak ada safety net untuk refactor |

### 3.4 Endpoint Validation

#### ⚠️ Rate Limit Pembuatan Tiket
Tiket bisa dibuat tanpa batas — berpotensi spam/flood. Sementara login (5/15min) dan register (5/jam) sudah di-rate-limit.

#### ⚠️ Admin Update Validasi Minimal
`POST /admin/users/update` (routes/users.js:125) hanya menerima body tanpa express-validator — tidak ada trim/escape/whitelist.

#### ⚠️ Delete Tidak Pakai CSRF
Semua DELETE endpoint bisa dipanggil dengan GET request via HTML form — tidak ada CSRF protection.

### 3.5 Maintenance

#### ⚠️ CSS Bug
Baris 1340 `style.css`: selector `form-.action-buttons` (dash sebelum dot) — tidak valid, tidak akan pernah match.

#### ⚠️ Export Overfetch
Fungsi export di `ticket-list.js` mengambil SEMUA tiket tanpa pagination (`GET /tickets` tanpa page param), lalu filter di client-side. Ini tidak scalable untuk ribuan tiket.

---

## 4. Security Scorecard

| Kategori | Skor | Catatan |
|---|---|---|
| **Authentication** | 9/10 | bcrypt, rate limited, session expire |
| **Authorization** | 8/10 | RBAC solid, IDOR check manual (rawat konsistensi) |
| **Input Validation** | 7/10 | Backend OK, frontend via innerHTML riskan |
| **SQL Injection** | 10/10 | Parameterized queries everywhere |
| **XSS** | 6/10 | Backend escape, tapi frontend innerHTML di banyak tempat |
| **CSRF** | 4/10 | Tidak ada CSRF protection |
| **Rate Limiting** | 7/10 | Baik di auth, tidak ada di tiket/API umum |
| **File Upload** | 9/10 | Type filter + size limit + sanitasi filename |
| **Session Security** | 8/10 | httpOnly, sameSite, MySQL store, 24h |
| **Error Handling** | 8/10 | asyncHandler + Winston, stack trace aman |

---

## 5. Prioritas Saran

### 🔴 High Priority
1. **Testing** — Minimal integration test untuk setiap endpoint (mocha/supertest)
2. **CSRF protection** — double-submit cookie pattern atau csurf
3. **Admin endpoint validasi** — Tambah express-validator di `POST /admin/users/update`

### 🟡 Medium Priority
1. **innerHTML → textContent** — Gunakan `esc()` yang sudah ada di ftth.js/admin.js ke semua file
2. **Export scalability** — Export pake server-side streaming atau pagination chunk
3. **Global fetch override** — Ganti dengan wrapper fungsi sendiri
4. **Rate limit tiket** — Tambah rate limiter di POST /tickets

### 🟢 Low Priority
1. **CSS bug** — Fix `form-.action-buttons` → `.form-action-buttons` atau hapus
2. **API response contract** — Standarisasi format error response
3. **Loading skeleton** — Ganti spinner text dengan skeleton UI
4. **Konfirmasi delete** — Ganti `confirm()` native dengan custom modal (sudah partial via modal di beberapa halaman)

---

## 6. Kesimpulan

**Skor Akhir: 7/10**

Strengths:
- Fitur mature: ticketing + FTTH + map + WA notification dalam satu aplikasi
- Security practices baik untuk skala small-medium
- Kode backend relatif bersih setelah refactor asyncHandler

Weaknesses:
- Tidak ada testing → risiko regression tinggi
- Fat routes → maintenance lebih berat seiring growth
- innerHTML → XSS vector potensial di frontend
- Validasi tidak konsisten di beberapa endpoint

Proyek ini **cocok untuk penggunaan internal ISP skala kecil-menengah**. Untuk scale ke ribuan user/tiket, diperlukan refactor arsitektur (service layer, testing, API contract standarisasi) dan perbaikan security (CSRF, validasi konsisten).
