/**
 * Script to create an admin user
 * Usage: node server/scripts/create-admin.js <email> <password> [name]
 */

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node create-admin.js <email> <password> [name]');
    console.error('Example: node create-admin.js admin@holoscopic.io mypassword123 "Admin User"');
    process.exit(1);
  }

  const email = args[0];
  const password = args[1];
  const name = args[2] || '';

  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      console.log(`\n❌ User with email ${email} already exists`);

      // Offer to update role to admin
      if (existingUser.role !== 'admin') {
        existingUser.role = 'admin';
        await existingUser.save();
        console.log(`✅ Updated user role to admin`);
      } else {
        console.log(`User is already an admin`);
      }

      await mongoose.connection.close();
      return;
    }

    // Generate custom ID
    const userId = Math.random().toString(36).substring(2, 10);

    // Create new admin user
    const adminUser = new User({
      id: userId,
      email,
      password,
      name,
      role: 'admin',
      emailVerified: true,
      isActive: true
    });

    await adminUser.save();

    console.log('\n✅ Admin user created successfully!');
    console.log(`Email: ${email}`);
    console.log(`Name: ${name || '(not set)'}`);
    console.log(`Role: admin`);
    console.log(`User ID: ${userId}`);
    console.log('\nYou can now log in at /login');

  } catch (error) {
    console.error('\n❌ Error creating admin user:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

createAdmin();
