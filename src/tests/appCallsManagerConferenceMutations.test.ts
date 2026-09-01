import {describe, expect, it, vi} from 'vitest';
import {AppCallsManager} from '@appManagers/appCallsManager';
import type {InputGroupCall, Updates} from '@layer';
import deferred from './helpers/deferred';

const CALL: InputGroupCall.inputGroupCall = {_: 'inputGroupCall', id: '700', access_hash: '701'};


function makeUpdates(): Updates.updates {
  return {
    _: 'updates',
    updates: [],
    users: [],
    chats: [],
    date: 1,
    seq: 1
  };
}

function makeManager(updates: Updates) {
  const invokeApi = vi.fn(async() => updates);
  const processUpdateMessage = vi.fn();
  const log = Object.assign(vi.fn(), {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  });
  const manager = new AppCallsManager();
  Object.assign(manager as any, {
    apiManager: {invokeApi},
    apiUpdatesManager: {processUpdateMessage},
    appUsersManager: {getUserInput: vi.fn(() => ({_: 'inputUserSelf'}))},
    log
  });
  return {invokeApi, manager, processUpdateMessage};
}

describe('AppCallsManager conference mutation updates', () => {
  const mutationCases: Array<{
    context: string,
    run: (manager: AppCallsManager) => Promise<unknown>
  }> = [{
    context: 'invite conference participant',
    run: (manager) => manager.inviteConferenceCallParticipant(CALL, 42 as UserId)
  }, {
    context: 'decline conference invite',
    run: (manager) => manager.declineConferenceCallInvite(77)
  }, {
    context: 'delete conference participants',
    run: (manager) => manager.deleteConferenceCallParticipants({
      call: CALL,
      ids: ['42'],
      block: new Uint8Array([1]),
      onlyLeft: true
    })
  }, {
    context: 'send conference broadcast',
    run: (manager) => manager.sendConferenceCallBroadcast(CALL, new Uint8Array([2]))
  }];

  it('discards the exact accepted P2P call when local response processing fails', async() => {
    const updates = makeUpdates();
    const phonePhoneCall = {
      _: 'phone.phoneCall',
      phone_call: {
        _: 'phoneCallWaiting',
        pFlags: {video: true},
        access_hash: 'accepted-hash',
        admin_id: '1',
        date: 1,
        id: 'accepted-call',
        participant_id: '2',
        protocol: {_: 'phoneCallProtocol', pFlags: {}, library_versions: [], max_layer: 1, min_layer: 1},
        receive_date: 1
      },
      users: []
    } as any;
    const {invokeApi, manager} = makeManager(phonePhoneCall);
    const processingError = new Error('save accepted call failed');
    (manager as any).appUsersManager = {getUserInput: vi.fn(() => ({_: 'inputUserSelf'}))};
    vi.spyOn(manager, 'savePhonePhoneCall').mockImplementation(() => {
      throw processingError;
    });
    invokeApi
    .mockResolvedValueOnce(phonePhoneCall)
    .mockResolvedValueOnce(updates);

    await expect(manager.requestCall(
      2 as UserId,
      phonePhoneCall.phone_call.protocol,
      new Uint8Array([1]),
      true
    )).rejects.toBe(processingError);

    expect(invokeApi).toHaveBeenNthCalledWith(2, 'phone.discardCall', {
      video: true,
      peer: {_: 'inputPhoneCall', id: 'accepted-call', access_hash: 'accepted-hash'},
      duration: 0,
      reason: {_: 'phoneCallDiscardReasonHangup'},
      connection_id: '0'
    });
  });

  it.each(mutationCases)(
    'keeps an accepted $context successful when local update processing fails',
    async({context, run}) => {
      const updates = makeUpdates();
      const rpc = deferred<Updates>();
      const {invokeApi, manager, processUpdateMessage} = makeManager(updates);
      const processingError = new Error(`${context} local processing failed`);
      invokeApi.mockReturnValueOnce(rpc.promise);
      processUpdateMessage.mockImplementation(() => {
        throw processingError;
      });

      const operation = run(manager);
      await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(1));
      rpc.resolve(updates);

      await expect(operation).resolves.toBe(updates);
      expect(invokeApi).toHaveBeenCalledTimes(1);
      expect(processUpdateMessage).toHaveBeenCalledWith(updates);
      expect((manager as any).log.error).toHaveBeenCalledWith(
        `${context} update processing failed after RPC acceptance`,
        processingError
      );
    }
  );

  it.each(mutationCases)(
    'preserves a pre-accept $context RPC rejection',
    async({run}) => {
      const updates = makeUpdates();
      const {invokeApi, manager, processUpdateMessage} = makeManager(updates);
      const rpcError = new Error('RPC rejected before acceptance');
      invokeApi.mockRejectedValueOnce(rpcError);

      await expect(run(manager)).rejects.toBe(rpcError);

      expect(invokeApi).toHaveBeenCalledTimes(1);
      expect(processUpdateMessage).not.toHaveBeenCalled();
    }
  );

  it('preserves discardCall update-processing rejection', async() => {
    const updates = makeUpdates();
    const {manager, processUpdateMessage} = makeManager(updates);
    const processingError = new Error('discard local processing failed');
    const call = {
      _: 'phoneCallWaiting',
      pFlags: {},
      id: 'discard-call',
      access_hash: 'discard-hash'
    } as any;
    (manager as any).calls = new Map([[call.id, call]]);
    processUpdateMessage.mockImplementation(() => {
      throw processingError;
    });

    await expect(manager.discardCall(
      call.id,
      0,
      {_: 'phoneCallDiscardReasonHangup'}
    )).rejects.toBe(processingError);
  });

  it('processes deleteConferenceCallParticipants Updates before returning them', async() => {
    const updates = makeUpdates();
    const {invokeApi, manager, processUpdateMessage} = makeManager(updates);
    const block = new Uint8Array([1, 2, 3]);

    await expect(manager.deleteConferenceCallParticipants({
      call: CALL,
      ids: ['10', 20],
      block,
      onlyLeft: true,
      kick: false
    })).resolves.toBe(updates);

    expect(invokeApi).toHaveBeenCalledWith('phone.deleteConferenceCallParticipants', {
      only_left: true,
      kick: false,
      call: CALL,
      ids: ['10', 20],
      block
    });
    expect(processUpdateMessage).toHaveBeenCalledTimes(1);
    expect(processUpdateMessage).toHaveBeenCalledWith(updates);
  });

  it('processes sendConferenceCallBroadcast Updates before returning them', async() => {
    const updates = makeUpdates();
    const {invokeApi, manager, processUpdateMessage} = makeManager(updates);
    const block = new Uint8Array([4, 5, 6]);

    await expect(manager.sendConferenceCallBroadcast(CALL, block)).resolves.toBe(updates);

    expect(invokeApi).toHaveBeenCalledWith('phone.sendConferenceCallBroadcast', {call: CALL, block});
    expect(processUpdateMessage).toHaveBeenCalledTimes(1);
    expect(processUpdateMessage).toHaveBeenCalledWith(updates);
  });
});
