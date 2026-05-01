const mongoose = require("mongoose");
const { HEALTH_STATUS } = require("../constants/botConstants");

const botMetricSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "Tenant ID is required"],
    },

    botId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bot",
      required: [true, "Bot ID is required"],
    },

    totalConversations: {
      type: Number,
      default: 0,
    },

    activeUsers: {
      type: Number,
      default: 0,
    },

    successRate: {
      type: Number,
      default: 0,
    },

    fallbackRate: {
      type: Number,
      default: 0,
    },

    failureRate: {
      type: Number,
      default: 0,
    },

    dropOffRate: {
      type: Number,
      default: 0,
    },

    avgResponseTime: {
      type: Number,
      default: 0,
    },

    healthScore: {
      type: Number,
      default: 0,
    },

    healthStatus: {
      type: String,
      enum: Object.values(HEALTH_STATUS),
      default: HEALTH_STATUS.HEALTHY,
    },
  },
  {
    timestamps: true,
  },
);

botMetricSchema.index({ tenantId: 1, botId: 1 });

module.exports = mongoose.model("BotMetric", botMetricSchema);
