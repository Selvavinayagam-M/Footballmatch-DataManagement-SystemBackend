const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const Team = require('../models/Team');
const Squad = require('../models/Squad');
const AuditLog = require('../models/AuditLog');

// @desc    Get matches with search, filters, pagination, and unpaginated dropdown support
// @route   GET /api/matches
// @access  Private
const getMatches = async (req, res) => {
  try {
    const isAll = req.query.limit === 'all' || req.query.all === 'true';
    const page = Number(req.query.page) || 1;
    const limit = isAll ? 0 : (Number(req.query.limit) || 10);
    const skip = isAll ? 0 : (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.coverageStatus) query.coverageStatus = req.query.coverageStatus;
    if (req.query.competition) query.competition = req.query.competition;
    
    if (req.query.team) {
      query.$or = [{ homeTeam: req.query.team }, { awayTeam: req.query.team }];
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [
        { venue: searchRegex },
        { season: searchRegex },
        { referee: searchRegex }
      ];
    }

    if (req.query.date) {
      const startDate = new Date(req.query.date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(req.query.date);
      endDate.setHours(23, 59, 59, 999);
      query.scheduledDate = { $gte: startDate, $lte: endDate };
    }

    // Collector specific filter if explicitly requested
    if (req.query.myMatches === 'true' && req.user) {
      query.dataCollector = req.user._id;
    }

    const count = await Match.countDocuments(query);
    let matchQuery = Match.find(query)
      .populate('competition', 'name logo country season')
      .populate('homeTeam', 'name shortName logo country')
      .populate('awayTeam', 'name shortName logo country')
      .populate('dataCollector', 'name email role')
      .populate('qaReviewer', 'name email role')
      .sort({ scheduledDate: 1, scheduledTime: 1 });

    if (!isAll && limit > 0) {
      matchQuery = matchQuery.skip(skip).limit(limit);
    }

    const matches = await matchQuery;

    res.json({
      success: true,
      matches,
      page: isAll ? 1 : page,
      limit: isAll ? count : limit,
      total: count,
      pages: isAll ? 1 : (Math.ceil(count / limit) || 1)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single match details with populated teams, competition, collector, QA
// @route   GET /api/matches/:id
// @access  Private
const getMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('competition', 'name logo country season')
      .populate('homeTeam', 'name shortName logo stadium city')
      .populate('awayTeam', 'name shortName logo stadium city')
      .populate('dataCollector', 'name email')
      .populate('qaReviewer', 'name email')
      .populate('reviewedBy', 'name email');
      
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    res.json(match);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const validateMatch = async (body, excludeId = null) => {
  const { competition, homeTeam, awayTeam, scheduledDate, scheduledTime, season } = body;
  
  if (!competition) throw new Error('Competition is required');
  if (!season) throw new Error('Season is required');
  if (!homeTeam || !awayTeam) throw new Error('Home team and away team are required');
  if (!scheduledDate) throw new Error('Match date is required');
  if (!scheduledTime) throw new Error('Kickoff time is required');
  
  if (homeTeam.toString() === awayTeam.toString()) {
    throw new Error('Home team and away team cannot be the same');
  }

  // Cross-reference teams to check competition mapping
  const home = await Team.findById(homeTeam);
  const away = await Team.findById(awayTeam);
  
  if (!home || !away) throw new Error('Invalid team selected');
  
  if (home.competition && home.competition.toString() !== competition.toString()) {
    throw new Error(`Home team (${home.name}) does not belong to the selected competition`);
  }
  if (away.competition && away.competition.toString() !== competition.toString()) {
    throw new Error(`Away team (${away.name}) does not belong to the selected competition`);
  }

  // Check duplicate match on same date
  const matchDate = new Date(scheduledDate);
  const start = new Date(matchDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(matchDate);
  end.setHours(23, 59, 59, 999);

  const existingMatch = await Match.findOne({
    competition,
    homeTeam,
    awayTeam,
    scheduledDate: { $gte: start, $lte: end },
    _id: { $ne: excludeId }
  });

  if (existingMatch) {
    throw new Error('A match between these two teams is already scheduled on this date in this competition');
  }
};

// @desc    Create match
// @route   POST /api/matches
// @access  Private/Admin
const createMatch = async (req, res) => {
  try {
    await validateMatch(req.body);
    const match = new Match({
      ...req.body,
      scheduledDate: new Date(req.body.scheduledDate)
    });
    const createdMatch = await match.save();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Created',
        entityType: 'Match',
        entityId: createdMatch._id,
        newValue: { homeTeam: createdMatch.homeTeam, awayTeam: createdMatch.awayTeam, scheduledDate: createdMatch.scheduledDate }
      });
    }

    res.status(201).json(createdMatch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update match
// @route   PUT /api/matches/:id
// @access  Private (Admin, Collector, QA)
const updateMatch = async (req, res) => {
  try {
    const existing = await Match.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Match not found' });
    }

    if (req.body.homeTeam && req.body.awayTeam && req.body.competition) {
      await validateMatch(req.body, req.params.id);
    }

    const oldValue = existing.toObject();

    if (req.body.scheduledDate) {
      req.body.scheduledDate = new Date(req.body.scheduledDate);
    }

    const updatedMatch = await Match.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('competition', 'name logo')
      .populate('homeTeam', 'name shortName logo')
      .populate('awayTeam', 'name shortName logo')
      .populate('dataCollector', 'name')
      .populate('qaReviewer', 'name');

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Updated',
        entityType: 'Match',
        entityId: updatedMatch._id,
        oldValue: { status: oldValue.status, coverageStatus: oldValue.coverageStatus, homeScore: oldValue.homeScore, awayScore: oldValue.awayScore },
        newValue: { status: updatedMatch.status, coverageStatus: updatedMatch.coverageStatus, homeScore: updatedMatch.homeScore, awayScore: updatedMatch.awayScore }
      });
    }

    res.json(updatedMatch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete match
// @route   DELETE /api/matches/:id
// @access  Private/Admin
const deleteMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const oldValue = match.toObject();

    // Cascading cleanup of associated match events and squads
    await MatchEvent.deleteMany({ match: req.params.id });
    await Squad.deleteMany({ match: req.params.id });
    await match.deleteOne();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Deleted',
        entityType: 'Match',
        entityId: match._id,
        oldValue: { competition: oldValue.competition, scheduledDate: oldValue.scheduledDate }
      });
    }

    res.json({ message: 'Match and associated events deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get match events
// @route   GET /api/matches/:id/events
// @access  Private
const getMatchEvents = async (req, res) => {
  try {
    const events = await MatchEvent.find({ match: req.params.id })
      .populate('team', 'name shortName')
      .populate('player', 'displayName jerseyNumber')
      .populate('assistPlayer', 'displayName')
      .populate('playerIn', 'displayName jerseyNumber')
      .populate('playerOut', 'displayName jerseyNumber')
      .sort({ minute: 1, additionalMinute: 1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const recalculateMatchScore = async (matchId) => {
  const match = await Match.findById(matchId);
  if (!match) return;

  const events = await MatchEvent.find({ match: matchId });
  let homeScore = 0;
  let awayScore = 0;

  for (const event of events) {
    const type = event.type || event.eventType;
    if (['Goal', 'Penalty'].includes(type)) {
      if (event.team?.toString() === match.homeTeam.toString()) homeScore++;
      else if (event.team?.toString() === match.awayTeam.toString()) awayScore++;
    } else if (type === 'Own Goal') {
      if (event.team?.toString() === match.homeTeam.toString()) awayScore++;
      else if (event.team?.toString() === match.awayTeam.toString()) homeScore++;
    }
  }

  match.homeScore = homeScore;
  match.awayScore = awayScore;
  await match.save();
};

// @desc    Add match event
// @route   POST /api/matches/:id/events
// @access  Private (Admin, Collector)
const addMatchEvent = async (req, res) => {
  try {
    const matchId = req.params.id;
    const match = await Match.findById(matchId);
    
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    if (req.body.team && req.body.team !== match.homeTeam.toString() && req.body.team !== match.awayTeam.toString()) {
      return res.status(400).json({ message: 'Event team must be one of the teams playing in this match' });
    }

    const event = new MatchEvent({
      ...req.body,
      match: matchId,
      createdBy: req.user._id
    });

    const createdEvent = await event.save();
    
    // Auto-recalculate score
    await recalculateMatchScore(matchId);

    res.status(201).json(createdEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete match event
// @route   DELETE /api/matches/:id/events/:eventId
// @access  Private (Admin, Collector, QA)
const deleteMatchEvent = async (req, res) => {
  try {
    const event = await MatchEvent.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const matchId = event.match;
    await MatchEvent.findByIdAndDelete(req.params.eventId);
    
    await recalculateMatchScore(matchId);
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update match event
// @route   PUT /api/matches/:id/events/:eventId
// @access  Private (Admin, Collector, QA)
const updateMatchEvent = async (req, res) => {
  try {
    const event = await MatchEvent.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const updatedEvent = await MatchEvent.findByIdAndUpdate(req.params.eventId, req.body, { new: true });
    
    await recalculateMatchScore(event.match);
    
    res.json(updatedEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getMatches,
  getMatch,
  createMatch,
  updateMatch,
  deleteMatch,
  getMatchEvents,
  addMatchEvent,
  updateMatchEvent,
  deleteMatchEvent
};
