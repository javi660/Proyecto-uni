'use strict';

const { Router } = require('express');
const controller = require('../controllers/request.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { PERMISSIONS } = require('../utils/permissions');
const { idParamSchema } = require('../validators/common.validator');

const router = Router();

router.use(authenticate());
router.get('/:id/download', requirePermission(PERMISSIONS.ATTACHMENTS_DOWNLOAD), validate({ params: idParamSchema }), controller.download);

module.exports = router;
