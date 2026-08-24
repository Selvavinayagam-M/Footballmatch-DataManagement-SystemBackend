const mongoose = require('mongoose');

const competitionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    country: { type: String, required: true },
    season: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['Active', 'Inactive', 'Upcoming', 'Completed'], default: 'Active' },
    logo: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Competition', competitionSchema);
