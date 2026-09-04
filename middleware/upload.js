const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: function (req, file, cb) {
        // Sanitize filename to prevent directory traversal or weird characters
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, Date.now() + '-' + cleanName);
    }
});

// File Filter (Images Only — ekstensi + MIME dari klien; keduanya bisa dipalsukan,
// karena itu isi file juga diverifikasi di bawah)
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed!'));
    }
};

// === 3.3 — Validasi magic bytes ===
// Ekstensi + MIME datang dari klien dan bisa dipalsukan. Cek isi file sungguhan:
// "x.png" berisi HTML/Script akan ketahuan dan DITOLAK di sini.
function magicBytesMatch(mimetype, buf) {
    if (!buf || buf.length < 12) return false;
    const fmt = (mimetype || '').split('/')[1] || '';
    switch (fmt) {
        case 'jpeg':
        case 'jpg':
            return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        case 'png':
            return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        case 'gif':
            return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
        case 'webp':
            // 'RIFF' di offset 0 + 'WEBP' di offset 8
            return buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
        default:
            return false;
    }
}

// Verifikasi isi file SETELAH multer menulis ke disk (tidak mengganggu stream
// multer saat menulis). File yang terbukti palsu langsung dihapus — jangan simpan.
function verifyImageMagic(filePath, mimetype) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, buf) => {
            if (err) return reject(err);
            if (magicBytesMatch(mimetype, buf)) return resolve();
            // File palsu — HAPUS dulu, baru tolak. Deterministik: file dijamin
            // tidak ada sebelum error dikirim ke klien, dan tidak ikut tersimpan.
            fs.unlink(filePath, () => {
                const e = new Error('File bukan gambar asli (magic bytes tidak cocok)');
                e.code = 'INVALID_IMAGE_CONTENT';
                reject(e);
            });
        });
    });
}

// Initialize Multer
const baseUpload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Export yang DIWRAP: semua pemanggil upload.single(field) otomatis mendapatkan
// langkah verifikasi magic bytes setelah file tersimpan. Tidak ada satu pun
// route yang perlu diubah (semua call site memakai upload.single('...')).
module.exports = {
    single(field) {
        const single = baseUpload.single(field);
        return (req, res, next) => {
            single(req, res, (err) => {
                if (err) return next(err);
                const f = req.file;
                if (!f) return next();
                verifyImageMagic(f.path, f.mimetype).then(() => next()).catch(next);
            });
        };
    },
    magicBytesMatch,
    verifyImageMagic
};
