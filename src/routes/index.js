const express = require("express");

const tenantRoutes = require("./tenantRoutes");
const botRoutes = require("./botRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const aiAssistantRoutes = require("./aiAssistantRoutes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    status: 1,
    message: "API health check successful",
    data: {
      service: "bot-monitoring-backend",
      uptime: process.uptime(),
    },
  });
});

router.use("/tenants", tenantRoutes);
router.use("/bots", botRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/ai-assistant", aiAssistantRoutes);

module.exports = router;
