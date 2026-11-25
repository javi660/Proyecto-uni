'use strict';

/**
 * Diagnóstico de conexión a la base de datos (Supabase / PostgreSQL).
 * Uso:  npm run check:db
 *
 * Verifica: conexión, SSL, zona horaria, versión, tablas existentes y que las
 * transacciones (BEGIN/ROLLBACK) funcionan. No modifica datos ni imprime secretos.
 */

const { env } = require('../src/config/env');
const { query, withTransaction, closePool } = require('../src/config/database');

const OK = '[OK]   ';
const FAIL = '[FALLO]';
const INFO = '[INFO] ';

/** Describe la causa probable según el error de conexión. */
function explain(error) {
  switch (error.code) {
    case 'ENOTFOUND':
      return 'No se encontró el servidor. Revisa el host de DATABASE_URL. Si usas "db.<proyecto>.supabase.co" y tu red no tiene IPv6, usa la cadena del "Session pooler" de Supabase.';
    case 'ECONNREFUSED':
      return 'El servidor rechazó la conexión. Revisa host y puerto de DATABASE_URL.';
    case 'ETIMEDOUT':
    case 'ENETUNREACH':
      return 'No hay ruta de red hacia el servidor. Si usas la conexión directa de Supabase y tu red no tiene IPv6, usa el "Session pooler".';
    case '28P01':
      return 'Usuario o contraseña incorrectos. Si la contraseña tiene caracteres especiales (@ : / # ?), codifícala en la URL.';
    case '3D000':
      return 'La base de datos indicada no existe.';
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return 'Falló la verificación del certificado SSL. Usa DB_SSL=require, o DB_SSL=verify con DB_SSL_CA apuntando al certificado de Supabase.';
    default:
      return 'Revisa DATABASE_URL, DB_SSL y tu conexión a internet.';
  }
}

async function main() {
  let failures = 0;
  const target = (() => {
    try {
      const url = new URL(env.DATABASE_URL);
      return `${url.hostname}:${url.port || '5432'}`;
    } catch {
      return '(URL no interpretable)';
    }
  })();

  console.log('SGSSU - Verificación de la base de datos');
  console.log(`${INFO} Servidor: ${target}`);
  console.log(`${INFO} Modo SSL (DB_SSL): ${env.DB_SSL}`);

  // 1. Conexión y datos básicos
  try {
    const { rows } = await query(
      `SELECT current_database() AS db,
              current_user AS usuario,
              current_setting('server_version') AS version,
              current_setting('TimeZone') AS zona_horaria,
              NOW() AS ahora`,
    );
    const info = rows[0];
    console.log(`${OK} Conexión establecida`);
    console.log(`${INFO} Base de datos: ${info.db} | Usuario: ${info.usuario} | PostgreSQL ${info.version}`);
    console.log(`${INFO} Zona horaria del servidor: ${info.zona_horaria} | Hora: ${info.ahora.toISOString()}`);
  } catch (error) {
    console.log(`${FAIL} No fue posible conectar (${error.code || error.name})`);
    console.log(`        ${explain(error)}`);
    await closePool();
    process.exit(1);
  }

  // 2. SSL en uso
  try {
    const { rows } = await query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
    if (rows[0] && rows[0].ssl) {
      console.log(`${OK} La conexión está cifrada (SSL)`);
    } else if (env.DB_SSL === 'disable') {
      console.log(`${INFO} Conexión sin SSL (DB_SSL=disable). Aceptable solo en PostgreSQL local`);
    } else {
      console.log(`${FAIL} La conexión no está cifrada`);
      failures += 1;
    }
  } catch {
    console.log(`${INFO} No se pudo consultar el estado de SSL (permisos limitados). Se omite`);
  }

  // 3. Tablas existentes en el esquema public
  try {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );
    if (rows.length === 0) {
      console.log(`${INFO} El esquema public no tiene tablas todavía (normal antes de la Fase 2)`);
    } else {
      console.log(`${INFO} Tablas en public (${rows.length}): ${rows.map((r) => r.table_name).join(', ')}`);
    }
  } catch (error) {
    console.log(`${FAIL} No se pudo listar las tablas (${error.code || error.name})`);
    failures += 1;
  }

  // 4. Transacciones: tabla temporal dentro de una transacción que termina en ROLLBACK
  try {
    await withTransaction(async (client) => {
      await client.query('CREATE TEMP TABLE sgssu_check_tx (id INT) ON COMMIT DROP');
      await client.query('INSERT INTO sgssu_check_tx (id) VALUES ($1)', [1]);
      const { rows } = await client.query('SELECT COUNT(*)::int AS total FROM sgssu_check_tx');
      if (rows[0].total !== 1) throw new Error('Resultado inesperado en la prueba de transacción');
    });
    console.log(`${OK} Las transacciones funcionan (BEGIN / COMMIT)`);
  } catch (error) {
    console.log(`${FAIL} Falló la prueba de transacción (${error.code || error.name})`);
    failures += 1;
  }

  await closePool();

  if (failures > 0) {
    console.log(`\nResultado: ${failures} comprobación(es) con fallo.`);
    process.exit(1);
  }
  console.log('\nResultado: la base de datos está lista para la Fase 2.');
  process.exit(0);
}

main().catch(async (error) => {
  console.log(`${FAIL} Error inesperado: ${error.message}`);
  await closePool();
  process.exit(1);
});
