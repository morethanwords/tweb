/*
 * Unit tests for AppGroupCallsManager.joinGroupCall — focused on the
 * `resolvedCallId` / `resolvedAccessHash` promotion the controller depends on
 * for invite-link / invite-message joins (where the placeholder instance.id
 * needs to be rewritten once the server echoes back the real id+access_hash).
 */

import {describe, expect, it} from 'vitest';
import {AppGroupCallsManager} from '@appManagers/appGroupCallsManager';
import {DataJSON, Updates, Update, GroupCall} from '@layer';

type JoinOptions = Parameters<AppGroupCallsManager['joinGroupCall']>[2];

// Build a fake `updateGroupCallConnection` reply, optionally accompanied by
// an `updateGroupCall` carrying the resolved id+access_hash.
function buildUpdatesReply(includeGroupCall: {
  callId: string;
  accessHash: string;
  discarded?: boolean;
} | null): Updates.updates {
  const updates: Update[] = [
    {
      _: 'updateGroupCallConnection',
      pFlags: {},
      params: {_: 'dataJSON', data: '{"answer":"sdp"}'}
    }
  ];
  if(includeGroupCall) {
    const call: GroupCall = includeGroupCall.discarded ? {
      _: 'groupCallDiscarded',
      id: includeGroupCall.callId,
      access_hash: includeGroupCall.accessHash,
      duration: 0
    } : {
      _: 'groupCall',
      pFlags: {conference: true},
      id: includeGroupCall.callId,
      access_hash: includeGroupCall.accessHash,
      participants_count: 0,
      unmuted_video_limit: 0,
      version: 1
    };
    updates.push({
      _: 'updateGroupCall',
      pFlags: {},
      call
    });
  }
  return {
    _: 'updates',
    updates,
    users: [],
    chats: [],
    date: 0,
    seq: 0
  };
}

// Create a minimally-wired AppGroupCallsManager: only the fields the
// `joinGroupCall` body touches need to be real. Everything else is left undef.
function makeManager(opts: {
  apiResponse: Updates;
  inputPeerSelf?: any;
}): AppGroupCallsManager {
  const manager = new AppGroupCallsManager();

  const apiManagerMock = {
    invokeApi: async(_method: string, _params: any) => opts.apiResponse
  };
  const apiUpdatesManagerMock = {
    processUpdateMessage: (_updates: Updates) => {}
  };
  const appPeersManagerMock = {
    getInputPeerSelf: () => opts.inputPeerSelf ?? {_: 'inputPeerSelf'}
  };

  // AppManager fields are `protected`, so reach in via `as any`.
  Object.assign(manager as any, {
    apiManager: apiManagerMock,
    apiUpdatesManager: apiUpdatesManagerMock,
    appPeersManager: appPeersManagerMock,
    log: Object.assign(() => {}, {
      warn: () => {},
      error: () => {},
      info: () => {},
      debug: () => {}
    })
  });

  return manager;
}

const params: DataJSON = {_: 'dataJSON', data: '{"offer":"sdp"}'};

const baseOptions: JoinOptions = {
  type: 'main',
  isMuted: true,
  joinVideo: false,
  e2eCallInput: {_: 'inputGroupCallSlug', slug: 'fake-slug-for-test'}
};

describe('AppGroupCallsManager.joinGroupCall — resolvedCallId / resolvedAccessHash promotion', () => {
  it('attaches resolvedCallId + resolvedAccessHash when updates contain updateGroupCall', async() => {
    const reply = buildUpdatesReply({callId: '12345678901', accessHash: '99887766554433'});
    const manager = makeManager({apiResponse: reply});

    const update = await manager.joinGroupCall('placeholder-id', params, baseOptions);

    expect(update._).toBe('updateGroupCallConnection');
    expect((update as any).resolvedCallId).toBe('12345678901');
    expect((update as any).resolvedAccessHash).toBe('99887766554433');
  });

  it('leaves resolvedCallId / resolvedAccessHash undefined when no updateGroupCall in response (legacy case)', async() => {
    const reply = buildUpdatesReply(null);
    const manager = makeManager({apiResponse: reply});

    // For the legacy case the controller must already know the id, so we
    // wouldn't be using `e2eCallInput`. Use the id-form input + a synthetic
    // group_call cache entry so `getGroupCallInput` succeeds.
    (manager as any).groupCalls = new Map<string, GroupCall>([
      ['42', {
        _: 'groupCall',
        pFlags: {},
        id: '42',
        access_hash: '7',
        participants_count: 0,
        unmuted_video_limit: 0,
        version: 1
      }]
    ]);

    const update = await manager.joinGroupCall('42', params, {
      type: 'main',
      isMuted: true,
      joinVideo: false
    });

    expect(update._).toBe('updateGroupCallConnection');
    expect((update as any).resolvedCallId).toBeUndefined();
    expect((update as any).resolvedAccessHash).toBeUndefined();
  });

  it('does not promote a groupCallDiscarded — leaves the extras unset', async() => {
    // If the server echoes back a discarded call there is no usable
    // id+access_hash to promote — the guard `call._ !== 'groupCallDiscarded'`
    // must keep `resolvedCallId` undefined.
    const reply = buildUpdatesReply({callId: 'discarded-id', accessHash: 'discarded-hash', discarded: true});
    const manager = makeManager({apiResponse: reply});

    const update = await manager.joinGroupCall('placeholder-id', params, baseOptions);

    expect(update._).toBe('updateGroupCallConnection');
    expect((update as any).resolvedCallId).toBeUndefined();
    expect((update as any).resolvedAccessHash).toBeUndefined();
  });

  it('forwards `e2eCallInput` straight through as the `call` field (no synth from id)', async() => {
    // The whole point of `e2eCallInput`: invitee paths (slug / inviteMessage)
    // don't yet have an access_hash, so the manager must pass the override to
    // the server rather than calling `getGroupCallInput` with the placeholder
    // id (which would throw 'Group call not found').
    const reply = buildUpdatesReply({callId: 'resolved-1', accessHash: 'resolved-hash'});

    // Sniff the request that the apiManager mock receives.
    let sniffedRequest: any;
    const manager = new AppGroupCallsManager();
    Object.assign(manager as any, {
      apiManager: {
        invokeApi: async(_method: string, params: any) => {
          sniffedRequest = params;
          return reply;
        }
      },
      apiUpdatesManager: {processUpdateMessage: () => {}},
      appPeersManager: {getInputPeerSelf: () => ({_: 'inputPeerSelf'})},
      log: Object.assign(() => {}, {warn: () => {}, error: () => {}, info: () => {}, debug: () => {}})
    });

    const inviteMessageInput = {_: 'inputGroupCallInviteMessage' as const, msg_id: 9999};
    await manager.joinGroupCall('placeholder-id', params, {
      type: 'main',
      isMuted: true,
      joinVideo: false,
      e2eCallInput: inviteMessageInput
    });

    expect(sniffedRequest.call).toEqual(inviteMessageInput);
  });
});
