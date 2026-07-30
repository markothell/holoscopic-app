// Terminal error handler.
//
// There wasn't one. Anything that reached `next(err)` — resolveInstance does
// this — fell through to Express's default handler, which in a non-production
// NODE_ENV replies with the full stack trace as HTML. That is both an
// information leak and a response no client can parse, since every other route
// returns `{ error }`.
//
// Also assigns each request an id and logs failures with it, so a user
// reporting "it broke" can be matched to a specific log line.
const crypto = require('node:crypto');

// Where an error reporter (Sentry or similar) gets attached, if one is
// configured. Injected rather than imported so this file has no dependency on
// any particular vendor and stays a no-op when nothing is wired up.
let _reporter = null;
function setReporter(fn) { _reporter = fn; }

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = (typeof incoming === 'string' && incoming.length <= 64)
    ? incoming
    : crypto.randomBytes(8).toString('hex');
  res.setHeader('x-request-id', req.id);
  next();
}

// 404 for unmatched /api paths. Without this an unknown route returns Express's
// HTML "Cannot GET /api/nope", which reads like a server fault rather than a
// missing endpoint — and looks identical to the state where Mongo is down and
// no routes have been mounted at all.
function notFound(req, res) {
  res.status(404).json({ error: 'Not found', path: req.path, requestId: req.id });
}

function errorHandler(err, req, res, _next) {
  // A budget rejection (llm/resilience.js) carries its own status and a message
  // written for the person who hit it.
  const status = err.status || err.statusCode || 500;
  const isClientError = status >= 400 && status < 500;

  // 5xx is our fault and gets the full detail in the log; 4xx is expected
  // traffic and would only add noise.
  if (!isClientError) {
    console.error(
      `[error] ${req.method} ${req.originalUrl} → ${status} (request ${req.id})`,
      err.stack || err.message,
    );
    if (_reporter) {
      try {
        _reporter(err, {
          requestId: req.id,
          method: req.method,
          path: req.originalUrl,
          instanceId: req.instanceId,
          userId: req.authedUserId,
        });
      } catch (reportErr) {
        console.error('[error] reporter failed:', reportErr.message);
      }
    }
  }

  if (res.headersSent) return; // a stream already started; nothing useful to add

  res.status(status).json({
    // Never surface an internal message on a 500 — it can carry a connection
    // string, a query, or a file path.
    error: isClientError ? (err.message || 'Request failed') : 'Internal server error',
    requestId: req.id,
  });
}

module.exports = { requestId, notFound, errorHandler, setReporter };
