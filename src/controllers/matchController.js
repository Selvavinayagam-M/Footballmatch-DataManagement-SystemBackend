const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');

const getMatches = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.coverageStatus) query.coverageStatus = req.query.coverageStatus;
    if (req.query.search) {
      query.venue = { $regex: req.query.search, $options: 'i' };
    }
    if (req.query.date) {
      const startDate = new Date(req.query.date);
      startDate.setHours(0,0,0,0);
      const endDate = new Date(req.query.date);
      endDate.setHours(23,59,59,999);
      query.scheduledDate = { $gte: startDate, $lte: endDate };
    }

    if (req.user && req.user.role === 'collector') {
      query.dataCollector = req.user._id;
    } else if (req.user && req.user.role === 'qa') {
      query.$or = [
        { qaReviewer: req.user._id },
        { coverageStatus: { $in: ['Needs Review', 'Correction Required'] } }
      ];
    }

    const count = await Match.countDocuments(query);
    const matches = await Match.find(query)
      .populate('competition', 'name logo')
      .populate('homeTeam', 'name shortName logo')
      .populate('awayTeam', 'name shortName logo')
      .populate('dataCollector', 'name')
      .populate('qaReviewer', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ scheduledDate: 1 });

    res.json({
      matches,
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('competition', 'name logo')
      .populate('homeTeam', 'name shortName logo')
      .populate('awayTeam', 'name shortName logo')
      .populate('dataCollector', 'name email')
      .populate('qaReviewer', 'name email');
      
    if (match) {
      res.json(match);
    } else {
      res.status(404).json({ message: 'Match not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const validateMatch = async (body) => {
  const { competition, homeTeam, awayTeam, scheduledDate, scheduledTime } = body;
  
  if (!competition) throw new Error('Competition is required');
  if (!scheduledDate) throw new Error('Date is required');
  if (!scheduledTime) throw new Error('Kickoff time is required');
  
  if (homeTeam === awayTeam) {
    throw new Error('Home team and away team cannot be the same');
  }

  // Cross-reference teams to check competition mapping
  const Team = require('../models/Team');
  const home = await Team.findById(homeTeam);
  const away = await Team.findById(awayTeam);
  
  if (!home || !away) throw new Error('Invalid team selected');
  if (home.competition.toString() !== competition.toString() || away.competition.toString() !== competition.toString()) {
    throw new Error('Both teams must belong to the selected competition');
  }
};

const createMatch = async (req, res) => {
  try {
    await validateMatch(req.body);
    const match = new Match(req.body);
    const createdMatch = await match.save();
    res.status(201).json(createdMatch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateMatch = async (req, res) => {
  try {
    if (req.body.homeTeam && req.body.awayTeam && req.body.competition) {
      await validateMatch(req.body);
    }
    const match = await Match.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (match) {
      res.json(match);
    } else {
      res.status(404).json({ message: 'Match not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (match) {
      await match.deleteOne();
      // Optional: Delete related events and squads?
      await MatchEvent.deleteMany({ match: req.params.id });
      res.json({ message: 'Match deleted' });
    } else {
      res.status(404).json({ message: 'Match not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
    if (['Goal', 'Penalty'].includes(event.eventType)) {
      if (event.team?.toString() === match.homeTeam.toString()) homeScore++;
      else if (event.team?.toString() === match.awayTeam.toString()) awayScore++;
    } else if (event.eventType === 'Own Goal') {
      if (event.team?.toString() === match.homeTeam.toString()) awayScore++;
      else if (event.team?.toString() === match.awayTeam.toString()) homeScore++;
    }
  }

  match.homeScore = homeScore;
  match.awayScore = awayScore;
  await match.save();
};

const addMatchEvent = async (req, res) => {
  try {
    const matchId = req.params.id;
    const match = await Match.findById(matchId);
    
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    // Event inconsistency check
    if (req.body.team && req.body.team !== match.homeTeam.toString() && req.body.team !== match.awayTeam.toString()) {
      return res.status(400).json({ message: 'Event team must be one of the teams playing in this match' });
    }

    const event = new MatchEvent({
      ...req.body,
      match: matchId,
      createdBy: req.user._id
    });

    const createdEvent = await event.save();
    
    // Auto-update score
    await recalculateMatchScore(matchId);

    res.status(201).json(createdEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteMatchEvent = async (req, res) => {
  try {
    const event = await MatchEvent.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const matchId = event.match;
    await MatchEvent.findByIdAndDelete(req.params.eventId);
    
    // Auto-update score
    await recalculateMatchScore(matchId);
    
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateMatchEvent = async (req, res) => {
  try {
    const event = await MatchEvent.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    const updatedEvent = await MatchEvent.findByIdAndUpdate(req.params.eventId, req.body, { new: true });
    
    // Auto-update score
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
