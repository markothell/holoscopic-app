/**
 * Seed script for sequence graph visualization test data
 *
 * Usage: node server/scripts/seed-graph-test-data.js
 *
 * Creates:
 * - 10 mapping activities with participants, ratings, and comments
 * - 10 users as sequence members
 * - 1 sequence with DAG relationships:
 *
 *   A1 (Foundations) ──→ A2 (Perspectives) ──→ A5 (Synthesis) ──────┐
 *                    └─→ A3 (Analysis) ──────→ A6 (Integration) ────┤
 *                                                                    ↓
 *                                                             A8 (Convergence)
 *
 *   A4 (Independent) ──→ A7 (Deep Dive) ──→ A9 (Application) ──→ A10 (Reflection)
 *
 * Exercises: 2 root nodes, branching, linear chains, diamond convergence, varied depth
 */

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');
const crypto = require('crypto');
const Activity = require('../models/Activity');
const Sequence = require('../models/Sequence');

function genId() {
  return crypto.randomUUID().substring(0, 8);
}

// 10 test users
const users = Array.from({ length: 10 }, (_, i) => ({
  userId: `test-user-${genId()}`,
  username: [
    'Alice', 'Bob', 'Carol', 'Dave', 'Eve',
    'Frank', 'Grace', 'Hank', 'Iris', 'Jay'
  ][i],
  email: `testuser${i + 1}@holoscopic.io`
}));

// Activity definitions
const activityDefs = [
  {
    title: 'Foundations of Perspective',
    urlName: `graph-test-foundations-${genId()}`,
    mapQuestion: 'How do you see the foundations of this topic?',
    mapQuestion2: 'Where does your understanding begin?',
    xAxis: { label: 'Knowledge', min: 'Theoretical', max: 'Practical' },
    yAxis: { label: 'Approach', min: 'Individual', max: 'Collective' },
    commentQuestion: 'What grounds your perspective?',
    objectNameQuestion: 'Name your foundational concept',
    preamble: 'Begin by mapping your foundational understanding.'
  },
  {
    title: 'Exploring Perspectives',
    urlName: `graph-test-perspectives-${genId()}`,
    mapQuestion: 'What perspective do you bring?',
    mapQuestion2: 'How does your viewpoint differ from others?',
    xAxis: { label: 'Scope', min: 'Narrow', max: 'Broad' },
    yAxis: { label: 'Depth', min: 'Surface', max: 'Deep' },
    commentQuestion: 'Describe your unique perspective',
    objectNameQuestion: 'Name your perspective',
    preamble: 'Explore how different perspectives shape understanding.'
  },
  {
    title: 'Analytical Frameworks',
    urlName: `graph-test-analysis-${genId()}`,
    mapQuestion: 'Which analytical framework resonates with you?',
    mapQuestion2: 'How do you structure your analysis?',
    xAxis: { label: 'Method', min: 'Qualitative', max: 'Quantitative' },
    yAxis: { label: 'Scale', min: 'Micro', max: 'Macro' },
    commentQuestion: 'What tools do you use for analysis?',
    objectNameQuestion: 'Name your analytical approach',
    preamble: 'Map the analytical frameworks that guide your thinking.'
  },
  {
    title: 'Independent Inquiry',
    urlName: `graph-test-independent-${genId()}`,
    mapQuestion: 'What question drives your independent exploration?',
    mapQuestion2: 'Where does curiosity lead you?',
    xAxis: { label: 'Direction', min: 'Convergent', max: 'Divergent' },
    yAxis: { label: 'Motivation', min: 'External', max: 'Internal' },
    commentQuestion: 'Share your driving question',
    objectNameQuestion: 'Name your inquiry',
    preamble: 'Chart your own path of independent exploration.'
  },
  {
    title: 'Synthesis Workshop',
    urlName: `graph-test-synthesis-${genId()}`,
    mapQuestion: 'How do you synthesize what you have learned?',
    mapQuestion2: 'Where do ideas connect?',
    xAxis: { label: 'Integration', min: 'Separate', max: 'Unified' },
    yAxis: { label: 'Complexity', min: 'Simple', max: 'Complex' },
    commentQuestion: 'What connections have you discovered?',
    objectNameQuestion: 'Name your synthesis',
    preamble: 'Bring together insights from previous activities.'
  },
  {
    title: 'Integration Mapping',
    urlName: `graph-test-integration-${genId()}`,
    mapQuestion: 'How do different analyses integrate?',
    mapQuestion2: 'What emerges from integration?',
    xAxis: { label: 'Coherence', min: 'Fragmented', max: 'Coherent' },
    yAxis: { label: 'Novelty', min: 'Expected', max: 'Surprising' },
    commentQuestion: 'What emerged from integration?',
    objectNameQuestion: 'Name what emerged',
    preamble: 'Map how analytical frameworks integrate with each other.'
  },
  {
    title: 'Deep Dive Exploration',
    urlName: `graph-test-deep-dive-${genId()}`,
    mapQuestion: 'What deserves a deeper look?',
    mapQuestion2: 'Where do you want to go deeper?',
    xAxis: { label: 'Focus', min: 'Broad survey', max: 'Deep focus' },
    yAxis: { label: 'Risk', min: 'Safe', max: 'Challenging' },
    commentQuestion: 'Why does this deserve deeper exploration?',
    objectNameQuestion: 'Name your deep dive topic',
    preamble: 'Choose a thread to follow deeply.'
  },
  {
    title: 'Convergence Point',
    urlName: `graph-test-convergence-${genId()}`,
    mapQuestion: 'Where do the streams of thought converge?',
    mapQuestion2: 'What is the common ground?',
    xAxis: { label: 'Agreement', min: 'Divergent', max: 'Convergent' },
    yAxis: { label: 'Clarity', min: 'Ambiguous', max: 'Clear' },
    commentQuestion: 'What do we collectively see?',
    objectNameQuestion: 'Name the convergence',
    preamble: 'Find where synthesis and integration meet.'
  },
  {
    title: 'Applied Practice',
    urlName: `graph-test-application-${genId()}`,
    mapQuestion: 'How do you apply what you have learned?',
    mapQuestion2: 'Where does theory meet practice?',
    xAxis: { label: 'Readiness', min: 'Preparing', max: 'Acting' },
    yAxis: { label: 'Impact', min: 'Personal', max: 'Systemic' },
    commentQuestion: 'What will you do differently?',
    objectNameQuestion: 'Name your application',
    preamble: 'Map how insights translate to action.'
  },
  {
    title: 'Reflective Closing',
    urlName: `graph-test-reflection-${genId()}`,
    mapQuestion: 'What has this journey meant to you?',
    mapQuestion2: 'How have you changed?',
    xAxis: { label: 'Growth', min: 'Reinforced', max: 'Transformed' },
    yAxis: { label: 'Emotion', min: 'Analytical', max: 'Heartfelt' },
    commentQuestion: 'Share your final reflection',
    objectNameQuestion: 'Name your takeaway',
    preamble: 'Reflect on the full sequence of exploration.'
  }
];

function randomPosition() {
  return { x: +(Math.random()).toFixed(3), y: +(Math.random()).toFixed(3) };
}

function randomComment(user, slotNumber) {
  const texts = [
    'This challenges my previous assumptions in interesting ways.',
    'I see a strong connection to the earlier mapping exercise.',
    'The collective view here is more nuanced than I expected.',
    'My perspective shifted after seeing others\' positions.',
    'There is a tension here between theory and practice.',
    'I find this maps well to my own experience.',
    'The diversity of viewpoints here is striking.',
    'This resonates deeply with my professional experience.',
    'I wonder how this would look with a larger group.',
    'The patterns emerging are both surprising and illuminating.'
  ];
  return {
    id: genId(),
    userId: user.userId,
    username: user.username,
    objectName: `${user.username}'s view`,
    slotNumber,
    text: texts[Math.floor(Math.random() * texts.length)],
    timestamp: new Date(),
    votes: [],
    voteCount: 0
  };
}

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Create 10 activities
    const activityIds = [];
    for (let i = 0; i < activityDefs.length; i++) {
      const def = activityDefs[i];
      const actId = genId();

      // Each activity gets 3-8 random participants
      const participantCount = 3 + Math.floor(Math.random() * 6);
      const shuffledUsers = [...users].sort(() => Math.random() - 0.5);
      const actUsers = shuffledUsers.slice(0, participantCount);

      const participants = actUsers.map(u => ({
        id: u.userId,
        username: u.username,
        objectName: `${u.username}'s concept`,
        isConnected: false,
        hasSubmitted: true,
        joinedAt: new Date()
      }));

      const ratings = actUsers.map(u => ({
        id: genId(),
        userId: u.userId,
        username: u.username,
        objectName: `${u.username}'s concept`,
        slotNumber: 1,
        position: randomPosition(),
        timestamp: new Date()
      }));

      const comments = actUsers.map(u => randomComment(u, 1));

      // Add some cross-voting on comments
      comments.forEach((comment, ci) => {
        const voters = actUsers.filter(u => u.userId !== comment.userId).slice(0, 2);
        voters.forEach(v => {
          comment.votes.push({
            id: genId(),
            userId: v.userId,
            username: v.username,
            timestamp: new Date()
          });
        });
        comment.voteCount = comment.votes.length;
      });

      const activity = new Activity({
        id: actId,
        title: def.title,
        urlName: def.urlName,
        activityType: 'holoscopic',
        mapQuestion: def.mapQuestion,
        mapQuestion2: def.mapQuestion2,
        xAxis: def.xAxis,
        yAxis: def.yAxis,
        commentQuestion: def.commentQuestion,
        objectNameQuestion: def.objectNameQuestion,
        preamble: def.preamble,
        status: 'active',
        isDraft: false,
        isPublic: false,
        maxEntries: 1,
        participants,
        ratings,
        comments
      });

      await activity.save();
      activityIds.push(actId);
      console.log(`  Created activity ${i + 1}/10: "${def.title}" (${actId})`);
    }

    // DAG structure:
    // A1 -> A2, A3           (branching from root)
    // A2 -> A5               (linear)
    // A3 -> A6               (linear)
    // A5 -> A8, A6 -> A8     (diamond convergence)
    // A4 (root) -> A7 -> A9 -> A10  (separate linear chain)
    const dagRelationships = {
      0: [],                   // A1: root
      1: [activityIds[0]],     // A2: depends on A1
      2: [activityIds[0]],     // A3: depends on A1
      3: [],                   // A4: root (independent branch)
      4: [activityIds[1]],     // A5: depends on A2
      5: [activityIds[2]],     // A6: depends on A3
      6: [activityIds[3]],     // A7: depends on A4
      7: [activityIds[4], activityIds[5]],  // A8: depends on A5 AND A6 (convergence)
      8: [activityIds[6]],     // A9: depends on A7
      9: [activityIds[8]]      // A10: depends on A9
    };

    // Create sequence
    const seqId = genId();
    const now = new Date();
    const sequence = new Sequence({
      id: seqId,
      title: 'Graph Visualization Test Sequence',
      urlName: 'graph-test-sequence',
      description: 'A test sequence with 10 activities forming a directed acyclic graph with branching, convergence, and varied depth.',
      status: 'active',
      startedAt: now,
      activities: activityIds.map((actId, i) => ({
        activityId: actId,
        order: i + 1,
        autoClose: false,
        duration: null,
        openedAt: i < 4 ? now : null,  // First 4 activities are open
        closedAt: null,
        parentActivityIds: dagRelationships[i] || []
      })),
      members: users.map(u => ({
        userId: u.userId,
        email: u.email,
        joinedAt: now
      }))
    });

    await sequence.save();
    console.log(`\n  Created sequence: "${sequence.title}" (${seqId})`);
    console.log(`  URL: /sequence/graph-test-sequence`);

    console.log('\n--- Summary ---');
    console.log(`Activities: ${activityIds.length}`);
    console.log(`Members: ${users.length}`);
    console.log(`Sequence: graph-test-sequence`);
    console.log('\nDAG structure:');
    console.log('  A1 (Foundations) --> A2 (Perspectives) --> A5 (Synthesis) --\\');
    console.log('                  \\--> A3 (Analysis) ------> A6 (Integration) --> A8 (Convergence)');
    console.log('  A4 (Independent) --> A7 (Deep Dive) --> A9 (Application) --> A10 (Reflection)');
    console.log('\nDone!');

  } catch (error) {
    console.error('Error seeding data:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

seed();
