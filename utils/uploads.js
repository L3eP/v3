const fs = require('fs');

// multer menulis file ke disk SEBELUM query INSERT/UPDATE yang mereferensikannya
// dijalankan. Kalau query itu gagal (koneksi DB putus, constraint error, dst),
// file yang sudah ke-upload tidak pernah dihapus — jadi sampah permanen di
// public/uploads tanpa baris database manapun yang menunjuknya. Panggil ini di
// catch block tiap route yang pakai upload.single(...).
function cleanupUploadOnError(req) {
  if (req.file && req.file.path) {
    fs.unlink(req.file.path, () => {});
  }
}

module.exports = { cleanupUploadOnError };
