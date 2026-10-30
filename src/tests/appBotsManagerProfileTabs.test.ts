import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import AppBotsManager from '@appManagers/appBotsManager';
import ApiManagerMethods from '@appManagers/apiManagerMethods';
import {ReferencesStorage} from '@lib/storages/references';
import filterMessagesByInputFilter from '@appManagers/utils/messages/filterMessagesByInputFilter';
import {BotPreviewMedia, Message, User, UsersUsers} from '@layer';

vi.mock('@lib/storage', () => ({
  default: class {}
}));

const BOT_ID = 100 as BotId;

function makeBot(id: number): User.user {
  return {_: 'user', id, pFlags: {bot: true}} as User.user;
}

function createManager(results: {[method: string]: () => unknown}) {
  const invokeApiSingleProcess = vi.fn((options: {
    method: string,
    params: unknown,
    processResult: (result: unknown) => unknown
  }) => {
    try {
      return Promise.resolve(options.processResult(results[options.method]()));
    } catch(err) {
      return Promise.reject(err);
    }
  });
  const listeners: {[event: string]: () => void} = {};
  const saveApiUsers = vi.fn();
  const saveMessageMedia = vi.fn();
  const manager = new AppBotsManager();
  Object.assign(manager as any, {
    apiManager: {invokeApiSingleProcess},
    appUsersManager: {
      saveApiUsers,
      getUserInput: (userId: UserId) => ({_: 'inputUser', user_id: userId, access_hash: '0'})
    },
    appMessagesManager: {saveMessageMedia},
    rootScope: {
      addEventListener: (event: string, callback: () => void) => listeners[event] = callback
    },
    getAccountNumber: () => 1
  });
  (manager as any).after();

  return {manager, invokeApiSingleProcess, saveApiUsers, saveMessageMedia, listeners};
}

describe('AppBotsManager.getBotRecommendations', () => {
  const slice: UsersUsers.usersUsersSlice = {
    _: 'users.usersSlice',
    count: 10,
    users: [makeBot(1), makeBot(2)]
  };

  it('asks for the bot, saves the users and keeps the answer', async() => {
    const {manager, invokeApiSingleProcess, saveApiUsers} = createManager({
      'bots.getBotRecommendations': () => slice
    });

    await expect(manager.getBotRecommendations(BOT_ID)).resolves.toBe(slice);
    expect(invokeApiSingleProcess).toHaveBeenCalledWith(expect.objectContaining({
      method: 'bots.getBotRecommendations',
      params: {bot: {_: 'inputUser', user_id: BOT_ID, access_hash: '0'}}
    }));
    expect(saveApiUsers).toHaveBeenCalledWith(slice.users);

    await Promise.resolve();
    expect(manager.getBotRecommendations(BOT_ID)).toBe(slice);
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(1);
  });

  it('joins a request under way', async() => {
    const {manager, invokeApiSingleProcess} = createManager({
      'bots.getBotRecommendations': () => slice
    });

    const first = manager.getBotRecommendations(BOT_ID);
    const second = manager.getBotRecommendations(BOT_ID);
    expect(second).toBe(first);
    await first;
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(1);
  });

  it('asks again once Premium is toggled: how many come depends on it', async() => {
    const {manager, invokeApiSingleProcess, listeners} = createManager({
      'bots.getBotRecommendations': () => slice
    });

    await manager.getBotRecommendations(BOT_ID);
    listeners.premium_toggle();
    await manager.getBotRecommendations(BOT_ID);
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2);
  });

  it('asked after a Premium toggle, does not join a request from before it, whose answer is not kept', async() => {
    const full: UsersUsers.usersUsers = {_: 'users.users', users: [makeBot(1), makeBot(2), makeBot(3)]};
    const answers: ((result: UsersUsers) => void)[] = [];
    const invokeApi = vi.fn(() => new Promise<UsersUsers>((resolve) => answers.push(resolve)));
    const {manager, listeners} = createManager({});
    // * the real one: a request asked for again while it is on its way joins it
    (manager as any).apiManager = {
      invokeApi,
      apiPromisesSingleProcess: {},
      invokeApiSingleProcess: ApiManagerMethods.prototype.invokeApiSingleProcess
    };

    const before = manager.getBotRecommendations(BOT_ID);
    listeners.premium_toggle();
    const after = manager.getBotRecommendations(BOT_ID);
    expect(invokeApi).toHaveBeenCalledTimes(2);

    answers[1](full);
    await expect(after).resolves.toBe(full);
    answers[0](slice);
    await expect(before).resolves.toBe(slice);
    await Promise.resolve();
    expect(manager.getBotRecommendations(BOT_ID)).toBe(full);
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });

  it('does not keep a request that failed', async() => {
    let fail = true;
    const {manager, invokeApiSingleProcess} = createManager({
      'bots.getBotRecommendations': () => {
        if(fail) {
          throw new Error('BOT_INVALID');
        }

        return slice;
      }
    });

    await expect(manager.getBotRecommendations(BOT_ID)).rejects.toThrow('BOT_INVALID');
    await Promise.resolve();
    fail = false;
    await expect(manager.getBotRecommendations(BOT_ID)).resolves.toBe(slice);
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2);
  });
});

describe('AppBotsManager.getPreviewMedias', () => {
  const previews: BotPreviewMedia[] = [{
    _: 'botPreviewMedia',
    date: 1700000000,
    media: {_: 'messageMediaPhoto', pFlags: {}, photo: {_: 'photoEmpty', id: '1'}}
  }, {
    _: 'botPreviewMedia',
    date: 1700000001,
    media: {_: 'messageMediaDocument', pFlags: {}, document: {_: 'documentEmpty', id: '2'}}
  }];

  it('saves every preview media under the bot, so that its file references refresh', async() => {
    const {manager, saveMessageMedia} = createManager({
      'bots.getPreviewMedias': () => previews
    });

    await expect(manager.getPreviewMedias(BOT_ID)).resolves.toBe(previews);
    expect(saveMessageMedia).toHaveBeenCalledTimes(previews.length);
    previews.forEach((preview) => {
      expect(saveMessageMedia).toHaveBeenCalledWith(preview, 'media', {type: 'botPreview', botId: BOT_ID});
    });
  });

  it('keeps the previews, and asks anew when told to', async() => {
    const {manager, invokeApiSingleProcess} = createManager({
      'bots.getPreviewMedias': () => previews
    });

    await manager.getPreviewMedias(BOT_ID);
    await Promise.resolve();
    expect(manager.getPreviewMedias(BOT_ID)).toBe(previews);
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(1);

    await manager.getPreviewMedias(BOT_ID, true);
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2);
  });

  it('does not keep a request that failed: the Preview tab, left unloaded, asks again', async() => {
    let fail = true;
    const {manager, invokeApiSingleProcess} = createManager({
      'bots.getPreviewMedias': () => {
        if(fail) {
          throw new Error('BOT_INVALID');
        }

        return previews;
      }
    });

    await expect(manager.getPreviewMedias(BOT_ID)).rejects.toThrow('BOT_INVALID');
    await Promise.resolve();
    fail = false;
    await expect(manager.getPreviewMedias(BOT_ID)).resolves.toBe(previews);
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2);
  });

  it('is what a preview\'s expired file reference is refreshed by', async() => {
    const getPreviewMedias = vi.fn(() => Promise.resolve(previews));
    const references = new ReferencesStorage();
    Object.assign(references as any, {appBotsManager: {getPreviewMedias}});

    await (references as any).getRefreshPromise({type: 'botPreview', botId: BOT_ID});
    expect(getPreviewMedias).toHaveBeenCalledWith(BOT_ID, true);
  });
});

describe('the GIFs filter', () => {
  const makeMessage = (mid: number, type: string): Message.message => ({
    _: 'message',
    mid,
    pFlags: {},
    media: {_: 'messageMediaDocument', pFlags: {}, document: {_: 'document', id: '' + mid, type}}
  } as any);

  it('keeps only the GIFs', () => {
    const gif = makeMessage(1, 'gif');
    const messages = [gif, makeMessage(2, 'video'), makeMessage(3, 'sticker'), makeMessage(4, undefined)];
    expect(filterMessagesByInputFilter({inputFilter: 'inputMessagesFilterGif', messages, limit: messages.length})).toEqual([gif]);
  });
});
