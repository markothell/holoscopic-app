const mongoose = require('mongoose');

// Sequence Schema for organizing activities in a cohort
const SequenceSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    default: function() {
      return require('crypto').randomUUID().substring(0, 8);
    }
  },

  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  urlName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    unique: true,
    match: /^[a-z0-9-]+$/
  },

  description: {
    type: String,
    required: false,
    trim: true,
    maxlength: 500,
    default: ''
  },

  // Welcome page settings
  welcomePage: {
    type: {
      enabled: {
        type: Boolean,
        default: false
      },
      requestName: {
        type: Boolean,
        default: false
      },
      welcomeText: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ''
      },
      referenceLink: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
      }
    },
    default: () => ({
      enabled: false,
      requestName: false,
      welcomeText: '',
      referenceLink: ''
    })
  },

  // Activities in the sequence with their scheduling
  activities: [{
    activityId: {
      type: String,
      required: true,
      ref: 'Activity'
    },
    order: {
      type: Number,
      required: true
    },
    // Auto-close enabled (if false, activity stays open indefinitely)
    autoClose: {
      type: Boolean,
      default: false
    },
    // Duration in days the activity will be open (only used if autoClose is true)
    duration: {
      type: Number,
      required: false,
      default: null,
      min: 1
    },
    // When this activity opens (null = not started)
    openedAt: {
      type: Date,
      default: null
    },
    // When this activity closes (null = still open/no limit)
    closedAt: {
      type: Date,
      default: null
    },
    // Parent activity IDs for DAG relationships (empty = root node)
    parentActivityIds: [{
      type: String
    }]
  }],

  // Cohort members (user IDs)
  members: [{
    userId: {
      type: String,
      required: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 100
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Email-based invitations
  invitedEmails: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 100
  }],

  // Require invitation to enroll (if true, only invited emails can join)
  requireInvitation: {
    type: Boolean,
    default: false
  },

  // Sequence status
  status: {
    type: String,
    enum: ['draft', 'active', 'completed'],
    default: 'draft'
  },

  // When the sequence started (first activity opened)
  startedAt: {
    type: Date,
    default: null
  },

  // When the sequence completed (last activity closed)
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for performance
SequenceSchema.index({ status: 1, createdAt: -1 });
SequenceSchema.index({ 'members.userId': 1 });

// Helper methods
SequenceSchema.methods.addMember = async function(userId, email) {
  try {
    // Check if member already exists
    const existingMember = this.members.find(m => m.userId === userId);

    if (!existingMember) {
      // If invitation is required, validate email
      if (this.requireInvitation && email) {
        const normalizedEmail = email.toLowerCase().trim();
        const isInvited = this.invitedEmails.includes(normalizedEmail);

        if (!isInvited) {
          throw new Error('Email not invited to this sequence');
        }
      }

      this.members.push({
        userId: userId,
        email: email || '',
        joinedAt: new Date()
      });
    } else {
      // Update existing member email if provided
      if (email) existingMember.email = email;
    }

    return await this.save();
  } catch (error) {
    console.error('Error in addMember:', error);
    throw error;
  }
};

SequenceSchema.methods.addInvitedEmails = async function(emails) {
  try {
    // Normalize and deduplicate emails
    const normalizedEmails = emails.map(e => e.toLowerCase().trim());
    const uniqueEmails = [...new Set([...this.invitedEmails, ...normalizedEmails])];

    this.invitedEmails = uniqueEmails;
    return await this.save();
  } catch (error) {
    console.error('Error in addInvitedEmails:', error);
    throw error;
  }
};

SequenceSchema.methods.removeInvitedEmail = async function(email) {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    this.invitedEmails = this.invitedEmails.filter(e => e !== normalizedEmail);

    // Also remove from members if they're enrolled with this email
    this.members = this.members.filter(m => {
      const memberEmail = (m.email || '').toLowerCase().trim();
      return memberEmail !== normalizedEmail;
    });

    return await this.save();
  } catch (error) {
    console.error('Error in removeInvitedEmail:', error);
    throw error;
  }
};

SequenceSchema.methods.isEmailInvited = function(email) {
  if (!this.requireInvitation) return true;
  const normalizedEmail = email.toLowerCase().trim();
  return this.invitedEmails.includes(normalizedEmail);
};

SequenceSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(m => m.userId !== userId);
  return await this.save();
};

SequenceSchema.methods.addActivity = async function(activityId, order, autoClose = false, duration = null) {
  try {
    // Check if activity already exists
    const existingActivity = this.activities.find(a => a.activityId === activityId);

    if (!existingActivity) {
      this.activities.push({
        activityId: activityId,
        order: order,
        autoClose: autoClose,
        duration: autoClose ? (duration || 7) : null,
        openedAt: null,
        closedAt: null
      });

      // Sort activities by order
      this.activities.sort((a, b) => a.order - b.order);
    }

    return await this.save();
  } catch (error) {
    console.error('Error in addActivity:', error);
    throw error;
  }
};

SequenceSchema.methods.removeActivity = async function(activityId) {
  this.activities = this.activities.filter(a => a.activityId !== activityId);
  return await this.save();
};

SequenceSchema.methods.startSequence = async function() {
  try {
    this.status = 'active';
    this.startedAt = new Date();

    // Open the first activity
    if (this.activities.length > 0) {
      const firstActivity = this.activities[0];
      firstActivity.openedAt = new Date();

      // Set close date only if autoClose is enabled
      if (firstActivity.autoClose && firstActivity.duration) {
        const closeDate = new Date();
        closeDate.setDate(closeDate.getDate() + firstActivity.duration);
        firstActivity.closedAt = closeDate;
      } else {
        firstActivity.closedAt = null; // No automatic closing
      }
    }

    return await this.save();
  } catch (error) {
    console.error('Error in startSequence:', error);
    throw error;
  }
};

SequenceSchema.methods.openNextActivity = async function() {
  try {
    // Find the next unopened activity
    const nextActivity = this.activities.find(a => !a.openedAt);

    if (nextActivity) {
      nextActivity.openedAt = new Date();

      // Set close date only if autoClose is enabled
      if (nextActivity.autoClose && nextActivity.duration) {
        const closeDate = new Date();
        closeDate.setDate(closeDate.getDate() + nextActivity.duration);
        nextActivity.closedAt = closeDate;
      } else {
        nextActivity.closedAt = null; // No automatic closing
      }
    }

    return await this.save();
  } catch (error) {
    console.error('Error in openNextActivity:', error);
    throw error;
  }
};

SequenceSchema.methods.completeSequence = async function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return await this.save();
};

// Manually close a specific activity in the sequence
SequenceSchema.methods.closeActivity = async function(activityId) {
  try {
    const activity = this.activities.find(a => a.activityId === activityId);

    if (!activity) {
      throw new Error('Activity not found in sequence');
    }

    if (!activity.openedAt) {
      throw new Error('Cannot close an activity that has not been opened');
    }

    if (activity.closedAt && new Date() <= activity.closedAt) {
      throw new Error('Activity is already closed');
    }

    // Set closedAt to now
    activity.closedAt = new Date();

    return await this.save();
  } catch (error) {
    console.error('Error in closeActivity:', error);
    throw error;
  }
};

// Manually reopen a specific activity in the sequence
SequenceSchema.methods.reopenActivity = async function(activityId) {
  try {
    const activity = this.activities.find(a => a.activityId === activityId);

    if (!activity) {
      throw new Error('Activity not found in sequence');
    }

    if (!activity.openedAt) {
      throw new Error('Cannot reopen an activity that has not been opened');
    }

    // Clear closedAt to reopen
    activity.closedAt = null;

    return await this.save();
  } catch (error) {
    console.error('Error in reopenActivity:', error);
    throw error;
  }
};

// Virtual for getting member count
SequenceSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Virtual for getting activity count
SequenceSchema.virtual('activityCount').get(function() {
  return this.activities.length;
});

// Virtual for getting completion status of activities
SequenceSchema.virtual('completionStatus').get(function() {
  const total = this.activities.length;
  const opened = this.activities.filter(a => a.openedAt).length;
  const closed = this.activities.filter(a => a.closedAt && new Date() > a.closedAt).length;

  return {
    total,
    opened,
    closed,
    percentComplete: total > 0 ? Math.round((closed / total) * 100) : 0
  };
});

module.exports = mongoose.model('Sequence', SequenceSchema);