const Discrepancy = require('../models/Discrepancy');
const Match = require('../models/Match');
const Squad = require('../models/Squad');
const MatchEvent = require('../models/MatchEvent');
const Player = require('../models/Player');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');

const getDiscrepancies = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.severity) query.severity = req.query.severity;
    if (req.query.category) query.category = req.query.category;
    if (req.query.match) query.match = req.query.match;
    if (req.query.assignedTo) query.assignedTo = req.query.assignedTo;
    
    if (req.query.search) {
      query.description = { $regex: req.query.search, $options: 'i' };
    }

    if (req.user && req.user.role === 'collector') {
      query.$or = [{ reportedBy: req.user._id }, { assignedTo: req.user._id }];
    }

    const count = await Discrepancy.countDocuments(query);
    const discrepancies = await Discrepancy.find(query)
      .populate({
        path: 'match',
        populate: [
          { path: 'homeTeam', select: 'name shortName' },
          { path: 'awayTeam', select: 'name shortName' },
          { path: 'competition', select: 'name' }
        ]
      })
      .populate('reportedBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('resolvedBy', 'name email role')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
      
    res.json({
      success: true,
      discrepancies,
      data: discrepancies, // backwards compatibility
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit) || 1,
      totalPages: Math.ceil(count / limit) || 1
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDiscrepancy = async (req, res) => {
  try {
    const discrepancy = await Discrepancy.findById(req.params.id)
      .populate({
        path: 'match',
        populate: [
          { path: 'homeTeam', select: 'name shortName logo' },
          { path: 'awayTeam', select: 'name shortName logo' },
          { path: 'competition', select: 'name' }
        ]
      })
      .populate('reportedBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('resolvedBy', 'name email role');

    if (!discrepancy) return res.status(404).json({ message: 'Discrepancy not found' });
    res.json(discrepancy);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createDiscrepancy = async (req, res) => {
  try {
    const { match, category, description, severity, assignedTo } = req.body;

    if (!match || !category || !description || !severity) {
      return res.status(400).json({ message: 'Match, category, description, and severity are required.' });
    }

    // Prevent duplicate discrepancy records for the same issue in Open or In Review status
    const existing = await Discrepancy.findOne({
      match,
      category,
      description: { $regex: new RegExp(`^${description.trim()}$`, 'i') },
      status: { $in: ['Open', 'In Review'] }
    });

    if (existing) {
      return res.status(400).json({ 
        message: 'A duplicate open discrepancy record already exists for this issue.',
        existingId: existing._id
      });
    }

    const discrepancy = new Discrepancy({
      ...req.body,
      reportedBy: req.user._id,
      status: 'Open'
    });

    const createdDiscrepancy = await discrepancy.save();

    // Create Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Created',
        entityType: 'Discrepancy',
        entityId: createdDiscrepancy._id,
        oldValue: null,
        newValue: {
          category: createdDiscrepancy.category,
          severity: createdDiscrepancy.severity,
          description: createdDiscrepancy.description,
          match: createdDiscrepancy.match
        }
      });
    }

    // Create Notification if assigned to someone
    if (createdDiscrepancy.assignedTo) {
      await Notification.create({
        recipient: createdDiscrepancy.assignedTo,
        type: 'Discrepancy Assigned',
        title: 'Discrepancy Assigned',
        message: `You have been assigned to investigate a ${createdDiscrepancy.severity} severity discrepancy: "${createdDiscrepancy.description}"`,
        link: '/discrepancies',
        metadata: { discrepancyId: createdDiscrepancy._id, matchId: createdDiscrepancy.match }
      });
    }
    
    // Update Match coverageStatus to 'Needs Review' if High or Critical
    if (severity === 'High' || severity === 'Critical') {
      await Match.findByIdAndUpdate(match, { coverageStatus: 'Needs Review' });
    }

    res.status(201).json(createdDiscrepancy);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateDiscrepancy = async (req, res) => {
  try {
    const discrepancy = await Discrepancy.findById(req.params.id);
    if (!discrepancy) return res.status(404).json({ message: 'Discrepancy not found' });

    const oldValues = discrepancy.toObject();

    if (req.body.assignedTo !== undefined) discrepancy.assignedTo = req.body.assignedTo || null;
    if (req.body.status) discrepancy.status = req.body.status;
    if (req.body.severity) discrepancy.severity = req.body.severity;
    if (req.body.description) discrepancy.description = req.body.description;
    if (req.body.sourceValue !== undefined) discrepancy.sourceValue = req.body.sourceValue;
    if (req.body.systemValue !== undefined) discrepancy.systemValue = req.body.systemValue;
    
    const updatedDiscrepancy = await discrepancy.save();

    // Create Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: req.body.assignedTo && req.body.assignedTo !== oldValues.assignedTo?.toString() ? 'Assigned' : 'Updated',
        entityType: 'Discrepancy',
        entityId: discrepancy._id,
        oldValue: {
          assignedTo: oldValues.assignedTo,
          status: oldValues.status,
          severity: oldValues.severity,
          description: oldValues.description
        },
        newValue: {
          assignedTo: updatedDiscrepancy.assignedTo,
          status: updatedDiscrepancy.status,
          severity: updatedDiscrepancy.severity,
          description: updatedDiscrepancy.description
        }
      });
    }

    // Notification on reassignment
    if (req.body.assignedTo && req.body.assignedTo !== oldValues.assignedTo?.toString()) {
      await Notification.create({
        recipient: req.body.assignedTo,
        type: 'Discrepancy Assigned',
        title: 'Discrepancy Assigned',
        message: `You have been assigned to resolve a ${discrepancy.severity} severity discrepancy.`,
        link: '/discrepancies',
        metadata: { discrepancyId: discrepancy._id, matchId: discrepancy.match }
      });
    }

    res.json(updatedDiscrepancy);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const resolveDiscrepancy = async (req, res) => {
  try {
    const discrepancy = await Discrepancy.findById(req.params.id);
    if (!discrepancy) return res.status(404).json({ message: 'Discrepancy not found' });

    const { status, resolution } = req.body;
    if (!status || !['Resolved', 'Rejected', 'Open', 'In Review'].includes(status)) {
      return res.status(400).json({ message: 'Status must be Resolved, Rejected, Open, or In Review.' });
    }

    const wasStatus = discrepancy.status;
    discrepancy.status = status;
    discrepancy.resolution = resolution || (status === 'Resolved' ? 'Issue verified and corrected.' : status === 'Rejected' ? 'Rejected after inspection.' : '');
    discrepancy.resolvedBy = ['Resolved', 'Rejected'].includes(status) ? req.user._id : null;
    discrepancy.resolvedAt = ['Resolved', 'Rejected'].includes(status) ? new Date() : null;
    
    const resolvedDiscrepancy = await discrepancy.save();

    // Create Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: status === 'Resolved' ? 'Resolved' : status === 'Rejected' ? 'Rejected' : 'Updated',
        entityType: 'Discrepancy',
        entityId: discrepancy._id,
        oldValue: { status: wasStatus, resolution: null },
        newValue: {
          status: resolvedDiscrepancy.status,
          resolution: resolvedDiscrepancy.resolution,
          resolvedBy: req.user._id,
          resolvedAt: resolvedDiscrepancy.resolvedAt
        }
      });
    }

    // Notification to original reporter
    if (discrepancy.reportedBy && discrepancy.reportedBy.toString() !== req.user._id.toString() && ['Resolved', 'Rejected'].includes(status)) {
      await Notification.create({
        recipient: discrepancy.reportedBy,
        type: 'General',
        title: `Discrepancy ${status}`,
        message: `Discrepancy reported by you has been marked as ${status}. Resolution: ${discrepancy.resolution}`,
        link: '/discrepancies',
        metadata: { discrepancyId: discrepancy._id }
      });
    }

    // Check if remaining open issues on this match
    const remainingOpen = await Discrepancy.countDocuments({
      match: discrepancy.match,
      status: { $in: ['Open', 'In Review'] }
    });

    if (remainingOpen === 0) {
      const parentMatch = await Match.findById(discrepancy.match);
      if (parentMatch && parentMatch.coverageStatus === 'Needs Review') {
        parentMatch.coverageStatus = 'Completed';
        await parentMatch.save();
      }
    }

    res.json(resolvedDiscrepancy);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteDiscrepancy = async (req, res) => {
  try {
    const discrepancy = await Discrepancy.findById(req.params.id);
    if (!discrepancy) return res.status(404).json({ message: 'Discrepancy not found' });

    const oldValues = discrepancy.toObject();
    await discrepancy.deleteOne();

    // Create Audit Log
    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'Deleted',
        entityType: 'Discrepancy',
        entityId: discrepancy._id,
        oldValue: oldValues,
        newValue: null
      });
    }

    res.json({ message: 'Discrepancy deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Automatic Data Quality Scanner for Match
const scanMatchDataQuality = async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findById(matchId).populate('homeTeam awayTeam');
    if (!match) return res.status(404).json({ message: 'Match not found' });

    const detectedAnomalies = [];

    // 1. Check Score Integrity (computed vs recorded score)
    const events = await MatchEvent.find({ match: matchId });
    let computedHomeScore = 0;
    let computedAwayScore = 0;

    for (const ev of events) {
      const type = ev.type || ev.eventType;
      if (['Goal', 'Penalty'].includes(type)) {
        if (ev.team?.toString() === match.homeTeam._id.toString()) computedHomeScore++;
        else if (ev.team?.toString() === match.awayTeam._id.toString()) computedAwayScore++;
      } else if (type === 'Own Goal') {
        if (ev.team?.toString() === match.homeTeam._id.toString()) computedAwayScore++;
        else if (ev.team?.toString() === match.awayTeam._id.toString()) computedHomeScore++;
      }

      // 2. Check Event Team participation
      if (ev.team && ev.team.toString() !== match.homeTeam._id.toString() && ev.team.toString() !== match.awayTeam._id.toString()) {
        detectedAnomalies.push({
          category: 'Match Event',
          severity: 'Critical',
          description: `Event at minute ${ev.minute}' references a non-participating team.`,
          sourceValue: ev.team.toString(),
          systemValue: `${match.homeTeam.name} / ${match.awayTeam.name}`
        });
      }

      // 3. Check Event Minute
      if (ev.minute < 0) {
        detectedAnomalies.push({
          category: 'Match Event',
          severity: 'High',
          description: `Event has invalid negative minute: ${ev.minute}'.`,
          sourceValue: String(ev.minute),
          systemValue: '>= 0'
        });
      }
    }

    if (match.homeScore !== computedHomeScore || match.awayScore !== computedAwayScore) {
      detectedAnomalies.push({
        category: 'Score',
        severity: 'High',
        description: `Recorded score (${match.homeScore}-${match.awayScore}) does not match event goals calculation (${computedHomeScore}-${computedAwayScore}).`,
        sourceValue: `${match.homeScore}-${match.awayScore}`,
        systemValue: `${computedHomeScore}-${computedAwayScore}`
      });
    }

    // 4. Check Squads
    const squads = await Squad.find({ match: matchId }).populate('startingXI substitutes');
    for (const sq of squads) {
      if (!sq.startingXI || sq.startingXI.length !== 11) {
        detectedAnomalies.push({
          category: 'Squad',
          severity: 'High',
          description: `Squad Starting XI has ${sq.startingXI?.length || 0} players instead of 11.`,
          sourceValue: String(sq.startingXI?.length || 0),
          systemValue: '11'
        });
      }

      // Duplicate in squad
      const allPlayerIds = [...(sq.startingXI || []), ...(sq.substitutes || [])].map(p => p._id ? p._id.toString() : p.toString());
      const uniqueIds = new Set(allPlayerIds);
      if (uniqueIds.size !== allPlayerIds.length) {
        detectedAnomalies.push({
          category: 'Squad',
          severity: 'Critical',
          description: 'Duplicate player detected between Starting XI and Substitutes.',
          sourceValue: 'Duplicate',
          systemValue: 'Unique roster'
        });
      }
    }

    // Create non-duplicate discrepancy records for detected issues
    const createdDiscrepancies = [];
    for (const anomaly of detectedAnomalies) {
      const existing = await Discrepancy.findOne({
        match: matchId,
        category: anomaly.category,
        description: anomaly.description,
        status: { $in: ['Open', 'In Review'] }
      });

      if (!existing) {
        const newDisc = await Discrepancy.create({
          match: matchId,
          category: anomaly.category,
          severity: anomaly.severity,
          description: anomaly.description,
          sourceValue: anomaly.sourceValue,
          systemValue: anomaly.systemValue,
          reportedBy: req.user._id,
          status: 'Open'
        });
        createdDiscrepancies.push(newDisc);
      }
    }

    res.json({
      success: true,
      anomaliesFound: detectedAnomalies.length,
      createdCount: createdDiscrepancies.length,
      anomalies: detectedAnomalies,
      createdDiscrepancies
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDiscrepancies,
  getDiscrepancy,
  createDiscrepancy,
  updateDiscrepancy,
  resolveDiscrepancy,
  deleteDiscrepancy,
  scanMatchDataQuality
};
