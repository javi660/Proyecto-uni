'use strict';

const { Router } = require('express');
const { getHealth, getDatabaseHealth } = require('../controllers/health.controller');

const router = Router();

router.get('/', getHealth);
router.get('/db', getDatabaseHealth);

module.exports = router;
