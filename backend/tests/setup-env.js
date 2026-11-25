'use strict';

// Variables de entorno fijas para las pruebas unitarias (no dependen del .env del desarrollador)
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-9876543210-zyxwvutsrqponmlkjihgfedcba';
process.env.BCRYPT_COST = '4';
process.env.COOKIE_SECURE = 'false';
