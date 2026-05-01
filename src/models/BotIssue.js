const mongoose = require("mongoose");
const {
  ISSUE_TYPE,
  ISSUE_SEVERITY,
  ISSUE_STATUS,
} = require("../constants/botConstants");

const botIssueSchema = new mongoose.Schema(
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

    type: {
      type: String,
      enum: Object.values(ISSUE_TYPE),
      required: [true, "Issue type is required"],
    },

    severity: {
      type: String,
      enum: Object.values(ISSUE_SEVERITY),
      default: ISSUE_SEVERITY.MEDIUM,
    },

    title: {
      type: String,
      required: [true, "Issue title is required"],
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    affectedTopics: {
      type: [String],
      default: [],
    },

    sampleQuestions: {
      type: [String],
      default: [],
    },

    recommendedAction: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: Object.values(ISSUE_STATUS),
      default: ISSUE_STATUS.OPEN,
    },
  },
  {
    timestamps: true,
  },
);

botIssueSchema.index({ tenantId: 1, botId: 1 });
botIssueSchema.index({ severity: 1, status: 1 });

module.exports = mongoose.model("BotIssue", botIssueSchema);
