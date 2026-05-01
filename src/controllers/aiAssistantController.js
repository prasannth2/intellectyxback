const Bot = require("../models/Bot");
const BotMetric = require("../models/BotMetric");
const BotIssue = require("../models/BotIssue");
const Tenant = require("../models/Tenant");
const { successResponse, errorResponse } = require("../utils/response");
const {
  generateGeminiText,
  streamGeminiText,
} = require("../services/geminiService");
const {
  analyzeUserQuestion,
  applyAssistantQueryPlan,
} = require("../services/assistantQueryPlanner");

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

    const queryPlan = analyzeUserQuestion(message);

    const matchedBots = applyAssistantQueryPlan({
      bots: contextData.bots,
      plan: queryPlan,
    });

    const dbFallbackAnswer = buildDbFallbackAnswer({
      contextData,
      queryPlan,
      matchedBots,
    });

    const prompt = buildAssistantPrompt({
      message,
      contextData,
      queryPlan,
      matchedBots,
      dbFallbackAnswer,
    });

    const geminiResult = await generateGeminiText(prompt);

    const answer = geminiResult.success ? geminiResult.text : dbFallbackAnswer;

    const blocks = buildResponseBlocks({
      answer,
      queryPlan,
      matchedBots,
    });

    const suggestions = buildSuggestions({
      contextData,
      queryPlan,
      matchedBots,
    });

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
        queryPlan,
        matchedCount: matchedBots.length,
        aiProvider: {
          provider: geminiResult.provider,
          usedGemini: geminiResult.success,
          fallbackUsed: !geminiResult.success,
          errorType: geminiResult.errorType || null,
          message: geminiResult.errorMessage || null,
        },
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

    const queryPlan = analyzeUserQuestion(message);

    const matchedBots = applyAssistantQueryPlan({
      bots: contextData.bots,
      plan: queryPlan,
    });

    sendSseEvent(res, "meta", {
      scope: {
        tenantId: tenantId || null,
        botId: botId || null,
      },
      contextSummary: contextData.summary,
      queryPlan,
      matchedCount: matchedBots.length,
    });

    const dbFallbackAnswer = buildDbFallbackAnswer({
      contextData,
      queryPlan,
      matchedBots,
    });

    const prompt = buildAssistantPrompt({
      message,
      contextData,
      queryPlan,
      matchedBots,
      dbFallbackAnswer,
    });

    const geminiResult = await streamGeminiText({
      prompt,
      onText: (text) => {
        sendSseEvent(res, "text_delta", {
          text,
        });
      },
    });

    const answer = geminiResult.success ? geminiResult.text : dbFallbackAnswer;

    if (!geminiResult.success) {
      sendSseEvent(res, "text_delta", {
        text: answer,
      });
    }

    const blocks = buildResponseBlocks({
      answer,
      queryPlan,
      matchedBots,
    });

    const suggestions = buildSuggestions({
      contextData,
      queryPlan,
      matchedBots,
    });

    for (const block of blocks) {
      if (block.type === "text") {
        continue;
      }

      sendSseEvent(res, "block", block);
    }

    sendSseEvent(res, "suggestions", {
      suggestions,
    });

    sendSseEvent(res, "final", {
      answer,
      blocks,
      suggestions,
      contextSummary: contextData.summary,
      queryPlan,
      matchedCount: matchedBots.length,
      aiProvider: {
        provider: geminiResult.provider,
        usedGemini: geminiResult.success,
        fallbackUsed: !geminiResult.success,
        errorType: geminiResult.errorType || null,
        message: geminiResult.errorMessage || null,
      },
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
    .limit(100);

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

  const total = items.reduce((sum, item) => {
    return sum + Number(item[key] || 0);
  }, 0);

  return Math.round(total / items.length);
};

const buildAssistantPrompt = ({
  message,
  contextData,
  queryPlan,
  matchedBots,
  dbFallbackAnswer,
}) => {
  return `
You are an AI Ops Assistant for a Bot Usage Monitoring Dashboard.

Your user is a platform admin.

Important:
- Use only the provided matched bot data.
- Do not use bot data outside matchedBotData.
- Do not invent numbers.
- Keep the answer short and practical.
- Do not return JSON.
- Do not return markdown table.
- The backend will generate table/chart separately.
- Your text answer must match the matched bot data.
- If matchedBotData is empty, say no matching bots were found.
- Prefer this fallback answer if it already answers the user correctly:
${dbFallbackAnswer}

Admin question:
${message}

Query plan:
${JSON.stringify(queryPlan, null, 2)}

Dashboard summary:
${JSON.stringify(contextData.summary, null, 2)}

Matched bot data:
${JSON.stringify(matchedBots, null, 2)}

Answer style:
- Direct answer first.
- Then key reason.
- Then recommended action.
`;
};

const buildDbFallbackAnswer = ({ contextData, queryPlan, matchedBots }) => {
  const summary = contextData.summary || {};
  const bots = matchedBots || [];

  if (!contextData.bots.length) {
    return "No bot data is available for the selected filters.";
  }

  if (!bots.length) {
    return "No bots matched your question in the selected scope.";
  }

  if (bots.length === 1) {
    const bot = bots[0];

    return `${bot.tenantName} / ${bot.botName} is ${bot.healthStatus} with a health score of ${bot.healthScore}. It handled ${bot.conversations} conversations with ${bot.successRate}% success rate, ${bot.fallbackRate}% fallback rate, ${bot.failureRate}% failure rate, and ${bot.dropOffRate}% drop-off rate. Recommended action: ${bot.recommendedAction}`;
  }

  const names = bots
    .slice(0, 5)
    .map((bot) => `${bot.tenantName} / ${bot.botName}`)
    .join(", ");

  if (queryPlan.filter.healthStatus) {
    return `${bots.length} bot(s) are ${queryPlan.filter.healthStatus}: ${names}. Across the selected scope, total conversations are ${summary.totalConversations || 0}, average success rate is ${summary.avgSuccessRate || 0}%, and average fallback rate is ${summary.avgFallbackRate || 0}%.`;
  }

  if (queryPlan.focusMetric) {
    return `${bots.length} bot(s) matched the ${queryPlan.focusMetric} condition: ${names}. Review the table for details and prioritize the highest-risk bots first.`;
  }

  return `${bots.length} bot(s) matched your question: ${names}. Across the selected scope, total conversations are ${summary.totalConversations || 0}, average success rate is ${summary.avgSuccessRate || 0}%, and average fallback rate is ${summary.avgFallbackRate || 0}%.`;
};

const buildResponseBlocks = ({ answer, queryPlan, matchedBots }) => {
  const blocks = [
    {
      id: "answer-text",
      type: "text",
      title: "AI Answer",
      content: answer,
    },
  ];

  const bots = matchedBots || [];

  if (!bots.length) {
    return blocks;
  }

  const isSingleBot = bots.length === 1;
  const selectedBot = isSingleBot ? bots[0] : null;

  if (queryPlan.requestedView.includes("summary_card") && !isSingleBot) {
    blocks.push({
      id: "result-summary-card",
      type: "summary_card",
      title: "Result Summary",
      statusType: queryPlan.filter.healthStatus || "info",
      data: {
        matchedCount: bots.length,
        focusMetric: queryPlan.focusMetric,
        healthStatus: queryPlan.filter.healthStatus || null,
        topBots: bots.slice(0, 3).map((bot) => ({
          tenantName: bot.tenantName,
          botName: bot.botName,
          healthStatus: bot.healthStatus,
          healthScore: bot.healthScore,
        })),
      },
    });
  }

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
        activeUsers: selectedBot.activeUsers,
        successRate: selectedBot.successRate,
        fallbackRate: selectedBot.fallbackRate,
        failureRate: selectedBot.failureRate,
        dropOffRate: selectedBot.dropOffRate,
        avgResponseTime: selectedBot.avgResponseTime,
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

  if (queryPlan.requestedView.includes("table")) {
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
      rows: bots.map((bot) => ({
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

  if (queryPlan.requestedView.includes("chart")) {
    blocks.push({
      id: "bot-chart",
      type: "chart",
      title: getChartTitle(queryPlan),
      chartType: "bar",
      xKey: "botName",
      yKeys: getChartYKeys(queryPlan),
      data: bots.map((bot) => ({
        botName: bot.botName,
        healthScore: bot.healthScore,
        successRate: bot.successRate,
        fallbackRate: bot.fallbackRate,
        failureRate: bot.failureRate,
        dropOffRate: bot.dropOffRate,
      })),
    });
  }

  if (queryPlan.requestedView.includes("list")) {
    blocks.push({
      id: "issue-action-list",
      type: "list",
      title: "Recommended Fixes",
      items: bots.map((bot) => ({
        title: `${bot.tenantName} / ${bot.botName}`,
        description: bot.aiReason,
        action: bot.recommendedAction,
        severity: bot.healthStatus,
      })),
    });
  }

  return blocks;
};

const getChartTitle = (queryPlan) => {
  if (queryPlan.focusMetric === "fallbackRate") {
    return "Fallback Rate Comparison";
  }

  if (queryPlan.focusMetric === "failureRate") {
    return "Failure Rate Comparison";
  }

  if (queryPlan.focusMetric === "dropOffRate") {
    return "Drop-off Rate Comparison";
  }

  if (queryPlan.focusMetric === "successRate") {
    return "Success Rate Comparison";
  }

  return "Bot Health Score Comparison";
};

const getChartYKeys = (queryPlan) => {
  if (queryPlan.focusMetric === "fallbackRate") {
    return ["fallbackRate"];
  }

  if (queryPlan.focusMetric === "failureRate") {
    return ["failureRate"];
  }

  if (queryPlan.focusMetric === "dropOffRate") {
    return ["dropOffRate"];
  }

  if (queryPlan.focusMetric === "successRate") {
    return ["successRate"];
  }

  return ["healthScore"];
};

const buildSuggestions = ({ contextData, matchedBots }) => {
  const summary = contextData.summary || {};
  const isSingleBot = matchedBots.length === 1;
  const selectedBot = isSingleBot ? matchedBots[0] : null;

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

    return [...new Set(suggestions)].slice(0, 8);
  }

  suggestions = [
    "Which bots are critical?",
    "Which bots are healthy?",
    "Which tenant needs attention?",
    "Which bots have high fallback?",
    "Which bots have high failure?",
    "Which bots have high drop-off?",
    "What should I fix first?",
    "Compare bot performance",
  ];

  if (summary.criticalBotsCount > 0) {
    suggestions.unshift("Show only critical bots");
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
