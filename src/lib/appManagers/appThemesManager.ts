import {AccountThemes, AccountWallPapers, ChatTheme, InputChatTheme, InputWallPaper, MessagesSetChatWallPaper, StarGift, ThemeSettings, Updates, WallPaper} from '@layer';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {AppManager} from '@appManagers/manager';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import KeyedQueue from '@appManagers/utils/keyedQueue';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';

type WallPaperId = WallPaper['id'];

// * the page size tdesktop asks for
const GIFT_CHAT_THEMES_LIMIT = 24;
const WALLPAPER_UPLOAD_RETRIES = 3;

export default class AppThemesManager extends AppManager {
  private wallPapers: {[id: WallPaperId]: WallPaper};
  private wallPapersBySlug: {[slug: string]: WallPaper};
  // * a chat's background requests (its wallpaper, its theme), one after another by chat: each goes once the one before
  // * is answered and its updates handed on, so what the chat hears of while one is on its way is newer than it
  private chatBackgroundQueues: KeyedQueue<PeerId>;
  private giftChatThemes: {
    themes: ChatTheme.chatThemeUniqueGift[],
    hash: string | number,
    nextOffset?: string
  };

  protected after() {
    this.wallPapers = {};
    this.wallPapersBySlug = {};
    this.chatBackgroundQueues = new KeyedQueue();

    this.rootScope.addEventListener('user_auth', () => {
      this.getThemes();
    });

    return this.appStateManager.getState().then((state) => {
      try {
        this.saveAccountThemes(state.accountThemes);
      } catch(err) {}
    });
  }

  public saveWallPaper(wallPaper: WallPaper) {
    if(!wallPaper) {
      return wallPaper;
    }
    // const oldWallPaper = this.wallPapers[wallPaper.id];

    // ! IT'S BROKEN NOW. SERVER RETURNS SAME ID FOR DIFFERENT WALLPAPERS
    // if(oldWallPaper) {
    //   console.log('rewrite', {...oldWallPaper}, {...wallPaper});
    // }

    let slug: string;
    if(wallPaper._ !== 'wallPaperNoFile') {
      slug = wallPaper.slug;
      wallPaper.document = this.appDocsManager.saveDoc(wallPaper.document, {type: 'wallPaper', wallPaperId: wallPaper.id});
    }

    // if(oldWallPaper) {
    //   return Object.assign(oldWallPaper, wallPaper);
    // } else {
    this.wallPapers[wallPaper.id] = wallPaper;
    // }

    if(slug) {
      this.wallPapersBySlug[slug] = wallPaper;
    }

    return wallPaper;
  }

  public getWallPaper(inputWallPaper: InputWallPaper) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'account.getWallPaper',
      params: {wallpaper: inputWallPaper},
      processResult: (wallPaper) => {
        return this.saveWallPaper(wallPaper);
      }
    });
  }

  public getInputWallPaper(wallPaper: WallPaper | string): InputWallPaper {
    if(typeof(wallPaper) === 'string') {
      return {_: 'inputWallPaperSlug', slug: wallPaper};
    } else if(wallPaper._ === 'wallPaperNoFile') {
      return {_: 'inputWallPaperNoFile', id: wallPaper.id};
    } else {
      return {_: 'inputWallPaper', id: wallPaper.id, access_hash: wallPaper.access_hash};
    }
  }

  public getWallPaperById(id: WallPaperId) {
    const wallPaper = this.wallPapers[id];
    return this.getWallPaper(this.getInputWallPaper(wallPaper));
  }

  public getWallPaperBySlug(slug: string) {
    const wallPaper = this.wallPapersBySlug[slug];
    if(wallPaper) {
      return wallPaper;
    }

    return this.getWallPaper(this.getInputWallPaper(slug));
  }

  private saveAccountThemes(accountThemes: AccountThemes.accountThemes) {
    accountThemes.themes?.forEach((theme) => {
      this.saveThemeSettings(theme.settings);
    });
  }

  private saveThemeSettings(settings: ThemeSettings[]) {
    settings?.forEach((themeSettings) => {
      themeSettings.wallpaper = this.saveWallPaper(themeSettings.wallpaper);
    });
  }

  public async getThemes() {
    const state = await this.appStateManager.getState();
    const oldAccountThemes = state.accountThemes;
    return this.apiManager.invokeApiSingleProcess({
      method: 'account.getThemes',
      params: {format: 'macos', hash: oldAccountThemes?.hash ?? 0},
      processResult: async(accountThemes) => {
        if(accountThemes._ === 'account.themesNotModified') {
          return oldAccountThemes.themes;
        }

        this.saveAccountThemes(accountThemes);
        await this.appStateManager.pushToState('accountThemes', accountThemes);
        return accountThemes.themes;
      }
    });
  }

  public getWallPapers() {
    return this.apiManager.invokeApiHashable({method: 'account.getWallPapers'}).then((accountWallpapers) => {
      const wallPapers = (accountWallpapers as AccountWallPapers.accountWallPapers).wallpapers;
      wallPapers.forEach((wallPaper, idx, arr) => {
        arr[idx] = this.saveWallPaper(wallPaper);
      });

      return wallPapers;
    });
  }

  /**
   * A chat theme made of a collectible gift carries its own wallpapers and the gift's stickers —
   * save them, so they can be downloaded and found by slug like any other.
   */
  public saveChatTheme<T extends ChatTheme>(theme: T): T {
    if(theme?._ !== 'chatThemeUniqueGift') {
      return theme;
    }

    this.saveThemeSettings(theme.theme_settings);

    if(theme.gift._ === 'starGiftUnique') {
      this.appGiftsManager.wrapGift(theme.gift);
    }

    return theme;
  }

  /**
   * The collectible gifts of the user that can serve as a chat theme, paged. Without `loadMore` the
   * first page is checked against the cached hash and everything loaded so far comes back.
   */
  public getUniqueGiftChatThemes(loadMore?: boolean): Promise<{themes: ChatTheme.chatThemeUniqueGift[], hasMore: boolean}> {
    const cached = this.giftChatThemes;
    if(loadMore && !cached?.nextOffset) {
      return Promise.resolve({themes: cached?.themes || [], hasMore: false});
    }

    const offset = loadMore ? cached.nextOffset : '';
    return this.apiManager.invokeApiSingleProcess({
      method: 'account.getUniqueGiftChatThemes',
      params: {
        offset,
        limit: GIFT_CHAT_THEMES_LIMIT,
        // * the hash describes the list from its start, so only the first page is checked with it
        hash: !loadMore && cached ? cached.hash : 0
      },
      processResult: (result) => {
        if(result._ === 'account.chatThemes') {
          this.appPeersManager.saveApiPeers(result);
          const themes = result.themes.filter((theme) => theme._ === 'chatThemeUniqueGift') as ChatTheme.chatThemeUniqueGift[];
          themes.forEach((theme) => this.saveChatTheme(theme));

          // * a page further on goes after the list it was asked after: one fetched anew meanwhile is left as it is
          if(!loadMore || this.giftChatThemes === cached) {
            this.giftChatThemes = {
              themes: loadMore ? [...cached.themes, ...themes] : themes,
              hash: loadMore ? cached.hash : result.hash,
              nextOffset: result.next_offset
            };
          }
        }

        // * the list the hash was checked against, or the page was asked after, was let go meanwhile (a theme the
        // * server refused): asked for whole
        if(!this.giftChatThemes) {
          return;
        }

        const {themes, nextOffset} = this.giftChatThemes;
        return {themes, hasMore: !!nextOffset};
      }
    }).then((result) => result ?? this.getUniqueGiftChatThemes());
  }

  /**
   * A gift can be the theme of one chat at a time: keep the cached list's `theme_peer` in step with
   * what was just set, so the picker shows where each gift is in use without refetching.
   */
  private setGiftChatThemePeer(peerId: PeerId, slug?: string) {
    this.giftChatThemes?.themes.forEach((theme) => {
      const gift = theme.gift as StarGift.starGiftUnique;
      if(gift.slug === slug) {
        gift.theme_peer = this.appPeersManager.getOutputPeer(peerId);
      } else if(getPeerId(gift.theme_peer) === peerId) {
        delete gift.theme_peer;
      }
    });
  }

  /**
   * Sets the wallpaper of a private chat, as tdesktop does it:
   * - `wallPaper` — for this side, or `forBoth` (Premium) for the other side too;
   * - `fromMessageId` — the one the other side set in that message, for this side as well;
   * - `revert` — puts back this side's own after the other side set one for both;
   * - nothing — drops the chat's wallpaper.
   * A wallpaper of the chat stands in for its theme's own; the theme keeps its colours.
   */
  public async setChatWallPaper(peerId: PeerId, options: {
    wallPaper?: WallPaper,
    forBoth?: boolean,
    fromMessageId?: number,
    revert?: boolean,
    // * uploaded a moment ago: the server can take a moment to know it
    justUploaded?: boolean
  } = {}) {
    const {wallPaper, forBoth, fromMessageId, revert, justUploaded} = options;
    const peer = this.appPeersManager.getInputPeerById(peerId);
    const params: MessagesSetChatWallPaper = {peer};
    if(revert) {
      params.revert = true;
    } else if(fromMessageId) {
      params.id = getServerMessageId(fromMessageId);
      params.settings = wallPaper?.settings;
    } else if(wallPaper) {
      params.wallpaper = this.getInputWallPaper(wallPaper);
      params.settings = wallPaper.settings || {_: 'wallPaperSettings', pFlags: {}};
      params.for_both = forBoth || undefined;
    }

    // * the chat changes now; what the other side ends up with comes with the updates
    if(!revert) {
      this.appProfileManager.setCachedChatWallPaper(peerId, wallPaper);
    }

    const invoke = async(attempt = 0): Promise<Updates> => {
      try {
        return await this.apiManager.invokeApi('messages.setChatWallPaper', params);
      } catch(err) {
        // * WALLPAPER_INVALID for a wallpaper uploaded a moment ago — seen once in a few tries
        if(!justUploaded || (err as ApiError).type !== 'WALLPAPER_INVALID' || attempt >= WALLPAPER_UPLOAD_RETRIES) {
          throw err;
        }

        await pause(500 * (attempt + 1));
        return invoke(attempt + 1);
      }
    };

    return this.chatBackgroundQueues.run(peerId, async() => {
      try {
        this.apiUpdatesManager.processUpdateMessage(await invoke());
      } catch(err) {
        await this.refetchChatBackground(peerId);
        throw err;
      }

      // * which wallpaper this side had before is the server's to say
      if(revert) {
        await this.refetchChatBackground(peerId);
      }
    });
  }

  /**
   * The full peers asked for again in the turn of a chat's background: what the server says lands before the chat's
   * next request goes, which an answer coming after it would undo
   */
  private refetchChatBackground(...peerIds: PeerId[]) {
    return Promise.all(peerIds.map((peerId) => Promise.resolve(this.appProfileManager.refreshFullPeer(peerId)).catch(noop)));
  }

  /**
   * Sets the theme of a private chat, or removes it when `theme` is left out. Applied locally at
   * once, so the chat repaints without waiting for the server — except for a gift handed over
   * without its theme settings, which the chat gets with the service message.
   */
  public async setChatTheme(peerId: PeerId, theme?: ChatTheme) {
    const userId = peerId.toUserId();
    const gift = theme?._ === 'chatThemeUniqueGift' ? theme.gift as StarGift.starGiftUnique : undefined;
    const applyLocally = !gift || !!(theme as ChatTheme.chatThemeUniqueGift).theme_settings?.length;
    let inputTheme: InputChatTheme;
    if(gift) {
      inputTheme = {_: 'inputChatThemeUniqueGift', slug: gift.slug};
    } else if(theme?._ === 'chatTheme' && theme.emoticon) {
      inputTheme = {_: 'inputChatTheme', emoticon: theme.emoticon};
    } else {
      inputTheme = {_: 'inputChatThemeEmpty'};
      theme = undefined;
    }

    // * the gift leaves the chat it was the theme of
    const previousGiftPeerId = gift && getPeerId(gift.theme_peer);
    if(previousGiftPeerId && previousGiftPeerId !== peerId) {
      this.appProfileManager.modifyCachedFullUser(previousGiftPeerId.toUserId(), (userFull) => {
        const previousTheme = userFull.theme;
        if(previousTheme?._ !== 'chatThemeUniqueGift' || (previousTheme.gift as StarGift.starGiftUnique).slug !== gift.slug) {
          return false;
        }

        delete userFull.theme;
      });
    }

    // * a wallpaper of the chat would cover the theme, so it goes, as tdesktop does it — asked to go
    // * unless the chat is known to have none, and no request of its background is on its way to say otherwise
    const backgroundAsked = this.chatBackgroundQueues.isPending(peerId);
    let hasNoWallPaper = false;
    this.appProfileManager.modifyCachedFullUser(userId, (userFull) => {
      hasNoWallPaper = !userFull.wallpaper && !backgroundAsked;
      delete userFull.wallpaper;
      if(!applyLocally) {
        return;
      }

      if(theme) {
        userFull.theme = this.saveChatTheme(theme);
      } else {
        delete userFull.theme;
      }
    });

    this.setGiftChatThemePeer(peerId, gift?.slug);

    const peer = this.appPeersManager.getInputPeerById(peerId);
    return this.chatBackgroundQueues.run(peerId, async() => {
      // * what changes the chat's wallpaper from here on (another device, the other side's for both, a wallpaper asked
      // * for after this) is newer than this theme
      const wallPaperRevision = this.appProfileManager.getChatWallPaperRevision(peerId);
      try {
        const updates = await this.apiManager.invokeApi('messages.setChatTheme', {peer, theme: inputTheme});
        this.apiUpdatesManager.processUpdateMessage(updates);
      } catch(err) {
        // * put back what the server has, in the chat the gift was taken from too - the wallpaper with it, not asked
        // * to go yet
        this.giftChatThemes = undefined;
        await this.refetchChatBackground(
          peerId,
          ...(previousGiftPeerId && previousGiftPeerId !== peerId ? [previousGiftPeerId] : [])
        );

        throw err;
      }

      // * once the theme is set (tdesktop asks for both at once): a change that fails leaves the chat its wallpaper,
      // * and a newer one stays
      if(hasNoWallPaper || this.appProfileManager.getChatWallPaperRevision(peerId) !== wallPaperRevision) {
        return;
      }

      try {
        this.apiUpdatesManager.processUpdateMessage(await this.apiManager.invokeApi('messages.setChatWallPaper', {peer}));
      } catch(err) {
        // * the chat keeps the wallpaper the server still has; the theme is set all the same
        await this.refetchChatBackground(peerId);
      }
    });
  }
}
