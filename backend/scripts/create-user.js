'use strict';

/**
 * Crea un usuario desde la línea de comandos. Sirve para crear el PRIMER administrador
 * (el sistema no tiene registro público) y para pruebas manuales.
 *
 * Uso (desde backend/):
 *   npm run user:create -- --correo admin@universidad.edu --nombres "Ana" --apellidos "Pérez" --rol ADMINISTRADOR
 *   npm run user:create -- --correo est@universidad.edu --nombres "Luis" --apellidos "Gómez" --rol ESTUDIANTE --dependencia "Nombre exacto"
 *
 * Opciones:
 *   --sin-cambio-obligatorio   No obliga a cambiar la contraseña en el primer inicio de sesión
 *
 * La contraseña se toma de la variable NEW_USER_PASSWORD o se pide por teclado (sin mostrarla).
 * Nunca se imprime ni se guarda en texto plano: se almacena solo su hash bcrypt.
 */

const readline = require('readline');
const { query, closePool } = require('../src/config/database');
const userRepository = require('../src/repositories/user.repository');
const { hashPassword } = require('../src/utils/password');
const { ROLES } = require('../src/utils/constants');
const { passwordSchema, emailSchema } = require('../src/validators/auth.validator');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

/** Pide un texto por teclado sin mostrarlo en pantalla. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text);
      else rl.output.write('');
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ['correo', 'nombres', 'apellidos', 'rol'];
  const missing = required.filter((k) => typeof args[k] !== 'string' || !args[k].trim());
  if (missing.length) {
    console.log(`[FALLO] Faltan parámetros: ${missing.map((m) => `--${m}`).join(', ')}`);
    console.log('        Ejemplo: npm run user:create -- --correo a@b.edu --nombres "Ana" --apellidos "Pérez" --rol ADMINISTRADOR');
    return 1;
  }

  const rol = args.rol.trim().toUpperCase();
  if (!Object.values(ROLES).includes(rol)) {
    console.log(`[FALLO] Rol inválido. Valores permitidos: ${Object.values(ROLES).join(', ')}`);
    return 1;
  }

  const emailResult = emailSchema.safeParse(args.correo);
  if (!emailResult.success) {
    console.log('[FALLO] El correo no es válido.');
    return 1;
  }

  let password = process.env.NEW_USER_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) {
      console.log('[FALLO] Define NEW_USER_PASSWORD o ejecuta el comando en una terminal interactiva.');
      return 1;
    }
    password = await askHidden('Contraseña inicial: ');
  }

  const passwordResult = passwordSchema.safeParse(password);
  if (!passwordResult.success) {
    console.log(`[FALLO] La contraseña no cumple la política: ${passwordResult.error.issues[0].message}`);
    return 1;
  }

  let idDependencia = null;
  if (typeof args.dependencia === 'string') {
    const { rows } = await query('SELECT id_dependencia FROM dependencias WHERE nombre = $1', [args.dependencia.trim()]);
    if (!rows.length) {
      console.log(`[FALLO] No existe la dependencia "${args.dependencia}". Debe coincidir exactamente con su nombre.`);
      return 1;
    }
    idDependencia = rows[0].id_dependencia;
  }

  const existing = await userRepository.findByEmail(emailResult.data);
  if (existing) {
    console.log('[FALLO] Ya existe un usuario con ese correo.');
    return 1;
  }

  const passwordHash = await hashPassword(password);
  const created = await userRepository.create({
    nombres: args.nombres.trim(),
    apellidos: args.apellidos.trim(),
    correo: emailResult.data,
    passwordHash,
    rol,
    idDependencia,
    debeCambiarPassword: !args['sin-cambio-obligatorio'],
  });

  console.log(`[OK]    Usuario creado: ${emailResult.data} (${rol}), id ${created.id_usuario}`);
  if (!args['sin-cambio-obligatorio']) {
    console.log('[INFO]  Deberá cambiar su contraseña en el primer inicio de sesión.');
  }
  return 0;
}

main()
  .then(async (code) => {
    await closePool();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(`[FALLO] ${error.message}`);
    await closePool().catch(() => {});
    process.exit(1);
  });
