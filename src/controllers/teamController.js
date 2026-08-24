const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const Competition = require('../models/Competition');

const getTeams = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.query.search) {
      query = {
        $or: [
          { name: { $regex: req.query.search, $options: 'i' } },
          { shortName: { $regex: req.query.search, $options: 'i' } },
          { country: { $regex: req.query.search, $options: 'i' } }
        ]
      };
    }
    
    if (req.query.competition) {
      query.competition = req.query.competition;
    }
    
    if (req.query.country) {
      query.country = req.query.country;
    }

    const teams = await Team.find(query)
      .populate('competition', 'name country')
      .skip(skip)
      .limit(limit)
      .sort({ name: 1 });

    const total = await Team.countDocuments(query);

    res.json({
      teams,
      page,
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).populate('competition');
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const squad = await Player.find({ team: team._id }).select('firstName lastName position jerseyNumber status').sort({ position: 1 });
    
    const upcomingFixtures = await Match.find({ 
      $or: [{ homeTeam: team._id }, { awayTeam: team._id }],
      status: 'Scheduled'
    })
    .populate('homeTeam', 'name shortName')
    .populate('awayTeam', 'name shortName')
    .sort({ scheduledDate: 1 })
    .limit(5);

    const recentMatches = await Match.find({
      $or: [{ homeTeam: team._id }, { awayTeam: team._id }],
      status: { $in: ['Full Time', 'Finished'] }
    })
    .populate('homeTeam', 'name shortName')
    .populate('awayTeam', 'name shortName')
    .sort({ scheduledDate: -1 })
    .limit(5);

    res.json({
      ...team.toObject(),
      squad,
      upcomingFixtures,
      recentMatches
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createTeam = async (req, res) => {
  const { name, shortName, country, competition } = req.body;
  
  if (!name || !shortName || !country || !competition) {
    return res.status(400).json({ message: 'Name, short name, country, and competition are required' });
  }

  try {
    // Validate competition exists
    const compExists = await Competition.findById(competition);
    if (!compExists) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Check for duplicate name in the same competition
    const existingTeam = await Team.findOne({ name, competition });
    if (existingTeam) {
      return res.status(400).json({ message: 'A team with this name already exists in the selected competition' });
    }

    const team = new Team(req.body);
    const createdTeam = await team.save();
    res.status(201).json(createdTeam);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateTeam = async (req, res) => {
  const { name, shortName, country, competition } = req.body;
  
  if (!name || !shortName || !country || !competition) {
    return res.status(400).json({ message: 'Name, short name, country, and competition are required' });
  }

  try {
    const compExists = await Competition.findById(competition);
    if (!compExists) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const existingTeam = await Team.findOne({ name, competition, _id: { $ne: req.params.id } });
    if (existingTeam) {
      return res.status(400).json({ message: 'A team with this name already exists in the selected competition' });
    }

    const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (team) {
      res.json(team);
    } else {
      res.status(404).json({ message: 'Team not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (team) {
      await team.deleteOne();
      res.json({ message: 'Team deleted' });
    } else {
      res.status(404).json({ message: 'Team not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getTeams, getTeam, createTeam, updateTeam, deleteTeam };
