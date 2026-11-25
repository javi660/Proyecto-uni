'use strict';

const categoryService = require('../services/category.service');
const { sendOk, sendCreated, buildMeta } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const ctx = (req) => ({ user: req.user, ip: req.ip });

const list = asyncHandler(async (req, res) => {
  const { rows, total } = await categoryService.list(req.validated.query, req.user);
  const { page, pageSize } = req.validated.query;
  return sendOk(res, rows, { meta: buildMeta({ page, pageSize, total }) });
});

const get = asyncHandler(async (req, res) => sendOk(res, await categoryService.get(req.validated.params.id, req.user)));

const create = asyncHandler(async (req, res) => sendCreated(res, await categoryService.create(req.validated.body, ctx(req))));

const update = asyncHandler(async (req, res) =>
  sendOk(res, await categoryService.update(req.validated.params.id, req.validated.body, ctx(req))));

const setStatus = asyncHandler(async (req, res) =>
  sendOk(res, await categoryService.setStatus(req.validated.params.id, req.validated.body.activo, ctx(req))));

module.exports = { list, get, create, update, setStatus };
