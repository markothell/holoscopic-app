const Notification = require('../models/Notification');

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

async function notify({ userId, type, message, refType = null, refId = null }) {
  try {
    await Notification.create({ id: generateId(), userId, type, message, refType, refId });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

module.exports = { notify };
