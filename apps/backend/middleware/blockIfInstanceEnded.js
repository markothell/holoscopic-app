const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Guard for gameplay-write routers: once an instance has ended (deactivated
// or past endDate, per resolveInstance's req.instanceEnded), reads still work
// but new mutations are rejected so the game becomes read-only.
module.exports = function blockIfInstanceEnded(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  if (req.instanceEnded) {
    return res.status(403).json({ error: 'This instance has ended', code: 'INSTANCE_ENDED' });
  }
  next();
};
