const Bot = require("../models/Bot");
const BotMetric = require("../models/BotMetric");
const BotIssue = require("../models/BotIssue");
const Tenant = require("../models/Tenant");
const { successResponse, errorResponse } = require("../utils/response");
const {
  generateGeminiText,
  streamGeminiText,
} = require("../services/geminiService");

const cleanValue = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const sendSseEvent = (res, eventName, payload) => {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const chatWithAssistant = async (req, res) => {
  try {
    const tenantId = cleanValue(req.body.tenantId);
    const botId = cleanValue(req.body.botId);
    const message = cleanValue(req.body.message);

    if (!message) {
      return errorResponse(res, "message is required", 400);
    }

    const contextData = await buildAssistantContext({
      tenantId,
      botId,
    });

    const prompt = buildAssistantPrompt({
      message,
      contextData,
    });

    const answer = await generateGeminiText(prompt);

    const blocks = buildResponseBlocks({
      message,
      answer,
      contextData,
    });

    const suggestions = buildSuggestions(contextData);

    return successResponse(
      res,
      "AI assistant response generated successfully",
      {
        scope: {
          tenantId: tenantId || null,
          botId: botId || null,
        },
        answer,
        blocks,
        suggestions,
        contextSummary: contextData.summary,
      },
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const streamChatWithAssistant = async (req, res) => {
  try {
    const tenantId = cleanValue(req.body.tenantId);
    const botId = cleanValue(req.body.botId);
    const message = cleanValue(req.body.message);

    if (!message) {
      return errorResponse(res, "message is required", 400);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const contextData = await buildAssistantContext({
      tenantId,
      botId,
    });

    sendSseEvent(res, "meta", {
      scope: {
        tenantId: tenantId || null,
        botId: botId || null,
      },
      contextSummary: contextData.summary,
    });

    const prompt = buildAssistantPrompt({
      message,
      contextData,
    });

    const answer = await streamGeminiText({
      prompt,
      onText: (text) => {
        sendSseEvent(res, "text_delta", {
          text,
        });
      },
    });

    const blocks = buildResponseBlocks({
      message,
      answer,
      contextData,
    });

    const suggestions = buildSuggestions(contextData);

    sendSseEvent(res, "final", {
      answer,
      blocks,
      suggestions,
      contextSummary: contextData.summary,
    });

    sendSseEvent(res, "done", {
      done: true,
    });

    res.end();
  } catch (error) {
    sendSseEvent(res, "error", {
      message: error.message || "AI stream failed",
    });

    res.end();
  }
};

const buildAssistantContext = async ({ tenantId, botId }) => {
  const botFilter = {};

  if (tenantId) {
    botFilter.tenantId = tenantId;
  }

  if (botId) {
    botFilter._id = botId;
  }

  const bots = await Bot.find(botFilter)
    .populate("tenantId", "name code industry status")
    .sort({ createdAt: -1 })
    .limit(50);

  const botIds = bots.map((bot) => bot._id);

  const metrics = await BotMetric.find({
    botId: { $in: botIds },
  });

  const issues = await BotIssue.find({
    botId: { $in: botIds },
    status: { $ne: "resolved" },
  }).sort({ createdAt: -1 });

  const tenantsCount = tenantId ? 1 : await Tenant.countDocuments();

  const botContext = bots.map((bot) => {
    const metric = metrics.find(
      (item) => item.botId.toString() === bot._id.toString(),
    );

    const botIssues = issues.filter(
      (item) => item.botId.toString() === bot._id.toString(),
    );

    const mainIssue = botIssues[0];

    return {
      botId: bot._id.toString(),
      tenantId: bot.tenantId?._id?.toString() || "",
      tenantName: bot.tenantId?.name || "",
      tenantCode: bot.tenantId?.code || "",
      tenantIndustry: bot.tenantId?.industry || "",
      botName: bot.name,
      useCase: bot.useCase,
      status: bot.status,
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
      issueCount: botIssues.length,
      aiReason: mainIssue?.description || "No major issue detected.",
      recommendedAction:
        mainIssue?.recommendedAction || "Continue monitoring bot performance.",
      issues: botIssues.map((issue) => ({
        type: issue.type,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        affectedTopics: issue.affectedTopics,
        sampleQuestions: issue.sampleQuestions,
        recommendedAction: issue.recommendedAction,
        status: issue.status,
      })),
    };
  });

  const totalConversations = botContext.reduce(
    (sum, bot) => sum + bot.conversations,
    0,
  );

  const avgSuccessRate = getAverage(botContext, "successRate");
  const avgFallbackRate = getAverage(botContext, "fallbackRate");
  const avgFailureRate = getAverage(botContext, "failureRate");
  const avgDropOffRate = getAverage(botContext, "dropOffRate");

  const criticalBots = botContext.filter(
    (bot) => bot.healthStatus === "critical",
  );

  const warningBots = botContext.filter(
    (bot) => bot.healthStatus === "warning",
  );

  const healthyBots = botContext.filter(
    (bot) => bot.healthStatus === "healthy",
  );

  const highFallbackBots = botContext.filter((bot) => bot.fallbackRate >= 30);
  const highFailureBots = botContext.filter((bot) => bot.failureRate >= 25);
  const highDropOffBots = botContext.filter((bot) => bot.dropOffRate >= 35);

  const summary = {
    tenantsCount,
    botsCount: botContext.length,
    totalConversations,
    avgSuccessRate,
    avgFallbackRate,
    avgFailureRate,
    avgDropOffRate,
    healthyBotsCount: healthyBots.length,
    warningBotsCount: warningBots.length,
    criticalBotsCount: criticalBots.length,
    highFallbackBotsCount: highFallbackBots.length,
    highFailureBotsCount: highFailureBots.length,
    highDropOffBotsCount: highDropOffBots.length,
  };

  return {
    summary,
    bots: botContext,
  };
};

const getAverage = (items, key) => {
  if (!items.length) return 0;

  const total = items.reduce((sum, item) => sum + Number(item[key] || 0), 0);

  return Math.round(total / items.length);
};

const buildAssistantPrompt = ({ message, contextData }) => {
  return `
You are an AI Ops Assistant for a Bot Usage Monitoring Dashboard.

Your user is a platform admin.

Your responsibilities:
- Explain bot health.
- Identify critical bots.
- Identify tenants needing attention.
- Explain why a bot is critical.
- Recommend what to fix first.
- Use only the provided data.
- Do not invent numbers.
- Keep the response short and practical.
- Do not return markdown tables.
- Do not return JSON.
- Return a natural language admin-friendly answer.

Admin question:
${message}

Dashboard summary:
${JSON.stringify(contextData.summary, null, 2)}

Bot performance data:
${JSON.stringify(contextData.bots, null, 2)}

Answer style:
- Direct answer first.
- Then key reason.
- Then recommended action.
`;
};

const buildResponseBlocks = ({ message, answer, contextData }) => {
  const lowerMessage = message.toLowerCase();

  const blocks = [
    {
      id: "answer-text",
      type: "text",
      title: "AI Answer",
      content: answer,
    },
  ];

  const sortedBots = [...contextData.bots].sort(
    (a, b) => a.healthScore - b.healthScore,
  );

  const isSingleBot = sortedBots.length === 1;
  const selectedBot = isSingleBot ? sortedBots[0] : null;

  if (isSingleBot && selectedBot) {
    blocks.push({
      id: "bot-summary-card",
      type: "summary_card",
      title: "Bot Summary",
      statusType: selectedBot.healthStatus,
      data: {
        tenantName: selectedBot.tenantName,
        botName: selectedBot.botName,
        useCase: selectedBot.useCase,
        healthStatus: selectedBot.healthStatus,
        healthScore: selectedBot.healthScore,
        conversations: selectedBot.conversations,
        successRate: selectedBot.successRate,
        fallbackRate: selectedBot.fallbackRate,
        failureRate: selectedBot.failureRate,
        dropOffRate: selectedBot.dropOffRate,
        recommendedAction: selectedBot.recommendedAction,
      },
    });

    blocks.push({
      id: "bot-metrics-chart",
      type: "chart",
      title: "Bot Metrics",
      chartType: "bar",
      xKey: "metric",
      yKeys: ["value"],
      data: [
        {
          metric: "Success",
          value: selectedBot.successRate,
        },
        {
          metric: "Fallback",
          value: selectedBot.fallbackRate,
        },
        {
          metric: "Failure",
          value: selectedBot.failureRate,
        },
        {
          metric: "Drop-off",
          value: selectedBot.dropOffRate,
        },
      ],
    });

    if (selectedBot.healthStatus !== "healthy") {
      blocks.push({
        id: "issue-action-list",
        type: "list",
        title: "Recommended Fixes",
        items: [
          {
            title: `${selectedBot.tenantName} / ${selectedBot.botName}`,
            description: selectedBot.aiReason,
            action: selectedBot.recommendedAction,
            severity: selectedBot.healthStatus,
          },
        ],
      });
    }

    return blocks;
  }

  const needTable =
    lowerMessage.includes("which") ||
    lowerMessage.includes("list") ||
    lowerMessage.includes("table") ||
    lowerMessage.includes("critical") ||
    lowerMessage.includes("attention") ||
    lowerMessage.includes("compare") ||
    sortedBots.length > 1;

  const needChart =
    lowerMessage.includes("chart") ||
    lowerMessage.includes("graph") ||
    lowerMessage.includes("trend") ||
    lowerMessage.includes("compare") ||
    lowerMessage.includes("summary") ||
    lowerMessage.includes("today");

  if (needTable) {
    blocks.push({
      id: "bot-performance-table",
      type: "table",
      title: "Bot Performance Table",
      columns: [
        {
          key: "tenantName",
          label: "Tenant",
        },
        {
          key: "botName",
          label: "Bot",
        },
        {
          key: "useCase",
          label: "Use Case",
        },
        {
          key: "healthStatus",
          label: "Health",
        },
        {
          key: "healthScore",
          label: "Score",
        },
        {
          key: "successRate",
          label: "Success %",
        },
        {
          key: "fallbackRate",
          label: "Fallback %",
        },
        {
          key: "failureRate",
          label: "Failure %",
        },
        {
          key: "dropOffRate",
          label: "Drop-off %",
        },
      ],
      rows: sortedBots.slice(0, 10).map((bot) => ({
        tenantName: bot.tenantName,
        botName: bot.botName,
        useCase: bot.useCase,
        healthStatus: bot.healthStatus,
        healthScore: bot.healthScore,
        successRate: bot.successRate,
        fallbackRate: bot.fallbackRate,
        failureRate: bot.failureRate,
        dropOffRate: bot.dropOffRate,
      })),
    });
  }

  if (needChart) {
    blocks.push({
      id: "bot-health-chart",
      type: "chart",
      title: "Bot Health Score Comparison",
      chartType: "bar",
      xKey: "botName",
      yKeys: ["healthScore"],
      data: sortedBots.slice(0, 8).map((bot) => ({
        botName: bot.botName,
        healthScore: bot.healthScore,
        fallbackRate: bot.fallbackRate,
        failureRate: bot.failureRate,
        dropOffRate: bot.dropOffRate,
      })),
    });
  }

  if (
    lowerMessage.includes("fallback") ||
    lowerMessage.includes("failure") ||
    lowerMessage.includes("drop") ||
    lowerMessage.includes("issue") ||
    lowerMessage.includes("fix")
  ) {
    blocks.push({
      id: "issue-action-list",
      type: "list",
      title: "Recommended Fixes",
      items: sortedBots.slice(0, 5).map((bot) => ({
        title: `${bot.tenantName} / ${bot.botName}`,
        description: bot.aiReason,
        action: bot.recommendedAction,
        severity: bot.healthStatus,
      })),
    });
  }

  return blocks;
};

const buildSuggestions = (contextData) => {
  const summary = contextData.summary;
  const isSingleBot = contextData.bots.length === 1;
  const selectedBot = isSingleBot ? contextData.bots[0] : null;

  let suggestions = [];

  if (isSingleBot && selectedBot) {
    suggestions.push("Give me today's summary for this bot");
    suggestions.push("Show this bot metrics");
    suggestions.push("What should I monitor next?");

    if (selectedBot.healthStatus === "critical") {
      suggestions.push("Why is this bot critical?");
      suggestions.push("What should I fix first?");
      suggestions.push("Show failed topics");
    } else if (selectedBot.healthStatus === "warning") {
      suggestions.push("Why does this bot need attention?");
      suggestions.push("How can I improve this bot?");
      suggestions.push("Show risk areas");
    } else {
      suggestions.push("Why is this bot healthy?");
      suggestions.push("How can I maintain this performance?");
      suggestions.push("Compare this bot with others");
    }

    return suggestions.slice(0, 8);
  }

  suggestions = [
    "Which bots are critical?",
    "Which tenant needs attention?",
    "What should I fix first?",
    "Show failed topics",
    "Compare bot performance",
    "Show dashboard summary",
  ];

  if (summary.criticalBotsCount > 0) {
    suggestions.unshift("Show only critical bots");
  }

  if (summary.highFallbackBotsCount > 0) {
    suggestions.unshift("Which bots have high fallback?");
  }

  if (summary.highFailureBotsCount > 0) {
    suggestions.unshift("Which bots have high failure?");
  }

  if (summary.highDropOffBotsCount > 0) {
    suggestions.unshift("Which bots have high drop-off?");
  }

  if (summary.criticalBotsCount === 0 && summary.warningBotsCount === 0) {
    suggestions.unshift("Are all bots healthy?");
    suggestions.push("What should I monitor today?");
  }

  return [...new Set(suggestions)].slice(0, 8);
};
module.exports = {
  chatWithAssistant,
  streamChatWithAssistant,
};
