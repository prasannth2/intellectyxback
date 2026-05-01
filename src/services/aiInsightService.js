const { generateGeminiJson } = require("./geminiService");

const MAX_AI_INSIGHT_BOTS = 5;

const pickBotsForAiInsights = (botList = []) => {
  return [...botList]
    .sort((a, b) => {
      const healthOrder = {
        critical: 1,
        warning: 2,
        healthy: 3,
      };

      const aHealthOrder = healthOrder[a.healthStatus] || 99;
      const bHealthOrder = healthOrder[b.healthStatus] || 99;

      if (aHealthOrder !== bHealthOrder) {
        return aHealthOrder - bHealthOrder;
      }

      if (a.healthScore !== b.healthScore) {
        return a.healthScore - b.healthScore;
      }

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
    .slice(0, MAX_AI_INSIGHT_BOTS);
};

const buildAiInsightInput = ({ summary, botList }) => {
  const selectedBots = pickBotsForAiInsights(botList);

  return {
    summary: {
      totalBots: summary.totalBots,
      totalConversations: summary.totalConversations,
      avgSuccessRate: summary.avgSuccessRate,
      avgFallbackRate: summary.avgFallbackRate,
      avgFailureRate: summary.avgFailureRate,
      avgDropOffRate: summary.avgDropOffRate,
      criticalBots: summary.criticalBots,
      warningBots: summary.warningBots,
      healthyBots: summary.healthyBots,
    },
    bots: selectedBots.map((bot) => ({
      tenantName: bot.tenantName,
      botName: bot.botName,
      useCase: bot.useCase,
      conversations: bot.conversations,
      successRate: bot.successRate,
      fallbackRate: bot.fallbackRate,
      failureRate: bot.failureRate,
      dropOffRate: bot.dropOffRate,
      healthScore: bot.healthScore,
      healthStatus: bot.healthStatus,
    })),
    selectedBotCount: selectedBots.length,
    totalAvailableBotCount: botList.length,
  };
};

const buildAiInsightPrompt = ({ summary, botList }) => {
  const input = buildAiInsightInput({ summary, botList });

  return `
You are an AI Ops analyst for a Bot Usage Monitoring Dashboard.

Analyze only the provided selected bots and generate insight cards.

Rules:
- Use only the provided selected bot data.
- Do not invent bot names, tenants, percentages, or metrics.
- Generate maximum ${MAX_AI_INSIGHT_BOTS} insight cards.
- Prioritize critical bots first, then warning bots.
- Keep reason and recommendedAction concise.
- Return valid JSON only.
- No markdown.
- No explanation outside JSON.

Required JSON schema:
{
  "insights": [
    {
      "severity": "critical" | "warning" | "info",
      "tenantName": "string",
      "botName": "string",
      "title": "string",
      "reason": "string",
      "recommendedAction": "string",
      "metrics": {
        "healthScore": 0,
        "successRate": 0,
        "fallbackRate": 0,
        "failureRate": 0,
        "dropOffRate": 0,
        "conversations": 0
      }
    }
  ]
}

Selected dashboard data:
${JSON.stringify(input, null, 2)}
`;
};

const normalizeSeverity = (value) => {
  const severity = String(value || "").toLowerCase();

  if (["critical", "warning", "info"].includes(severity)) {
    return severity;
  }

  return "info";
};

const sanitizeAiInsights = ({ aiJson, selectedBots }) => {
  const rawInsights = Array.isArray(aiJson?.insights) ? aiJson.insights : [];

  const validBotKeys = new Set(
    selectedBots.map((bot) => `${bot.tenantName}__${bot.botName}`),
  );

  const sanitized = [];

  for (const item of rawInsights) {
    const tenantName = String(item.tenantName || "").trim();
    const botName = String(item.botName || "").trim();

    if (!tenantName || !botName) {
      continue;
    }

    const key = `${tenantName}__${botName}`;

    if (!validBotKeys.has(key)) {
      continue;
    }

    const matchingBot = selectedBots.find(
      (bot) => bot.tenantName === tenantName && bot.botName === botName,
    );

    sanitized.push({
      severity: normalizeSeverity(item.severity),
      tenantName,
      botName,
      title:
        String(item.title || "").trim() ||
        `${tenantName} / ${botName} needs review`,
      reason:
        String(item.reason || "").trim() ||
        "AI identified this bot for review based on current metrics.",
      recommendedAction:
        String(item.recommendedAction || "").trim() ||
        "Review bot performance and investigate the related metrics.",
      metrics: {
        healthScore: matchingBot?.healthScore || 0,
        successRate: matchingBot?.successRate || 0,
        fallbackRate: matchingBot?.fallbackRate || 0,
        failureRate: matchingBot?.failureRate || 0,
        dropOffRate: matchingBot?.dropOffRate || 0,
        conversations: matchingBot?.conversations || 0,
      },
    });
  }

  return sanitized.slice(0, MAX_AI_INSIGHT_BOTS);
};

const generateAiInsightsForDashboard = async ({ summary, botList }) => {
  if (!botList.length) {
    return {
      insights: [],
      aiProvider: {
        provider: "gemini",
        usedGemini: false,
        fallbackUsed: false,
        errorType: null,
        message: "No bot data available for AI insight generation.",
        sentBotCount: 0,
        maxBotCount: MAX_AI_INSIGHT_BOTS,
      },
    };
  }

  const selectedBots = pickBotsForAiInsights(botList);

  const prompt = buildAiInsightPrompt({
    summary,
    botList: selectedBots,
  });

  const geminiResult = await generateGeminiJson(prompt);

  if (!geminiResult.success) {
    return {
      insights: [],
      aiProvider: {
        provider: geminiResult.provider,
        usedGemini: false,
        fallbackUsed: false,
        errorType: geminiResult.errorType,
        message: geminiResult.errorMessage,
        sentBotCount: selectedBots.length,
        maxBotCount: MAX_AI_INSIGHT_BOTS,
      },
    };
  }

  const insights = sanitizeAiInsights({
    aiJson: geminiResult.json,
    selectedBots,
  });

  return {
    insights,
    aiProvider: {
      provider: geminiResult.provider,
      usedGemini: true,
      fallbackUsed: false,
      errorType: null,
      message: null,
      sentBotCount: selectedBots.length,
      maxBotCount: MAX_AI_INSIGHT_BOTS,
    },
  };
};

module.exports = {
  generateAiInsightsForDashboard,
  pickBotsForAiInsights,
};
