'use strict';

/**
 * Aplica, en orden, las migraciones pendientes de database/migrations/*.sql a DATABASE_URL.
 *
 * Uso (desde backend/):
 *   npm run db:migrate            Aplica las pendientes
 *   npm run db:migrate -- --list  Muestra cuáles están aplicadas y cuáles pendientes
 *
 * Lleva el control en la tabla `schema_migrations`. Cada migración se ejecuta dentro de una
 * transacción junto con su registro: si falla, no queda nada a medias.
 * Una instalación nueva (schema.sql actual) ya incluye los cambios: las migraciones son idempotentes
 * (IF NOT EXISTS), por lo que aplicarlas sobre ella no rompe nada.
 */

const fs = require('fs');
const path = require('path');
const { query, withTransaction, closePool } = require('../src/config/database');

const DIR = path.resolve(__dirname, '../../database/migrations');
const LIST_ONLY = process.argv.includes('--list');

function migrationFiles() {
  return fs.readdirSync(DIR).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
}

async function main() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nombre VARCHAR(200) PRIMARY KEY,
    aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // Igual que el resto de tablas (schema.sql): sin acceso desde la API pública de Supabase.
  await query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY');
  await query(`DO $$
    DECLARE v_role TEXT;
    BEGIN
      FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
          EXECUTE format('REVOKE ALL ON TABLE schema_migrations FROM %I', v_role);
        END IF;
      END LOOP;
    END $$`);
  const { rows } = await query('SELECT nombre FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.nombre));
  const pending = migrationFiles().filter((name) => !applied.has(name));

  if (LIST_ONLY) {
    for (const name of migrationFiles()) console.log(`${applied.has(name) ? '[aplicada] ' : '[pendiente]'} ${name}`);
    return 0;
  }
  if (pending.length === 0) {
    console.log('No hay migraciones pendientes.');
    return 0;
  }
  for (const name of pending) {
    const sql = fs.readFileSync(path.join(DIR, name), 'utf8');
    // eslint-disable-next-line no-await-in-loop
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [name]);
    });
    console.log(`[OK] ${name}`);
  }
  return 0;
}

main()
  .then((code) => closePool().then(() => process.exit(code)))
  .catch(async (error) => {
    console.error(`[FALLO] ${error.message}`);
    await closePool().catch(() => {});
    process.exit(1);
  });
