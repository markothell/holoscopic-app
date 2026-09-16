// Invitations to circles — every write to the Invite collection goes through
// here. Routes (routes/invites.js) are thin wrappers.
//
// The flow is deliberately mail-free: a host makes a link for one address and
// sends it in their own words. What the platform owns is the part that has to
// be right — who may make a link, who may use it, and keeping the circle's own
// invitation list (Circle.invitedEmails, the join gate) in step with it.

const crypto = require('crypto');
const Invite = require('../models/Invite');
const Circle = require('../models/Circle');
const User = require('../models/User');
const circles = require('./circles');
const { notify } = require('./notify');

const TTL_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class InviteError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function generateId() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

// Enough to recognise your own address, not enough to learn somebody else's —
// the token lookup is readable signed out.
function maskEmail(email) {
  const [local, domain] = normalizeEmail(email).split('@');
  if (!local || !domain) return '';
  return `${local.slice(0, 2)}•••@${domain}`;
}

// Which product a circle opens in. The same rule circle mail follows:
// Threshold's own activity links to threshold.holoscopic.io, everything else
// (gather, a shared Synthesis document) to circles.holoscopic.io. The instance
// cannot answer this — both apps read circles off the one `threshold` instance.
function appForCircle(circle) {
  return circle.activity === 'threshold' ? 'threshold' : 'circles';
}

function circlePath(circle) {
  return appForCircle(circle) === 'threshold' ? `/t/${circle.urlName}` : `/c/${circle.urlName}`;
}

function statusOf(invite, now = new Date()) {
  if (invite.status === 'pending' && invite.expiresAt && new Date(invite.expiresAt) <= now) {
    return 'expired';
  }
  return invite.status;
}

function displayName(user) {
  return String(user?.name || '').trim().slice(0, 80) || 'Member';
}

function toView(invite, circle, inviterName, now = new Date()) {
  return {
    id: invite.id,
    circleTitle: circle ? circle.title : 'A circle',
    app: circle ? appForCircle(circle) : 'circles',
    path: circle ? circlePath(circle) : '/',
    invitedByName: inviterName || 'Someone',
    emailHint: maskEmail(invite.email),
    status: statusOf(invite, now),
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  };
}

function toSent(invite, now = new Date()) {
  return {
    id: invite.id,
    email: invite.email,
    status: statusOf(invite, now),
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    respondedAt: invite.respondedAt,
  };
}

async function namesById(ids) {
  const users = await User.find({ id: { $in: [...new Set(ids)] } }).select('id name').lean();
  return new Map(users.map(u => [u.id, displayName(u)]));
}

async function accountOf(userId) {
  const account = await User.findOne({ id: userId }).select('id name email emailVerified').lean();
  if (!account) throw new InviteError(401, 'Sign in required');
  return account;
}

/**
 * Make a link. Host only — whoever holds the seat now, which is not
 * necessarily whoever created the circle (circles.js#hostOf). A circle with a
 * vacant seat cannot invite anybody, which is the same rule as everything else
 * a host does: an unhosted circle starts nothing new.
 *
 * An earlier pending link for the same address is revoked, so a re-sent
 * invitation is the only one that works rather than one of several.
 */
async function createInvite({ userId, circleId, email }) {
  const address = normalizeEmail(email);
  if (!EMAIL_RE.test(address)) throw new InviteError(400, 'Enter a valid email address');

  const circle = await Circle.findOne({ id: circleId });
  if (!circle) throw new InviteError(404, 'Circle not found');
  if (circles.hostOf(circle) !== userId) {
    throw new InviteError(403, 'Only this circle\'s host can invite people');
  }
  if (circle.phase === 'closed') throw new InviteError(400, 'This circle has closed');
  if (circle.members.some(m => normalizeEmail(m.email) === address)) {
    throw new InviteError(409, 'That address is already in this circle');
  }

  const now = new Date();
  await Invite.updateMany(
    { circleId: circle.id, email: address, status: 'pending' },
    { $set: { status: 'revoked', respondedAt: now } },
  );

  const token = crypto.randomBytes(24).toString('base64url');
  const invite = await Invite.create({
    id: generateId(),
    tokenHash: hashToken(token),
    circleId: circle.id,
    instanceId: circle.instanceId,
    email: address,
    invitedBy: userId,
    expiresAt: new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000),
  });

  // $addToSet rather than a save of the loaded document: the round ticker
  // saves circles too, and a whole-document save could put back a list this
  // request just changed.
  await Circle.updateOne({ id: circle.id }, { $addToSet: { invitedEmails: address } });

  // Somebody who already has an account hears about it in-app as well. The
  // link is still the host's to send — this is a nudge, not the invitation.
  const existing = await User.findOne({ email: address }).select('id').lean();
  if (existing) {
    const host = await User.findOne({ id: userId }).select('name').lean();
    await notify({
      userId: existing.id,
      type: 'invitation',
      message: `${displayName(host)} invited you to ${circle.title}`,
      refType: 'invite',
      refId: invite.id,
    });
  }

  return { invite: toSent(invite, now), token };
}

async function findInvite({ token, id }) {
  const invite = token
    ? await Invite.findOne({ tokenHash: hashToken(token) })
    : await Invite.findOne({ id });
  if (!invite) throw new InviteError(404, 'Invitation not found');
  return invite;
}

/** The public face of a link — readable signed out, so it names no address. */
async function viewByToken(token) {
  const invite = await findInvite({ token });
  const circle = await Circle.findOne({ id: invite.circleId }).select('id title activity urlName').lean();
  const names = await namesById([invite.invitedBy]);
  return toView(invite, circle, names.get(invite.invitedBy));
}

// Shared by accept and decline: the invitation has to be addressed to this
// account. Confirmation is checked only where it grants something (accept).
function assertAddressedTo(invite, account) {
  if (normalizeEmail(account.email) !== invite.email) {
    throw new InviteError(403, 'This invitation was sent to a different address', {
      code: 'email_mismatch',
      emailHint: maskEmail(invite.email),
    });
  }
}

function assertPending(invite) {
  const status = statusOf(invite);
  if (status !== 'pending') {
    throw new InviteError(410, `This invitation has been ${status}`, { code: 'invite_closed', status });
  }
}

async function acceptInvite({ userId, token, id }) {
  const invite = await findInvite({ token, id });
  const account = await accountOf(userId);
  const circle = await Circle.findOne({ id: invite.circleId });
  if (!circle) throw new InviteError(404, 'Circle not found');

  const names = await namesById([invite.invitedBy]);
  const result = () => ({
    invite: toView(invite, circle, names.get(invite.invitedBy)),
    app: appForCircle(circle),
    path: circlePath(circle),
  });

  // A second click on a link that already let you in just takes you there.
  if (invite.status === 'accepted' && invite.acceptedBy === account.id) return result();

  assertPending(invite);
  assertAddressedTo(invite, account);
  if (!account.emailVerified) {
    throw new InviteError(403, 'Confirm your email address first. Invitations are matched to it.', {
      code: 'email_unverified',
    });
  }

  // Re-asserted in case the list was edited since the link was made; the gate
  // in joinCircle is still the one that admits.
  await Circle.updateOne({ id: circle.id }, { $addToSet: { invitedEmails: invite.email } });
  try {
    await circles.joinCircle({
      circleId: circle.id,
      userId: account.id,
      username: displayName(account),
      email: normalizeEmail(account.email),
    });
  } catch (err) {
    throw new InviteError(400, err.message || 'Could not join this circle');
  }

  invite.status = 'accepted';
  invite.acceptedBy = account.id;
  invite.respondedAt = new Date();
  await invite.save();
  return result();
}

async function declineInvite({ userId, token, id }) {
  const invite = await findInvite({ token, id });
  const account = await accountOf(userId);
  assertPending(invite);
  assertAddressedTo(invite, account);

  invite.status = 'declined';
  invite.respondedAt = new Date();
  await invite.save();

  const circle = await Circle.findOne({ id: invite.circleId }).select('id title activity urlName').lean();
  const names = await namesById([invite.invitedBy]);
  return { invite: toView(invite, circle, names.get(invite.invitedBy)) };
}

/**
 * Withdraw a pending link. The inviter or the circle's host.
 *
 * The address comes off the circle's list too, unless another live or
 * accepted invitation still puts it there — otherwise a revoked invitee could
 * walk in through the circle page instead of the link.
 */
async function revokeInvite({ userId, id }) {
  const invite = await findInvite({ id });
  const circle = await Circle.findOne({ id: invite.circleId });
  const isHost = circle && circle.createdBy === userId;
  if (invite.invitedBy !== userId && !isHost) throw new InviteError(404, 'Invitation not found');
  assertPending(invite);

  invite.status = 'revoked';
  invite.respondedAt = new Date();
  await invite.save();

  if (circle) {
    const stillInvited = await Invite.exists({
      circleId: circle.id,
      email: invite.email,
      status: { $in: ['pending', 'accepted'] },
      id: { $ne: invite.id },
    });
    const isMember = circle.members.some(m => normalizeEmail(m.email) === invite.email);
    if (!stillInvited && !isMember) {
      await Circle.updateOne({ id: circle.id }, { $pull: { invitedEmails: invite.email } });
    }
  }
  return { invite: toSent(invite) };
}

// An unconfirmed address is one anybody could have typed at signup, so it is
// shown no invitations — listing them would tell a stranger whose circles an
// address was invited to.
function pendingQuery(account, now = new Date()) {
  return { email: normalizeEmail(account.email), status: 'pending', expiresAt: { $gt: now } };
}

async function listMine(userId) {
  const account = await accountOf(userId);
  if (!account.emailVerified) return { invites: [], emailUnverified: true };

  const rows = await Invite.find(pendingQuery(account)).sort({ createdAt: -1 }).limit(50);
  const circleRows = await Circle.find({ id: { $in: rows.map(r => r.circleId) } })
    .select('id title activity urlName').lean();
  const byId = new Map(circleRows.map(c => [c.id, c]));
  const names = await namesById(rows.map(r => r.invitedBy));
  return {
    invites: rows.map(r => toView(r, byId.get(r.circleId), names.get(r.invitedBy))),
    emailUnverified: false,
  };
}

async function countPending(userId) {
  const account = await User.findOne({ id: userId }).select('email emailVerified').lean();
  if (!account || !account.emailVerified) return 0;
  return Invite.countDocuments(pendingQuery(account));
}

/** Circles this account can invite people to, with what it has sent.
 *  Keyed on the SEAT, not on who created it — hosting moves, and the invite
 *  power moves with it. */
async function listHosting(userId) {
  const rows = await Circle.find({ ...circles.hostedByQuery(userId), phase: { $ne: 'closed' } })
    .select('id title activity urlName').sort({ updatedAt: -1 }).limit(50).lean();
  const sent = await Invite.find({ circleId: { $in: rows.map(c => c.id) } })
    .sort({ createdAt: -1 }).limit(500);
  const now = new Date();
  return {
    circles: rows.map(c => ({
      id: c.id,
      title: c.title,
      app: appForCircle(c),
      path: circlePath(c),
      invites: sent.filter(i => i.circleId === c.id).map(i => toSent(i, now)),
    })),
  };
}

module.exports = {
  InviteError,
  createInvite,
  viewByToken,
  acceptInvite,
  declineInvite,
  revokeInvite,
  listMine,
  countPending,
  listHosting,
  // pure, exported for tests and utils/dashboard.js
  hashToken,
  normalizeEmail,
  maskEmail,
  appForCircle,
  circlePath,
  statusOf,
  TTL_DAYS,
};
