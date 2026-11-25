'use strict';

const auditService = require('../services/audit.service');
const { sendOk, buildMeta } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { rows, total } = await auditService.list(req.validated.query);
  const { page, pageSize } = req.validated.query;
  return sendOk(res, rows, { meta: buildMeta({ page, pageSize, total }) });
});
const get = asyncHandler(async (req, res) => sendOk(res, await auditService.get(req.validated.params.id)));
const filters = asyncHandler(async (req, res) => sendOk(res, await auditService.filters()));

module.exports = { list, get, filters };
