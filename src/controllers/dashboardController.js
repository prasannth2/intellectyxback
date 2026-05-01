const Bot = require("../models/Bot");
const BotMetric = require("../models/BotMetric");
const BotIssue = require("../models/BotIssue");
const Tenant = require("../models/Tenant");
const { successResponse, errorResponse } = require("../utils/response");
const {
  generateAiInsightsForDashboard,
} = require("../services/aiInsightService");

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
    const includeAiInsights =
      cleanQueryValue(req.query.includeAiInsights) !== "false";

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

    const avgSuccessRate =
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, item) => sum + (item.successRate || 0), 0) /
              metrics.length,
          )
        : 0;

    const avgFallbackRate =
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, item) => sum + (item.fallbackRate || 0), 0) /
              metrics.length,
          )
        : 0;

    const avgFailureRate =
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, item) => sum + (item.failureRate || 0), 0) /
              metrics.length,
          )
        : 0;

    const avgDropOffRate =
      metrics.length > 0
        ? Math.round(
            metrics.reduce((sum, item) => sum + (item.dropOffRate || 0), 0) /
              metrics.length,
          )
        : 0;

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

    let aiInsights = [];
    let aiInsightsProvider = {
      provider: "gemini",
      usedGemini: false,
      fallbackUsed: false,
      errorType: null,
      message: "AI insights disabled.",
    };

    if (includeAiInsights) {
      const aiInsightResult = await generateAiInsightsForDashboard({
        summary,
        botList,
      });

      aiInsights = aiInsightResult.insights;
      aiInsightsProvider = aiInsightResult.aiProvider;
    }

    return successResponse(res, "Dashboard fetched successfully", {
      filters: {
        tenantId: tenantId || null,
        botId: botId || null,
        status: status || null,
        useCase: useCase || null,
      },
      summary,
      aiInsights,
      aiInsightsProvider,
      botList,
      healthDistribution,
      fallbackTrend,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
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
