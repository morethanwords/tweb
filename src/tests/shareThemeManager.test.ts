import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {AppUsersManager} from '@appManagers/appUsersManager';
import ApiManagerMethods from '@appManagers/apiManagerMethods';
import {ShareTheme, ShareThemeBackdropOption, UserFull} from '@layer';

const SELF = 1 as UserId;
const OTHER = 2 as UserId;

const backdrop = (id: number): ShareThemeBackdropOption => ({
  _: 'shareThemeBackdropOption',
  backdrop_id: id,
  name: 'Backdrop ' + id,
  center_color: 0,
  edge_color: 0,
  pattern_color: 0,
  text_color: 0
});

function makeApiManager(invokeApi: (method: string, params: any) => Promise<any>) {
  return {
    hashes: {},
    apiPromisesSingleProcess: {},
    invokeApi: vi.fn(invokeApi),
    // * the real ones: the hash and the single flight are what is tested
    invokeApiHashable: ApiManagerMethods.prototype.invokeApiHashable,
    invokeApiSingleProcess: ApiManagerMethods.prototype.invokeApiSingleProcess
  };
}

function makeProfileManager(invokeApi: (method: string, params: any) => Promise<any>) {
  const manager = new AppProfileManager();
  const dispatchEvent = vi.fn();
  const apiManager = makeApiManager(invokeApi);
  Object.assign(manager as any, {
    apiManager,
    appPeersManager: {
      getInputPeerSelf: () => ({_: 'inputPeerSelf'}),
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerChannel', channel_id: peerId})
    },
    rootScope: {dispatchEvent, myId: SELF.toPeerId(false)}
  });

  (manager as any).usersFull = {
    [SELF]: {_: 'userFull', id: SELF, pFlags: {}} as UserFull.userFull
  };

  return {manager, apiManager, dispatchEvent, getFull: () => (manager as any).usersFull[SELF] as UserFull.userFull};
}

describe('getShareThemeBackdrops', () => {
  it('sends the hash it got and keeps the list on NotModified', async() => {
    const list = [backdrop(1), backdrop(2)];
    let calls = 0;
    const {manager, apiManager} = makeProfileManager(async() => {
      return ++calls === 1 ?
        {_: 'shareThemeBackdrops', hash: 777, backdrops: list} :
        {_: 'shareThemeBackdropsNotModified'};
    });

    expect(await manager.getShareThemeBackdrops()).toEqual(list);
    expect(apiManager.invokeApi.mock.calls[0][1]).toEqual({});

    expect(await manager.getShareThemeBackdrops()).toEqual(list);
    expect(apiManager.invokeApi.mock.calls[1][1]).toEqual({hash: 777});
  });
});

describe('getCachedShareTheme', () => {
  it('is empty without the full peer and the default one without a theme', () => {
    const {manager} = makeProfileManager(async() => true);
    expect(manager.getCachedShareTheme(OTHER.toPeerId(false))).toBeUndefined();
    expect(manager.getCachedShareTheme(SELF.toPeerId(false))).toEqual({_: 'shareThemeDefault'});
  });

  it('returns the theme of the full peer', () => {
    const {manager, getFull} = makeProfileManager(async() => true);
    const theme: ShareTheme = {_: 'shareThemeEmojiBackdrop', flags: 1, backdrop_id: 5};
    getFull().share_theme = theme;
    expect(manager.getCachedShareTheme(SELF.toPeerId(false))).toBe(theme);
  });
});

describe('setShareTheme', () => {
  const theme: ShareTheme = {_: 'shareThemeEmojiBackdrop', flags: 1, backdrop_id: 5};

  it('writes the full peer before the answer, tells the app, and sends the own profile as inputPeerSelf', async() => {
    let seenByRequest: ShareTheme;
    let resolveRequest: (value: boolean) => void;
    const {manager, apiManager, dispatchEvent, getFull} = makeProfileManager(() => {
      seenByRequest = getFull().share_theme;
      return new Promise((resolve) => resolveRequest = resolve);
    });

    const promise = manager.setShareTheme(SELF.toPeerId(false), theme);
    expect(getFull().share_theme).toBe(theme);
    expect(seenByRequest).toBe(theme);
    expect(dispatchEvent).toHaveBeenCalledWith('user_full_update', SELF);

    resolveRequest(true);
    expect(await promise).toBe(true);
    expect(apiManager.invokeApi).toHaveBeenCalledWith('messages.setShareTheme', {
      peer: {_: 'inputPeerSelf'},
      theme
    });
    expect(getFull().share_theme).toBe(theme);
  });

  it('puts the previous theme back and rethrows when the request fails', async() => {
    const previous: ShareTheme = {_: 'shareThemeDefault'};
    const error = {type: 'PEER_PUBLIC_REQUIRED'};
    const {manager, getFull} = makeProfileManager(async() => {
      throw error;
    });

    getFull().share_theme = previous;
    await expect(manager.setShareTheme(SELF.toPeerId(false), theme)).rejects.toBe(error);
    expect(getFull().share_theme).toBe(previous);
  });

  it('removes the field when there was none before', async() => {
    const {manager, getFull} = makeProfileManager(async() => {
      throw new Error('fail');
    });

    await expect(manager.setShareTheme(SELF.toPeerId(false), theme)).rejects.toThrow('fail');
    expect('share_theme' in getFull()).toBe(false);
  });

  it('does not undo a theme something else wrote meanwhile', async() => {
    const later: ShareTheme = {_: 'shareThemeDefault'};
    let fail: (error: Error) => void;
    const {manager, getFull} = makeProfileManager(() => new Promise((_, reject) => fail = reject));

    const promise = manager.setShareTheme(SELF.toPeerId(false), theme);
    getFull().share_theme = later;
    fail(new Error('fail'));
    await expect(promise).rejects.toThrow('fail');
    expect(getFull().share_theme).toBe(later);
  });

  it('goes back to the theme the server has when two choices on their way both fail', async() => {
    const previous: ShareTheme = {_: 'shareThemeDefault'};
    const second: ShareTheme = {_: 'shareThemeEmojiBackdrop', flags: 1, backdrop_id: 6};
    const fails: ((error: Error) => void)[] = [];
    const {manager, getFull} = makeProfileManager(() => new Promise((_, reject) => fails.push(reject)));

    getFull().share_theme = previous;
    const first = manager.setShareTheme(SELF.toPeerId(false), theme);
    const next = manager.setShareTheme(SELF.toPeerId(false), second);
    expect(getFull().share_theme).toBe(second);

    fails[0](new Error('first'));
    await expect(first).rejects.toThrow('first');
    expect(getFull().share_theme).toBe(second);

    fails[1](new Error('second'));
    await expect(next).rejects.toThrow('second');
    expect(getFull().share_theme).toBe(previous);
  });

  it('goes back to an earlier choice the server took when a later one fails', async() => {
    const second: ShareTheme = {_: 'shareThemeEmojiBackdrop', flags: 1, backdrop_id: 6};
    const answers: {resolve: (value: boolean) => void, reject: (error: Error) => void}[] = [];
    const {manager, getFull} = makeProfileManager(() => new Promise((resolve, reject) => answers.push({resolve, reject})));

    getFull().share_theme = {_: 'shareThemeDefault'};
    const first = manager.setShareTheme(SELF.toPeerId(false), theme);
    const next = manager.setShareTheme(SELF.toPeerId(false), second);

    answers[0].resolve(true);
    await first;
    answers[1].reject(new Error('second'));
    await expect(next).rejects.toThrow('second');
    expect(getFull().share_theme).toBe(theme);
  });

  it('shows an earlier choice the server took after a later one failed first', async() => {
    const previous: ShareTheme = {_: 'shareThemeDefault'};
    const second: ShareTheme = {_: 'shareThemeEmojiBackdrop', flags: 1, backdrop_id: 6};
    const answers: {resolve: (value: boolean) => void, reject: (error: Error) => void}[] = [];
    const {manager, getFull} = makeProfileManager(() => new Promise((resolve, reject) => answers.push({resolve, reject})));

    getFull().share_theme = previous;
    const first = manager.setShareTheme(SELF.toPeerId(false), theme);
    const next = manager.setShareTheme(SELF.toPeerId(false), second);

    answers[1].reject(new Error('second'));
    await expect(next).rejects.toThrow('second');
    expect(getFull().share_theme).toBe(previous);

    answers[0].resolve(true);
    await first;
    expect(getFull().share_theme).toBe(theme);
  });

  it('keeps an input gift out of the cache and shows the gift in its place', async() => {
    const gift = {_: 'starGift'} as any;
    const input: ShareTheme = {_: 'inputShareThemeGift', stargift: {_: 'inputSavedStarGiftSlug', slug: 'abc'}};
    const shown: ShareTheme = {_: 'shareThemeGift', stargift: gift};
    const {manager, apiManager, getFull} = makeProfileManager(async() => true);

    await manager.setShareTheme(SELF.toPeerId(false), input, shown);
    expect(getFull().share_theme).toBe(shown);
    expect(apiManager.invokeApi.mock.calls[0][1].theme).toBe(input);
  });

  it('never caches an input gift when no shown theme comes with it', async() => {
    const input: ShareTheme = {_: 'inputShareThemeGift', stargift: {_: 'inputSavedStarGiftSlug', slug: 'abc'}};
    const {manager, getFull} = makeProfileManager(async() => true);

    await manager.setShareTheme(SELF.toPeerId(false), input);
    expect(getFull().share_theme).toBeUndefined();
  });
});

describe('no paid messages token', () => {
  function makeUsersManager(invokeApi: (method: string, params: any) => Promise<any>, fullUser: Partial<UserFull.userFull> = {}) {
    const manager = new AppUsersManager();
    const state: any = {noPaidMessagesToken: null};
    const apiManager = makeApiManager(invokeApi);
    const saveApiUser = vi.fn();
    Object.assign(manager as any, {
      apiManager,
      appStateManager: {
        getState: () => Promise.resolve(state),
        pushToState: vi.fn((key: string, value: any) => {
          state[key] = value;
        })
      },
      appProfileManager: {getProfile: vi.fn(async() => ({_: 'userFull', ...fullUser}))}
    });
    (manager as any).saveApiUser = saveApiUser;
    (manager as any).getUserInput = (id: UserId) => ({_: 'inputUser', user_id: id});
    return {manager, apiManager, saveApiUser, state};
  }

  it('keeps a permanent code and not a temporary one', async() => {
    const {manager} = makeUsersManager(async(_, params) => params.temporary ?
      {_: 'exportedNoPaidMessagesToken', token: 'tmp', url: 'https://t.me/u?free=tmp', expires: 100} :
      {_: 'exportedNoPaidMessagesToken', token: 'perm', url: 'https://t.me/u?free=perm'});

    await manager.exportNoPaidMessagesToken({temporary: true});
    expect(await manager.getKeptNoPaidMessagesToken()).toBeNull();

    await manager.exportNoPaidMessagesToken();
    expect(await manager.getKeptNoPaidMessagesToken()).toEqual({token: 'perm', url: 'https://t.me/u?free=perm', permanent: true});

    await manager.clearKeptNoPaidMessagesToken();
    expect(await manager.getKeptNoPaidMessagesToken()).toBeNull();
  });

  it('drops the kept code when a temporary one revokes it', async() => {
    const {manager, state} = makeUsersManager(async(_, params) => params.temporary ?
      {_: 'exportedNoPaidMessagesToken', token: 'tmp', url: 'u', expires: 100} :
      {_: 'exportedNoPaidMessagesToken', token: 'perm', url: 'u'});

    await manager.exportNoPaidMessagesToken();
    expect(state.noPaidMessagesToken).not.toBeNull();
    await manager.exportNoPaidMessagesToken({temporary: true});
    // the token is kept, it is just not the mode any more
    expect(state.noPaidMessagesToken).toEqual({token: 'perm', url: 'u', permanent: false});
    await manager.exportNoPaidMessagesToken({temporary: true, revoke: true});
    expect(state.noPaidMessagesToken).toBeNull();
  });

  it('sends only the flags that are set', async() => {
    const {manager, apiManager} = makeUsersManager(async() => ({_: 'exportedNoPaidMessagesToken', token: 't', url: 'u'}));
    await manager.exportNoPaidMessagesToken({revoke: true});
    expect(apiManager.invokeApi).toHaveBeenCalledWith('contacts.exportNoPaidMessagesToken', {revoke: true, temporary: undefined});
  });

  it('saves the returned user, reloads the full one and says the fee is gone', async() => {
    const user = {_: 'user', id: OTHER};
    const {manager, apiManager, saveApiUser} = makeUsersManager(async() => user);

    expect(await manager.importNoPaidMessagesToken(OTHER, 'tok')).toBe(true);
    expect(apiManager.invokeApi.mock.calls[0][0]).toBe('contacts.importNoPaidMessagesToken');
    expect(apiManager.invokeApi.mock.calls[0][1]).toEqual({
      user_id: {_: 'inputUser', user_id: OTHER},
      token: 'tok'
    });
    expect(saveApiUser).toHaveBeenCalledWith(user);
    expect((manager as any).appProfileManager.getProfile).toHaveBeenCalledWith(OTHER, true);
  });

  it('says the fee stays when the full user still has one', async() => {
    const {manager} = makeUsersManager(async() => ({_: 'user', id: OTHER}), {send_paid_messages_stars: 10});
    expect(await manager.importNoPaidMessagesToken(OTHER, 'tok')).toBe(false);
  });

  it('joins two imports of the same code', async() => {
    const {manager, apiManager} = makeUsersManager(async() => ({_: 'user', id: OTHER}));
    await Promise.all([manager.importNoPaidMessagesToken(OTHER, 'tok'), manager.importNoPaidMessagesToken(OTHER, 'tok')]);
    expect(apiManager.invokeApi).toHaveBeenCalledTimes(1);
  });
});
