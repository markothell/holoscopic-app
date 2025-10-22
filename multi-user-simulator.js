#!/usr/bin/env node

/**
 * Multi-User Activity Participation Simulator for Holoscopic
 * Simulates a realistic cohort of users participating in an activity
 */

const axios = require('axios');
const io = require('socket.io-client');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const NUM_USERS = parseInt(process.env.NUM_USERS) || 10;
const ACTIVITY_ID = process.env.ACTIVITY_ID || null;

// User behavior patterns
const BEHAVIOR_PATTERNS = {
  quick: { minDelay: 500, maxDelay: 2000, engagementLevel: 'low' },
  normal: { minDelay: 2000, maxDelay: 5000, engagementLevel: 'medium' },
  thoughtful: { minDelay: 5000, maxDelay: 15000, engagementLevel: 'high' }
};

// Comment templates for realistic simulation
const COMMENT_TEMPLATES = [
  "I see this as fundamentally about {topic}",
  "This perspective challenges my thinking on {topic}",
  "I'm somewhere in between on {topic}",
  "My experience with {topic} shapes my view here",
  "I hadn't considered {topic} from this angle before",
  "The key tension I see is around {topic}",
  "This really resonates with my understanding of {topic}",
  "I'm curious how others see {topic} differently",
  "My position on {topic} has evolved over time",
  "I think {topic} is more nuanced than it appears"
];

const OBJECT_NAME_TEMPLATES = [
  "Pragmatist",
  "Idealist",
  "Skeptic",
  "Optimist",
  "Bridge-Builder",
  "Critical Thinker",
  "Systems Viewer",
  "Detail-Oriented",
  "Big Picture",
  "Question-Asker"
];

class SimulatedUser {
  constructor(index, behavior = 'normal') {
    this.index = index;
    this.behavior = BEHAVIOR_PATTERNS[behavior];
    this.userId = null;
    this.email = null;
    this.socket = null;
    this.activityId = null;
    this.objectName = null;
    this.position = null;
    this.comment = null;
    this.state = 'created'; // created, registered, connected, joined, rated, commented, completed
    this.errors = [];
  }

  async register() {
    try {
      this.email = `simuser${this.index}_${Date.now()}@test.com`;
      const password = 'SimPass123!';

      const response = await axios.post(`${API_BASE_URL}/api/auth/signup`, {
        email: this.email,
        password,
        name: `Sim User ${this.index}`
      }, { timeout: 10000 });

      if (response.data.success) {
        this.userId = response.data.user.id;
        this.state = 'registered';
        console.log(`✅ User ${this.index} registered: ${this.email}`);
        return true;
      }
    } catch (error) {
      if (error.response && (error.response.status === 409 || error.response.status === 400)) {
        // User exists, try to get userId from login
        console.log(`⚠️  User ${this.index} already exists, skipping`);
        return false;
      }
      this.errors.push({ step: 'register', error: error.message });
      console.log(`❌ User ${this.index} registration failed: ${error.message}`);
      return false;
    }
  }

  async connect(activityId) {
    return new Promise((resolve) => {
      try {
        this.activityId = activityId;
        this.socket = io(API_BASE_URL, {
          transports: ['websocket'],
          timeout: 10000
        });

        this.socket.on('connect', () => {
          this.state = 'connected';
          console.log(`🔌 User ${this.index} connected to WebSocket`);
          resolve(true);
        });

        this.socket.on('connect_error', (error) => {
          this.errors.push({ step: 'connect', error: error.message });
          console.log(`❌ User ${this.index} connection failed: ${error.message}`);
          resolve(false);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (this.state !== 'connected') {
            this.errors.push({ step: 'connect', error: 'Connection timeout' });
            resolve(false);
          }
        }, 10000);

      } catch (error) {
        this.errors.push({ step: 'connect', error: error.message });
        console.log(`❌ User ${this.index} connection error: ${error.message}`);
        resolve(false);
      }
    });
  }

  async participate(slotNumber = 1) {
    return new Promise((resolve) => {
      if (!this.socket || this.state !== 'connected') {
        console.log(`❌ User ${this.index} cannot participate - not connected`);
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        console.log(`⏱️  User ${this.index} participation timed out`);
        resolve(false);
      }, 30000);

      // Step 1: Join activity
      this.socket.emit('join_activity', {
        activityId: this.activityId,
        userId: this.userId,
        username: `SimUser${this.index}`
      });

      this.socket.on('participant_joined', async (data) => {
        if (data.participant && data.participant.id === this.userId) {
          this.state = 'joined';
          console.log(`👋 User ${this.index} joined activity`);

          // Wait a bit (simulate reading instructions)
          await this.delay();

          // Step 2: Generate object name
          this.objectName = OBJECT_NAME_TEMPLATES[Math.floor(Math.random() * OBJECT_NAME_TEMPLATES.length)];
          if (Math.random() > 0.5) {
            this.objectName += ` ${this.index}`;
          }

          // Step 3: Submit rating (position)
          await this.delay();
          this.position = {
            x: Math.random() * 100,
            y: Math.random() * 100
          };

          this.socket.emit('submit_rating', {
            activityId: this.activityId,
            userId: this.userId,
            position: this.position,
            slotNumber,
            objectName: this.objectName,
            timestamp: new Date().toISOString()
          });
        }
      });

      this.socket.on('rating_added', async (data) => {
        if (data.rating && data.rating.userId === this.userId) {
          this.state = 'rated';
          console.log(`⭐ User ${this.index} submitted rating at (${this.position.x.toFixed(1)}, ${this.position.y.toFixed(1)})`);

          // Wait a bit (simulate thinking about comment)
          await this.delay();

          // Step 4: Generate and submit comment
          const template = COMMENT_TEMPLATES[Math.floor(Math.random() * COMMENT_TEMPLATES.length)];
          this.comment = template.replace('{topic}', 'this issue');

          this.socket.emit('submit_comment', {
            activityId: this.activityId,
            userId: this.userId,
            text: this.comment,
            slotNumber,
            objectName: this.objectName,
            timestamp: new Date().toISOString()
          });
        }
      });

      this.socket.on('comment_added', async (data) => {
        if (data.comment && data.comment.userId === this.userId) {
          this.state = 'commented';
          console.log(`💬 User ${this.index} submitted comment: "${this.comment.substring(0, 50)}..."`);

          // Wait a bit (simulate reading others' comments)
          await this.delay();

          // Step 5: Mark as completed
          this.state = 'completed';
          console.log(`✅ User ${this.index} completed participation`);

          clearTimeout(timeout);
          resolve(true);
        }
      });

      this.socket.on('error', (error) => {
        this.errors.push({ step: 'participate', error });
        console.log(`❌ User ${this.index} participation error: ${error}`);
      });
    });
  }

  async voteOnOthers(otherUserIds, maxVotes = 3) {
    if (!this.socket || this.state !== 'completed') {
      console.log(`⚠️  User ${this.index} cannot vote - not completed participation`);
      return 0;
    }

    let votesUsed = 0;
    const shuffled = [...otherUserIds].sort(() => Math.random() - 0.5);
    const toVoteOn = shuffled.slice(0, maxVotes);

    for (const targetUserId of toVoteOn) {
      try {
        await axios.post(`${API_BASE_URL}/api/activities/${this.activityId}/vote`, {
          userId: this.userId,
          targetUserId,
          slotNumber: 1
        }, { timeout: 5000 });

        votesUsed++;
        console.log(`👍 User ${this.index} voted on user ${targetUserId}`);

        await this.delay(500, 1500); // Quick delay between votes
      } catch (error) {
        console.log(`⚠️  User ${this.index} vote failed: ${error.message}`);
      }
    }

    return votesUsed;
  }

  async delay(minMs = null, maxMs = null) {
    const min = minMs || this.behavior.minDelay;
    const max = maxMs || this.behavior.maxDelay;
    const delay = min + Math.random() * (max - min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      console.log(`👋 User ${this.index} disconnected`);
    }
  }

  getStatus() {
    return {
      index: this.index,
      userId: this.userId,
      state: this.state,
      objectName: this.objectName,
      position: this.position,
      comment: this.comment ? this.comment.substring(0, 50) + '...' : null,
      errors: this.errors.length
    };
  }
}

/**
 * Simulate a cohort participating in an activity
 */
async function simulateCohort() {
  console.log('=' .repeat(80));
  console.log('🎭 MULTI-USER ACTIVITY PARTICIPATION SIMULATOR');
  console.log('=' .repeat(80));
  console.log(`🌐 Server: ${API_BASE_URL}`);
  console.log(`👥 Number of Users: ${NUM_USERS}`);
  console.log('=' .repeat(80) + '\n');

  // Step 1: Find or use activity
  let activityId = ACTIVITY_ID;

  if (!activityId) {
    console.log('🔍 Finding an activity to participate in...');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/activities`);
      if (response.data.success && response.data.data.activities.length > 0) {
        const activity = response.data.data.activities[0];
        activityId = activity.id;
        console.log(`✅ Using activity: ${activity.title}`);
        console.log(`   ID: ${activityId}`);
        console.log(`   Max Entries: ${activity.maxEntries || 1}\n`);
      } else {
        console.log('❌ No activities found. Please create an activity first.');
        process.exit(1);
      }
    } catch (error) {
      console.log(`❌ Failed to fetch activities: ${error.message}`);
      process.exit(1);
    }
  }

  // Step 2: Create users with varied behavior patterns
  console.log(`\n📝 Creating ${NUM_USERS} simulated users...\n`);
  const users = [];
  const behaviorTypes = ['quick', 'normal', 'thoughtful'];

  for (let i = 1; i <= NUM_USERS; i++) {
    const behavior = behaviorTypes[i % behaviorTypes.length];
    const user = new SimulatedUser(i, behavior);
    users.push(user);
  }

  // Step 3: Register users
  console.log(`\n🔐 Registering users...\n`);
  const registrationPromises = users.map(user => user.register());
  await Promise.all(registrationPromises);

  const registeredUsers = users.filter(u => u.state === 'registered');
  console.log(`\n✅ Registered ${registeredUsers.length}/${NUM_USERS} users\n`);

  if (registeredUsers.length === 0) {
    console.log('❌ No users registered successfully. Exiting.');
    process.exit(1);
  }

  // Step 4: Connect users (staggered)
  console.log(`\n🔌 Connecting users to WebSocket...\n`);
  for (const user of registeredUsers) {
    await user.connect(activityId);
    await new Promise(resolve => setTimeout(resolve, 500)); // Stagger connections
  }

  const connectedUsers = registeredUsers.filter(u => u.state === 'connected');
  console.log(`\n✅ Connected ${connectedUsers.length}/${registeredUsers.length} users\n`);

  if (connectedUsers.length === 0) {
    console.log('❌ No users connected successfully. Exiting.');
    process.exit(1);
  }

  // Step 5: Simulate participation (staggered start)
  console.log(`\n🎯 Starting activity participation...\n`);
  const participationPromises = connectedUsers.map((user, index) => {
    return new Promise(async (resolve) => {
      // Stagger start times (0-10 seconds)
      const startDelay = Math.random() * 10000;
      await new Promise(r => setTimeout(r, startDelay));

      const success = await user.participate();
      resolve(success);
    });
  });

  await Promise.all(participationPromises);

  const completedUsers = connectedUsers.filter(u => u.state === 'completed');
  console.log(`\n✅ ${completedUsers.length}/${connectedUsers.length} users completed participation\n`);

  // Step 6: Simulate voting
  console.log(`\n👍 Starting voting phase...\n`);
  const completedUserIds = completedUsers.map(u => u.userId);

  for (const user of completedUsers) {
    const otherUserIds = completedUserIds.filter(id => id !== user.userId);
    const votesUsed = await user.voteOnOthers(otherUserIds, 3);
    console.log(`  User ${user.index} cast ${votesUsed} votes`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Step 7: Disconnect all users
  console.log(`\n👋 Disconnecting all users...\n`);
  users.forEach(user => user.disconnect());

  // Step 8: Print summary
  printSummary(users, completedUsers.length);

  process.exit(0);
}

/**
 * Print simulation summary
 */
function printSummary(users, completedCount) {
  console.log('\n' + '=' .repeat(80));
  console.log('📊 SIMULATION SUMMARY');
  console.log('=' .repeat(80));

  const states = {
    created: users.filter(u => u.state === 'created').length,
    registered: users.filter(u => u.state === 'registered').length,
    connected: users.filter(u => u.state === 'connected').length,
    joined: users.filter(u => u.state === 'joined').length,
    rated: users.filter(u => u.state === 'rated').length,
    commented: users.filter(u => u.state === 'commented').length,
    completed: users.filter(u => u.state === 'completed').length
  };

  console.log(`\n📈 User States:`);
  console.log(`  Completed: ${states.completed}/${users.length} (${(states.completed/users.length*100).toFixed(1)}%)`);
  console.log(`  Commented: ${states.commented}/${users.length}`);
  console.log(`  Rated: ${states.rated}/${users.length}`);
  console.log(`  Joined: ${states.joined}/${users.length}`);
  console.log(`  Connected: ${states.connected}/${users.length}`);
  console.log(`  Registered: ${states.registered}/${users.length}`);

  const totalErrors = users.reduce((sum, u) => sum + u.errors.length, 0);
  console.log(`\n❌ Total Errors: ${totalErrors}`);

  if (totalErrors > 0) {
    console.log(`\n⚠️  Users with errors:`);
    users.filter(u => u.errors.length > 0).forEach(u => {
      console.log(`  User ${u.index}: ${u.errors.length} error(s)`);
      u.errors.forEach(e => console.log(`    - ${e.step}: ${e.error}`));
    });
  }

  console.log(`\n✅ Success Rate: ${(completedCount/users.length*100).toFixed(1)}%`);

  console.log('\n' + '=' .repeat(80) + '\n');
}

// Run simulation
if (require.main === module) {
  simulateCohort().catch((error) => {
    console.error('❌ Simulation failed:', error);
    process.exit(1);
  });
}

module.exports = { SimulatedUser, simulateCohort };
