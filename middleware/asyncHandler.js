/**
 * Async Handler Middleware
 * Menghilangkan duplikasi try/catch di setiap route handler.
 *
 * Usage:
 *   const asyncHandler = require('../middleware/asyncHandler');
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 *
 * Error otomatis diteruskan ke global error handler di server.js
 */
const logger = require('../utils/logger');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    logger.error(`Async error: ${error.message}`, {
      url: req.originalUrl,
      method: req.method,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error' });
  });
};

module.exports = asyncHandler;
