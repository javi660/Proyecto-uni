import { z } from 'zod';

/**
 * Política de contraseñas (la misma del backend, DECISIONES.md 7.1): mínimo 10 caracteres,
 * con mayúscula, minúscula y número, y máximo 72 bytes (límite de bcrypt).
 * El backend vuelve a validar: esto solo da respuesta inmediata al usuario.
 */
export const passwordRules = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .refine((v) => /[A-Z]/.test(v), 'Debe incluir al menos una letra mayúscula')
  .refine((v) => /[a-z]/.test(v), 'Debe incluir al menos una letra minúscula')
  .refine((v) => /\d/.test(v), 'Debe incluir al menos un número')
  .refine((v) => new TextEncoder().encode(v).length <= 72, 'La contraseña es demasiado larga (máximo 72 bytes)');
