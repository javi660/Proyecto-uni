'use strict';

const { Router } = require('express');
const controller = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { PERMISSIONS } = require('../utils/permissions');
const { idParamSchema } = require('../validators/common.validator');
const { listQuery } = require('../validators/audit.validator');

const router = Router();

// Solo lectura y solo administrador: ningún endpoint modifica ni borra la auditoría (§3.4).
router.use(authenticate(), requirePermission(PERMISSIONS.AUDIT_VIEW));
router.get('/', validate({ query: listQuery }), controller.list);
router.get('/filters', controller.filters);
router.get('/:id', validate({ params: idParamSchema }), controller.get);

module.exports = router;
