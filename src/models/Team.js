const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    shortName: { type: String, required: true },
    country: { type: String, required: true },
    city: { type: String },
    stadium: { type: String },
    competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition' },
    status: { type: String, enum: ['active', 'inactive', 'Active', 'Inactive'], default: 'Active' },
    foundedYear: { type: Number },
    logo: { type: String },
  },
  { timestamps: true }
);

// Indexes for frequently searched fields
teamSchema.index({ name: 1 });
teamSchema.index({ competition: 1 });

module.exports = mongoose.model('Team', teamSchema);
