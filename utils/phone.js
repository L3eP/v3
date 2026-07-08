/**
 * Phone Number Utility
 * Standarisasi format nomor telepon ke format Fonnte (62xx)
 *
 * Format output: 628xxxxxxxxxx (tanpa +, tanpa spasi, tanpa 0 di depan)
 */

/**
 * Bersihkan dan standarisasi nomor telepon ke format internasional (62xx)
 * @param {string} phone - Nomor telepon input (bisa 08xx, 62xx, +628xx, dll)
 * @returns {string|null} Nomor dalam format 628xx atau null jika tidak valid
 */
function sanitizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;

  // Hapus spasi, strip, tanda kurung, + di depan
  let cleaned = phone.replace(/[\s\-()]/g, '');

  // Hapus + di awal
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Jika 0 di depan → ganti 0 dengan 62
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }

  // Jika sudah 62 di depan, pastikan tidak ada 0 setelah 62 (62081 → 6281)
  if (cleaned.startsWith('62') && cleaned[2] === '0') {
    cleaned = '62' + cleaned.slice(3);
  }

  // Validasi: hanya angka, minimal 10 digit (setelah 62 berarti minimal 8 digit lokal)
  if (!/^\d+$/.test(cleaned) || cleaned.length < 10) {
    return null;
  }

  return cleaned;
}

/**
 * Validasi nomor telepon
 * @param {string} phone
 * @returns {boolean}
 */
function isValidPhone(phone) {
  return sanitizePhone(phone) !== null;
}

module.exports = { sanitizePhone, isValidPhone };
