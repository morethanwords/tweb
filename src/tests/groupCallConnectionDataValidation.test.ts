/*
 * The SFU's join answer (updateGroupCallConnection params) is interpolated into
 * the SDP handed to setRemoteDescription. It used to go from JSON.parse straight
 * into the builders, so a line break in the transport's ufrag, or an object
 * where an array was expected, wrote our session description for us.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const joinMocks = vi.hoisted(() => ({
  processMediaSection: vi.fn(),
  filterServerCodecs: vi.fn(),
  fixLocalOffer: vi.fn()
}));

vi.mock('@lib/calls/helpers/processMediaSection', () => ({default: joinMocks.processMediaSection}));
vi.mock('@lib/calls/helpers/filterServerCodecs', () => ({default: joinMocks.filterServerCodecs}));
vi.mock('@lib/calls/helpers/fixLocalOffer', () => ({default: joinMocks.fixLocalOffer}));

import GroupCallConnectionInstance from '@lib/calls/groupCallConnectionInstance';
import {isSdpSafeConnectionData} from '@lib/calls/helpers/sdpSafety';
import type {UpdateGroupCallConnectionData} from '@lib/calls/types';
import mockConnectionData from '@/mock/webrtc/data';

function answer(): UpdateGroupCallConnectionData {
  return JSON.parse(JSON.stringify(mockConnectionData));
}

function makeInstance(rawAnswer: string) {
  const connection = {
    iceConnectionState: 'new',
    iceGatheringState: 'complete',
    signalingState: 'have-local-offer',
    connectionState: 'new',
    createOffer: vi.fn(async() => ({type: 'offer' as const, sdp: 'v=0'})),
    setLocalDescription: vi.fn(async() => {}),
    setRemoteDescription: vi.fn(async() => {})
  } as any;
  const log = Object.assign(vi.fn(), {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }) as any;
  log.bindPrefix = () => log;
  const joinGroupCall = vi.fn(async() => ({
    _: 'updateGroupCallConnection',
    pFlags: {},
    params: {_: 'dataJSON', data: rawAnswer}
  }));
  const groupCall = {
    id: '700',
    groupCall: {_: 'groupCall', id: '700', access_hash: '701'},
    connections: {main: {description: {audio: undefined as unknown}}},
    toInputGroupCall: () => ({_: 'inputGroupCall', id: '700', access_hash: '701'})
  };
  const instance = new GroupCallConnectionInstance({
    connection,
    streamManager: {} as any,
    log,
    groupCall: groupCall as any,
    type: 'main',
    options: {type: 'main', isMuted: true, joinVideo: false},
    managers: {appGroupCallsManager: {joinGroupCall}} as any
  });
  const description = {
    entries: [] as unknown[],
    getEntryByMid: vi.fn(() => ({source: undefined})),
    setData: vi.fn(),
    generateSdp: vi.fn(() => 'v=0'),
    deleteEntry: vi.fn()
  };
  (instance as any).description = description;
  return {connection, description, instance, joinGroupCall};
}

describe('GroupCallConnectionInstance connection data validation', () => {
  beforeEach(() => {
    joinMocks.processMediaSection.mockReset().mockReturnValue({
      entry: {type: 'audio'},
      media: {mediaType: 'audio'},
      source: 777,
      sourceGroups: undefined,
      params: {_: 'dataJSON', data: '{}'}
    });
    joinMocks.filterServerCodecs.mockReset();
    joinMocks.fixLocalOffer.mockReset().mockImplementation(({offer}) => ({
      offer,
      sdp: {media: [{mediaType: 'audio', isSending: true, mid: '0'}], bundle: []}
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts the shape the SFU really answers with', async() => {
    expect(isSdpSafeConnectionData(answer())).toBe(true);
    const {connection, description, instance} = makeInstance(JSON.stringify(answer()));

    await expect(instance.negotiate()).resolves.toBeUndefined();

    expect(description.setData).toHaveBeenCalledTimes(1);
    expect(connection.setRemoteDescription).toHaveBeenCalledTimes(1);
  });

  it('rejects a CRLF in transport.ufrag before setRemoteDescription', async() => {
    const data = answer();
    data.transport.ufrag = 'abcd\r\na=candidate:1 1 udp 1 203.0.113.1 9 typ host';
    const {connection, description, instance, joinGroupCall} = makeInstance(JSON.stringify(data));

    await expect(instance.negotiate()).rejects.toThrow('Invalid group call connection data');

    expect(joinGroupCall).toHaveBeenCalledTimes(1);
    expect(description.setData).not.toHaveBeenCalled();
    expect(joinMocks.filterServerCodecs).not.toHaveBeenCalled();
    expect(connection.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('rejects a non-array payload-types before setRemoteDescription', async() => {
    const data = answer();
    (data.audio as any)['payload-types'] = {id: 111, name: 'opus\r\n', clockrate: 48000};
    const {connection, description, instance} = makeInstance(JSON.stringify(data));

    await expect(instance.negotiate()).rejects.toThrow('Invalid group call connection data');

    expect(description.setData).not.toHaveBeenCalled();
    expect(connection.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('rejects an answer that is not JSON at all', async() => {
    const {connection, instance} = makeInstance('{"transport":');

    await expect(instance.negotiate()).rejects.toThrow('Invalid group call connection data');

    expect(connection.setRemoteDescription).not.toHaveBeenCalled();
  });
});
