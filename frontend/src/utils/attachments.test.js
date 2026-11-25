import { describe, expect, test } from 'vitest';
import { canUploadTo, formatBytes, validateFile, MAX_FILE_BYTES } from './attachments.js';
import { formatDateTime } from './format.js';

const file = (name, size = 100) => ({ name, size });

describe('formatBytes', () => {
  test.each([[12, '12 B'], [2048, '2 KB'], [1536 * 1024, '1,5 MB'], [5 * 1024 * 1024, '5,0 MB'], [-1, '—'], [NaN, '—']])('%s => %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe('validateFile', () => {
  test('acepta tipos permitidos sin importar mayúsculas', () => {
    for (const name of ['a.pdf', 'b.PNG', 'c.jpg', 'd.JPEG', 'e.docx']) expect(validateFile(file(name))).toBeNull();
  });

  test.each(['virus.exe', 'script.js', 'sin_extension', 'foto.png.exe', 'doc.doc'])('rechaza %s', (name) => {
    expect(validateFile(file(name))).toMatch(/solo se permiten archivos PDF, PNG, JPG o DOCX/);
  });

  test('rechaza vacío, demasiado grande y repetido', () => {
    expect(validateFile(file('a.pdf', 0))).toMatch(/vacío/);
    expect(validateFile(file('a.pdf', MAX_FILE_BYTES + 1))).toMatch(/5 MB/);
    expect(validateFile(file('a.pdf', MAX_FILE_BYTES))).toBeNull();
    expect(validateFile(file('a.pdf', 10), [file('a.pdf', 10)])).toMatch(/ya está en la lista/);
    expect(validateFile(file('a.pdf', 11), [file('a.pdf', 10)])).toBeNull();
  });
});

describe('canUploadTo', () => {
  const est = { id_usuario: 1, rol: 'ESTUDIANTE' };
  const fun = { id_usuario: 2, rol: 'FUNCIONARIO' };
  const request = { estado: 'REGISTRADA', id_estudiante: 1, id_funcionario: 2, total_adjuntos: 1 };

  test('propietario y funcionario asignado', () => {
    expect(canUploadTo(request, est)).toBe(true);
    expect(canUploadTo(request, fun)).toBe(true);
  });

  test('no para otros estudiantes, otros funcionarios, administrador ni supervisor', () => {
    expect(canUploadTo(request, { id_usuario: 9, rol: 'ESTUDIANTE' })).toBe(false);
    expect(canUploadTo(request, { id_usuario: 9, rol: 'FUNCIONARIO' })).toBe(false);
    expect(canUploadTo(request, { id_usuario: 1, rol: 'ADMINISTRADOR' })).toBe(false);
    expect(canUploadTo(request, { id_usuario: 1, rol: 'SUPERVISOR' })).toBe(false);
  });

  test('no si está cerrada, rechazada o ya tiene 3', () => {
    expect(canUploadTo({ ...request, estado: 'CERRADA' }, est)).toBe(false);
    expect(canUploadTo({ ...request, estado: 'RECHAZADA' }, est)).toBe(false);
    expect(canUploadTo({ ...request, total_adjuntos: 3 }, est)).toBe(false);
    expect(canUploadTo(null, est)).toBe(false);
  });
});

describe('formatDateTime', () => {
  test('usa la zona horaria de Bogotá y tolera valores vacíos', () => {
    expect(formatDateTime('2026-03-05T03:30:00Z')).toMatch(/^4(\/03\/| mar )2026.*10:30/); // 22:30 del día anterior en Bogotá
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('no es fecha')).toBe('—');
  });
});
