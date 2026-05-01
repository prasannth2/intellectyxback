const express = require("express");

const {
  createBot,
  getBots,
  getBotById,
  updateBot,
  deleteBot,
} = require("../controllers/botController");

const router = express.Router();

router.post("/", createBot);
router.get("/", getBots);
router.get("/:id", getBotById);
router.put("/:id", updateBot);
router.delete("/:id", deleteBot);

module.exports = router;
