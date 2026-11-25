'use strict';

const {
  ROLES,
  REQUEST_STATES,
  TRANSITIONS,
  FINAL_STATES,
  STATES_REQUIRING_ASSIGNMENT,
  canTransition,
} = require('../src/utils/constants');

describe('constantes de dominio', () => {
  it('define exactamente los 4 perfiles y los 7 estados del proyecto', () => {
    expect(Object.values(ROLES).sort()).toEqual(['ADMINISTRADOR', 'ESTUDIANTE', 'FUNCIONARIO', 'SUPERVISOR']);
    expect(Object.values(REQUEST_STATES).sort()).toEqual(
      ['ASIGNADA', 'CERRADA', 'EN_PROCESO', 'REABIERTA', 'RECHAZADA', 'REGISTRADA', 'RESUELTA'],
    );
  });

  it('el grafo de transiciones tiene exactamente las 8 transiciones aprobadas', () => {
    const pairs = Object.entries(TRANSITIONS).flatMap(([from, targets]) => targets.map((to) => `${from}>${to}`));

    expect(pairs.sort()).toEqual(
      [
        'ASIGNADA>EN_PROCESO',
        'EN_PROCESO>RESUELTA',
        'REABIERTA>ASIGNADA',
        'REABIERTA>EN_PROCESO',
        'REGISTRADA>ASIGNADA',
        'REGISTRADA>RECHAZADA',
        'RESUELTA>CERRADA',
        'RESUELTA>REABIERTA',
      ].sort(),
    );
  });

  it('canTransition acepta las permitidas y rechaza el resto', () => {
    expect(canTransition('REGISTRADA', 'ASIGNADA')).toBe(true);
    expect(canTransition('RESUELTA', 'REABIERTA')).toBe(true);

    expect(canTransition('REGISTRADA', 'EN_PROCESO')).toBe(false);
    expect(canTransition('CERRADA', 'REABIERTA')).toBe(false);
    expect(canTransition('ASIGNADA', 'ASIGNADA')).toBe(false);
    expect(canTransition('INEXISTENTE', 'ASIGNADA')).toBe(false);
  });

  it('los estados finales no tienen transiciones de salida', () => {
    for (const state of FINAL_STATES) {
      expect(TRANSITIONS[state]).toEqual([]);
    }
  });

  it('todo estado tiene su entrada en el grafo y los estados con responsable no son iniciales ni finales', () => {
    for (const state of Object.values(REQUEST_STATES)) {
      expect(Array.isArray(TRANSITIONS[state])).toBe(true);
    }
    for (const state of STATES_REQUIRING_ASSIGNMENT) {
      expect(FINAL_STATES).not.toContain(state);
      expect(state).not.toBe(REQUEST_STATES.REGISTRADA);
    }
  });
});
