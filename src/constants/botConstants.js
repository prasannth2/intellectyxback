const BOT_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
};

const TENANT_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
};

const MOCK_PROFILE = {
  HEALTHY: "healthy",
  UNDERUTILIZED: "underutilized",
  HIGH_FALLBACK: "high_fallback",
  HIGH_FAILURE: "high_failure",
  HIGH_DROPOFF: "high_dropoff",
  POOR_QUALITY: "poor_quality",
};

const HEALTH_STATUS = {
  HEALTHY: "healthy",
  WARNING: "warning",
  CRITICAL: "critical",
};

const ISSUE_SEVERITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

const ISSUE_STATUS = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
};

const ISSUE_TYPE = {
  FALLBACK: "fallback",
  FAILURE: "failure",
  DROPOFF: "dropoff",
  LOW_USAGE: "low_usage",
  QUALITY: "quality",
  PERFORMANCE: "performance",
};

const BOT_USE_CASES = {
  CUSTOMER_SUPPORT: "Customer Support",
  HR_ONBOARDING: "HR Onboarding",
  PRODUCT_FAQ: "Product FAQ",
  SALES_ASSISTANT: "Sales Assistant",
  APPOINTMENT_BOOKING: "Appointment Booking",
  INTERNAL_HELPDESK: "Internal Helpdesk",
};

module.exports = {
  BOT_STATUS,
  TENANT_STATUS,
  MOCK_PROFILE,
  HEALTH_STATUS,
  ISSUE_SEVERITY,
  ISSUE_STATUS,
  ISSUE_TYPE,
  BOT_USE_CASES,
};
