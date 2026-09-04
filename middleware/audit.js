const db = require('../db');

/**
 * Audit helper — catat perubahan data penting
 *
 * @param {Object} req - Express request object (untuk session user & IP)
 * @param {string} action - CREATE | UPDATE | DELETE | LOGIN | LOGOUT
 * @param {string} targetType - ticket | user | inventory | ftth | reference | setting
 * @param {number|null} targetId - ID objek yang diubah
 * @param {Object} [details={}] - Informasi tambahan (old_value, new_value, changes)
 */
async function audit(req, action, targetType, targetId = null, details = {}) {
  try {
    const username = req.session?.user?.username || 'system';
    const ipAddress = req.ip || req.connection?.remoteAddress || null;

    await db.query(
      'INSERT INTO audit_logs (action, target_type, target_id, details, username, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [action, targetType, targetId, JSON.stringify(details), username, ipAddress]
    );
  } catch (error) {
    // Audit failure should never crash the main request
    console.error('Audit log error:', error.message);
  }
}

module.exports = { audit };
