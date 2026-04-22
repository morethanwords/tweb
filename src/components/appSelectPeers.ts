/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatRights} from '@appManagers/appChatsManager';
import type {Dialog} from '@appManagers/appMessagesManager';
import type {AppPeersManager, IsPeerType} from '@appManagers/appPeersManager';
import appDialogsManager, {AppDialogsManager, DialogElement, DialogElementSize as DialogElementSize} from '@lib/appDialogsManager';
import rootScope from '@lib/rootScope';
import Scrollable from '@components/scrollable';
import {FocusDirection} from '@helpers/fastSmoothScroll';
import CheckboxField from '@components/checkboxField';
import {i18n, LangPackKey} from '@lib/langPack';
import findUpAttribute from '@helpers/dom/findUpAttribute';
import cancelEvent from '@helpers/dom/cancelEvent';
import InputSearch from '@components/inputSearch';
import windowSize from '@helpers/windowSize';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import filterUnique from '@helpers/array/filterUnique';
import safeAssign from '@helpers/object/safeAssign';
import {AppManagers} from '@lib/managers';
import filterAsync from '@helpers/array/filterAsync';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import getChatMembersString from '@components/wrappers/getChatMembersString';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import {ChannelParticipant, ChannelParticipantsFilter, ChannelsChannelParticipants, Chat, ChatFull, ChatParticipant, ChatParticipants, User} from '@layer';
import canSendToUser from '@appManagers/utils/users/canSendToUser';
import hasRights from '@appManagers/utils/chats/hasRights';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import SettingSection from '@components/settingSection';
import emptyPlaceholder from '@components/emptyPlaceholder';
import {Middleware, MiddlewareHelper, getMiddleware} from '@helpers/middleware';
import {createSignal, Setter, JSX, createRoot, createEffect} from 'solid-js';
import DialogsPlaceholder from '@helpers/dialogsPlaceholder';
import ListenerSetter from '@helpers/listenerSetter';
import Icon from '@components/icon';
import wrapEmojiText from '@richTextProcessor/wrapEmojiText';
import apiManagerProxy from '@lib/apiManagerProxy';
import {hideToast, toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import anchorCallback from '@helpers/dom/anchorCallback';
import SelectorSearch from '@components/selectorSearch';
import PopupPremium from '@components/popups/premium';
import formatNumber from '@helpers/number/formatNumber';
import namedPromises from '@helpers/namedPromises';
import createContextMenu from '@helpers/dom/createContextMenu';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {FOLDER_ID_ALL, REAL_FOLDERS} from '@lib/appManagers/constants';

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
  public scrollable: Scrollable/*  | ScrollableContextValue */;
  public selectorSearch: SelectorSearch;
  public inputSearch: InputSearch;
  public input: HTMLInputElement;

  // public selected: {[peerId: PeerId]: HTMLElement} = {};
  public selected = new Set<PeerId | string>();

  public freezed = false;

  private folderId = 0;
  private selectedFolderId: number;
  private offsetIndex = 0;
  private promise: Promise<any>;

  private query = '';
  private cachedContacts: PeerId[];

  private loadedWhat: Partial<{[k in 'dialogs' | 'archived' | 'contacts' | 'channelParticipants' | 'custom']: boolean}> = {};

  private renderedPeerIds: Set<PeerId> = new Set();

  private appendTo: HTMLElement;
  private onChange: (length: number) => void;
  public onSearchChange: (query: string) => void;
  private peerType: SelectSearchPeerType[] = ['dialogs'];
  public renderResultsFunc: (peerIds: PeerId[], append?: boolean) => void | Promise<void>;
  private additionalDialogParams: (key: PeerId) => Partial<Parameters<AppDialogsManager['addDialogNew']>[0]>;
  private chatRightsActions: ChatRights[];
  public multiSelect: 'enabled' | 'hidden' | 'disabled' = 'enabled';
  private multiSelectWasHidden: boolean;
  private headerSearch: boolean;
  private noSearch: boolean;
  private rippleEnabled = true;
  private avatarSize: DialogElementSize = 'abitbigger';
  private exceptSelf: boolean;
  private filterPeerTypeBy: IsPeerType[] | FilterPeerTypeByFunc;
  private channelParticipantsFilter: ChannelParticipantsFilter | ((q: string) => ChannelParticipantsFilter);
  private channelParticipantsUpdateFilter: (participant: ChannelParticipant | ChatParticipant) => boolean;
  private meAsSaved: boolean;
  private onSelect: (peerId: PeerId, adding: boolean, e: MouseEvent) => MaybePromise<void | boolean>;

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
  public starsAmountByPeer: Map<PeerId, number> = new Map();
  public onStarsAmountUpdate: () => void;
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
  public heightContainer: HTMLElement;

  public children: Array<HTMLElement>;

  private loadedFirst: boolean;
  private onFirstRender: () => void;

  constructor(options: {
    appendTo: AppSelectPeers['appendTo'],
    managers: AppSelectPeers['managers'],
    middleware: Middleware,
    onChange?: AppSelectPeers['onChange'],
    peerType?: AppSelectPeers['peerType'],
    peerId?: AppSelectPeers['peerId'],
    onFirstRender?: AppSelectPeers['onFirstRender'],
    renderResultsFunc?: AppSelectPeers['renderResultsFunc'],
    chatRightsActions?: AppSelectPeers['chatRightsActions'],
    multiSelect?: AppSelectPeers['multiSelect'] | boolean,
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
    onSelect?: AppSelectPeers['onSelect'],
    scrollable?: AppSelectPeers['scrollable'],
    getMoreCustom?: AppSelectPeers['getMoreCustom'],
    placeholderElementsGap?: number,
    withStories?: AppSelectPeers['withStories'],
    night?: boolean,
    checkboxSide?: 'right' | 'left',
    noPlaceholder?: boolean,
    excludePeerIds?: AppSelectPeers['excludePeerIds'],
    excludeMonoforums?: boolean,
    excludeBotforums?: boolean,
    placeholderSizes?: ConstructorParameters<typeof DialogsPlaceholder>[0],
    getPeerIdFromKey?: AppSelectPeers['getPeerIdFromKey'],
    additionalDialogParams?: AppSelectPeers['additionalDialogParams'],
    noInstantLoad?: boolean
  }) {
    safeAssign(this, options);

    if(typeof(options.multiSelect) === 'boolean') {
      this.multiSelect = options.multiSelect ? 'enabled' : 'disabled';
    }

    this.listenerSetter ??= new ListenerSetter();
    this.checkboxSide ??= 'right';
    this.exceptSelf ??= false;
    this.meAsSaved ??= !(this.peerType.length === 1 && this.peerType[0] === 'channelParticipants');
    this.headerSearch = /* this.multiSelect !== 'disabled' &&  */!this.noSearch;
    // this.noSearch ??= !this.multiSelect;
    this.excludePeerIds ??= new Set();
    if(this.exceptSelf) this.excludePeerIds.add(rootScope.myId);
    this.children = [];

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

    this.setMultiSelectMode(this.multiSelect);
    this.multiSelectWasHidden = this.multiSelect === 'hidden';

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

        if(options.excludeMonoforums) {
          const chat = apiManagerProxy.getChat(peerId.toChatId());
          if(chat?._ === 'channel' && chat?.pFlags?.monoforum) return false;
        }

        if(options.excludeBotforums && apiManagerProxy.isBotforum(peerId)) return false;

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

          const {requirement, starsAmount, canManageDirectMessages} = await namedPromises({
            requirement: this.managers.appUsersManager.getRequirementToContact(userId),
            starsAmount: this.managers.appPeersManager.getStarsAmount(peerId),
            canManageDirectMessages: peerId.isAnyChat() && this.managers.appChatsManager.canManageDirectMessages(peerId.toChatId())
          });

          return {peerId, userId, requirement, requiredStars: starsAmount, canManageDirectMessages};
        })).then((result) => {
          for(const {peerId, requirement, requiredStars, canManageDirectMessages} of result) {
            this.starsAmountByPeer.set(peerId.toPeerId(false), +requiredStars || 0);

            const element = this.getElementByKey(peerId.toPeerId(false));
            if(!element) {
              continue;
            }

            if(requirement?._ === 'requirementToContactPremium') {
              const lock = Icon('premium_lock', 'selector-premium-lock');
              element.append(lock);
              element.classList.add('is-premium-locked');
            } else if(+requiredStars && !canManageDirectMessages) {
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

          this.onStarsAmountUpdate?.();
        });
      }
    };

    this.heightContainer = document.createElement('div');
    this.heightContainer.classList.add('selector-height-container');
    const section = this.section = new SettingSection({
      name: this.sectionNameLangPackKey,
      caption: this.sectionCaption
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
    this.heightContainer.append(section.container);

    const hadScrollable = !!this.scrollable;
    this.scrollable ||= new Scrollable();
    this.scrollable.container.classList.add('selector-scrollable');

    this.container.append(this.scrollable.container);

    this.children.push(this.heightContainer);

    if(!this.noSearch) {
      this.selectorSearch = new SelectorSearch({
        middlewareHelper: this.middlewareHelper,
        multiSelect: this.multiSelect !== 'disabled',
        onInput: () => this.onInput(),
        onChipClick: (key) => {
          if(this.freezed) return;
          const li = this.getElementByKey(key) as HTMLElement;
          if(!li) {
            this.remove(key);
          } else {
            simulateClickEvent(li);
          }
        }
      });
      this.searchSection = this.selectorSearch.section;
      this.inputSearch = this.selectorSearch.inputSearch;
      this.input = this.selectorSearch.input;
      this.children.unshift(this.selectorSearch.gradient, this.selectorSearch.section.container);
    }

    attachClickEvent(this.container, async(e) => {
      const target = findUpAttribute(e.target, 'data-peer-id') as HTMLElement;

      if(
        !target ||
        (!target.classList.contains('row') && !target.classList.contains('btn-primary')) // * exception for 'includedChats' buttons
      ) return;
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

      const adding = !this.selected.has(key);
      if(this.onSelect) {
        const result = await this.onSelect(key, adding, e);
        if(result === false) {
          return;
        }

        if(this.multiSelect === 'disabled') {
          return;
        }
      }

      if(this.multiSelect !== 'enabled') {
        this.add({key});
        return;
      }

      // target.classList.toggle('active');
      const result = adding ? this.add({key}) : this.remove(key);
      if(!result) {
        return;
      }

      this.toggleElementCheckboxByKey(key, adding);
    });

    if(this.multiSelect === 'hidden') {
      let target: HTMLElement;
      let key: PeerId | string;
      const contextMenuButtons: ButtonMenuItemOptionsVerifiable[] = [{
        icon: 'select',
        text: 'SelectChat',
        onClick: () => {
          this.setMultiSelectMode('enabled');
          // this.add({key});
          // this.toggleElementCheckboxByKey(key, true);
          simulateClickEvent(target);
        },
        verify: () => !this.selected.has(key)
      }, {
        icon: 'close',
        text: 'Deselect',
        onClick: () => {
          // this.remove(key);
          // this.toggleElementCheckboxByKey(key, false);
          simulateClickEvent(target);
        },
        verify: () => this.selected.has(key)
      }];

      createContextMenu({
        listenTo: this.container,
        buttons: contextMenuButtons,
        findElement: (e) => findUpAttribute(e.target, 'data-peer-id') as HTMLElement,
        onOpen: (_e, _target) => {
          target = _target;
          key = target.dataset.peerId;
          key = key.isPeerId() ? key.toPeerId() : key;
        },
        listenerSetter: this.listenerSetter,
        middleware: this.middlewareHelper.get()
      });
    }

    this.scrollable.onScrolledBottom = () => {
      this.getMoreResults();
    };

    this.appendTo.append(this.container);

    const onChatParticipant = (
      participant: ChannelParticipant | ChatParticipant,
      peerId: PeerId,
      needAdd = this.channelParticipantsUpdateFilter(participant)
    ) => {
      if(needAdd) {
        this.participants.set(peerId, participant);
      } else {
        this.participants.delete(peerId);
      }

      if(needAdd) {
        this.renderResultsFunc([peerId], false);
      } else {
        this.deletePeerId(peerId);
      }
    };

    if(this.channelParticipantsUpdateFilter) this.listenerSetter.add(rootScope)('chat_participant', (update) => {
      if(update.channel_id.toPeerId(true) !== this.peerId) {
        return;
      }

      onChatParticipant(update.new_participant, update.user_id.toPeerId(false));
    });

    if(
      this.channelParticipantsUpdateFilter &&
      apiManagerProxy.getPeer(this.peerId)._ === 'chat'
    ) {
      this.listenerSetter.add(rootScope)('chat_full_update', async(chatId) => {
        if(chatId.toPeerId(true) !== this.peerId) {
          return;
        }

        const middleware = this.middlewareHelperLoader.get();
        const chatFull = await this.managers.appProfileManager.getChatFull(this.peerId.toChatId()) as ChatFull.chatFull;
        if(!middleware()) {
          return;
        }

        const participants = chatFull.participants as ChatParticipants.chatParticipants;
        const processedPeerIds = new Set<PeerId>();
        for(const participant of participants.participants) {
          const peerId = participant.user_id.toPeerId(false);
          processedPeerIds.add(peerId);
          onChatParticipant(
            participant,
            peerId,
            undefined
          );
        }

        this.participants.forEach((participant, peerId) => {
          if(!processedPeerIds.has(peerId)) {
            onChatParticipant(participant, peerId, false);
          }
        });
      });
    }

    options.middleware.onDestroy(() => {
      this.destroy();
    });

    if(!options.noInstantLoad) {
      this.loadFirst();
    }

    if(!hadScrollable) {
      (this.scrollable as Scrollable).append(...this.children);
    }
  }

  public loadFirst() {
    if(this.loadedFirst) {
      return;
    }

    this.loadedFirst = true;
    // WARNING TIMEOUT
    setTimeout(() => {
      const getResultsPromise = this.getMoreResults() as Promise<any>;
      if(this.onFirstRender) {
        getResultsPromise.then(() => {
          this.onFirstRender();
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
    this.selectorSearch?.destroy();
    this.inputSearch?.remove();
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

  private _setFolderId(value: string) {
    this.folderId = (value ? FOLDER_ID_ALL : this.selectedFolderId) ?? FOLDER_ID_ALL;
  }

  private onInput = () => {
    const value = this.inputSearch.value;
    if(this.query === value) {
      return;
    }

    if(this.peerType.includes('contacts') || this.peerType.includes('dialogs')) {
      this.cachedContacts = undefined;
    }

    if(this.peerType.includes('dialogs')) {
      this._setFolderId(value);
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
    this.onSearchChange?.(value);
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
    this.inputSearch.value = '';
    this.onInput();
  }

  private async renderSaved() {
    if(
      !this.exceptSelf &&
      !this.offsetIndex &&
      this.folderId === FOLDER_ID_ALL &&
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

        if(this.selectedFolderId !== undefined) {
          this.loadedWhat.archived = true;
        } else {
          this.offsetIndex = 0;
          this.folderId = 1;
          return this.getMoreDialogs();
        }
      } else {
        this.loadedWhat.archived = true;
      }

      if(this.canLoadContacts()) {
        return this.getMoreContacts();
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

  private canLoadContacts() {
    return !(this.loadedWhat.contacts || !REAL_FOLDERS.has(this.folderId));
  }

  private async getMoreContacts() {
    if(!this.canLoadContacts()) {
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

    if((this.peerType.includes('contacts') || this.peerType.includes('dialogs')) && !this.loadedWhat.contacts && this.canLoadContacts()) {
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
            const query$ = query();
            setDescription(
              query$.trim() ?
                i18n('RequestJoin.List.SearchEmpty', [wrapEmojiText(query$)]) :
                i18n('Search.EmptyQuery')
            );
          });

          createEffect(() => {
            this.section.container.style.opacity = hide() ? '1' : '0';
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

          this.heightContainer.append(container);
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
        withStories: this.withStories,
        ...(this.additionalDialogParams?.(key) || {})
      });

      if(this.getPeerIdFromKey) {
        dialogElement.container.dataset.peerId = key as any as string;
      }

      (dialogElement.container as any).dialogElement = dialogElement;

      const {dom} = dialogElement;

      if(this.multiSelect !== 'disabled') {
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
    } else if(peerId === rootScope.myId) {
      subtitleEl = i18n(this.selfPresence);
    } else {
      subtitleEl = getUserStatusString(await this.managers.appUsersManager.getUser(peerId.toUserId()));
    }

    return subtitleEl;
  }

  public checkbox(
    selected?: boolean,
    color: ConstructorParameters<typeof CheckboxField>[0]['color'] = 'secondary'
  ) {
    const checkboxField = new CheckboxField({
      round: this.design === 'round',
      color
    });
    if(selected) {
      checkboxField.input.checked = selected;
    }

    return checkboxField.label;
  }

  public static renderEntity = SelectorSearch.renderEntity;

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
  }): boolean | ReturnType<typeof SelectorSearch['renderEntity']> {
    if(this.limit && this.selected.size >= this.limit) {
      this.limitCallback?.();
      return false;
    }

    // console.trace('add');
    this.selected.add(key);

    if(this.multiSelect !== 'enabled' || !this.input) {
      fireOnChange && this.onChange?.(this.selected.size);
      return this.multiSelect !== 'disabled';
    }

    if(this.query.trim()) {
      this.clearInput();
    }

    const rendered = this.selectorSearch.addChip({
      key,
      middleware: this.middlewareHelper.get(),
      title,
      scroll,
      fallbackIcon
    });
    fireOnChange && this.onChange?.(this.selected.size);

    return rendered;
  }

  public remove(key: PeerId | string, fireOnChange = true): boolean {
    if(this.multiSelect !== 'enabled') {
      return false;
    }

    const onRemoved = () => {
      this.selected.delete(key);
      if(!this.selected.size && this.multiSelectWasHidden) {
        this.setMultiSelectMode('hidden');
      }
      fireOnChange && this.onChange?.(this.selected.size);
    };

    onRemoved();

    if(this.selectorSearch) {
      this.selectorSearch.removeChip(key);
    }

    return true;
  }

  public getSelected() {
    return [...this.selected];
  }

  public getElementByKey(key: PeerId | string) {
    return this.container.querySelector<HTMLElement>(`.row[data-peer-id="${key}"]`);
  }

  public toggleElementCheckboxByKey(key: PeerId | string, checked?: boolean) {
    const checkboxes = this.findCheckboxes(key);
    const value = checked === undefined ? undefined : checked;
    checkboxes.forEach((checkbox) => checkbox.checked = value ?? !checkbox.checked);
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
      this.toggleElementCheckboxByKey(value, true);
    });

    this.onChange?.(this.selected.size);
  }

  public removeBatch(values: any[], fireOnChange = true) {
    if(!values.length) {
      return;
    }

    values.forEach((value) => {
      this.remove(value, false);
      this.toggleElementCheckboxByKey(value, false);
    });

    if(fireOnChange) {
      this.onChange?.(this.selected.size);
    }
  }

  private findCheckboxes(key: PeerId | string): HTMLInputElement[] {
    const query = `[data-peer-id="${key}"] input`;
    const containers: Element[] = [this.container];

    // if(!this.container.closest('.selector')) {
    //   const selectorSearch = document.querySelector('.selector-search');
    //   if(selectorSearch) containers.push(selectorSearch);
    // }

    return containers.flatMap((c) => [...c.querySelectorAll<HTMLInputElement>(query)]);
  }

  public addInitial(values: any[]) {
    if(!values?.length) {
      return;
    }

    this.addBatch(values);

    this.selectorSearch && window.requestAnimationFrame(() => { // ! not the best place for this raf though it works
      this.selectorSearch.scrollToInput(FocusDirection.Static);
    });
  }

  public setMultiSelectMode(mode: 'enabled' | 'hidden' | 'disabled') {
    this.multiSelect = mode;
    this.container.classList.toggle('selector-multiselect-hidden', mode === 'hidden');
  }

  public setFolderId(folderId: number) {
    const willBeFolderId = folderId || undefined;
    if(this.selectedFolderId === willBeFolderId) {
      return;
    }

    this.selectedFolderId = willBeFolderId;
    if(!this.loadedFirst) {
      this._setFolderId('');
      return;
    }

    this.query = '\x01'; // force onInput to detect a change
    this.onInput();
  }
}
