'use strict';

const { Router } = require('express');
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');
const { loginLimiter, passwordLimiter } = require('../middleware/rateLimiters');
const { loginSchema, changePasswordSchema } = require('../validators/auth.validator');

const router = Router();

// El token CSRF se pide antes de cualquier petición que cambie datos (incluido el login)
router.get('/csrf', controller.getCsrfToken);

router.post('/login', loginLimiter, validate({ body: loginSchema }), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);

// Estas rutas están permitidas aunque el usuario deba cambiar su contraseña
router.get('/me', authenticate({ allowPasswordChangePending: true }), controller.me);
router.patch(
  '/password',
  passwordLimiter,
  authenticate({ allowPasswordChangePending: true }),
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

module.exports = router;
