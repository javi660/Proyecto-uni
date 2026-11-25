'use strict';

// Pruebas unitarias y de rutas con dependencias simuladas (no necesitan base de datos)
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/integration/'],
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  clearMocks: true,
};
