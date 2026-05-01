const { HEALTH_STATUS } = require("../constants/botConstants");

const getHealthStatus = (score) => {
  if (score >= 80) {
    return HEALTH_STATUS.HEALTHY;
  }

  if (score >= 60) {
    return HEALTH_STATUS.WARNING;
  }

  return HEALTH_STATUS.CRITICAL;
};

const calculateHealthScore = ({
  successRate = 0,
  fallbackRate = 0,
  failureRate = 0,
  dropOffRate = 0,
}) => {
  let score = 100;

  score -= fallbackRate * 0.35;
  score -= failureRate * 0.4;
  score -= dropOffRate * 0.25;

  if (successRate < 70) {
    score -= 10;
  }

  if (successRate < 50) {
    score -= 15;
  }

  score = Math.round(score);

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  return {
    healthScore: score,
    healthStatus: getHealthStatus(score),
  };
};

module.exports = {
  calculateHealthScore,
  getHealthStatus,
};
