const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const { format } = winston;

const logDir = 'logs';

/**
 * Detail logger — catat log REQUEST+PENUH yang TIDAK ditampilkan di aplikasi.
 * Cukup disimpan ke file logs/, retensi mingguan (7 hari).
 * Berbeda dari audit_logs (DB, dilihat di app) — ini untuk investigasi teknis.
 */
const detailLogger = winston.createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.json()
    ),
    transports: [
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'detail-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '7d' // RETENSI: log lebih dari 7 hari otomatis dihapus
        })
    ]
    // TANPA transport Console — detail log TIDAK boleh tampil di terminal/aplikasi.
});

module.exports = detailLogger;
