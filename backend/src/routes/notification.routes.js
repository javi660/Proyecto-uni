'use strict';

const { Router } = require('express');
const controller = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { PERMISSIONS } = require('../utils/permissions');
const { idParamSchema } = require('../validators/common.validator');
const { listQuery } = require('../validators/notification.validator');

const router = Router();

router.use(authenticate(), requirePermission(PERMISSIONS.NOTIFICATIONS_OWN));

router.get('/', validate({ query: listQuery }), controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', validate({ params: idParamSchema }), controller.markRead);

module.exports = router;
