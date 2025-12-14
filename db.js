require('dotenv').config();
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const logger = require('./utils/logger');

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'login_app',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
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
