const mongoose = require('mongoose');

const matchEventSchema = new mongoose.Schema(
  {
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
    eventType: { 
      type: String, 
      enum: ['Goal', 'Own Goal', 'Penalty', 'Missed Penalty', 'Yellow Card', 'Second Yellow', 'Red Card', 'Substitution', 'VAR', 'Kick Off', 'Kickoff', 'Half Time', 'Full Time'], 
      required: true 
    },
    minute: { type: Number, required: true },
    additionalMinute: { type: Number },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    assistPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    playerIn: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    playerOut: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    description: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MatchEvent', matchEventSchema);
