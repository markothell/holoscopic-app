const mongoose = require('mongoose');

// Holoscopic Activity Schema - unified schema supporting multiple activity types
const ActivitySchema = new mongoose.Schema({
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

  // Author (optional - for participant-created activities)
  author: {
    userId: {
      type: String,
      required: false
    },
    name: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100
    }
  },

  // Map configuration
  mapQuestion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  mapQuestion2: {
    type: String,
    required: false,
    trim: true,
    maxlength: 200,
    default: ''
  },
  
  xAxis: {
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    min: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30
    },
    max: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30
    }
  },
  
  yAxis: {
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    min: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30
    },
    max: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30
    }
  },
  
  // Comment configuration
  commentQuestion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  // Whorl-specific fields
  objectNameQuestion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    default: 'Name something that represents your perspective'
  },
  
  starterData: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },

  // Activity description and reference link
  preamble: {
    type: String,
    required: false,
    trim: true,
    maxlength: 500,
    default: ''
  },

  wikiLink: {
    type: String,
    required: false,
    trim: true,
    maxlength: 200,
    default: ''
  },

  // Vote configuration
  votesPerUser: {
    type: Number,
    required: false,
    default: null, // null = unlimited votes
    min: 0
  },

  // Multi-entry configuration
  // 0 = unlimited entries (solo tracker mode - creator only)
  // 1, 2, 4 = standard entry slots per user
  maxEntries: {
    type: Number,
    required: false,
    min: 0,
    default: 1
  },

  // Activity type - determines UI/flow behavior
  activityType: {
    type: String,
    required: true,
    enum: ['holoscopic', 'findthecenter', 'dissolve', 'resolve'],
    default: 'dissolve'
  },

  // Public/Private setting
  isPublic: {
    type: Boolean,
    default: false // Private by default, requires authentication
  },

  // Profile links setting
  showProfileLinks: {
    type: Boolean,
    default: true // Show profile icons by default
  },

  // Activity state
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active'
  },
  
  // Draft mode - hidden from public view when true
  isDraft: {
    type: Boolean,
    default: true
  },

  
  // Participant data (one record per user, slots tracked in ratings/comments)
  participants: [{
    id: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },
    objectName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 25
    },
    isConnected: {
      type: Boolean,
      default: false
    },
    hasSubmitted: {
      type: Boolean,
      default: false
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Rating data
  ratings: [{
    id: {
      type: String,
      required: true
    },
    userId: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },
    objectName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 25
    },
    slotNumber: {
      type: Number,
      required: false,
      default: 1,
      min: 1
      // No max limit - solo tracker mode allows unlimited slots
    },
    position: {
      x: {
        type: Number,
        required: true,
        min: 0,
        max: 1
      },
      y: {
        type: Number,
        required: true,
        min: 0,
        max: 1
      }
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Comment data
  comments: [{
    id: {
      type: String,
      required: true
    },
    userId: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },
    objectName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 25
    },
    slotNumber: {
      type: Number,
      required: false,
      default: 1,
      min: 1
      // No max limit - solo tracker mode allows unlimited slots
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    votes: [{
      id: {
        type: String,
        required: true
      },
      userId: {
        type: String,
        required: true
      },
      username: {
        type: String,
        required: true,
        trim: true,
        maxlength: 20
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    voteCount: {
      type: Number,
      default: 0
    }
  }],
  
  // Email collection
  emails: [{
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 100
    },
    userId: {
      type: String,
      required: false
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for performance
ActivitySchema.index({ status: 1, createdAt: -1 });
ActivitySchema.index({ 'participants.id': 1 });
ActivitySchema.index({ 'ratings.userId': 1 });
ActivitySchema.index({ 'ratings.timestamp': -1 });
ActivitySchema.index({ 'comments.userId': 1 });
ActivitySchema.index({ 'comments.timestamp': -1 });
ActivitySchema.index({ 'comments.voteCount': -1 });

// Helper methods
ActivitySchema.methods.addParticipant = async function(userId, username) {
  try {
    // Check if participant already exists
    const existingParticipant = this.participants.find(p => p.id === userId);

    if (existingParticipant) {
      // Update existing participant
      existingParticipant.username = username;
      existingParticipant.isConnected = true;
      existingParticipant.joinedAt = new Date();
    } else {
      // Add new participant
      this.participants.push({
        id: userId,
        username: username,
        isConnected: true,
        hasSubmitted: false,
        joinedAt: new Date()
      });
    }

    return await this.save();
  } catch (error) {
    console.error('Error in addParticipant:', error);
    throw error;
  }
};

ActivitySchema.methods.updateParticipantConnection = function(userId, isConnected) {
  const participant = this.participants.find(p => p.id === userId);
  if (participant) {
    participant.isConnected = isConnected;
    return this.save();
  }
  return Promise.resolve(this);
};

ActivitySchema.methods.addRating = async function(userId, username, position, objectName, slotNumber = 1) {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Use atomic operations with MongoDB's findOneAndUpdate
      const ratingId = `rating_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newRating = {
        id: ratingId,
        userId: userId,
        username: username,
        objectName: objectName || '',
        slotNumber: slotNumber,
        position: position,
        timestamp: new Date()
      };

      // First, remove all votes cast BY other users ON this user's comment for this slot
      // This returns those votes to voters when the user updates their mapping
      await this.constructor.findOneAndUpdate(
        { id: this.id },
        {
          $pull: {
            'comments.$[userComment].votes': { userId: { $ne: userId } }
          }
        },
        {
          arrayFilters: [
            { 'userComment.userId': userId, 'userComment.slotNumber': slotNumber }
          ]
        }
      );

      // Update vote counts for this user's comments for this slot
      const activity = await this.constructor.findOne({ id: this.id });
      if (activity) {
        activity.comments.forEach(comment => {
          if (comment.userId === userId && comment.slotNumber === slotNumber) {
            comment.voteCount = comment.votes.length;
          }
        });
        await activity.save();
      }

      // Use findOneAndUpdate for atomic operation
      const updatedDoc = await this.constructor.findOneAndUpdate(
        { id: this.id },
        {
          $pull: { ratings: { userId: userId, slotNumber: slotNumber } }, // Remove existing rating for this slot
          $set: {
            'participants.$[elem].hasSubmitted': true,
            'comments.$[comment].objectName': objectName || ''
          }
        },
        {
          arrayFilters: [
            { 'elem.id': userId },
            { 'comment.userId': userId, 'comment.slotNumber': slotNumber }
          ],
          new: true,
          runValidators: true
        }
      );

      if (!updatedDoc) {
        throw new Error('Activity not found');
      }

      // Add the new rating in a separate update to avoid conflicts
      const finalDoc = await this.constructor.findOneAndUpdate(
        { id: this.id },
        { $push: { ratings: newRating } },
        { new: true }
      );

      return finalDoc;

    } catch (error) {
      if ((error.name === 'VersionError' || error.code === 11000) && retries < maxRetries - 1) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, 50 + (retries * 100))); // Exponential backoff
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to update rating after maximum retries');
};

ActivitySchema.methods.addComment = function(userId, username, text, objectName, slotNumber = 1) {
  const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Remove existing comment from same user and slot
  this.comments = this.comments.filter(c => !(c.userId === userId && c.slotNumber === slotNumber));

  // Add new comment
  this.comments.push({
    id: commentId,
    userId: userId,
    username: username,
    objectName: objectName || '',
    slotNumber: slotNumber,
    text: text,
    timestamp: new Date(),
    votes: [],
    voteCount: 0
  });

  // Update participant submission status (participant is per user, not per slot)
  const participant = this.participants.find(p => p.id === userId);
  if (participant) {
    participant.hasSubmitted = true;
  }

  return this.save();
};

ActivitySchema.methods.voteComment = function(commentId, userId, username) {
  const comment = this.comments.find(c => c.id === commentId);
  if (!comment) {
    throw new Error('Comment not found');
  }

  // Prevent self-voting
  if (comment.userId === userId) {
    throw new Error('Cannot vote on your own comment');
  }

  // Check if user already voted
  const existingVote = comment.votes.find(v => v.userId === userId);
  if (existingVote) {
    // Remove existing vote (toggle)
    comment.votes = comment.votes.filter(v => v.userId !== userId);
    comment.voteCount = Math.max(0, comment.voteCount - 1);
  } else {
    // Check vote limit if configured (skip for solo tracker mode - maxEntries === 0)
    const isSoloTracker = this.maxEntries === 0;
    if (!isSoloTracker && this.votesPerUser !== null && this.votesPerUser !== undefined) {
      const userVoteCount = this.getUserVoteCount(userId);
      if (userVoteCount >= this.votesPerUser) {
        throw new Error(`Vote limit reached. You can only cast ${this.votesPerUser} vote(s).`);
      }
    }

    // Add new vote
    const voteId = `vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    comment.votes.push({
      id: voteId,
      userId: userId,
      username: username,
      timestamp: new Date()
    });
    comment.voteCount = comment.votes.length;
  }

  return this.save();
};

// Helper method to count total votes cast by a user
ActivitySchema.methods.getUserVoteCount = function(userId) {
  let voteCount = 0;
  this.comments.forEach(comment => {
    if (comment.votes.some(v => v.userId === userId)) {
      voteCount++;
    }
  });
  return voteCount;
};

// Helper method to get remaining votes for a user
ActivitySchema.methods.getRemainingVotes = function(userId) {
  // Solo tracker mode (maxEntries === 0) always has unlimited votes
  const isSoloTracker = this.maxEntries === 0;
  if (isSoloTracker || this.votesPerUser === null || this.votesPerUser === undefined) {
    return null; // Unlimited votes
  }
  const used = this.getUserVoteCount(userId);
  return Math.max(0, this.votesPerUser - used);
};

ActivitySchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(p => p.id !== userId);
  return this.save();
};

ActivitySchema.methods.complete = function() {
  this.status = 'completed';
  return this.save();
};

// Virtual for getting active participants
ActivitySchema.virtual('activeParticipants').get(function() {
  return this.participants.filter(p => p.isConnected);
});

// Virtual for getting completion rate
ActivitySchema.virtual('completionRate').get(function() {
  if (this.participants.length === 0) return 0;
  const submittedCount = this.participants.filter(p => p.hasSubmitted).length;
  return Math.round((submittedCount / this.participants.length) * 100);
});

module.exports = mongoose.model('Activity', ActivitySchema);