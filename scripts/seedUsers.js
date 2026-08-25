require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const seedUsers = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('❌ Error: MONGODB_URI environment variable is missing.');
    console.error('Please configure MONGODB_URI in backend/.env or your terminal environment.');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });
    console.log(`Connected to MongoDB (Database: "${mongoose.connection.name}")\n`);

    const usersToSeed = [
      {
        displayName: 'Admin user',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
        password: process.env.ADMIN_SEED_PASSWORD || process.env.SEED_PASSWORD || 'password123'
      },
      {
        displayName: 'Collector user',
        name: 'Data Collector',
        email: 'collector@example.com',
        role: 'collector',
        status: 'active',
        password: process.env.COLLECTOR_SEED_PASSWORD || process.env.SEED_PASSWORD || 'password123'
      },
      {
        displayName: 'QA user',
        name: 'QA Reviewer',
        email: 'qa@example.com',
        role: 'qa',
        status: 'active',
        password: process.env.QA_SEED_PASSWORD || process.env.SEED_PASSWORD || 'password123'
      }
    ];

    for (const userData of usersToSeed) {
      const normalizedEmail = userData.email.trim().toLowerCase();
      const existingUser = await User.findOne({ email: normalizedEmail });

      if (existingUser) {
        // Safe idempotent update
        existingUser.name = userData.name;
        existingUser.role = userData.role;
        existingUser.status = userData.status;
        existingUser.password = userData.password; // Mongoose pre-save hook will hash password
        await existingUser.save();

        console.log(`${userData.displayName} (${userData.email}):`);
        console.log('already exists (verified & active)\n');
      } else {
        // Create new user (Mongoose pre-save hook hashes password)
        await User.create({
          name: userData.name,
          email: normalizedEmail,
          password: userData.password,
          role: userData.role,
          status: userData.status
        });

        console.log(`${userData.displayName} (${userData.email}):`);
        console.log('created\n');
      }
    }

    const totalCount = await User.countDocuments();
    console.log(`Total users in collection: ${totalCount}`);
    console.log('User seeding completed successfully.');

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
