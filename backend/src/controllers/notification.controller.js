'use strict';

const notificationService = require('../services/notification.service');
const { sendOk, buildMeta } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { rows, total } = await notificationService.list(req.validated.query, req.user);
  const { page, pageSize } = req.validated.query;
  return sendOk(res, rows, { meta: buildMeta({ page, pageSize, total }) });
});

const unreadCount = asyncHandler(async (req, res) => sendOk(res, await notificationService.unreadCount(req.user)));
const markRead = asyncHandler(async (req, res) => sendOk(res, await notificationService.markRead(req.validated.params.id, req.user)));
const markAllRead = asyncHandler(async (req, res) => sendOk(res, await notificationService.markAllRead(req.user)));

module.exports = { list, unreadCount, markRead, markAllRead };
