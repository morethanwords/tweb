/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import filterUnique from '../../helpers/array/filterUnique';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import shake from '../../helpers/dom/shake';
import toggleDisability from '../../helpers/dom/toggleDisability';
import safeAssign from '../../helpers/object/safeAssign';
import {ChatlistsChatlistInvite, ChatlistsChatlistUpdates, DialogFilter, Peer} from '../../layer';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import I18n, {i18n, _i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import AppSelectPeers from '../appSelectPeers';
import Button from '../button';
import wrapFolderTitle from '../wrappers/folderTitle';
import showLimitPopup from './limit';

const CLASS_NAME = 'popup-chatlist-invite';
export default class PopupSharedFolderInvite extends PopupElement {
  private selector: AppSelectPeers;
  private chatlistInvite: ChatlistsChatlistInvite;
  private slug: string;
  private filter: DialogFilter.dialogFilterChatlist;
  private deleting: boolean;
  private updating: boolean;

  constructor(options: Partial<{
    chatlistInvite: PopupSharedFolderInvite['chatlistInvite'],
    slug: PopupSharedFolderInvite['slug'],
    filter: PopupSharedFolderInvite['filter'],
    deleting: PopupSharedFolderInvite['deleting'],
    updating: PopupSharedFolderInvite['updating']
  }>) {
    super('popup-forward ' + CLASS_NAME, {
      closable: true,
      overlayClosable: true,
      body: true,
      footer: true,
      title: true,
      withConfirm: true
    });

    safeAssign(this, options);

    this.construct();
  }

  public async construct() {
    const n = document.createElement('div');
    n.classList.add('menu-horizontal-scrollable');

    const nav = document.createElement('nav');
    nav.classList.add('menu-horizontal-div');

    const {chatlistInvite, deleting, updating} = this;
    const isAlready = chatlistInvite?._ === 'chatlists.chatlistInviteAlready';
    const isJoining = isAlready && !!chatlistInvite.missing_peers.length;
    const filter = this.filter ??= isAlready ? await this.managers.filtersStorage.getFilter(chatlistInvite.filter_id) as DialogFilter.dialogFilterChatlist : undefined;

    this.title.append(i18n(deleting ? 'SharedFolder.Link.TitleRemove' : (isJoining ? 'SharedFolder.Link.TitleAdd' : 'SharedFolder.Link.Title')));

    let leaveSuggestionsPeerIds: PeerId[];
    if(deleting) {
      const peers = await this.managers.filtersStorage.getLeaveChatlistSuggestions(this.filter.id);
      leaveSuggestionsPeerIds = peers.map((peer) => getPeerId(peer));
    }

    const makeItem = () => {
      const item = document.createElement('div');
      item.classList.add('menu-horizontal-div-item');
      const span = document.createElement('span');
      span.classList.add('menu-horizontal-div-item-span');
      item.append(span);
      nav.append(item);
      return span;
    };

    makeItem().append(i18n('FilterAllChats'));
    const activeItem = makeItem();
    activeItem.parentElement.classList.add('active');
    activeItem.append(
      await wrapFolderTitle(filter ? filter.title : (chatlistInvite as ChatlistsChatlistInvite.chatlistsChatlistInvite).title, this.middlewareHelper.get()),
      document.createElement('i')
    );
    makeItem().append(i18n('FilterPersonal'));

    const shadow = document.createElement('div');
    shadow.classList.add('inner-shadow', 'inner-shadow-inset');

    n.append(nav, shadow);

    const description = document.createElement('div');
    description.classList.add(CLASS_NAME + '-description', 'subtitle');
    let descriptionAddI18n: I18n.IntlElement, descriptionAddTitle: HTMLElement;
    if(deleting) {
      _i18n(description, 'SharedFolder.Link.DescriptionRemove', [await wrapFolderTitle(filter.title, this.middlewareHelper.get())]);
    } else if(!isJoining) {
      _i18n(description, isAlready ? 'SharedFolder.Link.DescriptionAlready' : 'SharedFolder.Link.Description');
    } else {
      descriptionAddI18n = new I18n.IntlElement();
      descriptionAddTitle = document.createElement('span');
      descriptionAddTitle.append(await wrapFolderTitle(filter.title, this.middlewareHelper.get()));
    }

    const counterI18n = new I18n.IntlElement();

    const onSelectionChange = (length: number) => {
      if(alreadyPeerIds && isJoining) {
        length = Math.max(0, length - alreadyPeerIds.length);
      }

      counterI18n.update({
        key: deleting ? 'SharedFolder.Link.ChatsRemove' : (isJoining ? 'SharedFolder.Link.ChatsAdd' : (isAlready ? 'SharedFolder.Link.ChatsAlready' : 'SharedFolder.Link.Chats')),
        args: [i18n('Chats', [length])]
      });

      selectAllI18n?.update({
        key: (shouldDeselect = length === peerIds.length) ? 'DeselectAll' : 'SelectAll'
      });

      descriptionAddI18n?.update({
        key: 'SharedFolder.Link.DescriptionAdd',
        args: [i18n('Chats', [length]), descriptionAddTitle]
      });

      if(selectAllI18n) {
        if(length) addFolderText.dataset.badge = '' + length;
        addFolderText.classList.toggle('has-badge', !!length);
      }

      if(deleting) {
        addFolderI18n.update({
          key: length ? 'SharedFolder.Link.Remove' : 'SharedFolder.Link.TitleRemove'
        });
      }

      if(!deleting) {
        toggleDisability([this.btnConfirm], !length);
      }
    };

    let shouldDeselect: boolean;
    this.selector = new AppSelectPeers({
      middleware: this.middlewareHelper.get(),
      appendTo: this.body,
      onChange: onSelectionChange,
      onFirstRender: () => {
        this.show();
        this.selector.checkForTriggers(); // ! due to zero height before mounting
      },
      multiSelect: true,
      noSearch: true,
      sectionNameLangPackKey: counterI18n.element,
      avatarSize: 'abitbigger',
      managers: this.managers,
      peerType: [],
      getSubtitleForElement: async(peerId) => {
        if(alreadyPeerIds?.includes(peerId)) {
          const isBroadcast = await this.managers.appPeersManager.isBroadcast(peerId);
          return i18n(isBroadcast ? 'SharedFolder.Link.ChannelAlready' : 'SharedFolder.Link.ChatAlready');
        }
      },
      processElementAfter: (peerId, dialogElement) => {
        if(alreadyPeerIds?.includes(peerId)) {
          dialogElement.dom.containerEl.classList.add('already');
        }
      }
    });

    let selectAllI18n: I18n.IntlElement;
    if(!isAlready || isJoining) {
      selectAllI18n = new I18n.IntlElement();
      selectAllI18n.element.classList.add('sidebar-left-section-name-right');
      this.selector.section.title.append(selectAllI18n.element);

      attachClickEvent(selectAllI18n.element, () => {
        if(shouldDeselect) {
          this.selector.removeBatch(peerIds);
        } else {
          this.selector.addBatch(peerIds);
        }
      }, {listenerSetter: this.listenerSetter});
    }

    let peerIds: PeerId[];
    if(chatlistInvite) {
      const peers = isJoining ? chatlistInvite.missing_peers : (isAlready ? chatlistInvite.already_peers : chatlistInvite.peers);
      peerIds = peers.map((peer) => getPeerId(peer));
    } else {
      peerIds = filter.includePeerIds;
    }

    let alreadyPeerIds: PeerId[];
    if(isAlready) {
      alreadyPeerIds = chatlistInvite.already_peers.map((peer) => getPeerId(peer));
    }

    if(alreadyPeerIds) {
      const _remove = this.selector.remove.bind(this.selector);
      this.selector.remove = (...args) => {
        const peerId = args[0].toPeerId();
        if(alreadyPeerIds.includes(peerId)) {
          const container = this.selector.getElementByPeerId(peerId);
          shake(container);
          return false;
        }

        return _remove(...args);
      };
    }

    this.scrollable = this.selector.scrollable;
    this.attachScrollableListeners();

    this.scrollable.prepend(n, description);

    this.btnConfirm.classList.add(`${CLASS_NAME}-button`);
    const addFolderI18n = new I18n.IntlElement({
      key: deleting ? 'SharedFolder.Link.Remove' : (isJoining ? 'SharedFolder.Link.Join' : (isAlready ? 'OK' : 'SharedFolder.Link.Title'))
    });
    const addFolderText = addFolderI18n.element;
    addFolderText.classList.add(`${CLASS_NAME}-button-text`);
    this.btnConfirm.append(addFolderText);
    this.footer.append(this.btnConfirm);

    attachClickEvent(this.btnConfirm, () => {
      if(isAlready && !isJoining) {
        this.hide();
        return;
      }

      let promise: Promise<any>;

      const toggle = toggleDisability([this.btnConfirm], true);

      const peerIds = [...this.selector.selected] as PeerId[];
      if(updating) {
        promise = this.managers.filtersStorage.joinChatlistUpdates(this.filter.id, peerIds);
      } else if(chatlistInvite) {
        promise = this.managers.filtersStorage.joinChatlistInvite(
          this.slug,
          peerIds
        ).catch((error: ApiError) => {
          if(error.type === 'DIALOG_FILTERS_TOO_MUCH') {
            showLimitPopup('folders');
            this.hide();
          } else {
            throw error;
          }
        });
      } else {
        promise = this.managers.filtersStorage.leaveChatlist(this.filter.id, peerIds);
      }

      promise.then(() => {
        this.hide();
      }, (error: ApiError) => {
        toggle();
        throw error;
      });
    }, {listenerSetter: this.listenerSetter});

    const totalPeerIds = alreadyPeerIds ? peerIds.concat(alreadyPeerIds) : peerIds;
    const initial = deleting ? leaveSuggestionsPeerIds : totalPeerIds
    this.selector.addInitial(initial);
    this.selector.renderResultsFunc(deleting ? filterUnique(leaveSuggestionsPeerIds.concat(totalPeerIds)) : totalPeerIds);

    if(!initial.length) {
      onSelectionChange(0);
    }
    // if(isAlready && !isJoining) {
    //   this.selector.list.classList.add('disable-hover');
    // }

    this.body.after(this.footer);
  }
}
