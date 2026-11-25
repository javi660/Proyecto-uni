'use strict';

/**
 * Verificación de integridad de la base de datos de SGSSU.
 * Uso (desde backend/):  npm run db:verify
 *
 * Grupos de comprobaciones:
 *   1. Estructura: tablas, RLS, roles iniciales, índices en claves foráneas, triggers, privilegios.
 *   2. Coherencia con el backend: el grafo de transiciones de la base coincide con utils/constants.js.
 *   3. Integridad de los datos existentes (no modifica nada).
 *   4. Comportamiento: intenta violaciones de cada regla y comprueba que la base las rechaza.
 *
 * Las comprobaciones del grupo 4 se ejecutan dentro de UNA transacción que SIEMPRE termina en
 * ROLLBACK: no queda ningún dato de prueba. Lo único que no se revierte es el contador de la
 * secuencia de códigos de seguimiento, que el script restaura al valor original al terminar.
 * Es seguro ejecutarlo sobre una base con datos, pero conviene hacerlo en desarrollo.
 */

const { query, withTransaction, closePool } = require('../src/config/database');
const {
  ROLES,
  REQUEST_STATES,
  TRANSITIONS,
  DB_ERROR_CODES,
  canTransition,
} = require('../src/utils/constants');

const { INVALID_TRANSITION: SG001, BUSINESS_RULE: SG002, RESTRICT_VIOLATION: IMMUTABLE } = DB_ERROR_CODES;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FK_VIOLATION = '23503';

const EXPECTED_TABLES = [
  'roles',
  'dependencias',
  'usuarios',
  'categorias',
  'servicios',
  'solicitudes',
  'asignaciones',
  'respuestas',
  'historial_estados',
  'adjuntos',
  'notificaciones',
  'supervision_dependencia',
  'auditoria',
  'refresh_tokens',
];

const EXPECTED_TRIGGERS = [
  'trg_usuarios_actualizado_en',
  'trg_dependencias_actualizado_en',
  'trg_categorias_actualizado_en',
  'trg_servicios_actualizado_en',
  'trg_usuarios_rol_dependencia',
  'trg_supervision_validar_supervisor',
  'trg_solicitudes_before_write',
  'trg_asignaciones_before_insert',
  'trg_asignaciones_before_update',
  'trg_asignaciones_no_delete',
  'trg_asignaciones_no_truncate',
  'trg_historial_inmutable',
  'trg_historial_no_truncate',
  'trg_auditoria_inmutable',
  'trg_auditoria_no_truncate',
];

// ---------------------------------------------------------------------------
// Registro de resultados
// ---------------------------------------------------------------------------

const results = [];
let currentGroup = '';

function group(title) {
  currentGroup = title;
  console.log(`\n== ${title}`);
}

function record(ok, name, detail = '') {
  results.push({ group: currentGroup, ok, name, detail });
  console.log(`${ok ? '[OK]   ' : '[FALLO]'} ${name}${!ok && detail ? `\n          ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Ayudantes para el grupo de comportamiento (dentro de una transacción)
// ---------------------------------------------------------------------------

/**
 * Ejecuta `sql` y verifica que la base lo RECHACE con alguno de los códigos esperados.
 * Siempre deshace la sentencia (SAVEPOINT) para no afectar a las siguientes.
 */
async function expectRejected(client, name, expected, sql, params = []) {
  const accepted = Array.isArray(expected) ? expected : [expected];
  await client.query('SAVEPOINT chk');
  try {
    await client.query(sql, params);
    record(false, name, `la base aceptó la operación; debía rechazarla con ${accepted.join(' o ')}`);
  } catch (error) {
    const ok = accepted.includes(error.code);
    record(ok, name, ok ? '' : `se rechazó con ${error.code} (${error.message}); se esperaba ${accepted.join(' o ')}`);
  }
  await client.query('ROLLBACK TO SAVEPOINT chk');
  await client.query('RELEASE SAVEPOINT chk');
}

/** Ejecuta `sql` y verifica que la base lo ACEPTE. Conserva el cambio. Devuelve las filas. */
async function expectAccepted(client, name, sql, params = []) {
  await client.query('SAVEPOINT chk');
  try {
    const result = await client.query(sql, params);
    record(true, name);
    await client.query('RELEASE SAVEPOINT chk');
    return result.rows;
  } catch (error) {
    record(false, name, `la base rechazó una operación válida: ${error.code} ${error.message}`);
    await client.query('ROLLBACK TO SAVEPOINT chk');
    await client.query('RELEASE SAVEPOINT chk');
    return null;
  }
}

/** Crea un dato necesario para las pruebas; si falla, aborta todo el grupo. */
async function mustCreate(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Grupo 1: estructura
// ---------------------------------------------------------------------------

async function checkStructure() {
  group('1. Estructura');

  const { rows: tables } = await query(
    `SELECT c.relname AS tabla, c.relrowsecurity AS rls
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY ($1)`,
    [EXPECTED_TABLES],
  );
  const found = new Map(tables.map((t) => [t.tabla, t.rls]));

  const missing = EXPECTED_TABLES.filter((t) => !found.has(t));
  record(missing.length === 0, `Existen las ${EXPECTED_TABLES.length} tablas`, `faltan: ${missing.join(', ')}`);

  const withoutRls = EXPECTED_TABLES.filter((t) => found.has(t) && !found.get(t));
  record(withoutRls.length === 0, 'RLS activado en todas las tablas', `sin RLS: ${withoutRls.join(', ')}`);

  const { rows: policies } = await query(
    'SELECT tablename FROM pg_policies WHERE schemaname = $1 AND tablename = ANY ($2)',
    ['public', EXPECTED_TABLES],
  );
  record(
    policies.length === 0,
    'Ninguna tabla tiene políticas RLS (acceso solo desde el backend)',
    `con políticas: ${[...new Set(policies.map((p) => p.tablename))].join(', ')}`,
  );

  if (missing.length > 0) {
    return false;
  }

  const { rows: roles } = await query('SELECT nombre FROM roles ORDER BY nombre');
  const roleNames = roles.map((r) => r.nombre);
  const expectedRoles = Object.values(ROLES).sort();
  record(
    JSON.stringify(roleNames) === JSON.stringify(expectedRoles),
    'Roles iniciales: ADMINISTRADOR, ESTUDIANTE, FUNCIONARIO, SUPERVISOR',
    `encontrados: ${roleNames.join(', ') || '(ninguno; ejecuta db:apply o --seed-only)'}`,
  );

  const { rows: unindexed } = await query(
    `SELECT c.conrelid::regclass::text AS tabla, a.attname AS columna
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND cardinality(c.conkey) = 1
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
        )`,
  );
  record(
    unindexed.length === 0,
    'Todas las claves foráneas tienen índice',
    `sin índice: ${unindexed.map((u) => `${u.tabla}.${u.columna}`).join(', ')}`,
  );

  const { rows: triggers } = await query(
    `SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace`,
  );
  const triggerNames = new Set(triggers.map((t) => t.tgname));
  const missingTriggers = EXPECTED_TRIGGERS.filter((t) => !triggerNames.has(t));
  record(
    missingTriggers.length === 0,
    `Existen los ${EXPECTED_TRIGGERS.length} triggers de integridad e inmutabilidad`,
    `faltan: ${missingTriggers.join(', ')}`,
  );

  const { rows: partial } = await query(
    `SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'ux_asignaciones_activa_por_solicitud'
        AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%WHERE%'`,
  );
  record(partial.length === 1, 'Índice único parcial: una sola asignación activa por solicitud');

  const { rows: apiRoles } = await query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')");
  if (apiRoles.length === 0) {
    console.log('[INFO]  No existen los roles anon/authenticated (PostgreSQL sin Supabase): se omite la revisión de privilegios');
  } else {
    const exposed = [];
    for (const { rolname } of apiRoles) {
      for (const table of EXPECTED_TABLES) {
        const { rows } = await query(
          `SELECT has_table_privilege($1, $2, 'SELECT') OR has_table_privilege($1, $2, 'INSERT')
               OR has_table_privilege($1, $2, 'UPDATE') OR has_table_privilege($1, $2, 'DELETE') AS accesible`,
          [rolname, `public.${table}`],
        );
        if (rows[0].accesible) exposed.push(`${rolname}→${table}`);
      }
    }
    record(
      exposed.length === 0,
      'Los roles públicos de Supabase (anon, authenticated) no tienen acceso a las tablas',
      `con acceso: ${exposed.join(', ')}`,
    );

    // Funciones y secuencia propias: tampoco deben poder invocarse desde la API pública
    const { rows: functions } = await query(
      `SELECT p.oid::regprocedure::text AS firma FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'fn\\_%'`,
    );
    const callable = [];
    for (const { rolname } of apiRoles) {
      for (const { firma } of functions) {
        const { rows } = await query('SELECT has_function_privilege($1, $2::regprocedure, $3) AS ok', [rolname, firma, 'EXECUTE']);
        if (rows[0].ok) callable.push(`${rolname}→${firma}`);
      }
      const { rows } = await query(
        "SELECT has_sequence_privilege($1, 'public.seq_codigo_solicitud', 'USAGE') AS ok",
        [rolname],
      );
      if (rows[0].ok) callable.push(`${rolname}→seq_codigo_solicitud`);
    }
    record(
      callable.length === 0,
      'Los roles públicos no pueden ejecutar las funciones fn_* ni usar la secuencia de códigos',
      `con acceso: ${callable.join(', ')}`,
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// Grupo 2: coherencia con el backend
// ---------------------------------------------------------------------------

async function checkBackendConsistency() {
  group('2. Coherencia con el backend (utils/constants.js)');

  const states = Object.values(REQUEST_STATES);
  const mismatches = [];
  for (const from of states) {
    for (const to of states) {
      const { rows } = await query('SELECT fn_transicion_permitida($1, $2) AS permitida', [from, to]);
      if (rows[0].permitida !== canTransition(from, to)) {
        mismatches.push(`${from}→${to} (base: ${rows[0].permitida}, backend: ${canTransition(from, to)})`);
      }
    }
  }
  record(
    mismatches.length === 0,
    `El grafo de transiciones coincide en las ${states.length * states.length} combinaciones`,
    mismatches.join('; '),
  );

  const expectedPairs = Object.values(TRANSITIONS).reduce((total, list) => total + list.length, 0);
  record(expectedPairs === 8, 'El backend define exactamente 8 transiciones permitidas', `define ${expectedPairs}`);
}

// ---------------------------------------------------------------------------
// Grupo 3: integridad de los datos existentes
// ---------------------------------------------------------------------------

async function checkExistingData() {
  group('3. Integridad de los datos existentes');

  const checks = [
    {
      name: 'Ninguna solicitud tiene más de una asignación activa',
      sql: `SELECT id_solicitud FROM asignaciones WHERE activo GROUP BY id_solicitud HAVING COUNT(*) > 1`,
    },
    {
      name: 'Las solicitudes ASIGNADA / EN_PROCESO / RESUELTA / REABIERTA tienen asignación activa',
      sql: `SELECT s.id_solicitud FROM solicitudes s
             WHERE s.estado IN ('ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'REABIERTA')
               AND NOT EXISTS (SELECT 1 FROM asignaciones a WHERE a.id_solicitud = s.id_solicitud AND a.activo)`,
    },
    {
      name: 'Las solicitudes REGISTRADA / RECHAZADA no tienen asignación activa',
      sql: `SELECT s.id_solicitud FROM solicitudes s
             WHERE s.estado IN ('REGISTRADA', 'RECHAZADA')
               AND EXISTS (SELECT 1 FROM asignaciones a WHERE a.id_solicitud = s.id_solicitud AND a.activo)`,
    },
    {
      name: 'Las solicitudes CERRADA no tienen asignación activa',
      sql: `SELECT s.id_solicitud FROM solicitudes s
             WHERE s.estado = 'CERRADA'
               AND EXISTS (SELECT 1 FROM asignaciones a WHERE a.id_solicitud = s.id_solicitud AND a.activo)`,
    },
    {
      name: 'Toda solicitud tiene su registro inicial en el historial',
      sql: `SELECT s.id_solicitud FROM solicitudes s
             WHERE NOT EXISTS (SELECT 1 FROM historial_estados h
                                WHERE h.id_solicitud = s.id_solicitud AND h.estado_anterior IS NULL
                                  AND h.estado_nuevo = 'REGISTRADA')`,
    },
    {
      name: 'El estado de cada solicitud coincide con el último movimiento del historial',
      sql: `SELECT s.id_solicitud FROM solicitudes s
             WHERE s.estado IS DISTINCT FROM (
               SELECT h.estado_nuevo FROM historial_estados h
                WHERE h.id_solicitud = s.id_solicitud
                ORDER BY h.fecha_cambio DESC, h.id_historial DESC LIMIT 1)`,
    },
    {
      name: 'Cada cambio del historial parte del estado en que terminó el cambio anterior',
      sql: `SELECT id_historial FROM (
              SELECT id_historial, estado_anterior,
                     LAG(estado_nuevo) OVER (PARTITION BY id_solicitud ORDER BY fecha_cambio, id_historial) AS previo
                FROM historial_estados
            ) t WHERE estado_anterior IS DISTINCT FROM previo`,
    },
    {
      name: 'Los funcionarios con asignación activa están activos y en la dependencia del servicio',
      sql: `SELECT a.id_asignacion FROM asignaciones a
              JOIN usuarios u ON u.id_usuario = a.id_funcionario
              JOIN solicitudes s ON s.id_solicitud = a.id_solicitud
              JOIN servicios sv ON sv.id_servicio = s.id_servicio
             WHERE a.activo AND (NOT u.activo OR u.id_dependencia IS DISTINCT FROM sv.id_dependencia)`,
    },
  ];

  for (const check of checks) {
    const { rows } = await query(check.sql);
    record(rows.length === 0, check.name, `${rows.length} registro(s) inconsistente(s)`);
  }
}

// ---------------------------------------------------------------------------
// Grupo 4: comportamiento (dentro de una transacción con ROLLBACK)
// ---------------------------------------------------------------------------

const BCRYPT_LIKE = `$2b$12$${'a'.repeat(53)}`;

async function checkBehavior(client) {
  group('4. Comportamiento: la base rechaza lo que debe rechazar');

  const tag = `v${Date.now().toString(36)}`;
  const email = (name) => `${name}.${tag}@verify.sgssu.invalid`;
  const roleId = async (name) => (await mustCreate(client, 'SELECT id_rol FROM roles WHERE nombre = $1', [name])).id_rol;

  // --- Datos base de las pruebas (se descartan con el ROLLBACK) ---
  const depA = (await mustCreate(client, "INSERT INTO dependencias (nombre) VALUES ($1) RETURNING id_dependencia", [`ZZ_VERIFY_A_${tag}`])).id_dependencia;
  const depB = (await mustCreate(client, "INSERT INTO dependencias (nombre) VALUES ($1) RETURNING id_dependencia", [`ZZ_VERIFY_B_${tag}`])).id_dependencia;
  const cat = (await mustCreate(client, "INSERT INTO categorias (nombre) VALUES ($1) RETURNING id_categoria", [`ZZ_VERIFY_${tag}`])).id_categoria;

  const mkServicio = async (nombre, activo = true) =>
    (await mustCreate(
      client,
      'INSERT INTO servicios (nombre, id_categoria, id_dependencia, activo) VALUES ($1, $2, $3, $4) RETURNING id_servicio',
      [nombre, cat, depA, activo],
    )).id_servicio;
  const servicioA = await mkServicio('Servicio de prueba A');
  const servicioInactivo = await mkServicio('Servicio de prueba inactivo', false);

  const mkUsuario = async (nombre, rol, { dependencia = null, activo = true } = {}) =>
    (await mustCreate(
      client,
      `INSERT INTO usuarios (nombres, apellidos, correo, password_hash, id_rol, id_dependencia, activo, debe_cambiar_password)
       VALUES ($1, 'Prueba', $2, $3, $4, $5, $6, FALSE) RETURNING id_usuario`,
      [nombre, email(nombre), BCRYPT_LIKE, await roleId(rol), dependencia, activo],
    )).id_usuario;

  const admin = await mkUsuario('admin', ROLES.ADMINISTRADOR);
  const sup = await mkUsuario('sup', ROLES.SUPERVISOR);
  const supSinAmbito = await mkUsuario('sup2', ROLES.SUPERVISOR);
  const funA = await mkUsuario('funa', ROLES.FUNCIONARIO, { dependencia: depA });
  const funB = await mkUsuario('funb', ROLES.FUNCIONARIO, { dependencia: depB });
  const funInactivo = await mkUsuario('funi', ROLES.FUNCIONARIO, { dependencia: depA, activo: false });
  const est1 = await mkUsuario('est1', ROLES.ESTUDIANTE);
  const est2 = await mkUsuario('est2', ROLES.ESTUDIANTE);

  await client.query('INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [sup, depA]);

  const newSolicitud = async (estudiante = est1, servicio = servicioA) =>
    (await mustCreate(
      client,
      `INSERT INTO solicitudes (id_estudiante, id_servicio, asunto, descripcion)
       VALUES ($1, $2, 'Asunto de prueba', 'Descripción de prueba') RETURNING id_solicitud, codigo`,
      [estudiante, servicio],
    ));

  // --- 4.1 Usuarios ---
  console.log('   -- usuarios');
  const insertUser = (correo, hash, rol, dep) =>
    client.query(
      `INSERT INTO usuarios (nombres, apellidos, correo, password_hash, id_rol, id_dependencia)
       VALUES ('X', 'Y', $1, $2, (SELECT id_rol FROM roles WHERE nombre = $3), $4)`,
      [correo, hash, rol, dep],
    );
  void insertUser;

  const userSql = `INSERT INTO usuarios (nombres, apellidos, correo, password_hash, id_rol, id_dependencia)
                   VALUES ('X', 'Y', $1, $2, (SELECT id_rol FROM roles WHERE nombre = $3), $4)`;
  await expectRejected(client, 'Rechaza contraseña en texto plano (no es un hash bcrypt)', CHECK_VIOLATION, userSql, [email('plano'), 'MiClave123', ROLES.ESTUDIANTE, null]);
  await expectRejected(client, 'Rechaza correo con mayúsculas', CHECK_VIOLATION, userSql, [`Mayus.${tag}@verify.sgssu.invalid`, BCRYPT_LIKE, ROLES.ESTUDIANTE, null]);
  await expectRejected(client, 'Rechaza correo con formato inválido', CHECK_VIOLATION, userSql, ['no-es-un-correo', BCRYPT_LIKE, ROLES.ESTUDIANTE, null]);
  await expectRejected(client, 'Rechaza correo duplicado', UNIQUE_VIOLATION, userSql, [email('est1'), BCRYPT_LIKE, ROLES.ESTUDIANTE, null]);
  await expectRejected(client, 'Rechaza un FUNCIONARIO sin dependencia', SG002, userSql, [email('sindep'), BCRYPT_LIKE, ROLES.FUNCIONARIO, null]);
  await expectRejected(client, 'Rechaza un ESTUDIANTE con dependencia', SG002, userSql, [email('estdep'), BCRYPT_LIKE, ROLES.ESTUDIANTE, depA]);
  await expectRejected(client, 'Rechaza cambiar un ESTUDIANTE a FUNCIONARIO sin dependencia', SG002,
    'UPDATE usuarios SET id_rol = (SELECT id_rol FROM roles WHERE nombre = $2) WHERE id_usuario = $1', [est1, ROLES.FUNCIONARIO]);
  await expectRejected(client, 'Rechaza un rol inexistente', FK_VIOLATION,
    "INSERT INTO usuarios (nombres, apellidos, correo, password_hash, id_rol) VALUES ('X', 'Y', $1, $2, 999999)", [email('norol'), BCRYPT_LIKE]);

  const updated = await expectAccepted(client, 'Actualiza actualizado_en automáticamente',
    'UPDATE dependencias SET descripcion = $2 WHERE id_dependencia = $1 RETURNING (actualizado_en > creado_en) AS cambio', [depA, 'texto']);
  record(Boolean(updated && updated[0] && updated[0].cambio), 'actualizado_en es posterior a creado_en tras un UPDATE');

  // --- 4.2 Catálogo ---
  console.log('   -- categorías, servicios y supervisión');
  await expectRejected(client, 'Rechaza categoría duplicada', UNIQUE_VIOLATION, 'INSERT INTO categorias (nombre) VALUES ($1)', [`ZZ_VERIFY_${tag}`]);
  await expectRejected(client, 'Rechaza dependencia duplicada', UNIQUE_VIOLATION, 'INSERT INTO dependencias (nombre) VALUES ($1)', [`ZZ_VERIFY_A_${tag}`]);
  await expectRejected(client, 'Rechaza servicio duplicado dentro de la misma categoría', UNIQUE_VIOLATION,
    'INSERT INTO servicios (nombre, id_categoria, id_dependencia) VALUES ($1, $2, $3)', ['Servicio de prueba A', cat, depA]);
  await expectRejected(client, 'Rechaza SLA en cero o negativo', CHECK_VIOLATION,
    'INSERT INTO servicios (nombre, id_categoria, id_dependencia, sla_horas) VALUES ($1, $2, $3, 0)', ['SLA cero', cat, depA]);
  await expectRejected(client, 'Rechaza servicio sin dependencia', '23502',
    'INSERT INTO servicios (nombre, id_categoria, id_dependencia) VALUES ($1, $2, NULL)', ['Sin dependencia', cat]);
  await expectRejected(client, 'Rechaza supervisión duplicada', UNIQUE_VIOLATION,
    'INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [sup, depA]);
  await expectRejected(client, 'Rechaza supervisión de un usuario que no es SUPERVISOR', SG002,
    'INSERT INTO supervision_dependencia (id_supervisor, id_dependencia) VALUES ($1, $2)', [funA, depB]);

  // --- 4.3 Solicitudes: creación ---
  console.log('   -- solicitudes: creación');
  const s1 = await newSolicitud();
  record(/^SGSSU-\d{4}-\d{6,}$/.test(s1.codigo), `El código de seguimiento se genera con el formato correcto (${s1.codigo})`);
  const s1b = await newSolicitud(est2);
  record(s1.codigo !== s1b.codigo, 'Los códigos de seguimiento son distintos entre solicitudes');

  const { rows: defaults } = await client.query('SELECT estado, prioridad FROM solicitudes WHERE id_solicitud = $1', [s1.id_solicitud]);
  record(defaults[0].estado === 'REGISTRADA' && defaults[0].prioridad === 'NORMAL', 'Estado inicial REGISTRADA y prioridad NORMAL por defecto');

  const insSol = `INSERT INTO solicitudes (id_estudiante, id_servicio, asunto, descripcion, estado, prioridad)
                  VALUES ($1, $2, $3, 'Descripción', $4, $5)`;
  await expectRejected(client, 'Rechaza crear una solicitud en estado distinto de REGISTRADA', SG001, insSol, [est1, servicioA, 'Asunto', 'ASIGNADA', 'NORMAL']);
  await expectRejected(client, 'Rechaza prioridad inválida', CHECK_VIOLATION, insSol, [est1, servicioA, 'Asunto', 'REGISTRADA', 'MUY_ALTA']);
  await expectRejected(client, 'Rechaza asunto vacío', CHECK_VIOLATION, insSol, [est1, servicioA, '   ', 'REGISTRADA', 'NORMAL']);
  await expectRejected(client, 'Rechaza propietario que no es ESTUDIANTE', SG002, insSol, [funA, servicioA, 'Asunto', 'REGISTRADA', 'NORMAL']);
  await expectRejected(client, 'Rechaza solicitud sobre un servicio inactivo', SG002, insSol, [est1, servicioInactivo, 'Asunto', 'REGISTRADA', 'NORMAL']);
  await expectRejected(client, 'Rechaza código de seguimiento duplicado', UNIQUE_VIOLATION,
    `INSERT INTO solicitudes (codigo, id_estudiante, id_servicio, asunto, descripcion) VALUES ($1, $2, $3, 'A', 'D')`, [s1.codigo, est1, servicioA]);
  await expectRejected(client, 'Rechaza código de seguimiento con formato inválido', CHECK_VIOLATION,
    `INSERT INTO solicitudes (codigo, id_estudiante, id_servicio, asunto, descripcion) VALUES ('ABC-1', $1, $2, 'A', 'D')`, [est1, servicioA]);
  await expectRejected(client, 'Rechaza cambiar el propietario de una solicitud', SG002,
    'UPDATE solicitudes SET id_estudiante = $2 WHERE id_solicitud = $1', [s1.id_solicitud, est2]);

  // --- 4.4 Asignaciones ---
  console.log('   -- asignaciones');
  const insAsig = 'INSERT INTO asignaciones (id_solicitud, id_funcionario, id_asignador) VALUES ($1, $2, $3)';
  await expectRejected(client, 'Rechaza asignar a un funcionario inactivo', SG002, insAsig, [s1.id_solicitud, funInactivo, sup]);
  await expectRejected(client, 'Rechaza asignar a un funcionario de otra dependencia', SG002, insAsig, [s1.id_solicitud, funB, admin]);
  await expectRejected(client, 'Rechaza asignar a un usuario que no es FUNCIONARIO', SG002, insAsig, [s1.id_solicitud, est2, admin]);
  await expectRejected(client, 'Rechaza que un ESTUDIANTE sea el asignador', SG002, insAsig, [s1.id_solicitud, funA, est2]);
  await expectRejected(client, 'Rechaza que un SUPERVISOR sin esa dependencia asigne', SG002, insAsig, [s1.id_solicitud, funA, supSinAmbito]);
  await expectRejected(client, 'Rechaza cambiar a ASIGNADA sin asignación activa', SG002,
    "UPDATE solicitudes SET estado = 'ASIGNADA' WHERE id_solicitud = $1", [s1.id_solicitud]);

  const asig1 = await expectAccepted(client, 'Acepta una asignación válida (supervisor con la dependencia a cargo)', `${insAsig} RETURNING id_asignacion`, [s1.id_solicitud, funA, sup]);
  const asig1Id = asig1 && asig1[0] ? asig1[0].id_asignacion : null;

  await expectRejected(client, 'Rechaza una segunda asignación activa para la misma solicitud', UNIQUE_VIOLATION, insAsig, [s1.id_solicitud, funA, admin]);
  await expectRejected(client, 'Rechaza cambiar el funcionario de una asignación existente', SG002,
    'UPDATE asignaciones SET id_funcionario = $2 WHERE id_asignacion = $1', [asig1Id, funInactivo]);
  await expectRejected(client, 'Rechaza borrar una asignación', IMMUTABLE, 'DELETE FROM asignaciones WHERE id_asignacion = $1', [asig1Id]);
  await expectRejected(client, 'Rechaza vaciar la tabla de asignaciones (TRUNCATE)', IMMUTABLE, 'TRUNCATE asignaciones');
  await expectRejected(client, 'Rechaza una asignación activa con fecha de finalización', CHECK_VIOLATION,
    'INSERT INTO asignaciones (id_solicitud, id_funcionario, id_asignador, activo, finalizado_en) VALUES ($1, $2, $3, TRUE, NOW())', [s1b.id_solicitud, funA, admin]);

  // --- 4.5 Ciclo de vida completo ---
  console.log('   -- ciclo de vida de la solicitud');
  const setState = (id, estado, extra = '') =>
    client.query(`UPDATE solicitudes SET estado = $2${extra} WHERE id_solicitud = $1`, [id, estado]);

  await expectRejected(client, 'Rechaza la transición REGISTRADA → EN_PROCESO', SG001,
    "UPDATE solicitudes SET estado = 'EN_PROCESO' WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectAccepted(client, 'Acepta REGISTRADA → ASIGNADA con asignación activa',
    "UPDATE solicitudes SET estado = 'ASIGNADA' WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectRejected(client, 'Rechaza la transición ASIGNADA → RESUELTA', SG001,
    "UPDATE solicitudes SET estado = 'RESUELTA', fecha_resolucion = NOW() WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectAccepted(client, 'Acepta ASIGNADA → EN_PROCESO', "UPDATE solicitudes SET estado = 'EN_PROCESO' WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectRejected(client, 'Rechaza RESUELTA sin fecha de resolución', CHECK_VIOLATION,
    "UPDATE solicitudes SET estado = 'RESUELTA' WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectAccepted(client, 'Acepta EN_PROCESO → RESUELTA con fecha de resolución',
    "UPDATE solicitudes SET estado = 'RESUELTA', fecha_resolucion = NOW() WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectAccepted(client, 'Acepta RESUELTA → REABIERTA', "UPDATE solicitudes SET estado = 'REABIERTA' WHERE id_solicitud = $1", [s1.id_solicitud]);

  // Reasignación: se finaliza la asignación activa, se crea otra y la solicitud vuelve a ASIGNADA
  await expectAccepted(client, 'Finaliza la asignación activa (reasignación: conserva el registro anterior)',
    'UPDATE asignaciones SET activo = FALSE, finalizado_en = NOW() WHERE id_asignacion = $1', [asig1Id]);
  await expectRejected(client, 'Rechaza reactivar una asignación finalizada', SG002,
    'UPDATE asignaciones SET activo = TRUE, finalizado_en = NULL WHERE id_asignacion = $1', [asig1Id]);
  await expectRejected(client, 'Rechaza REABIERTA → ASIGNADA mientras no haya nueva asignación activa', SG002,
    "UPDATE solicitudes SET estado = 'ASIGNADA' WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectAccepted(client, 'Acepta la nueva asignación tras finalizar la anterior', insAsig, [s1.id_solicitud, funA, admin]);
  await expectAccepted(client, 'Acepta REABIERTA → ASIGNADA con la nueva asignación',
    "UPDATE solicitudes SET estado = 'ASIGNADA' WHERE id_solicitud = $1", [s1.id_solicitud]);
  await setState(s1.id_solicitud, 'EN_PROCESO');
  await setState(s1.id_solicitud, 'RESUELTA', ', fecha_resolucion = NOW()');

  await expectRejected(client, 'Rechaza CERRADA sin fecha de cierre', CHECK_VIOLATION,
    "UPDATE solicitudes SET estado = 'CERRADA' WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectRejected(client, 'Rechaza fecha de cierre en una solicitud que no está CERRADA', CHECK_VIOLATION,
    'UPDATE solicitudes SET fecha_cierre = NOW() WHERE id_solicitud = $1', [s1.id_solicitud]);
  await expectAccepted(client, 'Acepta RESUELTA → CERRADA con fecha de cierre',
    "UPDATE solicitudes SET estado = 'CERRADA', fecha_cierre = NOW() WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectRejected(client, 'Rechaza modificar una solicitud CERRADA', SG001,
    "UPDATE solicitudes SET prioridad = 'ALTA' WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectRejected(client, 'Rechaza reabrir una solicitud CERRADA', SG001,
    "UPDATE solicitudes SET estado = 'REABIERTA' WHERE id_solicitud = $1", [s1.id_solicitud]);
  await expectRejected(client, 'Rechaza asignar una solicitud CERRADA', SG002, insAsig, [s1.id_solicitud, funA, admin]);

  await expectAccepted(client, 'Acepta REGISTRADA → RECHAZADA', "UPDATE solicitudes SET estado = 'RECHAZADA' WHERE id_solicitud = $1", [s1b.id_solicitud]);
  await expectRejected(client, 'Rechaza modificar una solicitud RECHAZADA', SG001,
    "UPDATE solicitudes SET prioridad = 'ALTA' WHERE id_solicitud = $1", [s1b.id_solicitud]);

  // --- 4.6 Historial ---
  console.log('   -- historial de estados (solo inserción)');
  const insHist = 'INSERT INTO historial_estados (id_solicitud, estado_anterior, estado_nuevo, id_usuario, observacion) VALUES ($1, $2, $3, $4, $5)';
  const s3 = await newSolicitud();
  const hist = await expectAccepted(client, 'Acepta la fila inicial del historial (sin estado anterior → REGISTRADA)',
    `${insHist} RETURNING id_historial`, [s3.id_solicitud, null, 'REGISTRADA', est1, null]);
  const histId = hist && hist[0] ? hist[0].id_historial : null;
  await expectRejected(client, 'Rechaza una fila inicial que no sea REGISTRADA', CHECK_VIOLATION, insHist, [s3.id_solicitud, null, 'ASIGNADA', admin, null]);
  await expectRejected(client, 'Rechaza un movimiento que no cambia el estado', CHECK_VIOLATION, insHist, [s3.id_solicitud, 'ASIGNADA', 'ASIGNADA', admin, null]);
  await expectRejected(client, 'Rechaza un movimiento hacia REGISTRADA con estado anterior', CHECK_VIOLATION, insHist, [s3.id_solicitud, 'ASIGNADA', 'REGISTRADA', admin, null]);
  await expectRejected(client, 'Rechaza RECHAZADA sin motivo', CHECK_VIOLATION, insHist, [s3.id_solicitud, 'REGISTRADA', 'RECHAZADA', admin, '  ']);
  await expectRejected(client, 'Rechaza REABIERTA sin motivo', CHECK_VIOLATION, insHist, [s3.id_solicitud, 'RESUELTA', 'REABIERTA', est1, null]);
  await expectRejected(client, 'Rechaza un movimiento sin usuario responsable', '23502', insHist, [s3.id_solicitud, 'REGISTRADA', 'ASIGNADA', null, null]);
  await expectAccepted(client, 'Acepta RECHAZADA con motivo', insHist, [s3.id_solicitud, 'REGISTRADA', 'RECHAZADA', admin, 'Solicitud duplicada']);
  await expectRejected(client, 'Rechaza modificar el historial (UPDATE)', IMMUTABLE, "UPDATE historial_estados SET observacion = 'alterado' WHERE id_historial = $1", [histId]);
  await expectRejected(client, 'Rechaza borrar del historial (DELETE)', IMMUTABLE, 'DELETE FROM historial_estados WHERE id_historial = $1', [histId]);
  await expectRejected(client, 'Rechaza vaciar el historial (TRUNCATE)', IMMUTABLE, 'TRUNCATE historial_estados');

  // --- 4.7 Respuestas, adjuntos, notificaciones ---
  console.log('   -- respuestas, adjuntos, notificaciones');
  const insResp = 'INSERT INTO respuestas (id_solicitud, id_usuario, contenido, visibilidad) VALUES ($1, $2, $3, $4)';
  await expectAccepted(client, 'Acepta una respuesta pública', insResp, [s3.id_solicitud, funA, 'Respuesta al estudiante', 'PUBLICA']);
  await expectAccepted(client, 'Acepta una observación interna', insResp, [s3.id_solicitud, funA, 'Nota interna', 'INTERNA']);
  await expectRejected(client, 'Rechaza una visibilidad inválida', CHECK_VIOLATION, insResp, [s3.id_solicitud, funA, 'Texto', 'SECRETA']);
  await expectRejected(client, 'Rechaza una respuesta vacía', CHECK_VIOLATION, insResp, [s3.id_solicitud, funA, '   ', 'PUBLICA']);

  const insAdj = `INSERT INTO adjuntos (id_solicitud, id_usuario, nombre_original, nombre_almacenado, ruta_archivo, tipo_mime, tamano_bytes)
                  VALUES ($1, $2, 'cedula.pdf', $3, $4, $5, $6)`;
  await expectAccepted(client, 'Acepta un adjunto PDF válido', insAdj, [s3.id_solicitud, est1, `${tag}-a.pdf`, `solicitudes/${s3.id_solicitud}/${tag}-a.pdf`, 'application/pdf', 1024]);
  await expectRejected(client, 'Rechaza una ruta con ".." (path traversal)', CHECK_VIOLATION, insAdj, [s3.id_solicitud, est1, `${tag}-b.pdf`, '../../etc/passwd', 'application/pdf', 1024]);
  await expectRejected(client, 'Rechaza una ruta absoluta', CHECK_VIOLATION, insAdj, [s3.id_solicitud, est1, `${tag}-c.pdf`, '/etc/passwd', 'application/pdf', 1024]);
  await expectRejected(client, 'Rechaza un archivo mayor a 5 MB', CHECK_VIOLATION, insAdj, [s3.id_solicitud, est1, `${tag}-d.pdf`, `solicitudes/${s3.id_solicitud}/d.pdf`, 'application/pdf', 5242881]);
  await expectRejected(client, 'Rechaza un archivo vacío', CHECK_VIOLATION, insAdj, [s3.id_solicitud, est1, `${tag}-e.pdf`, `solicitudes/${s3.id_solicitud}/e.pdf`, 'application/pdf', 0]);
  await expectRejected(client, 'Rechaza un tipo MIME no permitido (ejecutable)', CHECK_VIOLATION, insAdj, [s3.id_solicitud, est1, `${tag}-f.exe`, `solicitudes/${s3.id_solicitud}/f.exe`, 'application/x-msdownload', 1024]);
  await expectRejected(client, 'Rechaza un nombre almacenado repetido', UNIQUE_VIOLATION, insAdj, [s3.id_solicitud, est1, `${tag}-a.pdf`, `solicitudes/${s3.id_solicitud}/otro.pdf`, 'application/pdf', 1024]);

  const insNot = 'INSERT INTO notificaciones (id_usuario, id_solicitud, titulo, mensaje, tipo) VALUES ($1, $2, $3, $4, $5)';
  await expectAccepted(client, 'Acepta una notificación válida (no leída por defecto)', `${insNot} RETURNING leida`, [est1, s3.id_solicitud, 'Título', 'Mensaje', 'SOLICITUD_REGISTRADA']);
  await expectRejected(client, 'Rechaza un tipo de notificación desconocido', CHECK_VIOLATION, insNot, [est1, s3.id_solicitud, 'Título', 'Mensaje', 'OTRO_TIPO']);
  await expectAccepted(client, 'Permite marcar una notificación como leída', 'UPDATE notificaciones SET leida = TRUE WHERE id_usuario = $1', [est1]);

  // --- 4.8 Auditoría y sesiones ---
  console.log('   -- auditoría y sesiones');
  const audit = await expectAccepted(client, 'Acepta un registro de auditoría',
    `INSERT INTO auditoria (id_usuario, operacion, recurso, id_recurso, resultado, detalle, ip)
     VALUES ($1, 'LOGIN', 'usuarios', $2, 'EXITO', '{"nota":"prueba"}', '127.0.0.1') RETURNING id_auditoria`, [admin, String(admin)]);
  const auditId = audit && audit[0] ? audit[0].id_auditoria : null;
  if (auditId === null) {
    record(false, 'Se pudo crear el registro de auditoría de prueba (las pruebas de inmutabilidad dependen de él)');
  }
  await expectRejected(client, 'Rechaza un resultado de auditoría inválido', CHECK_VIOLATION,
    "INSERT INTO auditoria (operacion, recurso, resultado) VALUES ('X', 'Y', 'TAL_VEZ')");
  await expectRejected(client, 'Rechaza modificar la auditoría (UPDATE)', IMMUTABLE, "UPDATE auditoria SET resultado = 'FALLO' WHERE id_auditoria = $1", [auditId]);
  await expectRejected(client, 'Rechaza borrar de la auditoría (DELETE)', IMMUTABLE, 'DELETE FROM auditoria WHERE id_auditoria = $1', [auditId]);
  await expectRejected(client, 'Rechaza vaciar la auditoría (TRUNCATE)', IMMUTABLE, 'TRUNCATE auditoria');

  const insTok = "INSERT INTO refresh_tokens (id_usuario, token_hash, expira_en) VALUES ($1, $2, NOW() + INTERVAL '7 days')";
  await expectAccepted(client, 'Acepta un refresh token', insTok, [admin, `hash-${tag}`]);
  await expectRejected(client, 'Rechaza un refresh token duplicado', UNIQUE_VIOLATION, insTok, [admin, `hash-${tag}`]);
  await expectRejected(client, 'Rechaza un refresh token ya vencido al crearse', CHECK_VIOLATION,
    "INSERT INTO refresh_tokens (id_usuario, token_hash, expira_en) VALUES ($1, 'otro', NOW() - INTERVAL '1 day')", [admin]);
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------

class RollbackSignal extends Error {}

async function main() {
  console.log('SGSSU - Verificación de integridad de la base de datos');

  const structureOk = await checkStructure();
  if (!structureOk) {
    console.log('\nLa estructura está incompleta: se omiten las demás comprobaciones. Ejecuta: npm run db:apply');
    return false;
  }

  await checkBackendConsistency();
  await checkExistingData();

  // Se guarda el valor de la secuencia para restaurarlo (los nextval no se revierten con ROLLBACK)
  const { rows: seqRows } = await query('SELECT last_value, is_called FROM seq_codigo_solicitud');
  const { last_value: lastValue, is_called: isCalled } = seqRows[0];

  try {
    await withTransaction(async (client) => {
      await checkBehavior(client);
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      record(false, 'Las pruebas de comportamiento terminaron sin errores inesperados', `${error.code || ''} ${error.message}`.trim());
    }
  } finally {
    await query('SELECT setval($1, $2, $3)', ['seq_codigo_solicitud', lastValue, isCalled]);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nResumen: ${results.length - failed.length} comprobaciones correctas, ${failed.length} con fallo (de ${results.length}).`);
  if (failed.length > 0) {
    console.log('Con fallo:');
    for (const f of failed) console.log(`  - [${f.group}] ${f.name}`);
  } else {
    console.log('La base de datos cumple todas las reglas de integridad definidas. No quedó ningún dato de prueba.');
  }
  return failed.length === 0;
}

main()
  .then(async (ok) => {
    await closePool();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (error) => {
    console.log(`[FALLO] Error inesperado: ${error.code ? `(${error.code}) ` : ''}${error.message}`);
    await closePool();
    process.exit(1);
  });
