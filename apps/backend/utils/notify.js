const Notification = require('../models/Notification');

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

let _io = null;
function setIO(io) { _io = io; }

async function notify({ userId, type, message, refType = null, refId = null }) {
  try {
    const doc = await Notification.create({ id: generateId(), userId, type, message, refType, refId });
    if (_io) _io.to(`user:${userId}`).emit('notification_new', doc.toJSON());
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

module.exports = { notify, setIO };
