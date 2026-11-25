'use strict';

const requestService = require('../services/request.service');
const attachmentService = require('../services/attachment.service');
const { sendOk, sendCreated, buildMeta } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const ctx = (req) => ({ user: req.user, ip: req.ip });

const create = asyncHandler(async (req, res) => sendCreated(res, await requestService.create(req.validated.body, ctx(req))));

const listWith = (options) => asyncHandler(async (req, res) => {
  const { rows, total } = await requestService.list(req.validated.query, req.user, options);
  const { page, pageSize } = req.validated.query;
  return sendOk(res, rows, { meta: buildMeta({ page, pageSize, total }) });
});

const list = listWith({});
const listMine = listWith({ forceOwn: true });

const get = asyncHandler(async (req, res) => sendOk(res, await requestService.get(req.validated.params.id, req.user)));

const listAttachments = asyncHandler(async (req, res) => sendOk(res, await attachmentService.list(req.validated.params.id, req.user)));

const uploadAttachment = asyncHandler(async (req, res) =>
  sendCreated(res, await attachmentService.upload(req.validated.params.id, req.file, ctx(req))));

/** Nombre seguro para Content-Disposition: alternativa ASCII + versión UTF-8 codificada (RFC 5987). */
function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const download = asyncHandler(async (req, res) => {
  const { buffer, mime, filename } = await attachmentService.download(req.validated.params.id, ctx(req));
  res.set({
    'Content-Type': mime,
    'Content-Length': String(buffer.length),
    'Content-Disposition': contentDisposition(filename),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  return res.status(200).send(buffer);
});

module.exports = { create, list, listMine, get, listAttachments, uploadAttachment, download };
