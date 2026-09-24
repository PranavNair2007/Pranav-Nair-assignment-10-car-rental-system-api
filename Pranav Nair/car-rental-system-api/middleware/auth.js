const { supabase } = require('../config/supabase');

/**
 * Verifies the Supabase access token on the Authorization header and
 * attaches the authenticated user ({ id, email, ... }) to req.user.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Provide a Bearer token in the Authorization header.'
    });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = data.user;
    req.token = token;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = authenticate;
