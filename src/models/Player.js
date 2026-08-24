const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    displayName: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    nationality: { type: String, required: true },
    position: { type: String, enum: ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'], required: true },
    jerseyNumber: { type: Number, required: true },
    preferredFoot: { type: String, enum: ['Left', 'Right', 'Both'] },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Needs Correction'], default: 'Pending' },
  },
  { timestamps: true }
);

playerSchema.index({ displayName: 1 });
playerSchema.index({ team: 1 });

module.exports = mongoose.model('Player', playerSchema);
