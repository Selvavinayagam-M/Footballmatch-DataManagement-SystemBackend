const MatchEvent = require('../models/MatchEvent');
const Match = require('../models/Match');
const Player = require('../models/Player');
const AuditLog = require('../models/AuditLog');

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

const validateMatchEvent = async (body, matchId) => {
  const { minute, team, player, assistPlayer, playerIn, playerOut } = body;

  // 1. Minute validation
  if (minute === undefined || minute === null || Number(minute) < 0) {
    throw new Error('Event minute must be a valid non-negative number.');
  }

  // Find match
  const match = await Match.findById(matchId);
  if (!match) {
    throw new Error('Match not found.');
  }

  // 2. Team participates in match
  if (team) {
    const homeTeamId = match.homeTeam.toString();
    const awayTeamId = match.awayTeam.toString();
    const eventTeamId = team.toString();

    if (eventTeamId !== homeTeamId && eventTeamId !== awayTeamId) {
      throw new Error('Event team does not participate in this match.');
    }

    // 3. Player belongs to event team
    if (player) {
      const p = await Player.findById(player);
      if (!p) throw new Error('Player not found.');
      if (p.team.toString() !== eventTeamId) {
        throw new Error(`Player ${p.displayName} does not belong to the selected team.`);
      }
    }

    if (assistPlayer) {
      const ap = await Player.findById(assistPlayer);
      if (!ap) throw new Error('Assist player not found.');
      if (ap.team.toString() !== eventTeamId) {
        throw new Error(`Assist player ${ap.displayName} does not belong to the selected team.`);
      }
    }

    // 4. Substitution player validation
    if (playerOut) {
      const pOut = await Player.findById(playerOut);
      if (!pOut) throw new Error('Player Out not found.');
      if (pOut.team.toString() !== eventTeamId) {
        throw new Error(`Substitution player ${pOut.displayName} (Out) does not belong to the selected team.`);
      }
    }

    if (playerIn) {
      const pIn = await Player.findById(playerIn);
      if (!pIn) throw new Error('Player In not found.');
      if (pIn.team.toString() !== eventTeamId) {
        throw new Error(`Substitution player ${pIn.displayName} (In) does not belong to the selected team.`);
      }
    }
  }
};

// GET /api/match-events - List all match events with search, filter, pagination
const getAllMatchEvents = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.match) query.match = req.query.match;
    if (req.query.team) query.team = req.query.team;
    if (req.query.player) {
      query.$or = [
        { player: req.query.player },
        { assistPlayer: req.query.player },
        { playerIn: req.query.player },
        { playerOut: req.query.player }
      ];
    }
    if (req.query.eventType) query.eventType = req.query.eventType;
    if (req.query.verified !== undefined && req.query.verified !== '') {
      query.verified = req.query.verified === 'true';
    }

    if (req.query.search) {
      query.description = { $regex: req.query.search, $options: 'i' };
    }

    const count = await MatchEvent.countDocuments(query);
    const events = await MatchEvent.find(query)
      .populate({
        path: 'match',
        populate: [
          { path: 'homeTeam', select: 'name shortName' },
          { path: 'awayTeam', select: 'name shortName' },
          { path: 'competition', select: 'name' }
        ]
      })
      .populate('team', 'name shortName')
      .populate('player', 'displayName jerseyNumber position')
      .populate('assistPlayer', 'displayName jerseyNumber')
      .populate('playerIn', 'displayName jerseyNumber')
      .populate('playerOut', 'displayName jerseyNumber')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      events,
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/match-events/:id - Get single event
const getMatchEventById = async (req, res) => {
  try {
    const event = await MatchEvent.findById(req.params.id)
      .populate({
        path: 'match',
        populate: [
          { path: 'homeTeam', select: 'name shortName' },
          { path: 'awayTeam', select: 'name shortName' },
          { path: 'competition', select: 'name' }
        ]
      })
      .populate('team', 'name shortName')
      .populate('player', 'displayName jerseyNumber position')
      .populate('assistPlayer', 'displayName')
      .populate('playerIn', 'displayName jerseyNumber')
      .populate('playerOut', 'displayName jerseyNumber')
      .populate('createdBy', 'name email');

    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/match-events - Create match event
const createMatchEvent = async (req, res) => {
  try {
    const { match } = req.body;
    if (!match) return res.status(400).json({ message: 'Match ID is required.' });

    await validateMatchEvent(req.body, match);

    const event = new MatchEvent({
      ...req.body,
      createdBy: req.user._id
    });

    const createdEvent = await event.save();
    await recalculateMatchScore(match);

    res.status(201).json(createdEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/match-events/:id - Update / Correct match event + create AuditLog
const updateMatchEvent = async (req, res) => {
  try {
    const event = await MatchEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    const matchId = req.body.match || event.match;
    await validateMatchEvent(req.body, matchId);

    const oldValues = event.toObject();

    const updatedEvent = await MatchEvent.findByIdAndUpdate(
      req.params.id,
      { ...req.body, match: matchId },
      { new: true, runValidators: true }
    );

    // Create Audit Log for event correction
    await AuditLog.create({
      user: req.user._id,
      action: 'Updated',
      entityType: 'MatchEvent',
      entityId: event._id,
      oldValue: {
        eventType: oldValues.eventType,
        minute: oldValues.minute,
        additionalMinute: oldValues.additionalMinute,
        team: oldValues.team,
        player: oldValues.player,
        description: oldValues.description
      },
      newValue: {
        eventType: updatedEvent.eventType,
        minute: updatedEvent.minute,
        additionalMinute: updatedEvent.additionalMinute,
        team: updatedEvent.team,
        player: updatedEvent.player,
        description: updatedEvent.description
      }
    });

    // Auto-update match score
    await recalculateMatchScore(matchId);

    res.json(updatedEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/match-events/:id/verify - Verify match event + create AuditLog
const verifyMatchEvent = async (req, res) => {
  try {
    const event = await MatchEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    const wasVerified = event.verified;
    event.verified = true;
    await event.save();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Verified',
      entityType: 'MatchEvent',
      entityId: event._id,
      oldValue: { verified: wasVerified },
      newValue: { verified: true }
    });

    res.json({ message: 'Event verified successfully', event });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/match-events/:id - Delete match event + create AuditLog
const deleteMatchEvent = async (req, res) => {
  try {
    const event = await MatchEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    const matchId = event.match;
    const oldValues = event.toObject();

    await event.deleteOne();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Deleted',
      entityType: 'MatchEvent',
      entityId: event._id,
      oldValue: oldValues,
      newValue: null
    });

    // Recalculate score
    await recalculateMatchScore(matchId);

    res.json({ message: 'Event deleted and score recalculated.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllMatchEvents,
  getMatchEventById,
  createMatchEvent,
  updateMatchEvent,
  verifyMatchEvent,
  deleteMatchEvent,
  recalculateMatchScore,
  validateMatchEvent
};
