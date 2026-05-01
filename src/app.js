const express = require("express");
const cors = require("cors");
const routes = require("./routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({
    status: 1,
    message: "Bot Monitoring Backend API is running",
  });
});

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({
    status: 0,
    message: "API route not found",
  });
});

app.use((error, req, res, next) => {
  console.error("Global Error:", error);

  res.status(error.statusCode || 500).json({
    status: 0,
    message: error.message || "Internal server error",
  });
});

module.exports = app;
