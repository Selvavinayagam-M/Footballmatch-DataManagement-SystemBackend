require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const seedUsers = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('❌ Error: MONGODB_URI environment variable is missing.');
    console.error('Please set MONGODB_URI before running this seed script.');
    process.exit(1);
  }

  try {
    console.log('[AUTH] Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });

    console.log('[AUTH] Database connected');
    console.log(`[AUTH] Database name: ${mongoose.connection.name}`);
    console.log('[AUTH] Users collection: users\n');

    const usersToSeed = [
      {
        displayName: 'Admin',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
        password: process.env.ADMIN_SEED_PASSWORD || process.env.SEED_PASSWORD || 'password123'
      },
      {
        displayName: 'Collector',
        name: 'Data Collector',
        email: 'collector@example.com',
        role: 'collector',
        status: 'active',
        password: process.env.COLLECTOR_SEED_PASSWORD || process.env.SEED_PASSWORD || 'password123'
      },
      {
        displayName: 'QA',
        name: 'QA Reviewer',
        email: 'qa@example.com',
        role: 'qa',
        status: 'active',
        password: process.env.QA_SEED_PASSWORD || process.env.SEED_PASSWORD || 'password123'
      }
    ];

    for (const userData of usersToSeed) {
      const normalizedEmail = userData.email.trim().toLowerCase();
      let user = await User.findOne({ email: normalizedEmail });

      if (user) {
        // Safe update: ensure active status and correct role
        user.name = userData.name;
        user.role = userData.role;
        user.status = userData.status;
        user.password = userData.password; // Mongoose pre-save hook hashes if modified
        await user.save();
      } else {
        // Create new user
        user = await User.create({
          name: userData.name,
          email: normalizedEmail,
          password: userData.password,
          role: userData.role,
          status: userData.status
        });
      }

      // Verify user existence and password hashing match
      const verified = await User.findOne({ email: normalizedEmail });
      const passwordMatches = verified ? await verified.matchPassword(userData.password) : false;

      console.log(`[AUTH] ${userData.displayName} user exists: ${!!verified}`);
      console.log(`[AUTH] ${userData.displayName} role: ${verified?.role?.toUpperCase()}`);
      console.log(`[AUTH] ${userData.displayName} active status: ${verified?.status === 'active'}`);
      console.log(`[AUTH] ${userData.displayName} password hash verified: ${passwordMatches}\n`);
    }

    const totalCount = await User.countDocuments();
    console.log(`[AUTH] Total users in collection: ${totalCount}`);
    console.log('[AUTH] Production user seeding verified successfully.');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during user seeding:', error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

seedUsers();
