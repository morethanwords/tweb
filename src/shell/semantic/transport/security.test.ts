import {describe, expect, it} from 'vitest';
import {createSessionStore, boundedBody, equalSecret} from './security';
import {CompanionLimits} from './contracts';

describe('local session lifecycle', () => {
  const origin = 'http://127.0.0.1:3130';
  it('requires exact session/CSRF identity and does not extend absolute expiration by polling', () => {
    let now = 100;
    const sessions = createSessionStore(() => now);
    const issued = sessions.issue(new Request(origin + '/api/session'));
    const cookie = issued.cookie.split(';')[0];
    const request = new Request(origin + '/api/command', {method: 'POST', headers: {Cookie: cookie, Origin: origin, 'X-CSRF-Token': issued.csrfToken}});
    expect(() => sessions.authorize(request, origin, true)).not.toThrow();
    now += CompanionLimits.sessionMs - 1;
    expect(sessions.issue(request).csrfToken).toBe(issued.csrfToken);
    now++;
    expect(() => sessions.authorize(request, origin, true)).toThrow('Open the companion');
    expect(sessions.issue(request).csrfToken).not.toBe(issued.csrfToken);
  });

  it('does not silently evict existing sessions when capacity is reached', () => {
    const sessions = createSessionStore();
    for(let index = 0; index < CompanionLimits.sessions; index++) sessions.issue(new Request(origin + '/api/session'));
    expect(() => sessions.issue(new Request(origin + '/api/session'))).toThrow('Too many');
    sessions.clear();
    expect(() => sessions.issue(new Request(origin + '/api/session'))).not.toThrow();
  });

  it('compares capabilities without accepting prefixes, null or oversized values', () => {
    expect(equalSecret('abc', 'abc')).toBe(true);
    expect(equalSecret('abc ', 'abc')).toBe(false);
    expect(equalSecret(null, 'abc')).toBe(false);
    expect(equalSecret('x'.repeat(1025), 'x'.repeat(1025))).toBe(false);
  });
});

describe('body decoding', () => {
  it('rejects compressed bodies and invalid UTF-8', async () => {
    await expect(boundedBody(new Request('http://127.0.0.1:3130/mcp', {method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Encoding': 'gzip'}, body: '{}'}))).rejects.toThrow('Compressed');
    await expect(boundedBody(new Request('http://127.0.0.1:3130/mcp', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: new Uint8Array([0xff])}))).rejects.toThrow('could not be read');
  });

  it('applies the same complexity guard to web-standard request bodies', async () => {
    let data: unknown = null;
    for(let depth = 0; depth < 36; depth++) data = [data];
    await expect(boundedBody(new Request('http://127.0.0.1:3130/mcp', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)}))).rejects.toThrow('INPUT_TOO_COMPLEX');
  });
});
