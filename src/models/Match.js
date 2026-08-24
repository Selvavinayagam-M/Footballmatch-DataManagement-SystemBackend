const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true },
    season: { type: String, required: true },
    homeTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    awayTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    venue: { type: String },
    scheduledDate: { type: Date, required: true },
    scheduledTime: { type: String },
    status: { 
      type: String, 
      enum: ['Scheduled', 'Live', 'Half Time', 'Full Time', 'Postponed', 'Cancelled'], 
      default: 'Scheduled' 
    },
    homeScore: { type: Number, default: 0 },
    awayScore: { type: Number, default: 0 },
    halfTimeHomeScore: { type: Number },
    halfTimeAwayScore: { type: Number },
    referee: { type: String },
    dataCollector: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    qaReviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    coverageStatus: { 
      type: String, 
      enum: ['Not Started', 'In Progress', 'Completed', 'Needs Review', 'Approved', 'Rejected', 'Correction Required'], 
      default: 'Not Started' 
    },
    minute: { type: Number, default: 0 },
    qaComments: { type: String },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

matchSchema.index({ scheduledDate: 1 });
matchSchema.index({ status: 1 });
matchSchema.index({ coverageStatus: 1 });

module.exports = mongoose.model('Match', matchSchema);
