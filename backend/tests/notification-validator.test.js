'use strict';

const { listQuery } = require('../src/validators/notification.validator');

describe('listQuery de notificaciones', () => {
  test('valores por defecto y conversión de leida', () => {
    expect(listQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(listQuery.parse({ leida: 'false', page: '2', pageSize: '5' })).toEqual({ leida: false, page: 2, pageSize: 5 });
    expect(listQuery.parse({ leida: 'true' }).leida).toBe(true);
  });

  test.each([[{ leida: 'si' }], [{ page: '0' }], [{ pageSize: '101' }], [{ otro: 1 }]])('rechaza %j', (q) => {
    expect(listQuery.safeParse(q).success).toBe(false);
  });
});
