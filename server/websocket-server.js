// websocket-server.js - Adapted for We All Explain
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });

console.log('🔧 NODE_ENV:', process.env.NODE_ENV);
console.log('🧪 Loaded Mongo URI:', process.env.MONGODB_URI);

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
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(bodyParser.json());

// Rate limiting for API endpoints (not admin)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for admin endpoints and health checks
    return req.path.includes('/admin') || req.path === '/health';
  }
});

// WebSocket connection limiting
const wsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute  
  max: 30, // 30 connections per minute per IP
  message: {
    error: 'Too many WebSocket connections from this IP, please try again later.'
  },
  skip: (req) => {
    // Only apply to socket.io requests
    return !req.path.includes('/socket.io/');
  }
});

app.use('/api', apiLimiter);
app.use('/socket.io', wsLimiter);

// Create server
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true
  }
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
      app.use('/api/activities', activityRoutes);
      app.use('/api/analytics', analyticsRoutes);
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
  
  process.on('SIGINT', async () => {
    try {
      if (isMongoConnected) {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
      }
      process.exit(0);
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
      process.exit(1);
    }
  });
}

// Health check
app.get('/health', (req, res) => {
  const capacityStatus = connectionCount >= MAX_CONNECTIONS ? 'full' : 
                        connectionCount >= SOFT_LIMIT ? 'high' : 'normal';
  
  res.json({ 
    status: 'ok', 
    message: 'We All Explain WebSocket server is running',
    mongodb: isMongoConnected ? 'connected' : 'disconnected',
    connections: connectionCount,
    capacity: {
      current: connectionCount,
      max: MAX_CONNECTIONS,
      status: capacityStatus
    },
    apiRoutesLoaded: apiRoutesLoaded
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
      const activity = await Activity.findById(activityId);
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
        isConnected: true,
        hasSubmitted: false,
        joinedAt: new Date()
      }
    });
    
    console.log(`📢 Notified ${participantIds.length} participants about join`);
  });

  // Leave activity
  socket.on('leave_activity', async ({ activityId, userId }) => {
    const operationKey = `leave_${activityId}_${userId}`;
    if (operationsInProgress.has(operationKey)) {
      return;
    }
    
    operationsInProgress.add(operationKey);
    
    try {
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
      
      // Update database
      await safeDbOperation(async () => {
        const activity = await Activity.findById(activityId);
        if (activity) {
          await activity.updateParticipantConnection(userId, false);
        }
      });
      
      // Notify participants
      io.to(activityId).emit('participant_left', {
        participantId: userId
      });
      
    } catch (error) {
      console.error(`❌ Error in leave_activity: ${error.message}`);
    } finally {
      operationsInProgress.delete(operationKey);
    }
  });

  // Submit rating
  socket.on('submit_rating', async ({ activityId, userId, position, timestamp }) => {
    try {
      console.log(`⭐ User ${userId} submitting rating for activity ${activityId}`);
      
      // Update database
      let newRating = null;
      await safeDbOperation(async () => {
        const activity = await Activity.findById(activityId);
        if (activity) {
          const participant = activity.participants.find(p => p.id === userId);
          if (participant) {
            await activity.addRating(userId, participant.username, position);
            newRating = activity.ratings.find(r => r.userId === userId);
            console.log(`💾 Rating saved to database for user ${userId}`);
          }
        }
      });
      
      // Broadcast to activity participants
      if (newRating) {
        io.to(activityId).emit('rating_added', {
          rating: newRating
        });
        console.log(`📢 Rating broadcast to activity ${activityId}`);
      }
      
    } catch (error) {
      console.error(`❌ Error submitting rating: ${error.message}`);
    }
  });

  // Submit comment
  socket.on('submit_comment', async ({ activityId, userId, text, timestamp }) => {
    try {
      console.log(`💬 User ${userId} submitting comment for activity ${activityId}`);
      
      // Update database
      let newComment = null;
      await safeDbOperation(async () => {
        const activity = await Activity.findById(activityId);
        if (activity) {
          const participant = activity.participants.find(p => p.id === userId);
          if (participant) {
            await activity.addComment(userId, participant.username, text);
            newComment = activity.comments.find(c => c.userId === userId);
            console.log(`💾 Comment saved to database for user ${userId}`);
          }
        }
      });
      
      // Broadcast to activity participants
      if (newComment) {
        io.to(activityId).emit('comment_added', {
          comment: newComment
        });
        console.log(`📢 Comment broadcast to activity ${activityId}`);
      }
      
    } catch (error) {
      console.error(`❌ Error submitting comment: ${error.message}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    connectionCount--;
    console.log(`❌ User disconnected: ${socket.id} (Total: ${connectionCount})`);
    
    const connection = connections.get(socket.id);
    if (connection && connection.userId) {
      const userId = connection.userId;
      
      // Update all activities this user was in
      for (const activityId of connection.activityIds) {
        try {
          if (activities.has(activityId)) {
            activities.get(activityId).delete(userId);
            if (activities.get(activityId).size === 0) {
              activities.delete(activityId);
            }
          }
          
          // Update database
          await safeDbOperation(async () => {
            const activity = await Activity.findById(activityId);
            if (activity) {
              await activity.updateParticipantConnection(userId, false);
            }
          });
          
          // Notify participants
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
  console.log(`🚀 We All Explain WebSocket server running on port ${PORT}`);
  console.log(`📊 MongoDB connected: ${isMongoConnected}`);
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
});