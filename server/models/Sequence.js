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
    // Duration in days the activity will be open
    duration: {
      type: Number,
      required: true,
      default: 7,
      min: 1
    },
    // When this activity opens (null = not started)
    openedAt: {
      type: Date,
      default: null
    },
    // When this activity closes (null = still open)
    closedAt: {
      type: Date,
      default: null
    }
  }],

  // Cohort members (user IDs)
  members: [{
    userId: {
      type: String,
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],

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
SequenceSchema.index({ urlName: 1 });

// Helper methods
SequenceSchema.methods.addMember = async function(userId) {
  try {
    // Check if member already exists
    const existingMember = this.members.find(m => m.userId === userId);

    if (!existingMember) {
      this.members.push({
        userId: userId,
        joinedAt: new Date()
      });
    }

    return await this.save();
  } catch (error) {
    console.error('Error in addMember:', error);
    throw error;
  }
};

SequenceSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(m => m.userId !== userId);
  return await this.save();
};

SequenceSchema.methods.addActivity = async function(activityId, order, duration = 7) {
  try {
    // Check if activity already exists
    const existingActivity = this.activities.find(a => a.activityId === activityId);

    if (!existingActivity) {
      this.activities.push({
        activityId: activityId,
        order: order,
        duration: duration,
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

      // Set close date based on duration
      const closeDate = new Date();
      closeDate.setDate(closeDate.getDate() + firstActivity.duration);
      firstActivity.closedAt = closeDate;
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

      // Set close date based on duration
      const closeDate = new Date();
      closeDate.setDate(closeDate.getDate() + nextActivity.duration);
      nextActivity.closedAt = closeDate;
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