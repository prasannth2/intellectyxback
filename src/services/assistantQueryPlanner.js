const normalizeText = (value = "") => {
  return String(value).toLowerCase().trim();
};

const hasAny = (text, words = []) => {
  return words.some((word) => text.includes(word));
};

const analyzeUserQuestion = (message = "") => {
  const text = normalizeText(message);

  const plan = {
    intent: "general_summary",
    filter: {},
    metricFilters: [],
    sortBy: "healthScore",
    sortOrder: "asc",
    limit: 10,
    requestedView: ["text"],
    focusMetric: null,
  };

  const isCountQuestion = hasAny(text, [
    "how many",
    "count",
    "number of",
    "total",
  ]);

  const isChartQuestion = hasAny(text, [
    "chart",
    "graph",
    "visual",
    "visualize",
    "comparison",
    "compare",
    "trend",
    "distribution",
    "breakdown",
  ]);

  const isTableQuestion = hasAny(text, [
    "list",
    "table",
    "show me bots",
    "show bots",
    "which bots",
    "show all",
    "details",
  ]);

  const isRecommendationQuestion = hasAny(text, [
    "fix",
    "action",
    "recommend",
    "improve",
    "issue",
    "what should",
  ]);

  if (isCountQuestion) {
    plan.intent = "count";
    plan.requestedView.push("summary_card");
  }

  if (isTableQuestion) {
    plan.intent = "list_bots";
    plan.requestedView.push("table");
  }

  if (isChartQuestion) {
    plan.intent = "chart";
    plan.requestedView.push("chart");
  }

  if (hasAny(text, ["summary", "today", "overview"])) {
    plan.intent = "summary";
    plan.requestedView.push("summary_card");
    plan.requestedView.push("chart");
  }

  if (hasAny(text, ["critical", "critical stage", "red"])) {
    plan.filter.healthStatus = "critical";
    plan.focusMetric = "healthStatus";
    plan.sortBy = "healthScore";
    plan.sortOrder = "asc";

    if (!isCountQuestion && !isChartQuestion) {
      plan.requestedView.push("table");
    }
  }

  if (hasAny(text, ["warning", "attention", "risk", "yellow"])) {
    plan.filter.healthStatus = "warning";
    plan.focusMetric = "healthStatus";
    plan.sortBy = "healthScore";
    plan.sortOrder = "asc";

    if (!isCountQuestion && !isChartQuestion) {
      plan.requestedView.push("table");
    }
  }

  if (hasAny(text, ["healthy", "stable", "good", "green"])) {
    plan.filter.healthStatus = "healthy";
    plan.focusMetric = "healthStatus";
    plan.sortBy = "healthScore";
    plan.sortOrder = "desc";

    if (!isCountQuestion && !isChartQuestion) {
      plan.requestedView.push("table");
    }
  }

  if (hasAny(text, ["fallback", "fallback rate", "unanswered"])) {
    plan.metricFilters.push({
      field: "fallbackRate",
      operator: ">=",
      value: 30,
    });

    plan.focusMetric = "fallbackRate";
    plan.sortBy = "fallbackRate";
    plan.sortOrder = "desc";

    if (!isCountQuestion && !isChartQuestion) {
      plan.requestedView.push("table");
    }

    if (isChartQuestion || hasAny(text, ["compare", "trend"])) {
      plan.requestedView.push("chart");
    }
  }

  if (hasAny(text, ["failure", "failed", "error", "errors"])) {
    plan.metricFilters.push({
      field: "failureRate",
      operator: ">=",
      value: 25,
    });

    plan.focusMetric = "failureRate";
    plan.sortBy = "failureRate";
    plan.sortOrder = "desc";

    if (!isCountQuestion && !isChartQuestion) {
      plan.requestedView.push("table");
    }

    if (isChartQuestion || hasAny(text, ["compare", "trend"])) {
      plan.requestedView.push("chart");
    }
  }

  if (hasAny(text, ["drop", "dropoff", "drop-off", "drop off", "abandon"])) {
    plan.metricFilters.push({
      field: "dropOffRate",
      operator: ">=",
      value: 35,
    });

    plan.focusMetric = "dropOffRate";
    plan.sortBy = "dropOffRate";
    plan.sortOrder = "desc";

    if (!isCountQuestion && !isChartQuestion) {
      plan.requestedView.push("table");
    }

    if (isChartQuestion || hasAny(text, ["compare", "trend"])) {
      plan.requestedView.push("chart");
    }
  }

  if (hasAny(text, ["success", "success rate", "performing well"])) {
    plan.focusMetric = "successRate";
    plan.sortBy = "successRate";
    plan.sortOrder = "desc";

    if (!isCountQuestion) {
      plan.requestedView.push("table");
    }

    if (isChartQuestion || hasAny(text, ["compare", "trend"])) {
      plan.requestedView.push("chart");
    }
  }

  if (isRecommendationQuestion) {
    plan.intent = "recommendation";
    plan.requestedView.push("list");

    if (!isCountQuestion) {
      plan.requestedView.push("table");
    }
  }

  if (hasAny(text, ["top 5", "five"])) {
    plan.limit = 5;
  }

  if (hasAny(text, ["top 3", "three"])) {
    plan.limit = 3;
  }

  if (isChartQuestion && !plan.requestedView.includes("chart")) {
    plan.requestedView.push("chart");
  }

  plan.requestedView = [...new Set(plan.requestedView)];

  return plan;
};

const applyAssistantQueryPlan = ({ bots = [], plan }) => {
  let results = [...bots];

  if (plan.filter.healthStatus) {
    results = results.filter(
      (bot) => bot.healthStatus === plan.filter.healthStatus,
    );
  }

  for (const metricFilter of plan.metricFilters) {
    results = results.filter((bot) => {
      const value = Number(bot[metricFilter.field] || 0);

      if (metricFilter.operator === ">=") {
        return value >= metricFilter.value;
      }

      if (metricFilter.operator === "<=") {
        return value <= metricFilter.value;
      }

      if (metricFilter.operator === ">") {
        return value > metricFilter.value;
      }

      if (metricFilter.operator === "<") {
        return value < metricFilter.value;
      }

      return true;
    });
  }

  results.sort((a, b) => {
    const aValue = Number(a[plan.sortBy] || 0);
    const bValue = Number(b[plan.sortBy] || 0);

    if (plan.sortOrder === "desc") {
      return bValue - aValue;
    }

    return aValue - bValue;
  });

  return results.slice(0, plan.limit);
};

module.exports = {
  analyzeUserQuestion,
  applyAssistantQueryPlan,
};
