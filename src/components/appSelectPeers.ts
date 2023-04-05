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
import AvatarElement from './avatar';
import {AppManagers} from '../lib/appManagers/managers';
import filterAsync from '../helpers/array/filterAsync';
import getParticipantPeerId from '../lib/appManagers/utils/chats/getParticipantPeerId';
import getChatMembersString from './wrappers/getChatMembersString';
import getUserStatusString from './wrappers/getUserStatusString';
import {ChannelsChannelParticipants, Chat, User} from '../layer';
import canSendToUser from '../lib/appManagers/utils/users/canSendToUser';
import hasRights from '../lib/appManagers/utils/chats/hasRights';
import getDialogIndex from '../lib/appManagers/utils/dialogs/getDialogIndex';
import {generateDelimiter} from './generateDelimiter';
import SettingSection from './settingSection';
import liteMode from '../helpers/liteMode';

export type SelectSearchPeerType = 'contacts' | 'dialogs' | 'channelParticipants';
export type FilterPeerTypeByFunc = (peer: ReturnType<AppPeersManager['getPeer']>) => boolean;

// TODO: правильная сортировка для addMembers, т.е. для peerType: 'contacts', потому что там идут сначала контакты - потом неконтакты, а должно всё сортироваться по имени

export default class AppSelectPeers {
  public container = document.createElement('div');
  public list = appDialogsManager.createChatList(/* {
    handheldsSize: 66,
    avatarSize: 48
  } */);
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

  private loadedWhat: Partial<{[k in 'dialogs' | 'archived' | 'contacts' | 'channelParticipants']: true}> = {};

  private renderedPeerIds: Set<PeerId> = new Set();

  private appendTo: HTMLElement;
  private onChange: (length: number) => void;
  private peerType: SelectSearchPeerType[] = ['dialogs'];
  public renderResultsFunc: (peerIds: PeerId[]) => void | Promise<void>;
  private chatRightsActions: ChatRights[];
  private multiSelect = true;
  private noSearch: boolean;
  private rippleEnabled = true;
  private avatarSize: DialogElementSize = 'abitbigger';
  private exceptSelf = false;
  private filterPeerTypeBy: IsPeerType[] | FilterPeerTypeByFunc;

  private tempIds: {[k in keyof AppSelectPeers['loadedWhat']]: number} = {};
  private peerId: PeerId;

  private placeholder: LangPackKey;

  private selfPresence: LangPackKey = 'Presence.YourChat';

  private needSwitchList = false;

  private sectionNameLangPackKey: ConstructorParameters<typeof SettingSection>[0]['name'];
  private sectionCaption: ConstructorParameters<typeof SettingSection>[0]['caption'];

  private getSubtitleForElement: (peerId: PeerId) => HTMLElement | Promise<HTMLElement>;
  private processElementAfter: (peerId: PeerId, dialogElement: DialogElement) => void | Promise<void>;

  private managers: AppManagers;

  private design: 'round' | 'square' = 'round';
  public section: SettingSection;

  constructor(options: {
    appendTo: AppSelectPeers['appendTo'],
    managers: AppSelectPeers['managers'],
    onChange?: AppSelectPeers['onChange'],
    peerType?: AppSelectPeers['peerType'],
    peerId?: AppSelectPeers['peerId'],
    onFirstRender?: () => void,
    renderResultsFunc?: AppSelectPeers['renderResultsFunc'],
    chatRightsActions?: AppSelectPeers['chatRightsActions'],
    multiSelect?: AppSelectPeers['multiSelect'],
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
    processElementAfter?: AppSelectPeers['processElementAfter']
  }) {
    safeAssign(this, options);

    // this.noSearch ??= !this.multiSelect;

    this.container.classList.add('selector', 'selector-' + this.design);

    const f = (this.renderResultsFunc || this.renderResults).bind(this);
    this.renderResultsFunc = async(peerIds) => {
      if(this.needSwitchList) {
        this.scrollable.splitUp.replaceWith(this.list);
        this.scrollable.setVirtualContainer(this.list);
        this.needSwitchList = false;
      }

      peerIds = peerIds.filter((peerId) => {
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
      }

      return f(peerIds);
    };

    if(!this.noSearch) {
      this.input = document.createElement('input');
      this.input.classList.add('selector-search-input');
      this.input.type = 'text';
      _i18n(this.input, this.placeholder || 'SendMessageTo', undefined, 'placeholder');

      const debouncedInput = debounce(this.onInput, 200, false, true);
      this.input.addEventListener('input', debouncedInput);
    }

    if(this.multiSelect && this.input) {
      const section = new SettingSection({});
      section.innerContainer.classList.add('selector-search-section');
      const topContainer = document.createElement('div');
      topContainer.classList.add('selector-search-container');

      this.selectedContainer = document.createElement('div');
      this.selectedContainer.classList.add('selector-search');

      this.selectedContainer.append(this.input);
      topContainer.append(this.selectedContainer);
      this.selectedScrollable = new Scrollable(topContainer);

      // let delimiter = document.createElement('hr');

      attachClickEvent(this.selectedContainer, (e) => {
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
      noShadow: !!this.input || !this.sectionCaption
    });
    section.content.append(this.list);
    this.chatsContainer.append(section.container);
    this.scrollable = new Scrollable(this.chatsContainer);
    this.scrollable.setVirtualContainer(this.list);

    attachClickEvent(this.chatsContainer, (e) => {
      const target = findUpAttribute(e.target, 'data-peer-id') as HTMLElement;
      cancelEvent(e);

      if(!target) return;
      if(this.freezed) return;

      let key: PeerId | string = target.dataset.peerId;
      key = key.isPeerId() ? key.toPeerId() : key;

      if(!this.multiSelect) {
        this.add(key);
        return;
      }

      // target.classList.toggle('active');
      if(!(this.selected.has(key) ? this.remove(key) : this.add(key))) {
        return;
      }

      const checkbox = target.querySelector('input') as HTMLInputElement;
      checkbox.checked = !checkbox.checked;
    });

    this.scrollable.onScrolledBottom = () => {
      this.getMoreResults();
    };

    if(this.input) {
      this.scrollable.container.prepend(generateDelimiter());
    }

    this.container.append(this.chatsContainer);
    this.appendTo.append(this.container);

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

  private onInput = () => {
    const value = this.input.value;
    if(this.query !== value) {
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

      this.list = appDialogsManager.createChatList();

      this.promise = undefined;
      this.loadedWhat = {};
      this.query = value;
      this.renderedPeerIds.clear();
      this.needSwitchList = true;

      // console.log('selectPeers input:', this.query);
      this.getMoreResults();
    }
  };

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
      findAndSplice(dialogs, d => d.peerId === rootScope.myId); // no my account

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

    this.renderResultsFunc(dialogs.map((dialog) => dialog.peerId));

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
    }
  }

  private async filterByRights(peerId: PeerId) {
    const peer: User | Chat = await this.managers.appPeersManager.getPeer(peerId);
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
    this.renderResultsFunc(arr);
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

    const {middleware} = this.getTempId('channelParticipants');
    const promise = this.managers.appProfileManager.getParticipants(
      this.peerId.toChatId(),
      {
        _: 'channelParticipantsSearch',
        q: this.query
      },
      pageCount,
      this.list.childElementCount
    );

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

    const peerIds = participants.map((participant) => getParticipantPeerId(participant));
    indexOfAndSplice(peerIds, rootScope.myId);
    this.renderResultsFunc(peerIds);

    const count = (chatParticipants as ChannelsChannelParticipants.channelsChannelParticipants).count ?? participants.length;

    if(this.list.childElementCount >= count || participants.length < pageCount) {
      this.loadedWhat.channelParticipants = true;
    }
  }

  checkForTriggers = () => {
    this.scrollable.checkForTriggers();
  };

  private getMoreResults() {
    if(this.promise) {
      return this.promise;
    }

    const get = () => {
      if((this.peerType.includes('dialogs')/*  || this.loadedWhat.contacts */) && !this.loadedWhat.archived) { // to load non-contacts
        return this.getMoreSomething('dialogs');
      }

      if((this.peerType.includes('contacts') || this.peerType.includes('dialogs')) && !this.loadedWhat.contacts) {
        return this.getMoreSomething('contacts');
      }

      if(this.peerType.includes('channelParticipants') && !this.loadedWhat.channelParticipants) {
        return this.getMoreSomething('channelParticipants');
      }
    };

    const loadPromise = get();
    if(!loadPromise) {
      return Promise.resolve();
    }

    const promise = this.promise = loadPromise.catch((err) => {
      console.error('get more result error', err);
    }).finally(() => {
      if(this.promise === promise) {
        this.promise = undefined;
      }

      this.checkForTriggers();
    });

    return promise;
  }

  private getMoreSomething(peerType: SelectSearchPeerType) {
    const map: {[type in SelectSearchPeerType]: () => Promise<any>} = {
      dialogs: this.getMoreDialogs,
      contacts: this.getMoreContacts,
      channelParticipants: this.getMoreChannelParticipants
    };

    const promise = map[peerType].call(this);
    return promise;
  }

  private async renderResults(peerIds: PeerId[]) {
    // console.log('will renderResults:', peerIds);

    // оставим только неконтакты с диалогов
    if(!this.peerType.includes('dialogs') && this.loadedWhat.contacts) {
      peerIds = await filterAsync(peerIds, (peerId) => {
        return this.managers.appUsersManager.isNonContactUser(peerId);
      });
    }

    peerIds.forEach(async(peerId) => {
      const dialogElement = appDialogsManager.addDialogNew({
        peerId: peerId,
        container: this.scrollable,
        rippleEnabled: this.rippleEnabled,
        avatarSize: this.avatarSize
      });

      const {dom} = dialogElement;

      if(this.multiSelect) {
        const selected = this.selected.has(peerId);
        dom.containerEl.prepend(this.checkbox(selected));
      }

      let subtitleEl: HTMLElement;
      if(this.getSubtitleForElement) {
        subtitleEl = await this.getSubtitleForElement(peerId);
      }

      if(!subtitleEl) {
        subtitleEl = await this.wrapSubtitle(peerId);
      }

      dom.lastMessageSpan.append(subtitleEl);

      if(this.processElementAfter) {
        await this.processElementAfter(peerId, dialogElement);
      }
    });
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

  public checkbox(selected?: boolean) {
    const checkboxField = new CheckboxField({
      round: this.design === 'round'
    });
    if(selected) {
      checkboxField.input.checked = selected;
    }

    return checkboxField.label;
  }

  public add(
    key: PeerId | string,
    title?: string | HTMLElement,
    scroll = true,
    fireOnChange = true
  ) {
    // console.trace('add');
    this.selected.add(key);

    if(!this.multiSelect || !this.input) {
      fireOnChange && this.onChange?.(this.selected.size);
      return true;
    }

    if(this.query.trim()) {
      this.input.value = '';
      this.onInput();
    }

    const div = document.createElement('div');
    div.classList.add('selector-user', 'scale-in');

    const avatarEl = new AvatarElement();
    avatarEl.classList.add('selector-user-avatar', 'tgico', 'avatar-32');
    avatarEl.isDialog = true;

    div.dataset.key = '' + key;
    if(key.isPeerId()) {
      if(title === undefined) {
        const peerTitle = new PeerTitle();
        peerTitle.update({peerId: key.toPeerId(), dialog: true});
        title = peerTitle.element;
      }

      avatarEl.updateWithOptions({
        peerId: key as PeerId
      });
    }

    if(title) {
      if(typeof(title) === 'string') {
        div.innerHTML = title;
      } else {
        replaceContent(div, title);
        div.append(title);
      }
    }

    div.insertAdjacentElement('afterbegin', avatarEl);

    this.selectedContainer.insertBefore(div, this.input);
    // this.selectedScrollable.scrollTop = this.selectedScrollable.scrollHeight;
    fireOnChange && this.onChange?.(this.selected.size);

    if(scroll) {
      this.selectedScrollable.scrollIntoViewNew({
        element: this.input,
        position: 'center'
      });
    }

    return div;
  }

  public remove(key: PeerId | string, fireOnChange = true) {
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
      this.add(value, undefined, false, false);
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
