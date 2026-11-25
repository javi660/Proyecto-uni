'use strict';

const bcrypt = require('bcrypt');
const { authConfig } = require('../config/auth');

/**
 * Hash y verificación de contraseñas con bcrypt.
 * La política de contraseñas (longitud y composición) está en validators/auth.validator.js.
 */

/** @param {string} plain @returns {Promise<string>} hash bcrypt (60 caracteres) */
function hashPassword(plain) {
  return bcrypt.hash(plain, authConfig.bcryptCost);
}

/** @param {string} plain @param {string} hash @returns {Promise<boolean>} */
function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

let dummyHashPromise = null;

/**
 * Compara contra un hash falso. Se usa cuando el correo no existe, para que la respuesta
 * tarde lo mismo que con un correo válido (evita descubrir qué correos están registrados
 * midiendo el tiempo de respuesta). Siempre devuelve false.
 * @param {string} plain
 */
async function verifyAgainstDummy(plain) {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('contrasena-inexistente-para-igualar-tiempos', authConfig.bcryptCost);
  }
  await bcrypt.compare(plain, await dummyHashPromise);
  return false;
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy };
