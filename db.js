const mysql = require('mysql2/promise');
const logger = require('./utils/logger');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'login_app',
    waitForConnections: true,
    connectionLimit: 10,
    // queueLimit: 0 di mysql2 berarti ANTREAN TANPA BATAS (bukan "tidak boleh
    // antre") — di bawah lonjakan traffic, request akan terus menumpuk di
    // memori alih-alih gagal cepat, sampai akhirnya proses kehabisan memori.
    // Dibatasi supaya kelebihan beban gagal cepat (ER_CON_COUNT_ERROR) dan
    // proses tetap hidup untuk request lain, bukan diam-diam menumpuk.
    queueLimit: 30
});

// Test Connection
(async () => {
    try {
        const connection = await pool.getConnection();
        logger.info('Database connected successfully');
        connection.release();
    } catch (err) {
        logger.error('Database connection failed:', err);
    }
})();

module.exports = pool;
