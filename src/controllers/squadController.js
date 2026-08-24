const Squad = require('../models/Squad');
const Player = require('../models/Player');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');

const validateSquadPlayers = (startingXI, substitutes) => {
  if (!startingXI || startingXI.length !== 11) {
    return `Starting XI must have exactly 11 players.`;
  }
  
  const startingIds = startingXI.map(id => id.toString());
  const uniqueStarting = new Set(startingIds);
  if (uniqueStarting.size !== startingIds.length) {
    return 'Duplicate players found in Starting XI.';
  }

  if (substitutes && substitutes.length > 0) {
    const subIds = substitutes.map(id => id.toString());
    const uniqueSubs = new Set(subIds);
    if (uniqueSubs.size !== subIds.length) {
      return 'Duplicate players found in Substitutes.';
    }

    const overlap = startingIds.filter(id => uniqueSubs.has(id));
    if (overlap.length > 0) {
      return 'A player cannot be in both Starting XI and Substitutes.';
    }
  }
  
  return null;
};

const getSquads = async (req, res) => {
  try {
    const query = {};
    if (req.query.matchId || req.query.match) query.match = req.query.matchId || req.query.match;
    if (req.query.teamId || req.query.team) query.team = req.query.teamId || req.query.team;
    if (req.query.status) query.status = req.query.status;

    const squads = await Squad.find(query)
      .populate({
        path: 'match',
        populate: [
          { path: 'homeTeam', select: 'name shortName' },
          { path: 'awayTeam', select: 'name shortName' },
          { path: 'competition', select: 'name' }
        ]
      })
      .populate('team', 'name shortName logo')
      .populate('startingXI', 'displayName position jerseyNumber team')
      .populate('substitutes', 'displayName position jerseyNumber team')
      .populate('checkedBy', 'name email role')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, data: squads, squads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSquadById = async (req, res) => {
  try {
    const squad = await Squad.findById(req.params.id)
      .populate({
        path: 'match',
        populate: [
          { path: 'homeTeam', select: 'name shortName' },
          { path: 'awayTeam', select: 'name shortName' },
          { path: 'competition', select: 'name' }
        ]
      })
      .populate('team', 'name shortName logo')
      .populate('startingXI', 'displayName position jerseyNumber team')
      .populate('substitutes', 'displayName position jerseyNumber team')
      .populate('checkedBy', 'name email role')
      .populate('createdBy', 'name email role');

    if (!squad) return res.status(404).json({ success: false, message: 'Squad not found' });
    res.json({ success: true, data: squad, squad });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createSquad = async (req, res) => {
  try {
    const { match, team, startingXI, substitutes } = req.body;
    
    const errorMsg = validateSquadPlayers(startingXI, substitutes);
    if (errorMsg) return res.status(400).json({ success: false, message: errorMsg });
    
    // Check if squad already exists for this match and team
    const existing = await Squad.findOne({ match, team });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Squad already exists for this team in this match.' });
    }

    const squad = new Squad({
      match,
      team,
      startingXI,
      substitutes,
      createdBy: req.user._id,
      status: 'Pending'
    });

    const createdSquad = await squad.save();
    res.status(201).json({ success: true, data: createdSquad });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateSquad = async (req, res) => {
  try {
    const { startingXI, substitutes, status } = req.body;

    if (startingXI) {
      const errorMsg = validateSquadPlayers(startingXI, substitutes || []);
      if (errorMsg) return res.status(400).json({ success: false, message: errorMsg });
    }

    const squad = await Squad.findById(req.params.id);
    if (squad) {
      if (startingXI) squad.startingXI = startingXI;
      if (substitutes) squad.substitutes = substitutes;
      if (status) squad.status = status;
      
      const updatedSquad = await squad.save();
      res.json({ success: true, data: updatedSquad });
    } else {
      res.status(404).json({ success: false, message: 'Squad not found' });
    }
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteSquad = async (req, res) => {
  try {
    const squad = await Squad.findById(req.params.id);
    if (!squad) return res.status(404).json({ success: false, message: 'Squad not found' });
    
    await squad.deleteOne();
    res.json({ success: true, message: 'Squad deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const runSquadCheck = async (req, res) => {
  try {
    const squad = await Squad.findById(req.params.id)
      .populate('team')
      .populate('startingXI')
      .populate('substitutes');

    if (!squad) return res.status(404).json({ success: false, message: 'Squad not found' });
    
    const match = await Match.findById(squad.match);
    if (!match) return res.status(404).json({ success: false, message: 'Associated match not found' });
    
    const issues = [];
    
    // 1. Validate team belongs to selected match
    if (match.homeTeam.toString() !== squad.team._id.toString() && match.awayTeam.toString() !== squad.team._id.toString()) {
      issues.push(`Selected team (${squad.team.name}) does not participate in this match.`);
    }

    // 2. Validate Starting XI Count (Exactly 11)
    const startingCount = squad.startingXI ? squad.startingXI.length : 0;
    if (startingCount !== 11) {
      issues.push(`Starting XI has only ${startingCount} player${startingCount === 1 ? '' : 's'}. Must be exactly 11.`);
    }

    // 3. Validate Starting XI Players (Existence, Duplicates, Team Belonging)
    const startIds = new Set();
    if (squad.startingXI) {
      for (const p of squad.startingXI) {
        if (!p) {
          issues.push('Invalid or non-existent player reference found in Starting XI.');
          continue;
        }
        if (startIds.has(p._id.toString())) {
          issues.push(`Player ${p.displayName} appears twice in Starting XI.`);
        }
        startIds.add(p._id.toString());
        
        if (p.team.toString() !== squad.team._id.toString()) {
          issues.push(`Player ${p.displayName} does not belong to ${squad.team.name}.`);
        }
      }
    }

    // 4. Validate Substitutes (Limit, Duplicates, Overlap, Team Belonging)
    const subIds = new Set();
    const MAX_SUBS = 9;
    if (squad.substitutes) {
      if (squad.substitutes.length > MAX_SUBS) {
        issues.push(`Substitute count (${squad.substitutes.length}) exceeds the maximum allowed limit of ${MAX_SUBS}.`);
      }
      for (const p of squad.substitutes) {
        if (!p) {
          issues.push('Invalid or non-existent player reference found in substitutes.');
          continue;
        }
        if (subIds.has(p._id.toString())) {
          issues.push(`Duplicate player detected in substitutes: ${p.displayName}.`);
        }
        subIds.add(p._id.toString());
        
        if (startIds.has(p._id.toString())) {
          issues.push(`Player ${p.displayName} appears in both Starting XI and substitutes.`);
        }
        
        if (p.team.toString() !== squad.team._id.toString()) {
          issues.push(`Substitute player ${p.displayName} does not belong to ${squad.team.name}.`);
        }
      }
    }
    
    squad.checkedBy = req.user._id;
    squad.checkedAt = new Date();
    squad.issues = issues;

    if (issues.length > 0) {
      squad.status = 'Mismatch';
      await squad.save();
      return res.json({ 
        success: true, 
        data: { 
          verified: false, 
          issues, 
          status: 'Mismatch',
          issueCount: issues.length
        } 
      });
    }
    
    squad.status = 'Verified';
    await squad.save();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Verified',
      entityType: 'Squad',
      entityId: squad._id,
      oldValue: { status: 'Pending' },
      newValue: { status: 'Verified', checkedAt: squad.checkedAt }
    });
    
    res.json({ 
      success: true, 
      data: { 
        verified: true, 
        issues: [],
        message: 'Squad verified successfully. All 7 validation rules satisfied.', 
        status: 'Verified' 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const requestCorrection = async (req, res) => {
  try {
    const squad = await Squad.findById(req.params.id);
    if (!squad) return res.status(404).json({ success: false, message: 'Squad not found' });

    const notes = req.body.notes || 'Squad roster requires correction.';
    squad.status = 'Correction Requested';
    squad.correctionNotes = notes;
    squad.checkedBy = req.user._id;
    squad.checkedAt = new Date();
    await squad.save();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Rejected',
      entityType: 'Squad',
      entityId: squad._id,
      oldValue: { status: squad.status },
      newValue: { status: 'Correction Requested', notes }
    });

    res.json({
      success: true,
      message: 'Correction requested and squad dispatched back to Data Collector.',
      squad
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifySquad = async (req, res) => {
  try {
    const squad = await Squad.findById(req.params.id);
    if (!squad) return res.status(404).json({ success: false, message: 'Squad not found' });

    squad.status = 'Verified';
    squad.checkedBy = req.user._id;
    squad.checkedAt = new Date();
    squad.issues = [];
    await squad.save();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Verified',
      entityType: 'Squad',
      entityId: squad._id,
      oldValue: null,
      newValue: { status: 'Verified' }
    });

    res.json({ success: true, message: 'Squad verified successfully by QA.', squad });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { 
  getSquads, 
  getSquadById, 
  createSquad, 
  updateSquad, 
  deleteSquad, 
  runSquadCheck,
  requestCorrection,
  verifySquad
};
