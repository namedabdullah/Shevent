// Required by testing/PHASE_TESTING.md S2: redirect safety and which paths need a session.
import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_SIGN_IN, isProtectedPath, PROTECTED_PATHS, safeNext } from './routes';

describe('safeNext', () => {
  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', 'http://evil.example', 'javascript:alert(1)', 'evil.example', '', '  '])(
    'rejects %j',
    (value) => expect(safeNext(value)).toBe(DEFAULT_AFTER_SIGN_IN),
  );

  it.each([null, undefined, 42, {}, [], true])('rejects non-strings: %j', (value) => {
    expect(safeNext(value)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it.each(['/plans', '/plans/abc?created=1', '/inquiries/1', '/'])('keeps same-site path %s', (value) => {
    expect(safeNext(value)).toBe(value);
  });
});

describe('isProtectedPath', () => {
  it.each(['/plan', '/plan/new', '/plans', '/plans/1', '/plans/1/packages', '/inquiries/1', '/bookings/1', '/assistant', '/vendor', '/vendor/onboarding'])(
    'protects %s',
    (path) => expect(isProtectedPath(path)).toBe(true),
  );

  it.each(['/', '/sign-in', '/vendors/demo-caterers', '/vendors', '/planning', '/plansx', '/assistants', '/api/ai/v1/estimate', '/robots.txt'])(
    'leaves %s public',
    (path) => expect(isProtectedPath(path)).toBe(false),
  );

  it('covers every protected path', () => {
    for (const path of PROTECTED_PATHS) expect(isProtectedPath(path)).toBe(true);
  });
});
