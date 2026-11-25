'use strict';

const {
  detectMime, extensionOf, sanitizeOriginalName, inspectUpload, MAX_FILE_BYTES, MIME,
} = require('../src/utils/fileSignature');
const storage = require('../src/services/storage.service');

const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const docx = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....word/document.xml....')]);
const exe = () => Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
const zipPlain = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('contenido.txt')]);

const upload = (originalname, mimetype, buffer) => ({ originalname, mimetype, buffer, size: buffer.length });

describe('detectMime (firma real del archivo)', () => {
  test.each([
    ['PDF', pdf(), MIME.PDF],
    ['PNG', png(), MIME.PNG],
    ['JPEG', jpg(), MIME.JPEG],
    ['DOCX', docx(), MIME.DOCX],
  ])('reconoce %s', (_n, buffer, expected) => expect(detectMime(buffer)).toBe(expected));

  test.each([
    ['ejecutable de Windows', exe()],
    ['ZIP genérico que no es DOCX', zipPlain()],
    ['texto', Buffer.from('hola mundo, esto es texto')],
    ['vacío', Buffer.alloc(0)],
    ['demasiado corto', Buffer.from('%PDF')],
  ])('rechaza %s', (_n, buffer) => expect(detectMime(buffer)).toBeNull());

  test('no acepta entradas que no sean Buffer', () => {
    expect(detectMime('%PDF-1.4....')).toBeNull();
    expect(detectMime(null)).toBeNull();
  });
});

describe('extensionOf / sanitizeOriginalName', () => {
  test('extensión en minúscula', () => {
    expect(extensionOf('Informe.PDF')).toBe('pdf');
    expect(extensionOf('sin_extension')).toBe('');
    expect(extensionOf('archivo.tar.gz')).toBe('gz');
  });

  test('elimina rutas y caracteres peligrosos', () => {
    expect(sanitizeOriginalName('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(sanitizeOriginalName('C:\\Users\\a\\nota.pdf')).toBe('nota.pdf');
    expect(sanitizeOriginalName('a"b<c>d|e.pdf')).toBe('abcde.pdf');
    expect(sanitizeOriginalName('con\u0000nulo.pdf')).toBe('connulo.pdf');
    expect(sanitizeOriginalName('')).toBe('archivo');
  });

  test('limita la longitud a 255 caracteres', () => {
    expect(sanitizeOriginalName(`${'a'.repeat(400)}.pdf`).length).toBe(255);
  });
});

describe('inspectUpload', () => {
  test('acepta archivos válidos y normaliza jpeg → jpg', () => {
    expect(inspectUpload(upload('acta.pdf', MIME.PDF, pdf()))).toMatchObject({ mime: MIME.PDF, extension: 'pdf', originalName: 'acta.pdf' });
    expect(inspectUpload(upload('foto.JPEG', MIME.JPEG, jpg()))).toMatchObject({ mime: MIME.JPEG, extension: 'jpg' });
    expect(inspectUpload(upload('carta.docx', MIME.DOCX, docx()))).toMatchObject({ extension: 'docx' });
  });

  test.each([
    ['extensión no permitida', upload('virus.exe', 'application/x-msdownload', exe()), 'FILE_TYPE_NOT_ALLOWED'],
    ['sin extensión', upload('archivo', MIME.PDF, pdf()), 'FILE_TYPE_NOT_ALLOWED'],
    ['doble extensión peligrosa', upload('foto.png.exe', MIME.PNG, png()), 'FILE_TYPE_NOT_ALLOWED'],
    ['ejecutable disfrazado de PDF', upload('inocente.pdf', MIME.PDF, exe()), 'FILE_CONTENT_MISMATCH'],
    ['PNG con extensión PDF', upload('imagen.pdf', MIME.PDF, png()), 'FILE_CONTENT_MISMATCH'],
    ['MIME declarado distinto', upload('doc.pdf', 'image/png', pdf()), 'FILE_CONTENT_MISMATCH'],
    ['ZIP renombrado a docx', upload('x.docx', MIME.DOCX, zipPlain()), 'FILE_CONTENT_MISMATCH'],
  ])('rechaza %s', (_n, file, code) => expect(inspectUpload(file).error.code).toBe(code));

  test('rechaza vacío y demasiado grande', () => {
    expect(inspectUpload({ originalname: 'a.pdf', mimetype: MIME.PDF, buffer: Buffer.alloc(0), size: 0 }).error.code).toBe('FILE_EMPTY');
    const big = Buffer.concat([pdf(), Buffer.alloc(MAX_FILE_BYTES)]);
    expect(inspectUpload(upload('grande.pdf', MIME.PDF, big)).error.code).toBe('FILE_TOO_LARGE');
  });

  test('acepta exactamente 5 MB', () => {
    const exact = Buffer.concat([pdf(), Buffer.alloc(MAX_FILE_BYTES - pdf().length)]);
    expect(exact.length).toBe(MAX_FILE_BYTES);
    expect(inspectUpload(upload('limite.pdf', MIME.PDF, exact)).error).toBeUndefined();
  });
});

describe('storage.service (claves seguras)', () => {
  const good = 'solicitudes/12/123e4567-e89b-12d3-a456-426614174000.pdf';

  test('rechaza claves que no generó el sistema', async () => {
    for (const key of ['../secreto.pdf', 'solicitudes/1/../../x.pdf', '/etc/passwd', 'solicitudes/1/nombre.pdf', 'solicitudes/a/123e4567-e89b-12d3-a456-426614174000.pdf', 'solicitudes/1/123e4567-e89b-12d3-a456-426614174000.exe']) {
      await expect(storage.put(key, Buffer.from('x'), 'application/pdf')).rejects.toThrow('Clave de almacenamiento no válida');
      await expect(storage.get(key)).rejects.toThrow('Clave de almacenamiento no válida');
    }
  });

  test('guarda, recupera y elimina (controlador en memoria de pruebas)', async () => {
    expect(storage.driverName()).toBe('memory');
    await storage.put(good, Buffer.from('contenido'), 'application/pdf');
    expect((await storage.get(good)).toString()).toBe('contenido');
    await storage.remove(good);
    await expect(storage.get(good)).rejects.toMatchObject({ code: 'STORAGE_NOT_FOUND' });
  });
});
