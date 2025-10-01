const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Custom short ID (like activities use)
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Authentication fields
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },

  password: {
    type: String,
    required: true,
    minlength: 8
  },

  // Profile fields
  name: {
    type: String,
    trim: true
  },

  bio: {
    type: String,
    maxlength: 500
  },

  // Role and permissions
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },

  // Profile visibility
  profileVisibility: {
    type: String,
    enum: ['public', 'sequence_only', 'private'],
    default: 'sequence_only'
  },

  // Intake form responses (stored per sequence)
  intakeResponses: [{
    sequenceId: String,
    responses: mongoose.Schema.Types.Mixed,
    completedAt: Date
  }],

  // Account status
  isActive: {
    type: Boolean,
    default: true
  },

  emailVerified: {
    type: Boolean,
    default: false
  },

  // Migration support: link old localStorage IDs to new accounts
  legacyUserIds: [{
    type: String
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  },

  lastLoginAt: {
    type: Date
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update updatedAt on save
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Don't return password in JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Static method to find user by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find user by custom ID
userSchema.statics.findByCustomId = function(id) {
  return this.findOne({ id });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
