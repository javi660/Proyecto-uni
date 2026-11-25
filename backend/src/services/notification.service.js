'use strict';

const notificationRepository = require('../repositories/notification.repository');
const { notFound } = require('../utils/errors');

/** Todas las operaciones se limitan a las notificaciones del usuario autenticado (nunca las de otros). */
const list = (query, user) => notificationRepository.listByUser(user.id, query);

const unreadCount = async (user) => ({ no_leidas: await notificationRepository.countUnread(user.id) });

async function markRead(id, user) {
  const updated = await notificationRepository.markRead(id, user.id);
  if (!updated) throw notFound('La notificación no existe');
  return updated;
}

async function markAllRead(user) {
  return { actualizadas: await notificationRepository.markAllRead(user.id) };
}

module.exports = { list, unreadCount, markRead, markAllRead };
