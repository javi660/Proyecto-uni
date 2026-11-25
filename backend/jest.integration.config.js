'use strict';

// Pruebas de integración contra PostgreSQL real (TEST_DATABASE_URL). Se saltan si no está definida.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup-integration.js'],
  testTimeout: 30000,
  clearMocks: true,
};
