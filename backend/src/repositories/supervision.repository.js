'use strict';

const db = require('../config/database');

/** Dependencias que supervisa cada supervisor (tabla supervision_dependencia). */

const executor = (client) => client || db;

async function listBySupervisor(idSupervisor, client = null) {
  const { rows } = await executor(client).query(
    `SELECT d.id_dependencia, d.nombre, d.activo
       FROM supervision_dependencia s
       JOIN dependencias d ON d.id_dependencia = s.id_dependencia
      WHERE s.id_supervisor = $1
      ORDER BY d.nombre ASC`,
    [idSupervisor],
  );
  return rows;
}

/** Reemplaza el conjunto completo de dependencias supervisadas (usar dentro de una transacción). */
async function replace(idSupervisor, idsDependencias, client) {
  await client.query(
    'DELETE FROM supervision_dependencia WHERE id_supervisor = $1 AND NOT (id_dependencia = ANY($2::bigint[]))',
    [idSupervisor, idsDependencias],
  );
  if (idsDependencias.length > 0) {
    await client.query(
      `INSERT INTO supervision_dependencia (id_supervisor, id_dependencia)
       SELECT $1, UNNEST($2::bigint[])
       ON CONFLICT (id_supervisor, id_dependencia) DO NOTHING`,
      [idSupervisor, idsDependencias],
    );
  }
}

async function countBySupervisor(idSupervisor, client = null) {
  const { rows } = await executor(client).query(
    'SELECT COUNT(*) AS total FROM supervision_dependencia WHERE id_supervisor = $1',
    [idSupervisor],
  );
  return rows[0].total;
}

module.exports = { listBySupervisor, replace, countBySupervisor };
