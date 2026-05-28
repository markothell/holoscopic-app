const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ['topic_confirmed', 'inquiry_linked', 'algorithm_session_ready', 'frame_nominated'],
    required: true,
  },
  message: { type: String, required: true },
  refType: { type: String, default: null }, // 'topic'
  refId: { type: String, default: null },   // topic id
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notification', notificationSchema);
