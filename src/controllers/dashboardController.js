const Bot = require("../models/Bot");
const BotMetric = require("../models/BotMetric");
const BotIssue = require("../models/BotIssue");
const Tenant = require("../models/Tenant");
const { successResponse, errorResponse } = require("../utils/response");

const cleanQueryValue = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const getDashboard = async (req, res) => {
  try {
    const tenantId = cleanQueryValue(req.query.tenantId);
    const botId = cleanQueryValue(req.query.botId);
    const status = cleanQueryValue(req.query.status);
    const useCase = cleanQueryValue(req.query.useCase);

    const botFilter = {};

    if (tenantId) {
      botFilter.tenantId = tenantId;
    }

    if (botId) {
      botFilter._id = botId;
    }

    if (status) {
      botFilter.status = status;
    }

    if (useCase) {
      botFilter.useCase = { $regex: useCase, $options: "i" };
    }

    const bots = await Bot.find(botFilter)
      .populate("tenantId", "name code industry status")
      .sort({ createdAt: -1 });

    const botIds = bots.map((bot) => bot._id);

    const tenantIds = [
      ...new Set(
        bots.map((bot) => bot.tenantId?._id?.toString()).filter(Boolean),
      ),
    ];

    const metrics = await BotMetric.find({
      botId: { $in: botIds },
    });

    const issues = await BotIssue.find({
      botId: { $in: botIds },
      status: { $ne: "resolved" },
    });

    const totalTenants = tenantId ? 1 : await Tenant.countDocuments();

    const totalBots = bots.length;

    const totalConversations = metrics.reduce(
      (sum, item) => sum + (item.totalConversations || 0),
      0,
    );

    const avgSuccessRate = getAverage(metrics, "successRate");
    const avgFallbackRate = getAverage(metrics, "fallbackRate");
    const avgFailureRate = getAverage(metrics, "failureRate");
    const avgDropOffRate = getAverage(metrics, "dropOffRate");

    const criticalBots = metrics.filter(
      (item) => item.healthStatus === "critical",
    ).length;

    const warningBots = metrics.filter(
      (item) => item.healthStatus === "warning",
    ).length;

    const healthyBots = metrics.filter(
      (item) => item.healthStatus === "healthy",
    ).length;

    const openIssues = issues.length;

    const highSeverityIssues = issues.filter((issue) =>
      ["high", "critical"].includes(issue.severity),
    ).length;

    const botList = bots.map((bot) => {
      const metric = metrics.find(
        (item) => item.botId.toString() === bot._id.toString(),
      );

      return {
        _id: bot._id,
        status: bot.status,

        tenantId: bot.tenantId?._id || null,
        tenantName: bot.tenantId?.name || "",
        tenantCode: bot.tenantId?.code || "",
        tenantIndustry: bot.tenantId?.industry || "",

        botName: bot.name,
        useCase: bot.useCase,
        description: bot.description,
        personality: bot.personality,
        channels: bot.channels,
        mockProfile: bot.mockProfile,

        conversations: metric?.totalConversations || 0,
        activeUsers: metric?.activeUsers || 0,
        successRate: metric?.successRate || 0,
        fallbackRate: metric?.fallbackRate || 0,
        failureRate: metric?.failureRate || 0,
        dropOffRate: metric?.dropOffRate || 0,
        avgResponseTime: metric?.avgResponseTime || 0,
        healthScore: metric?.healthScore || 0,
        healthStatus: metric?.healthStatus || "healthy",

        hasIssues:
          (metric?.healthStatus || "healthy") === "critical" ||
          (metric?.healthStatus || "healthy") === "warning",

        createdAt: bot.createdAt,
        updatedAt: bot.updatedAt,
      };
    });

    const summary = {
      totalTenants,
      activeTenants: tenantIds.length,
      totalBots,
      totalConversations,
      avgSuccessRate,
      avgFallbackRate,
      avgFailureRate,
      avgDropOffRate,
      criticalBots,
      warningBots,
      healthyBots,
      openIssues,
      highSeverityIssues,
    };

    const aiInsights = buildStaticInsightCards(botList);

    const insightQuestions = [
      {
        id: "critical_bots",
        label: "Which bots are critical?",
        filter: {
          healthStatus: "critical",
        },
      },
      {
        id: "warning_bots",
        label: "Which bots need attention?",
        filter: {
          healthStatus: "warning",
        },
      },
      {
        id: "high_risk_metrics",
        label: "Which bots have high fallback, failure or drop-off?",
        filter: {
          fallbackRate: ">=30",
          failureRate: ">=25",
          dropOffRate: ">=35",
        },
      },
    ];

    const healthDistribution = [
      {
        status: "healthy",
        count: healthyBots,
      },
      {
        status: "warning",
        count: warningBots,
      },
      {
        status: "critical",
        count: criticalBots,
      },
    ];

    const fallbackTrend = buildMockFallbackTrend(avgFallbackRate);

    return successResponse(res, "Dashboard fetched successfully", {
      filters: {
        tenantId: tenantId || null,
        botId: botId || null,
        status: status || null,
        useCase: useCase || null,
      },
      summary,
      aiInsights,
      insightQuestions,
      aiInsightsProvider: {
        provider: "db_rules",
        usedGemini: false,
        fallbackUsed: false,
        errorType: null,
        message:
          "Dashboard insights are generated from database metrics. Gemini is not used for this section.",
      },
      botList,
      healthDistribution,
      fallbackTrend,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const getAverage = (items, key) => {
  if (!items.length) return 0;

  const total = items.reduce((sum, item) => {
    return sum + Number(item[key] || 0);
  }, 0);

  return Math.round(total / items.length);
};

const buildStaticInsightCards = (botList = []) => {
  const insights = [];

  const criticalBots = botList
    .filter((bot) => bot.healthStatus === "critical")
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 3);

  const warningBots = botList
    .filter((bot) => bot.healthStatus === "warning")
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 3);

  const highRiskMetricBots = botList
    .filter((bot) => {
      return (
        Number(bot.fallbackRate || 0) >= 30 ||
        Number(bot.failureRate || 0) >= 25 ||
        Number(bot.dropOffRate || 0) >= 35
      );
    })
    .sort((a, b) => {
      const aRisk =
        Number(a.fallbackRate || 0) +
        Number(a.failureRate || 0) +
        Number(a.dropOffRate || 0);

      const bRisk =
        Number(b.fallbackRate || 0) +
        Number(b.failureRate || 0) +
        Number(b.dropOffRate || 0);

      return bRisk - aRisk;
    })
    .slice(0, 3);

  criticalBots.forEach((bot) => {
    insights.push({
      id: `critical_${bot._id}`,
      type: "critical_bots",
      severity: "critical",
      tenantId: bot.tenantId,
      tenantName: bot.tenantName,
      tenantCode: bot.tenantCode,
      botId: bot._id,
      botName: bot.botName,
      useCase: bot.useCase,
      title: `${bot.tenantName} / ${bot.botName} is critical`,
      reason: buildReason(bot),
      recommendedAction: buildRecommendedAction(bot),
      metrics: {
        healthScore: bot.healthScore,
        successRate: bot.successRate,
        fallbackRate: bot.fallbackRate,
        failureRate: bot.failureRate,
        dropOffRate: bot.dropOffRate,
        conversations: bot.conversations,
      },
    });
  });

  warningBots.forEach((bot) => {
    insights.push({
      id: `warning_${bot._id}`,
      type: "warning_bots",
      severity: "warning",
      tenantId: bot.tenantId,
      tenantName: bot.tenantName,
      tenantCode: bot.tenantCode,
      botId: bot._id,
      botName: bot.botName,
      useCase: bot.useCase,
      title: `${bot.tenantName} / ${bot.botName} needs attention`,
      reason: buildReason(bot),
      recommendedAction: buildRecommendedAction(bot),
      metrics: {
        healthScore: bot.healthScore,
        successRate: bot.successRate,
        fallbackRate: bot.fallbackRate,
        failureRate: bot.failureRate,
        dropOffRate: bot.dropOffRate,
        conversations: bot.conversations,
      },
    });
  });

  highRiskMetricBots.forEach((bot) => {
    const alreadyAdded = insights.some(
      (item) => item.botId.toString() === bot._id.toString(),
    );

    if (alreadyAdded) {
      return;
    }

    insights.push({
      id: `risk_${bot._id}`,
      type: "high_risk_metrics",
      severity: bot.healthStatus === "healthy" ? "info" : "warning",
      tenantId: bot.tenantId,
      tenantName: bot.tenantName,
      tenantCode: bot.tenantCode,
      botId: bot._id,
      botName: bot.botName,
      useCase: bot.useCase,
      title: `${bot.tenantName} / ${bot.botName} has risky metrics`,
      reason: buildReason(bot),
      recommendedAction: buildRecommendedAction(bot),
      metrics: {
        healthScore: bot.healthScore,
        successRate: bot.successRate,
        fallbackRate: bot.fallbackRate,
        failureRate: bot.failureRate,
        dropOffRate: bot.dropOffRate,
        conversations: bot.conversations,
      },
    });
  });

  return insights.slice(0, 6);
};

const buildReason = (bot) => {
  const reasons = [];

  if (bot.healthStatus === "critical") {
    reasons.push(`health score is critical at ${bot.healthScore}`);
  }

  if (bot.healthStatus === "warning") {
    reasons.push(`health score is in warning range at ${bot.healthScore}`);
  }

  if (Number(bot.successRate || 0) < 60) {
    reasons.push(`success rate is low at ${bot.successRate}%`);
  }

  if (Number(bot.fallbackRate || 0) >= 30) {
    reasons.push(`fallback rate is high at ${bot.fallbackRate}%`);
  }

  if (Number(bot.failureRate || 0) >= 25) {
    reasons.push(`failure rate is high at ${bot.failureRate}%`);
  }

  if (Number(bot.dropOffRate || 0) >= 35) {
    reasons.push(`drop-off rate is high at ${bot.dropOffRate}%`);
  }

  if (!reasons.length) {
    return `The bot currently has a health score of ${bot.healthScore}.`;
  }

  return `The bot needs review because ${reasons.join(", ")}.`;
};

const buildRecommendedAction = (bot) => {
  const actions = [];

  if (Number(bot.fallbackRate || 0) >= 30) {
    actions.push("review unanswered questions and improve intent coverage");
  }

  if (Number(bot.failureRate || 0) >= 25) {
    actions.push("check failed flows, API errors, and backend integrations");
  }

  if (Number(bot.dropOffRate || 0) >= 35) {
    actions.push("simplify bot answers and reduce conversation steps");
  }

  if (Number(bot.successRate || 0) < 60) {
    actions.push("review bot knowledge quality and test key user journeys");
  }

  if (!actions.length) {
    return "Continue monitoring this bot and review conversations if performance changes.";
  }

  return capitalizeFirstLetter([...new Set(actions)].join(", ")) + ".";
};

const capitalizeFirstLetter = (value = "") => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const buildMockFallbackTrend = (avgFallbackRate) => {
  const base = avgFallbackRate || 10;

  return [
    {
      label: "Mon",
      fallbackRate: Math.max(base - 5, 0),
    },
    {
      label: "Tue",
      fallbackRate: Math.max(base - 3, 0),
    },
    {
      label: "Wed",
      fallbackRate: base,
    },
    {
      label: "Thu",
      fallbackRate: base + 2,
    },
    {
      label: "Fri",
      fallbackRate: base + 4,
    },
    {
      label: "Sat",
      fallbackRate: Math.max(base - 2, 0),
    },
    {
      label: "Sun",
      fallbackRate: Math.max(base - 1, 0),
    },
  ];
};

module.exports = {
  getDashboard,
};
