'use strict';

const { createRequestBody, listRequestsQuery } = require('../src/validators/request.validator');

describe('createRequestBody', () => {
  const valid = { id_servicio: 3, asunto: '  Certificado   de notas ', descripcion: ' Necesito el certificado ' };

  test('normaliza espacios y acepta datos válidos', () => {
    expect(createRequestBody.parse(valid)).toEqual({ id_servicio: 3, asunto: 'Certificado de notas', descripcion: 'Necesito el certificado' });
  });

  test.each([
    ['sin servicio', { ...valid, id_servicio: undefined }],
    ['servicio como texto', { ...valid, id_servicio: '3' }],
    ['servicio negativo', { ...valid, id_servicio: -1 }],
    ['asunto vacío', { ...valid, asunto: '   ' }],
    ['asunto muy largo', { ...valid, asunto: 'a'.repeat(181) }],
    ['descripción vacía', { ...valid, descripcion: '  ' }],
    ['descripción muy larga', { ...valid, descripcion: 'a'.repeat(4001) }],
  ])('rechaza %s', (_n, body) => expect(createRequestBody.safeParse(body).success).toBe(false));

  test.each(['estado', 'id_estudiante', 'prioridad', 'codigo'])('no permite que el cliente envíe "%s"', (field) => {
    expect(createRequestBody.safeParse({ ...valid, [field]: 'X' }).success).toBe(false);
  });
});

describe('listRequestsQuery', () => {
  test('valores por defecto', () => {
    expect(listRequestsQuery.parse({})).toMatchObject({ page: 1, pageSize: 20 });
  });

  test('traduce filtros y convierte fechas a zona America/Bogota con "hasta" inclusivo', () => {
    const parsed = listRequestsQuery.parse({ estado: 'RESUELTA', id_categoria: '2', desde: '2026-03-01', hasta: '2026-03-31', q: ' abc ' });
    expect(parsed).toMatchObject({ estado: 'RESUELTA', idCategoria: 2, q: 'abc', desde: '2026-03-01T00:00:00-05:00' });
    expect(parsed.hasta).toBe('2026-04-01T05:00:00.000Z');
  });

  test.each([
    [{ estado: 'INVENTADO' }],
    [{ prioridad: 'MAXIMA' }],
    [{ desde: '01/03/2026' }],
    [{ desde: '2026-02-31x' }],
    [{ desde: '2026-05-02', hasta: '2026-05-01' }],
    [{ id_servicio: '-4' }],
    [{ pageSize: '500' }],
    [{ campo_raro: '1' }],
  ])('rechaza %j', (query) => expect(listRequestsQuery.safeParse(query).success).toBe(false));
});
