#!/usr/bin/env node

/**
 * Interactive Route Testing Script for Holoscopic
 * Simulates real user journeys through the application
 */

const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Test user data
let testUsers = [];
let testActivity = null;
let testSequence = null;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 1. Test User Registration and Login Flow
 */
async function testAuthFlow(userIndex) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST 1: User Registration and Login Flow (User ${userIndex})`, 'cyan');
  log('='.repeat(60), 'cyan');

  const testEmail = `testuser${userIndex}@holoscopic.test`;
  const testPassword = 'TestPassword123!';
  const testName = `Test User ${userIndex}`;

  try {
    // Step 1: Register new user
    log('\n📝 Step 1: Registering new user...', 'yellow');
    const signupResponse = await axios.post(`${API_BASE_URL}/api/auth/signup`, {
      email: testEmail,
      password: testPassword,
      name: testName
    }, { timeout: 10000 });

    if (signupResponse.data.success) {
      log(`✅ User registered successfully: ${testEmail}`, 'green');
      log(`   User ID: ${signupResponse.data.user.id}`, 'blue');
    }

    // Step 2: Login with credentials
    log('\n🔐 Step 2: Logging in...', 'yellow');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email: testEmail,
      password: testPassword
    }, { timeout: 10000 });

    if (loginResponse.data.success) {
      log(`✅ Login successful`, 'green');
      log(`   User data received: ${loginResponse.data.user ? 'Yes' : 'No'}`, 'blue');

      return {
        userId: signupResponse.data.user.id,
        email: testEmail,
        name: testName,
        userData: loginResponse.data.user
      };
    }
  } catch (error) {
    if (error.response && (error.response.status === 409 || error.response.status === 400)) {
      // User already exists, try logging in
      log(`⚠️  User already exists, attempting login...`, 'yellow');
      try {
        const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
          email: testEmail,
          password: testPassword
        });

        if (loginResponse.data.success) {
          log(`✅ Login successful with existing user`, 'green');
          return {
            userId: loginResponse.data.user.id,
            email: testEmail,
            name: testName,
            userData: loginResponse.data.user
          };
        }
      } catch (loginError) {
        log(`❌ Login failed: ${loginError.message}`, 'red');
      }
    } else {
      log(`❌ Auth flow failed: ${error.message}`, 'red');
    }
  }

  return null;
}

/**
 * 2. Test User Profile Management
 */
async function testProfileFlow(user) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST 2: User Profile Management (${user.name})`, 'cyan');
  log('='.repeat(60), 'cyan');

  try {
    // Step 1: Update profile with bio and display name
    log('\n✏️  Step 1: Updating profile...', 'yellow');
    const updateResponse = await axios.post(`${API_BASE_URL}/api/users/update-profile`, {
      userId: user.userId,
      displayName: `${user.name} Updated`,
      bio: 'This is a test bio for load testing purposes.'
    }, { timeout: 10000 });

    if (updateResponse.data.success) {
      log(`✅ Profile updated successfully`, 'green');
    }

    // Step 2: Retrieve profile
    log('\n👤 Step 2: Fetching profile...', 'yellow');
    const profileResponse = await axios.get(`${API_BASE_URL}/api/users/${user.userId}`, {
      timeout: 10000
    });

    if (profileResponse.data.success) {
      log(`✅ Profile retrieved successfully`, 'green');
      log(`   Display Name: ${profileResponse.data.user.displayName}`, 'blue');
      log(`   Bio: ${profileResponse.data.user.bio}`, 'blue');
    }

    return true;
  } catch (error) {
    log(`❌ Profile flow failed: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 2b. Test User Settings Management
 */
async function testUserSettings(user) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST 2b: User Settings Management (${user.name})`, 'cyan');
  log('='.repeat(60), 'cyan');

  try {
    // Step 1: Get current user settings
    log('\n📋 Step 1: Fetching user settings...', 'yellow');
    const getResponse = await axios.get(`${API_BASE_URL}/api/users/${user.userId}/settings`, {
      timeout: 10000
    });

    if (getResponse.data) {
      log(`✅ Settings retrieved successfully`, 'green');
      log(`   Name: ${getResponse.data.name || 'Not set'}`, 'blue');
      log(`   Email: ${getResponse.data.email}`, 'blue');
      log(`   Notify New Activities: ${getResponse.data.notifications?.newActivities ?? true}`, 'blue');
      log(`   Notify Enrolled Activities: ${getResponse.data.notifications?.enrolledActivities ?? true}`, 'blue');
    }

    // Step 2: Update settings with new values
    log('\n✏️  Step 2: Updating user settings...', 'yellow');
    const updateResponse = await axios.put(`${API_BASE_URL}/api/users/${user.userId}/settings`, {
      name: `${user.name} Updated`,
      notifications: {
        newActivities: false,
        enrolledActivities: true
      }
    }, { timeout: 10000 });

    if (updateResponse.data) {
      log(`✅ Settings updated successfully`, 'green');
      log(`   Updated Name: ${updateResponse.data.name}`, 'blue');
      log(`   New Activities Notifications: ${updateResponse.data.notifications.newActivities}`, 'blue');
      log(`   Enrolled Activities Notifications: ${updateResponse.data.notifications.enrolledActivities}`, 'blue');
    }

    // Step 3: Verify changes persisted
    log('\n🔍 Step 3: Verifying settings were saved...', 'yellow');
    const verifyResponse = await axios.get(`${API_BASE_URL}/api/users/${user.userId}/settings`, {
      timeout: 10000
    });

    if (verifyResponse.data.name === `${user.name} Updated` &&
        verifyResponse.data.notifications.newActivities === false) {
      log(`✅ Settings verified - changes persisted correctly`, 'green');
      return true;
    } else {
      log(`❌ Settings verification failed - changes did not persist`, 'red');
      return false;
    }

  } catch (error) {
    log(`❌ User settings test failed: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Error: ${JSON.stringify(error.response.data)}`, 'red');
    }
    return false;
  }
}

/**
 * 3. Test Activity Participation Flow
 */
async function testActivityParticipation(user, activityId, slotNumber = 1) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST 3: Activity Participation (${user.name}, Slot ${slotNumber})`, 'cyan');
  log('='.repeat(60), 'cyan');

  return new Promise((resolve) => {
    try {
      // Connect to WebSocket
      log('\n🔌 Step 1: Connecting to WebSocket...', 'yellow');
      const socket = io(API_BASE_URL, {
        transports: ['websocket'],
        timeout: 5000
      });

      let steps = {
        connected: false,
        joined: false,
        ratingSubmitted: false,
        commentSubmitted: false
      };

      socket.on('connect', () => {
        steps.connected = true;
        log(`✅ WebSocket connected`, 'green');

        // Step 2: Join activity
        log('\n👋 Step 2: Joining activity...', 'yellow');
        socket.emit('join_activity', {
          activityId: activityId,
          userId: user.userId,
          username: user.name
        });
      });

      socket.on('participant_joined', (data) => {
        if (data.participant && data.participant.id === user.userId) {
          steps.joined = true;
          log(`✅ Joined activity successfully`, 'green');

          // Step 3: Submit rating (slider positions)
          log('\n⭐ Step 3: Submitting rating...', 'yellow');
          socket.emit('submit_rating', {
            activityId: activityId,
            userId: user.userId,
            position: {
              x: Math.random() * 100,
              y: Math.random() * 100
            },
            slotNumber: slotNumber,
            timestamp: new Date().toISOString()
          });
        }
      });

      socket.on('rating_added', (data) => {
        if (data.rating && data.rating.userId === user.userId && data.rating.slotNumber === slotNumber) {
          steps.ratingSubmitted = true;
          log(`✅ Rating submitted successfully`, 'green');
          log(`   Position: (${data.rating.position.x.toFixed(1)}, ${data.rating.position.y.toFixed(1)})`, 'blue');

          // Step 4: Submit comment
          log('\n💬 Step 4: Submitting comment...', 'yellow');
          socket.emit('submit_comment', {
            activityId: activityId,
            userId: user.userId,
            text: `Test comment from ${user.name} for slot ${slotNumber}`,
            slotNumber: slotNumber,
            timestamp: new Date().toISOString()
          });
        }
      });

      socket.on('comment_added', (data) => {
        if (data.comment && data.comment.userId === user.userId && data.comment.slotNumber === slotNumber) {
          steps.commentSubmitted = true;
          log(`✅ Comment submitted successfully`, 'green');
          log(`   Comment: "${data.comment.text}"`, 'blue');

          // Step 5: Leave activity
          log('\n👋 Step 5: Leaving activity...', 'yellow');
          socket.emit('leave_activity', {
            activityId: activityId,
            userId: user.userId
          });

          setTimeout(() => {
            socket.disconnect();
            log(`✅ Disconnected from activity`, 'green');
            resolve(steps);
          }, 1000);
        }
      });

      socket.on('connect_error', (error) => {
        log(`❌ WebSocket connection error: ${error.message}`, 'red');
        socket.disconnect();
        resolve(steps);
      });

      socket.on('error', (error) => {
        log(`❌ WebSocket error: ${error}`, 'red');
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (!steps.commentSubmitted) {
          log(`⏱️  Test timed out`, 'yellow');
          socket.disconnect();
          resolve(steps);
        }
      }, 15000);

    } catch (error) {
      log(`❌ Activity participation test failed: ${error.message}`, 'red');
      resolve({ connected: false, joined: false, ratingSubmitted: false, commentSubmitted: false });
    }
  });
}

/**
 * 4. Test Multi-Entry Slots
 */
async function testMultiEntrySlots(user, activityId) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST 4: Multi-Entry Slots (${user.name})`, 'cyan');
  log('='.repeat(60), 'cyan');

  const numSlots = 4;
  const results = [];

  for (let slot = 1; slot <= numSlots; slot++) {
    log(`\n📊 Testing slot ${slot}/${numSlots}...`, 'yellow');
    const result = await testActivityParticipation(user, activityId, slot);
    results.push(result);

    // Small delay between slots
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const successfulSlots = results.filter(r => r.commentSubmitted).length;
  log(`\n✅ Successfully completed ${successfulSlots}/${numSlots} slots`, 'green');

  return results;
}

/**
 * 5. Test Sequence Enrollment and Participation
 */
async function testSequenceFlow(user, sequenceUrlName) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST 5: Sequence Enrollment and Participation (${user.name})`, 'cyan');
  log('='.repeat(60), 'cyan');

  try {
    // Step 1: Get sequence details
    log('\n📋 Step 1: Fetching sequence details...', 'yellow');
    const sequenceResponse = await axios.get(`${API_BASE_URL}/api/sequences/by-url/${sequenceUrlName}`, {
      timeout: 10000
    });

    if (!sequenceResponse.data) {
      log(`❌ Sequence not found`, 'red');
      return false;
    }

    const sequence = sequenceResponse.data;
    log(`✅ Sequence found: ${sequence.title}`, 'green');
    log(`   Activities: ${sequence.activities.length}`, 'blue');

    // Step 2: Enroll in sequence
    log('\n✍️  Step 2: Enrolling in sequence...', 'yellow');
    const enrollResponse = await axios.post(`${API_BASE_URL}/api/sequences/${sequence.id}/enroll`, {
      userId: user.userId,
      displayName: user.name
    }, { timeout: 10000 });

    if (enrollResponse.data.success) {
      log(`✅ Enrolled in sequence successfully`, 'green');
    }

    // Step 3: Fetch user's sequences
    log('\n📚 Step 3: Fetching user sequences...', 'yellow');
    const userSequencesResponse = await axios.get(`${API_BASE_URL}/api/sequences/user/${user.userId}`, {
      timeout: 10000
    });

    const enrolledSequences = userSequencesResponse.data;
    const isEnrolled = enrolledSequences.some(s => s.id === sequence.id);

    if (isEnrolled) {
      log(`✅ User is enrolled in sequence`, 'green');
      log(`   Total sequences: ${enrolledSequences.length}`, 'blue');
    }

    return true;
  } catch (error) {
    if (error.response && error.response.status === 409) {
      log(`⚠️  User already enrolled in sequence`, 'yellow');
      return true;
    }
    log(`❌ Sequence flow failed: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 6. Test Voting System
 */
async function testVotingSystem(user, activityId, targetUserId) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST 6: Voting System (${user.name})`, 'cyan');
  log('='.repeat(60), 'cyan');

  try {
    // Step 1: Get activity to check vote limits
    log('\n📊 Step 1: Checking vote limits...', 'yellow');
    const activityResponse = await axios.get(`${API_BASE_URL}/api/activities/by-url/${activityId}`, {
      timeout: 10000
    });

    const activity = activityResponse.data.data;
    log(`✅ Vote limit: ${activity.votesPerUser || 'Unlimited'}`, 'green');

    // Step 2: Submit vote
    log('\n👍 Step 2: Submitting vote...', 'yellow');
    const voteResponse = await axios.post(`${API_BASE_URL}/api/activities/${activityId}/vote`, {
      userId: user.userId,
      targetUserId: targetUserId,
      slotNumber: 1
    }, { timeout: 10000 });

    if (voteResponse.data.success) {
      log(`✅ Vote submitted successfully`, 'green');
    }

    // Step 3: Check remaining votes
    log('\n📈 Step 3: Checking remaining votes...', 'yellow');
    const votesResponse = await axios.get(`${API_BASE_URL}/api/activities/${activityId}/votes/${user.userId}`, {
      timeout: 10000
    });

    if (votesResponse.data) {
      log(`✅ Votes used: ${votesResponse.data.votesUsed}/${votesResponse.data.votesPerUser || '∞'}`, 'green');
    }

    return true;
  } catch (error) {
    log(`❌ Voting system test failed: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Run all tests sequentially
 */
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  log('🧪 HOLOSCOPIC INTERACTIVE ROUTE TESTING', 'cyan');
  console.log('='.repeat(60));
  log(`🌐 Server: ${API_BASE_URL}`, 'blue');
  log(`⏰ Started: ${new Date().toLocaleString()}`, 'blue');

  const results = {
    auth: 0,
    profile: 0,
    settings: 0,
    activity: 0,
    multiEntry: 0,
    sequence: 0,
    voting: 0
  };

  try {
    // Create 3 test users
    log('\n📝 Creating test users...', 'yellow');
    for (let i = 1; i <= 3; i++) {
      const user = await testAuthFlow(i);
      if (user) {
        testUsers.push(user);
        results.auth++;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (testUsers.length === 0) {
      log('\n❌ No users created, cannot continue tests', 'red');
      return;
    }

    log(`\n✅ Created ${testUsers.length} test users`, 'green');

    // Test profile management for first user
    if (testUsers[0]) {
      const profileSuccess = await testProfileFlow(testUsers[0]);
      if (profileSuccess) results.profile++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Test user settings for first user
    if (testUsers[0]) {
      const settingsSuccess = await testUserSettings(testUsers[0]);
      if (settingsSuccess) results.settings++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Get a test activity
    log('\n🔍 Finding a test activity...', 'yellow');
    try {
      const activitiesResponse = await axios.get(`${API_BASE_URL}/api/activities`);
      if (activitiesResponse.data.success && activitiesResponse.data.data.activities.length > 0) {
        testActivity = activitiesResponse.data.data.activities[0];
        log(`✅ Using activity: ${testActivity.title}`, 'green');
        log(`   Activity ID: ${testActivity.id}`, 'blue');
        log(`   Max Entries: ${testActivity.maxEntries || 1}`, 'blue');
      } else {
        log(`⚠️  No activities found, skipping activity tests`, 'yellow');
      }
    } catch (error) {
      log(`⚠️  Could not fetch activities: ${error.message}`, 'yellow');
    }

    // Test activity participation for each user
    if (testActivity) {
      for (let i = 0; i < testUsers.length; i++) {
        const participationSteps = await testActivityParticipation(testUsers[i], testActivity.id);
        if (participationSteps.commentSubmitted) results.activity++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Test multi-entry slots with first user if activity supports it
      if (testActivity.maxEntries > 1) {
        const multiEntryResults = await testMultiEntrySlots(testUsers[0], testActivity.id);
        if (multiEntryResults.filter(r => r.commentSubmitted).length > 0) {
          results.multiEntry++;
        }
      }
    }

    // Test sequence enrollment
    log('\n🔍 Finding a test sequence...', 'yellow');
    try {
      const sequencesResponse = await axios.get(`${API_BASE_URL}/api/sequences/public`);
      if (sequencesResponse.data && sequencesResponse.data.length > 0) {
        testSequence = sequencesResponse.data[0];
        log(`✅ Using sequence: ${testSequence.title}`, 'green');

        // Enroll all users in sequence
        for (const user of testUsers) {
          const sequenceSuccess = await testSequenceFlow(user, testSequence.urlName);
          if (sequenceSuccess) results.sequence++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        log(`⚠️  No sequences found, skipping sequence tests`, 'yellow');
      }
    } catch (error) {
      log(`⚠️  Could not fetch sequences: ${error.message}`, 'yellow');
    }

    // Test voting system (user 1 votes on user 2's entry)
    if (testUsers.length >= 2 && testActivity) {
      const votingSuccess = await testVotingSystem(testUsers[0], testActivity.urlName, testUsers[1].userId);
      if (votingSuccess) results.voting++;
    }

    // Print final results
    printTestResults(results);

  } catch (error) {
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    console.error(error);
  }
}

function printTestResults(results) {
  console.log('\n' + '='.repeat(60));
  log('📊 TEST RESULTS SUMMARY', 'cyan');
  console.log('='.repeat(60));

  log(`\n✅ Authentication Tests: ${results.auth}/3`, results.auth >= 2 ? 'green' : 'red');
  log(`✅ Profile Management Tests: ${results.profile}/1`, results.profile === 1 ? 'green' : 'red');
  log(`✅ User Settings Tests: ${results.settings}/1`, results.settings === 1 ? 'green' : 'red');
  log(`✅ Activity Participation Tests: ${results.activity}/${testUsers.length}`, results.activity >= 1 ? 'green' : 'red');
  log(`✅ Multi-Entry Slots Tests: ${results.multiEntry}/1`, results.multiEntry === 1 ? 'green' : 'yellow');
  log(`✅ Sequence Enrollment Tests: ${results.sequence}/${testUsers.length}`, results.sequence >= 1 ? 'green' : 'yellow');
  log(`✅ Voting System Tests: ${results.voting}/1`, results.voting === 1 ? 'green' : 'yellow');

  const totalTests = 3 + 1 + 1 + testUsers.length + 1 + testUsers.length + 1;
  const totalPassed = results.auth + results.profile + results.settings + results.activity + results.multiEntry + results.sequence + results.voting;

  console.log('\n' + '='.repeat(60));
  log(`OVERALL: ${totalPassed}/${totalTests} tests passed (${(totalPassed/totalTests*100).toFixed(1)}%)`, totalPassed >= totalTests * 0.8 ? 'green' : 'red');
  console.log('='.repeat(60) + '\n');
}

// Run tests
if (require.main === module) {
  runAllTests()
    .then(() => {
      log('\n✅ Test suite completed', 'green');
      process.exit(0);
    })
    .catch((error) => {
      log(`\n❌ Test suite failed: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runAllTests, testAuthFlow, testProfileFlow, testActivityParticipation };
