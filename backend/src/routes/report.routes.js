'use strict';

const { Router } = require('express');
const controller = require('../controllers/report.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { PERMISSIONS } = require('../utils/permissions');
const { reportQuery } = require('../validators/report.validator');

/** /api/reports/* (administrador, funcionario, supervisor; el alcance lo decide reportScopeFor). */
const reports = Router();
reports.use(authenticate(), requirePermission(PERMISSIONS.REPORTS_VIEW), validate({ query: reportQuery }));
reports.get('/by-status', controller.byStatus);
reports.get('/by-category', controller.byCategory);
reports.get('/by-dependency', controller.byDependency);
reports.get('/by-period', controller.byPeriod);

/** /api/dashboard (todos los perfiles; el estudiante ve sus propias solicitudes). */
const dashboard = Router();
dashboard.get('/', authenticate(), validate({ query: reportQuery }), controller.dashboard);

module.exports = { reports, dashboard };
