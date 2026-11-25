'use strict';

const db = require('../config/database');
const { escapeLike, createWhere, toLimitOffset } = require('../utils/sql');

/** Acceso a datos del catálogo de servicios (con nombres de categoría y dependencia). */

const executor = (client) => client || db;

const SELECT = `
  SELECT s.id_servicio, s.nombre, s.descripcion, s.id_categoria, c.nombre AS categoria,
         s.id_dependencia, d.nombre AS dependencia, s.sla_horas, s.activo, s.creado_en, s.actualizado_en
    FROM servicios s
    JOIN categorias c ON c.id_categoria = s.id_categoria
    JOIN dependencias d ON d.id_dependencia = s.id_dependencia`;

async function list({ q, activo, idCategoria, idDependencia, page, pageSize }, client = null) {
  const where = createWhere();
  if (q) where.add(`(s.nombre ILIKE $? ESCAPE '\\' OR COALESCE(s.descripcion, '') ILIKE $? ESCAPE '\\')`, `%${escapeLike(q)}%`);
  if (activo !== undefined) where.add('s.activo = $?', activo);
  if (idCategoria !== undefined) where.add('s.id_categoria = $?', idCategoria);
  if (idDependencia !== undefined) where.add('s.id_dependencia = $?', idDependencia);
  const { clause, params } = where.build();
  const { limit, offset } = toLimitOffset({ page, pageSize });

  const [{ rows }, { rows: count }] = await Promise.all([
    executor(client).query(
      `${SELECT} ${clause} ORDER BY c.nombre ASC, s.nombre ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    executor(client).query(`SELECT COUNT(*) AS total FROM servicios s ${clause}`, params),
  ]);
  return { rows, total: count[0].total };
}

async function findById(id, client = null) {
  const { rows } = await executor(client).query(`${SELECT} WHERE s.id_servicio = $1`, [id]);
  return rows[0] || null;
}

/** Nombre repetido dentro de la misma categoría (sin distinguir mayúsculas). */
async function findByNameInCategory(nombre, idCategoria, excludeId = null, client = null) {
  const { rows } = await executor(client).query(
    `SELECT id_servicio FROM servicios
      WHERE id_categoria = $2 AND LOWER(nombre) = LOWER($1) AND ($3::bigint IS NULL OR id_servicio <> $3)`,
    [nombre, idCategoria, excludeId],
  );
  return rows[0] || null;
}

async function create({ nombre, descripcion, idCategoria, idDependencia, slaHoras }, client = null) {
  const { rows } = await executor(client).query(
    `INSERT INTO servicios (nombre, descripcion, id_categoria, id_dependencia, sla_horas)
     VALUES ($1, $2, $3, $4, $5) RETURNING id_servicio`,
    [nombre, descripcion, idCategoria, idDependencia, slaHoras],
  );
  return rows[0].id_servicio;
}

async function update(id, { nombre, descripcion, idCategoria, idDependencia, slaHoras }, client = null) {
  const { rowCount } = await executor(client).query(
    `UPDATE servicios SET nombre = $2, descripcion = $3, id_categoria = $4, id_dependencia = $5, sla_horas = $6
      WHERE id_servicio = $1`,
    [id, nombre, descripcion, idCategoria, idDependencia, slaHoras],
  );
  return rowCount > 0;
}

async function setActive(id, activo, client = null) {
  const { rowCount } = await executor(client).query('UPDATE servicios SET activo = $2 WHERE id_servicio = $1', [id, activo]);
  return rowCount > 0;
}

module.exports = { list, findById, findByNameInCategory, create, update, setActive };
