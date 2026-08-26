const Player = require('../models/Player');
const Team = require('../models/Team');
const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const Squad = require('../models/Squad');
const AuditLog = require('../models/AuditLog');

// @desc    Get players with pagination, search, filter, sort, and unpaginated dropdown mode
// @route   GET /api/players
// @access  Private
const getPlayers = async (req, res) => {
  try {
    const isAll = req.query.limit === 'all' || req.query.all === 'true';
    const page = Number(req.query.page) || 1;
    const limit = isAll ? 0 : (Number(req.query.limit) || 10);
    const skip = isAll ? 0 : (page - 1) * limit;

    const query = {};
    if (req.query.team) query.team = req.query.team;
    if (req.query.position) query.position = req.query.position;
    if (req.query.status) query.status = { $regex: new RegExp(`^${req.query.status.trim()}$`, 'i') };
    if (req.query.verificationStatus) query.verificationStatus = req.query.verificationStatus;
    
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { displayName: searchRegex },
        { nationality: searchRegex }
      ];
    }
    
    let sortQuery = { displayName: 1 };
    if (req.query.sort) {
      const [field, order] = req.query.sort.split(':');
      sortQuery = { [field]: order === 'desc' ? -1 : 1 };
    }
    
    const count = await Player.countDocuments(query);
    let playerQuery = Player.find(query)
      .populate('team', 'name shortName logo country')
      .sort(sortQuery);

    if (!isAll && limit > 0) {
      playerQuery = playerQuery.skip(skip).limit(limit);
    }

    const players = await playerQuery;
      
    res.json({
      success: true,
      players,
      page: isAll ? 1 : page,
      limit: isAll ? count : limit,
      total: count,
      pages: isAll ? 1 : (Math.ceil(count / limit) || 1)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single player with match events, participation, and squad history
// @route   GET /api/players/:id
// @access  Private
const getPlayer = async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).populate('team', 'name shortName logo country');
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    const matchEvents = await MatchEvent.find({ player: player._id })
      .populate({
        path: 'match',
        select: 'homeTeam awayTeam scheduledDate status',
        populate: [
          { path: 'homeTeam', select: 'name shortName' },
          { path: 'awayTeam', select: 'name shortName' }
        ]
      })
      .sort({ minute: -1 });

    const squadHistory = await Squad.find({ 
      $or: [{ startingXI: player._id }, { substitutes: player._id }] 
    })
    .populate({
      path: 'match',
      select: 'homeTeam awayTeam scheduledDate status',
      populate: [
        { path: 'homeTeam', select: 'name shortName' },
        { path: 'awayTeam', select: 'name shortName' }
      ]
    })
    .sort({ createdAt: -1 });

    const participatedMatchIds = [...new Set(squadHistory.map(s => s.match?._id?.toString()).filter(Boolean))];
    
    const matchParticipation = await Match.find({ _id: { $in: participatedMatchIds } })
      .populate('homeTeam', 'name shortName')
      .populate('awayTeam', 'name shortName')
      .populate('competition', 'name')
      .sort({ scheduledDate: -1 });

    res.json({
      success: true,
      ...player.toObject(),
      matchEvents,
      matchParticipation,
      squadHistory
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const validatePlayer = async (body, excludeId = null) => {
  const { firstName, lastName, jerseyNumber, team, position } = body;
  
  const teamExists = await Team.findById(team);
  if (!teamExists) throw new Error('Invalid team selected');
  
  const validPositions = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
  if (!validPositions.includes(position)) throw new Error('Invalid position');

  const duplicateJersey = await Player.findOne({ 
    team, 
    jerseyNumber: Number(jerseyNumber), 
    _id: { $ne: excludeId } 
  });
  if (duplicateJersey) throw new Error(`Jersey number ${jerseyNumber} is already assigned in this team`);

  const duplicatePlayer = await Player.findOne({ 
    team, 
    firstName: { $regex: new RegExp(`^${firstName.trim()}$`, 'i') }, 
    lastName: { $regex: new RegExp(`^${lastName.trim()}$`, 'i') }, 
    _id: { $ne: excludeId } 
  });
  if (duplicatePlayer) throw new Error('A player with this first and last name already exists in the selected team');
};

// @desc    Create player
// @route   POST /api/players
// @access  Private (Admin, Collector)
const createPlayer = async (req, res) => {
  const { firstName, lastName, displayName, dateOfBirth, nationality, position, jerseyNumber, preferredFoot, team, status, verificationStatus } = req.body;
  if (!firstName || !lastName || !displayName || !dateOfBirth || !nationality || !position || jerseyNumber === undefined || !team) {
    return res.status(400).json({ message: 'Missing required player fields' });
  }

  try {
    await validatePlayer(req.body);
    const player = new Player({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      displayName: displayName.trim(),
      dateOfBirth: new Date(dateOfBirth),
      nationality: nationality.trim(),
      position,
      jerseyNumber: Number(jerseyNumber),
      preferredFoot: preferredFoot || 'Right',
      team,
      status: status || 'Active',
      verificationStatus: verificationStatus || 'Pending'
    });
    
    const createdPlayer = await player.save();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Created',
        entityType: 'Player',
        entityId: createdPlayer._id,
        newValue: { displayName: createdPlayer.displayName, team, jerseyNumber: createdPlayer.jerseyNumber }
      });
    }

    res.status(201).json(createdPlayer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update player
// @route   PUT /api/players/:id
// @access  Private (Admin, Collector, QA)
const updatePlayer = async (req, res) => {
  const { firstName, lastName, displayName, dateOfBirth, nationality, position, jerseyNumber, preferredFoot, team, status, verificationStatus } = req.body;
  if (!firstName || !lastName || !displayName || !dateOfBirth || !nationality || !position || jerseyNumber === undefined || !team) {
    return res.status(400).json({ message: 'Missing required player fields' });
  }

  try {
    const existing = await Player.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Player not found' });
    }

    await validatePlayer(req.body, req.params.id);

    const oldValue = existing.toObject();

    existing.firstName = firstName.trim();
    existing.lastName = lastName.trim();
    existing.displayName = displayName.trim();
    existing.dateOfBirth = new Date(dateOfBirth);
    existing.nationality = nationality.trim();
    existing.position = position;
    existing.jerseyNumber = Number(jerseyNumber);
    if (preferredFoot) existing.preferredFoot = preferredFoot;
    existing.team = team;
    if (status) existing.status = status;
    if (verificationStatus) existing.verificationStatus = verificationStatus;

    const updatedPlayer = await existing.save();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Updated',
        entityType: 'Player',
        entityId: updatedPlayer._id,
        oldValue: { displayName: oldValue.displayName, status: oldValue.status, verificationStatus: oldValue.verificationStatus },
        newValue: { displayName: updatedPlayer.displayName, status: updatedPlayer.status, verificationStatus: updatedPlayer.verificationStatus }
      });
    }

    res.json(updatedPlayer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete player
// @route   DELETE /api/players/:id
// @access  Private/Admin
const deletePlayer = async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Check relational dependencies in match events and squads
    const eventCount = await MatchEvent.countDocuments({ player: player._id });
    const squadCount = await Squad.countDocuments({ 
      $or: [{ startingXI: player._id }, { substitutes: player._id }] 
    });

    if (eventCount > 0 || squadCount > 0) {
      return res.status(400).json({
        message: `Cannot delete player. Referenced in ${eventCount} match event(s) and ${squadCount} official match squad(s).`
      });
    }

    const oldValue = player.toObject();
    await player.deleteOne();

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Deleted',
        entityType: 'Player',
        entityId: player._id,
        oldValue: { displayName: oldValue.displayName, team: oldValue.team }
      });
    }

    res.json({ message: 'Player deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPlayers, getPlayer, createPlayer, updatePlayer, deletePlayer };
