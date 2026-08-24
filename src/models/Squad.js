const mongoose = require('mongoose');

const squadSchema = new mongoose.Schema(
  {
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    startingXI: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    substitutes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    status: { 
      type: String, 
      enum: ['Pending', 'Verified', 'Mismatch', 'Correction Requested'], 
      default: 'Pending' 
    },
    issues: [{ type: String }],
    correctionNotes: { type: String },
    checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Squad', squadSchema);
