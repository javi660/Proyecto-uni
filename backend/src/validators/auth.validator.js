'use strict';

const { z } = require('zod');

/**
 * Esquemas Zod de autenticación. Todos son estrictos (`.strict()`): rechazan campos
 * desconocidos, de modo que nadie pueda intentar enviar `rol`, `id_usuario`, etc.
 */

const MAX_BCRYPT_BYTES = 72; // bcrypt ignora lo que exceda 72 bytes

/** Política de contraseñas: mínimo 10 caracteres, con mayúscula, minúscula y número. */
const passwordSchema = z
  .string({ required_error: 'La contraseña es obligatoria', invalid_type_error: 'La contraseña no es válida' })
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .regex(/[a-z]/, 'La contraseña debe incluir al menos una letra minúscula')
  .regex(/[A-Z]/, 'La contraseña debe incluir al menos una letra mayúscula')
  .regex(/[0-9]/, 'La contraseña debe incluir al menos un número')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_BCRYPT_BYTES, {
    message: `La contraseña no puede superar ${MAX_BCRYPT_BYTES} bytes`,
  });

const emailSchema = z
  .string({ required_error: 'El correo es obligatorio', invalid_type_error: 'El correo no es válido' })
  .trim()
  .toLowerCase()
  .max(150, 'El correo no puede superar 150 caracteres')
  .email('El correo no es válido');

const loginSchema = z
  .object({
    correo: emailSchema,
    // En el login no se aplica la política: solo se exige que venga
    password: z
      .string({ required_error: 'La contraseña es obligatoria', invalid_type_error: 'La contraseña no es válida' })
      .min(1, 'La contraseña es obligatoria')
      .max(200, 'La contraseña es demasiado larga'),
  })
  .strict();

const changePasswordSchema = z
  .object({
    password_actual: z
      .string({ required_error: 'La contraseña actual es obligatoria', invalid_type_error: 'La contraseña actual no es válida' })
      .min(1, 'La contraseña actual es obligatoria')
      .max(200, 'La contraseña actual es demasiado larga'),
    password_nueva: passwordSchema,
  })
  .strict()
  .refine((data) => data.password_actual !== data.password_nueva, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['password_nueva'],
  });

module.exports = { passwordSchema, emailSchema, loginSchema, changePasswordSchema };
