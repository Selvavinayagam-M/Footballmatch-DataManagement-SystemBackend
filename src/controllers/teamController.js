const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const Competition = require('../models/Competition');
const AuditLog = require('../models/AuditLog');

// @desc    Get all teams with search, filter, pagination, and dropdown support
// @route   GET /api/teams
// @access  Private
const getTeams = async (req, res) => {
  try {
    const isAll = req.query.limit === 'all' || req.query.all === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = isAll ? 0 : (parseInt(req.query.limit) || 10);
    const skip = isAll ? 0 : (page - 1) * limit;

    let query = {};
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query = {
        $or: [
          { name: searchRegex },
          { shortName: searchRegex },
          { country: searchRegex }
        ]
      };
    }
    
    if (req.query.competition) {
      query.competition = req.query.competition;
    }
    
    if (req.query.country) {
      query.country = req.query.country;
    }

    if (req.query.status) {
      query.status = { $regex: new RegExp(`^${req.query.status.trim()}$`, 'i') };
    }

    let teamQuery = Team.find(query)
      .populate('competition', 'name country season')
      .sort({ name: 1 });

    if (!isAll && limit > 0) {
      teamQuery = teamQuery.skip(skip).limit(limit);
    }

    const teams = await teamQuery;
    const total = await Team.countDocuments(query);

    res.json({
      success: true,
      teams,
      page: isAll ? 1 : page,
      pages: isAll ? 1 : (Math.ceil(total / limit) || 1),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single team with squad and fixtures
// @route   GET /api/teams/:id
// @access  Private
const getTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).populate('competition');
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const squad = await Player.find({ team: team._id })
      .select('firstName lastName displayName position jerseyNumber status')
      .sort({ jerseyNumber: 1, lastName: 1 });
    
    const upcomingFixtures = await Match.find({ 
      $or: [{ homeTeam: team._id }, { awayTeam: team._id }],
      status: 'Scheduled'
    })
    .populate('homeTeam', 'name shortName')
    .populate('awayTeam', 'name shortName')
    .populate('competition', 'name')
    .sort({ scheduledDate: 1 })
    .limit(5);

    const recentMatches = await Match.find({
      $or: [{ homeTeam: team._id }, { awayTeam: team._id }],
      status: { $in: ['Full Time', 'Finished'] }
    })
    .populate('homeTeam', 'name shortName')
    .populate('awayTeam', 'name shortName')
    .populate('competition', 'name')
    .sort({ scheduledDate: -1 })
    .limit(5);

    res.json({
      success: true,
      ...team.toObject(),
      squad,
      upcomingFixtures,
      recentMatches
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create team
// @route   POST /api/teams
// @access  Private/Admin
const createTeam = async (req, res) => {
  const { name, shortName, country, competition, city, stadium, foundedYear, status, logo } = req.body;
  
  if (!name || !shortName || !country || !competition) {
    return res.status(400).json({ message: 'Name, short name, country, and competition are required' });
  }

  try {
    const compExists = await Competition.findById(competition);
    if (!compExists) {
      return res.status(404).json({ message: 'Selected competition not found' });
    }

    const trimmedName = name.trim();
    const trimmedShort = shortName.trim().toUpperCase();

    // Check duplicate name in same competition
    const existingTeam = await Team.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      competition
    });
    if (existingTeam) {
      return res.status(400).json({ message: 'A team with this name already exists in the selected competition' });
    }

    const team = new Team({
      name: trimmedName,
      shortName: trimmedShort,
      country: country.trim(),
      competition,
      city: city?.trim() || '',
      stadium: stadium?.trim() || '',
      foundedYear: foundedYear ? parseInt(foundedYear) : undefined,
      status: status || 'Active',
      logo
    });

    const createdTeam = await team.save();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Created',
        entityType: 'Team',
        entityId: createdTeam._id,
        newValue: { name: createdTeam.name, shortName: createdTeam.shortName, competition }
      });
    }

    res.status(201).json(createdTeam);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update team
// @route   PUT /api/teams/:id
// @access  Private/Admin
const updateTeam = async (req, res) => {
  const { name, shortName, country, competition, city, stadium, foundedYear, status, logo } = req.body;
  
  if (!name || !shortName || !country || !competition) {
    return res.status(400).json({ message: 'Name, short name, country, and competition are required' });
  }

  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const compExists = await Competition.findById(competition);
    if (!compExists) {
      return res.status(404).json({ message: 'Selected competition not found' });
    }

    const trimmedName = name.trim();
    const trimmedShort = shortName.trim().toUpperCase();

    const existingTeam = await Team.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      competition
    });
    if (existingTeam) {
      return res.status(400).json({ message: 'Another team with this name already exists in the selected competition' });
    }

    const oldValue = team.toObject();

    team.name = trimmedName;
    team.shortName = trimmedShort;
    team.country = country.trim();
    team.competition = competition;
    if (city !== undefined) team.city = city.trim();
    if (stadium !== undefined) team.stadium = stadium.trim();
    if (foundedYear !== undefined) team.foundedYear = foundedYear ? parseInt(foundedYear) : undefined;
    if (status) team.status = status;
    if (logo !== undefined) team.logo = logo;

    const updatedTeam = await team.save();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Updated',
        entityType: 'Team',
        entityId: updatedTeam._id,
        oldValue: { name: oldValue.name, status: oldValue.status },
        newValue: { name: updatedTeam.name, status: updatedTeam.status }
      });
    }

    res.json(updatedTeam);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete team
// @route   DELETE /api/teams/:id
// @access  Private/Admin
const deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Relational dependency check
    const playersCount = await Player.countDocuments({ team: team._id });
    const matchesCount = await Match.countDocuments({ $or: [{ homeTeam: team._id }, { awayTeam: team._id }] });

    if (playersCount > 0 || matchesCount > 0) {
      return res.status(400).json({
        message: `Cannot delete team. It is currently referenced by ${playersCount} player(s) and ${matchesCount} match(es).`
      });
    }

    const oldValue = team.toObject();
    await team.deleteOne();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Deleted',
        entityType: 'Team',
        entityId: team._id,
        oldValue: { name: oldValue.name, country: oldValue.country }
      });
    }

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getTeams, getTeam, createTeam, updateTeam, deleteTeam };
