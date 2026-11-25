'use strict';

const { Router } = require('express');
const controller = require('../controllers/service.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { PERMISSIONS } = require('../utils/permissions');
const { idParamSchema, statusBodySchema } = require('../validators/common.validator');
const { listServicesQuery, serviceBodySchema } = require('../validators/catalog.validator');

const router = Router();
const view = requirePermission(PERMISSIONS.CATALOG_VIEW);
const manage = requirePermission(PERMISSIONS.SERVICES_MANAGE);

router.use(authenticate());

router.get('/', view, validate({ query: listServicesQuery }), controller.list);
router.get('/:id', view, validate({ params: idParamSchema }), controller.get);

router.post('/', manage, validate({ body: serviceBodySchema }), controller.create);
router.put('/:id', manage, validate({ params: idParamSchema, body: serviceBodySchema }), controller.update);
router.patch('/:id/status', manage, validate({ params: idParamSchema, body: statusBodySchema }), controller.setStatus);

module.exports = router;
