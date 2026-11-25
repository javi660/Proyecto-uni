'use strict';

const jwt = require('jsonwebtoken');
const {
  signAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken,
  generateCsrfToken, isValidCsrfToken, safeEqual,
} = require('../src/utils/tokens');
const { hashPassword, verifyPassword, verifyAgainstDummy } = require('../src/utils/password');
const { passwordSchema, loginSchema, changePasswordSchema } = require('../src/validators/auth.validator');
const { assertAuthSecrets } = require('../src/config/auth');

const SECRET = process.env.JWT_ACCESS_SECRET;

describe('access token', () => {
  test('contiene solo sub y sid (nunca el rol) y se verifica', () => {
    const token = signAccessToken({ userId: 5, sessionId: 9 });
    const payload = jwt.decode(token);
    expect(payload.sub).toBe('5');
    expect(String(payload.sid)).toBe('9');
    expect(payload).not.toHaveProperty('rol');
    expect(payload).not.toHaveProperty('role');
    expect(String(verifyAccessToken(token).userId)).toBe('5');
    expect(String(verifyAccessToken(token).sessionId)).toBe('9');
  });

  test('vence a los 15 minutos', () => {
    const { exp, iat } = jwt.decode(signAccessToken({ userId: 1, sessionId: 1 }));
    expect(exp - iat).toBe(900);
  });

  test('token vencido => TOKEN_EXPIRED', () => {
    const expired = jwt.sign({ sid: 1 }, SECRET, { algorithm: 'HS256', subject: '1', issuer: 'sgssu', expiresIn: -10 });
    expect(() => verifyAccessToken(expired)).toThrow(expect.objectContaining({ status: 401, code: 'TOKEN_EXPIRED' }));
  });

  test('firma de otro secreto => UNAUTHENTICATED', () => {
    const forged = jwt.sign({ sid: 1 }, 'otro-secreto-distinto-de-32-caracteres-xx', { subject: '1', issuer: 'sgssu', expiresIn: 60 });
    expect(() => verifyAccessToken(forged)).toThrow(expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }));
  });

  test('algoritmo "none" es rechazado', () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '1', sid: 1, iss: 'sgssu', exp: Math.floor(Date.now() / 1000) + 60 })}.`;
    expect(() => verifyAccessToken(none)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });

  test('emisor incorrecto, texto basura y token alterado son rechazados', () => {
    const wrongIss = jwt.sign({ sid: 1 }, SECRET, { subject: '1', issuer: 'otro', expiresIn: 60 });
    expect(() => verifyAccessToken(wrongIss)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    expect(() => verifyAccessToken('basura')).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    const good = signAccessToken({ userId: 1, sessionId: 1 });
    const [h, , s] = good.split('.');
    const evil = Buffer.from(JSON.stringify({ sub: '2', sid: 1, iss: 'sgssu', exp: 9999999999 })).toString('base64url');
    expect(() => verifyAccessToken(`${h}.${evil}.${s}`)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });
});

describe('refresh token y CSRF', () => {
  test('refresh tokens son aleatorios, largos y su hash es estable y distinto del token', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(60);
    expect(hashRefreshToken(a)).toBe(hashRefreshToken(a));
    expect(hashRefreshToken(a)).not.toBe(hashRefreshToken(b));
    expect(hashRefreshToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('CSRF: token generado es válido; manipulado, ajeno o vacío no', () => {
    const t = generateCsrfToken();
    expect(isValidCsrfToken(t)).toBe(true);
    const [nonce, sig] = t.split('.');
    expect(isValidCsrfToken(`${nonce}.${sig.slice(0, -1)}x`)).toBe(false);
    expect(isValidCsrfToken(`otro.${sig}`)).toBe(false);
    expect(isValidCsrfToken(nonce)).toBe(false);
    expect(isValidCsrfToken('')).toBe(false);
    expect(isValidCsrfToken(undefined)).toBe(false);
    expect(isValidCsrfToken(12345)).toBe(false);
  });

  test('safeEqual compara sin fallar con longitudes o tipos distintos', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('abc', undefined)).toBe(false);
  });
});

describe('contraseñas', () => {
  test('hash bcrypt verificable y distinto en cada llamada', async () => {
    const h1 = await hashPassword('Segura12345');
    const h2 = await hashPassword('Segura12345');
    expect(h1).toMatch(/^\$2[aby]\$/);
    expect(h1).not.toBe(h2);
    expect(await verifyPassword('Segura12345', h1)).toBe(true);
    expect(await verifyPassword('segura12345', h1)).toBe(false);
    expect(await verifyAgainstDummy('x')).toBe(false);
  });

  test.each([
    ['Corta1a', false],
    ['sinmayuscula123', false],
    ['SINMINUSCULA123', false],
    ['SinNumeroAlguno', false],
    ['Valida12345', true],
    [`Aa1${'x'.repeat(70)}`, false], // > 72 bytes
  ])('política: %s => %s', (pwd, ok) => {
    expect(passwordSchema.safeParse(pwd).success).toBe(ok);
  });

  test('esquemas de login y cambio de contraseña', () => {
    expect(loginSchema.safeParse({ correo: '  ANA@Uni.EDU ', password: 'x' }).data.correo).toBe('ana@uni.edu');
    expect(loginSchema.safeParse({ correo: 'no-es-correo', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ correo: 'a@b.co', password: 'x', rol: 'ADMINISTRADOR' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ password_actual: 'Valida12345', password_nueva: 'Valida12345' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ password_actual: 'Valida12345', password_nueva: 'Nueva123456' }).success).toBe(true);
  });
});

describe('assertAuthSecrets', () => {
  test('falla si faltan o son iguales; pasa si son distintas', () => {
    expect(() => assertAuthSecrets({})).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => assertAuthSecrets({ JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: 'a' })).toThrow(/distintas/);
    expect(() => assertAuthSecrets({ JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: 'b' })).not.toThrow();
  });
});
