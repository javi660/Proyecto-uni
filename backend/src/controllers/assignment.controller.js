'use strict';

const assignmentService = require('../services/assignment.service');
const { sendOk, buildMeta } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const assign = asyncHandler(async (req, res) =>
  sendOk(res, await assignmentService.assign(req.validated.params.id, req.validated.body, { user: req.user, ip: req.ip })));

const listForRequest = asyncHandler(async (req, res) =>
  sendOk(res, await assignmentService.listForRequest(req.validated.params.id, req.user)));

const listOfficials = asyncHandler(async (req, res) => {
  const { rows, total } = await assignmentService.listOfficials(req.validated.query, req.user);
  const { page, pageSize } = req.validated.query;
  return sendOk(res, rows, { meta: buildMeta({ page, pageSize, total }) });
});

module.exports = { assign, listForRequest, listOfficials };
