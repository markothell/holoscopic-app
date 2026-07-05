#!/usr/bin/env node
// Idempotently creates the "spectrum" Instance — On the Spectrum's home on
// a shared multi-tenant backend. Safe to run on any environment:
//
//   node scripts/ensure-spectrum-instance.js
//
// Reads MONGODB_URI from .env.local (or .env.production with NODE_ENV).
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');
const Instance = require('../models/Instance');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);

  let instance = await Instance.findOne({ slug: 'spectrum' });
  if (instance) {
    console.log(`✓ Instance already exists: ${instance.name} (id ${instance.id})`);
  } else {
    instance = new Instance({
      id: require('crypto').randomUUID().substring(0, 8),
      name: 'On the Spectrum',
      slug: 'spectrum',
      domains: [],
      access: { mode: 'public', inviteCodes: [] },
    });
    await instance.save();
    console.log(`✓ Created instance: ${instance.name} (id ${instance.id}, slug ${instance.slug})`);
  }
  await mongoose.connection.close();
}

main().catch(err => {
  console.error('✗', err.message);
  process.exit(1);
});
