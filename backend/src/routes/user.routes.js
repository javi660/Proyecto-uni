'use strict';

const { Router } = require('express');
const controller = require('../controllers/user.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { PERMISSIONS } = require('../utils/permissions');
const { idParamSchema, statusBodySchema } = require('../validators/common.validator');
const {
  listUsersQuery, createUserSchema, updateUserSchema, resetPasswordSchema, supervisionSchema,
} = require('../validators/user.validator');

const router = Router();

// Toda la administración de usuarios es exclusiva del administrador
router.use(authenticate(), requirePermission(PERMISSIONS.USERS_MANAGE));

router.get('/', validate({ query: listUsersQuery }), controller.list);
router.post('/', validate({ body: createUserSchema }), controller.create);
router.get('/:id', validate({ params: idParamSchema }), controller.get);
router.put('/:id', validate({ params: idParamSchema, body: updateUserSchema }), controller.update);
router.patch('/:id/status', validate({ params: idParamSchema, body: statusBodySchema }), controller.setStatus);
router.patch('/:id/password-reset', validate({ params: idParamSchema, body: resetPasswordSchema }), controller.resetPassword);
router.get('/:id/supervision', validate({ params: idParamSchema }), controller.getSupervision);
router.put('/:id/supervision', validate({ params: idParamSchema, body: supervisionSchema }), controller.setSupervision);

module.exports = router;
