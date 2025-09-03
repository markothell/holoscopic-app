const mongoose = require('mongoose');

// WeAllExplain Activity Schema - simplified for single-page functionality
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
  
  // Quadrant labels
  quadrants: {
    q1: {
      type: String,
      required: false,
      trim: true,
      maxlength: 20,
      default: 'Q1 (++)'
    },
    q2: {
      type: String,
      required: false,
      trim: true,
      maxlength: 20,
      default: 'Q2 (-+)'
    },
    q3: {
      type: String,
      required: false,
      trim: true,
      maxlength: 20,
      default: 'Q3 (--)'
    },
    q4: {
      type: String,
      required: false,
      trim: true,
      maxlength: 20,
      default: 'Q4 (+-)'
    }
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
  
  // Participant data
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
    quadrantName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 20
    },
    quadrant: {
      type: String,
      required: false,
      enum: ['q1', 'q2', 'q3', 'q4']
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
ActivitySchema.methods.addParticipant = function(userId, username) {
  // Remove existing participant with same ID
  this.participants = this.participants.filter(p => p.id !== userId);
  
  // Add new participant
  this.participants.push({
    id: userId,
    username: username,
    isConnected: true,
    hasSubmitted: false,
    joinedAt: new Date()
  });
  
  return this.save();
};

ActivitySchema.methods.updateParticipantConnection = function(userId, isConnected) {
  const participant = this.participants.find(p => p.id === userId);
  if (participant) {
    participant.isConnected = isConnected;
    return this.save();
  }
  return Promise.resolve(this);
};

ActivitySchema.methods.addRating = async function(userId, username, position, objectName) {
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
        position: position,
        timestamp: new Date()
      };
      
      // Use findOneAndUpdate for atomic operation
      const updatedDoc = await this.constructor.findOneAndUpdate(
        { id: this.id },
        {
          $pull: { ratings: { userId: userId } }, // Remove existing rating
          $set: { 
            'participants.$[elem].hasSubmitted': true,
            'participants.$[elem].objectName': objectName || '',
            'comments.$[comment].objectName': objectName || ''
          }
        },
        {
          arrayFilters: [
            { 'elem.id': userId },
            { 'comment.userId': userId }
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

ActivitySchema.methods.addComment = function(userId, username, text, objectName) {
  const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Remove existing comment from same user
  this.comments = this.comments.filter(c => c.userId !== userId);
  
  // Add new comment
  this.comments.push({
    id: commentId,
    userId: userId,
    username: username,
    objectName: objectName || '',
    text: text,
    timestamp: new Date(),
    votes: [],
    voteCount: 0
  });
  
  // Update participant submission status
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
  
  // Check if user already voted
  const existingVote = comment.votes.find(v => v.userId === userId);
  if (existingVote) {
    // Remove existing vote (toggle)
    comment.votes = comment.votes.filter(v => v.userId !== userId);
    comment.voteCount = Math.max(0, comment.voteCount - 1);
  } else {
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