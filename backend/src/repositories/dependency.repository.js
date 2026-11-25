'use strict';

const db = require('../config/database');
const { escapeLike, createWhere, toLimitOffset } = require('../utils/sql');

/** Acceso a datos de dependencias. Consultas parametrizadas; `client` opcional para transacciones. */

const executor = (client) => client || db;
const COLUMNS = 'id_dependencia, nombre, descripcion, activo, creado_en, actualizado_en';

async function list({ q, activo, page, pageSize }, client = null) {
  const where = createWhere();
  if (q) where.add(`(nombre ILIKE $? ESCAPE '\\' OR COALESCE(descripcion, '') ILIKE $? ESCAPE '\\')`, `%${escapeLike(q)}%`);
  if (activo !== undefined) where.add('activo = $?', activo);
  const { clause, params } = where.build();
  const { limit, offset } = toLimitOffset({ page, pageSize });

  const [{ rows }, { rows: count }] = await Promise.all([
    executor(client).query(
      `SELECT ${COLUMNS} FROM dependencias ${clause} ORDER BY nombre ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    executor(client).query(`SELECT COUNT(*) AS total FROM dependencias ${clause}`, params),
  ]);
  return { rows, total: count[0].total };
}

async function findById(id, client = null) {
  const { rows } = await executor(client).query(`SELECT ${COLUMNS} FROM dependencias WHERE id_dependencia = $1`, [id]);
  return rows[0] || null;
}

/** Busca por nombre sin distinguir mayúsculas (para dar un mensaje de duplicado claro). */
async function findByName(nombre, excludeId = null, client = null) {
  const { rows } = await executor(client).query(
    `SELECT ${COLUMNS} FROM dependencias WHERE LOWER(nombre) = LOWER($1) AND ($2::bigint IS NULL OR id_dependencia <> $2)`,
    [nombre, excludeId],
  );
  return rows[0] || null;
}

async function create({ nombre, descripcion }, client = null) {
  const { rows } = await executor(client).query(
    `INSERT INTO dependencias (nombre, descripcion) VALUES ($1, $2) RETURNING ${COLUMNS}`,
    [nombre, descripcion],
  );
  return rows[0];
}

async function update(id, { nombre, descripcion }, client = null) {
  const { rows } = await executor(client).query(
    `UPDATE dependencias SET nombre = $2, descripcion = $3 WHERE id_dependencia = $1 RETURNING ${COLUMNS}`,
    [id, nombre, descripcion],
  );
  return rows[0] || null;
}

async function setActive(id, activo, client = null) {
  const { rows } = await executor(client).query(
    `UPDATE dependencias SET activo = $2 WHERE id_dependencia = $1 RETURNING ${COLUMNS}`,
    [id, activo],
  );
  return rows[0] || null;
}

/** Cuántos servicios activos y funcionarios activos dependen de esta dependencia. */
async function countActiveDependents(id, client = null) {
  const { rows } = await executor(client).query(
    `SELECT
       (SELECT COUNT(*) FROM servicios WHERE id_dependencia = $1 AND activo) AS servicios,
       (SELECT COUNT(*) FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
         WHERE u.id_dependencia = $1 AND u.activo AND r.nombre = 'FUNCIONARIO') AS funcionarios`,
    [id],
  );
  return rows[0];
}

module.exports = { list, findById, findByName, create, update, setActive, countActiveDependents };
