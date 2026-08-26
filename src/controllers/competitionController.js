const Competition = require('../models/Competition');
const Match = require('../models/Match');
const Team = require('../models/Team');
const AuditLog = require('../models/AuditLog');

// @desc    Get all competitions with pagination, search, filter, sort
// @route   GET /api/competitions
// @access  Private
const getCompetitions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query = {
        $or: [
          { name: searchRegex },
          { country: searchRegex },
          { season: searchRegex }
        ]
      };
    }
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    let sortQuery = { createdAt: -1 };
    if (req.query.sort) {
      const [field, order] = req.query.sort.split(':');
      sortQuery = { [field]: order === 'desc' ? -1 : 1 };
    }

    const competitions = await Competition.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sortQuery);
      
    const total = await Competition.countDocuments(query);

    res.json({
      success: true,
      competitions,
      page,
      pages: Math.ceil(total / limit) || 1,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single competition with details
// @route   GET /api/competitions/:id
// @access  Private
const getCompetition = async (req, res) => {
  try {
    const competition = await Competition.findById(req.params.id);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const teamsCount = await Team.countDocuments({ competition: competition._id });
    const totalFixtures = await Match.countDocuments({ competition: competition._id });
    const completedMatches = await Match.countDocuments({ competition: competition._id, status: { $in: ['Full Time', 'Finished'] } });
    const upcomingMatches = await Match.countDocuments({ competition: competition._id, status: 'Scheduled' });
    const liveMatches = await Match.countDocuments({ competition: competition._id, status: 'Live' });

    res.json({
      success: true,
      ...competition.toObject(),
      teamsCount,
      totalFixtures,
      completedMatches,
      upcomingMatches,
      liveMatches
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create competition
// @route   POST /api/competitions
// @access  Private/Admin
const createCompetition = async (req, res) => {
  const { name, country, season, startDate, endDate, status, logo } = req.body;
  
  if (!name || !country || !season || !startDate || !endDate) {
    return res.status(400).json({ message: 'Name, country, season, start date, and end date are required' });
  }
  
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ message: 'End date cannot be before start date' });
  }
  
  try {
    const trimmedName = name.trim();
    const trimmedSeason = season.trim();

    // Prevent duplicates with same name and season
    const existing = await Competition.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      season: { $regex: new RegExp(`^${trimmedSeason}$`, 'i') }
    });

    if (existing) {
      return res.status(400).json({ message: 'A competition with this name and season already exists' });
    }

    const competition = new Competition({
      name: trimmedName,
      country: country.trim(),
      season: trimmedSeason,
      startDate,
      endDate,
      status: status || 'Active',
      logo
    });

    const createdCompetition = await competition.save();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Created',
        entityType: 'Competition',
        entityId: createdCompetition._id,
        newValue: { name: createdCompetition.name, country: createdCompetition.country, season: createdCompetition.season }
      });
    }

    res.status(201).json(createdCompetition);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update competition
// @route   PUT /api/competitions/:id
// @access  Private/Admin
const updateCompetition = async (req, res) => {
  const { name, country, season, startDate, endDate, status, logo } = req.body;

  if (!name || !country || !season || !startDate || !endDate) {
    return res.status(400).json({ message: 'Name, country, season, start date, and end date are required' });
  }
  
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ message: 'End date cannot be before start date' });
  }

  try {
    const competition = await Competition.findById(req.params.id);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const trimmedName = name.trim();
    const trimmedSeason = season.trim();

    // Check duplicate name and season on other competitions
    const duplicate = await Competition.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      season: { $regex: new RegExp(`^${trimmedSeason}$`, 'i') }
    });

    if (duplicate) {
      return res.status(400).json({ message: 'Another competition with this name and season already exists' });
    }

    const oldValue = competition.toObject();

    competition.name = trimmedName;
    competition.country = country.trim();
    competition.season = trimmedSeason;
    competition.startDate = startDate;
    competition.endDate = endDate;
    if (status) competition.status = status;
    if (logo !== undefined) competition.logo = logo;
    
    const updatedCompetition = await competition.save();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Updated',
        entityType: 'Competition',
        entityId: updatedCompetition._id,
        oldValue: { name: oldValue.name, status: oldValue.status },
        newValue: { name: updatedCompetition.name, status: updatedCompetition.status }
      });
    }

    res.json(updatedCompetition);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete competition
// @route   DELETE /api/competitions/:id
// @access  Private/Admin
const deleteCompetition = async (req, res) => {
  try {
    const competition = await Competition.findById(req.params.id);
    if (!competition) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    // Check dependencies
    const teamsCount = await Team.countDocuments({ competition: competition._id });
    const matchesCount = await Match.countDocuments({ competition: competition._id });

    if (teamsCount > 0 || matchesCount > 0) {
      return res.status(400).json({
        message: `Cannot delete competition. It is currently referenced by ${teamsCount} team(s) and ${matchesCount} match(es).`
      });
    }

    const oldValue = competition.toObject();
    await competition.deleteOne();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Deleted',
        entityType: 'Competition',
        entityId: competition._id,
        oldValue: { name: oldValue.name, country: oldValue.country, season: oldValue.season }
      });
    }

    res.json({ message: 'Competition removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCompetitions,
  getCompetition,
  createCompetition,
  updateCompetition,
  deleteCompetition,
};
