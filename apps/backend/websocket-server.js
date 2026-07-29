// websocket-server.js - Adapted for We All Explain
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });

console.log('🔧 NODE_ENV:', process.env.NODE_ENV);
// The URI is never logged — it carries the cluster password. Presence is
// logged below, and the database name is extracted at connect time.

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

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

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, '');
    const normalizedAllowed = allowedOrigins.map(url => url.replace(/\/$/, ''));
    
    if (normalizedAllowed.indexOf(normalizedOrigin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
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
    // Only health checks and local development bypass the limiter.
    //
    // This used to also skip `req.path.includes('/admin')`. That matched any
    // path *containing* the substring anywhere — so the bypass was selectable
    // by the caller, on unauthenticated routes, e.g. /activities/admin.
    // Admin routes get their own generous bucket below instead.
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
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

// Chorus memorial writes. Every other router requires a holoscopic account, so
// the global apiLimiter is backstopped by auth; this one is not — anyone with
// the link can post. Reads are skipped so browsing a memorial (which is most
// of the traffic, and often a whole family on one household IP) is never
// throttled by somebody else's contribution.
const memorialWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProduction ? 10 : 1000,
  message: {
    error: 'That is a lot of memories at once. Try again in a little while.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (req.method === 'GET' || req.method === 'OPTIONS') return true;
    // /session is minted once per browser on first visit and must never be
    // the thing that runs out — it's a prerequisite for posting at all.
    if (req.path === '/session') return true;
    // Deepgram's transcript callbacks all arrive from a handful of their IPs;
    // a per-IP contribution budget would throttle them the moment a memorial
    // gets busy.
    if (req.path.startsWith('/hooks/')) return true;
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    return isDevelopment && isLocalhost;
  }
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
// M3 — the collective LLM's embedding-index refresh hooks. Injected here so the
// funnel stays decoupled; the hooks no-op when the LLM is unconfigured, so this
// never blocks route loading or writes.
require('./utils/synNodes').setIndex(require('./utils/synIndexHooks'));
const { registerSpectrumHandlers } = require('./sockets/spectrum');
const { registerOasHandlers } = require('./sockets/oas');
const { registerSynthesisHandlers } = require('./sockets/synthesis');

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
  
  if (global.gc && Math.random() < 0.1) {
    global.gc();
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
      app.use('/api/memorial', memorialWriteLimiter, memorialRoutes);
      apiRoutesLoaded = true;
      console.log('✅ API routes loaded successfully');
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
    serverSelectionTimeoutMS: 5000,
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
const { isAuthConfigured } = require('./middleware/verifyUser');

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