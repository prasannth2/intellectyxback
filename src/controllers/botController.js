const Tenant = require("../models/Tenant");
const Bot = require("../models/Bot");
const BotMetric = require("../models/BotMetric");
const BotIssue = require("../models/BotIssue");
const { successResponse, errorResponse } = require("../utils/response");
const {
  getMockMetricByProfile,
  getMockIssuesByProfile,
} = require("../services/mockDataService");

const createBot = async (req, res) => {
  try {
    const {
      tenantId,
      name,
      useCase,
      description,
      personality,
      channels,
      status,
      mockProfile,
    } = req.body;

    if (!tenantId || !name || !useCase) {
      return errorResponse(res, "tenantId, name and useCase are required", 400);
    }

    const tenant = await Tenant.findById(tenantId);

    if (!tenant) {
      return errorResponse(res, "Tenant not found", 404);
    }

    const bot = await Bot.create({
      tenantId,
      name,
      useCase,
      description,
      personality,
      channels,
      status,
      mockProfile,
    });

    const metricData = getMockMetricByProfile(bot.mockProfile);

    const metric = await BotMetric.create({
      tenantId: bot.tenantId,
      botId: bot._id,
      ...metricData,
    });

    const issueData = getMockIssuesByProfile(bot.mockProfile);

    const issues = await BotIssue.insertMany(
      issueData.map((issue) => ({
        tenantId: bot.tenantId,
        botId: bot._id,
        ...issue,
      })),
    );

    return successResponse(
      res,
      "Bot created successfully with mock metrics and issues",
      {
        bot,
        metric,
        issues,
      },
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const getBots = async (req, res) => {
  try {
    const {
      tenantId,
      status,
      useCase,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};

    if (tenantId) {
      filter.tenantId = tenantId;
    }

    if (status) {
      filter.status = status;
    }

    if (useCase) {
      filter.useCase = { $regex: useCase, $options: "i" };
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { useCase: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const currentPage = Math.max(Number(page) || 1, 1);
    const perPage = Math.max(Number(limit) || 10, 1);
    const skip = (currentPage - 1) * perPage;

    const total = await Bot.countDocuments(filter);

    const bots = await Bot.find(filter)
      .populate("tenantId", "name code industry status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage);

    const botIds = bots.map((bot) => bot._id);

    const metrics = await BotMetric.find({
      botId: { $in: botIds },
    });

    const issues = await BotIssue.find({
      botId: { $in: botIds },
      status: { $ne: "resolved" },
    });

    const formattedBots = bots.map((bot) => {
      const metric = metrics.find(
        (item) => item.botId.toString() === bot._id.toString(),
      );

      const botIssues = issues.filter(
        (item) => item.botId.toString() === bot._id.toString(),
      );

      const mainIssue = botIssues[0];

      return {
        _id: bot._id,
        status: bot.status,
        tenantId: bot.tenantId?._id,
        tenantName: bot.tenantId?.name || "",
        tenantCode: bot.tenantId?.code || "",
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

        aiReason: mainIssue?.description || "No major issue detected.",
        recommendedAction:
          mainIssue?.recommendedAction ||
          "Continue monitoring bot performance.",
        issueCount: botIssues.length,

        createdAt: bot.createdAt,
        updatedAt: bot.updatedAt,
      };
    });

    return successResponse(res, "Bots fetched successfully", {
      bots: formattedBots,
      pagination: {
        page: currentPage,
        limit: perPage,
        total,
        totalPages: Math.ceil(total / perPage),
        hasNextPage: currentPage < Math.ceil(total / perPage),
        hasPrevPage: currentPage > 1,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const getBotById = async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id).populate(
      "tenantId",
      "name code industry status",
    );

    if (!bot) {
      return errorResponse(res, "Bot not found", 404);
    }

    const metric = await BotMetric.findOne({ botId: bot._id });
    const issues = await BotIssue.find({ botId: bot._id }).sort({
      createdAt: -1,
    });

    return successResponse(res, "Bot fetched successfully", {
      bot,
      metric,
      issues,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const updateBot = async (req, res) => {
  try {
    const {
      tenantId,
      name,
      useCase,
      description,
      personality,
      channels,
      status,
      mockProfile,
    } = req.body;

    const bot = await Bot.findById(req.params.id);

    if (!bot) {
      return errorResponse(res, "Bot not found", 404);
    }

    if (tenantId) {
      const tenant = await Tenant.findById(tenantId);

      if (!tenant) {
        return errorResponse(res, "Tenant not found", 404);
      }

      bot.tenantId = tenantId;
    }

    const oldMockProfile = bot.mockProfile;

    bot.name = name ?? bot.name;
    bot.useCase = useCase ?? bot.useCase;
    bot.description = description ?? bot.description;
    bot.personality = personality ?? bot.personality;
    bot.channels = channels ?? bot.channels;
    bot.status = status ?? bot.status;
    bot.mockProfile = mockProfile ?? bot.mockProfile;

    await bot.save();

    if (mockProfile && mockProfile !== oldMockProfile) {
      const metricData = getMockMetricByProfile(bot.mockProfile);

      await BotMetric.findOneAndUpdate(
        { botId: bot._id },
        {
          tenantId: bot.tenantId,
          botId: bot._id,
          ...metricData,
        },
        {
          new: true,
          upsert: true,
        },
      );

      await BotIssue.deleteMany({ botId: bot._id });

      const issueData = getMockIssuesByProfile(bot.mockProfile);

      await BotIssue.insertMany(
        issueData.map((issue) => ({
          tenantId: bot.tenantId,
          botId: bot._id,
          ...issue,
        })),
      );
    }

    const updatedBot = await Bot.findById(bot._id).populate(
      "tenantId",
      "name code industry status",
    );

    return successResponse(res, "Bot updated successfully", updatedBot);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const deleteBot = async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);

    if (!bot) {
      return errorResponse(res, "Bot not found", 404);
    }

    await BotIssue.deleteMany({ botId: bot._id });
    await BotMetric.deleteMany({ botId: bot._id });
    await Bot.findByIdAndDelete(bot._id);

    return successResponse(res, "Bot and related data deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  createBot,
  getBots,
  getBotById,
  updateBot,
  deleteBot,
};
