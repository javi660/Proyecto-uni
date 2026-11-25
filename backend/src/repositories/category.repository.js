'use strict';

const db = require('../config/database');
const { escapeLike, createWhere, toLimitOffset } = require('../utils/sql');

/** Acceso a datos de categorías. Consultas parametrizadas; `client` opcional para transacciones. */

const executor = (client) => client || db;
const COLUMNS = 'id_categoria, nombre, descripcion, activo, creado_en, actualizado_en';

async function list({ q, activo, page, pageSize }, client = null) {
  const where = createWhere();
  if (q) where.add(`(nombre ILIKE $? ESCAPE '\\' OR COALESCE(descripcion, '') ILIKE $? ESCAPE '\\')`, `%${escapeLike(q)}%`);
  if (activo !== undefined) where.add('activo = $?', activo);
  const { clause, params } = where.build();
  const { limit, offset } = toLimitOffset({ page, pageSize });

  const [{ rows }, { rows: count }] = await Promise.all([
    executor(client).query(
      `SELECT ${COLUMNS} FROM categorias ${clause} ORDER BY nombre ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    executor(client).query(`SELECT COUNT(*) AS total FROM categorias ${clause}`, params),
  ]);
  return { rows, total: count[0].total };
}

async function findById(id, client = null) {
  const { rows } = await executor(client).query(`SELECT ${COLUMNS} FROM categorias WHERE id_categoria = $1`, [id]);
  return rows[0] || null;
}

async function findByName(nombre, excludeId = null, client = null) {
  const { rows } = await executor(client).query(
    `SELECT ${COLUMNS} FROM categorias WHERE LOWER(nombre) = LOWER($1) AND ($2::bigint IS NULL OR id_categoria <> $2)`,
    [nombre, excludeId],
  );
  return rows[0] || null;
}

async function create({ nombre, descripcion }, client = null) {
  const { rows } = await executor(client).query(
    `INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING ${COLUMNS}`,
    [nombre, descripcion],
  );
  return rows[0];
}

async function update(id, { nombre, descripcion }, client = null) {
  const { rows } = await executor(client).query(
    `UPDATE categorias SET nombre = $2, descripcion = $3 WHERE id_categoria = $1 RETURNING ${COLUMNS}`,
    [id, nombre, descripcion],
  );
  return rows[0] || null;
}

async function setActive(id, activo, client = null) {
  const { rows } = await executor(client).query(
    `UPDATE categorias SET activo = $2 WHERE id_categoria = $1 RETURNING ${COLUMNS}`,
    [id, activo],
  );
  return rows[0] || null;
}

async function countActiveServices(id, client = null) {
  const { rows } = await executor(client).query(
    'SELECT COUNT(*) AS total FROM servicios WHERE id_categoria = $1 AND activo',
    [id],
  );
  return rows[0].total;
}

module.exports = { list, findById, findByName, create, update, setActive, countActiveServices };
