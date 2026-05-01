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

  if (hasAny(text, ["which", "list", "show", "how many", "count", "bots"])) {
    plan.intent = "list_bots";
    plan.requestedView.push("table");
  }

  if (hasAny(text, ["compare", "comparison", "chart", "graph", "trend"])) {
    plan.requestedView.push("chart");
  }

  if (hasAny(text, ["summary", "today", "overview"])) {
    plan.intent = "summary";
    plan.requestedView.push("chart");
  }

  if (hasAny(text, ["critical", "critical stage", "red"])) {
    plan.filter.healthStatus = "critical";
    plan.intent = "list_bots";
    plan.focusMetric = "healthStatus";
    plan.requestedView.push("table");
  }

  if (hasAny(text, ["warning", "attention", "risk", "yellow"])) {
    plan.filter.healthStatus = "warning";
    plan.intent = "list_bots";
    plan.focusMetric = "healthStatus";
    plan.requestedView.push("table");
  }

  if (hasAny(text, ["healthy", "stable", "good", "green"])) {
    plan.filter.healthStatus = "healthy";
    plan.intent = "list_bots";
    plan.focusMetric = "healthStatus";
    plan.sortBy = "healthScore";
    plan.sortOrder = "desc";
    plan.requestedView.push("table");
  }

  if (hasAny(text, ["fallback", "fallback rate", "unanswered"])) {
    plan.metricFilters.push({
      field: "fallbackRate",
      operator: ">=",
      value: 30,
    });

    plan.intent = "list_bots";
    plan.focusMetric = "fallbackRate";
    plan.sortBy = "fallbackRate";
    plan.sortOrder = "desc";
    plan.requestedView.push("table");
    plan.requestedView.push("chart");
  }

  if (hasAny(text, ["failure", "failed", "error", "errors"])) {
    plan.metricFilters.push({
      field: "failureRate",
      operator: ">=",
      value: 25,
    });

    plan.intent = "list_bots";
    plan.focusMetric = "failureRate";
    plan.sortBy = "failureRate";
    plan.sortOrder = "desc";
    plan.requestedView.push("table");
    plan.requestedView.push("chart");
  }

  if (hasAny(text, ["drop", "dropoff", "drop-off", "drop off", "abandon"])) {
    plan.metricFilters.push({
      field: "dropOffRate",
      operator: ">=",
      value: 35,
    });

    plan.intent = "list_bots";
    plan.focusMetric = "dropOffRate";
    plan.sortBy = "dropOffRate";
    plan.sortOrder = "desc";
    plan.requestedView.push("table");
    plan.requestedView.push("chart");
  }

  if (hasAny(text, ["success", "success rate", "performing well"])) {
    plan.intent = "list_bots";
    plan.focusMetric = "successRate";
    plan.sortBy = "successRate";
    plan.sortOrder = "desc";
    plan.requestedView.push("table");
    plan.requestedView.push("chart");
  }

  if (hasAny(text, ["fix", "action", "recommend", "improve", "issue"])) {
    plan.intent = "recommendation";
    plan.requestedView.push("list");
  }

  if (hasAny(text, ["top 5", "five"])) {
    plan.limit = 5;
  }

  if (hasAny(text, ["top 3", "three"])) {
    plan.limit = 3;
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
