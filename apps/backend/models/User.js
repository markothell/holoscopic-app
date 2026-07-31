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

  // Notification preferences
  notifications: {
    newActivities: {
      type: Boolean,
      default: true
    },
    enrolledActivities: {
      type: Boolean,
      default: true
    }
  },

  // Intake form responses (stored per sequence)
  intakeResponses: [{
    sequenceId: String,
    responses: mongoose.Schema.Types.Mixed,
    completedAt: Date
  }],

  // Holon economy
  holonBalance: {
    type: Number,
    default: 0,
  },

  // Account status
  isActive: {
    type: Boolean,
    default: true
  },

  emailVerified: {
    type: Boolean,
    default: false
  },

  // Self-serve password reset (routes/auth.js).
  //
  // The HASH of the token, never the token — a reset link is a bearer
  // credential for the account, so a database read must not be enough to mint
  // one. Same reason the password field beside it is bcrypted.
  //
  // SHA-256 rather than bcrypt here on purpose: this value is 32 bytes of
  // crypto randomness with a 60-minute life, so there is nothing to brute
  // force, and the lookup has to be an indexed equality match on a field
  // nobody has the plaintext of.
  resetTokenHash: {
    type: String,
    index: true
  },

  resetTokenExpiresAt: {
    type: Date
  },

  // Email verification (routes/auth.js). Same shape and same reasoning as the
  // reset pair above: the hash, never the token.
  //
  // `emailVerified` predates this by a long way and was never set by anything.
  // Accounts created before verification existed are stamped true by
  // scripts/backfill-email-verified.js — an unverifiable account holder who
  // was already using the platform must not be locked out by a feature that
  // arrived after them.
  verifyTokenHash: {
    type: String,
    index: true
  },

  verifyTokenExpiresAt: {
    type: Date
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
}, { id: false });

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

// Don't return password in JSON.
//
// The reset fields go with it: resetTokenHash is not the token, but publishing
// it and its expiry tells anyone reading a user payload that a reset is
// currently outstanding, which is the half of the secret they don't have.
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetTokenHash;
  delete obj.resetTokenExpiresAt;
  delete obj.verifyTokenHash;
  delete obj.verifyTokenExpiresAt;
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
