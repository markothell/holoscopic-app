const mongoose = require('mongoose');

// ThresholdRanking — one person's whole bucket assignment for one seed.
//
// ONE document, not one per placement (PLAN §5.2, D8). A ranking is a judgment
// about the whole set: its natural key is (seedId, rankerId), a partial write
// is a corrupt ranking, and per-item rows would only ever be read as a set.
// That key does not fit Entry's (activityId, userId, slotNumber, questionId),
// which is half of why this is not an Entry.
//
// There is no `order` field. Ordering within a bucket was in the first draft
// and conflicted with the reveal: sorting by group agreement (utils/threshold.js
// #computeResult) and sorting by mean per-ranker order are two axes fighting
// for one list, and agreement is the one that answers the question the
// activity asks. Placement is a bucket. (D11)

const placementSchema = new mongoose.Schema({
  shareId: { type: String, required: true },
  // No neutral value, by design — you have to take a side on every story.
  pole:    { type: String, enum: ['A', 'B'], required: true },
}, { _id: false, id: false });

const thresholdRankingSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true },
  circleId:   { type: String, required: true, index: true },
  seedId:     { type: String, required: true, index: true },
  rankerId:   { type: String, required: true },

  placements: { type: [placementSchema], default: () => [] },

  // Null while a draft. You sort as you listen and rearrange freely; nothing
  // counts toward advancement and nothing reaches the aggregate until an
  // explicit final submit, which requires every share to be placed.
  submittedAt: { type: Date, default: null },
}, {
  timestamps: true,
  id: false,
});

// One ranking per person per seed — also the draft's upsert key.
thresholdRankingSchema.index({ seedId: 1, rankerId: 1 }, { unique: true });
// computeResult reads every SUBMITTED ranking for a seed.
thresholdRankingSchema.index({ seedId: 1, submittedAt: 1 });

module.exports = mongoose.model('ThresholdRanking', thresholdRankingSchema);
