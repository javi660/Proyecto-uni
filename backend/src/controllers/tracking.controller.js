'use strict';

const trackingService = require('../services/tracking.service');
const { sendOk, sendCreated } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const ctx = (req) => ({ user: req.user, ip: req.ip });

const changeStatus = asyncHandler(async (req, res) =>
  sendOk(res, await trackingService.changeStatus(req.validated.params.id, req.validated.body, ctx(req))));

const changePriority = asyncHandler(async (req, res) =>
  sendOk(res, await trackingService.changePriority(req.validated.params.id, req.validated.body, ctx(req))));

const addResponse = asyncHandler(async (req, res) =>
  sendCreated(res, await trackingService.addResponse(req.validated.params.id, req.validated.body, ctx(req))));

const listResponses = asyncHandler(async (req, res) => sendOk(res, await trackingService.listResponses(req.validated.params.id, req.user)));

const timeline = asyncHandler(async (req, res) => sendOk(res, await trackingService.timeline(req.validated.params.id, req.user)));

module.exports = { changeStatus, changePriority, addResponse, listResponses, timeline };
