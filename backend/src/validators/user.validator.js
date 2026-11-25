'use strict';

const { z } = require('zod');
const { ROLES } = require('../utils/constants');
const { passwordSchema, emailSchema } = require('./auth.validator');
const { idSchema, paginationShape, activeQuery, searchQuery, requiredText } = require('./common.validator');

const roleEnum = z.enum(Object.values(ROLES), { errorMap: () => ({ message: `El perfil debe ser uno de: ${Object.values(ROLES).join(', ')}` }) });

const listUsersQuery = z
  .object({
    ...paginationShape,
    q: searchQuery,
    activo: activeQuery,
    rol: roleEnum.optional(),
    id_dependencia: z.coerce.number().int().positive().optional(),
  })
  .strict();

const baseProfile = {
  nombres: requiredText('Los nombres', 100),
  apellidos: requiredText('Los apellidos', 100),
  correo: emailSchema,
  rol: roleEnum,
  id_dependencia: idSchema('La dependencia no es válida').nullish().transform((value) => value ?? null),
};

/** Alta de usuario: el administrador define la contraseña inicial (cambio obligatorio al primer ingreso). */
const createUserSchema = z.object({ ...baseProfile, password_inicial: passwordSchema }).strict();

/** Edición de datos y perfil (no incluye contraseña ni estado). */
const updateUserSchema = z.object(baseProfile).strict();

/** Restablecimiento de contraseña por el administrador. */
const resetPasswordSchema = z.object({ password_nueva: passwordSchema }).strict();

/** Dependencias que supervisa un supervisor (reemplaza el conjunto completo). */
const supervisionSchema = z
  .object({
    ids_dependencias: z
      .array(idSchema('Alguna dependencia no es válida'), { required_error: 'Indica las dependencias a supervisar', invalid_type_error: 'Las dependencias deben ser una lista' })
      .max(50, 'No se pueden asignar más de 50 dependencias')
      .refine((ids) => new Set(ids).size === ids.length, { message: 'La lista de dependencias tiene valores repetidos' }),
  })
  .strict();

module.exports = { listUsersQuery, createUserSchema, updateUserSchema, resetPasswordSchema, supervisionSchema };
