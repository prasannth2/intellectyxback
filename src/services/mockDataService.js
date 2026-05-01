const {
  MOCK_PROFILE,
  ISSUE_TYPE,
  ISSUE_SEVERITY,
} = require("../constants/botConstants");

const { calculateHealthScore } = require("../utils/healthScore");

const getMockMetricByProfile = (mockProfile) => {
  let metric = {};

  switch (mockProfile) {
    case MOCK_PROFILE.HEALTHY:
      metric = {
        totalConversations: 2400,
        activeUsers: 850,
        successRate: 92,
        fallbackRate: 6,
        failureRate: 2,
        dropOffRate: 8,
        avgResponseTime: 1.4,
      };
      break;

    case MOCK_PROFILE.UNDERUTILIZED:
      metric = {
        totalConversations: 120,
        activeUsers: 35,
        successRate: 84,
        fallbackRate: 10,
        failureRate: 6,
        dropOffRate: 18,
        avgResponseTime: 1.8,
      };
      break;

    case MOCK_PROFILE.HIGH_FALLBACK:
      metric = {
        totalConversations: 1800,
        activeUsers: 620,
        successRate: 58,
        fallbackRate: 38,
        failureRate: 4,
        dropOffRate: 22,
        avgResponseTime: 2.3,
      };
      break;

    case MOCK_PROFILE.HIGH_FAILURE:
      metric = {
        totalConversations: 1500,
        activeUsers: 520,
        successRate: 52,
        fallbackRate: 16,
        failureRate: 32,
        dropOffRate: 28,
        avgResponseTime: 3.1,
      };
      break;

    case MOCK_PROFILE.HIGH_DROPOFF:
      metric = {
        totalConversations: 2100,
        activeUsers: 760,
        successRate: 68,
        fallbackRate: 14,
        failureRate: 8,
        dropOffRate: 46,
        avgResponseTime: 2.6,
      };
      break;

    case MOCK_PROFILE.POOR_QUALITY:
      metric = {
        totalConversations: 1700,
        activeUsers: 590,
        successRate: 44,
        fallbackRate: 30,
        failureRate: 18,
        dropOffRate: 40,
        avgResponseTime: 3.4,
      };
      break;

    default:
      metric = {
        totalConversations: 500,
        activeUsers: 100,
        successRate: 80,
        fallbackRate: 10,
        failureRate: 5,
        dropOffRate: 15,
        avgResponseTime: 2,
      };
      break;
  }

  const health = calculateHealthScore(metric);

  return {
    ...metric,
    ...health,
  };
};

const getMockIssuesByProfile = (mockProfile) => {
  switch (mockProfile) {
    case MOCK_PROFILE.HEALTHY:
      return [
        {
          type: ISSUE_TYPE.PERFORMANCE,
          severity: ISSUE_SEVERITY.LOW,
          title: "Bot is performing well",
          description:
            "This bot has healthy engagement, good success rate, and low fallback rate.",
          affectedTopics: [],
          sampleQuestions: [],
          recommendedAction: "Continue monitoring. No urgent action required.",
        },
      ];

    case MOCK_PROFILE.UNDERUTILIZED:
      return [
        {
          type: ISSUE_TYPE.LOW_USAGE,
          severity: ISSUE_SEVERITY.MEDIUM,
          title: "Bot usage is low",
          description:
            "The bot has very low conversation volume compared to expected usage.",
          affectedTopics: ["User adoption", "Bot visibility"],
          sampleQuestions: [
            "Where can I find this bot?",
            "Can this bot help with my request?",
          ],
          recommendedAction:
            "Improve bot visibility in the product and educate users about supported use cases.",
        },
      ];

    case MOCK_PROFILE.HIGH_FALLBACK:
      return [
        {
          type: ISSUE_TYPE.FALLBACK,
          severity: ISSUE_SEVERITY.HIGH,
          title: "High fallback rate detected",
          description:
            "The bot frequently fails to understand user questions and falls back to default responses.",
          affectedTopics: ["Policy questions", "Pricing", "Process queries"],
          sampleQuestions: [
            "How do I apply for leave?",
            "What is the refund policy?",
            "Can I change my plan?",
          ],
          recommendedAction:
            "Add more training examples, improve intent coverage, and review fallback conversation logs.",
        },
      ];

    case MOCK_PROFILE.HIGH_FAILURE:
      return [
        {
          type: ISSUE_TYPE.FAILURE,
          severity: ISSUE_SEVERITY.CRITICAL,
          title: "High failure rate detected",
          description:
            "The bot is failing many conversations due to broken flows, API errors, or poor response handling.",
          affectedTopics: ["API actions", "Booking flow", "Account queries"],
          sampleQuestions: [
            "Book an appointment for tomorrow",
            "Update my profile",
            "Show my latest order",
          ],
          recommendedAction:
            "Check backend API integrations, error logs, and broken conversation flows immediately.",
        },
      ];

    case MOCK_PROFILE.HIGH_DROPOFF:
      return [
        {
          type: ISSUE_TYPE.DROPOFF,
          severity: ISSUE_SEVERITY.HIGH,
          title: "High user drop-off detected",
          description:
            "Many users leave the conversation before completing their task.",
          affectedTopics: ["Long answers", "Pricing", "Form completion"],
          sampleQuestions: [
            "Tell me the pricing details",
            "Help me complete registration",
            "Explain the plan difference",
          ],
          recommendedAction:
            "Simplify bot answers, reduce steps, and improve call-to-action clarity.",
        },
      ];

    case MOCK_PROFILE.POOR_QUALITY:
      return [
        {
          type: ISSUE_TYPE.QUALITY,
          severity: ISSUE_SEVERITY.CRITICAL,
          title: "Poor bot quality detected",
          description:
            "The bot has low success rate, high fallback rate, and high drop-off rate.",
          affectedTopics: [
            "Knowledge base",
            "Response quality",
            "User experience",
          ],
          sampleQuestions: [
            "What should I do next?",
            "Can you explain this clearly?",
            "I need help with my issue",
          ],
          recommendedAction:
            "Review bot prompt, improve knowledge base, add better examples, and test key user journeys.",
        },
      ];

    default:
      return [];
  }
};

module.exports = {
  getMockMetricByProfile,
  getMockIssuesByProfile,
};
