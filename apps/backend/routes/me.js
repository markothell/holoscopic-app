const express = require('express');
const { requireVerified } = require('../middleware/verifyUser');
const dashboard = require('../utils/dashboard');

// /api/me — reads about the signed-in account that span every app. The subject
// is always req.authedUserId; nothing here takes a user id from the request.

const router = express.Router();

router.get('/dashboard', requireVerified, async (req, res) => {
  try {
    res.json(await dashboard.forUser(req.authedUserId));
  } catch (err) {
    console.error('[me/dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
