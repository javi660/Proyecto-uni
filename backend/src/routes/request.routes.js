'use strict';

const { Router } = require('express');
const controller = require('../controllers/request.controller');
const assignmentController = require('../controllers/assignment.controller');
const trackingController = require('../controllers/tracking.controller');
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const { validate } = require('../middleware/validate');
const { receiveAttachment } = require('../middleware/upload');
const { PERMISSIONS } = require('../utils/permissions');
const { idParamSchema } = require('../validators/common.validator');
const { createRequestBody, listRequestsQuery } = require('../validators/request.validator');
const { assignBody } = require('../validators/assignment.validator');
const { statusBody, priorityBody, responseBody } = require('../validators/tracking.validator');

const router = Router();

router.use(authenticate());

router.post('/', requirePermission(PERMISSIONS.REQUESTS_CREATE), validate({ body: createRequestBody }), controller.create);
router.get('/my', requirePermission(PERMISSIONS.REQUESTS_CREATE), validate({ query: listRequestsQuery }), controller.listMine);
router.get('/', requirePermission(PERMISSIONS.REQUESTS_VIEW), validate({ query: listRequestsQuery }), controller.list);
router.get('/:id', requirePermission(PERMISSIONS.REQUESTS_VIEW), validate({ params: idParamSchema }), controller.get);

router.get('/:id/attachments', requirePermission(PERMISSIONS.REQUESTS_VIEW), validate({ params: idParamSchema }), controller.listAttachments);
router.post(
  '/:id/attachments',
  requirePermission(PERMISSIONS.ATTACHMENTS_UPLOAD),
  validate({ params: idParamSchema }),
  receiveAttachment,
  controller.uploadAttachment,
);

router.get('/:id/assignments', requirePermission(PERMISSIONS.REQUESTS_VIEW), validate({ params: idParamSchema }), assignmentController.listForRequest);
router.post(
  '/:id/assignment',
  requirePermission(PERMISSIONS.REQUESTS_ASSIGN),
  validate({ params: idParamSchema, body: assignBody }),
  assignmentController.assign,
);

// Seguimiento (Fase 8). El permiso depende del estado destino, por lo que se valida dentro del servicio.
router.patch('/:id/status', validate({ params: idParamSchema, body: statusBody }), trackingController.changeStatus);
router.patch('/:id/priority', validate({ params: idParamSchema, body: priorityBody }), trackingController.changePriority);
router.get('/:id/responses', requirePermission(PERMISSIONS.REQUESTS_VIEW), validate({ params: idParamSchema }), trackingController.listResponses);
router.post('/:id/responses', requirePermission(PERMISSIONS.RESPONSES_CREATE), validate({ params: idParamSchema, body: responseBody }), trackingController.addResponse);
router.get('/:id/timeline', requirePermission(PERMISSIONS.HISTORY_VIEW), validate({ params: idParamSchema }), trackingController.timeline);

module.exports = router;
