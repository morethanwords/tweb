/*
 * Inbound 1-on-1 signaling is gzipped by the peer (tgcalls 13.0.0). The peer
 * is authenticated, but it is still the other party: inflating without a bound
 * let a 1 MiB packet reserve gigabytes (gunzipSync sizes its output by the
 * trailer's ISIZE, which the sender writes) and kill the whole tab. tgcalls
 * caps the inflated size at 2 MiB and the encrypted packet at 128 KiB.
 */
import {describe, expect, it} from 'vitest';
import {gzipSync} from 'fflate';
import gzipUncompress from '@helpers/gzipUncompress';
import {P2P_SIGNALING_MAX_INFLATED_BYTES} from '@lib/calls/constants';
import P2PEncryptor from '@lib/calls/p2P/p2PEncryptor';

describe('P2P signaling inflate bound', () => {
  it('inflates a legitimate payload', () => {
    const payload = new TextEncoder().encode(JSON.stringify({'@type': 'Candidates', candidates: []}));
    const out = gzipUncompress(gzipSync(payload), false, P2P_SIGNALING_MAX_INFLATED_BYTES) as Uint8Array;
    expect(new TextDecoder().decode(out)).toBe(new TextDecoder().decode(payload));
  });

  it('refuses a payload that inflates past the tgcalls limit', () => {
    const bomb = gzipSync(new Uint8Array(P2P_SIGNALING_MAX_INFLATED_BYTES + 1));
    expect(bomb.length).toBeLessThan(16 * 1024);
    expect(() => gzipUncompress(bomb, false, P2P_SIGNALING_MAX_INFLATED_BYTES)).toThrow('GZIP_MAX_SIZE_EXCEEDED');
  });

  it('does not size its output by the trailer the peer wrote', () => {
    const data = gzipSync(new Uint8Array(64 * 1024));
    // ISIZE = 0x7fffffff: gunzipSync would reserve 2 GiB for this packet.
    data.set([0xff, 0xff, 0xff, 0x7f], data.length - 4);
    const out = gzipUncompress(data, false, P2P_SIGNALING_MAX_INFLATED_BYTES) as Uint8Array;
    expect(out.length).toBe(64 * 1024);
  });

  it('rejects an encrypted packet above the tgcalls size cap before decrypting', async() => {
    const encryptor = new P2PEncryptor(true, new Uint8Array(256).fill(1));
    await expect(encryptor.decryptRawPacket(new Uint8Array(128 * 1024 + 1))).resolves.toBeUndefined();
  });
});
