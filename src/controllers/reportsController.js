const Discrepancy = require('../models/Discrepancy');
const Match = require('../models/Match');
const Player = require('../models/Player');
const MatchEvent = require('../models/MatchEvent');
const Competition = require('../models/Competition');
const Team = require('../models/Team');
const Squad = require('../models/Squad');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const getDashboardStats = async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (role === 'admin') {
      const totalCompetitions = await Competition.countDocuments();
      const totalTeams = await Team.countDocuments();
      const totalPlayers = await Player.countDocuments();
      const totalMatches = await Match.countDocuments();
      const matchesToday = await Match.countDocuments({ scheduledDate: { $gte: today, $lt: tomorrow } });
      const liveMatches = await Match.countDocuments({ status: 'Live' });
      const completedMatches = await Match.countDocuments({ status: { $in: ['Full Time', 'Finished'] } });
      const pendingQA = await Match.countDocuments({ coverageStatus: 'Needs Review' });
      const openDiscrepancies = await Discrepancy.countDocuments({ status: 'Open' });
      const resolvedDiscrepancies = await Discrepancy.countDocuments({ status: 'Resolved' });
      const totalDiscrepancies = await Discrepancy.countDocuments();
      
      const overallAccuracy = totalDiscrepancies === 0 
        ? 100 
        : Math.max(0, Math.min(100, Math.round(100 - (openDiscrepancies / totalDiscrepancies * 100))));
      
      const coverageCompletion = totalMatches === 0 
        ? 100 
        : Math.min(100, Math.round((completedMatches / totalMatches) * 100));

      const matchesByStatus = await Match.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
      const verificationStatus = await Match.aggregate([{ $group: { _id: '$coverageStatus', count: { $sum: 1 } } }]);
      const discrepanciesBySeverity = await Discrepancy.aggregate([{ $group: { _id: '$severity', count: { $sum: 1 } } }]);
      
      const dailyDataCollection = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        const completed = await Match.countDocuments({ updatedAt: { $gte: d, $lt: nextDay }, status: { $in: ['Full Time', 'Finished'] } });
        dailyDataCollection.push({ name: d.toLocaleDateString('en-US', { weekday: 'short' }), completed });
      }

      const collectorPerformance = await Match.aggregate([
        { $match: { dataCollector: { $exists: true, $ne: null } } },
        { $group: { _id: '$dataCollector', matches: { $sum: 1 } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { name: '$user.name', matches: 1 } },
        { $sort: { matches: -1 } },
        { $limit: 5 }
      ]);

      const recentActivity = await AuditLog.find({})
        .populate('user', 'name role')
        .sort({ timestamp: -1, createdAt: -1 })
        .limit(6);

      return res.json({
        totalCompetitions, totalTeams, totalPlayers, totalMatches, matchesToday, liveMatches, completedMatches,
        pendingQA, openDiscrepancies, resolvedDiscrepancies, overallAccuracy, coverageCompletion,
        matchesByStatus, verificationStatus, discrepanciesBySeverity, dailyDataCollection, collectorPerformance,
        recentActivity
      });
    } 
    
    else if (role === 'collector') {
      const myAssignedMatches = await Match.countDocuments({ dataCollector: userId });
      const matchesToday = await Match.countDocuments({ scheduledDate: { $gte: today, $lt: tomorrow }, dataCollector: userId });
      const liveMatches = await Match.countDocuments({ dataCollector: userId, status: 'Live' });
      const pendingDataEntry = await Match.countDocuments({ dataCollector: userId, coverageStatus: 'In Progress' });
      const completedMatches = await Match.countDocuments({ dataCollector: userId, status: { $in: ['Full Time', 'Finished'] } });
      const myOpenDiscrepancies = await Discrepancy.countDocuments({ reportedBy: userId, status: 'Open' });
      
      const myApproved = await Match.countDocuments({ dataCollector: userId, coverageStatus: 'Approved' });
      const myReviewed = await Match.countDocuments({ dataCollector: userId, coverageStatus: { $in: ['Approved', 'Correction Required'] } });
      const myAccuracy = myReviewed === 0 ? 100 : Math.round((myApproved / myReviewed) * 100);
      const myCompletionRate = myAssignedMatches === 0 ? 100 : Math.min(100, Math.round((completedMatches / myAssignedMatches) * 100));

      const myFixtures = await Match.find({ dataCollector: userId })
        .populate('competition', 'name')
        .populate('homeTeam', 'name shortName')
        .populate('awayTeam', 'name shortName')
        .sort({ scheduledDate: 1 })
        .limit(10);

      return res.json({
        myAssignedMatches, matchesToday, liveMatches, pendingDataEntry, completedMatches,
        myOpenDiscrepancies, myAccuracy, myCompletionRate, myFixtures
      });
    } 
    
    else if (role === 'qa') {
      const pendingVerification = await Match.countDocuments({ coverageStatus: 'Needs Review' });
      const correctionRequired = await Match.countDocuments({ coverageStatus: 'Correction Required' });
      const openDiscrepancies = await Discrepancy.countDocuments({ status: 'Open' });
      const squadsAwaitingCheck = await Squad.countDocuments({ status: { $in: ['Pending', 'Mismatch'] } });
      const matchesAwaitingQA = pendingVerification;
      const verifiedToday = await Match.countDocuments({ coverageStatus: 'Approved', updatedAt: { $gte: today } });
      const rejectedToday = await Match.countDocuments({ coverageStatus: 'Correction Required', updatedAt: { $gte: today } });
      
      const totalQAHandled = verifiedToday + rejectedToday;
      const qualityAccuracy = totalQAHandled === 0 ? 100 : Math.round((verifiedToday / totalQAHandled) * 100);

      const pendingQATable = await Match.find({ coverageStatus: 'Needs Review' })
        .populate('dataCollector', 'name')
        .populate('homeTeam', 'name shortName')
        .populate('awayTeam', 'name shortName')
        .sort({ updatedAt: -1 })
        .limit(10);

      return res.json({
        pendingVerification, correctionRequired, openDiscrepancies, squadsAwaitingCheck,
        matchesAwaitingQA, verifiedToday, rejectedToday, qualityAccuracy, pendingQATable
      });
    }

    res.status(403).json({ message: 'Role not supported for dashboard' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getQualityReports = async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user._id;
    const { preset, startDate, endDate } = req.query;

    let start = null;
    let end = new Date();
    end.setHours(23, 59, 59, 999);

    const now = new Date();

    if (preset === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (preset === 'yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    } else if (preset === '7days') {
      start = new Date();
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (preset === '30days') {
      start = new Date();
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else if (preset === 'custom' && startDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }
    }

    const dateFilter = start ? { createdAt: { $gte: start, $lte: end } } : {};
    const matchDateFilter = start ? { scheduledDate: { $gte: start, $lte: end } } : {};

    const matchQuery = { ...matchDateFilter };
    const eventQuery = { ...dateFilter };
    const squadQuery = { ...dateFilter };
    const discQuery = { ...dateFilter };

    if (role === 'collector') {
      matchQuery.dataCollector = userId;
      eventQuery.createdBy = userId;
      squadQuery.createdBy = userId;
      discQuery.$or = [{ reportedBy: userId }, { assignedTo: userId }];
    }

    const totalMatches = await Match.countDocuments(matchQuery);
    const totalEvents = await MatchEvent.countDocuments(eventQuery);
    const totalSquads = await Squad.countDocuments(squadQuery);

    const totalRecords = totalMatches + totalEvents + totalSquads;

    const approvedMatches = await Match.countDocuments({ ...matchQuery, coverageStatus: { $in: ['Approved', 'Completed'] } });
    const verifiedEvents = await MatchEvent.countDocuments({ ...eventQuery, verified: true });
    const verifiedSquads = await Squad.countDocuments({ ...squadQuery, status: 'Verified' });
    const verifiedRecords = approvedMatches + verifiedEvents + verifiedSquads;

    const rejectedMatches = await Match.countDocuments({ ...matchQuery, coverageStatus: 'Rejected' });
    const rejectedDiscrepancies = await Discrepancy.countDocuments({ ...discQuery, status: 'Rejected' });
    const rejectedRecords = rejectedMatches + rejectedDiscrepancies;

    const correctionRequiredMatches = await Match.countDocuments({ ...matchQuery, coverageStatus: 'Correction Required' });
    const correctionSquads = await Squad.countDocuments({ ...squadQuery, status: 'Correction Requested' });
    const correctionRequired = correctionRequiredMatches + correctionSquads;

    const openDiscrepancies = await Discrepancy.countDocuments({ ...discQuery, status: { $in: ['Open', 'In Review'] } });
    const resolvedDiscrepancies = await Discrepancy.countDocuments({ ...discQuery, status: 'Resolved' });

    const accuracyRate = totalRecords === 0 
      ? 100 
      : Math.min(100, Math.max(0, Math.round(((totalRecords - openDiscrepancies) / totalRecords) * 100)));

    const coverageRate = totalMatches === 0 
      ? 100 
      : Math.round((approvedMatches / totalMatches) * 100);

    const byCategoryRaw = await Discrepancy.aggregate([
      { $match: discQuery },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const byCategory = byCategoryRaw.map(c => ({ name: c._id || 'Other', value: c.count }));

    const bySeverityRaw = await Discrepancy.aggregate([
      { $match: discQuery },
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);
    const bySeverity = bySeverityRaw.map(s => ({ name: s._id || 'Low', value: s.count }));

    const pendingCount = Math.max(0, totalRecords - verifiedRecords - rejectedRecords - correctionRequired);
    const verificationResults = [
      { name: 'Verified', value: verifiedRecords, fill: '#10b981' },
      { name: 'Correction Required', value: correctionRequired, fill: '#f59e0b' },
      { name: 'Rejected', value: rejectedRecords, fill: '#f43f5e' },
      { name: 'Pending Review', value: pendingCount, fill: '#64748b' }
    ];

    const matchCoverageRaw = await Match.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$coverageStatus', count: { $sum: 1 } } }
    ]);
    const matchCoverage = matchCoverageRaw.map(m => ({ name: m._id || 'Not Started', value: m.count }));

    const eventVolumeRaw = await MatchEvent.aggregate([
      { $match: eventQuery },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const eventVolume = eventVolumeRaw.map(e => ({ name: e._id, value: e.count }));

    const dailyRecords = [];
    const daysToShow = preset === '30days' ? 14 : (preset === 'yesterday' || preset === 'today' ? 1 : 7);
    
    for (let i = daysToShow - 1; i >= 0; i--) {
      const dayStart = new Date(end);
      dayStart.setDate(end.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const mCount = await Match.countDocuments({ ...matchQuery, scheduledDate: { $gte: dayStart, $lte: dayEnd } });
      const eCount = await MatchEvent.countDocuments({ ...eventQuery, createdAt: { $gte: dayStart, $lte: dayEnd } });
      const sCount = await Squad.countDocuments({ ...squadQuery, createdAt: { $gte: dayStart, $lte: dayEnd } });

      dailyRecords.push({
        date: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Matches: mCount,
        Events: eCount,
        Squads: sCount,
        Total: mCount + eCount + sCount
      });
    }

    res.json({
      success: true,
      role,
      dateRange: { start, end, preset: preset || 'all' },
      metrics: {
        totalRecords,
        verifiedRecords,
        rejectedRecords,
        correctionRequired,
        openDiscrepancies,
        resolvedDiscrepancies,
        accuracyRate,
        coverageRate
      },
      charts: {
        byCategory,
        bySeverity,
        verificationResults,
        matchCoverage,
        eventVolume,
        dailyRecords
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/reports/collector OR /api/collector-kpis
const getCollectorPerformance = async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user._id;

    if (role === 'qa') {
      return res.status(403).json({ message: 'QA role is not authorized to access Collector KPI management.' });
    }

    const { preset, startDate, endDate } = req.query;

    let start = null;
    let end = new Date();
    end.setHours(23, 59, 59, 999);

    const now = new Date();
    if (preset === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (preset === 'yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    } else if (preset === '7days') {
      start = new Date();
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (preset === '30days') {
      start = new Date();
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else if (preset === 'custom' && startDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }
    }

    const matchDateFilter = start ? { scheduledDate: { $gte: start, $lte: end } } : {};
    const dateFilter = start ? { createdAt: { $gte: start, $lte: end } } : {};

    let targetUsers = [];
    if (role === 'admin') {
      targetUsers = await User.find({ role: { $in: ['collector', 'admin'] } }).select('_id name email role');
    } else if (role === 'collector') {
      targetUsers = await User.find({ _id: userId }).select('_id name email role');
    }

    const collectors = [];

    for (const u of targetUsers) {
      const uId = u._id;

      const matchesAssigned = await Match.countDocuments({
        ...matchDateFilter,
        dataCollector: uId
      });

      const matchesCompleted = await Match.countDocuments({
        ...matchDateFilter,
        dataCollector: uId,
        coverageStatus: { $in: ['Completed', 'Approved'] }
      });

      const eventsEntered = await MatchEvent.countDocuments({
        ...dateFilter,
        createdBy: uId
      });

      const squadsEntered = await Squad.countDocuments({
        ...dateFilter,
        createdBy: uId
      });

      const recordsEntered = matchesAssigned + eventsEntered + squadsEntered;

      const verifiedEvents = await MatchEvent.countDocuments({
        ...dateFilter,
        createdBy: uId,
        verified: true
      });

      const verifiedSquads = await Squad.countDocuments({
        ...dateFilter,
        createdBy: uId,
        status: 'Verified'
      });

      const recordsVerified = matchesCompleted + verifiedEvents + verifiedSquads;

      const discrepanciesRaised = await Discrepancy.countDocuments({
        ...dateFilter,
        $or: [{ reportedBy: uId }, { assignedTo: uId }]
      });

      const discrepanciesResolved = await Discrepancy.countDocuments({
        ...dateFilter,
        $or: [{ reportedBy: uId }, { assignedTo: uId }],
        status: 'Resolved'
      });

      const accuracyPercentage = recordsEntered === 0 
        ? 100 
        : Math.min(100, Math.max(0, Math.round(((recordsEntered - (discrepanciesRaised - discrepanciesResolved)) / (recordsEntered || 1)) * 100)));

      const completionPercentage = matchesAssigned === 0 
        ? 100 
        : Math.round((matchesCompleted / matchesAssigned) * 100);

      collectors.push({
        _id: uId,
        collector: {
          id: uId,
          name: u.name,
          email: u.email,
          role: u.role
        },
        collectorName: u.name,
        collectorEmail: u.email,
        matchesAssigned,
        matchesCompleted,
        recordsEntered,
        recordsVerified,
        discrepanciesRaised,
        discrepanciesResolved,
        accuracyPercentage,
        completionPercentage
      });
    }

    const collectorAccuracy = collectors.map(c => ({ name: c.collectorName, accuracy: c.accuracyPercentage }));
    const collectorCompletion = collectors.map(c => ({ name: c.collectorName, completion: c.completionPercentage }));
    const recordsCollected = collectors.map(c => ({ name: c.collectorName, records: c.recordsEntered, verified: c.recordsVerified }));
    const discrepanciesPerCollector = collectors.map(c => ({ name: c.collectorName, raised: c.discrepanciesRaised, resolved: c.discrepanciesResolved }));

    res.json({
      success: true,
      role,
      dateRange: { start, end, preset: preset || 'all' },
      collectors,
      singleCollector: role === 'collector' ? collectors[0] : null,
      charts: {
        collectorAccuracy,
        collectorCompletion,
        recordsCollected,
        discrepanciesPerCollector
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllEvents = async (req, res) => {
  try {
    const events = await MatchEvent.find({})
      .populate('match', 'homeTeam awayTeam')
      .populate('team', 'name shortName')
      .populate('player', 'displayName')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDashboardStats,
  getQualityReports,
  getCollectorPerformance,
  getAllEvents
};
