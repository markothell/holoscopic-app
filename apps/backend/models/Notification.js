const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  type: {
    type: String,
    // 'circle_phase' covers EVERY phase transition of every activity built on
    // utils/circles.js, deliberately as one value. The phase name is in the
    // message, not the type: the whole point of the circleActivities registry
    // is that a new activity declares its own phases without touching the
    // machine, and a type derived from the phase name would make each new one
    // fail this enum — invisibly, since utils/notify.js swallows the error.
    enum: ['topic_confirmed', 'inquiry_linked', 'algorithm_session_ready', 'frame_nominated', 'activity_closed', 'circle_phase'],
    required: true,
  },
  message: { type: String, required: true },
  refType: { type: String, default: null }, // 'topic'
  refId: { type: String, default: null },   // topic id
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
}, { id: false });

// routes/notifications.js: find({userId}).sort({createdAt:-1}).limit(30),
// polled every 30s by every signed-in client. The standalone userId index
// leaves the sort blocking in memory.
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
