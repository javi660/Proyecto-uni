'use strict';

const { STATES, STATUS_TARGETS, TARGETS, FINAL_STATES, canTransition, nextTargets, isFinal, RESPONSE_STATES } = require('../src/utils/stateMachine');
const { statusBody, priorityBody, responseBody } = require('../src/validators/tracking.validator');
const { can } = require('../src/utils/permissions');

describe('máquina de estados (espejo de DECISIONES §4.2)', () => {
  const allowed = [
    ['ASIGNADA', 'EN_PROCESO'], ['REABIERTA', 'EN_PROCESO'], ['EN_PROCESO', 'RESUELTA'],
    ['RESUELTA', 'CERRADA'], ['RESUELTA', 'REABIERTA'], ['REGISTRADA', 'RECHAZADA'],
  ];

  test.each(allowed)('permite %s → %s', (from, to) => expect(canTransition(from, to)).toBe(true));

  test('rechaza todas las demás combinaciones (desde cada estado hacia cada destino)', () => {
    for (const from of Object.values(STATES)) {
      for (const to of STATUS_TARGETS) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect([from, to, canTransition(from, to)]).toEqual([from, to, expected]);
      }
    }
  });

  test('los estados finales no tienen salida', () => {
    for (const from of FINAL_STATES) expect(nextTargets(from)).toEqual([]);
    expect(isFinal('CERRADA')).toBe(true);
    expect(isFinal('RECHAZADA')).toBe(true);
    expect(isFinal('RESUELTA')).toBe(false);
  });

  test('ASIGNADA y REGISTRADA no se piden por /status (se logran asignando)', () => {
    expect(STATUS_TARGETS).not.toContain('ASIGNADA');
    expect(STATUS_TARGETS).not.toContain('REGISTRADA');
    expect(canTransition('REGISTRADA', 'ASIGNADA')).toBe(false);
  });

  test('destinos disponibles por estado', () => {
    expect(nextTargets('REGISTRADA')).toEqual(['RECHAZADA']);
    expect(nextTargets('ASIGNADA')).toEqual(['EN_PROCESO']);
    expect(nextTargets('EN_PROCESO')).toEqual(['RESUELTA']);
    expect(nextTargets('RESUELTA').sort()).toEqual(['CERRADA', 'REABIERTA']);
    expect(nextTargets('REABIERTA')).toEqual(['EN_PROCESO']);
  });

  test('motivo obligatorio solo al rechazar y reabrir; cada destino tiene notificación', () => {
    expect(Object.entries(TARGETS).filter(([, r]) => r.reasonRequired).map(([k]) => k).sort()).toEqual(['REABIERTA', 'RECHAZADA']);
    for (const rule of Object.values(TARGETS)) expect(rule.notification).toMatch(/^SOLICITUD_/);
  });

  test('cada transición exige el perfil que indica la matriz de permisos', () => {
    expect(can('FUNCIONARIO', TARGETS.EN_PROCESO.permission)).toBe(true);
    expect(can('FUNCIONARIO', TARGETS.RESUELTA.permission)).toBe(true);
    expect(can('ADMINISTRADOR', TARGETS.EN_PROCESO.permission)).toBe(false);
    expect(['ADMINISTRADOR', 'ESTUDIANTE', 'SUPERVISOR'].every((r) => can(r, TARGETS.CERRADA.permission))).toBe(true);
    expect(can('FUNCIONARIO', TARGETS.CERRADA.permission)).toBe(false);
    expect(can('ESTUDIANTE', TARGETS.REABIERTA.permission)).toBe(true);
    expect(['ADMINISTRADOR', 'SUPERVISOR', 'FUNCIONARIO'].some((r) => can(r, TARGETS.REABIERTA.permission))).toBe(false);
    expect(can('SUPERVISOR', TARGETS.RECHAZADA.permission)).toBe(true);
    expect(can('ADMINISTRADOR', TARGETS.RECHAZADA.permission)).toBe(true);
    expect(can('ESTUDIANTE', TARGETS.RECHAZADA.permission)).toBe(false);
  });

  test('respuestas solo en estados de atención', () => {
    expect([...RESPONSE_STATES].sort()).toEqual(['ASIGNADA', 'EN_PROCESO', 'REABIERTA']);
  });
});

describe('validadores de seguimiento', () => {
  test('statusBody: motivo obligatorio para RECHAZADA y REABIERTA', () => {
    expect(statusBody.safeParse({ estado: 'RECHAZADA' }).success).toBe(false);
    expect(statusBody.safeParse({ estado: 'REABIERTA', observacion: '   ' }).success).toBe(false);
    expect(statusBody.parse({ estado: 'RECHAZADA', observacion: ' Fuera de alcance ' })).toEqual({ estado: 'RECHAZADA', observacion: 'Fuera de alcance' });
    expect(statusBody.parse({ estado: 'EN_PROCESO' })).toEqual({ estado: 'EN_PROCESO', observacion: null });
    expect(statusBody.parse({ estado: 'CERRADA', observacion: '' }).observacion).toBeNull();
  });

  test.each([
    [{ estado: 'ASIGNADA' }], [{ estado: 'REGISTRADA' }], [{ estado: 'INVENTADA' }], [{}],
    [{ estado: 'CERRADA', observacion: 'x'.repeat(1001) }], [{ estado: 'CERRADA', id_usuario: 1 }], [{ estado: 'CERRADA', observacion: 5 }],
  ])('statusBody rechaza %j', (body) => expect(statusBody.safeParse(body).success).toBe(false));

  test('priorityBody', () => {
    expect(priorityBody.parse({ prioridad: 'URGENTE' })).toEqual({ prioridad: 'URGENTE' });
    for (const body of [{}, { prioridad: 'MAXIMA' }, { prioridad: 'ALTA', estado: 'X' }]) expect(priorityBody.safeParse(body).success).toBe(false);
  });

  test('responseBody: pública por defecto, recorta y limita', () => {
    expect(responseBody.parse({ contenido: ' Listo ' })).toEqual({ contenido: 'Listo', visibilidad: 'PUBLICA' });
    expect(responseBody.parse({ contenido: 'Nota', visibilidad: 'INTERNA' }).visibilidad).toBe('INTERNA');
    for (const body of [{}, { contenido: '  ' }, { contenido: 'x'.repeat(4001) }, { contenido: 'x', visibilidad: 'SECRETA' }, { contenido: 'x', id_usuario: 3 }]) {
      expect(responseBody.safeParse(body).success).toBe(false);
    }
  });
});
