'use strict';

const userAdmin = require('../services/userAdmin.service');
const { sendOk, sendCreated, buildMeta } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const ctx = (req) => ({ user: req.user, ip: req.ip });

const list = asyncHandler(async (req, res) => {
  const { rows, total } = await userAdmin.list(req.validated.query);
  const { page, pageSize } = req.validated.query;
  return sendOk(res, rows, { meta: buildMeta({ page, pageSize, total }) });
});

const get = asyncHandler(async (req, res) => sendOk(res, await userAdmin.get(req.validated.params.id)));

const create = asyncHandler(async (req, res) => sendCreated(res, await userAdmin.create(req.validated.body, ctx(req))));

const update = asyncHandler(async (req, res) =>
  sendOk(res, await userAdmin.update(req.validated.params.id, req.validated.body, ctx(req))));

const setStatus = asyncHandler(async (req, res) =>
  sendOk(res, await userAdmin.setStatus(req.validated.params.id, req.validated.body.activo, ctx(req))));

const resetPassword = asyncHandler(async (req, res) =>
  sendOk(res, await userAdmin.resetPassword(req.validated.params.id, req.validated.body, ctx(req))));

const getSupervision = asyncHandler(async (req, res) => sendOk(res, await userAdmin.getSupervision(req.validated.params.id)));

const setSupervision = asyncHandler(async (req, res) =>
  sendOk(res, await userAdmin.setSupervision(req.validated.params.id, req.validated.body, ctx(req))));

module.exports = { list, get, create, update, setStatus, resetPassword, getSupervision, setSupervision };
