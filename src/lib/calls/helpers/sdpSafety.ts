/*
 * Guards for strings that get interpolated into an SDP we hand to the browser.
 *
 * SDP is line-oriented: a CR or LF inside an attribute value ends that line
 * early and everything after it is parsed as further SDP. On the P2P (1-on-1)
 * path the remote peer supplies ufrag / pwd / fingerprint directly, so without
 * this the peer writes our session description rather than just their half of
 * it (sdpBuilder addTransport interpolates all of them verbatim).
 *
 * These fields have no legitimate use for a line break, so a violation is a
 * signalling error to reject — not something to sanitise and carry on with.
 */

import type {P2PMessage} from '@lib/calls/types';

type InitialSetup = Extract<P2PMessage, {'@type': 'InitialSetup'}>;

export function isSdpSafeString(value: unknown): value is string {
  return typeof value === 'string' && !/[\r\n\0]/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptySdpString(value: unknown): value is string {
  return isSdpSafeString(value) && value.length > 0;
}

/**
 * Runtime validation for the peer-controlled InitialSetup JSON.
 *
 * This deliberately validates types as well as line safety. Template-string
 * interpolation calls Array#toString/Object#toString, so merely checking CR/LF
 * when the value happens to be a string lets a JSON array smuggle a second SDP
 * line through (for example, `["x\r\na=candidate:evil"]`).
 */
export function isSdpSafeSetup(setup: unknown): setup is InitialSetup {
  if(!isRecord(setup) || setup['@type'] !== 'InitialSetup') {
    return false;
  }

  if(!isNonEmptySdpString(setup.ufrag) || !isNonEmptySdpString(setup.pwd)) {
    return false;
  }
  if(typeof setup.renomination !== 'boolean') {
    return false;
  }
  if(!Array.isArray(setup.fingerprints) || !setup.fingerprints.length) {
    return false;
  }

  return setup.fingerprints.every((fingerprint) => {
    return isRecord(fingerprint) &&
      isNonEmptySdpString(fingerprint.hash) &&
      isNonEmptySdpString(fingerprint.fingerprint) &&
      isNonEmptySdpString(fingerprint.setup);
  });
}
