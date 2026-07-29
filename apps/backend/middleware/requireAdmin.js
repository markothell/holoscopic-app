const User = require('../models/User');

// Admin gate.
//
// This used to read `x-user-id` straight off the request and look up the role.
// A header is not a credential: anyone who learned an admin's 8-character id
// had full admin, and the id was obtainable from public endpoints that
// returned `role`. Identity now comes only from a verified bearer token
// (middleware/verifyUser.js#attachVerifiedUser).
//
// The token proves *who*. The User row still decides *what*: the role claim
// inside a token is up to 15 minutes stale, so demoting or disabling an admin
// has to take effect immediately rather than whenever their token expires.
module.exports = async (req, res, next) => {
  const userId = req.authedUserId;
  if (!userId) return res.status(401).json({ error: 'Sign in required' });

  try {
    const user = await User.findOne({ id: userId });
    if (!user || user.role !== 'admin' || !user.isActive) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.adminUser = user;
    // Downstream handlers historically read x-user-id. Normalize it to the
    // proven value so nothing reads an attacker-supplied header by accident.
    req.headers['x-user-id'] = user.id;
    next();
  } catch (error) {
    console.error('requireAdmin error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
