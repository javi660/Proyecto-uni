'use strict';

/**
 * Logger mínimo con formato de una línea por evento.
 * No registra contraseñas, tokens ni cadenas de conexión: quien lo use debe
 * pasar solo metadatos seguros (códigos, identificadores, rutas).
 * En pruebas (NODE_ENV=test) no escribe nada.
 */

function write(level, message, meta) {
  if (process.env.NODE_ENV === 'test') return;

  const line = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  };

  const output = JSON.stringify(line);
  if (level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
