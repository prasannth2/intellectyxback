const Tenant = require("../models/Tenant");
const Bot = require("../models/Bot");
const BotMetric = require("../models/BotMetric");
const BotIssue = require("../models/BotIssue");
const { successResponse, errorResponse } = require("../utils/response");

const createTenant = async (req, res) => {
  try {
    const { name, code, industry, contactEmail, status } = req.body;

    if (!name || !code || !industry || !contactEmail) {
      return errorResponse(
        res,
        "name, code, industry and contactEmail are required",
        400,
      );
    }

    const existingTenant = await Tenant.findOne({
      code: code.toUpperCase(),
    });

    if (existingTenant) {
      return errorResponse(res, "Tenant code already exists", 409);
    }

    const tenant = await Tenant.create({
      name,
      code,
      industry,
      contactEmail,
      status,
    });

    return successResponse(res, "Tenant created successfully", tenant, 201);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const getTenants = async (req, res) => {
  try {
    const { status, search } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { industry: { $regex: search, $options: "i" } },
        { contactEmail: { $regex: search, $options: "i" } },
      ];
    }

    const tenants = await Tenant.find(filter).sort({ createdAt: -1 });

    return successResponse(res, "Tenants fetched successfully", tenants);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const getTenantById = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);

    if (!tenant) {
      return errorResponse(res, "Tenant not found", 404);
    }

    return successResponse(res, "Tenant fetched successfully", tenant);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const updateTenant = async (req, res) => {
  try {
    const { name, code, industry, contactEmail, status } = req.body;

    const tenant = await Tenant.findById(req.params.id);

    if (!tenant) {
      return errorResponse(res, "Tenant not found", 404);
    }

    if (code && code.toUpperCase() !== tenant.code) {
      const existingTenant = await Tenant.findOne({
        code: code.toUpperCase(),
        _id: { $ne: req.params.id },
      });

      if (existingTenant) {
        return errorResponse(res, "Tenant code already exists", 409);
      }
    }

    tenant.name = name ?? tenant.name;
    tenant.code = code ?? tenant.code;
    tenant.industry = industry ?? tenant.industry;
    tenant.contactEmail = contactEmail ?? tenant.contactEmail;
    tenant.status = status ?? tenant.status;

    await tenant.save();

    return successResponse(res, "Tenant updated successfully", tenant);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

const deleteTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);

    if (!tenant) {
      return errorResponse(res, "Tenant not found", 404);
    }

    await BotIssue.deleteMany({ tenantId: tenant._id });
    await BotMetric.deleteMany({ tenantId: tenant._id });
    await Bot.deleteMany({ tenantId: tenant._id });
    await Tenant.findByIdAndDelete(tenant._id);

    return successResponse(
      res,
      "Tenant and related bot data deleted successfully",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  createTenant,
  getTenants,
  getTenantById,
  updateTenant,
  deleteTenant,
};
