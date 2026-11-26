'use strict';

const { env } = require('../config/env');
const { authConfig } = require('../config/auth');

/**
 * Cookies de sesión:
 *  - Access y refresh: HttpOnly; SameSite=None en producción y Lax en desarrollo.
 *  - CSRF: legible por el frontend (debe copiarla a la cabecera X-CSRF-Token).
 *  - El refresh solo se envía a /api/auth.
 */

function baseOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.IS_PRODUCTION ? 'none' : 'lax',
  };
}

/**
 * @param {import('express').Response} res
 * @param {{accessToken: string, refreshToken: string}} tokens
 */
function setSessionCookies(res, { accessToken, refreshToken }) {
  res.cookie(authConfig.cookies.access, accessToken, {
    ...baseOptions(),
    path: '/',
    maxAge: authConfig.accessTtlSeconds * 1000,
  });
  res.cookie(authConfig.cookies.refresh, refreshToken, {
    ...baseOptions(),
    path: authConfig.refreshCookiePath,
    maxAge: authConfig.refreshTtlMs,
  });
}

/** Borra las cookies de sesión (las opciones deben coincidir con las usadas al crearlas). */
function clearSessionCookies(res) {
  res.clearCookie(authConfig.cookies.access, { ...baseOptions(), path: '/' });
  res.clearCookie(authConfig.cookies.refresh, { ...baseOptions(), path: authConfig.refreshCookiePath });
}

/** @param {string} token Token CSRF firmado */
function setCsrfCookie(res, token) {
  res.cookie(authConfig.cookies.csrf, token, {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: env.IS_PRODUCTION ? 'none' : 'lax',
    path: '/',
    maxAge: authConfig.csrfTtlMs,
  });
}

module.exports = { setSessionCookies, clearSessionCookies, setCsrfCookie };
