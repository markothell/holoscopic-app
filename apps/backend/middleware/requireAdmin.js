const User = require('../models/User');

module.exports = async (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await User.findOne({ id: userId });
    if (!user || user.role !== 'admin' || !user.isActive) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.adminUser = user;
    next();
  } catch (error) {
    console.error('requireAdmin error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
