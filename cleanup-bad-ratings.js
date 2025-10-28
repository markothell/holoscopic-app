#!/usr/bin/env node

/**
 * Cleanup script to remove invalid position values from activities
 * Run this after fixing the position range bug (0-100 -> 0-1)
 */

const mongoose = require('mongoose');

// Try to load env file if available
try {
  require('dotenv').config({ path: './server/.env.local' });
} catch (e) {
  // dotenv not available, will use environment variable
}

async function cleanupBadRatings() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/holoscopic-db';
    console.log('Connecting to MongoDB...');
    console.log('URI:', mongoUri.replace(/\/\/.*@/, '//<credentials>@')); // Hide credentials in log
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const Activity = mongoose.connection.collection('activities');

    // Find activities with invalid positions
    console.log('🔍 Looking for activities with invalid position values...\n');

    const badActivities = await Activity.find({
      $or: [
        { 'ratings.position.x': { $gt: 1 } },
        { 'ratings.position.y': { $gt: 1 } }
      ]
    }).toArray();

    console.log(`Found ${badActivities.length} activities with invalid data:\n`);

    for (const activity of badActivities) {
      console.log(`📋 Activity: ${activity.title} (${activity.id})`);

      const badRatings = activity.ratings.filter(r =>
        r.position.x > 1 || r.position.y > 1
      );

      console.log(`   ${badRatings.length} invalid ratings found`);
      badRatings.forEach((r, i) => {
        console.log(`   - Rating ${i + 1}: (${r.position.x.toFixed(2)}, ${r.position.y.toFixed(2)}) [INVALID]`);
      });

      // Remove invalid ratings
      const result = await Activity.updateOne(
        { _id: activity._id },
        {
          $pull: {
            ratings: {
              $or: [
                { 'position.x': { $gt: 1 } },
                { 'position.y': { $gt: 1 } }
              ]
            }
          }
        }
      );

      console.log(`   ✅ Removed ${result.modifiedCount > 0 ? badRatings.length : 0} invalid ratings\n`);
    }

    // Also clean up invalid comments if any
    const badComments = await Activity.find({
      'comments.position': { $exists: true, $ne: null }
    }).toArray();

    if (badComments.length > 0) {
      console.log(`\n🔍 Found ${badComments.length} activities with comment position data to clean...\n`);

      for (const activity of badComments) {
        await Activity.updateOne(
          { _id: activity._id },
          { $unset: { 'comments.$[].position': 1 } }
        );
        console.log(`   ✅ Cleaned comments in: ${activity.title}`);
      }
    }

    console.log('\n✅ Cleanup complete!');
    console.log('\n📊 Summary:');
    console.log(`   Activities cleaned: ${badActivities.length}`);
    console.log(`   Invalid ratings removed: ${badActivities.reduce((sum, a) => sum + a.ratings.filter(r => r.position.x > 1 || r.position.y > 1).length, 0)}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run cleanup
if (require.main === module) {
  cleanupBadRatings()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { cleanupBadRatings };
