// websocket-server.js - Adapted for We All Explain
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });

console.log('🔧 NODE_ENV:', process.env.NODE_ENV);
// The URI is never logged — it carries the cluster password. Presence is
// logged below, and the database name is extracted at connect time.

// Before anything else: the SDK has to be initialised prior to the modules it
// instruments being required.
const observability = require('./observability');
observability.init();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// Connection tracking and cleanup intervals
const CONNECTIONS_CLEANUP_INTERVAL = process.env.NODE_ENV === 'production' ? 30 * 1000 : 10 * 1000;
const STALE_CONNECTION_CLEANUP_INTERVAL = process.env.NODE_ENV === 'production' ? 120 * 1000 : 30 * 1000;

// Connection limits
const MAX_CONNECTIONS = process.env.MAX_CONNECTIONS || 25;
const SOFT_LIMIT = Math.floor(MAX_CONNECTIONS * 0.8);

let connectionCount = 0;
const operationsInProgress = new Set();

// Express setup
const app = express();

// Trust Render's proxy for accurate IP addresses in rate limiting
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Parse CLIENT_URL for CORS
const allowedOrigins = process.env.CLIENT_URL 
  ? process.env.CLIENT_URL.split(',').map(url => url.trim())
  : ["http://localhost:3000"];

console.log('🌐 CORS origins:', allowedOrigins);

// Registered FIRST, ahead of CORS. It used to sit after cors and bodyParser,
// so a rejected origin never reached it and its error logged as
// "(request undefined)" — the one identifier that would have made the log line
// traceable was missing from exactly the errors that needed it.
const { requestId, notFound, errorHandler, setReporter } = require('./middleware/errorHandler');
// The handler builds an allow-listed context (request id, instance, user id) —
// never the raw request — and hands it here.
setReporter(observability.report);
app.use(requestId);

// Reject requests whose Host header names neither this server's own Render
// hostname nor a domain in CLIENT_URL. A scanner hitting the bare IP sends no
// Origin — CORS below never sees it, since CORS is a browser mechanism a raw
// HTTP client just ignores — but HTTP still requires some Host header, and a
// direct-IP hit is almost never one of ours. Sitting ahead of CORS,
// resolveInstance and Mongo, this turns that hit into one Set lookup instead
// of a full request cycle that still ends in resolveInstance's default-instance
// fallback and a 200 (root CLAUDE.md: "resolveInstance never fails" is
// intentional multi-tenancy behavior for recognized-but-unmatched Origins —
// this check runs before that logic even starts, for requests that were never
// addressed to a real hostname at all).
//
// Dev is exempt: localhost:PORT never matches CLIENT_URL, and there is no
// scanner to defend against on a machine that is not listening on the public
// internet.
if (process.env.NODE_ENV === 'production') {
  const allowedHosts = new Set(
    allowedOrigins
      .map(url => { try { return new URL(url).hostname; } catch { return null; } })
      .filter(Boolean)
  );
  if (process.env.RENDER_EXTERNAL_URL) {
    try { allowedHosts.add(new URL(process.env.RENDER_EXTERNAL_URL).hostname); } catch {}
  }

  // Temporary diagnostic, added while chasing the July 31 – Aug 4 traffic
  // spike: Render's dashboard could show neither a Host nor a Path for that
  // traffic, and this app has no access-log middleware, so nothing about it
  // ever reached a log line. Logs each distinct (method, host, path) combo
  // once — bounded by how many distinct combos actually show up, not by
  // request volume — so a repeat is identifiable immediately instead of
  // showing up only as an unlabeled bucket in Render's metrics. Remove once
  // the cause is confirmed.
  const seenRejections = new Set();

  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const host = (req.headers.host || '').split(':')[0];
    if (allowedHosts.has(host)) return next();
    const key = `${req.method} ${host || '(none)'} ${req.path}`;
    if (!seenRejections.has(key)) {
      seenRejections.add(key);
      console.log(`[host-reject] ${key} ip=${req.ip} ua=${req.headers['user-agent'] || '(none)'}`);
    }
    res.status(400).end();
  });
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, '');
    const normalizedAllowed = allowedOrigins.map(url => url.replace(/\/$/, ''));
    
    if (normalizedAllowed.indexOf(normalizedOrigin) !== -1) {
      callback(null, true);
    } else {
      // 403, not 500. An origin that is not on the allowlist is a statement
      // about the caller, not a fault in this server: bots, stale deploys and
      // any browser tab on the open internet produce these. Left as a bare
      // Error it became a 500, which meant every stray origin logged a stack
      // trace and burned an error-reporting event.
      const err = new Error(`Origin not allowed: ${origin}`);
      err.status = 403;
      callback(err);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  // X-Contributor-Token / X-Curator-Key are Chorus's account-free identity
  // headers (apps/chorus). Omitting them here makes the browser preflight
  // strip them, which reads as "everyone is anonymous" rather than as an error.
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-User-Id", "X-Instance-Id", "X-Contributor-Token", "X-Curator-Key"]
}));

app.use(bodyParser.json());

// Environment-aware rate limiting
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// Rate limiting for API endpoints (not admin)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isProduction ? 100 : 10000, // Production: 100/min, Dev/Test: 10,000/min
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Only health checks, Chorus, and local development bypass the limiter.
    //
    // This used to also skip `req.path.includes('/admin')`. That matched any
    // path *containing* the substring anywhere — so the bypass was selectable
    // by the caller, on unauthenticated routes, e.g. /activities/admin.
    // Admin routes get their own generous bucket below instead.
    //
    // Chorus is exempt because a per-IP ceiling means something different
    // there: its pages are Server Components, so a visitor's wall read reaches
    // this server FROM VERCEL, not from their phone. Every reader of every
    // memorial worldwide therefore shares a handful of egress IPs, and at
    // 100/min a memorial texted round a family group could rate-limit itself
    // — while a genuine flood from one phone would still look like one
    // visitor. It gets its own buckets instead, sized for a room full of
    // people (memorialReadLimiter / memorialWriteLimiter).
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    if (req.path.startsWith('/memorial')) return true;
    // The traffic beacon is exempt for the mirror-image reason: it fires from
    // the visitor's own browser, so a shared connection — a venue wifi, an
    // office, a school — puts everybody's page views on one IP. At 100/min
    // that connection stops being *measured* long before it is anywhere near
    // abusive, and analytics quietly under-reports exactly the busy day it
    // exists to show. Its own bucket below is sized for that.
    if (req.path.startsWith('/traffic/collect')) return true;
    return req.path === '/health' || (isDevelopment && isLocalhost);
  }
});

// Admin tooling is chatty and authenticated, so it gets headroom the public
// API does not — but it is never unlimited.
const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isProduction ? 600 : 10000,
  message: { error: 'Too many admin requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    return isDevelopment && isLocalhost;
  }
});

// ── Chorus buckets ──────────────────────────────────────────────────────────
//
// Every other router requires a holoscopic account, so the global apiLimiter is
// backstopped by auth. Chorus is open by design (PLAN.md D2), so its ceilings
// are the whole of its abuse protection — and they are sized for the event this
// app exists for: a wake, a birthday, a room of forty people passing a link
// around on one venue wifi. Every one of them shares an IP.
//
// The knobs are env vars so launch night can be adjusted from the Render
// dashboard without a deploy.
const num = (name, fallback) => Number(process.env[name]) || fallback;

// Per PERSON, not per IP: the contributor token is a browser's own identity, so
// forty phones on one wifi get forty budgets instead of splitting one.
//
// The token is client-supplied and freely re-mintable, so this is emphatically
// not the abuse ceiling — memorialIpLimiter below is. What it buys is that the
// honest case (a room of people posting at once) never trips, which the old
// 10/hour/IP did on the eleventh guest.
const memorialWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: num('MEMORIAL_WRITES_PER_HOUR', isProduction ? 30 : 1000),
  message: {
    error: 'That is a lot of memories at once. Try again in a little while.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token = String(req.headers['x-contributor-token'] || '');
    // The id half of `<id>.<mac>`. An unsigned or absent token falls back to
    // the IP, so nobody can dodge the bucket by simply omitting the header.
    const id = token.slice(0, token.lastIndexOf('.'));
    return id ? `c:${id}` : ipKeyGenerator(req.ip);
  },
  skip: (req) => {
    if (req.method === 'GET' || req.method === 'OPTIONS') return true;
    // /session is minted once per browser on first visit and must never be
    // the thing that runs out — it's a prerequisite for posting at all.
    if (req.path === '/session') return true;
    // Deepgram's transcript callbacks all arrive from a handful of their IPs;
    // a per-IP contribution budget would throttle them the moment a memorial
    // gets busy.
    if (req.path.startsWith('/hooks/')) return true;
    // Failure reports are the opposite of contributions: they happen when
    // somebody could NOT post. Charging them to the same budget would mean a
    // failing phone spends its owner's ten memories on error reports and is
    // then rate-limited out of the retry that finally works. It has its own
    // ceiling instead (memorialEventLimiter).
    if (req.path === '/events') return true;
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    return isDevelopment && isLocalhost;
  }
});

// The actual abuse ceiling for Chorus writes, and the backstop that lets the
// per-contributor bucket above be generous: a re-minted token gets a fresh
// budget, but every one of them still lands on this IP.
//
// 300/hour is roughly a hundred people leaving three memories each in one hour
// from a single venue wifi — comfortably above the busiest real gathering, and
// far below anything worth calling a flood.
const memorialIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: num('MEMORIAL_WRITES_PER_HOUR_PER_IP', isProduction ? 300 : 5000),
  message: {
    error: 'That is a lot of memories from this connection. Try again in a little while.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (req.method === 'GET' || req.method === 'OPTIONS') return true;
    // Exactly the exemptions the per-contributor bucket makes, for the same
    // reasons — and /session matters MORE here, not less. A mint happens when
    // somebody opens the compose sheet, so a room of forty people opening it
    // spends forty of this bucket before anyone has written a word. Minting is
    // a stateless HMAC with no database write; memorialReadLimiter is the
    // ceiling that keeps it from being free.
    if (req.path === '/session') return true;
    if (req.path.startsWith('/hooks/')) return true;
    if (req.path === '/events') return true;
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    return isDevelopment && isLocalhost;
  }
});

// Chorus reads, which the global apiLimiter now skips. Sized as an AGGREGATE
// rather than a per-visitor allowance: server-rendered walls arrive from
// Vercel's egress IPs, so this one bucket holds every reader of every memorial
// at once. 600/min is ~10 page renders a second, sustained.
const memorialReadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: num('MEMORIAL_REQUESTS_PER_MIN_PER_IP', isProduction ? 600 : 10000),
  message: { error: 'This memorial is very busy. Try again in a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    return isDevelopment && isLocalhost;
  }
});

// Chorus client failure reports. Higher than the contribution ceiling because
// a phone that cannot post may legitimately report several times, and low
// enough that nobody can use it to flood the log stream.
const memorialEventLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProduction ? 60 : 1000,
  message: { error: 'Too many reports' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
});

// The traffic beacon. Keyed per IP, which is the right key here precisely
// because — unlike a Chorus wall read — this call is made by the visitor's own
// browser rather than by Vercel on their behalf.
//
// 300/min is roughly fifty people on one connection each moving between pages
// every ten seconds: far above any real shared wifi, far below a flood. It
// exists to bound the damage, never to shape the data, so it is set where a
// legitimate visitor can never reach it.
const trafficLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: Number(process.env.TRAFFIC_EVENTS_PER_MIN_PER_IP) || (isProduction ? 300 : 5000),
  message: { error: 'Too many events' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
});

// WebSocket connection limiting
const wsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isProduction ? 30 : 1000, // Production: 30/min, Dev/Test: 1000/min
  message: {
    error: 'Too many WebSocket connections from this IP, please try again later.'
  },
  skip: (req) => {
    // Skip for non-socket.io requests or localhost in development
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    return !req.path.includes('/socket.io/') ||
           (isDevelopment && isLocalhost);
  }
});

app.use('/api', apiLimiter);
app.use('/socket.io', wsLimiter);

// Resolve instance for all API requests
const resolveInstance = require('./middleware/resolveInstance');
const Instance = require('./models/Instance');
const entryUtils = require('./utils/entries');
// Refuse /api work before the routers exist, BEFORE resolveInstance gets a
// chance to query Mongo.
//
// Routes mount only once Mongo connects, and the terminal error handler mounts
// with them — so in the exact situation where a clean error matters most (the
// database is unreachable), there was no handler and resolveInstance's failure
// rendered Express's default HTML stack trace. This turns that into an honest
// 503 and never touches the database to produce it.
app.use('/api', (req, res, next) => {
  if (apiRoutesLoaded) return next();
  res.status(503).json({
    error: 'Service unavailable — the server has not finished starting.',
    requestId: req.id,
  });
});

app.use('/api', resolveInstance);

// Verify bearer tokens (signed from the NextAuth session by the game frontend)
const { attachVerifiedUser } = require('./middleware/verifyUser');
app.use('/api', attachVerifiedUser);

// Create server
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true
  }
});

require('./utils/holons').setIO(io);
require('./utils/notify').setIO(io);
require('./utils/spectrumGames').setIO(io);
require('./utils/oasGames').setIO(io);
require('./utils/synNodes').setIO(io);
require('./utils/memories').setIO(io);
// M3 — the collective LLM's embedding-index refresh hooks. Injected here so the
// funnel stays decoupled; the hooks no-op when the LLM is unconfigured, so this
// never blocks route loading or writes.
require('./utils/synNodes').setIndex(require('./utils/synIndexHooks'));
const { registerSpectrumHandlers } = require('./sockets/spectrum');
const { registerOasHandlers } = require('./sockets/oas');
const { registerSynthesisHandlers } = require('./sockets/synthesis');
const { registerMemorialHandlers } = require('./sockets/memorial');

// Socket identity. The client passes the same short-lived game token it uses
// for HTTP via `io(url, { auth: { token } })`, and it is verified with the
// same code path (middleware/verifyUser.js#verifyToken).
//
// Unauthenticated sockets are ADMITTED, not rejected: On a Spectrum guests
// and Chorus contributors deliberately have no account. They simply get
// socket.data.userId = null and cannot join a personal room.
const { verifyToken } = require('./middleware/verifyUser');

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const payload = verifyToken(token);
  socket.data.userId = payload && payload.sub ? String(payload.sub) : null;
  next();
});

// Store active connections and activity participants
const connections = new Map(); // socketId -> { userId, activityIds }
const activities = new Map(); // activityId -> Set of userIds

// MongoDB connection
let isMongoConnected = false;
let Activity = null;

// Connection cleanup
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  const rssInMB = Math.round(memoryUsage.rss / 1024 / 1024);
  
  console.log(`Connections: ${connectionCount}, Activities: ${activities.size}, Memory: ${rssInMB}MB`);
  
  if (operationsInProgress.size > 50) {
    console.log(`Clearing ${operationsInProgress.size} stale operations`);
    operationsInProgress.clear();
  }
}, CONNECTIONS_CLEANUP_INTERVAL);

// Stale connection cleanup
setInterval(() => {
  let cleaned = 0;
  
  for (const [socketId, connection] of connections.entries()) {
    if (!io.sockets.sockets.has(socketId)) {
      connections.delete(socketId);
      cleaned++;
      
      if (connection && connection.userId) {
        for (const activityId of connection.activityIds || []) {
          if (activities.has(activityId)) {
            activities.get(activityId).delete(connection.userId);
            if (activities.get(activityId).size === 0) {
              activities.delete(activityId);
            }
          }
        }
      }
    }
  }
  
  let emptyActivities = 0;
  for (const [activityId, participants] of activities.entries()) {
    if (participants.size === 0) {
      activities.delete(activityId);
      emptyActivities++;
    }
  }
  
  if (cleaned > 0 || emptyActivities > 0) {
    console.log(`Cleanup: ${cleaned} stale connections, ${emptyActivities} empty activities`);
  }
}, STALE_CONNECTION_CLEANUP_INTERVAL);

// Load API routes
let apiRoutesLoaded = false;

function loadAPIRoutes() {
  if (isMongoConnected && Activity && !apiRoutesLoaded) {
    try {
      const activityRoutes = require('./routes/activities')(io);
      const analyticsRoutes = require('./routes/analytics')();
      const sequenceRoutes = require('./routes/sequences');
      const authRoutes = require('./routes/auth');
      const userRoutes = require('./routes/users');
      const adminRoutes = require('./routes/admin');
      const waitlistRoutes = require('./routes/waitlist');
      const signupRoutes = require('./routes/signup');
      const contactRoutes = require('./routes/contact');
      const importRoutes = require('./routes/import');
      const holonRoutes = require('./routes/holons');
      const topicRoutes = require('./routes/topics');
      const notificationRoutes = require('./routes/notifications');
      const algorithmRoutes = require('./routes/algorithms');
      const frameRoutes = require('./routes/frames');
      const frameRefRoutes = require('./routes/frameRefs');
      const instanceRoutes = require('./routes/instances');
      // Identity-bearing writes on these routers require a verified token —
      // bare x-user-id / body.userId is never trusted for mutations.
      // (admin/import/instances stay on requireAdmin; auth/waitlist are anonymous.)
      const { enforceVerifiedUser } = require('./middleware/verifyUser');
      const requireAdmin = require('./middleware/requireAdmin');
      // Same routers also reject mutations once their instance has ended —
      // reads stay open, admin/auth/waitlist/instances stay unaffected so an
      // instance can still be reactivated.
      const blockIfInstanceEnded = require('./middleware/blockIfInstanceEnded');
      app.use('/api/activities', enforceVerifiedUser, blockIfInstanceEnded, activityRoutes);
      app.use('/api/analytics', analyticsRoutes);
      app.use('/api/sequences', enforceVerifiedUser, sequenceRoutes);
      app.use('/api/auth', authRoutes);
      app.use('/api/users', enforceVerifiedUser, userRoutes);
      app.use('/api/admin', adminLimiter, adminRoutes);
      app.use('/api/waitlist', waitlistRoutes);
      app.use('/api/signup', signupRoutes);
      // Unauthenticated by design — the people most likely to need it are the
      // ones who arrived from a Chorus link and have no account at all.
      app.use('/api/contact', contactRoutes);
      // Import creates activities and seeds entries into an instance the
      // caller names via x-instance-id. Its only check was "is x-user-id
      // non-empty" — the id was never looked up — so it was an
      // unauthenticated content firehose. Its one legitimate caller is
      // scripts/import-sequence.js, which now carries an admin token.
      app.use('/api/import', adminLimiter, requireAdmin, importRoutes);
      app.use('/api/holons', enforceVerifiedUser, blockIfInstanceEnded, holonRoutes);
      app.use('/api/topics', enforceVerifiedUser, blockIfInstanceEnded, topicRoutes);
      app.use('/api/notifications', enforceVerifiedUser, notificationRoutes);
      app.use('/api/algorithms', enforceVerifiedUser, blockIfInstanceEnded, algorithmRoutes);
      app.use('/api/frames', enforceVerifiedUser, blockIfInstanceEnded, frameRoutes);
      app.use('/api/frame-refs', enforceVerifiedUser, blockIfInstanceEnded, frameRefRoutes);
      app.use('/api/instances', adminLimiter, instanceRoutes);
      // On the Spectrum party game — guest identities, so enforceVerifiedUser
      // (guest JWTs from the join route) but no blockIfInstanceEnded.
      const spectrumRoutes = require('./routes/spectrum')(io);
      app.use('/api/spectrum', enforceVerifiedUser, spectrumRoutes);
      // On a Spectrum — account holders; rooms own their instances, so
      // blockIfInstanceEnded (which reads the parent from the header) is
      // deliberately absent here.
      const oasRoutes = require('./routes/oas')(io);
      app.use('/api/oas', enforceVerifiedUser, oasRoutes);
      // Synthesis — account holders; communities own their instances (like OaS
      // rooms), so blockIfInstanceEnded is deliberately absent here too. The
      // router stays a plain (non-factory) router: M1 broadcasts are emitted
      // from the funnel (utils/synNodes.js#setIO), not from the routes, so
      // no io needs to be threaded through here.
      const synthesisRoutes = require('./routes/synthesis');
      app.use('/api/synthesis', enforceVerifiedUser, synthesisRoutes);
      // Threshold — account holders, no holon economy (apps/threshold/PLAN.md
      // D6/D7). Requiring this router is ALSO what registers the 'threshold'
      // activity module with utils/circleActivities.js, and it happens here,
      // before startJobs() below — so the circle round ticker can never reach a
      // threshold circle whose module is missing.
      const thresholdRoutes = require('./routes/threshold');
      // The Deepgram callback FIRST and outside enforceVerifiedUser — the
      // vendor has no account here. It authenticates on its own `?t=` HMAC and
      // reads its share from `?s=`, never from req.instanceId.
      app.use('/api/threshold/hooks', thresholdRoutes.hooks);
      app.use('/api/threshold', enforceVerifiedUser, thresholdRoutes);
      // The activity-AGNOSTIC circle surface (M8's promotion — snapshot, my
      // circles, join). Mounted after the threshold require above so every
      // activity module is registered before this router can be asked to
      // serve a snapshot that calls its hooks.
      app.use('/api/circles', enforceVerifiedUser, require('./routes/circles'));
      // Off-site copy of a shared recording, injected exactly as Chorus's is.
      // Until this runs a voice exists only in Vercel Blob, which has no
      // snapshots and no undelete; scripts/backup-blobs.js sweeps up whatever
      // it drops.
      require('./utils/threshold').setBlobMirror(
        require('./utils/blobMirror').mirrorShare,
      );
      // Transcription, over the same utils/transcribe.js core Chorus uses.
      // Optional by design: with no DEEPGRAM_API_KEY this is a no-op and shares
      // stay 'skipped', which is the normal local state and not an error.
      require('./utils/threshold').setTranscriber(
        require('./utils/thresholdTranscribe').requestTranscript,
      );
      // Chorus memorials — the ONLY router mounted without enforceVerifiedUser,
      // because its contributors deliberately have no holoscopic account
      // (apps/chorus/PLAN.md D2). Anonymous writes are the abuse surface, so
      // it carries its own stricter limiter on top of the global apiLimiter.
      const memorialRoutes = require('./routes/memorial');
      // Fire-and-forget transcription, injected the same way Synthesis injects
      // its index hooks — the funnel itself never imports an HTTP client.
      require('./utils/memories').setTranscriber(
        require('./utils/memorialTranscribe').requestTranscript,
      );
      // Off-site copy of the recording, injected the same way. Until this
      // runs a voice exists only in Vercel Blob, and a deleted store takes it
      // with no way back. scripts/backup-blobs.js sweeps up whatever this
      // drops.
      require('./utils/memories').setBlobMirror(
        require('./utils/blobMirror').mirrorMemory,
      );
      // Its own ceiling, mounted ahead of the contribution limiters, which all
      // skip this path — see memorialEventLimiter.
      app.use('/api/memorial/events', memorialEventLimiter);
      app.use(
        '/api/memorial',
        // Order matters: the aggregate read ceiling sees every request, then
        // the per-IP write backstop, then the per-contributor budget.
        memorialReadLimiter, memorialIpLimiter, memorialWriteLimiter,
        memorialRoutes,
      );

      // Site traffic — page views from every frontend, plus link clicks on the
      // homepage. Mounted bare like /api/memorial, because /collect is called
      // by anonymous readers who will never have an account; /summary inside
      // it carries requireAdmin. Its own bucket, which the global apiLimiter
      // skips (see trafficLimiter).
      //
      // Distinct from /api/analytics above, which reports participation inside
      // activities rather than web traffic.
      const trafficRoutes = require('./routes/traffic');
      app.use('/api/traffic', trafficLimiter, trafficRoutes);

      // Terminal handlers, registered last so they sit behind every route.
      // They live inside loadAPIRoutes for the same reason the routers do: at
      // module scope they would be registered BEFORE the routes and would
      // swallow every request as a 404.
      app.use('/api', notFound);
      app.use(errorHandler);

      apiRoutesLoaded = true;
      console.log('✅ API routes loaded successfully');

      // Periodic settlement, replacing the sweeps that used to run inline on
      // GET /topics and GET /activities. Started here rather than at boot
      // because it needs Mongo, and injected with closeAndSettle so
      // utils/sweeps.js never imports from routes/.
      const { startJobs } = require('./jobs');
      startJobs({ closeAndSettle: require('./routes/activities').closeAndSettle });
    } catch (error) {
      console.error('❌ Error loading API routes:', error.message);
    }
  }
}

// MongoDB connection
console.log("MongoDB URI:", process.env.MONGODB_URI ? "Set" : "Not set");

if (process.env.MONGODB_URI) {
  // Use MONGODB_URI as specified in environment files
  const mongoUri = process.env.MONGODB_URI;
  
  // Extract database name from URI for logging
  const dbMatch = mongoUri.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbMatch ? dbMatch[1] : 'default';
  console.log(`🗃️  Using database: ${dbName}`);
  
  mongoose.connect(mongoUri, {
    // Index creation in production is deliberate and manual
    // (scripts/ensure-indexes.js). Left on in dev/test so schema changes
    // still Just Work locally. Without this, adding an index declaration to
    // a model triggers an uncontrolled foreground build on the next boot.
    autoIndex: process.env.NODE_ENV !== 'production',
    maxPoolSize: process.env.NODE_ENV === 'production' ? 20 : 3,
    minPoolSize: process.env.NODE_ENV === 'production' ? 5 : 1,
    maxIdleTimeMS: process.env.NODE_ENV === 'production' ? 30000 : 15000,
    // How long a request waits for a healthy server after the driver has
    // marked one Unknown. This is the setting that decides whether an Atlas
    // node blip is invisible or a 500: a network error clears that node's
    // pool, and everything queued on it fails with PoolClearedError until
    // rediscovery finds a primary. Atlas elections routinely take 5-15s and
    // heartbeatFrequencyMS is 10000, so the old 5000 gave a request less than
    // one heartbeat to recover — reads and writes are both retryable
    // (retryWrites=true in the URI), and this is the window they retry inside.
    // 15000 rides out an ordinary election; the driver default of 30000 would
    // also make a genuinely dead cluster hang every request for half a minute.
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    heartbeatFrequencyMS: 10000,
  })
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    isMongoConnected = true;
    
    try {
      Activity = require('./models/Activity');
      console.log('✅ MongoDB models loaded');
      
      loadAPIRoutes();
      
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('MongoDB collections:', collections.map(c => c.name));
      
      const activitiesCollection = collections.find(c => c.name === 'activities');
      if (activitiesCollection) {
        const count = await mongoose.connection.db.collection('activities').countDocuments();
        console.log(`Found ${count} activities in MongoDB`);
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    isMongoConnected = false;
  });

  // MongoDB event handlers
  const db = mongoose.connection;
  
  db.on('error', (error) => {
    console.error('MongoDB connection error:', error.message);
    isMongoConnected = false;
  });

  db.on('disconnected', () => {
    console.log('MongoDB disconnected');
    isMongoConnected = false;
  });

  db.on('reconnected', () => {
    console.log('MongoDB reconnected');
    isMongoConnected = true;
    loadAPIRoutes();
  });
  
}

// Health check — reports the truth so Render's healthCheckPath can gate a
// deploy. Three ways this process can be up but useless:
//   - Mongo down          → loadAPIRoutes() never fired, every /api 404s
//   - routes not loaded   → same, even if Mongo later reconnects
//   - no token secret     → enforceVerifiedUser 503s every identity-bearing
//                           write, while reads look perfectly healthy
// Any of them is a 503. Returning a hardcoded 'ok' here is how a fully
// write-dead deploy passes a health check.
//
// `transcription` is REPORTED but never gates health. Chorus transcription is
// optional by design — audio records and plays without it — so a missing key
// must not take the platform down. It is here because both of its failure
// modes are invisible from outside: the app behaves perfectly except that
// transcripts never appear, which is otherwise only discoverable by making a
// recording and waiting. Same reasoning that put authConfigured here.
const { isAuthConfigured } = require('./middleware/verifyUser');
const { readiness: transcriptionReadiness } = require('./utils/memorialTranscribe');
// `mediaBackup` follows the same rule as `transcription`: reported, never
// gating. An unmirrored recording is not a reason to take the platform down —
// but a mirror that has quietly stopped is invisible until the day the bytes
// are needed, which is the worst possible day to find out.
const { readiness: mediaBackupReadiness } = require('./utils/blobMirror');
// Same rule again: unconfigured alerting leaves the platform working perfectly
// except that nobody is ever told when a contributor cannot post. That silence
// is the entire failure mode, so it has to be visible somewhere.
const { readiness: alertingReadiness } = require('./utils/alerts');

app.get('/health', (req, res) => {
  const capacityStatus = connectionCount >= MAX_CONNECTIONS ? 'full' :
                        connectionCount >= SOFT_LIMIT ? 'high' : 'normal';

  const authConfigured = isAuthConfigured();
  const healthy = isMongoConnected && apiRoutesLoaded && authConfigured;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    message: 'Holoscopic API + WebSocket server',
    mongodb: isMongoConnected ? 'connected' : 'disconnected',
    apiRoutesLoaded,
    authConfigured,
    transcription: transcriptionReadiness(),
    mediaBackup: mediaBackupReadiness(),
    alerting: alertingReadiness(),
    connections: connectionCount,
    capacity: {
      current: connectionCount,
      max: MAX_CONNECTIONS,
      status: capacityStatus
    }
  });
});

// Safe database operations
async function safeDbOperation(operation, fallback = null) {
  if (!isMongoConnected || !Activity) {
    console.log('Database operation skipped - MongoDB not connected');
    return fallback;
  }
  
  try {
    return await operation();
  } catch (error) {
    console.error('Database operation failed:', error.message);
    return fallback;
  }
}

// Socket connection handling
io.on('connection', (socket) => {
  // Connection limit check
  if (connectionCount >= MAX_CONNECTIONS) {
    console.log(`❌ Connection rejected: at capacity (${connectionCount}/${MAX_CONNECTIONS})`);
    socket.emit('connection_rejected', {
      reason: 'capacity_full',
      message: 'Sorry! Server is at capacity. Please try again in a few minutes.'
    });
    socket.disconnect(true);
    return;
  }

  connectionCount++;
  console.log(`✅ User connected: ${socket.id} (Total: ${connectionCount}/${MAX_CONNECTIONS})`);
  connections.set(socket.id, { userId: null, activityIds: new Set() });
  
  // Capacity warning
  if (connectionCount >= SOFT_LIMIT) {
    socket.emit('capacity_warning', {
      message: 'High traffic detected - performance may be slower.'
    });
  }

  registerSpectrumHandlers(io, socket);
  registerOasHandlers(io, socket);
  registerSynthesisHandlers(io, socket);
  // Chorus visitors hold no account, so this room is joined without any
  // verified identity — correct here, because a memorial wall is public and
  // the room only ever carries what REST already serves to anyone.
  registerMemorialHandlers(io, socket);

  // Join user room for personal events (holon updates, notifications).
  //
  // The room name comes from the verified handshake, never from the payload:
  // this used to join whatever userId the client asked for, so any socket
  // could subscribe to another user's holon balance and notification bodies
  // by guessing an 8-character id. The argument is now ignored entirely.
  socket.on('join_user_room', () => {
    const userId = socket.data.userId;
    if (userId) socket.join(`user:${userId}`);
  });

  // Join activity
  socket.on('join_activity', async ({ activityId, userId, username }) => {
    console.log(`👋 User ${username} (${userId}) joining activity ${activityId}`);
    
    const connection = connections.get(socket.id);
    if (connection && connection.activityIds.has(activityId)) {
      console.log(`⚠️ User already in activity ${activityId}`);
      return;
    }
    
    // Update connection tracking
    if (connection) {
      connection.userId = userId;
      connection.activityIds.add(activityId);
    }
    
    // Add to activity participants
    if (!activities.has(activityId)) {
      activities.set(activityId, new Set());
    }
    activities.get(activityId).add(userId);
    
    socket.join(activityId);
    
    // Update database
    await safeDbOperation(async () => {
      const activity = await Activity.findOne({ id: activityId });
      if (activity) {
        await activity.addParticipant(userId, username);
        console.log(`💾 Added participant ${username} to database`);
      }
    });
    
    // Notify participants
    const participantIds = Array.from(activities.get(activityId) || []);
    io.to(activityId).emit('participant_joined', {
      participant: {
        id: userId,
        username: username,
        joinedAt: new Date()
      }
    });
    
    console.log(`📢 Notified ${participantIds.length} participants about join`);
  });

  // Leave activity — presence is in-memory only; membership stays in the DB
  socket.on('leave_activity', ({ activityId, userId }) => {
    console.log(`👋 User ${userId} leaving activity ${activityId}`);

    const connection = connections.get(socket.id);
    if (connection) {
      connection.activityIds.delete(activityId);
    }

    if (activities.has(activityId)) {
      activities.get(activityId).delete(userId);
      if (activities.get(activityId).size === 0) {
        activities.delete(activityId);
      }
    }

    socket.leave(activityId);

    io.to(activityId).emit('participant_left', {
      participantId: userId
    });
  });

  // Submit entry — thin wrapper over the same utils/entries funnel as REST
  socket.on('submit_entry', async ({ activityId, userId, position, objectName, text, slotNumber, questionId, instanceId }) => {
    try {
      if (instanceId) {
        const instance = await Instance.findOne({ id: instanceId });
        if (!instance || instance.isEnded()) {
          socket.emit('mutation_rejected', { reason: 'instance_ended', action: 'submit_entry' });
          return;
        }
      }

      console.log(`⭐ User ${userId} submitting entry for activity ${activityId} (slot ${slotNumber || 1})`);

      let entry = null;
      await safeDbOperation(async () => {
        const activity = await Activity.findOne({ id: activityId });
        if (activity && activity.status === 'active') {
          const participant = activity.participants.find(p => p.id === userId);
          if (participant) {
            entry = await entryUtils.upsertEntry({
              activity,
              instanceId: activity.instanceId || instanceId,
              userId,
              username: participant.username,
              slotNumber: slotNumber || 1,
              questionId: questionId || null,
              position: position ?? undefined,
              objectName,
              text: text != null ? String(text).trim() : undefined,
            });
          }
        }
      });

      if (entry) {
        io.to(activityId).emit('entry_upserted', { entry: entryUtils.toClient(entry) });
      }
    } catch (error) {
      console.error(`❌ Error submitting entry: ${error.message}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    connectionCount--;
    console.log(`❌ User disconnected: ${socket.id} (Total: ${connectionCount})`);
    
    const connection = connections.get(socket.id);
    if (connection && connection.userId) {
      const userId = connection.userId;
      
      // Update all activities this user was in — presence is in-memory only
      for (const activityId of connection.activityIds) {
        try {
          if (activities.has(activityId)) {
            activities.get(activityId).delete(userId);
            if (activities.get(activityId).size === 0) {
              activities.delete(activityId);
            }
          }

          io.to(activityId).emit('participant_left', {
            participantId: userId
          });

        } catch (error) {
          console.error(`❌ Error processing disconnect for activity ${activityId}:`, error.message);
        }
      }
    }
    
    connections.delete(socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Holoscopic server running on port ${PORT}`);
  console.log(`📊 MongoDB connected: ${isMongoConnected}`);
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
});

// Graceful shutdown. Render sends SIGTERM on every deploy and scale-down;
// SIGINT is the local Ctrl-C. Both must drain rather than hard-exit, or a
// holon transact() mid-flight is torn in half — utils/holons.js writes the
// balance and the ledger row as two separate operations.
//
// Registered at top level on purpose: this used to live inside
// `if (process.env.MONGODB_URI)`, so a misconfigured deploy had no handler
// at all.
const DRAIN_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — draining (${DRAIN_MS}ms max)`);

  // Fail health checks immediately so the load balancer stops sending work
  // while we finish what is already in flight.
  isMongoConnected = false;

  const force = setTimeout(() => {
    console.error('Drain timed out — forcing exit');
    process.exit(1);
  }, DRAIN_MS);
  force.unref();

  try {
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close(false);
      console.log('MongoDB connection closed');
    }
    // Flush before exit, or the error that caused the shutdown is the one
    // report you never receive.
    await observability.flush(2000);
    clearTimeout(force);
    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));