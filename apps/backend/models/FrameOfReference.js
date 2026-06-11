const mongoose = require('mongoose');

const frameOfReferenceSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  // The two axis labels — these together name the frame
  xLabel: { type: String, required: true, trim: true, maxlength: 100 },
  xMin:   { type: String, default: '', trim: true, maxlength: 100 },
  xMax:   { type: String, default: '', trim: true, maxlength: 100 },

  yLabel: { type: String, required: true, trim: true, maxlength: 100 },
  yMin:   { type: String, default: '', trim: true, maxlength: 100 },
  yMax:   { type: String, default: '', trim: true, maxlength: 100 },

  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
}, { id: false });

// Text index for searching by either axis label
frameOfReferenceSchema.index({ xLabel: 'text', yLabel: 'text', xMin: 'text', xMax: 'text', yMin: 'text', yMax: 'text' });

module.exports = mongoose.model('FrameOfReference', frameOfReferenceSchema);
