const Notification = require('../models/Notification');

/**
 * Creates a notification in MongoDB for a target recipient
 */
const createSystemNotification = async ({ recipient, type, title, message, link, metadata }) => {
  try {
    if (!recipient) return null;
    return await Notification.create({
      recipient,
      type,
      title,
      message,
      link,
      metadata
    });
  } catch (error) {
    console.error('Error creating notification:', error.message);
    return null;
  }
};

module.exports = { createSystemNotification };
