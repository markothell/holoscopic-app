const mongoose = require('mongoose');
const Activity = require('./models/Activity');
require('dotenv').config({ path: '.env.local' });

// URL cleaning function (same as frontend)
function cleanActivityName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

function generateUniqueActivityName(title, existingNames) {
  let baseName = cleanActivityName(title);
  
  // If empty, use fallback
  if (!baseName) {
    baseName = 'activity';
  }
  
  let uniqueName = baseName;
  let counter = 1;
  
  while (existingNames.includes(uniqueName)) {
    uniqueName = `${baseName}-${counter}`;
    counter++;
  }
  
  return uniqueName;
}

async function migrateActivities() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all activities without urlName
    const activitiesWithoutUrl = await Activity.find({
      $or: [
        { urlName: { $exists: false } },
        { urlName: null },
        { urlName: '' }
      ]
    });

    console.log(`📋 Found ${activitiesWithoutUrl.length} activities without urlName`);

    if (activitiesWithoutUrl.length === 0) {
      console.log('✅ No activities need migration');
      return;
    }

    // Get all existing urlNames to avoid duplicates
    const existingActivities = await Activity.find({ urlName: { $exists: true, $ne: null, $ne: '' } });
    const existingUrlNames = existingActivities.map(a => a.urlName);

    // Update each activity
    for (const activity of activitiesWithoutUrl) {
      const urlName = generateUniqueActivityName(activity.title, existingUrlNames);
      
      // Update the activity without triggering validation on all fields
      await Activity.updateOne(
        { _id: activity._id },
        { $set: { urlName: urlName } }
      );
      
      existingUrlNames.push(urlName);
      console.log(`✅ Updated "${activity.title}" -> urlName: "${urlName}"`);
    }

    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the migration
migrateActivities();