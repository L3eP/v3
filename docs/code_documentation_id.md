# Dokumentasi Kode Lengkap

Dokumentasi ini memberikan gambaran menyeluruh tentang basis kode **Aplikasi Login**, berdasarkan analisis lengkap setiap file dalam proyek. Ini ditujukan bagi pengembang yang perlu memahami cara kerja bagian dalam aplikasi.

## 1. Ikhtisar Arsitektur

-   **Tipe**: Multi-Page Application (MPA) dengan backend Node.js/Express.
-   **Database**: MySQL (diakses melalui koneksi pool `mysql2`).
-   **Otentikasi**: Berbasis sesi (`express-session` didukung oleh `express-mysql-session`).
-   **Frontend**: Vanilla JavaScript, HTML5, CSS3.
-   **Keamanan**: `helmet` (Header), `express-rate-limit` (Perlindungan Brute-force), `bcryptjs` (Hashing kata sandi), `express-validator` (Validasi input).

## 2. Struktur Backend (`server.js` & `routes/`)

Backend adalah inti aplikasi, menangani permintaan API, interaksi database, dan menyajikan file statis.

### 2.1. `server.js` (Titik Masuk)
-   **Middleware**:
    -   `helmet`: Mengatur header HTTP aman (CSP, perlindungan XSS).
    -   `rateLimit`: Batas global 100 permintaan per 15 menit per IP.
    -   `express.json()`: Mengurai body permintaan JSON.
    -   `express.static('public')`: Menyajikan file frontend.
    -   `session`: Mengonfigurasi sesi persisten menggunakan MySQL.
-   **Rute**: Memuat semua penangan rute dari direktori `routes/`.
-   **Penanganan Error**: Penangan error global untuk pengecualian yang tidak tertangani dan error Multer.

### 2.2. Penangan Rute (`routes/`)

| File | Tujuan | Endpoint Utama |
| :--- | :--- | :--- |
| **`auth.js`** | Otentikasi | `POST /login` (Verifikasi kredensial), `POST /register` (Buat pengguna), `POST /logout` (Hapus sesi). |
| **`tickets.js`** | Manajemen Tiket | `GET /tickets` (Daftar), `POST /tickets` (Buat), `GET /tickets/:id` (Detail), `POST /tickets/:id/update` (Edit), `DELETE /tickets/:id` (Hapus), `GET /tickets/:id/history` (Riwayat Status). |
| **`users.js`** | Manajemen Pengguna | `GET /users` (Daftar), `POST /update-profile` (Update diri), `POST /admin/users/update` (Admin update), `DELETE /users/:username` (Admin hapus). |
| **`activities.js`** | Pencatatan Aktivitas | `POST /activities` (Log aksi baru), `GET /activities` (Ambil riwayat), `DELETE /activities/:id` (Hapus log). |
| **`settings.js`** | Konfigurasi Aplikasi | `GET/POST /settings/company-name` (Branding perusahaan), `GET/POST /settings/company-logo` (Upload logo). |

### 2.3. Database (`db.js`)
-   Mengekspor koneksi pool `mysql2`.
-   Menggunakan variabel lingkungan (`DB_HOST`, `DB_USER`, dll.) untuk konfigurasi.
-   **Logging**: Mengganti `console.log` dengan logger `winston` untuk membuat log persisten di direktori `logs/` (dengan rotasi mingguan).
-   **Tabel**: `users`, `tickets`, `activities`, `settings`, `ticket_status_history`.

## 3. Struktur Frontend (`public/`)

Frontend terdiri dari halaman HTML yang dipasangkan dengan file JavaScript tertentu.

### 3.1. Logika Inti
-   **`js/navbar.js`**:
    -   Merender sidebar secara dinamis berdasarkan peran pengguna (`Owner`, `Operator`, `Teknisi`).
    -   Mengambil dan menampilkan nama serta logo perusahaan.
    -   Menangani toggle sidebar seluler dan perubahan ukuran header responsif.
-   **`js/script.js`**: Menangani formulir login di `index.html`.
-   **`sw.js`**: Service Worker untuk menyimpan aset statis (kemampuan PWA).

### 3.2. Modul Fitur

| Halaman | File JS | Fungsionalitas |
| :--- | :--- | :--- |
| **Dashboard** | `js/dashboard.js` | Dashboard admin utama. Mengambil tiket, menghitung statistik, merender grafik, daftar tiket terbaru, dan **Log Aktivitas (dengan dukungan Hapus)**. |
| **User Dashboard** | `js/user-dashboard.js` | Tampilan terbatas untuk pengguna standar. Menampilkan tiket terbaru dan aktivitas pribadi. |
| **Ticket List** | `js/ticket-list.js` | Menampilkan tiket dalam tabel dengan **Pencarian Global**, **Paginasi**, **Pengurutan**, **Filter** (Tanggal, Status, Prioritas), dan **Ekspor** (CSV/PDF). |
| **New Ticket** | `js/new-ticket.js` | Formulir untuk membuat tiket. Menggunakan **layout grid 2 kolom** untuk responsivitas yang lebih baik. |
| **Ticket Details** | `js/ticket-details.js` | Menampilkan info tiket lengkap. Menampilkan **Timeline Riwayat Status**. Menangani aksi Edit dan Hapus. |
| **User List** | `js/user-list.js` | Tampilan admin untuk semua pengguna. Termasuk penanganan error yang lebih baik untuk kondisi kosong. |
| **Edit User** | `js/edit-user.js` | Formulir admin untuk memperbarui profil pengguna lain (Peran, Kata Sandi, dll.). |
| **Activity** | `js/activity.js` | Log aktivitas pribadi. Memungkinkan pencatatan aksi baru, filter berdasarkan teknisi, dan menghapus log (jika Owner). |
| **Settings** | `js/settings.js` | Pengaturan profil pengguna. Owner juga dapat memperbarui Nama dan Logo Perusahaan di sini. |

## 4. Alur Kerja & Logika Utama

### 4.1. Otentikasi & Otorisasi
-   **Login**: `POST /login` memvalidasi kata sandi dengan `bcrypt.compare()`. Jika sukses, sesi dibuat.
-   **Role-Based Access Control (RBAC)**:
    -   Middleware `isAuthenticated` memeriksa sesi aktif.
    -   Middleware `isAdmin` (di `middleware/auth.js`) membatasi rute hanya untuk `Owner`.
    -   Frontend `navbar.js` menyembunyikan tautan berdasarkan `user.role` yang disimpan di `localStorage`.

### 4.2. Pelacakan Status Tiket
-   Setiap pembaruan pada field `status` di `POST /tickets/:id/update` secara otomatis dicatat ke tabel `ticket_status_history`.
-   Frontend `ticket-details.js` mengambil riwayat ini melalui `GET /tickets/:id/history` untuk merender timeline.

### 4.3. Ekspor Data
-   **CSV**: Dibuat di sisi klien dalam `ticket-list.js` dan `activity.js` dengan membuat URL Blob.
-   **PDF**: Dibuat di sisi klien menggunakan pustaka `jspdf` dan `jspdf-autotable`.

## 5. Skema Database (Disimpulkan)

**`users`**
-   `id`, `username`, `password`, `full_name`, `role`, `phone`, `photo`, `created_at`

**`tickets`**
-   `id`, `aktifitas`, `sub_node`, `odc`, `lokasi`, `pic`, `priority`, `status`, `info`, `evidence`, `created_by`, `created_at`

**`ticket_status_history`**
-   `id`, `ticket_id`, `old_status`, `new_status`, `changed_by`, `changed_at`

**`activities`**
-   `id`, `description`, `username`, `date`

**`settings`**
-   `setting_key` (Primary Key, cth., 'company_name'), `setting_value`

## 6. Catatan Pengembang

-   **Service Worker**: Aplikasi mendaftarkan `sw.js` untuk menyimpan aset. Jika Anda membuat perubahan pada CSS/JS dan tidak melihatnya, coba lakukan hard refresh atau unregister service worker.
-   **Local Storage**: Objek `user` di `localStorage` hanya untuk kenyamanan UI. Keamanan ditangani oleh cookie sesi sisi server.
-   **Logging**: Periksa `logs/app.log` dan `logs/error.log` untuk aktivitas backend. Log dirotasi setiap minggu.
