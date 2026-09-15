const express = require('express');
const { requireVerified } = require('../middleware/verifyUser');
const invites = require('../utils/invites');

// /api/invites — invitations to circles, across every app that runs them.
// Thin wrappers over utils/invites.js, which explains the rules.
//
// Not instance-scoped: an invitation is found by its token or id, and the
// circle it names carries its own instanceId. The holoscopic.io pages that call
// this have no instance in their URL at all.
//
// Identity is req.authedUserId only. The token lookup is the one read that
// works signed out, because an invitee usually arrives before they have an
// account; it returns a masked address and nothing else about anybody.

const router = express.Router();

function send(res, err) {
  if (err instanceof invites.InviteError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  console.error('[invites]', err);
  return res.status(500).json({ error: 'Something went wrong' });
}

const handle = fn => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    send(res, err);
  }
};

router.get('/mine', requireVerified, handle(req => invites.listMine(req.authedUserId)));

router.get('/hosting', requireVerified, handle(req => invites.listHosting(req.authedUserId)));

router.post('/', requireVerified, handle(req => invites.createInvite({
  userId: req.authedUserId,
  circleId: req.body?.circleId,
  email: req.body?.email,
})));

router.get('/token/:token', handle(async req => ({
  invite: await invites.viewByToken(req.params.token),
})));

router.post('/token/:token/accept', requireVerified, handle(req => invites.acceptInvite({
  userId: req.authedUserId, token: req.params.token,
})));

router.post('/token/:token/decline', requireVerified, handle(req => invites.declineInvite({
  userId: req.authedUserId, token: req.params.token,
})));

router.post('/:id/accept', requireVerified, handle(req => invites.acceptInvite({
  userId: req.authedUserId, id: req.params.id,
})));

router.post('/:id/decline', requireVerified, handle(req => invites.declineInvite({
  userId: req.authedUserId, id: req.params.id,
})));

router.delete('/:id', requireVerified, handle(req => invites.revokeInvite({
  userId: req.authedUserId, id: req.params.id,
})));

module.exports = router;
