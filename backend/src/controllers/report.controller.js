'use strict';

const reportService = require('../services/report.service');
const { sendOk } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const dashboard = asyncHandler(async (req, res) => sendOk(res, await reportService.dashboard(req.validated.query, req.user)));

/** Responde JSON o, con ?formato=csv, un archivo descargable. */
const report = (name, serviceFn) => asyncHandler(async (req, res) => {
  const result = await serviceFn(req.validated.query, req.user);
  if (req.validated.query.formato !== 'csv') return sendOk(res, result);
  const { filename, content } = reportService.csvFor(name, result);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(`﻿${content}`);
});

module.exports = {
  dashboard,
  byStatus: report('by-status', reportService.byStatus),
  byCategory: report('by-category', reportService.byCategory),
  byDependency: report('by-dependency', reportService.byDependency),
  byPeriod: report('by-period', reportService.byPeriod),
};
