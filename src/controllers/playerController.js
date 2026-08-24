const Player = require('../models/Player');
const Team = require('../models/Team');
const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');

const getPlayers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.team) query.team = req.query.team;
    if (req.query.position) query.position = req.query.position;
    
    if (req.query.search) {
      query.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
        { displayName: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    let sortQuery = { displayName: 1 };
    if (req.query.sort) {
      const [field, order] = req.query.sort.split(':');
      sortQuery = { [field]: order === 'desc' ? -1 : 1 };
    }
    
    const count = await Player.countDocuments(query);
    const players = await Player.find(query)
      .populate('team', 'name shortName')
      .skip(skip)
      .limit(limit)
      .sort(sortQuery);
      
    res.json({
      players,
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPlayer = async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).populate('team', 'name shortName logo country');
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Match Participation (where player was in starting XI or substitute)
    // Note: The Match schema likely has startingXI and substitutes arrays for home/away.
    // If not, we approximate participation by checking events for now, or match lineups if available.
    // For this CMS, we will aggregate MatchEvents to find participation and events.
    
    const matchEvents = await MatchEvent.find({ player: player._id })
      .populate('match', 'homeTeam awayTeam scheduledDate status')
      .sort({ minute: -1 });

    const Squad = require('../models/Squad');
    const squadHistory = await Squad.find({ 
      $or: [{ startingXI: player._id }, { substitutes: player._id }] 
    })
    .populate('match', 'homeTeam awayTeam scheduledDate status')
    .sort({ createdAt: -1 });

    const participatedMatchIds = [...new Set(squadHistory.map(s => s.match?._id.toString()).filter(Boolean))];
    
    const matchParticipation = await Match.find({ _id: { $in: participatedMatchIds } })
      .populate('homeTeam', 'name shortName')
      .populate('awayTeam', 'name shortName')
      .sort({ scheduledDate: -1 });

    res.json({
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

  const duplicateJersey = await Player.findOne({ team, jerseyNumber, _id: { $ne: excludeId } });
  if (duplicateJersey) throw new Error('Duplicate jersey number within the team');

  const duplicatePlayer = await Player.findOne({ team, firstName, lastName, _id: { $ne: excludeId } });
  if (duplicatePlayer) throw new Error('A player with this name already exists in the selected team');
};

const createPlayer = async (req, res) => {
  const { firstName, lastName, displayName, dateOfBirth, nationality, position, jerseyNumber, team } = req.body;
  if (!firstName || !lastName || !displayName || !dateOfBirth || !nationality || !position || jerseyNumber === undefined || !team) {
    return res.status(400).json({ message: 'Missing required player fields' });
  }

  try {
    await validatePlayer(req.body);
    const player = new Player(req.body);
    const createdPlayer = await player.save();
    res.status(201).json(createdPlayer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updatePlayer = async (req, res) => {
  const { firstName, lastName, displayName, dateOfBirth, nationality, position, jerseyNumber, team } = req.body;
  if (!firstName || !lastName || !displayName || !dateOfBirth || !nationality || !position || jerseyNumber === undefined || !team) {
    return res.status(400).json({ message: 'Missing required player fields' });
  }

  try {
    await validatePlayer(req.body, req.params.id);
    const player = await Player.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (player) {
      res.json(player);
    } else {
      res.status(404).json({ message: 'Player not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deletePlayer = async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (player) {
      await player.deleteOne();
      res.json({ message: 'Player deleted' });
    } else {
      res.status(404).json({ message: 'Player not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPlayers, getPlayer, createPlayer, updatePlayer, deletePlayer };
