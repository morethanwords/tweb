/*
 * The remote peer supplies ufrag / pwd / fingerprint in its InitialSetup, and
 * those strings are interpolated verbatim into the SDP handed to the browser
 * (sdpBuilder addTransport). SDP is line-oriented, so a CR or LF ends the
 * attribute early and the remainder is parsed as further SDP — the peer would
 * be writing our session description rather than just their half of it.
 */

import {describe, expect, it} from 'vitest';
import {isSdpSafeSetup, isSdpSafeString} from '@lib/calls/helpers/sdpSafety';
import {P2PSdpOptions, SDPBuilder} from '@lib/calls/sdpBuilder';

const setup = (over: any = {}) => ({
  '@type': 'InitialSetup' as const,
  ufrag: 'abcd',
  pwd: 'secret',
  renomination: false,
  fingerprints: [{hash: 'sha-256', fingerprint: 'AA:BB', setup: 'active'}],
  ...over
});

describe('isSdpSafeString', () => {
  it('accepts ordinary values', () => {
    expect(isSdpSafeString('sha-256')).toBe(true);
    expect(isSdpSafeString('')).toBe(true);
  });

  it('rejects non-strings before interpolation can coerce them', () => {
    expect(isSdpSafeString(undefined)).toBe(false);
    expect(isSdpSafeString(null)).toBe(false);
    expect(isSdpSafeString(123)).toBe(false);
    expect(isSdpSafeString({value: 'safe'})).toBe(false);
    expect(isSdpSafeString(['safe'])).toBe(false);
  });

  it('rejects every line terminator', () => {
    expect(isSdpSafeString('a\rb')).toBe(false);
    expect(isSdpSafeString('a\nb')).toBe(false);
    expect(isSdpSafeString('a\r\nb')).toBe(false);
    expect(isSdpSafeString('a\0b')).toBe(false);
  });
});

describe('isSdpSafeSetup', () => {
  it('accepts a well-formed setup', () => {
    expect(isSdpSafeSetup(setup() as any)).toBe(true);
  });

  it('rejects an injected ufrag', () => {
    // The classic payload: close the line, then add attributes of your choosing.
    expect(isSdpSafeSetup(setup({ufrag: 'x\r\na=candidate:evil'}) as any)).toBe(false);
  });

  it('rejects an injected ufrag hidden in a JSON array', () => {
    // Array#toString produces the payload verbatim during template interpolation.
    expect(isSdpSafeSetup(setup({ufrag: ['x\r\na=candidate:evil']}) as any)).toBe(false);
  });

  it('rejects an injected pwd', () => {
    expect(isSdpSafeSetup(setup({pwd: 'p\r\na=setup:actpass'}) as any)).toBe(false);
  });

  it('rejects injection through any fingerprint field', () => {
    expect(isSdpSafeSetup(setup({
      fingerprints: [{hash: 'sha-256\r\na=x:1', fingerprint: 'AA', setup: 'active'}]
    }) as any)).toBe(false);
    expect(isSdpSafeSetup(setup({
      fingerprints: [{hash: 'sha-256', fingerprint: 'AA\r\na=x:1', setup: 'active'}]
    }) as any)).toBe(false);
    expect(isSdpSafeSetup(setup({
      fingerprints: [{hash: 'sha-256', fingerprint: 'AA', setup: 'active\r\na=x:1'}]
    }) as any)).toBe(false);
  });

  it('checks every fingerprint, not just the first', () => {
    expect(isSdpSafeSetup(setup({
      fingerprints: [
        {hash: 'sha-256', fingerprint: 'AA', setup: 'active'},
        {hash: 'sha-256', fingerprint: 'BB\r\na=x:1', setup: 'active'}
      ]
    }) as any)).toBe(false);
  });

  it('requires the complete runtime InitialSetup shape', () => {
    expect(isSdpSafeSetup(setup({ufrag: undefined}) as any)).toBe(false);
    expect(isSdpSafeSetup(setup({pwd: {value: 'secret'}}) as any)).toBe(false);
    expect(isSdpSafeSetup(setup({renomination: 'false'}) as any)).toBe(false);
    expect(isSdpSafeSetup(setup({fingerprints: undefined}) as any)).toBe(false);
    expect(isSdpSafeSetup(setup({fingerprints: []}) as any)).toBe(false);
    expect(isSdpSafeSetup(setup({fingerprints: ['sha-256']}) as any)).toBe(false);
    expect(isSdpSafeSetup({...setup(), '@type': 'Candidates'} as any)).toBe(false);
  });

  it('rejects non-string fingerprint fields', () => {
    expect(isSdpSafeSetup(setup({
      fingerprints: [{hash: ['sha-256\r\na=x:1'], fingerprint: 'AA', setup: 'active'}]
    }) as any)).toBe(false);
    expect(isSdpSafeSetup(setup({
      fingerprints: [{hash: 'sha-256', fingerprint: {value: 'AA'}, setup: 'active'}]
    }) as any)).toBe(false);
  });
});

describe('SDPBuilder InitialSetup boundary', () => {
  const options = (initialSetup: unknown): P2PSdpOptions => ({
    setup: initialSetup as P2PSdpOptions['setup'],
    mids: {audio: '0', video: '1', presentation: '2', data: '3'},
    isAnswer: false,
    entries: [],
    audioPayloadTypes: [],
    audioExtensions: [],
    videoPayloadTypes: [],
    videoExtensions: [],
    shouldKeepRemoteReceiveSection: () => false
  });

  it('refuses an unsafe setup even when a caller bypasses CallInstance', () => {
    const malicious = setup({ufrag: ['x\r\na=candidate:evil']});
    expect(() => SDPBuilder.fromP2p(options(malicious))).toThrow(/Invalid P2P transport setup/);
  });
});
