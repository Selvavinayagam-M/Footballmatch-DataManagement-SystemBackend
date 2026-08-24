require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI or MONGO_URI is not defined in environment variables.');
    }
    await mongoose.connect(mongoUri);
    console.log('MongoDB Connected for Seeding');
  } catch (error) {
    console.error('Connection error:', error.message);
    process.exit(1);
  }
};

const seedUsers = async () => {
  try {
    console.log('Checking existing core user accounts in MongoDB...');
    
    const coreUsers = [
      {
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
        status: 'active'
      },
      {
        name: 'Data Collector',
        email: 'collector@example.com',
        password: 'password123',
        role: 'collector',
        status: 'active'
      },
      {
        name: 'QA Reviewer',
        email: 'qa@example.com',
        password: 'password123',
        role: 'qa',
        status: 'active'
      }
    ];

    for (const u of coreUsers) {
      const existing = await User.findOne({ email: u.email });
      if (!existing) {
        await User.create(u);
        console.log(`+ Created user: ${u.email} (${u.role})`);
      } else {
        existing.name = u.name;
        existing.password = u.password; // pre-save hook will hash 'password123'
        existing.role = u.role;
        existing.status = 'active';
        await existing.save();
        console.log(`✔ Verified & updated user: ${u.email} (${u.role})`);
      }
    }

    console.log('\nAll core users (Admin, Collector, QA) successfully seeded!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

connectDB().then(seedUsers);
