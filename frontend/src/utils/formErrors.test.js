import { describe, expect, test, vi } from 'vitest';
import { applyServerErrors, errorMessage } from './formErrors.js';
import { apiError } from '../test/helpers.jsx';

describe('applyServerErrors', () => {
  test('asigna los errores 400 a sus campos y respeta alias', () => {
    const setError = vi.fn();
    const error = apiError(400, 'VALIDATION_ERROR', 'Datos inválidos', [
      { in: 'body', field: 'correo', message: 'Correo inválido' },
      { in: 'body', field: 'campo_raro', message: 'ignorado' },
      { in: 'body', field: 'id_dependencia', message: 'Dependencia inválida' },
    ]);
    expect(applyServerErrors(error, setError, ['correo', 'dependencia'], { id_dependencia: 'dependencia' })).toBe(true);
    expect(setError).toHaveBeenCalledWith('correo', { type: 'server', message: 'Correo inválido' });
    expect(setError).toHaveBeenCalledWith('dependencia', { type: 'server', message: 'Dependencia inválida' });
    expect(setError).toHaveBeenCalledTimes(2);
  });

  test('otros errores no se asignan a campos', () => {
    const setError = vi.fn();
    expect(applyServerErrors(apiError(409, 'DUPLICATE_EMAIL', 'Ya existe'), setError, ['correo'])).toBe(false);
    expect(applyServerErrors(new Error('x'), setError, ['correo'])).toBe(false);
    expect(applyServerErrors(null, setError, ['correo'])).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  test('errorMessage usa el mensaje del error o uno por defecto', () => {
    expect(errorMessage(apiError(409, 'X', 'Mensaje del servidor'))).toBe('Mensaje del servidor');
    expect(errorMessage({})).toBe('No fue posible completar la operación');
  });
});
