'use strict';

const { listQuery } = require('../src/validators/audit.validator');
const { redact } = require('../src/services/audit.service');

describe('filtros de auditoría', () => {
  test('valores por defecto y conversión', () => {
    expect(listQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(listQuery.parse({ operacion: ' LOGIN ', resultado: 'FALLO', id_usuario: '4', desde: '2026-01-01', hasta: '2026-01-31', pageSize: '50' })).toEqual({
      page: 1, pageSize: 50, operacion: 'LOGIN', resultado: 'FALLO', id_usuario: 4, desde: '2026-01-01', hasta: '2026-01-31',
    });
  });

  test.each([
    [{ resultado: 'OK' }], [{ desde: '2026-02-30' }], [{ desde: '2026-03-01', hasta: '2026-02-01' }], [{ operacion: '' }],
    [{ operacion: 'x'.repeat(61) }], [{ id_usuario: '-1' }], [{ pageSize: '101' }], [{ orden: 'asc' }],
  ])('rechaza %j', (q) => expect(listQuery.safeParse(q).success).toBe(false));
});

describe('redact: enmascara credenciales en el detalle de auditoría', () => {
  test('claves con aspecto de secreto, anidadas y en listas', () => {
    expect(redact({
      campo: { antes: 'a', despues: 'b' }, password: 'x', password_actual: 'y', passwordHash: 'z', token: 't', refresh_token: 'r',
      anidado: { Authorization: 'Bearer x', csrf_token: 'c', ok: 1 }, lista: [{ secret: 's', nombre: 'n' }],
    })).toEqual({
      campo: { antes: 'a', despues: 'b' }, password: '[oculto]', password_actual: '[oculto]', passwordHash: '[oculto]', token: '[oculto]',
      refresh_token: '[oculto]', anidado: { Authorization: '[oculto]', csrf_token: '[oculto]', ok: 1 }, lista: [{ secret: '[oculto]', nombre: 'n' }],
    });
  });

  test('valores primitivos y null pasan igual', () => {
    expect(redact(null)).toBeNull();
    expect(redact('texto')).toBe('texto');
    expect(redact(5)).toBe(5);
  });
});
