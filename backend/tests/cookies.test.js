'use strict';

const { env } = require('../src/config/env');
const { setSessionCookies, setCsrfCookie } = require('../src/utils/cookies');

describe('cookies de sesión entre dominios', () => {
  const originalProduction = env.IS_PRODUCTION;
  const originalCookieSecure = env.COOKIE_SECURE;

  afterEach(() => {
    env.IS_PRODUCTION = originalProduction;
    env.COOKIE_SECURE = originalCookieSecure;
  });

  it('usa SameSite=None y Secure en producción', () => {
    env.IS_PRODUCTION = true;
    env.COOKIE_SECURE = true;

    const cookies = [];
    const res = { cookie: (name, value, options) => cookies.push({ name, options }) };

    setSessionCookies(res, { accessToken: 'access', refreshToken: 'refresh' });
    setCsrfCookie(res, 'csrf');

    expect(cookies).toHaveLength(3);
    for (const { options } of cookies) {
      expect(options.sameSite).toBe('none');
      expect(options.secure).toBe(true);
    }
  });
});
