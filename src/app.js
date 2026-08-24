require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Safe Startup Environment Validation
const validateEnvironment = () => {
  const required = [
    { key: 'MONGODB_URI', alias: 'MONGO_URI' },
    { key: 'JWT_SECRET' },
    { key: 'FRONTEND_URL', alias: 'CLIENT_URL' }
  ];

  const missing = [];
  for (const item of required) {
    const value = process.env[item.key] || (item.alias ? process.env[item.alias] : null);
    if (!value) {
      missing.push(item.key);
    }
  }

  if (missing.length > 0) {
    console.error(`❌ [BACKEND CONFIG ERROR] Missing required environment variable(s): ${missing.join(', ')}`);
    if (process.env.NODE_ENV === 'production') {
      console.error('Please configure the missing variable(s) in your Vercel Project Settings -> Environment Variables.');
    } else {
      console.error('Please configure the missing variable(s) in backend/.env.');
    }
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      process.exit(1);
    }
  }
};

validateEnvironment();

const app = express();

// CORS Configuration using FRONTEND_URL
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error('CORS policy: Access denied for this origin.'));
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Database Connection Middleware for Serverless & Direct execution
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error in middleware:', err.message);
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({ 
    success: true,
    message: 'Welcome to the Football Data Operations CMS Backend API' 
  });
});

// Health check endpoint (Public, unauthenticated)
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Football Data Operations API is running',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting'
  });
});

// Mounted Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/competitions', require('./routes/competitionRoutes'));
app.use('/api/teams', require('./routes/teamRoutes'));
app.use('/api/players', require('./routes/playerRoutes'));
app.use('/api/squads', require('./routes/squadRoutes'));
app.use('/api/matches', require('./routes/matchRoutes'));
app.use('/api/match-events', require('./routes/matchEventRoutes'));
app.use('/api/discrepancies', require('./routes/discrepancyRoutes'));
app.use('/api/verification', require('./routes/verificationRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api', require('./routes/reportsRoutes')); // contains dashboard, quality, collector KPIs
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack || err.message);
  res.status(err.status || 500).json({ 
    success: false, 
    message: err.message || 'Internal Server Error' 
  });
});

module.exports = app;
