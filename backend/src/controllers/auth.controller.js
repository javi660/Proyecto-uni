'use strict';

const authService = require('../services/auth.service');
const { authConfig } = require('../config/auth');
const { sendOk } = require('../utils/response');
const { toPublicUser } = require('../utils/user.mapper');
const { setSessionCookies, clearSessionCookies, setCsrfCookie } = require('../utils/cookies');
const { generateCsrfToken, isValidCsrfToken } = require('../utils/tokens');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * Controladores HTTP de autenticación. Solo traducen petición/respuesta:
 * las reglas viven en services/auth.service.js. Los tokens van únicamente en cookies,
 * nunca en el cuerpo de la respuesta.
 */

/** GET /api/auth/csrf: entrega (y fija en cookie) el token CSRF. Reutiliza el vigente. */
const getCsrfToken = (req, res) => {
  const existing = req.cookies && req.cookies[authConfig.cookies.csrf];
  const token = isValidCsrfToken(existing) ? existing : generateCsrfToken();
  setCsrfCookie(res, token);
  return sendOk(res, { csrf_token: token });
};

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { correo, password } = req.validated.body;
  const result = await authService.login({ correo, password, ip: req.ip });

  setSessionCookies(res, result);
  return sendOk(res, { user: toPublicUser(result.user) });
});

/** POST /api/auth/refresh */
const refresh = asyncHandler(async (req, res) => {
  try {
    const result = await authService.refresh({
      refreshToken: req.cookies && req.cookies[authConfig.cookies.refresh],
      ip: req.ip,
    });

    setSessionCookies(res, result);
    return sendOk(res, { user: toPublicUser(result.user) });
  } catch (error) {
    // Si el refresh no es válido, se limpian las cookies para no reintentar con ellas
    if (error && error.status === 401) {
      clearSessionCookies(res);
    }
    throw error;
  }
});

/** POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  await authService.logout({
    refreshToken: req.cookies && req.cookies[authConfig.cookies.refresh],
    ip: req.ip,
  });

  clearSessionCookies(res);
  return sendOk(res, { logged_out: true });
});

/** GET /api/auth/me (los datos vienen de la base de datos, cargados por authenticate) */
const me = (req, res) => sendOk(res, { user: toPublicUser(req.user) });

/** PATCH /api/auth/password */
const changePassword = asyncHandler(async (req, res) => {
  const { password_actual: currentPassword, password_nueva: newPassword } = req.validated.body;
  const result = await authService.changePassword({
    userId: req.user.id,
    currentPassword,
    newPassword,
    ip: req.ip,
  });

  setSessionCookies(res, result);
  return sendOk(res, { user: toPublicUser(result.user) });
});

module.exports = { getCsrfToken, login, refresh, logout, me, changePassword };
