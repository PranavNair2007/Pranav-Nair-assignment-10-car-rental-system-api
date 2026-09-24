/**
 * Centralized error handler. Controllers can pass errors to next(err)
 * with an optional err.statusCode; anything uncaught falls back to 500.
 */
function errorHandler(err, req, res, next) {
  console.error(err.stack || err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
}

module.exports = errorHandler;
