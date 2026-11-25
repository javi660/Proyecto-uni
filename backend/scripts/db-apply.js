'use strict';

/**
 * Aplica el esquema y los datos iniciales a la base de datos configurada en DATABASE_URL.
 *
 * Uso (desde backend/):
 *   npm run db:apply                      Crea el esquema (schema.sql) y carga seed.sql
 *   npm run db:apply -- --demo-catalog    Además carga el catálogo de ejemplo
 *   npm run db:apply -- --seed-only       Solo carga seed.sql (el esquema ya existe)
 *   npm run db:reset                      BORRA las tablas de SGSSU y las recrea (pide confirmación)
 *
 * Cada archivo se ejecuta dentro de una transacción: si algo falla, no queda nada a medias.
 * Por seguridad, db:reset se niega a ejecutarse con NODE_ENV=production.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { env } = require('../src/config/env');
const { query, withTransaction, closePool } = require('../src/config/database');

const DATABASE_DIR = path.resolve(__dirname, '../../database');
const args = new Set(process.argv.slice(2));

const OPTIONS = {
  reset: args.has('--reset'),
  yes: args.has('--yes'),
  seedOnly: args.has('--seed-only'),
  demoCatalog: args.has('--demo-catalog'),
};

// Orden inverso de creación (por las claves foráneas)
const TABLES_TO_DROP = [
  'refresh_tokens',
  'auditoria',
  'supervision_dependencia',
  'notificaciones',
  'adjuntos',
  'historial_estados',
  'respuestas',
  'asignaciones',
  'solicitudes',
  'servicios',
  'categorias',
  'usuarios',
  'dependencias',
  'roles',
];

function readSqlFile(name) {
  const file = path.join(DATABASE_DIR, name);
  if (!fs.existsSync(file)) {
    throw new Error(`No se encontró el archivo ${name} en la carpeta database/`);
  }
  return fs.readFileSync(file, 'utf8');
}

async function runFile(name) {
  const sql = readSqlFile(name);
  await withTransaction((client) => client.query(sql));
  console.log(`[OK]    Ejecutado ${name}`);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Borra las tablas, funciones y secuencia de SGSSU (solo los objetos propios del proyecto). */
async function resetSchema() {
  await withTransaction(async (client) => {
    await client.query(`DROP TABLE IF EXISTS ${TABLES_TO_DROP.map((t) => `public.${t}`).join(', ')} CASCADE`);

    const { rows: functions } = await client.query(
      `SELECT p.oid::regprocedure::text AS firma
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'fn\\_%'`,
    );
    for (const fn of functions) {
      await client.query(`DROP FUNCTION IF EXISTS ${fn.firma} CASCADE`);
    }

    await client.query('DROP SEQUENCE IF EXISTS public.seq_codigo_solicitud');
  });
  console.log('[OK]    Objetos de SGSSU eliminados');
}

async function main() {
  const { rows } = await query('SELECT current_database() AS db');
  const databaseName = rows[0].db;

  let host = '(desconocido)';
  try {
    host = new URL(env.DATABASE_URL).hostname;
  } catch {
    // se deja el valor por defecto
  }
  console.log(`SGSSU - Aplicación de la base de datos\n[INFO]  Destino: base "${databaseName}" en ${host}`);

  if (OPTIONS.reset) {
    if (env.NODE_ENV === 'production') {
      throw new Error('db:reset está deshabilitado con NODE_ENV=production');
    }

    console.log('[AVISO] db:reset ELIMINARÁ todas las tablas de SGSSU y sus datos en esa base.');
    if (process.stdin.isTTY && !OPTIONS.yes) {
      const answer = await ask(`        Escribe el nombre de la base ("${databaseName}") para confirmar: `);
      if (answer !== databaseName) {
        console.log('[INFO]  Confirmación incorrecta. No se hizo ningún cambio.');
        return 1;
      }
    } else if (!OPTIONS.yes) {
      console.log('[FALLO] Sin terminal interactiva, db:reset exige el parámetro --yes.');
      return 1;
    }

    await resetSchema();
  }

  const { rows: existing } = await query("SELECT to_regclass('public.roles') AS roles");
  const schemaExists = existing[0].roles !== null;

  if (OPTIONS.seedOnly) {
    if (!schemaExists) {
      console.log('[FALLO] El esquema no existe todavía. Ejecuta primero: npm run db:apply');
      return 1;
    }
  } else if (schemaExists) {
    console.log('[FALLO] El esquema ya existe en esta base. Opciones:');
    console.log('        - npm run db:apply -- --seed-only   (solo recargar los datos iniciales)');
    console.log('        - npm run db:reset                  (borrar y recrear; destruye los datos)');
    return 1;
  } else {
    await runFile('schema.sql');
  }

  await runFile('seed.sql');
  if (OPTIONS.demoCatalog) {
    await runFile('seed_catalogo_demo.sql');
  }

  const { rows: counts } = await query(
    `SELECT (SELECT COUNT(*)::int FROM information_schema.tables
              WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                AND table_name = ANY ($1)) AS tablas,
            (SELECT COUNT(*)::int FROM roles) AS roles,
            (SELECT COUNT(*)::int FROM dependencias) AS dependencias,
            (SELECT COUNT(*)::int FROM categorias) AS categorias,
            (SELECT COUNT(*)::int FROM servicios) AS servicios`,
    [TABLES_TO_DROP],
  );
  const c = counts[0];
  console.log(
    `[INFO]  Tablas de SGSSU: ${c.tablas}/${TABLES_TO_DROP.length} | roles: ${c.roles} | dependencias: ${c.dependencias} | categorías: ${c.categorias} | servicios: ${c.servicios}`,
  );
  console.log('\nListo. Verifica la integridad con: npm run db:verify');
  return 0;
}

main()
  .then(async (code) => {
    await closePool();
    process.exit(code);
  })
  .catch(async (error) => {
    console.log(`[FALLO] ${error.code ? `(${error.code}) ` : ''}${error.message}`);
    if (error.position) {
      console.log(`        Posición aproximada en el archivo SQL: carácter ${error.position}`);
    }
    await closePool();
    process.exit(1);
  });
