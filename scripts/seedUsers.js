require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const seedUsers = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('❌ Error: MONGODB_URI environment variable is missing.');
    console.error('Please provide MONGODB_URI in your environment or backend/.env before running this script.');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });

    const dbName = mongoose.connection.name;
    console.log(`Connected database: ${dbName}`);
    console.log(`Users collection: ${User.collection.name}\n`);

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
      let user = await User.findOne({ email: normalizedEmail });

      if (user) {
        user.name = userData.name;
        user.role = userData.role;
        user.status = userData.status;
        user.password = userData.password;
        await user.save();
        console.log(`${userData.displayName}: already exists (role: ${user.role.toUpperCase()})`);
      } else {
        user = await User.create({
          name: userData.name,
          email: normalizedEmail,
          password: userData.password,
          role: userData.role,
          status: userData.status
        });
        console.log(`${userData.displayName}: created (role: ${user.role.toUpperCase()})`);
      }

      const verifiedUser = await User.findOne({ email: normalizedEmail });
      const passwordMatch = verifiedUser ? await verifiedUser.matchPassword(userData.password) : false;

      if (!verifiedUser || !passwordMatch) {
        console.error(`❌ [ERROR] Verification failed for user ${normalizedEmail}`);
      }
    }

    const totalUsers = await User.countDocuments();
    console.log(`\nTotal users in database: ${totalUsers}`);
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
