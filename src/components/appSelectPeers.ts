/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatRights} from '../lib/appManagers/appChatsManager';
import type {Dialog} from '../lib/appManagers/appMessagesManager';
import type {AppPeersManager, IsPeerType} from '../lib/appManagers/appPeersManager';
import appDialogsManager, {DialogElement, DialogElementSize as DialogElementSize} from '../lib/appManagers/appDialogsManager';
import rootScope from '../lib/rootScope';
import Scrollable from './scrollable';
import {FocusDirection} from '../helpers/fastSmoothScroll';
import CheckboxField from './checkboxField';
import {i18n, LangPackKey, _i18n} from '../lib/langPack';
import findUpAttribute from '../helpers/dom/findUpAttribute';
import findUpClassName from '../helpers/dom/findUpClassName';
import PeerTitle from './peerTitle';
import cancelEvent from '../helpers/dom/cancelEvent';
import replaceContent from '../helpers/dom/replaceContent';
import debounce from '../helpers/schedulers/debounce';
import windowSize from '../helpers/windowSize';
import {attachClickEvent, simulateClickEvent} from '../helpers/dom/clickEvent';
import filterUnique from '../helpers/array/filterUnique';
import indexOfAndSplice from '../helpers/array/indexOfAndSplice';
import safeAssign from '../helpers/object/safeAssign';
import findAndSplice from '../helpers/array/findAndSplice';
import {AppManagers} from '../lib/appManagers/managers';
import filterAsync from '../helpers/array/filterAsync';
import getParticipantPeerId from '../lib/appManagers/utils/chats/getParticipantPeerId';
import getChatMembersString from './wrappers/getChatMembersString';
import getUserStatusString from './wrappers/getUserStatusString';
import {ChannelParticipant, ChannelParticipantsFilter, ChannelsChannelParticipants, Chat, ChatParticipant, User} from '../layer';
import canSendToUser from '../lib/appManagers/utils/users/canSendToUser';
import hasRights from '../lib/appManagers/utils/chats/hasRights';
import getDialogIndex from '../lib/appManagers/utils/dialogs/getDialogIndex';
import {generateDelimiter} from './generateDelimiter';
import SettingSection from './settingSection';
import liteMode from '../helpers/liteMode';
import emptyPlaceholder from './emptyPlaceholder';
import {Middleware, MiddlewareHelper, getMiddleware} from '../helpers/middleware';
import {createSignal, Setter, JSX, createRoot, createEffect} from 'solid-js';
import DialogsPlaceholder from '../helpers/dialogsPlaceholder';
import ListenerSetter from '../helpers/listenerSetter';
import {avatarNew} from './avatarNew';
import Icon from './icon';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import {hideToast, toastNew} from './toast';
import wrapPeerTitle from './wrappers/peerTitle';
import anchorCallback from '../helpers/dom/anchorCallback';
import PopupPremium from './popups/premium';
import formatNumber from '../helpers/number/formatNumber';
import namedPromises from '../helpers/namedPromises';

export type SelectSearchPeerType = 'contacts' | 'dialogs' | 'channelParticipants' | 'custom';
export type FilterPeerTypeByFunc = (peer: ReturnType<AppPeersManager['getPeer']>) => boolean;

// TODO: правильная сортировка для addMembers, т.е. для peerType: 'contacts', потому что там идут сначала контакты - потом неконтакты, а должно всё сортироваться по имени

export default class AppSelectPeers {
  public container = document.createElement('div');
  public list = appDialogsManager.createChatList(/* {
    handheldsSize: 66,
    avatarSize: 48
  } */);
  protected oldList: HTMLElement;
  private chatsContainer = document.createElement('div');
  public scrollable: Scrollable;
  private selectedScrollable: Scrollable;

  private selectedContainer: HTMLElement;
  public input: HTMLInputElement;

  // public selected: {[peerId: PeerId]: HTMLElement} = {};
  public selected = new Set<PeerId | string>();

  public freezed = false;

  private folderId = 0;
  private offsetIndex = 0;
  private promise: Promise<any>;

  private query = '';
  private cachedContacts: PeerId[];

  private loadedWhat: Partial<{[k in 'dialogs' | 'archived' | 'contacts' | 'channelParticipants' | 'custom']: boolean}> = {};

  private renderedPeerIds: Set<PeerId> = new Set();

  private appendTo: HTMLElement;
  private onChange: (length: number) => void;
  private peerType: SelectSearchPeerType[] = ['dialogs'];
  public renderResultsFunc: (peerIds: PeerId[], append?: boolean) => void | Promise<void>;
  private chatRightsActions: ChatRights[];
  private multiSelect = true;
  private headerSearch: boolean;
  private noSearch: boolean;
  private rippleEnabled = true;
  private avatarSize: DialogElementSize = 'abitbigger';
  private exceptSelf: boolean;
  private filterPeerTypeBy: IsPeerType[] | FilterPeerTypeByFunc;
  private channelParticipantsFilter: ChannelParticipantsFilter | ((q: string) => ChannelParticipantsFilter);
  private channelParticipantsUpdateFilter: (participant: ChannelParticipant) => boolean;
  private meAsSaved: boolean;
  private noShadow: boolean;
  private noDelimiter: boolean;
  private onSelect: (peerId: PeerId) => void;

  private tempIds: {[k in keyof AppSelectPeers['loadedWhat']]: number} = {};
  private peerId: PeerId;

  private placeholder: LangPackKey;

  private selfPresence: LangPackKey = 'Presence.YourChat';

  private needSwitchList = false;

  private sectionNameLangPackKey: ConstructorParameters<typeof SettingSection>[0]['name'];
  private sectionCaption: ConstructorParameters<typeof SettingSection>[0]['caption'];

  private getSubtitleForElement: (peerId: PeerId) => HTMLElement | Promise<HTMLElement> | DocumentFragment | Promise<DocumentFragment>;
  private processElementAfter: (peerId: PeerId, dialogElement: DialogElement) => void | Promise<void>;

  private managers: AppManagers;

  private middleware: Middleware;
  public middlewareHelper: MiddlewareHelper;
  public middlewareHelperLoader: MiddlewareHelper;

  private emptySearchPlaceholderMiddlewareHelper: MiddlewareHelper;
  private emptySearchPlaceholderQuerySetter: Setter<string>;
  private emptySearchPlaceholderHideSetter: Setter<boolean>;

  private dialogsPlaceholder: DialogsPlaceholder;

  private design: 'round' | 'square' = 'round';
  public section: SettingSection;

  public participants: Map<PeerId, ChatParticipant | ChannelParticipant> = new Map();
  private listenerSetter: ListenerSetter;
  public getMoreCustom: (q: string, middleware: () => boolean) => Promise<{result: PeerId[], isEnd: boolean}>;

  private withStories: boolean;

  private night: boolean;
  public searchSection: SettingSection;

  private checkboxSide: 'right' | 'left';
  private noPlaceholder: boolean;

  private limit: number;
  private limitCallback: () => void;

  private excludePeerIds: Set<PeerId>;
  public getPeerIdFromKey: (key: string | PeerId) => PeerId;

  constructor(options: {
    appendTo: AppSelectPeers['appendTo'],
    managers: AppSelectPeers['managers'],
    middleware: Middleware,
    onChange?: AppSelectPeers['onChange'],
    peerType?: AppSelectPeers['peerType'],
    peerId?: AppSelectPeers['peerId'],
    onFirstRender?: () => void,
    renderResultsFunc?: AppSelectPeers['renderResultsFunc'],
    chatRightsActions?: AppSelectPeers['chatRightsActions'],
    multiSelect?: AppSelectPeers['multiSelect'],
    headerSearch?: AppSelectPeers['headerSearch'],
    channelParticipantsFilter?: AppSelectPeers['channelParticipantsFilter'],
    channelParticipantsUpdateFilter?: AppSelectPeers['channelParticipantsUpdateFilter'],
    noSearch?: AppSelectPeers['noSearch'],
    rippleEnabled?: AppSelectPeers['rippleEnabled'],
    avatarSize?: AppSelectPeers['avatarSize'],
    placeholder?: AppSelectPeers['placeholder'],
    selfPresence?: AppSelectPeers['selfPresence'],
    exceptSelf?: AppSelectPeers['exceptSelf'],
    filterPeerTypeBy?: AppSelectPeers['filterPeerTypeBy'],
    sectionNameLangPackKey?: AppSelectPeers['sectionNameLangPackKey'],
    sectionCaption?: AppSelectPeers['sectionCaption'],
    design?: AppSelectPeers['design'],
    getSubtitleForElement?: AppSelectPeers['getSubtitleForElement'],
    processElementAfter?: AppSelectPeers['processElementAfter'],
    meAsSaved?: AppSelectPeers['meAsSaved'],
    noShadow?: AppSelectPeers['noShadow'],
    noDelimiter?: AppSelectPeers['noDelimiter'],
    onSelect?: AppSelectPeers['onSelect'],
    scrollable?: AppSelectPeers['scrollable'],
    getMoreCustom?: AppSelectPeers['getMoreCustom'],
    placeholderElementsGap?: number,
    withStories?: AppSelectPeers['withStories'],
    night?: boolean,
    checkboxSide?: 'right' | 'left',
    noPlaceholder?: boolean,
    excludePeerIds?: AppSelectPeers['excludePeerIds'],
    placeholderSizes?: ConstructorParameters<typeof DialogsPlaceholder>[0],
    getPeerIdFromKey?: AppSelectPeers['getPeerIdFromKey']
  }) {
    safeAssign(this, options);

    this.checkboxSide ??= 'right';
    this.exceptSelf ??= false;
    this.meAsSaved ??= !(this.peerType.length === 1 && this.peerType[0] === 'channelParticipants');
    this.headerSearch ??= this.multiSelect && !this.noSearch;
    // this.noSearch ??= !this.multiSelect;
    this.noShadow ??= !!this.input || !this.sectionCaption;
    this.excludePeerIds ??= new Set();
    if(this.exceptSelf) this.excludePeerIds.add(rootScope.myId);

    this.middlewareHelper = options.middleware.create();
    this.middlewareHelperLoader = this.middlewareHelper.get().create();
    if(!this.noPlaceholder) this.dialogsPlaceholder = new DialogsPlaceholder(options.placeholderSizes || {
      avatarSize: 42,
      avatarMarginRight: 18,
      marginVertical: 7,
      marginLeft: 12 + (this.design === 'square' ? 48 : 0),
      totalHeight: 56,
      gapVertical: options.placeholderElementsGap,
      statusWidth: 0,
      night: this.night
    });

    this.container.classList.add(
      'selector',
      'selector-' + this.design,
      'selector-' + this.checkboxSide
    );

    const f = (this.renderResultsFunc || this.renderResults).bind(this);
    this.renderResultsFunc = async(peerIds, append?: boolean) => {
      const {needSwitchList} = this;
      const middleware = this.middlewareHelperLoader.get();
      if(needSwitchList) {
        this.needSwitchList = false;
        this.oldList.replaceWith(this.list);
        this.oldList = undefined;
      }

      peerIds = peerIds.filter((peerId) => {
        if(this.excludePeerIds.has(peerId)) {
          return false;
        }

        const notRendered = !this.renderedPeerIds.has(peerId);
        if(notRendered) this.renderedPeerIds.add(peerId);
        return notRendered;
      });

      if(this.filterPeerTypeBy) {
        const isFunction = typeof(this.filterPeerTypeBy) === 'function';
        peerIds = await filterAsync(peerIds, async(peerId) => {
          if(peerId.isPeerId()) {
            if(isFunction) {
              const peer = await this.managers.appPeersManager.getPeer(peerId);
              return (this.filterPeerTypeBy as FilterPeerTypeByFunc)(peer);
            } else {
              for(const method of this.filterPeerTypeBy as IsPeerType[]) {
                if(await this.managers.appPeersManager[method](peerId)) {
                  return true;
                }
              }
            }

            return false;
          }

          return true;
        });

        if(!middleware()) {
          return;
        }
      }

      await f(peerIds, append);

      if(!this.promise) {
        this.processPlaceholderOnResults();
      }

      if(this.chatRightsActions?.some((action) => action.startsWith('send_'))) {
        Promise.all(peerIds.map(async(peerId) => {
          const userId = peerId.toUserId();

          const {requirement, starsAmount} = await namedPromises({
            requirement: this.managers.appUsersManager.getRequirementToContact(userId),
            starsAmount: this.managers.appPeersManager.getStarsAmount(peerId)
          });

          return {peerId, userId, requirement, requiredStars: starsAmount};
        })).then((result) => {
          for(const {peerId, requirement, requiredStars} of result) {
            const element = this.getElementByPeerId(peerId.toPeerId(false));
            if(!element) {
              continue;
            }

            if(requirement?._ === 'requirementToContactPremium') {
              const lock = Icon('premium_lock', 'selector-premium-lock');
              element.append(lock);
              element.classList.add('is-premium-locked');
            } else if(+requiredStars) {
              const starsAmount = formatNumber(+requiredStars, 1);

              const starsBadge = document.createElement('span');
              starsBadge.classList.add('stars-badge-base', 'dialog-stars-badge');

              const starsBadgeStars = document.createElement('span');
              starsBadgeStars.append(starsAmount + '');

              starsBadge.append(
                Icon('star', 'stars-badge-base__icon'),
                starsBadgeStars
              );

              element.append(starsBadge);
            }
          }
        });
      }
    };

    if(!this.noSearch) {
      this.input = document.createElement('input');
      this.input.classList.add('selector-search-input');
      this.input.type = 'text';
      _i18n(this.input, this.placeholder || 'SendMessageTo', undefined, 'placeholder');

      const debouncedInput = debounce(this.onInput, 200, false, true);
      this.input.addEventListener('input', debouncedInput);
    }

    if(this.headerSearch) {
      const section = this.searchSection = new SettingSection({});
      section.innerContainer.classList.add('selector-search-section');
      section.container.classList.add('selector-search-section-container');
      const topContainer = document.createElement('div');
      topContainer.classList.add('selector-search-container');

      this.selectedContainer = document.createElement('div');
      this.selectedContainer.classList.add('selector-search');

      this.selectedContainer.append(this.input);
      topContainer.append(this.selectedContainer);
      this.selectedScrollable = new Scrollable(topContainer);

      // let delimiter = document.createElement('hr');

      if(this.multiSelect) attachClickEvent(this.selectedContainer, (e) => {
        if(this.freezed) return;
        let target = e.target as HTMLElement;
        target = findUpClassName(target, 'selector-user');

        if(!target) return;

        const peerId = target.dataset.key;
        const li = this.chatsContainer.querySelector('[data-peer-id="' + peerId + '"]') as HTMLElement;
        if(!li) {
          this.remove(peerId.toPeerId());
        } else {
          simulateClickEvent(li);
        }
      });

      section.content.append(topContainer);
      this.container.append(section.container/* , delimiter */);
    }

    this.chatsContainer.classList.add('chatlist-container');
    // this.chatsContainer.append(this.list);
    const section = this.section = new SettingSection({
      name: this.sectionNameLangPackKey,
      caption: this.sectionCaption,
      noShadow: this.noShadow
    });

    if(this.sectionNameLangPackKey) {
      section.content = section.generateContentElement();
    }

    // it can't have full height then
    if(!this.sectionCaption) {
      section.content.classList.add('selector-list-section-content');
      section.container.classList.add('selector-list-section-container');
    }

    section.content.append(this.list);
    this.chatsContainer.append(section.container);
    if(!this.scrollable) {
      this.scrollable = new Scrollable(this.chatsContainer);
    } else {
      this.scrollable.append(this.chatsContainer);
    }

    attachClickEvent(this.chatsContainer, (e) => {
      const target = findUpAttribute(e.target, 'data-peer-id') as HTMLElement;

      if(!target) return;
      cancelEvent(e);
      if(this.freezed) return;

      let key: PeerId | string = target.dataset.peerId;
      key = key.isPeerId() ? key.toPeerId() : key;

      if(key.isPeerId() && target.classList.contains('is-premium-locked')) {
        wrapPeerTitle({peerId: key, onlyFirstName: true}).then((title) => {
          toastNew({
            langPackKey: 'OnlyPremiumCanMessage',
            langPackArguments: [
              title,
              anchorCallback(() => {
                hideToast();
                PopupPremium.show();
              })
            ]
          });
        });
        return;
      }

      if(this.onSelect) {
        this.onSelect(key);
        return;
      }

      if(!this.multiSelect) {
        this.add({key});
        return;
      }

      // target.classList.toggle('active');
      const result = this.selected.has(key) ? this.remove(key) : this.add({key});
      if(!result) {
        return;
      }

      const checkbox = target.querySelector('input') as HTMLInputElement;
      checkbox.checked = !checkbox.checked;
    });

    this.scrollable.onScrolledBottom = () => {
      this.getMoreResults();
    };

    if(this.input && !this.noDelimiter) {
      this.scrollable.prepend(generateDelimiter());
    }

    this.listenerSetter = new ListenerSetter();
    this.container.append(this.chatsContainer);
    this.appendTo.append(this.container);

    if(this.channelParticipantsUpdateFilter) this.listenerSetter.add(rootScope)('chat_participant', (update) => {
      const newParticipant = update.new_participant;
      const peerId = update.user_id.toPeerId(false);
      const needAdd = this.channelParticipantsUpdateFilter(newParticipant);

      if(needAdd) {
        this.participants.set(peerId, newParticipant);
      } else {
        this.participants.delete(peerId);
      }

      if(needAdd) {
        this.renderResultsFunc([peerId], false);
      } else {
        this.deletePeerId(peerId);
      }
    });

    options.middleware.onDestroy(() => {
      this.destroy();
    });

    // WARNING TIMEOUT
    setTimeout(() => {
      const getResultsPromise = this.getMoreResults() as Promise<any>;
      if(options.onFirstRender) {
        getResultsPromise.then(() => {
          options.onFirstRender();
        });
      }
    }, 0);
  }

  public static convertPeerTypes(types: TelegramChoosePeerType[]) {
    const isPeerTypeMap: {
      [type in typeof types[0]]: IsPeerType
    } = {
      bots: 'isBot',
      users: 'isRegularUser',
      groups: 'isAnyGroup',
      channels: 'isBroadcast'
    };

    const filterPeerTypeBy: IsPeerType[] = types.map((type) => isPeerTypeMap[type]);
    return filterPeerTypeBy;
  }

  public setLimit(limit: number, callback: AppSelectPeers['limitCallback']) {
    this.limit = limit;
    this.limitCallback = callback;
  }

  public destroy() {
    this.middlewareHelper.destroy();
    this.emptySearchPlaceholderMiddlewareHelper?.destroy();
    this.listenerSetter.removeAll();
    this.dialogsPlaceholder?.removeWithoutUnmounting();
  }

  public deletePeerId(peerId: PeerId) {
    const el = this.list.querySelector(`[data-peer-id="${peerId}"]`);
    const dialogElement = (el as any)?.dialogElement;
    if(dialogElement) {
      dialogElement.remove();
    } else {
      el?.remove();
    }

    this.renderedPeerIds.delete(peerId);

    if(!this.promise) {
      this.processPlaceholderOnResults();
    }
  }

  private onInput = () => {
    const value = this.input.value;
    if(this.query === value) {
      return;
    }

    if(this.peerType.includes('contacts') || this.peerType.includes('dialogs')) {
      this.cachedContacts = undefined;
    }

    if(this.peerType.includes('dialogs')) {
      this.folderId = 0;
      this.offsetIndex = 0;
    }

    for(const i in this.tempIds) {
      // @ts-ignore
      ++this.tempIds[i];
    }

    const oldList = this.list;
    this.oldList = oldList;
    this.list = appDialogsManager.createChatList();

    this.promise = undefined;
    this.query = value;
    this.renderedPeerIds.clear();
    this.needSwitchList = true;
    this.middlewareHelperLoader.clean();

    this.loadedWhat = {};
    if(this.peerType.includes('dialogs')) {
      this.loadedWhat.dialogs = false;
      this.loadedWhat.archived = false;
      this.loadedWhat.contacts = false;
    }

    if(this.peerType.includes('contacts')) {
      this.loadedWhat.contacts = false;
    }

    if(this.peerType.includes('channelParticipants')) {
      this.loadedWhat.channelParticipants = false;
    }

    if(this.peerType.includes('custom')) {
      this.loadedWhat.custom = false;
    }

    oldList.style.position = 'absolute';
    const height = oldList.parentElement?.clientHeight ?? 0;
    // const elementHeight = oldList.lastElementChild?.scrollHeight;
    // let oldListHeight = oldList.scrollHeight;
    // while(elementHeight && oldListHeight > height) {
    //   oldList.lastElementChild.remove();
    //   oldListHeight -= elementHeight;
    // }
    if(height) {
      oldList.style.overflow = 'hidden';
      oldList.style.height = `${height}px`;
    }

    height && this.dialogsPlaceholder?.attach({
      container: this.section.content,
      blockScrollable: this.scrollable,
      // getRectFrom: () => this.section.content.getBoundingClientRect()
      getRectFrom: () => {
        const scrollableRect = this.scrollable.container.getBoundingClientRect()
        const rect = this.section.content.getBoundingClientRect();
        return {
          width: rect.width,
          height: scrollableRect.height
        };
      }
      // getRectFrom: () => {
      //   const rect = this.section.content.getBoundingClientRect();
      //   const nameRect = this.section.title.getBoundingClientRect();
      //   return {
      //     top: rect.top + (nameRect ? nameRect.height : 0),
      //     right: rect.right,
      //     bottom: rect.bottom,
      //     left: rect.left,
      //     height: rect.height - (nameRect ? nameRect.height : 0),
      //     width: rect.width
      //   };
      // }
      // onRemove: () => {
      //   if(!this.list.childElementCount) {
      //     this.emptySearchPlaceholderHideSetter?.(false);
      //   }
      // }
    });
    this.emptySearchPlaceholderHideSetter?.(true);

    this.getMoreResults();
  };

  public clearInput() {
    this.input.value = '';
    this.onInput();
  }

  private async renderSaved() {
    if(
      !this.exceptSelf &&
      !this.offsetIndex &&
      this.folderId === 0 &&
      this.peerType.includes('dialogs') &&
      (!this.query || await this.managers.appUsersManager.testSelfSearch(this.query))
    ) {
      await this.renderResultsFunc([rootScope.myId]);
    }
  }

  private getTempId(type: keyof AppSelectPeers['tempIds']) {
    this.tempIds[type] ??= 0;
    const tempId = ++this.tempIds[type];
    return {
      tempId,
      middleware: () => this.tempIds[type] === tempId
    };
  }

  private async getMoreDialogs(): Promise<any> {
    if(this.loadedWhat.dialogs && this.loadedWhat.archived) {
      return;
    }

    // в десктопе - сначала без группы, потом архивные, потом контакты без сообщений
    const pageCount = windowSize.height / 56 * 1.25 | 0;

    const {middleware} = this.getTempId('dialogs');
    const promise = this.managers.dialogsStorage.getDialogs({
      query: this.query,
      offsetIndex: this.offsetIndex,
      limit: pageCount,
      filterId: this.folderId,
      skipMigrated: true
    });

    promise.catch(() => {
      if(!middleware()) {
        return;
      }

      this.loadedWhat[this.loadedWhat.dialogs ? 'archived' : 'dialogs'] = true;
    });

    const value = await promise;
    if(!middleware()) {
      return;
    }

    let dialogs = value.dialogs as Dialog[];
    if(dialogs.length) {
      const newOffsetIndex = getDialogIndex(dialogs[dialogs.length - 1]) || 0;

      dialogs = dialogs.slice();
      findAndSplice(dialogs, (d) => d.peerId === rootScope.myId); // no my account

      if(this.chatRightsActions) {
        dialogs = await filterAsync(dialogs, (d) => this.filterByRights(d.peerId));
        if(!middleware()) {
          return;
        }
      }

      await this.renderSaved();
      if(!middleware()) {
        return;
      }

      this.offsetIndex = newOffsetIndex;
    }

    await this.renderResultsFunc(dialogs.map((dialog) => dialog.peerId));

    if(value.isEnd) {
      if(!this.loadedWhat.dialogs) {
        await this.renderSaved();
        if(!middleware()) {
          return;
        }

        this.loadedWhat.dialogs = true;
        this.offsetIndex = 0;
        this.folderId = 1;

        return this.getMoreDialogs();
      } else {
        this.loadedWhat.archived = true;

        if(!this.loadedWhat.contacts/*  && this.peerType.includes('contacts') */) {
          return this.getMoreContacts();
        }
      }
    } else if(this.renderedPeerIds.size < pageCount) {
      return this.getMoreDialogs();
    }
  }

  private async filterByRights(peerId: PeerId) {
    const peer = apiManagerProxy.getPeer(peerId);
    if(peerId.isUser()) {
      return this.chatRightsActions[0] !== 'send_plain' || canSendToUser(peer as User.user);
    } else if(this.chatRightsActions.every((action) => hasRights(peer as Chat.chat, action))) {
      return true;
    }
  }

  private async getMoreContacts() {
    if(this.loadedWhat.contacts) {
      return;
    }

    const isGlobalSearch = this.peerType.includes('contacts');

    if(!this.cachedContacts) {
      /* const promises: Promise<any>[] = [appUsersManager.getContacts(this.query)];
      if(!this.peerType.includes('dialogs')) {
        promises.push(appMessagesManager.getConversationsAll());
      }

      this.promise = Promise.all(promises);
      this.cachedContacts = (await this.promise)[0].slice(); */
      const {middleware} = this.getTempId('contacts');
      const promise = Promise.all([
        isGlobalSearch ? this.managers.appUsersManager.getContactsPeerIds(this.query) : [],
        this.query ? this.managers.appUsersManager.searchContacts(this.query) : undefined
      ]);

      promise.catch(() => {
        if(!middleware()) {
          return;
        }

        this.loadedWhat.contacts = true;
      });

      const [cachedContacts, searchResult] = await promise;
      if(!middleware()) {
        return;
      }

      if(searchResult) {
        // do not add global result if only dialogs needed
        let resultPeerIds = isGlobalSearch ? searchResult.my_results.concat(searchResult.results) : searchResult.my_results;

        if(this.chatRightsActions) {
          resultPeerIds = await filterAsync(resultPeerIds, (peerId) => this.filterByRights(peerId));
          if(!middleware()) {
            return;
          }
        }

        if(!this.peerType.includes('dialogs')) {
          resultPeerIds = resultPeerIds.filter((peerId) => peerId.isUser());
        }

        this.cachedContacts = filterUnique(cachedContacts.concat(resultPeerIds));
      } else this.cachedContacts = cachedContacts.slice();

      indexOfAndSplice(this.cachedContacts, rootScope.myId); // no my account
    }

    // if(this.cachedContacts.length) {
    const pageCount = windowSize.height / 56 * 1.25 | 0;
    const arr = this.cachedContacts.splice(0, pageCount);
    await this.renderResultsFunc(arr);
    // }

    if(!this.cachedContacts.length) {
      this.loadedWhat.contacts = true;

      // need to load non-contacts
      /* if(!this.peerType.includes('dialogs')) {
        return this.getMoreDialogs();
      } */
    }
  }

  private async getMoreChannelParticipants() {
    if(this.loadedWhat.channelParticipants) {
      return;
    }

    const pageCount = 50; // same as in group permissions to use cache

    let filter: ChannelParticipantsFilter;
    if(this.channelParticipantsFilter) {
      filter = typeof(this.channelParticipantsFilter) === 'function' ?
        this.channelParticipantsFilter(this.query) :
        this.channelParticipantsFilter;
    } else {
      filter = {
        _: 'channelParticipantsSearch',
        q: this.query
      };
    }

    const {middleware} = this.getTempId('channelParticipants');
    const promise = this.managers.appProfileManager.getParticipants({
      id: this.peerId.toChatId(),
      filter,
      limit: pageCount,
      offset: this.list.childElementCount
    });

    promise.catch(() => {
      if(!middleware()) {
        return;
      }

      this.loadedWhat.channelParticipants = true;
    });

    const chatParticipants = await promise;
    if(!middleware()) {
      return;
    }

    const {participants} = chatParticipants;

    const peerIds = participants.map((participant) => {
      const peerId = getParticipantPeerId(participant);
      this.participants.set(peerId, participant);
      return peerId;
    });
    if(this.exceptSelf) indexOfAndSplice(peerIds, rootScope.myId);
    await this.renderResultsFunc(peerIds);

    const count = (chatParticipants as ChannelsChannelParticipants.channelsChannelParticipants).count ?? participants.length;

    if(this.list.childElementCount >= count || participants.length < pageCount) {
      this.loadedWhat.channelParticipants = true;
    }
  }

  private async _getMoreCustom() {
    if(this.loadedWhat.custom) {
      return;
    }

    const {middleware} = this.getTempId('custom');
    const promise = this.getMoreCustom(this.query, middleware);

    promise.catch(() => {
      if(!middleware()) {
        return;
      }

      this.loadedWhat.custom = true;
    });

    const res = await promise;
    if(!middleware()) {
      return;
    }

    const {result, isEnd} = res;

    if(this.exceptSelf) indexOfAndSplice(result, rootScope.myId);
    await this.renderResultsFunc(result);

    if(isEnd) {
      this.loadedWhat.custom = true;
    }
  }

  checkForTriggers = () => {
    this.scrollable.checkForTriggers();
  };

  private _getMoreResults() {
    if((this.peerType.includes('dialogs')/*  || this.loadedWhat.contacts */) && !this.loadedWhat.archived) { // to load non-contacts
      return this.getMoreSomething('dialogs');
    }

    if((this.peerType.includes('contacts') || this.peerType.includes('dialogs')) && !this.loadedWhat.contacts) {
      return this.getMoreSomething('contacts');
    }

    if(this.peerType.includes('channelParticipants') && !this.loadedWhat.channelParticipants) {
      return this.getMoreSomething('channelParticipants');
    }

    if(this.peerType.includes('custom') && !this.loadedWhat.custom) {
      return this.getMoreSomething('custom');
    }
  }

  private processPlaceholderOnResults = () => {
    const length = this.list.childElementCount;
    if(!length) {
      if(!this.emptySearchPlaceholderMiddlewareHelper) {
        this.emptySearchPlaceholderMiddlewareHelper = getMiddleware();
        const middleware = this.emptySearchPlaceholderMiddlewareHelper.get();
        const [query, setQuery] = createSignal(this.query);
        const [description, setDescription] = createSignal<JSX.Element>();
        const [hide, setHide] = createSignal(false);
        this.emptySearchPlaceholderQuerySetter = setQuery;
        this.emptySearchPlaceholderHideSetter = setHide;

        createRoot((dispose) => {
          middleware.onClean(dispose);
          createEffect(() => {
            setDescription(i18n('RequestJoin.List.SearchEmpty', [wrapEmojiText(query())]));
          });
        });
        return emptyPlaceholder({
          middleware,
          title: () => i18n('SearchEmptyViewTitle'),
          description,
          hide
        }).then((container) => {
          if(!middleware()) {
            return;
          }

          this.section.content.prepend(container);
        });
      } else {
        this.dialogsPlaceholder?.detach(length);
        this.emptySearchPlaceholderHideSetter(false);
        this.emptySearchPlaceholderQuerySetter(this.query);
      }
    } else {
      this.dialogsPlaceholder?.detach(length);
      this.emptySearchPlaceholderHideSetter?.(true);
      this.emptySearchPlaceholderQuerySetter?.(this.query);
    }
  };

  private getMoreResults() {
    if(this.promise) {
      return this.promise;
    }

    const loadPromise = this._getMoreResults();
    if(!loadPromise) {
      this.processPlaceholderOnResults();
      return Promise.resolve();
    }

    const middleware = this.middlewareHelperLoader.get();
    const promise = this.promise = loadPromise.catch((err) => {
      console.error('get more result error', err);
    }).then(() => {
      if(this.promise === promise) {
        this.promise = undefined;
      }

      if(middleware()) {
        const loadedWhatValues = Object.values(this.loadedWhat);
        const loadedAll = loadedWhatValues.every((v) => v);

        const length = this.list.childElementCount;
        if(loadedAll && !length) {
          this.dialogsPlaceholder?.detach(length);
          return this.processPlaceholderOnResults();
        } else if(length || loadedAll) {
          this.dialogsPlaceholder?.detach(length);
          this.emptySearchPlaceholderHideSetter?.(true);
        }
      }

      this.checkForTriggers(); // set new promise
      return this.promise;
    });

    return promise;
  }

  private getMoreSomething(peerType: SelectSearchPeerType) {
    const map: {[type in SelectSearchPeerType]: () => Promise<any>} = {
      dialogs: this.getMoreDialogs,
      contacts: this.getMoreContacts,
      channelParticipants: this.getMoreChannelParticipants,
      custom: this._getMoreCustom
    };

    const promise = map[peerType].call(this);
    return promise;
  }

  private async renderResults(peerIds: PeerId[], append?: boolean) {
    // console.log('will renderResults:', peerIds);

    // оставим только неконтакты с диалогов
    if(!this.peerType.includes('dialogs') && this.loadedWhat.contacts) {
      peerIds = await filterAsync(peerIds, (peerId) => {
        return this.managers.appUsersManager.isNonContactUser(peerId);
      });
    }

    const promises = peerIds.map(async(key) => {
      const dialogElement = appDialogsManager.addDialogNew({
        peerId: this.getPeerIdFromKey?.(key) ?? key,
        container: this.list,
        rippleEnabled: this.rippleEnabled,
        avatarSize: this.avatarSize,
        meAsSaved: this.meAsSaved,
        append,
        wrapOptions: {
          middleware: this.middlewareHelperLoader.get()
        },
        withStories: this.withStories
      });

      if(this.getPeerIdFromKey) {
        dialogElement.container.dataset.peerId = key as any as string;
      }

      (dialogElement.container as any).dialogElement = dialogElement;

      const {dom} = dialogElement;

      if(this.multiSelect) {
        const selected = this.selected.has(key);
        dom.containerEl.prepend(this.checkbox(selected));
      }

      let subtitleEl: HTMLElement | DocumentFragment;
      if(this.getSubtitleForElement) {
        subtitleEl = await this.getSubtitleForElement(key);
      }

      if(!subtitleEl) {
        subtitleEl = await this.wrapSubtitle(key);
      }

      dom.lastMessageSpan.append(subtitleEl);

      if(this.processElementAfter) {
        await this.processElementAfter(key, dialogElement);
      }
    });

    return Promise.all(promises);
  }

  public async wrapSubtitle(peerId: PeerId) {
    let subtitleEl: HTMLElement;
    if(peerId.isAnyChat()) {
      subtitleEl = await getChatMembersString(peerId.toChatId());
    } else if(peerId === rootScope.myId && this.meAsSaved) {
      subtitleEl = i18n(this.selfPresence);
    } else {
      subtitleEl = getUserStatusString(await this.managers.appUsersManager.getUser(peerId.toUserId()));
    }

    return subtitleEl;
  }

  public checkbox(selected?: boolean) {
    const checkboxField = new CheckboxField({
      round: this.design === 'round'
    });
    if(selected) {
      checkboxField.input.checked = selected;
    }

    return checkboxField.label;
  }

  public static renderEntity({key, middleware, title, avatarSize, fallbackIcon, meAsSaved = true}: {
    key: PeerId | string,
    middleware: Middleware,
    title?: string | HTMLElement,
    avatarSize: number,
    fallbackIcon?: Icon,
    meAsSaved?: boolean
  }) {
    const div = document.createElement('div');
    div.classList.add('selector-user');
    div.middlewareHelper = middleware.create();

    const avatarContainer = document.createElement('div');
    avatarContainer.classList.add('selector-user-avatar-container');
    const avatarClose = document.createElement('div');
    avatarClose.classList.add('selector-user-avatar-close');
    avatarClose.append(Icon('close'));
    const avatarEl = avatarNew({
      middleware: div.middlewareHelper.get(),
      size: avatarSize,
      isDialog: meAsSaved
    });
    avatarEl.node.classList.add('selector-user-avatar');
    avatarContainer.append(avatarEl.node, avatarClose);

    div.dataset.key = '' + key;
    const promises: Promise<any>[] = [];
    if(key.isPeerId()) {
      if(title === undefined) {
        const peerTitle = new PeerTitle();
        promises.push(peerTitle.update({peerId: key.toPeerId(), dialog: meAsSaved}));
        title = peerTitle.element;
      }

      avatarEl.render({
        peerId: key as PeerId
      });

      promises.push(avatarEl.readyThumbPromise);
    } else if(fallbackIcon) {
      avatarEl.setIcon(fallbackIcon);
    }

    if(title) {
      const t = document.createElement('div');
      t.classList.add('selector-user-title');
      if(typeof(title) === 'string') {
        t.innerHTML = title;
      } else {
        replaceContent(t, title);
        t.append(title);
      }
      div.append(t);
    }

    div.insertAdjacentElement('afterbegin', avatarContainer);

    return {element: div, avatar: avatarEl, promises};
  }

  public add({
    key,
    title,
    scroll = true,
    fireOnChange = true,
    fallbackIcon
  }: {
    key: PeerId | string,
    title?: string | HTMLElement,
    scroll?: boolean,
    fireOnChange?: boolean,
    fallbackIcon?: Icon
  }): boolean | ReturnType<typeof AppSelectPeers['renderEntity']> {
    if(this.limit && this.selected.size >= this.limit) {
      this.limitCallback?.();
      return false;
    }

    // console.trace('add');
    this.selected.add(key);

    if(!this.multiSelect || !this.input) {
      fireOnChange && this.onChange?.(this.selected.size);
      return !!this.multiSelect;
    }

    if(this.query.trim()) {
      this.clearInput();
    }

    const rendered = AppSelectPeers.renderEntity({
      key,
      middleware: this.middlewareHelper.get(),
      title,
      avatarSize: 32,
      fallbackIcon
    });
    const {element} = rendered;

    if(scroll) {
      element.classList.add('scale-in');
    }

    this.selectedContainer.insertBefore(element, this.input);
    // this.selectedScrollable.scrollTop = this.selectedScrollable.scrollHeight;
    fireOnChange && this.onChange?.(this.selected.size);

    if(scroll) {
      this.selectedScrollable.scrollIntoViewNew({
        element: this.input,
        position: 'center'
      });
    }

    return rendered;
  }

  public remove(key: PeerId | string, fireOnChange = true): boolean {
    if(!this.multiSelect) {
      return false;
    }

    if(!this.input) {
      this.selected.delete(key);
      fireOnChange && this.onChange?.(this.selected.size);
      return true;
    }

    // const div = this.selected[peerId];
    const div = this.selectedContainer.querySelector(`[data-key="${key}"]`) as HTMLElement;
    div.classList.remove('scale-in');
    void div.offsetWidth;
    div.classList.add('scale-out');

    const onAnimationEnd = () => {
      this.selected.delete(key);
      div.remove();
      div.middlewareHelper.destroy();
      fireOnChange && this.onChange?.(this.selected.size);
    };

    if(liteMode.isAvailable('animations')) {
      div.addEventListener('animationend', onAnimationEnd, {once: true});
    } else {
      onAnimationEnd();
    }

    return true;
  }

  public getSelected() {
    return [...this.selected];
  }

  public getElementByPeerId(peerId: PeerId) {
    return this.chatsContainer.querySelector<HTMLElement>(`[data-peer-id="${peerId}"]`);
  }

  public toggleElementCheckboxByPeerId(peerId: PeerId, checked?: boolean) {
    const element = this.getElementByPeerId(peerId);
    if(!element) {
      return;
    }

    const checkbox = element.querySelector('input') as HTMLInputElement;
    checkbox.checked = checked === undefined ? !checkbox.checked : checked;
  }

  public addBatch(values: any[]) {
    if(!values.length) {
      return;
    }

    values.forEach((value) => {
      this.add({
        key: value,
        scroll: false,
        fireOnChange: false
      });
      this.toggleElementCheckboxByPeerId(value, true);
    });

    this.onChange?.(this.selected.size);
  }

  public removeBatch(values: any[]) {
    if(!values.length) {
      return;
    }

    values.forEach((value) => {
      this.remove(value, false);
      this.toggleElementCheckboxByPeerId(value, false);
    });

    this.onChange?.(this.selected.size);
  }

  public addInitial(values: any[]) {
    if(!values?.length) {
      return;
    }

    this.addBatch(values);

    this.input && window.requestAnimationFrame(() => { // ! not the best place for this raf though it works
      this.selectedScrollable.scrollIntoViewNew({
        element: this.input,
        position: 'center',
        forceDirection: FocusDirection.Static
      });
    });
  }
}
