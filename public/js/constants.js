/**
 * Dark mode — state disimpan di localStorage('theme'), diterapkan lewat
 * atribut data-theme di <html>. Toggle-nya cuma ada di halaman Settings
 * (satu-satunya halaman yang bisa diakses semua role), tapi state-nya
 * berlaku di seluruh app karena localStorage dibagi lintas halaman satu
 * origin.
 */
const THEME_KEY = 'theme';

function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (e) { /* localStorage tidak tersedia (private mode dsb) — abaikan */ }
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* abaikan */ }
  applyTheme(next);
  return next;
}

// Terapkan lagi di sini sebagai jaring pengaman — <head> tiap halaman sudah
// menerapkannya lebih dulu (cegah flash), ini idempotent kalau sudah benar.
applyTheme(getTheme());

/**
 * Role Constants — shared across all pages.
 * Ganti magic string 'Owner'/'Operator'/'Teknisi' dengan ROLES.*
 */
const ROLES = {
  OWNER: 'Owner',
  OPERATOR: 'Operator',
  TEKNISI: 'Teknisi',
};

/**
 * Format ID untuk tampilan — zero-padded 4 digit + prefix #
 * Contoh: 1 → #0001, 42 → #0042, 1023 → #1023
 * @param {number|string} id
 * @returns {string}
 */
function formatId(id) {
  const num = parseInt(id) || 0;
  return '#' + String(num).padStart(4, '0');
}

/**
 * Helper: cek apakah user memiliki role privileged (Owner atau Operator)
 * @param {string} role - user.role
 * @returns {boolean}
 */
function isPrivileged(role) {
  return role === ROLES.OWNER || role === ROLES.OPERATOR;
}

/**
 * Filter input no. HP — hapus karakter non-digit biar user tidak bisa
 * mengetik huruf/symbol selain + - dan spasi.
 * Dipakai via oninput="phoneOnly(this)".
 * @param {HTMLInputElement} el
 */
function phoneOnly(el) {
  el.value = el.value.replace(/[^0-9+() ]/g, '');
}

/**
 * Validasi format no. HP Indonesia.
 * Diizinkan: 08xxxxxxxxxx, 628xxxxxxxxxx, +628xxxxxxxxxx, 8xxxxxxxxxx
 * (digit bersih 10-13, tanpa spasi/tanda baca)
 * @param {string} phone - nilai input
 * @param {boolean} required - true jika wajib diisi
 * @returns {string} pesan error, atau '' jika valid
 */
function validatePhone(phone, required = false) {
  if (!phone) {
    return required ? 'Nomor HP wajib diisi' : '';
  }
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 10 || digits.length > 13) {
    return 'Nomor HP tidak valid (10–13 digit)';
  }
  if (!/^(0|62|8)/.test(digits)) {
    return 'Nomor HP harus diawali 08, 62, atau 8';
  }
  return '';
}

/**
 * Fetch wrapper dengan auto-redirect ke login saat 401 (session expired).
 * Gunakan ini untuk semua API calls yang membutuhkan autentikasi.
 * @param {string} url - URL endpoint
 * @param {object} [options] - Fetch options
 * @returns {Promise<Response>}
 */
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    localStorage.removeItem('user');
    window.location.href = '/index.html';
    return res; // tetap return agar caller bisa handle
  }
  return res;
}

/**
 * Tambahkan tombol "intip" (mata) ke satu input password — user bisa lihat
 * persis apa yang mereka ketik sebelum submit. Ini pelengkap fix trim()
 * spasi tak sengaja (routes/auth.js, routes/users.js): trim menutup celah
 * spasi yang TIDAK TERLIHAT, tombol ini membantu user langsung MELIHAT
 * kalau ada salah ketik lain (typo, huruf besar/kecil salah, dst) sebelum
 * password tersimpan/dipakai.
 *
 * Membungkus <input> yang sudah ada dengan wrapper + tombol secara dinamis
 * (tidak perlu ubah markup di tiap halaman) — id & posisi di form tidak
 * berubah, aman untuk FormData/serialize yang sudah ada.
 * @param {string} inputId - id elemen <input type="password">
 */
function initPasswordToggle(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.peekWired) return;
  input.dataset.peekWired = '1';

  const wrap = document.createElement('div');
  wrap.className = 'password-field-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'password-toggle-btn';
  btn.setAttribute('aria-label', 'Tampilkan password');
  btn.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i>';
  wrap.appendChild(btn);

  btn.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing
      ? '<i class="fas fa-eye" aria-hidden="true"></i>'
      : '<i class="fas fa-eye-slash" aria-hidden="true"></i>';
    btn.setAttribute('aria-label', showing ? 'Tampilkan password' : 'Sembunyikan password');
  });
}

/**
 * Muat file gambar sebagai sumber yang bisa digambar ke <canvas>
 * (createImageBitmap kalau tersedia — lebih cepat & hemat memori; fallback
 * ke elemen <img> di browser lama). imageOrientation:'from-image' WAJIB
 * di createImageBitmap supaya foto dari HP (sering EXIF-rotated karena HP
 * dipegang miring) tidak keluar miring 90°/terbalik setelah dikompres —
 * elemen <img> sudah otomatis benar orientasinya tanpa perlu opsi ini.
 */
function loadDrawableImageSource(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .then((bitmap) => ({ source: bitmap, cleanup: () => bitmap.close && bitmap.close() }));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ source: img, cleanup: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal memuat gambar')); };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Kompres foto di sisi klien sebelum diunggah — kamera HP modern rutin
 * menghasilkan file 5-15MB, sementara server membatasi upload 5MB
 * (middleware/upload.js) TANPA pesan yang jelas ke pengguna kalau kelebihan
 * (bisa terasa seperti "upload gagal" tanpa alasan, apalagi di jaringan
 * seluler lambat saat teknisi di lapangan). Fungsi ini downscale + turunkan
 * kualitas JPEG bertahap sampai di bawah target ukuran, supaya foto bukti
 * hampir selalu berhasil terkirim tanpa teknisi perlu tahu/atur apa pun.
 *
 * Aman dipanggil untuk file apa pun: bukan gambar / GIF (animasi akan rusak
 * kalau di-canvas) / sudah cukup kecil / gagal diproses browser lama →
 * dikembalikan APA ADANYA, validasi ukuran & tipe di server tetap jadi
 * jaring pengaman terakhir.
 *
 * @param {File} file
 * @param {{maxDimension?: number, maxBytes?: number}} [opts]
 * @returns {Promise<File>}
 */
async function compressImageFile(file, opts = {}) {
  const maxDimension = opts.maxDimension || 1920;
  const maxBytes = opts.maxBytes || 4.5 * 1024 * 1024; // sisakan margin di bawah limit server 5MB

  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;
  if (file.size <= maxBytes) return file;

  let cleanup = null;
  try {
    const loaded = await loadDrawableImageSource(file);
    cleanup = loaded.cleanup;
    const source = loaded.source;

    let { width, height } = source;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(source, 0, 0, width, height);

    let quality = 0.85;
    let blob = await canvasToJpegBlob(canvas, quality);
    let attempts = 0;
    while (blob && blob.size > maxBytes && attempts < 4) {
      quality = Math.max(quality - 0.15, 0.3);
      blob = await canvasToJpegBlob(canvas, quality);
      attempts++;
    }

    if (!blob || blob.size >= file.size) return file; // hasil kompresi tidak lebih kecil — pakai asli
    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    return file; // browser lama/gagal proses — jangan blokir upload
  } finally {
    if (cleanup) cleanup();
  }
}