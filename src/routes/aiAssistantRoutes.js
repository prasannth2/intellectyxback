const express = require("express");

const {
  chatWithAssistant,
  streamChatWithAssistant,
} = require("../controllers/aiAssistantController");

const router = express.Router();

router.post("/chat", chatWithAssistant);
router.post("/stream", streamChatWithAssistant);

module.exports = router;
