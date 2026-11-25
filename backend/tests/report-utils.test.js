'use strict';

const { currentMonth, lastMonths, resolvePeriod, toRange, monthsBetween, formatDmy } = require('../src/utils/period');
const { toCsv, cell } = require('../src/utils/csv');
const { reportQuery } = require('../src/validators/report.validator');

describe('periodos en America/Bogota', () => {
  test('mes en curso, también cuando en UTC ya es el mes siguiente', () => {
    expect(currentMonth(new Date('2026-10-15T12:00:00Z'))).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    // 1 nov 2026 02:00 UTC = 31 oct 21:00 en Bogotá
    expect(currentMonth(new Date('2026-11-01T02:00:00Z'))).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(currentMonth(new Date('2028-02-10T12:00:00Z'))).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
  });

  test('últimos N meses cruzando de año', () => {
    expect(lastMonths(6, new Date('2026-02-10T12:00:00Z'))).toEqual({ desde: '2025-09-01', hasta: '2026-02-28' });
    expect(lastMonths(1, new Date('2026-12-31T12:00:00Z'))).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
  });

  test('resolvePeriod: por defecto, parcial y explícito', () => {
    const fallback = { desde: '2026-11-01', hasta: '2026-11-30' };
    expect(resolvePeriod({}, fallback)).toEqual({ ...fallback, por_defecto: true });
    expect(resolvePeriod({ desde: '2026-10-05' }, fallback)).toEqual({ desde: '2026-10-05', hasta: '2026-11-30', por_defecto: false });
    expect(resolvePeriod({ hasta: '2026-10-05' }, fallback)).toEqual({ desde: '2026-11-01', hasta: '2026-10-05', por_defecto: false });
    expect(resolvePeriod({ desde: '2027-01-01' }, fallback).hasta).toBe('2027-01-01');
  });

  test('toRange: hasta inclusivo (día siguiente) en hora de Bogotá', () => {
    expect(toRange({ desde: '2026-03-01', hasta: '2026-03-31' })).toEqual({ desde: '2026-03-01T05:00:00.000Z', hasta: '2026-04-01T05:00:00.000Z' });
  });

  test('monthsBetween y formato', () => {
    expect(monthsBetween({ desde: '2025-11-15', hasta: '2026-02-01' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(formatDmy('2026-10-01')).toBe('01/10/2026');
  });
});

describe('CSV', () => {
  test('escapa comillas, comas y saltos de línea', () => {
    expect(cell('a,b')).toBe('"a,b"');
    expect(cell('di "hola"')).toBe('"di ""hola"""');
    expect(cell('l1\nl2')).toBe('"l1\nl2"');
    expect(cell(null)).toBe('');
    expect(cell(12.5)).toBe('12.5');
  });

  test('neutraliza fórmulas de hoja de cálculo', () => {
    for (const bad of ['=SUMA(A1)', '+1', '-1+2', '@cmd', '\tx']) expect(cell(bad).replace(/^"/, '')).toMatch(/^'/);
    expect(cell(-5)).toBe('-5'); // los números negativos reales no se alteran
  });

  test('BOM, encabezados y CRLF', () => {
    const csv = toCsv([{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }], [{ a: 1, b: 'x' }, { a: 2, b: null }]);
    expect(csv).toBe('﻿A,B\r\n1,x\r\n2,\r\n');
  });
});

describe('reportQuery', () => {
  test('acepta vacío y convierte nombres', () => {
    expect(reportQuery.parse({})).toEqual({ formato: 'json' });
    expect(reportQuery.parse({ desde: '2026-01-01', hasta: '2026-01-31', id_dependencia: '3', id_categoria: '4', formato: 'csv' })).toEqual({
      desde: '2026-01-01', hasta: '2026-01-31', idDependencia: 3, idCategoria: 4, formato: 'csv',
    });
  });

  test.each([
    [{ desde: '01/01/2026' }], [{ desde: '2026-02-30' }], [{ desde: '2026-03-01', hasta: '2026-02-01' }],
    [{ desde: '2020-01-01', hasta: '2026-01-01' }], [{ formato: 'xml' }], [{ id_dependencia: '0' }], [{ extra: 1 }],
  ])('rechaza %j', (q) => expect(reportQuery.safeParse(q).success).toBe(false));
});
