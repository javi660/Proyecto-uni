'use strict';

const { assignBody, officialsQuery } = require('../src/validators/assignment.validator');

describe('assignBody', () => {
  test('acepta funcionario y observación opcional (normalizada a null si viene vacía)', () => {
    expect(assignBody.parse({ id_funcionario: 4 })).toEqual({ id_funcionario: 4, observacion: null });
    expect(assignBody.parse({ id_funcionario: 4, observacion: '  ' })).toEqual({ id_funcionario: 4, observacion: null });
    expect(assignBody.parse({ id_funcionario: 4, observacion: ' Urgente ' })).toEqual({ id_funcionario: 4, observacion: 'Urgente' });
    expect(assignBody.parse({ id_funcionario: 4, observacion: null }).observacion).toBeNull();
  });

  test.each([
    ['sin funcionario', {}],
    ['funcionario como texto', { id_funcionario: '4' }],
    ['funcionario cero', { id_funcionario: 0 }],
    ['observación muy larga', { id_funcionario: 4, observacion: 'x'.repeat(501) }],
    ['observación no textual', { id_funcionario: 4, observacion: 7 }],
    ['campo no permitido', { id_funcionario: 4, id_asignador: 1 }],
  ])('rechaza %s', (_n, body) => expect(assignBody.safeParse(body).success).toBe(false));
});

describe('officialsQuery', () => {
  test('valores por defecto y traducción de filtros', () => {
    expect(officialsQuery.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(officialsQuery.parse({ id_dependencia: '3', q: ' ana ' })).toMatchObject({ idDependencia: 3, q: 'ana' });
  });

  test.each([[{ id_dependencia: '-1' }], [{ id_dependencia: 'x' }], [{ otro: '1' }], [{ pageSize: '1000' }]])('rechaza %j', (query) => {
    expect(officialsQuery.safeParse(query).success).toBe(false);
  });
});
