/*
 * Setting a private chat's theme (messages.setChatTheme) the way tdesktop and Android do: applied
 * to the cached full user at once, the chat's own wallpaper dropped, and a gift — a theme of one
 * chat at a time — moved off the chat it was the theme of. The gifts that can be a theme come
 * paged from account.getUniqueGiftChatThemes, the hash describing the list from its start.
 */
import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {ChatTheme, StarGift, UserFull, WallPaper} from '@layer';
import AppThemesManager from '@appManagers/appThemesManager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import setBooleanFlag from '@helpers/object/setBooleanFlag';
import KeyedQueue from '@appManagers/utils/keyedQueue';

const ME = 1;
const ALICE = 2;
const BOB = 3;
const CAROL = 4;

const gift = (slug: string, themePeer?: PeerId): StarGift.starGiftUnique => ({
  _: 'starGiftUnique',
  pFlags: {theme_available: true},
  id: slug,
  gift_id: 1,
  title: 'Cake',
  slug,
  num: 1,
  attributes: [],
  availability_issued: 1,
  availability_total: 1,
  theme_peer: themePeer ? {_: 'peerUser', user_id: themePeer} : undefined
});

const giftTheme = (slug: string, themePeer?: PeerId, withSettings = true): ChatTheme.chatThemeUniqueGift => ({
  _: 'chatThemeUniqueGift',
  gift: gift(slug, themePeer),
  theme_settings: withSettings ? [{_: 'themeSettings', pFlags: {}, base_theme: {_: 'baseThemeClassic'}, accent_color: 1}] : []
});

function makeManager(options: {
  fullUsers?: {[userId: number]: Partial<UserFull.userFull>},
  pages?: {[offset: string]: any},
  setChatTheme?: () => Promise<any>,
  setChatWallPaper?: () => Promise<any>
} = {}) {
  const manager = new AppThemesManager();
  const fullUsers = options.fullUsers || {};
  const calls: {method: string, params: any}[] = [];
  const updates: any[] = [];
  const refreshed: PeerId[] = [];
  const wallPaperRevisions: {[peerId: PeerId]: number} = {};

  const invoke = (method: string, params: any) => {
    calls.push({method, params});
    if(method === 'messages.setChatTheme' && options.setChatTheme) {
      return options.setChatTheme();
    }

    if(method === 'messages.setChatWallPaper' && options.setChatWallPaper) {
      return options.setChatWallPaper();
    }

    if(method === 'account.getUniqueGiftChatThemes') {
      return Promise.resolve(options.pages[params.offset]);
    }

    return Promise.resolve({_: 'updates', method});
  };

  Object.assign(manager as any, {
    wallPapers: {},
    wallPapersBySlug: {},
    chatBackgroundQueues: new KeyedQueue(),
    apiManager: {
      invokeApi: vi.fn(invoke),
      invokeApiSingleProcess: vi.fn(({method, params, processResult}) => invoke(method, params).then(processResult))
    },
    apiUpdatesManager: {processUpdateMessage: (update: any) => updates.push(update)},
    appDocsManager: {saveDoc: (doc: any) => doc},
    appGiftsManager: {wrapGift: (gift: StarGift) => ({type: 'stargift', raw: gift})},
    appPeersManager: {
      saveApiPeers: () => {},
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerUser', user_id: peerId}),
      getOutputPeer: (peerId: PeerId) => ({_: 'peerUser', user_id: peerId})
    },
    appProfileManager: {
      getChatWallPaperRevision: (peerId: PeerId) => wallPaperRevisions[peerId] ?? 0,
      modifyCachedFullUser: (userId: number, modify: (userFull: any) => boolean | void) => {
        if(fullUsers[userId]) modify(fullUsers[userId]);
      },
      setCachedChatWallPaper: (peerId: PeerId, wallPaper: WallPaper, overridden?: boolean) => {
        wallPaperRevisions[peerId] = (wallPaperRevisions[peerId] ?? 0) + 1;
        const userFull = fullUsers[peerId.toUserId() as number];
        if(!userFull) return;
        if(wallPaper) userFull.wallpaper = manager.saveWallPaper(wallPaper);
        else delete userFull.wallpaper;
        setBooleanFlag(userFull.pFlags ??= {}, 'wallpaper_overridden', !!overridden);
      },
      refreshFullPeer: (peerId: PeerId) => Promise.resolve(refreshed.push(peerId))
    }
  });

  return {manager, fullUsers, calls, updates, refreshed};
}

const setThemeCall = (calls: {method: string, params: any}[]) => calls.find((call) => call.method === 'messages.setChatTheme')?.params;

describe('AppThemesManager.setChatTheme', () => {
  it('asks for each kind of theme with its own input', async() => {
    const {manager, calls} = makeManager();
    await manager.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'});
    await manager.setChatTheme(ALICE.toPeerId(false), giftTheme('Cake-1'));
    await manager.setChatTheme(ALICE.toPeerId(false));
    await manager.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: ''});

    expect(calls.filter((call) => call.method === 'messages.setChatTheme').map((call) => call.params)).toEqual([
      {peer: {_: 'inputPeerUser', user_id: ALICE}, theme: {_: 'inputChatTheme', emoticon: '🎄'}},
      {peer: {_: 'inputPeerUser', user_id: ALICE}, theme: {_: 'inputChatThemeUniqueGift', slug: 'Cake-1'}},
      {peer: {_: 'inputPeerUser', user_id: ALICE}, theme: {_: 'inputChatThemeEmpty'}},
      {peer: {_: 'inputPeerUser', user_id: ALICE}, theme: {_: 'inputChatThemeEmpty'}}
    ]);
  });

  it('applies the theme to the chat before the server answers and hands the updates on', async() => {
    let answer: (value: any) => void;
    let hold = true;
    const {manager, fullUsers, updates} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull'} as any},
      setChatTheme: () => hold ? new Promise((resolve) => answer = resolve) : Promise.resolve({_: 'updates'})
    });

    const promise = manager.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'});
    expect(fullUsers[ALICE].theme).toEqual({_: 'chatTheme', emoticon: '🎄'});

    hold = false;
    answer({_: 'updates', answer: true});
    await promise;
    expect(updates).toContainEqual({_: 'updates', answer: true});

    await manager.setChatTheme(ALICE.toPeerId(false));
    expect(fullUsers[ALICE].theme).toBeUndefined();
  });

  it('drops the chat\'s own wallpaper, which would cover the theme', async() => {
    const {manager, fullUsers, calls} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull', wallpaper: {_: 'wallPaperNoFile', id: 1}} as any, [BOB]: {_: 'userFull'} as any}
    });

    await manager.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'});
    expect(fullUsers[ALICE].wallpaper).toBeUndefined();
    expect(calls).toContainEqual({method: 'messages.setChatWallPaper', params: {peer: {_: 'inputPeerUser', user_id: ALICE}}});

    // * a chat known to have no wallpaper is left alone
    calls.length = 0;
    await manager.setChatTheme(BOB.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'});
    expect(calls.map((call) => call.method)).toEqual(['messages.setChatTheme']);

    // * one not known at all is asked anyway, as tdesktop always does
    calls.length = 0;
    await manager.setChatTheme(CAROL.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'});
    expect(calls.map((call) => call.method)).toEqual(['messages.setChatTheme', 'messages.setChatWallPaper']);
  });

  it('leaves a wallpaper set while the theme was on its way', async() => {
    let answer: (value: any) => void;
    const {manager, fullUsers, calls} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull', pFlags: {}, wallpaper: {_: 'wallPaperNoFile', id: 1}} as any},
      setChatTheme: () => new Promise((resolve) => answer = resolve)
    });

    const promise = manager.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'});
    // * asked for after the theme, so sent after it
    const wallPaperSet = manager.setChatWallPaper(ALICE.toPeerId(false), {wallPaper: {_: 'wallPaperNoFile', id: 2, pFlags: {}} as any});
    answer({_: 'updates'});
    await Promise.all([promise, wallPaperSet]);

    expect(calls.map((call) => call.method)).toEqual(['messages.setChatTheme', 'messages.setChatWallPaper']);
    expect(calls[1].params).toMatchObject({wallpaper: {_: 'inputWallPaperNoFile', id: 2}});
    expect(fullUsers[ALICE].wallpaper).toMatchObject({id: 2});
  });

  it('drops a wallpaper asked for just before the theme once the theme is set, its answer taken for no newer one', async() => {
    let answerWallPaper: (value: any) => void;
    const {manager, calls} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull', pFlags: {}} as any},
      setChatWallPaper: () => {
        const first = calls.filter((call) => call.method === 'messages.setChatWallPaper').length === 1;
        return first ? new Promise((resolve) => answerWallPaper = resolve) : Promise.resolve({_: 'updates'});
      }
    });

    const wallPaperSet = manager.setChatWallPaper(ALICE.toPeerId(false), {wallPaper: {_: 'wallPaperNoFile', id: 2, pFlags: {}} as any});
    const themeSet = manager.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'});
    // * the theme waits for the wallpaper's answer, whose service message puts the wallpaper in the chat again
    expect(calls.map((call) => call.method)).toEqual(['messages.setChatWallPaper']);
    (manager as any).appProfileManager.setCachedChatWallPaper(ALICE.toPeerId(false), {_: 'wallPaperNoFile', id: 2, pFlags: {}});
    answerWallPaper({_: 'updates'});
    await Promise.all([wallPaperSet, themeSet]);

    expect(calls.map((call) => call.method)).toEqual(['messages.setChatWallPaper', 'messages.setChatTheme', 'messages.setChatWallPaper']);
    expect(calls[2].params).toEqual({peer: {_: 'inputPeerUser', user_id: ALICE}});
  });

  it('leaves a wallpaper that came with the updates while the theme was on its way', async() => {
    let answer: (value: any) => void;
    const {manager, fullUsers, calls} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull', pFlags: {}, wallpaper: {_: 'wallPaperNoFile', id: 1}} as any},
      setChatTheme: () => new Promise((resolve) => answer = resolve)
    });

    const promise = manager.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'});
    // * the other side sets one for both meanwhile
    (manager as any).appProfileManager.setCachedChatWallPaper(ALICE.toPeerId(false), {_: 'wallPaperNoFile', id: 3, pFlags: {}}, true);
    answer({_: 'updates'});
    await promise;

    expect(calls.map((call) => call.method)).toEqual(['messages.setChatTheme']);
    expect(fullUsers[ALICE].wallpaper).toMatchObject({id: 3});
  });

  it('puts the wallpaper the server still has back when it refuses to drop it', async() => {
    const {manager, refreshed} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull', pFlags: {}, wallpaper: {_: 'wallPaperNoFile', id: 1}} as any},
      setChatWallPaper: () => Promise.reject({type: 'FLOOD_WAIT_120'})
    });

    await manager.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'});
    await new Promise((resolve) => setTimeout(resolve));
    expect(refreshed).toEqual([ALICE.toPeerId(false)]);
  });

  it('takes a gift off the chat it was the theme of', async() => {
    const {manager, fullUsers} = makeManager({
      fullUsers: {
        [ALICE]: {_: 'userFull', theme: giftTheme('Cake-1')} as any,
        [BOB]: {_: 'userFull', theme: giftTheme('Cake-2')} as any
      },
      pages: {'': {_: 'account.chatThemes', hash: 1, themes: [giftTheme('Cake-1', ALICE), giftTheme('Cake-2', BOB)], chats: [], users: []}}
    });
    await manager.getUniqueGiftChatThemes();

    await manager.setChatTheme(BOB.toPeerId(false), giftTheme('Cake-1', ALICE));
    expect(fullUsers[ALICE].theme).toBeUndefined();
    expect((fullUsers[BOB].theme as ChatTheme.chatThemeUniqueGift).gift).toMatchObject({slug: 'Cake-1'});

    const {themes} = await manager.getUniqueGiftChatThemes();
    const themePeers = themes.map((theme) => {
      const {slug, theme_peer} = theme.gift as StarGift.starGiftUnique;
      return [slug, theme_peer && getPeerId(theme_peer)];
    });
    expect(themePeers).toEqual([
      ['Cake-1', BOB],
      ['Cake-2', undefined]
    ]);
  });

  it('leaves a gift with no theme settings to the service message', async() => {
    const {manager, fullUsers, calls} = makeManager({fullUsers: {[ALICE]: {_: 'userFull'} as any}});
    await manager.setChatTheme(ALICE.toPeerId(false), giftTheme('Cake-1', undefined, false));
    expect(fullUsers[ALICE].theme).toBeUndefined();
    expect(setThemeCall(calls)).toMatchObject({theme: {_: 'inputChatThemeUniqueGift', slug: 'Cake-1'}});
  });

  it('puts back what the server has when it refuses, in the chat the gift was taken from too', async() => {
    const {manager, refreshed} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull'} as any, [BOB]: {_: 'userFull', theme: giftTheme('Cake-1')} as any},
      setChatTheme: () => Promise.reject({type: 'THEME_INVALID'})
    });

    await expect(manager.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'})).rejects.toEqual({type: 'THEME_INVALID'});
    expect(refreshed).toEqual([ALICE.toPeerId(false)]);

    // * the chat's wallpaper is not asked to go for a theme the server did not take
    const {manager: withWallPaper, calls} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull', wallpaper: {_: 'wallPaperNoFile', id: 1}} as any},
      setChatTheme: () => Promise.reject({type: 'THEME_INVALID'})
    });
    await expect(withWallPaper.setChatTheme(ALICE.toPeerId(false), {_: 'chatTheme', emoticon: '🎄'})).rejects.toEqual({type: 'THEME_INVALID'});
    expect(calls.map((call) => call.method)).toEqual(['messages.setChatTheme']);

    refreshed.length = 0;
    await expect(manager.setChatTheme(ALICE.toPeerId(false), giftTheme('Cake-1', BOB))).rejects.toEqual({type: 'THEME_INVALID'});
    expect(refreshed).toEqual([ALICE.toPeerId(false), BOB.toPeerId(false)]);
  });
});

const paper = (id: number): any => ({
  _: 'wallPaper',
  id,
  access_hash: id * 10,
  slug: 'paper-' + id,
  pFlags: {},
  settings: {_: 'wallPaperSettings', pFlags: {blur: true}, intensity: 30}
});

describe('AppThemesManager.setChatWallPaper', () => {
  const wallPaperCall = (calls: {method: string, params: any}[]) => calls.find((call) => call.method === 'messages.setChatWallPaper')?.params;

  it('sets one for this side, or for both, with its settings, and shows it in the chat at once', async() => {
    const {manager, fullUsers, calls} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull', pFlags: {wallpaper_overridden: true}} as any}
    });

    await manager.setChatWallPaper(ALICE.toPeerId(false), {wallPaper: paper(7)});
    expect(wallPaperCall(calls)).toEqual({
      peer: {_: 'inputPeerUser', user_id: ALICE},
      wallpaper: {_: 'inputWallPaper', id: 7, access_hash: 70},
      settings: {_: 'wallPaperSettings', pFlags: {blur: true}, intensity: 30},
      for_both: undefined
    });
    expect(fullUsers[ALICE].wallpaper).toMatchObject({id: 7});
    // * this side's own now, not the other side's
    expect(fullUsers[ALICE].pFlags.wallpaper_overridden).toBeUndefined();

    calls.length = 0;
    await manager.setChatWallPaper(ALICE.toPeerId(false), {wallPaper: paper(8), forBoth: true});
    expect(wallPaperCall(calls)).toMatchObject({for_both: true, wallpaper: {id: 8}});
  });

  it('takes the other side\'s by its message, and drops or reverts the chat\'s', async() => {
    const {manager, fullUsers, calls, refreshed} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull', pFlags: {}, wallpaper: paper(7)} as any}
    });

    await manager.setChatWallPaper(ALICE.toPeerId(false), {wallPaper: paper(9), fromMessageId: 4242});
    expect(wallPaperCall(calls)).toEqual({
      peer: {_: 'inputPeerUser', user_id: ALICE},
      id: 4242,
      settings: {_: 'wallPaperSettings', pFlags: {blur: true}, intensity: 30}
    });

    calls.length = 0;
    await manager.setChatWallPaper(ALICE.toPeerId(false));
    expect(wallPaperCall(calls)).toEqual({peer: {_: 'inputPeerUser', user_id: ALICE}});
    expect(fullUsers[ALICE].wallpaper).toBeUndefined();

    // * which one this side had before is the server's to say
    calls.length = 0;
    await manager.setChatWallPaper(ALICE.toPeerId(false), {revert: true});
    expect(wallPaperCall(calls)).toEqual({peer: {_: 'inputPeerUser', user_id: ALICE}, revert: true});
    expect(refreshed).toEqual([ALICE.toPeerId(false)]);
  });

  it('lets the chat\'s next change go only once what the server has is fetched again after a refusal', async() => {
    let refused = true;
    const {manager, calls} = makeManager({
      fullUsers: {[ALICE]: {_: 'userFull'} as any},
      setChatWallPaper: () => refused ? Promise.reject({type: 'PEER_ID_INVALID'}) : Promise.resolve({_: 'updates'})
    });
    // * its answer would undo the next change, coming after it
    let refetched: () => void;
    (manager as any).appProfileManager.refreshFullPeer = () => new Promise<void>((resolve) => refetched = resolve);

    const first = manager.setChatWallPaper(ALICE.toPeerId(false), {wallPaper: paper(1)}).catch((err) => err);
    const next = manager.setChatWallPaper(ALICE.toPeerId(false), {wallPaper: paper(2)});
    await vi.waitFor(() => expect(refetched).toBeDefined());
    refused = false;
    expect(calls.filter((call) => call.method === 'messages.setChatWallPaper')).toHaveLength(1);

    refetched();
    expect(await first).toEqual({type: 'PEER_ID_INVALID'});
    await next;
    expect(calls.filter((call) => call.method === 'messages.setChatWallPaper').map((call) => call.params.wallpaper.id)).toEqual([1, 2]);
  });
});

describe('AppThemesManager.getUniqueGiftChatThemes', () => {
  it('pages through the gifts and checks the start of the list against its hash', async() => {
    const pages: {[offset: string]: any} = {
      '': {_: 'account.chatThemes', hash: 7, themes: [giftTheme('Cake-1'), {_: 'chatTheme', emoticon: '🎄'}], chats: [], users: [], next_offset: 'n1'},
      'n1': {_: 'account.chatThemes', hash: 8, themes: [giftTheme('Cake-2')], chats: [], users: []}
    };
    const {manager, calls} = makeManager({pages});
    const slugs = (result: Awaited<ReturnType<typeof manager.getUniqueGiftChatThemes>>) =>
      result.themes.map((theme) => (theme.gift as StarGift.starGiftUnique).slug);

    const first = await manager.getUniqueGiftChatThemes();
    expect(slugs(first)).toEqual(['Cake-1']);
    expect(first.hasMore).toBe(true);

    const more = await manager.getUniqueGiftChatThemes(true);
    expect(slugs(more)).toEqual(['Cake-1', 'Cake-2']);
    expect(more.hasMore).toBe(false);

    // * nothing more to ask for
    await manager.getUniqueGiftChatThemes(true);

    pages[''] = {_: 'account.chatThemesNotModified'};
    const again = await manager.getUniqueGiftChatThemes();
    expect(slugs(again)).toEqual(['Cake-1', 'Cake-2']);

    expect(calls.map((call) => call.params)).toEqual([
      {offset: '', limit: 24, hash: 0},
      {offset: 'n1', limit: 24, hash: 0},
      {offset: '', limit: 24, hash: 7}
    ]);
  });

  it('asks for the whole list again when the one its hash came from was let go meanwhile', async() => {
    let release: () => void;
    const answers: (() => any)[] = [
      () => ({_: 'account.chatThemes', hash: 7, themes: [giftTheme('Cake-1')], chats: [], users: []}),
      () => new Promise((resolve) => release = () => resolve({_: 'account.chatThemesNotModified'})),
      () => ({_: 'account.chatThemes', hash: 8, themes: [giftTheme('Cake-2')], chats: [], users: []})
    ];
    const pages = {get ''() {
      return answers.shift()();
    }};
    const {manager, calls} = makeManager({
      pages,
      fullUsers: {[ALICE]: {_: 'userFull'} as any},
      setChatTheme: () => Promise.reject({type: 'THEME_INVALID'})
    });

    await manager.getUniqueGiftChatThemes();
    const checked = manager.getUniqueGiftChatThemes();
    // * a theme the server refuses lets the list go
    await manager.setChatTheme(ALICE.toPeerId(false), giftTheme('Cake-1')).catch(() => {});
    release();

    expect((await checked).themes.map((theme) => (theme.gift as StarGift.starGiftUnique).slug)).toEqual(['Cake-2']);
    expect(calls.filter((call) => call.method === 'account.getUniqueGiftChatThemes').map((call) => call.params.hash)).toEqual([0, 7, 0]);
  });

  it('leaves a list fetched anew alone when a page asked after the older one comes later', async() => {
    let release: () => void;
    const firstPages: (() => any)[] = [
      () => ({_: 'account.chatThemes', hash: 7, themes: [giftTheme('Cake-1')], chats: [] as any[], users: [] as any[], next_offset: 'n1'}),
      () => ({_: 'account.chatThemes', hash: 9, themes: [giftTheme('Cake-3')], chats: [] as any[], users: [] as any[]})
    ];
    const pages = {
      get ''() {
        return firstPages.shift()();
      },
      'n1': new Promise((resolve) => release = () => resolve({_: 'account.chatThemes', hash: 8, themes: [giftTheme('Cake-2')], chats: [], users: []}))
    };
    const {manager} = makeManager({pages});
    const slugs = (result: Awaited<ReturnType<typeof manager.getUniqueGiftChatThemes>>) =>
      result.themes.map((theme) => (theme.gift as StarGift.starGiftUnique).slug);

    await manager.getUniqueGiftChatThemes();
    const more = manager.getUniqueGiftChatThemes(true);
    // * another tab's picker asks for the start of the list meanwhile, which has changed
    expect(slugs(await manager.getUniqueGiftChatThemes())).toEqual(['Cake-3']);
    release();

    expect(await more).toEqual({themes: [expect.objectContaining({gift: expect.objectContaining({slug: 'Cake-3'})})], hasMore: false});
    expect(slugs(await manager.getUniqueGiftChatThemes(true))).toEqual(['Cake-3']);
  });
});
