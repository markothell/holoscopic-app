#!/usr/bin/env node

/**
 * Load Testing Script for We All Explain
 * Tests both REST API endpoints and WebSocket connections
 */

const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Test parameters - conservative for 0.5 CPU, 512MB RAM server
const CONCURRENT_USERS = 25;
const TEST_DURATION_MS = 20000; // 20 seconds
const WEBSOCKET_TEST_DURATION_MS = 15000; // 15 seconds

let testResults = {
  api: {
    requests: 0,
    errors: 0,
    totalResponseTime: 0,
    minResponseTime: Infinity,
    maxResponseTime: 0
  },
  websocket: {
    connections: 0,
    connectionErrors: 0,
    messages: 0,
    messageErrors: 0
  }
};

async function testAPIEndpoint(endpoint, testName) {
  const startTime = Date.now();
  try {
    const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
      timeout: 10000
    });
    
    const responseTime = Date.now() - startTime;
    testResults.api.requests++;
    testResults.api.totalResponseTime += responseTime;
    testResults.api.minResponseTime = Math.min(testResults.api.minResponseTime, responseTime);
    testResults.api.maxResponseTime = Math.max(testResults.api.maxResponseTime, responseTime);
    
    console.log(`✅ ${testName}: ${responseTime}ms`);
    return response.data;
  } catch (error) {
    testResults.api.errors++;
    console.log(`❌ ${testName}: ${error.message}`);
    return null;
  }
}

async function runAPILoadTest() {
  console.log('\n🚀 Starting API Load Test...');
  console.log(`Testing ${CONCURRENT_USERS} concurrent users for ${TEST_DURATION_MS/1000}s\n`);
  
  const startTime = Date.now();
  const promises = [];
  
  // Create concurrent API requests
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    const userPromise = (async () => {
      let userRequests = 0;
      
      while (Date.now() - startTime < TEST_DURATION_MS) {
        // Test different endpoints
        const endpoints = [
          { path: '/api/activities', name: 'Activities List' },
          { path: '/api/analytics/stats', name: 'Platform Analytics' },
          { path: '/health', name: 'Health Check' }
        ];
        
        for (const endpoint of endpoints) {
          if (Date.now() - startTime < TEST_DURATION_MS) {
            await testAPIEndpoint(endpoint.path, `User ${i+1} - ${endpoint.name}`);
            userRequests++;
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }
      
      return userRequests;
    })();
    
    promises.push(userPromise);
  }
  
  await Promise.all(promises);
}

async function testWebSocketConnection(userId) {
  return new Promise((resolve) => {
    const socket = io(API_BASE_URL, {
      transports: ['websocket'],
      timeout: 5000
    });
    
    let connected = false;
    let messagesSent = 0;
    
    socket.on('connect', () => {
      connected = true;
      testResults.websocket.connections++;
      console.log(`✅ WebSocket User ${userId} connected`);
      
      // Simulate user joining an activity
      socket.emit('join-activity', {
        activityId: 'test-activity',
        userId: `test-user-${userId}`,
        username: `TestUser${userId}`
      });
      
      // Send periodic messages
      const messageInterval = setInterval(() => {
        if (messagesSent < 10) {
          socket.emit('submit-rating', {
            activityId: 'test-activity',
            userId: `test-user-${userId}`,
            rating: { x: Math.random(), y: Math.random() } // 0-1 range
          });
          messagesSent++;
        } else {
          clearInterval(messageInterval);
        }
      }, 1000);
      
      // Disconnect after test duration
      setTimeout(() => {
        socket.disconnect();
        resolve({ connected: true, messagesSent });
      }, WEBSOCKET_TEST_DURATION_MS);
    });
    
    socket.on('connect_error', (error) => {
      testResults.websocket.connectionErrors++;
      console.log(`❌ WebSocket User ${userId} connection failed: ${error.message}`);
      resolve({ connected: false, messagesSent: 0 });
    });
    
    socket.on('rating-submitted', () => {
      testResults.websocket.messages++;
    });
    
    socket.on('error', (error) => {
      testResults.websocket.messageErrors++;
      console.log(`❌ WebSocket User ${userId} message error: ${error}`);
    });
    
    // Timeout fallback
    setTimeout(() => {
      if (!connected) {
        testResults.websocket.connectionErrors++;
        socket.disconnect();
        resolve({ connected: false, messagesSent: 0 });
      }
    }, 5000);
  });
}

async function runWebSocketLoadTest() {
  console.log('\n🔌 Starting WebSocket Load Test...');
  console.log(`Testing ${CONCURRENT_USERS} concurrent WebSocket connections for ${WEBSOCKET_TEST_DURATION_MS/1000}s\n`);
  
  const promises = [];
  
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    promises.push(testWebSocketConnection(i + 1));
  }
  
  const results = await Promise.all(promises);
  
  // Calculate WebSocket stats
  const successfulConnections = results.filter(r => r.connected).length;
  const totalMessages = results.reduce((sum, r) => sum + r.messagesSent, 0);
  
  console.log(`\n📊 WebSocket Results:`);
  console.log(`Successful Connections: ${successfulConnections}/${CONCURRENT_USERS}`);
  console.log(`Total Messages Sent: ${totalMessages}`);
  console.log(`Connection Success Rate: ${(successfulConnections/CONCURRENT_USERS*100).toFixed(1)}%`);
}

async function printFinalResults() {
  console.log('\n' + '='.repeat(60));
  console.log('📈 FINAL LOAD TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`🌐 Server: ${API_BASE_URL}`);
  
  // API Results
  console.log('\n🌐 API Performance:');
  console.log(`Total Requests: ${testResults.api.requests}`);
  console.log(`Failed Requests: ${testResults.api.errors}`);
  console.log(`Success Rate: ${((testResults.api.requests - testResults.api.errors) / testResults.api.requests * 100).toFixed(1)}%`);
  
  if (testResults.api.requests > 0) {
    const avgResponseTime = testResults.api.totalResponseTime / testResults.api.requests;
    console.log(`Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`Min Response Time: ${testResults.api.minResponseTime}ms`);
    console.log(`Max Response Time: ${testResults.api.maxResponseTime}ms`);
    console.log(`Requests/Second: ${(testResults.api.requests / (TEST_DURATION_MS / 1000)).toFixed(1)}`);
  }
  
  // WebSocket Results
  console.log('\n🔌 WebSocket Performance:');
  console.log(`Successful Connections: ${testResults.websocket.connections}`);
  console.log(`Connection Errors: ${testResults.websocket.connectionErrors}`);
  console.log(`Messages Processed: ${testResults.websocket.messages}`);
  console.log(`Message Errors: ${testResults.websocket.messageErrors}`);
  
  // Performance Assessment
  console.log('\n🎯 Performance Assessment:');
  const apiSuccessRate = (testResults.api.requests - testResults.api.errors) / testResults.api.requests * 100;
  const wsSuccessRate = testResults.websocket.connections / CONCURRENT_USERS * 100;
  const avgResponseTime = testResults.api.totalResponseTime / testResults.api.requests;
  
  if (apiSuccessRate >= 99 && avgResponseTime < 500) {
    console.log('✅ API Performance: EXCELLENT');
  } else if (apiSuccessRate >= 95 && avgResponseTime < 1000) {
    console.log('🟡 API Performance: GOOD');
  } else {
    console.log('🔴 API Performance: NEEDS IMPROVEMENT');
  }
  
  if (wsSuccessRate >= 99) {
    console.log('✅ WebSocket Performance: EXCELLENT');
  } else if (wsSuccessRate >= 90) {
    console.log('🟡 WebSocket Performance: GOOD');
  } else {
    console.log('🔴 WebSocket Performance: NEEDS IMPROVEMENT');
  }
  
  console.log('\n' + '='.repeat(60));
}

async function monitorServerMemory() {
  console.log('\n📊 Monitoring server memory during test...\n');
  
  const memoryStats = [];
  const startTime = Date.now();
  
  const checkMemory = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 5000 });
      const timestamp = Date.now() - startTime;
      
      // Check if server is reporting memory (your local server logs it)
      if (response.data.memory) {
        memoryStats.push({
          timestamp: Math.floor(timestamp / 1000),
          memory: response.data.memory
        });
        console.log(`⏱️  ${Math.floor(timestamp/1000)}s - Memory: ${response.data.memory}`);
      }
    } catch (error) {
      // Silent fail - memory monitoring is optional
    }
  };
  
  // Check memory every 3 seconds during tests
  const interval = setInterval(checkMemory, 3000);
  
  // Stop monitoring after test duration + buffer
  setTimeout(() => {
    clearInterval(interval);
    
    if (memoryStats.length > 0) {
      console.log('\n📈 Memory Usage Summary:');
      const avgMemory = memoryStats.reduce((sum, stat) => sum + parseInt(stat.memory), 0) / memoryStats.length;
      const maxMemory = Math.max(...memoryStats.map(stat => parseInt(stat.memory)));
      const minMemory = Math.min(...memoryStats.map(stat => parseInt(stat.memory)));
      
      console.log(`Average Memory: ${Math.round(avgMemory)}MB`);
      console.log(`Peak Memory: ${maxMemory}MB`);
      console.log(`Min Memory: ${minMemory}MB`);
      console.log(`Memory Growth: ${maxMemory - minMemory}MB`);
    }
  }, TEST_DURATION_MS + WEBSOCKET_TEST_DURATION_MS + 5000);
  
  return interval;
}

async function main() {
  console.log('🧪 We All Explain Production Load Testing');
  console.log('==========================================');
  console.log(`🌐 Server: ${API_BASE_URL}`);
  console.log(`👥 Concurrent Users: ${CONCURRENT_USERS}`);
  console.log(`⏱️  Test Duration: ${TEST_DURATION_MS/1000}s API + ${WEBSOCKET_TEST_DURATION_MS/1000}s WebSocket`);
  
  try {
    // Start memory monitoring
    const memoryInterval = await monitorServerMemory();
    
    // Test API endpoints first
    await runAPILoadTest();
    
    // Then test WebSocket connections  
    await runWebSocketLoadTest();
    
    // Wait a bit for memory monitoring to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Print final results
    await printFinalResults();
    
  } catch (error) {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  }
}

// Run the load test
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, testAPIEndpoint, testWebSocketConnection };