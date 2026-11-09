import {ChatFull, ChatReactions, Message} from '@layer';
import {AppChatsManager} from '@appManagers/appChatsManager';
import {AppReactionsManager} from '@appManagers/appReactionsManager';
import '@helpers/peerIdPolyfill';
import {count, emoji} from '@/tests/helpers/reactions';

const chatId = 100 as ChatId;
const reactions: ChatReactions = {_: 'chatReactionsSome', reactions: [emoji('👍')]};

function setup(invokeApi: ReturnType<typeof vi.fn>) {
  const full = {
    _: 'channelFull',
    pFlags: {paid_reactions_available: true},
    available_reactions: {_: 'chatReactionsNone'},
    reactions_limit: 3
  } as unknown as ChatFull.channelFull;
  const modifyCachedFullChat = vi.fn((_id: ChatId, modify: (f: ChatFull) => void) => modify(full));
  const getChatFull = vi.fn().mockResolvedValue(full);
  const resetAvailableReactions = vi.fn();
  const manager = Object.assign(Object.create(AppChatsManager.prototype), {
    apiManager: {invokeApi},
    appProfileManager: {modifyCachedFullChat, getChatFull},
    appReactionsManager: {resetAvailableReactions},
    apiUpdatesManager: {processUpdateMessage: vi.fn()},
    getInputPeer: () => ({_: 'inputPeerChannel'}),
    onChatUpdated: vi.fn(),
    reactionsSaves: {}
  }) as AppChatsManager;
  return {manager, full, modifyCachedFullChat, getChatFull, resetAvailableReactions, invokeApi};
}

describe('AppChatsManager.setChatAvailableReactions', () => {
  it('omits the limit and paid flag when undefined', async() => {
    const t = setup(vi.fn().mockResolvedValue({_: 'updates'}));
    await t.manager.setChatAvailableReactions(chatId, reactions);
    const params = t.invokeApi.mock.calls[0][1];
    expect('reactions_limit' in params).toBe(false);
    expect('paid_enabled' in params).toBe(false);
    expect(t.full.available_reactions).toEqual(reactions);
    expect(t.full.reactions_limit).toBe(3);
    expect(t.full.pFlags.paid_reactions_available).toBe(true);
  });

  it('sends paid_enabled false explicitly and stores the confirmed values', async() => {
    const t = setup(vi.fn().mockResolvedValue({_: 'updates'}));
    await t.manager.setChatAvailableReactions(chatId, reactions, {reactionsLimit: 7, paidEnabled: false});
    expect(t.invokeApi.mock.calls[0][1]).toMatchObject({reactions_limit: 7, paid_enabled: false});
    expect(t.full.reactions_limit).toBe(7);
    expect(t.full.pFlags.paid_reactions_available).toBeUndefined();
  });

  it('leaves the cache alone before the answer and on an error, and passes the error on', async() => {
    const error = {type: 'BOOSTS_REQUIRED'};
    const t = setup(vi.fn().mockRejectedValue(error));
    await expect(t.manager.setChatAvailableReactions(chatId, reactions, {reactionsLimit: 7})).rejects.toBe(error);
    expect(t.modifyCachedFullChat).not.toHaveBeenCalled();
    expect(t.full.reactions_limit).toBe(3);
    expect(t.resetAvailableReactions).not.toHaveBeenCalled();
  });

  it('treats CHAT_NOT_MODIFIED as success', async() => {
    const t = setup(vi.fn().mockRejectedValue({type: 'CHAT_NOT_MODIFIED'}));
    await expect(t.manager.setChatAvailableReactions(chatId, reactions, {reactionsLimit: 5})).resolves.toBeUndefined();
    expect(t.full.available_reactions).toEqual(reactions);
    expect(t.full.reactions_limit).toBe(5);
  });

  it('refreshes the full chat and the catalog on REACTION_INVALID, then rejects', async() => {
    const error = {type: 'REACTION_INVALID'};
    const t = setup(vi.fn().mockRejectedValue(error));
    await expect(t.manager.setChatAvailableReactions(chatId, reactions)).rejects.toBe(error);
    expect(t.getChatFull).toHaveBeenCalledWith(chatId, true);
    expect(t.resetAvailableReactions).toHaveBeenCalledOnce();
    expect(t.modifyCachedFullChat).not.toHaveBeenCalled();
  });
});

describe('AppChatsManager.setChatAvailableReactions, overlapping saves', () => {
  test.each([
    ['an older answer that comes after a newer one does not overwrite it', {reactionsLimit: 3}, {reactionsLimit: 7}, 7],
    ['an older answer keeps its limit when the newer save did not carry one', {reactionsLimit: 7}, undefined, 7]
  ])('%s', async(_name, olderOptions, newerOptions, expectedLimit) => {
    const answers: Array<(value: unknown) => void> = [];
    const invokeApi = vi.fn(() => new Promise((resolve) => answers.push(resolve)));
    const t = setup(invokeApi);
    const older: ChatReactions = {_: 'chatReactionsSome', reactions: [emoji('👍')]};
    const newer: ChatReactions = {_: 'chatReactionsSome', reactions: [emoji('🔥')]};

    const first = t.manager.setChatAvailableReactions(chatId, older, olderOptions);
    const second = t.manager.setChatAvailableReactions(chatId, newer, newerOptions);
    answers[1]({_: 'updates'});
    await second;
    answers[0]({_: 'updates'});
    await first;

    expect(t.full.available_reactions).toEqual(newer);
    expect(t.full.reactions_limit).toBe(expectedLimit);
  });

  test('a slow REACTION_INVALID refresh of an older save does not bring back an older snapshot', async() => {
    const error = {type: 'REACTION_INVALID'};
    const answers: Array<{resolve: (v: unknown) => void, reject: (e: unknown) => void}> = [];
    const invokeApi = vi.fn(() => new Promise((resolve, reject) => answers.push({resolve, reject})));
    const t = setup(invokeApi);
    let finishRefresh: () => void;
    t.getChatFull.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishRefresh = () => {
        // the older server snapshot replaces the cached chat
        t.full.available_reactions = {_: 'chatReactionsNone'};
        t.full.reactions_limit = 3;
        resolve();
      };
    }));
    const newer: ChatReactions = {_: 'chatReactionsSome', reactions: [emoji('🔥')]};

    const first = t.manager.setChatAvailableReactions(chatId, reactions, {reactionsLimit: 5});
    const second = t.manager.setChatAvailableReactions(chatId, newer, {reactionsLimit: 7});
    answers[0].reject(error);
    await Promise.resolve();
    await Promise.resolve();
    answers[1].resolve({_: 'updates'});
    await second;
    finishRefresh();
    await expect(first).rejects.toBe(error);

    expect(t.full.available_reactions).toEqual(newer);
    expect(t.full.reactions_limit).toBe(7);
  });

  test('a REACTION_INVALID refresh replays only the fields a save advanced meanwhile', async() => {
    const error = {type: 'REACTION_INVALID'};
    const answers: Array<{resolve: (v: unknown) => void, reject: (e: unknown) => void}> = [];
    const invokeApi = vi.fn(() => new Promise((resolve, reject) => answers.push({resolve, reject})));
    const t = setup(invokeApi);
    let finishRefresh: () => void;
    const newer: ChatReactions = {_: 'chatReactionsSome', reactions: [emoji('🔥')]};

    const old = t.manager.setChatAvailableReactions(chatId, reactions, {reactionsLimit: 5});
    answers[0].resolve({_: 'updates'});
    await old;
    expect(t.full.reactions_limit).toBe(5);

    t.getChatFull.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishRefresh = () => {
        // another client set the limit
        t.full.available_reactions = {_: 'chatReactionsNone'};
        t.full.reactions_limit = 8;
        resolve();
      };
    }));
    const failing = t.manager.setChatAvailableReactions(chatId, reactions);
    answers[1].reject(error);
    await Promise.resolve();
    await Promise.resolve();
    const omitting = t.manager.setChatAvailableReactions(chatId, newer);
    answers[2].resolve({_: 'updates'});
    await omitting;
    finishRefresh();
    await expect(failing).rejects.toBe(error);

    expect(t.full.available_reactions).toEqual(newer);
    expect(t.full.reactions_limit).toBe(8);
  });
});

describe('AppReactionsManager per-chat cap through getAvailableReactionsByMessage', () => {
  const channelPeerId = (200 as ChatId).toPeerId(true);
  const groupPeerId = (300 as ChatId).toPeerId(true);
  const results = ['a', 'b', 'c'].map((emoticon) => count(emoji(emoticon)));
  const offered = [...'abcz'].map(emoji);

  function make(limits: Record<string, number | undefined>, configMax?: number) {
    const asked: PeerId[] = [];
    const manager = Object.assign(Object.create(AppReactionsManager.prototype), {
      appPeersManager: {peerId: 1, isMegagroup: (id: PeerId) => id === groupPeerId},
      apiManager: {getAppConfig: () => Promise.resolve({reactions_uniq_max: configMax})},
      getAvailableReactionsForPeer: (peerId: PeerId) => {
        asked.push(peerId);
        return Promise.resolve({type: 'chatReactionsSome', reactions: offered.slice(), reactionsLimit: limits[peerId]});
      }
    }) as AppReactionsManager;
    return {manager, asked};
  }
  const msg = (extra: Partial<Message.message>) => ({_: 'message', peerId: groupPeerId, reactions: {_: 'messageReactions', pFlags: {}, results}, ...extra}) as Message.message;

  it('uses the chat limit, falling back to the app config', async() => {
    const limited = make({[groupPeerId]: 3}, 11);
    expect((await limited.manager.getAvailableReactionsByMessage(msg({}))).atUniqCap).toBe(true);
    const fallback = make({}, 11);
    expect((await fallback.manager.getAvailableReactionsByMessage(msg({}))).atUniqCap).toBe(false);
    const fallback2 = make({}, 3);
    expect((await fallback2.manager.getAvailableReactionsByMessage(msg({}))).atUniqCap).toBe(true);
  });

  it('uses the originating channel for an automatic forward in a discussion group', async() => {
    const t = make({[channelPeerId]: 3, [groupPeerId]: 20}, 11);
    const result = await t.manager.getAvailableReactionsByMessage(msg({
      fwd_from: {channel_post: 5} as Message.message['fwd_from'],
      fromId: channelPeerId,
      fwdFromId: channelPeerId
    } as Partial<Message.message>));
    expect(t.asked).toEqual([channelPeerId]);
    expect(result.atUniqCap).toBe(true);
    expect(result.reactions.map((r) => (r as any).emoticon)).toEqual(['a', 'b', 'c']);
  });
});
