const Match = require('../models/Match');
const Squad = require('../models/Squad');
const MatchEvent = require('../models/MatchEvent');
const Discrepancy = require('../models/Discrepancy');
const Player = require('../models/Player');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { createSystemNotification } = require('../services/notificationService');

// GET /api/verification/matches - Filter matches by QA Tab
const getVerificationMatches = async (req, res) => {
  try {
    const { tab } = req.query; // 'Pending', 'Approved', 'Rejected', 'Correction Required'
    const query = {};

    if (tab === 'Approved') {
      query.coverageStatus = { $in: ['Approved', 'Completed'] };
    } else if (tab === 'Rejected') {
      query.coverageStatus = 'Rejected';
    } else if (tab === 'Correction Required') {
      query.coverageStatus = 'Correction Required';
    } else {
      // Pending (Default): Needs Review, Not Started, or In Progress
      query.coverageStatus = { $in: ['Needs Review', 'Not Started', 'In Progress'] };
    }

    if (req.user && req.user.role === 'collector') {
      query.dataCollector = req.user._id;
    }

    const matches = await Match.find(query)
      .populate('competition', 'name logo')
      .populate('homeTeam', 'name shortName logo')
      .populate('awayTeam', 'name shortName logo')
      .populate('dataCollector', 'name email role')
      .populate('qaReviewer', 'name email role')
      .populate('reviewedBy', 'name email role')
      .sort({ scheduledDate: -1, updatedAt: -1 });

    res.json({ success: true, count: matches.length, matches });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/verification/match/:id/full-package - Complete QA Review Package
const getMatchReviewPackage = async (req, res) => {
  try {
    const { id } = req.params;

    const match = await Match.findById(id)
      .populate('competition', 'name logo')
      .populate('homeTeam', 'name shortName logo')
      .populate('awayTeam', 'name shortName logo')
      .populate('dataCollector', 'name email')
      .populate('qaReviewer', 'name email')
      .populate('reviewedBy', 'name email');

    if (!match) return res.status(404).json({ message: 'Match not found' });

    // 1. Fetch Squads
    const squads = await Squad.find({ match: id })
      .populate('team', 'name shortName')
      .populate('startingXI', 'displayName jerseyNumber position verificationStatus')
      .populate('substitutes', 'displayName jerseyNumber position verificationStatus');

    // 2. Fetch Events
    const events = await MatchEvent.find({ match: id })
      .populate('team', 'name shortName')
      .populate('player', 'displayName jerseyNumber')
      .populate('assistPlayer', 'displayName')
      .populate('playerIn', 'displayName jerseyNumber')
      .populate('playerOut', 'displayName jerseyNumber')
      .sort({ minute: 1 });

    // 3. Fetch Discrepancies
    const discrepancies = await Discrepancy.find({ match: id })
      .populate('reportedBy', 'name role')
      .populate('assignedTo', 'name role')
      .sort({ createdAt: -1 });

    // 4. Fetch Home & Away Player rosters
    const homePlayers = await Player.find({ team: match.homeTeam._id }).sort({ jerseyNumber: 1 });
    const awayPlayers = await Player.find({ team: match.awayTeam._id }).sort({ jerseyNumber: 1 });

    res.json({
      match,
      squads,
      events,
      discrepancies,
      rosters: {
        home: homePlayers,
        away: awayPlayers
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/verification/match/:id/action - Approve, Reject, Request Correction, Add Comment
const handleQAAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comments } = req.body;

    const match = await Match.findById(id);
    if (!match) return res.status(404).json({ message: 'Match not found' });

    const previousStatus = match.coverageStatus;

    if (action === 'Approve') {
      match.coverageStatus = 'Approved';
      match.qaReviewer = req.user._id;
      match.reviewedBy = req.user._id;
      match.reviewedAt = new Date();
      if (comments) match.qaComments = comments;
      await match.save();

      // Automatically verify all events and squads for this match
      await MatchEvent.updateMany({ match: id }, { verified: true });
      await Squad.updateMany({ match: id }, { status: 'Verified', checkedBy: req.user._id, checkedAt: new Date() });

      // Create Audit Log
      await AuditLog.create({
        user: req.user._id,
        action: 'Verified',
        entityType: 'Match',
        entityId: match._id,
        oldValue: { coverageStatus: previousStatus },
        newValue: { coverageStatus: 'Approved', qaComments: comments }
      });

      // Send Real Notification to Collector
      if (match.dataCollector) {
        await createSystemNotification({
          recipient: match.dataCollector,
          type: 'Match Approved',
          title: 'Match Approved by QA',
          message: `QA has approved the match dataset for match ${match._id}.`,
          link: '/verification'
        });
      }

      return res.json({ success: true, message: 'Match package approved by QA.', match });
    }

    if (action === 'Reject') {
      match.coverageStatus = 'Rejected';
      match.qaReviewer = req.user._id;
      match.reviewedBy = req.user._id;
      match.reviewedAt = new Date();
      if (comments) match.qaComments = comments;
      await match.save();

      // Create Audit Log
      await AuditLog.create({
        user: req.user._id,
        action: 'Rejected',
        entityType: 'Match',
        entityId: match._id,
        oldValue: { coverageStatus: previousStatus },
        newValue: { coverageStatus: 'Rejected', qaComments: comments }
      });

      return res.json({ success: true, message: 'Match package rejected by QA.', match });
    }

    if (action === 'Request Correction') {
      match.coverageStatus = 'Correction Required';
      match.qaReviewer = req.user._id;
      match.reviewedBy = req.user._id;
      match.reviewedAt = new Date();
      if (comments) match.qaComments = comments;
      await match.save();

      // Also create a high severity discrepancy assigned to data collector
      await Discrepancy.create({
        match: match._id,
        category: 'Match',
        severity: 'High',
        description: `QA Correction Requested: ${comments || 'Review issues with match data and resubmit.'}`,
        reportedBy: req.user._id,
        assignedTo: match.dataCollector || undefined,
        status: 'Open'
      });

      // Create Audit Log
      await AuditLog.create({
        user: req.user._id,
        action: 'Updated',
        entityType: 'Match',
        entityId: match._id,
        oldValue: { coverageStatus: previousStatus },
        newValue: { coverageStatus: 'Correction Required', qaComments: comments }
      });

      // Send Real Notification to Collector
      if (match.dataCollector) {
        await createSystemNotification({
          recipient: match.dataCollector,
          type: 'Correction Requested',
          title: 'QA Requested Correction',
          message: comments || 'QA Reviewer requested adjustments to your collected match data.',
          link: '/verification'
        });
      }

      return res.json({ success: true, message: 'Correction requested. Match dispatched back to collector.', match });
    }

    if (action === 'Add Comment') {
      if (comments) match.qaComments = comments;
      await match.save();

      await AuditLog.create({
        user: req.user._id,
        action: 'Updated',
        entityType: 'Match',
        entityId: match._id,
        oldValue: null,
        newValue: { qaComments: comments }
      });

      return res.json({ success: true, message: 'QA comment recorded.', match });
    }

    res.status(400).json({ message: 'Invalid QA action specified.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/verification/match/:id/submit - Collector submits or resubmits for QA
const submitForQA = async (req, res) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id);
    if (!match) return res.status(404).json({ message: 'Match not found' });

    const previousStatus = match.coverageStatus;
    match.coverageStatus = 'Needs Review';
    await match.save();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Updated',
      entityType: 'Match',
      entityId: match._id,
      oldValue: { coverageStatus: previousStatus },
      newValue: { coverageStatus: 'Needs Review' }
    });

    // Notify QA Reviewer (or any QA user if unassigned)
    let qaTarget = match.qaReviewer;
    if (!qaTarget) {
      const anyQA = await User.findOne({ role: 'qa', status: 'active' });
      if (anyQA) qaTarget = anyQA._id;
    }

    if (qaTarget) {
      await createSystemNotification({
        recipient: qaTarget,
        type: 'Verification Submitted',
        title: 'Match Submitted for Verification',
        message: 'A match package has been submitted by the collector for QA review.',
        link: '/verification'
      });
    }

    res.json({ success: true, message: 'Match submitted for QA verification.', match });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getVerificationMatches,
  getMatchReviewPackage,
  handleQAAction,
  submitForQA
};
