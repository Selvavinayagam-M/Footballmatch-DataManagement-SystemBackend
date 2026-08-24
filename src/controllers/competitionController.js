const Competition = require('../models/Competition');
const Match = require('../models/Match');
const Team = require('../models/Team');

// @desc    Get all competitions
// @route   GET /api/competitions
// @access  Private
const getCompetitions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.query.search) {
      query = {
        $or: [
          { name: { $regex: req.query.search, $options: 'i' } },
          { country: { $regex: req.query.search, $options: 'i' } }
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
      competitions,
      page,
      pages: Math.ceil(total / limit),
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
    const competition = new Competition({ name, country, season, startDate, endDate, status: status || 'Active', logo });
    const createdCompetition = await competition.save();
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
    if (competition) {
      competition.name = name;
      competition.country = country;
      competition.season = season;
      competition.startDate = startDate;
      competition.endDate = endDate;
      if (status) competition.status = status;
      if (logo !== undefined) competition.logo = logo;
      
      const updatedCompetition = await competition.save();
      res.json(updatedCompetition);
    } else {
      res.status(404).json({ message: 'Competition not found' });
    }
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
    if (competition) {
      await competition.deleteOne();
      res.json({ message: 'Competition removed' });
    } else {
      res.status(404).json({ message: 'Competition not found' });
    }
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
