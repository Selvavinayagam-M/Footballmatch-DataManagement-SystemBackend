require('dotenv').config();
const mongoose = require('mongoose');

// Require all models
require('./models/User');
require('./models/Competition');
require('./models/Team');
require('./models/Player');
require('./models/Squad');
require('./models/Match');
require('./models/MatchEvent');
require('./models/Discrepancy');
require('./models/AuditLog');

console.log('All models compiled successfully.');
process.exit(0);
