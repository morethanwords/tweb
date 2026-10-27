/*
 * Outgoing group-call video follows tgcalls (GroupInstanceCustomImpl.cpp):
 * three simulcast layers for a camera, two for a screencast, one in an E2E
 * conference; per-layer bitrate caps; and the SFU's SenderVideoConstraints
 * switch the camera's layers on and off — downgrades after 2 s, upgrades at
 * once. Before, every sender munged three layers unconditionally and the SFU's
 * requests were only logged, so all layers were always encoded at browser
 * default bitrates.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {addSimulcast, parseSdp} from '@lib/calls/sdp/utils';
import {
  configureVideoSendEncodings,
  getVideoSimulcastLayerCount,
  SenderVideoConstraint
} from '@lib/calls/helpers/videoSendParameters';
import GroupCallConnectionInstance from '@lib/calls/groupCallConnectionInstance';

const VIDEO_OFFER = [
  'v=0',
  'o=- 1 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=video 9 UDP/TLS/RTP/SAVPF 96 97',
  'c=IN IP4 0.0.0.0',
  'a=mid:0',
  'a=sendonly',
  'a=rtpmap:96 VP8/90000',
  'a=rtpmap:97 rtx/90000',
  'a=fmtp:97 apt=96',
  'a=ssrc-group:FID 1111 2222',
  'a=ssrc:1111 cname:me',
  'a=ssrc:1111 msid:stream track',
  'a=ssrc:2222 cname:me',
  'a=ssrc:2222 msid:stream track',
  ''
].join('\r\n');

function simGroup(sdpString: string) {
  const sdp = parseSdp(sdpString);
  return sdp.media[0].attributes.get('ssrc-group').get('SIM');
}

function encodings(count: number): RTCRtpEncodingParameters[] {
  return Array.from({length: count}, () => ({active: true}));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('simulcast layer count', () => {
  it('sends three layers for a camera, two for a screencast and one in a conference', () => {
    expect(getVideoSimulcastLayerCount('camera', false)).toBe(3);
    expect(getVideoSimulcastLayerCount('screencast', false)).toBe(2);
    expect(getVideoSimulcastLayerCount('camera', true)).toBe(1);
    expect(getVideoSimulcastLayerCount('screencast', true)).toBe(1);
  });

  it.each([[3], [2]])('munges %i SIM members, each with its own RTX pair', (layers) => {
    const sdp = parseSdp(VIDEO_OFFER);
    expect(addSimulcast(sdp, layers)).toBe(true);

    const munged = sdp.toString();
    const sources = simGroup(munged).value.split(' ');
    expect(sources).toHaveLength(layers);
    expect(sources[0]).toBe('1111');
    const fids = parseSdp(munged).media[0].attributes.get('ssrc-group').get('FID').lines;
    expect(fids).toHaveLength(layers);
    // Re-munging an offer that already carries the group is a no-op.
    expect(addSimulcast(parseSdp(munged), layers)).toBe(false);
  });

  it('leaves a single-layer (conference) offer untouched', () => {
    const sdp = parseSdp(VIDEO_OFFER);
    expect(addSimulcast(sdp, 1)).toBe(false);
    expect(sdp.toString()).toBe(VIDEO_OFFER);
  });

  it('skips a sending section without an RTX pair instead of throwing', () => {
    const offer = VIDEO_OFFER.replace('a=ssrc-group:FID 1111 2222\r\n', '');
    const sdp = parseSdp(offer);
    expect(() => addSimulcast(sdp, 3)).not.toThrow();
    expect(simGroup(sdp.toString()).exists).toBe(false);
  });
});

describe('per-layer encodings', () => {
  it('caps each camera layer and enables only what the requested height needs', () => {
    const list = encodings(3);
    expect(configureVideoSendEncodings(list, 'camera', 720)).toBe(true);
    expect(list).toEqual([
      {active: true, maxBitrate: 60000, scaleResolutionDownBy: 4},
      {active: true, maxBitrate: 110000, scaleResolutionDownBy: 2},
      {active: true, maxBitrate: 900000, scaleResolutionDownBy: 1}
    ]);

    expect(configureVideoSendEncodings(list, 'camera', 360)).toBe(true);
    expect(list.map((encoding) => encoding.active)).toEqual([true, true, false]);

    expect(configureVideoSendEncodings(list, 'camera', 180)).toBe(true);
    expect(list.map((encoding) => encoding.active)).toEqual([true, false, false]);

    // Nobody watches: nothing is encoded.
    expect(configureVideoSendEncodings(list, 'camera', 0)).toBe(true);
    expect(list.map((encoding) => encoding.active)).toEqual([false, false, false]);

    // Unchanged parameters are reported as such (no setParameters).
    expect(configureVideoSendEncodings(list, 'camera', 0)).toBe(false);
  });

  it('keeps both screencast layers on with the tgcalls caps', () => {
    const list = encodings(2);
    configureVideoSendEncodings(list, 'screencast', 0);
    expect(list).toEqual([
      {active: true, maxBitrate: 100000, scaleResolutionDownBy: 2},
      {active: true, maxBitrate: 1000000, scaleResolutionDownBy: 1}
    ]);
  });

  it('caps a single conference layer without touching its resolution', () => {
    const list = encodings(1);
    configureVideoSendEncodings(list, 'camera', 180);
    expect(list).toEqual([{active: true, maxBitrate: 1800000}]);
  });
});

describe('SenderVideoConstraints hysteresis', () => {
  it('upgrades at once and downgrades only after the request held for 2 s', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const constraint = new SenderVideoConstraint(onChange);

    constraint.request(180);
    expect(constraint.value).toBe(720);
    vi.advanceTimersByTime(1999);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenLastCalledWith(180);

    constraint.request(720);
    expect(constraint.value).toBe(720);
    expect(onChange).toHaveBeenLastCalledWith(720);
  });

  it('drops a pending downgrade when the SFU asks for the current height again', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const constraint = new SenderVideoConstraint(onChange);

    constraint.request(360);
    constraint.request(720);
    vi.advanceTimersByTime(5000);
    expect(onChange).not.toHaveBeenCalled();
    expect(constraint.value).toBe(720);
  });

  it('ignores malformed heights', () => {
    const onChange = vi.fn();
    const constraint = new SenderVideoConstraint(onChange);
    constraint.request(NaN);
    constraint.request(-1);
    expect(onChange).not.toHaveBeenCalled();
    constraint.dispose();
  });
});

describe('GroupCallConnectionInstance sender video', () => {
  function makeConnection(options: {type?: 'main' | 'presentation', isConference?: boolean} = {}) {
    let parameters: RTCRtpSendParameters = {encodings: encodings(3)} as any;
    const sender = {
      getParameters: vi.fn(() => structuredClone(parameters)),
      setParameters: vi.fn(async(next: RTCRtpSendParameters) => {
        parameters = next;
      })
    };
    const type = options.type ?? 'main';
    const instance = new GroupCallConnectionInstance({
      streamManager: {} as any,
      log: Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn(), debug: vi.fn()}) as any,
      groupCall: {isConference: !!options.isConference} as any,
      type,
      options: {type},
      managers: {} as any
    });
    (instance as any).connection = {signalingState: 'stable', log: vi.fn(), close: vi.fn()};
    (instance as any).description = {
      findEntry: (verify: (entry: unknown) => boolean) => {
        const entry = {type: 'video', direction: 'sendonly', transceiver: {sender}};
        return verify(entry) ? entry : undefined;
      }
    };
    return {instance, sender, getParameters: () => parameters};
  }

  it('offers the layer count of its content and call kind', () => {
    expect(makeConnection().instance.simulcastLayers).toBe(3);
    expect(makeConnection({type: 'presentation'}).instance.simulcastLayers).toBe(2);
    expect(makeConnection({isConference: true}).instance.simulcastLayers).toBe(1);
  });

  it('applies the SFU request from the data channel to the camera sender', async() => {
    vi.useFakeTimers();
    const {instance, sender, getParameters} = makeConnection();
    await instance.updateVideoSendParameters();
    expect(getParameters().encodings.map((encoding) => encoding.active)).toEqual([true, true, true]);

    (instance as any).onDataChannelMessage({colibriClass: 'SenderVideoConstraints', videoConstraints: {idealHeight: 180}});
    await vi.advanceTimersByTimeAsync(1000);
    expect(getParameters().encodings[2].active).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(getParameters().encodings.map((encoding) => encoding.active)).toEqual([true, false, false]));

    (instance as any).onDataChannelMessage({colibriClass: 'SenderVideoConstraints', videoConstraints: {idealHeight: 720}});
    await vi.waitFor(() => expect(getParameters().encodings.map((encoding) => encoding.active)).toEqual([true, true, true]));

    // Other colibri messages and garbage are ignored.
    sender.setParameters.mockClear();
    (instance as any).onDataChannelMessage({colibriClass: 'DominantSpeakerEndpointChangeEvent'});
    (instance as any).onDataChannelMessage({colibriClass: 'SenderVideoConstraints', videoConstraints: {idealHeight: 'x'}});
    await vi.advanceTimersByTimeAsync(3000);
    expect(sender.setParameters).not.toHaveBeenCalled();
    instance.closeConnection();
  });

  it('cancels a pending downgrade when the connection closes', async() => {
    vi.useFakeTimers();
    const {instance, sender} = makeConnection();
    await instance.updateVideoSendParameters();
    sender.setParameters.mockClear();

    (instance as any).onDataChannelMessage({colibriClass: 'SenderVideoConstraints', videoConstraints: {idealHeight: 0}});
    instance.closeConnection();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sender.setParameters).not.toHaveBeenCalled();
  });
});
