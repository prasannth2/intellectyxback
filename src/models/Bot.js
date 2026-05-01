const mongoose = require("mongoose");
const { BOT_STATUS, MOCK_PROFILE } = require("../constants/botConstants");

const botSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "Tenant ID is required"],
    },

    name: {
      type: String,
      required: [true, "Bot name is required"],
      trim: true,
    },

    useCase: {
      type: String,
      required: [true, "Bot use case is required"],
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    personality: {
      type: String,
      default: "Helpful and professional",
      trim: true,
    },

    channels: {
      type: [String],
      default: ["web"],
    },

    status: {
      type: String,
      enum: Object.values(BOT_STATUS),
      default: BOT_STATUS.ACTIVE,
    },

    mockProfile: {
      type: String,
      enum: Object.values(MOCK_PROFILE),
      default: MOCK_PROFILE.HEALTHY,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Bot", botSchema);
