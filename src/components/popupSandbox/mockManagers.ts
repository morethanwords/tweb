/*
 * A network-free stand-in for `rootScope.managers`.
 *
 * The real managers proxy forwards every call over a MessagePort into the shared worker, which owns
 * the MTProto connection. This one resolves each call from a plain lookup table instead, so a popup
 * can be opened, rendered and driven with no worker, no auth and no socket.
 *
 * Anything a story does not describe resolves to `undefined` and is recorded in `unhandled` — the
 * sandbox surfaces that list, so "this popup renders empty" points straight at the call to fill in.
 */

import type {AppManagers} from '@lib/managers';
import {SETTINGS_INIT, STATE_INIT} from '@config/state';
import {
  boostsStatus,
  contactPeerIds,
  dialogs,
  messages,
  myStarGift,
  myUniqueStarGift,
  peers,
  premiumPromo,
  selfUser,
  starGiftUpgradePreview,
  starGiftValueInfo,
  starsAmount,
  NOW,
  SELF_PEER_ID,
  SELF_USER_ID
} from './fixtures';

export type ManagerHandler = (...args: any[]) => any;
export type ManagerHandlers = {[managerName: string]: {[method: string]: ManagerHandler}};

export type ManagerCall = {
  manager: string,
  method: string,
  args: any[],
  handled: boolean
};

export const mockAppConfig = {
  premium_purchase_blocked: false,
  stars_purchase_blocked: false,
  stars_gifts_enabled: true,
  caption_length_limit_default: 1024,
  caption_length_limit_premium: 2048,
  poll_answers_max: 10,
  poll_close_period_max: 600,
  poll_countries_max: 10,
  todo_items_max: 30,
  todo_item_length_max: 64,
  giveaway_add_peers_max: 10,
  giveaway_boosts_per_premium: 4,
  giveaway_countries_max: 10,
  giveaway_period_max: 604800,
  boosts_per_sent_gift: 3,
  stories_stealth_future_period: 1500,
  stories_stealth_past_period: 300,
  stargifts_message_length_max: 255,
  stargifts_convert_period_max: 7776000,
  stars_paid_post_amount_max: 10000,
  stars_paid_reaction_amount_max: 2500,
  stars_usd_sell_rate_x1000: 1300,
  stars_stargift_resale_amount_min: 125,
  stars_stargift_resale_amount_max: 100000,
  stars_stargift_resale_commission_permille: 800,
  ton_stargift_resale_amount_min: 10000000,
  ton_stargift_resale_amount_max: 10000000000,
  ton_stargift_resale_commission_permille: 800,
  ton_usd_rate: 3,
  ton_topup_url: 'https://fragment.com/',
  stars_spend_topup_invoice_disabled: false,
  aicompose_tone_examples_num: 3,
  aicompose_tone_prompt_length_max: 256,
  aicompose_tone_title_length_max: 32,
  aicompose_tone_saved_limit_default: 3,
  aicompose_tone_saved_limit_premium: 10,
  premium_promo_order: ['stories', 'double_limits', 'more_upload', 'faster_download'],
  verify_age_bot_username: 'sandbox_bot',
  verify_age_country: 'GB',
  freeze_appeal_url: 'https://t.me/spambot',
  freeze_since_date: 0,
  freeze_until_date: 1719792000 // 2024-07-01, so the frozen popup renders a real date
} as any as MTAppConfig;

/** What every limit reports. Stories that care about a specific one override `getLimit`. */
export const MOCK_LIMIT = 10;
export const MOCK_PREMIUM_LIMIT = 20;

/**
 * Defaults broad enough that a popup which only needs "who am I / what is configured" renders on its
 * own. Everything peer-shaped reads the same fixtures the mirrors are seeded from, so a story never
 * has to keep two copies of a peer in sync.
 */
const makeStarsStatus = (balance: typeof starsAmount) => ({
  _: 'payments.starsStatus',
  balance,
  history: [] as any[],
  subscriptions: [] as any[],
  chats: [] as any[],
  users: [] as any[]
});

function createDefaultHandlers(): ManagerHandlers {
  const peerOf = (peerId: PeerId) => peers[peerId];

  return {
    apiManager: {
      getAppConfig: () => mockAppConfig,
      getConfig: () => ({_: 'config', test_mode: true, this_dc: 2, date: NOW, message_length_max: 4096, caption_length_max: 1024}),
      getLimit: (_type: string, isPremium?: boolean) => (isPremium ? MOCK_PREMIUM_LIMIT : MOCK_LIMIT),
      getAccountNumber: () => 1,
      setThemeParams: () => undefined
    },
    appStateManager: {
      getState: () => ({...STATE_INIT, settings: SETTINGS_INIT}),
      setByKey: () => undefined,
      pushToState: () => undefined
    },
    appUsersManager: {
      getSelf: () => selfUser,
      getUser: (userId: UserId) => peerOf(userId.toPeerId(false)),
      getUserInput: (userId: UserId) => ({_: 'inputUser', user_id: userId, access_hash: '0'}),
      isUserOnlineVisible: () => true,
      getUserStatus: () => ({_: 'userStatusOffline', was_online: 0}),
      getContactsPeerIds: () => contactPeerIds.slice(),
      searchContacts: () => ({my_results: [], results: [], chats: [], users: []}),
      testSelfSearch: () => false,
      isNonContactUser: () => false,
      getRequirementToContact: () => ({_: 'requirementToContactEmpty'}),
      getTopPeers: () => [] as PeerId[]
    },
    appChatsManager: {
      getChat: (chatId: ChatId) => peerOf(chatId.toPeerId(true)),
      getChannelInput: (chatId: ChatId) => ({_: 'inputChannel', channel_id: chatId, access_hash: '0'}),
      hasRights: () => true,
      canManageDirectMessages: () => false
    },
    appPeersManager: {
      getPeer: peerOf,
      getInputPeerById: (peerId: PeerId) => (peerId < 0 ?
        {_: 'inputPeerChannel', channel_id: (-peerId).toString(), access_hash: '0'} :
        {_: 'inputPeerUser', user_id: peerId.toString(), access_hash: '0'}),
      isBroadcast: (peerId: PeerId) => (peerOf(peerId) as any)?.pFlags?.broadcast ?? false,
      getStarsAmount: () => 0,
      isMegagroup: (peerId: PeerId) => (peerOf(peerId) as any)?.pFlags?.megagroup ?? false,
      isForum: () => false,
      isBotforum: () => false,
      isMonoforum: () => false,
      isAnyChat: (peerId: PeerId) => peerId < 0,
      isUser: (peerId: PeerId) => peerId > 0
    },
    appMessagesManager: {
      getMessageByPeer: (peerId: PeerId, mid: number) =>
        messages.find((message) => message.peerId === peerId && message.mid === mid)
    },
    appAvatarsManager: {
      isAvatarCached: () => false,
      loadAvatar: () => undefined,
      getAvatarVideoStartTs: () => undefined
    },
    appStoriesManager: {
      getUnreadType: () => undefined,
      getPeerStoriesSegments: () => undefined
    },
    appNotificationsManager: {
      getNotifyPeerTypeSettings: () => undefined,
      isPeerLocalMuted: () => false
    },
    appReactionsManager: {
      getAvailableReactions: () => [] as any[]
    },
    appStickersManager: {
      // No sticker set to resolve against; callers guard on a missing `doc`.
      preloadAnimatedEmojiSticker: () => ({doc: undefined as any, animation: undefined as any, sound: undefined as any})
    },
    appPaymentsManager: {
      getStarsStatus: () => makeStarsStatus(starsAmount),
      getStarsStatusTon: () => makeStarsStatus({...starsAmount, amount: 0}),
      getStarsTransactions: () => makeStarsStatus(starsAmount),
      getStarsSubscriptions: () => makeStarsStatus(starsAmount),
      getPremiumPromo: () => premiumPromo,
      getStarsTopupOptions: () => [100, 500, 1000].map((stars) => ({
        _: 'starsTopupOption',
        pFlags: {},
        stars,
        currency: 'EUR',
        amount: stars
      }))
    },
    appGiftsManager: {
      getStarGiftOptions: () => [myStarGift],
      getProfileGifts: () => ({next: undefined as string, gifts: [myUniqueStarGift], count: 1, collections: undefined as any[]}),
      getUpgradePreview: () => starGiftUpgradePreview,
      getGiftValue: () => starGiftValueInfo,
      getFloorPrice: () => myStarGift.raw.resell_min_stars,
      getPremiumGiftOptions: () => [] as any[],
      getResaleOptions: () => ({next: undefined as string, gifts: [] as any[], count: 0, attributes: [] as any[], attributesHash: 0, counters: [] as any[]})
    },
    appBoostsManager: {
      getBoostsStatus: () => boostsStatus,
      getMyBoosts: () => ({_: 'premium.myBoosts', my_boosts: [], chats: [], users: []})
    },
    dialogsStorage: {
      getForumTopic: () => undefined,
      getAnyDialog: (peerId: PeerId) => dialogs.find((dialog) => dialog.peerId === peerId),
      // One page, everything, always the end — peer pickers stop after the first request.
      getDialogs: ({query}: {query?: string} = {}) => ({
        dialogs: query ? [] : dialogs.slice(),
        count: dialogs.length,
        isEnd: true
      })
    },
    appProfileManager: {
      getProfile: () => ({_: 'userFull', pFlags: {}, id: SELF_USER_ID, settings: {_: 'peerSettings', pFlags: {}}}),
      getParticipants: () => ({_: 'channels.channelParticipants', count: 0, participants: [], chats: [], users: []}),
      getChatFull: () => ({_: 'chatFull', pFlags: {}, id: 0, about: 'A sandbox chat'})
    },
    appPrivacyManager: {
      getPrivacy: () => [] as any[],
      getGlobalPrivacySettings: () => ({_: 'globalPrivacySettings', pFlags: {}})
    },
    appLangPackManager: {
      getStrings: () => [] as any[]
    }
  };
}

export type MockManagersController = {
  /** Drop-in for `rootScope.managers`. */
  managers: AppManagers,
  /** Every call the popups made, newest last. Handy for assertions in an automated run. */
  calls: ManagerCall[],
  /** Calls no handler answered — the to-do list for making a story render fully. */
  unhandled: ManagerCall[],
  /** Layer extra handlers on top; returns a revert for when the story closes. */
  override(handlers: ManagerHandlers): () => void,
  /** Called for each unanswered call, so the panel can list them as the popup makes them. */
  onUnhandled?: (call: ManagerCall) => void,
  /** Forget recorded calls and every story-supplied override. */
  reset(): void
};

export function createMockManagers(): MockManagersController {
  const defaults = createDefaultHandlers();
  const overrides: ManagerHandlers[] = [];
  const calls: ManagerCall[] = [];
  const unhandled: ManagerCall[] = [];

  const findHandler = (manager: string, method: string) => {
    for(let i = overrides.length - 1; i >= 0; --i) {
      const handler = overrides[i][manager]?.[method];
      if(handler) return handler;
    }

    return defaults[manager]?.[method];
  };

  const invoke = (manager: string, method: string, args: any[]) => {
    const handler = findHandler(manager, method);
    const call: ManagerCall = {manager, method, args, handled: !!handler};
    calls.push(call);
    if(!handler) {
      unhandled.push(call);
      controller.onUnhandled?.(call);
      return undefined;
    }

    return handler(...args);
  };

  const createManagerProxy = (manager: string, wrap: (value: any) => any) => new Proxy({} as any, {
    get: (target, method) => target[method] ??= (...args: any[]) => {
      let value: any;
      try {
        value = invoke(manager, method as string, args);
      } catch(err) {
        return Promise.reject(err);
      }

      return Promise.resolve(wrap(value));
    }
  });

  const createRootProxy = (wrap: (value: any) => any) => new Proxy({} as any, {
    get: (target, manager) => target[manager] ??= createManagerProxy(manager as string, wrap)
  });

  const managers = createRootProxy((value) => value);
  // `managers.acknowledged.x.y()` resolves to an AckedResult, `managers.all.x.y()` to one entry per account.
  managers.acknowledged = createRootProxy((value) => ({cached: true, result: Promise.resolve(value)}));
  managers.all = createRootProxy((value) => [value]);

  const controller: MockManagersController = {
    managers: managers as AppManagers,
    calls,
    unhandled,
    override(handlers: ManagerHandlers) {
      overrides.push(handlers);
      return () => {
        const index = overrides.indexOf(handlers);
        if(index !== -1) overrides.splice(index, 1);
      };
    },
    reset() {
      overrides.length = 0;
      calls.length = 0;
      unhandled.length = 0;
    }
  };

  return controller;
}

export const SANDBOX_SELF_PEER_ID = SELF_PEER_ID;
