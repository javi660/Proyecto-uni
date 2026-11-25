'use strict';

const { Router } = require('express');
const controller = require('../controllers/assignment.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { PERMISSIONS } = require('../utils/permissions');
const { officialsQuery } = require('../validators/assignment.validator');

const router = Router();

router.use(authenticate());
router.get('/', requirePermission(PERMISSIONS.REQUESTS_ASSIGN), validate({ query: officialsQuery }), controller.listOfficials);

module.exports = router;
