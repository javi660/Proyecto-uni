'use strict';

const { Router } = require('express');
const controller = require('../controllers/dependency.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { PERMISSIONS } = require('../utils/permissions');
const { idParamSchema, statusBodySchema } = require('../validators/common.validator');
const { listDependenciesQuery, dependencyBodySchema } = require('../validators/catalog.validator');

const router = Router();
const view = requirePermission(PERMISSIONS.CATALOG_VIEW);
const manage = requirePermission(PERMISSIONS.DEPENDENCIES_MANAGE);

router.use(authenticate());

// Consulta: todos los perfiles (los no administradores solo ven las activas)
router.get('/', view, validate({ query: listDependenciesQuery }), controller.list);
router.get('/:id', view, validate({ params: idParamSchema }), controller.get);

// Gestión: solo administrador
router.post('/', manage, validate({ body: dependencyBodySchema }), controller.create);
router.put('/:id', manage, validate({ params: idParamSchema, body: dependencyBodySchema }), controller.update);
router.patch('/:id/status', manage, validate({ params: idParamSchema, body: statusBodySchema }), controller.setStatus);

module.exports = router;
