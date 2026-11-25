'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { env } = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const dependencyRoutes = require('./routes/dependency.routes');
const categoryRoutes = require('./routes/category.routes');
const serviceRoutes = require('./routes/service.routes');
const requestRoutes = require('./routes/request.routes');
const attachmentRoutes = require('./routes/attachment.routes');
const officialRoutes = require('./routes/official.routes');
const notificationRoutes = require('./routes/notification.routes');
const reportRoutes = require('./routes/report.routes');
const auditRoutes = require('./routes/audit.routes');
const { csrfProtection } = require('./middleware/csrf');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sendError } = require('./utils/response');

/**
 * Crea la aplicación Express (sin abrir el puerto, para poder probarla con Supertest).
 * Las rutas de cada módulo se irán registrando aquí en las fases siguientes.
 *
 * @param {{registerRoutes?: (app: import('express').Express) => void}} [options]
 *   `registerRoutes` es un punto de extensión SOLO para pruebas: permite montar rutas de
 *   ejemplo protegidas con authenticate/authorize antes del manejador 404.
 */
function createApp({ registerRoutes } = {}) {
  const app = express();

  // Detrás de un proxy/balanceador, req.ip debe reflejar la IP real del cliente
  app.set('trust proxy', env.TRUST_PROXY);

  // No revelar la tecnología del servidor
  app.disable('x-powered-by');

  // Cabeceras HTTP de seguridad
  app.use(helmet());

  // CORS: solo los orígenes configurados, con credenciales (cookies HttpOnly desde la Fase 3)
  app.use(
    cors({
      origin: (origin, callback) => {
        // Peticiones sin Origin (curl, Postman, mismo origen) se permiten; el navegador siempre envía Origin en CORS
        if (!origin || env.CORS_ORIGINS_LIST.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  );

  // Limitación general de peticiones por IP (el login tendrá un límite más estricto en la Fase 3)
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.NODE_ENV === 'test' ? 10000 : 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res) =>
        sendError(res, 429, 'RATE_LIMITED', 'Demasiadas peticiones. Intenta nuevamente en unos minutos'),
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Las respuestas de la API contienen datos personales: nunca deben quedar en cachés del navegador o de intermediarios
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // CSRF: toda petición que cambia datos debe traer el token (ver middleware/csrf.js)
  app.use('/api', csrfProtection);

  // Rutas
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/dependencies', dependencyRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/requests', requestRoutes);
  app.use('/api/attachments', attachmentRoutes);
  app.use('/api/officials', officialRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reports', reportRoutes.reports);
  app.use('/api/dashboard', reportRoutes.dashboard);
  app.use('/api/audit', auditRoutes);

  if (typeof registerRoutes === 'function') {
    registerRoutes(app);
  }

  // 404 y manejo central de errores (siempre al final)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
