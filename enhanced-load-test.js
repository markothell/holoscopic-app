#!/usr/bin/env node

/**
 * Enhanced Load Testing Script for Holoscopic
 * Tests all major routes under concurrent load
 */

const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS) || 25;
const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS) || 30000; // 30 seconds
const WEBSOCKET_TEST_DURATION_MS = parseInt(process.env.WEBSOCKET_TEST_DURATION_MS) || 20000; // 20 seconds

let testResults = {
  auth: {
    signup: { requests: 0, errors: 0, totalTime: 0 },
    login: { requests: 0, errors: 0, totalTime: 0 }
  },
  api: {
    activities: { requests: 0, errors: 0, totalTime: 0, minTime: Infinity, maxTime: 0 },
    sequences: { requests: 0, errors: 0, totalTime: 0, minTime: Infinity, maxTime: 0 },
    profiles: { requests: 0, errors: 0, totalTime: 0, minTime: Infinity, maxTime: 0 },
    analytics: { requests: 0, errors: 0, totalTime: 0, minTime: Infinity, maxTime: 0 },
    health: { requests: 0, errors: 0, totalTime: 0, minTime: Infinity, maxTime: 0 }
  },
  websocket: {
    connections: 0,
    connectionErrors: 0,
    joins: 0,
    ratings: 0,
    comments: 0,
    votes: 0,
    errors: 0
  },
  performance: {
    totalRequests: 0,
    totalErrors: 0,
    startTime: null,
    endTime: null
  }
};

// Helper to measure request time
async function measureRequest(category, subcategory, requestFn) {
  const startTime = Date.now();
  try {
    const result = await requestFn();
    const responseTime = Date.now() - startTime;

    if (testResults[category] && testResults[category][subcategory]) {
      testResults[category][subcategory].requests++;
      testResults[category][subcategory].totalTime += responseTime;

      if (testResults[category][subcategory].minTime !== undefined) {
        testResults[category][subcategory].minTime = Math.min(testResults[category][subcategory].minTime, responseTime);
        testResults[category][subcategory].maxTime = Math.max(testResults[category][subcategory].maxTime, responseTime);
      }
    }

    testResults.performance.totalRequests++;
    return { success: true, data: result, responseTime };
  } catch (error) {
    if (testResults[category] && testResults[category][subcategory]) {
      testResults[category][subcategory].errors++;
    }
    testResults.performance.totalErrors++;
    return { success: false, error: error.message, responseTime: Date.now() - startTime };
  }
}

/**
 * Test Authentication Endpoints
 */
async function testAuthEndpoints(userIndex) {
  const email = `loadtest${userIndex}_${Date.now()}@test.com`;
  const password = 'TestPass123!';

  // Test signup
  const signupResult = await measureRequest('auth', 'signup', async () => {
    return await axios.post(`${API_BASE_URL}/api/auth/signup`, {
      email,
      password,
      name: `Load Test User ${userIndex}`
    }, { timeout: 10000 });
  });

  if (!signupResult.success) {
    console.log(`⚠️  Signup failed for user ${userIndex}: ${signupResult.error}`);
    return null;
  }

  // Test login
  const loginResult = await measureRequest('auth', 'login', async () => {
    return await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email,
      password
    }, { timeout: 10000 });
  });

  if (!loginResult.success) {
    console.log(`⚠️  Login failed for user ${userIndex}: ${loginResult.error}`);
    return null;
  }

  return {
    userId: signupResult.data.user.id,
    userData: loginResult.data.user,
    email
  };
}

/**
 * Test API Endpoints
 */
async function testAPIEndpoints() {
  const endpoints = [
    { category: 'api', subcategory: 'activities', path: '/api/activities' },
    { category: 'api', subcategory: 'sequences', path: '/api/sequences/public' },
    { category: 'api', subcategory: 'analytics', path: '/api/analytics/stats' },
    { category: 'api', subcategory: 'health', path: '/health' }
  ];

  for (const endpoint of endpoints) {
    await measureRequest(endpoint.category, endpoint.subcategory, async () => {
      return await axios.get(`${API_BASE_URL}${endpoint.path}`, { timeout: 10000 });
    });

    // Small delay between different endpoint types
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * Test Profile Endpoints
 */
async function testProfileEndpoints(userId) {
  if (!userId) return;

  // Get profile
  await measureRequest('api', 'profiles', async () => {
    return await axios.get(`${API_BASE_URL}/api/users/${userId}`, { timeout: 10000 });
  });

  // Update profile
  await measureRequest('api', 'profiles', async () => {
    return await axios.post(`${API_BASE_URL}/api/users/update-profile`, {
      userId,
      displayName: `Load Test User ${userId.substring(0, 8)}`,
      bio: 'Testing profile updates under load'
    }, { timeout: 10000 });
  });
}

/**
 * Test WebSocket Connection and Activity Participation
 */
async function testWebSocketActivity(userId, activityId, slotNumber = 1) {
  return new Promise((resolve) => {
    const socket = io(API_BASE_URL, {
      transports: ['websocket'],
      timeout: 5000
    });

    let connected = false;
    let actionsCompleted = 0;

    const timeout = setTimeout(() => {
      if (!connected) {
        testResults.websocket.connectionErrors++;
      }
      socket.disconnect();
      resolve({ connected, actionsCompleted });
    }, WEBSOCKET_TEST_DURATION_MS);

    socket.on('connect', () => {
      connected = true;
      testResults.websocket.connections++;

      // Join activity
      socket.emit('join_activity', {
        activityId,
        userId,
        username: `LoadTestUser_${userId.substring(0, 8)}`
      });
    });

    socket.on('participant_joined', (data) => {
      if (data.participant && data.participant.id === userId) {
        testResults.websocket.joins++;
        actionsCompleted++;

        // Submit rating
        socket.emit('submit_rating', {
          activityId,
          userId,
          position: { x: Math.random() * 100, y: Math.random() * 100 },
          slotNumber,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('rating_added', (data) => {
      if (data.rating && data.rating.userId === userId) {
        testResults.websocket.ratings++;
        actionsCompleted++;

        // Submit comment
        socket.emit('submit_comment', {
          activityId,
          userId,
          text: `Load test comment slot ${slotNumber}`,
          slotNumber,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('comment_added', (data) => {
      if (data.comment && data.comment.userId === userId) {
        testResults.websocket.comments++;
        actionsCompleted++;

        // Disconnect after successful flow
        clearTimeout(timeout);
        socket.disconnect();
        resolve({ connected: true, actionsCompleted });
      }
    });

    socket.on('connect_error', () => {
      testResults.websocket.connectionErrors++;
      clearTimeout(timeout);
      socket.disconnect();
      resolve({ connected: false, actionsCompleted });
    });

    socket.on('error', () => {
      testResults.websocket.errors++;
    });
  });
}

/**
 * Run concurrent API load test
 */
async function runAPILoadTest() {
  console.log('\n🚀 Starting API Load Test...');
  console.log(`Testing ${CONCURRENT_USERS} concurrent users for ${TEST_DURATION_MS/1000}s\n`);

  testResults.performance.startTime = Date.now();
  const promises = [];

  for (let i = 0; i < CONCURRENT_USERS; i++) {
    const userPromise = (async () => {
      const startTime = Date.now();
      let user = null;

      // Create and login user
      user = await testAuthEndpoints(i);

      // Continuously test endpoints until duration expires
      while (Date.now() - startTime < TEST_DURATION_MS) {
        await testAPIEndpoints();

        if (user && user.userId) {
          await testProfileEndpoints(user.userId);
        }

        // Small delay between request cycles
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      return user;
    })();

    promises.push(userPromise);

    // Stagger user creation slightly to avoid thundering herd
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const users = await Promise.all(promises);
  testResults.performance.endTime = Date.now();

  console.log(`✅ API Load Test completed`);
  console.log(`   Created ${users.filter(u => u !== null).length}/${CONCURRENT_USERS} test users\n`);

  return users.filter(u => u !== null);
}

/**
 * Run concurrent WebSocket load test
 */
async function runWebSocketLoadTest(users, activityId) {
  console.log('\n🔌 Starting WebSocket Load Test...');
  console.log(`Testing ${users.length} concurrent WebSocket connections for ${WEBSOCKET_TEST_DURATION_MS/1000}s\n`);

  const promises = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    // Test with different slot numbers for multi-entry testing
    const slotNumber = (i % 4) + 1;

    promises.push(testWebSocketActivity(user.userId, activityId, slotNumber));

    // Stagger connections
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const results = await Promise.all(promises);

  const successfulConnections = results.filter(r => r.connected).length;
  const totalActions = results.reduce((sum, r) => sum + r.actionsCompleted, 0);

  console.log(`✅ WebSocket Load Test completed`);
  console.log(`   Successful connections: ${successfulConnections}/${users.length}`);
  console.log(`   Total actions: ${totalActions}\n`);
}

/**
 * Print comprehensive results
 */
function printResults() {
  console.log('\n' + '='.repeat(80));
  console.log('📈 ENHANCED LOAD TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`🌐 Server: ${API_BASE_URL}`);
  console.log(`👥 Concurrent Users: ${CONCURRENT_USERS}`);

  const duration = (testResults.performance.endTime - testResults.performance.startTime) / 1000;
  console.log(`⏱️  Total Duration: ${duration.toFixed(1)}s`);

  // Authentication Results
  console.log('\n📝 AUTHENTICATION:');
  console.log(`  Signups: ${testResults.auth.signup.requests} (${testResults.auth.signup.errors} errors)`);
  if (testResults.auth.signup.requests > 0) {
    console.log(`  Avg Signup Time: ${(testResults.auth.signup.totalTime / testResults.auth.signup.requests).toFixed(0)}ms`);
  }
  console.log(`  Logins: ${testResults.auth.login.requests} (${testResults.auth.login.errors} errors)`);
  if (testResults.auth.login.requests > 0) {
    console.log(`  Avg Login Time: ${(testResults.auth.login.totalTime / testResults.auth.login.requests).toFixed(0)}ms`);
  }

  // API Results
  console.log('\n🌐 API ENDPOINTS:');
  for (const [endpoint, stats] of Object.entries(testResults.api)) {
    if (stats.requests > 0) {
      const avgTime = (stats.totalTime / stats.requests).toFixed(0);
      const successRate = ((stats.requests - stats.errors) / stats.requests * 100).toFixed(1);
      console.log(`  ${endpoint}:`);
      console.log(`    Requests: ${stats.requests} (${stats.errors} errors, ${successRate}% success)`);
      console.log(`    Response Time: ${avgTime}ms avg, ${stats.minTime}ms min, ${stats.maxTime}ms max`);
    }
  }

  // WebSocket Results
  console.log('\n🔌 WEBSOCKET:');
  console.log(`  Connections: ${testResults.websocket.connections} (${testResults.websocket.connectionErrors} errors)`);
  console.log(`  Activity Joins: ${testResults.websocket.joins}`);
  console.log(`  Ratings Submitted: ${testResults.websocket.ratings}`);
  console.log(`  Comments Submitted: ${testResults.websocket.comments}`);
  console.log(`  Votes Cast: ${testResults.websocket.votes}`);
  console.log(`  Errors: ${testResults.websocket.errors}`);

  // Overall Performance
  console.log('\n📊 OVERALL PERFORMANCE:');
  console.log(`  Total Requests: ${testResults.performance.totalRequests}`);
  console.log(`  Total Errors: ${testResults.performance.totalErrors}`);
  console.log(`  Success Rate: ${((testResults.performance.totalRequests - testResults.performance.totalErrors) / testResults.performance.totalRequests * 100).toFixed(1)}%`);
  console.log(`  Requests/Second: ${(testResults.performance.totalRequests / duration).toFixed(1)}`);

  // Performance Assessment
  console.log('\n🎯 ASSESSMENT:');
  const overallSuccessRate = (testResults.performance.totalRequests - testResults.performance.totalErrors) / testResults.performance.totalRequests * 100;
  const avgApiTime = Object.values(testResults.api)
    .filter(s => s.requests > 0)
    .reduce((sum, s) => sum + (s.totalTime / s.requests), 0) / Object.values(testResults.api).filter(s => s.requests > 0).length;

  if (overallSuccessRate >= 99 && avgApiTime < 500) {
    console.log('  ✅ EXCELLENT - System performing optimally');
  } else if (overallSuccessRate >= 95 && avgApiTime < 1000) {
    console.log('  🟡 GOOD - System performing adequately');
  } else if (overallSuccessRate >= 90 && avgApiTime < 2000) {
    console.log('  🟠 FAIR - System showing some strain');
  } else {
    console.log('  🔴 POOR - System needs optimization');
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Monitor server health during test
 */
async function monitorServerHealth() {
  console.log('📊 Monitoring server health...\n');

  const healthChecks = [];
  const interval = setInterval(async () => {
    try {
      const start = Date.now();
      const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 5000 });
      const responseTime = Date.now() - start;

      healthChecks.push({
        timestamp: Date.now(),
        status: response.data.status,
        mongodb: response.data.mongodb,
        connections: response.data.connections,
        capacity: response.data.capacity,
        responseTime
      });

      console.log(`⏱️  Health Check: ${response.data.status}, Connections: ${response.data.connections}/${response.data.capacity?.max || 'N/A'}, ${responseTime}ms`);
    } catch (error) {
      console.log(`❌ Health check failed: ${error.message}`);
    }
  }, 5000);

  return { interval, healthChecks };
}

/**
 * Main test execution
 */
async function main() {
  console.log('🧪 HOLOSCOPIC ENHANCED LOAD TESTING');
  console.log('=' .repeat(80));
  console.log(`🌐 Server: ${API_BASE_URL}`);
  console.log(`👥 Concurrent Users: ${CONCURRENT_USERS}`);
  console.log(`⏱️  API Test Duration: ${TEST_DURATION_MS/1000}s`);
  console.log(`⏱️  WebSocket Test Duration: ${WEBSOCKET_TEST_DURATION_MS/1000}s`);
  console.log('=' .repeat(80));

  try {
    // Start health monitoring
    const healthMonitor = await monitorServerHealth();

    // Run API load test
    const users = await runAPILoadTest();

    // Get a test activity for WebSocket testing
    console.log('🔍 Finding test activity for WebSocket tests...');
    let testActivity = null;
    try {
      const activitiesResponse = await axios.get(`${API_BASE_URL}/api/activities`);
      if (activitiesResponse.data.success && activitiesResponse.data.data.activities.length > 0) {
        testActivity = activitiesResponse.data.data.activities[0];
        console.log(`✅ Using activity: ${testActivity.title} (ID: ${testActivity.id})\n`);
      }
    } catch (error) {
      console.log(`⚠️  Could not fetch activities: ${error.message}\n`);
    }

    // Run WebSocket load test
    if (testActivity && users.length > 0) {
      await runWebSocketLoadTest(users, testActivity.id);
    } else {
      console.log('⚠️  Skipping WebSocket tests - no activity or users available\n');
    }

    // Stop health monitoring
    clearInterval(healthMonitor.interval);

    // Wait a moment for any pending operations
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Print results
    printResults();

    console.log('✅ Load testing completed successfully\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, testAuthEndpoints, testAPIEndpoints, testWebSocketActivity };
