require('dotenv').config();
const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const Discrepancy = require('../models/Discrepancy');
const User = require('../models/User');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI or MONGO_URI not set');
    await mongoose.connect(uri);
    console.log('MongoDB Connected for Main Seeding');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    // Clear collections
    await Competition.deleteMany();
    await Team.deleteMany();
    await Player.deleteMany();
    await Match.deleteMany();
    await Discrepancy.deleteMany();

    const admin = await User.findOne({ role: 'admin' });
    const collector = await User.findOne({ role: 'collector' });
    const qa = await User.findOne({ role: 'qa' });

    // 1. Competitions
    const pl = await Competition.create({ name: 'Premier League', country: 'England', season: '2023/2024' });
    const laLiga = await Competition.create({ name: 'La Liga', country: 'Spain', season: '2023/2024' });

    // 2. Teams
    const mci = await Team.create({ name: 'Manchester City', shortName: 'MCI', country: 'England', competition: pl._id });
    const ars = await Team.create({ name: 'Arsenal', shortName: 'ARS', country: 'England', competition: pl._id });
    const rma = await Team.create({ name: 'Real Madrid', shortName: 'RMA', country: 'Spain', competition: laLiga._id });
    const fcb = await Team.create({ name: 'Barcelona', shortName: 'FCB', country: 'Spain', competition: laLiga._id });

    // 3. Players
    // Create 25 players per team
    const positions = ['Goalkeeper', 'Defender', 'Defender', 'Defender', 'Midfielder', 'Midfielder', 'Midfielder', 'Forward', 'Forward', 'Forward',
                       'Goalkeeper', 'Defender', 'Defender', 'Midfielder', 'Midfielder', 'Forward', 'Forward',
                       'Goalkeeper', 'Defender', 'Defender', 'Midfielder', 'Midfielder', 'Forward', 'Forward', 'Defender'];
    
    const generatePlayers = async (teamId, nationality, prefix) => {
      const p = [];
      for(let i=1; i<=25; i++) {
        p.push({
          firstName: `Demo`,
          lastName: `${prefix}Player ${i}`,
          displayName: `D. ${prefix}${i}`,
          dateOfBirth: new Date(1990 + (i % 10), i % 12, (i % 28) + 1),
          nationality: nationality,
          position: positions[i - 1],
          jerseyNumber: i,
          team: teamId
        });
      }
      await Player.insertMany(p);
    };

    await generatePlayers(mci._id, 'England', 'MCI');
    await generatePlayers(ars._id, 'England', 'ARS');
    await generatePlayers(rma._id, 'Spain', 'RMA');
    await generatePlayers(fcb._id, 'Spain', 'FCB');

    // 4. Matches
    const match1 = await Match.create({
      competition: pl._id,
      season: '2023/2024',
      homeTeam: mci._id,
      awayTeam: ars._id,
      scheduledDate: new Date(),
      status: 'Live',
      homeScore: 1,
      awayScore: 0,
      dataCollector: collector._id
    });
    
    const match2 = await Match.create({
      competition: laLiga._id,
      season: '2023/2024',
      homeTeam: rma._id,
      awayTeam: fcb._id,
      scheduledDate: new Date(Date.now() + 86400000), // tomorrow
      status: 'Scheduled',
      dataCollector: collector._id,
      qaReviewer: qa._id
    });

    // 5. Discrepancies
    await Discrepancy.create({
      match: match1._id,
      category: 'Player Information',
      description: 'Player listed as defender instead of midfielder in source system',
      severity: 'Medium',
      reportedBy: collector._id,
      status: 'Open'
    });

    console.log('Main data seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

connectDB().then(seedData);
