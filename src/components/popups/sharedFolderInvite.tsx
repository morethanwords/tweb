import PopupElement, {createPopup} from '@components/popups/indexTsx';
import filterUnique from '@helpers/array/filterUnique';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import shake from '@helpers/dom/shake';
import {ChatlistsChatlistInvite, ChatlistsChatlistUpdates, DialogFilter, Peer} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import I18n, {i18n, _i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import AppSelectPeers from '@components/appSelectPeers';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import showLimitPopup from '@components/popups/limit';

import rootScope from '@lib/rootScope';
import {createSignal, onCleanup} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';

const CLASS_NAME = 'popup-chatlist-invite';

export default async function showSharedFolderInvitePopup(options: Partial<{
  chatlistInvite: ChatlistsChatlistInvite,
  slug: string,
  filter: DialogFilter.dialogFilterChatlist,
  deleting: boolean,
  updating: boolean
}>) {
  const {chatlistInvite, slug, deleting, updating} = options;
  const managers = rootScope.managers;
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();
  const listenerSetter = new ListenerSetter();
  const givenFilter = options.filter;

  // the picker owns the popup's scrolling area, so it IS the body
  const bodyEl = document.createElement('div');
  bodyEl.classList.add('popup-body');

  const [show, setShow] = createSignal(false);
  const [confirmDisabled, setConfirmDisabled] = createSignal(false);

  const n = document.createElement('div');
  n.classList.add('menu-horizontal-scrollable');

  const nav = document.createElement('nav');
  nav.classList.add('menu-horizontal-div');

  const isAlready = chatlistInvite?._ === 'chatlists.chatlistInviteAlready';
  const isJoining = isAlready && !!chatlistInvite.missing_peers.length;
  const filter = givenFilter ?? (isAlready ? await managers.filtersStorage.getFilter(chatlistInvite.filter_id) as DialogFilter.dialogFilterChatlist : undefined);
  const titleKey = deleting ? 'SharedFolder.Link.TitleRemove' : (isJoining ? 'SharedFolder.Link.TitleAdd' : 'SharedFolder.Link.Title');

  let leaveSuggestionsPeerIds: PeerId[];
  if(deleting) {
    const peers = await managers.filtersStorage.getLeaveChatlistSuggestions(filter.id);
    leaveSuggestionsPeerIds = peers.map((peer) => getPeerId(peer));
  }

  const makeItem = () => {
    const item = document.createElement('div');
    item.classList.add('menu-horizontal-div-item');
    const i = document.createElement('i');
    i.classList.add('menu-horizontal-div-item-background');
    const span = document.createElement('span');
    span.classList.add('menu-horizontal-div-item-span');
    item.append(i, span);
    nav.append(item);
    return span;
  };

  makeItem().append(i18n('FilterAllChats'));
  const activeItem = makeItem();
  activeItem.parentElement.classList.add('active');
  activeItem.append(
    await wrapFolderTitle(filter ? filter.title : (chatlistInvite as ChatlistsChatlistInvite.chatlistsChatlistInvite).title, middleware)
  );
  makeItem().append(i18n('FilterPersonal'));

  const shadow = document.createElement('div');
  shadow.classList.add('inner-shadow', 'inner-shadow-inset');

  n.append(nav, shadow);

  const description = document.createElement('div');
  description.classList.add(CLASS_NAME + '-description', 'subtitle');
  let descriptionAddI18n: I18n.IntlElement, descriptionAddTitle: HTMLElement;
  if(deleting) {
    _i18n(description, 'SharedFolder.Link.DescriptionRemove', [await wrapFolderTitle(filter.title, middleware)]);
  } else if(!isJoining) {
    _i18n(description, isAlready ? 'SharedFolder.Link.DescriptionAlready' : 'SharedFolder.Link.Description');
  } else {
    descriptionAddI18n = new I18n.IntlElement();
    descriptionAddTitle = document.createElement('span');
    descriptionAddTitle.append(await wrapFolderTitle(filter.title, middleware));
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
      setConfirmDisabled(!length);
    }
  };

  let shouldDeselect: boolean;
  const selector: AppSelectPeers = new AppSelectPeers({
    middleware: middleware,
    appendTo: bodyEl,
    onChange: onSelectionChange,
    onFirstRender: () => {
      setShow(true);
      selector.checkForTriggers(); // ! due to zero height before mounting
    },
    multiSelect: true,
    noSearch: true,
    sectionNameLangPackKey: counterI18n.element,
    avatarSize: 'abitbigger',
    managers: managers,
    peerType: [],
    getSubtitleForElement: async(peerId) => {
      if(alreadyPeerIds?.includes(peerId)) {
        const isBroadcast = await managers.appPeersManager.isBroadcast(peerId);
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
    selector.section.title.append(selectAllI18n.element);

    attachClickEvent(selectAllI18n.element, () => {
      if(shouldDeselect) {
        selector.removeBatch(peerIds);
      } else {
        selector.addBatch(peerIds);
      }
    }, {listenerSetter: listenerSetter});
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
    const _remove = selector.remove.bind(selector);
    selector.remove = (...args) => {
      const peerId = args[0].toPeerId();
      if(alreadyPeerIds.includes(peerId)) {
        const container = selector.getElementByKey(peerId);
        shake(container);
        return false;
      }

      return _remove(...args);
    };
  }

  selector.scrollable.attachBorderListeners();
  selector.scrollable.prepend(n, description);

  const addFolderI18n = new I18n.IntlElement({
    key: deleting ? 'SharedFolder.Link.Remove' : (isJoining ? 'SharedFolder.Link.Join' : (isAlready ? 'OK' : 'SharedFolder.Link.Title'))
  });
  const addFolderText = addFolderI18n.element;
  addFolderText.classList.add(`${CLASS_NAME}-button-text`);

  // resolving closes the popup; throwing leaves it open with the button live again
  const onConfirm = async() => {
    if(isAlready && !isJoining) {
      return;
    }

    const peerIds = [...selector.selected] as PeerId[];
    if(updating) {
      await managers.filtersStorage.joinChatlistUpdates(filter.id, peerIds);
    } else if(chatlistInvite) {
      try {
        await managers.filtersStorage.joinChatlistInvite(slug, peerIds);
      } catch(error) {
        if((error as ApiError).type !== 'DIALOG_FILTERS_TOO_MUCH') {
          throw error;
        }

        showLimitPopup('folders');
      }
    } else {
      await managers.filtersStorage.leaveChatlist(filter.id, peerIds);
    }
  };

  const totalPeerIds = alreadyPeerIds ? peerIds.concat(alreadyPeerIds) : peerIds;
  const initial = deleting ? leaveSuggestionsPeerIds : totalPeerIds
  selector.addInitial(initial);
  selector.renderResultsFunc(deleting ? filterUnique(leaveSuggestionsPeerIds.concat(totalPeerIds)) : totalPeerIds);

  if(!initial.length) {
    onSelectionChange(0);
  }
  // if(isAlready && !isJoining) {
  //   selector.list.classList.add('disable-hover');
  // }

  createPopup(() => {
    onCleanup(() => {
      listenerSetter.removeAll();
      middlewareHelper.destroy();
    });

    return (
      <PopupElement class={'popup-forward ' + CLASS_NAME} closable show={show()}>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>{i18n(titleKey)}</PopupElement.Title>
        </PopupElement.Header>
        {bodyEl}
        <PopupElement.Footer>
          <PopupElement.FooterButton disabled={confirmDisabled()} callback={onConfirm}>
            {addFolderText}
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
