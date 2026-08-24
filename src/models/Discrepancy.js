const mongoose = require('mongoose');

const discrepancySchema = new mongoose.Schema(
  {
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
    category: { 
      type: String, 
      enum: ['Player', 'Team', 'Competition', 'Match', 'Score', 'Match Event', 'Squad', 'Other', 'Player Information', 'Team Information', 'Match Information'],
      required: true 
    },
    description: { type: String, required: true },
    sourceValue: { type: String },
    systemValue: { type: String },
    severity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['Open', 'In Review', 'Resolved', 'Rejected'], default: 'Open' },
    resolution: { type: String },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

discrepancySchema.index({ status: 1 });

module.exports = mongoose.model('Discrepancy', discrepancySchema);
