const Instance = require('../models/Instance');

module.exports = async function resolveInstance(req, res, next) {
  try {
    let instance = null;

    // 1. Explicit header — accepts either the instance id or slug
    const headerInstanceId = req.headers['x-instance-id'];
    if (headerInstanceId) {
      instance = await Instance.findOne({ id: headerInstanceId, active: true })
             || await Instance.findOne({ slug: headerInstanceId, active: true });
    }

    // 2. Origin/Referer header → domain lookup
    if (!instance) {
      const origin = req.headers.origin || req.headers.referer;
      if (origin) {
        instance = await Instance.findByDomain(origin);
      }
    }

    // 3. Fall back to default instance
    if (!instance) {
      instance = await Instance.getDefault();
    }

    // Hard stop if instance is expired
    if (instance.endDate && instance.endDate < new Date()) {
      return res.status(410).json({ error: 'This instance has ended' });
    }

    req.instance   = instance;
    req.instanceId = instance.id;
    next();
  } catch (err) {
    console.error('resolveInstance error:', err.message);
    next(err);
  }
};
