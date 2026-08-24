const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    type: { 
      type: String, 
      enum: [
        'Match Assigned', 
        'Correction Requested', 
        'Squad Mismatch', 
        'Verification Submitted', 
        'Discrepancy Assigned', 
        'Match Approved', 
        'General'
      ],
      default: 'General'
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    link: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
