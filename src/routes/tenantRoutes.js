const express = require("express");

const {
  createTenant,
  getTenants,
  getTenantById,
  updateTenant,
  deleteTenant,
} = require("../controllers/tenantController");

const router = express.Router();

router.post("/", createTenant);
router.get("/", getTenants);
router.get("/:id", getTenantById);
router.put("/:id", updateTenant);
router.delete("/:id", deleteTenant);

module.exports = router;
