'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// Las pruebas de integración usan SIEMPRE la base de pruebas, nunca DATABASE_URL
if (process.env.TEST_DATABASE_URL) {
  if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL no puede ser igual a DATABASE_URL');
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-9876543210-zyxwvutsrqponmlkjihgfedcba';
process.env.BCRYPT_COST = '4';
process.env.COOKIE_SECURE = 'false';
