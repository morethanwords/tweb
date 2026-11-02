import {expect, test, vi} from 'vitest';
import forgetFailedRequest from '@helpers/forgetFailedRequest';
import pause from '@helpers/schedulers/pause';
import {AppUsersManager} from '@appManagers/appUsersManager';
import {AppChatsManager} from '@appManagers/appChatsManager';
import {AppPrivacyManager} from '@appManagers/appPrivacyManager';
import {AppDraftsManager} from '@appManagers/appDraftsManager';

test('forgets a failed request it still keeps, and passes the failure on', async() => {
  const slot: {request?: Promise<number>} = {};
  slot.request = forgetFailedRequest(Promise.reject(new Error('FLOOD')), () => slot.request, () => slot.request = undefined);

  await expect(slot.request).rejects.toThrow('FLOOD');
  await pause(0);
  expect(slot.request).toBeUndefined();
});

test('leaves a newer request kept in its place, and an answered one', async() => {
  const slot: {request?: Promise<number>} = {};
  const failed = forgetFailedRequest(Promise.reject(new Error('TIMEOUT')), () => slot.request, () => slot.request = undefined);
  const newer = slot.request = Promise.resolve(2);
  await expect(failed).rejects.toThrow('TIMEOUT');
  await pause(0);
  expect(slot.request).toBe(newer);

  slot.request = forgetFailedRequest(Promise.resolve(1), () => slot.request, () => slot.request = undefined);
  const answered = slot.request;
  expect(await answered).toBe(1);
  await pause(0);
  expect(slot.request).toBe(answered);
});

// * one of the requests it is used for: the default emoji statuses of the status picker
test('asks for the default emoji statuses again after a request that failed', async() => {
  const manager = new AppUsersManager();
  const statuses = {_: 'account.emojiStatuses', hash: '1', statuses: [] as any[]};
  let calls = 0;
  Object.assign(manager as any, {
    apiManager: {
      invokeApiSingleProcess: ({processResult}: {processResult: (result: unknown) => unknown}) => {
        return ++calls === 1 ? Promise.reject({type: 'NETWORK_BAD_REQUEST'}) : Promise.resolve(processResult(statuses));
      }
    }
  });

  await expect(manager.getDefaultEmojiStatuses()).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
  await pause(0);

  expect(await manager.getDefaultEmojiStatuses()).toBe(statuses);
  expect(calls).toBe(2);
});

// * and the channels recommended under a channel (or the similar channels of the search)
test('asks for channel recommendations again after a request that failed', async() => {
  const manager = new AppChatsManager();
  const recommended = {_: 'messages.chats', chats: [] as any[]};
  let calls = 0;
  Object.assign(manager as any, {
    recommendations: {},
    apiManager: {
      invokeApiSingleProcess: ({processResult}: {processResult: (result: unknown) => unknown}) => {
        return ++calls === 1 ? Promise.reject({type: 'NETWORK_BAD_REQUEST'}) : Promise.resolve().then(() => processResult(recommended));
      }
    }
  });
  vi.spyOn(manager, 'saveApiChats').mockImplementation(() => {});

  await expect(manager.getChannelRecommendations()).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
  await pause(0);

  expect(await manager.getChannelRecommendations()).toBe(recommended);
  expect(calls).toBe(2);
});

// * and the global privacy settings, which opening a chat reads for its gift button
test('asks for the global privacy settings again after a request that failed', async() => {
  const manager = new AppPrivacyManager();
  const settings = {_: 'globalPrivacySettings', pFlags: {}};
  const invokeApi = vi.fn()
  .mockRejectedValueOnce({type: 'NETWORK_BAD_REQUEST'})
  .mockResolvedValue(settings);
  Object.assign(manager as any, {apiManager: {invokeApi}});

  await expect(manager.getGlobalPrivacySettings()).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
  await pause(0);

  expect(await manager.getGlobalPrivacySettings()).toBe(settings);
  expect(invokeApi).toHaveBeenCalledTimes(2);
});

// * and the cloud drafts of other devices, asked for with the first page of the chat list
test('asks for the cloud drafts again after a request that failed', async() => {
  const manager = new AppDraftsManager();
  const invokeApi = vi.fn()
  .mockRejectedValueOnce({type: 'NETWORK_BAD_REQUEST'})
  .mockResolvedValue({_: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0});
  const processUpdateMessage = vi.fn();
  Object.assign(manager as any, {
    drafts: {},
    apiManager: {invokeApi},
    apiUpdatesManager: {updatesState: {}, processUpdateMessage}
  });

  await expect(manager.addMissedDialogs()).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
  await pause(0);

  await manager.addMissedDialogs();
  expect(invokeApi).toHaveBeenCalledTimes(2);
  expect(processUpdateMessage).toHaveBeenCalledTimes(1);
});
