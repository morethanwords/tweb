import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

vi.mock('@lib/calls/callTransitionCoordinator', () => ({
  default: {run: <T>(callback: () => Promise<T>) => callback()}
}));
vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    serviceMessagePort: {
      addEventListener: vi.fn(),
      invokeVoid: vi.fn()
    }
  }
}));
vi.mock('@lib/rootScope', () => ({
  default: {addEventListener: vi.fn()}
}));

import {RtmpCallsController} from '@lib/calls/rtmpCallsController';
import type {DataJSON, Update} from '@layer';
import deferred from './helpers/deferred';


const INPUT_CALL = {
  _: 'inputGroupCall',
  id: 'rtmp-call',
  access_hash: 'rtmp-hash'
} as const;

function joinUpdate(data = '{"rtmp":true}'): Update.updateGroupCallConnection & {acceptedCallInput: typeof INPUT_CALL} {
  return {
    _: 'updateGroupCallConnection',
    pFlags: {},
    params: {_: 'dataJSON', data},
    acceptedCallInput: INPUT_CALL
  };
}

function makeController(joinGroupCall: (...args: any[]) => Promise<ReturnType<typeof joinUpdate>>) {
  const hangUp = vi.fn(async() => {});
  const leaveGroupCall = vi.fn(async() => {});
  const controller = new RtmpCallsController();
  Object.assign(controller as any, {
    managers: {
      appProfileManager: {
        getChatFull: vi.fn(async() => ({
          _: 'channelFull',
          pFlags: {},
          id: 7,
          about: '',
          read_inbox_max_id: 0,
          read_outbox_max_id: 0,
          unread_count: 0,
          chat_photo: {_: 'photoEmpty', id: '0'},
          notify_settings: {_: 'peerNotifySettings', pFlags: {}},
          bot_info: [],
          pinned_msg_id: 0,
          common_chats_count: 0,
          call: INPUT_CALL
        }))
      },
      appGroupCallsManager: {
        getGroupCallFull: vi.fn(async() => ({
          _: 'groupCall',
          pFlags: {rtmp_stream: true},
          id: INPUT_CALL.id,
          access_hash: INPUT_CALL.access_hash,
          participants_count: 0,
          unmuted_video_limit: 0,
          version: 1
        })),
        hangUp,
        joinGroupCall,
        leaveGroupCall
      }
    }
  });
  return {controller, hangUp, leaveGroupCall};
}

describe('RtmpCallsController recovery serialization', () => {
  it('leaves only the viewer-owned call when a close completes after replacement', async() => {
    const joinGroupCall = vi.fn().mockResolvedValue(joinUpdate());
    const {controller, hangUp} = makeController(joinGroupCall);
    await controller.joinCall(7 as ChatId);
    const viewerCall = controller.currentCall;

    const replacement = {...viewerCall, cleanup: vi.fn()} as any;
    Object.assign(controller as any, {_currentCall: replacement});

    await expect(controller.leaveCall(true, viewerCall)).resolves.toBe(false);
    expect(controller.currentCall).toBe(replacement);
    expect(hangUp).not.toHaveBeenCalled();

    await expect(controller.leaveCall(false, replacement)).resolves.toBe(true);
    expect(hangUp).toHaveBeenCalledWith(INPUT_CALL.id, replacement.ssrc);
  });

  it('single-flights rejoin and compensates a response accepted after direct leave', async() => {
    const rejoinRpc = deferred<ReturnType<typeof joinUpdate>>();
    const joinGroupCall = vi.fn()
    .mockResolvedValueOnce(joinUpdate())
    .mockReturnValueOnce(rejoinRpc.promise);
    const {controller, hangUp, leaveGroupCall} = makeController(joinGroupCall);

    await controller.joinCall(7 as ChatId);
    const oldSsrc = controller.currentCall.ssrc;
    const firstRejoin = controller.rejoinCall();
    const secondRejoin = controller.rejoinCall();
    expect(secondRejoin).toBe(firstRejoin);
    await vi.waitFor(() => expect(joinGroupCall).toHaveBeenCalledTimes(2));
    const rejoinData = JSON.parse(joinGroupCall.mock.calls[1][1].data);

    await controller.leaveCall();
    expect(hangUp).toHaveBeenCalledWith(INPUT_CALL.id, oldSsrc);
    expect(controller.currentCall).toBeUndefined();

    rejoinRpc.resolve(joinUpdate());
    await firstRejoin;

    expect(leaveGroupCall).toHaveBeenCalledTimes(1);
    expect(leaveGroupCall).toHaveBeenCalledWith(INPUT_CALL, rejoinData.ssrc);
    expect(controller.currentCall).toBeUndefined();
  });

  it.each([
    ['malformed answer', '{'],
    ['non-RTMP answer', '{"rtmp":false}']
  ])('compensates an accepted initial join with a %s', async(_label, responseData) => {
    const joinGroupCall = vi.fn(async(_callId: unknown, _data: DataJSON) => joinUpdate(responseData));
    const {controller, leaveGroupCall} = makeController(joinGroupCall);

    await expect(controller.joinCall(7 as ChatId)).rejects.toBeInstanceOf(Error);

    const requestData = JSON.parse(joinGroupCall.mock.calls[0][1].data);
    expect(leaveGroupCall).toHaveBeenCalledTimes(1);
    expect(leaveGroupCall).toHaveBeenCalledWith(INPUT_CALL, requestData.ssrc);
    expect(controller.currentCall).toBeUndefined();
  });
});
