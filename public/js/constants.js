/**
 * Dark mode — state disimpan di localStorage('theme'), diterapkan lewat
 * atribut data-theme di <html>. Toggle-nya cuma ada di halaman Referensi
 * (admin.html), tapi state-nya berlaku di seluruh app karena localStorage
 * dibagi lintas halaman satu origin.
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