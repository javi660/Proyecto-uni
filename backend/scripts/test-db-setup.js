'use strict';

/**
 * Prepara la base de datos de PRUEBAS de integración: la reinicia (esquema + seed) usando db-apply.
 *
 * Requiere TEST_DATABASE_URL en backend/.env. Se niega a continuar si es igual a DATABASE_URL,
 * para no borrar nunca la base real por accidente.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.log('[AVISO] TEST_DATABASE_URL no está definida: se omite la preparación (las pruebas de integración se saltarán).');
  console.log('        Define una base de datos SEPARADA para pruebas en backend/.env');
  process.exit(0);
}

if (testUrl === process.env.DATABASE_URL) {
  console.error('[FALLO] TEST_DATABASE_URL es igual a DATABASE_URL. Usa una base distinta para pruebas.');
  process.exit(1);
}

process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
if (!process.argv.includes('--reset')) process.argv.push('--reset');
if (!process.argv.includes('--yes')) process.argv.push('--yes');

require('./db-apply');
