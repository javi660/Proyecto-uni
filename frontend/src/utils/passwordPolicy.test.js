import { describe, expect, test } from 'vitest';
import { passwordRules } from './passwordPolicy.js';

describe('política de contraseñas', () => {
  test.each([
    ['Corta1a', false],
    ['sinmayuscula123', false],
    ['SINMINUSCULA123', false],
    ['SinNumeroAlguno', false],
    ['Valida12345', true],
    [`Aa1${'x'.repeat(70)}`, false],
  ])('%s => %s', (value, ok) => {
    expect(passwordRules.safeParse(value).success).toBe(ok);
  });
});
