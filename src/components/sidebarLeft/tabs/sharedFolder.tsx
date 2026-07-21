import {Component, onMount} from 'solid-js';
import filterUnique from '@helpers/array/filterUnique';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import shake from '@helpers/dom/shake';
import toggleDisability from '@helpers/dom/toggleDisability';
import {Chat, DialogFilter, User} from '@layer';
import appDialogsManager, {DialogElement} from '@lib/appDialogsManager';
import hasRights from '@appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import I18n, {LangPackKey, i18n} from '@lib/langPack';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import rootScope from '@lib/rootScope';
import AppSelectPeers from '@components/appSelectPeers';
import ButtonIcon from '@components/buttonIcon';
import confirmationPopup from '@components/confirmationPopup';
import SettingSection from '@components/settingSection';
import {toastNew} from '@components/toast';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import getChatMembersString from '@components/wrappers/getChatMembersString';
import {InviteLink} from '@components/sidebarLeft/tabs/inviteLink';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppSharedFolderTab} from '@components/solidJsTabs/tabs';

const SharedFolder: Component = () => {
  const [tab] = useSuperTab<typeof AppSharedFolderTab>();
  const promiseCollector = usePromiseCollector();
  const {lottieLoader} = useHotReloadGuard();

  let filter = tab.payload.filter;
  const chatlistInvite = tab.payload.chatlistInvite;

  let caption: HTMLElement;
  let stickerContainer: HTMLElement;
  let descriptionI18n: I18n.IntlElement;
  let descriptionTitle: HTMLElement;
  let chatsTitleI18n: I18n.IntlElement;
  let confirmBtn: HTMLElement;
  let loadAnimationPromise: Promise<any>;
  let animation: LottiePlayer;
  let selector: AppSelectPeers;
  const elementMap: Map<PeerId, DialogElement> = new Map();

  const canSelectPeer = (peer: Chat | User) => {
    if(!peer || !chatlistInvite) {
      return false;
    }

    if(peer._ === 'user') {
      return false;
    }

    return !!getPeerActiveUsernames(peer).length || hasRights(peer as Chat.channel | Chat.chat, 'invite_links');
  };

  const updateDescription = (length = chatlistInvite ? chatlistInvite.peers.length : undefined) => {
    if(!chatlistInvite) {
      descriptionI18n.compareAndUpdate({key: 'SharedFolder.NoChats'});
      chatsTitleI18n.compareAndUpdate({key: 'SharedFolder.NoChats.Title'});
    } else {
      descriptionI18n.update({
        key: 'SharedFolder.Edit.Description',
        args: [
          descriptionTitle,
          i18n('Chats', [length])
        ]
      });

      chatsTitleI18n.update({
        key: 'ChatsSelected',
        args: [length]
      });
    }
  };

  const onSelectChange = (length: number) => {
    updateDescription(length);
    if(!chatlistInvite) {
      return;
    }

    const peerIds = [...selector.selected];
    const prev = chatlistInvite.peers.map((peer) => getPeerId(peer));
    const isSame = prev.length === peerIds.length && prev.every((peerId) => peerIds.includes(peerId));
    confirmBtn.classList.toggle('hide', isSame);
  };

  const renderResults = async(peerIds: PeerId[]) => {
    const promises = peerIds.map(async(peerId) => {
      const peer = await tab.managers.appPeersManager.getPeer(peerId);

      const dialogElement = appDialogsManager.addDialogNew({
        peerId,
        container: selector.list,
        rippleEnabled: true,
        avatarSize: 'abitbigger',
        meAsSaved: false,
        wrapOptions: {
          middleware: tab.middlewareHelper.get()
        }
      });

      const {dom} = dialogElement;

      elementMap.set(peerId, dialogElement);

      const selected = selector.selected.has(peerId);
      dom.containerEl.append(selector.checkbox(selected));

      const canSelect = canSelectPeer(peer);
      if(!canSelect) {
        dom.containerEl.classList.add('cant-select');
      }

      let subtitle: HTMLElement;
      if(peer._ === 'user') {
        subtitle = i18n(peer.pFlags.bot ? 'SharedFolder.Cant.ShareBots' : 'SharedFolder.Cant.ShareUsers');
      } else if(!canSelect) {
        subtitle = i18n('SharedFolder.Cant.Share');
      } else {
        subtitle = await getChatMembersString(peer.id, undefined, peer);
      }

      dom.lastMessageSpan.append(subtitle);
    });

    return Promise.all(promises).then(() => {});
  };

  tab.isConfirmationNeededOnClose = () => {
    if(confirmBtn.classList.contains('hide')) return;
    return confirmationPopup({
      descriptionLangKey: 'BotWebViewChangesMayNotBeSaved',
      button: {
        isDanger: true,
        langKey: 'BotWebViewCloseAnyway'
      }
    });
  };

  (tab as any)._onOpenAfterTimeout = () => {
    loadAnimationPromise.then(() => {
      animation.autoplay = true;
      animation.play();
    });
  };

  onMount(() => {
    tab.container.classList.add('edit-folder-container', 'shared-folder-container');
    caption = document.createElement('div');
    caption.classList.add('caption');
    descriptionI18n = new I18n.IntlElement();
    caption.append(descriptionI18n.element);
    stickerContainer = document.createElement('div');
    stickerContainer.classList.add('sticker-container');
    confirmBtn = ButtonIcon('check btn-confirm hide blue');

    tab.header.append(confirmBtn);

    tab.content.remove();

    tab.listenerSetter.add(rootScope)('filter_update', (updatedFilter) => {
      if(filter.id === updatedFilter.id) {
        filter = updatedFilter as DialogFilter.dialogFilterChatlist;
      }
    });

    let linkSection: SettingSection;
    if(chatlistInvite) {
      const section = linkSection = new SettingSection({name: 'InviteLink'});

      const inviteLink: InviteLink = new InviteLink({
        buttons: [{
          icon: 'copy',
          text: 'CopyLink',
          onClick: () => inviteLink.copyLink()
        }, {
          icon: 'delete',
          className: 'danger',
          text: 'DeleteLink',
          onClick: () => {
            tab.managers.filtersStorage.deleteExportedInvite(
              filter.id,
              chatlistInvite.url
            ).then(() => {
              tab.eventListener.dispatchEvent('delete');
              tab.close();
            });
          }
        }],
        listenerSetter: tab.listenerSetter,
        url: chatlistInvite.url
      });

      section.content.append(inviteLink.container);
    }

    {
      const titleI18n = chatsTitleI18n = new I18n.IntlElement();

      selector = new AppSelectPeers({
        middleware: tab.middlewareHelper.get(),
        appendTo: tab.container,
        onChange: onSelectChange,
        peerType: [],
        renderResultsFunc: renderResults,
        sectionNameLangPackKey: titleI18n.element,
        sectionCaption: 'SharedFolder.Edit.Subtitle',
        managers: tab.managers,
        noSearch: true,
        multiSelect: true
      });

      selector.scrollable.attachBorderListeners(tab.container);

      const chatlistPeers = chatlistInvite?.peers ?? [];
      const selectedPeers = chatlistPeers.map((peer) => getPeerId(peer));
      selector.addInitial(selectedPeers);

      const combinedPeerIds = filterUnique(selectedPeers.concat(filter.includePeerIds));

      promiseCollector.collect((async() => {
        const peers = await Promise.all(combinedPeerIds.map((peerId) => tab.managers.appPeersManager.getPeer(peerId)));
        const ratings: Map<typeof peers[0], number> = new Map();
        const peerIds: Map<typeof peers[0], PeerId> = new Map();
        const peersMap: Map<PeerId, typeof peers[0]> = new Map();
        peers.forEach((peer) => {
          const peerId = peer.id.toPeerId(peer._ !== 'user');
          peerIds.set(peer, peerId);
          peersMap.set(peerId, peer);

          let rating = 0;
          if(!canSelectPeer(peer)) {
            rating = -1;
          } else if(selector.selected.has(peerId)) {
            rating = 1;
          }

          ratings.set(peer, rating);
        });
        peers.sort((a, b) => ratings.get(b) - ratings.get(a));
        selector.renderResultsFunc(peers.map((peer) => peerIds.get(peer)));

        const _add = selector.add.bind(selector);
        selector.add = (options) => {
          const peerId = options.key.toPeerId();
          const dialogElement = elementMap.get(peerId as PeerId);
          const {container} = dialogElement;
          if(container.classList.contains('cant-select')) {
            let langPackKey: LangPackKey;
            if(peerId.isUser()) {
              langPackKey = 'SharedFolder.Toast.NoPrivate';
            } else {
              const peer = peersMap.get(peerId) as Chat.channel | Chat.chat;
              langPackKey = (peer as Chat.channel).pFlags.broadcast ? 'SharedFolder.Toast.NoAdminChannel' : 'SharedFolder.Toast.NoAdminGroup';
            }

            toastNew({langPackKey});
            shake(container);
            return;
          }

          return _add(options);
        };

        const _remove = selector.remove.bind(selector);
        selector.remove = (...args) => {
          const peerId = args[0].toPeerId();
          if(selector.selected.size <= 1) {
            shake(elementMap.get(peerId).container);
            return false;
          }

          return _remove(...args);
        };
      })());
    }

    attachClickEvent(confirmBtn, () => {
      const toggle = toggleDisability([confirmBtn], true);
      tab.managers.filtersStorage.editExportedInvite(
        filter.id,
        chatlistInvite.url,
        [...selector.selected] as PeerId[],
        filter.title.text
      ).then((chatlistInvite) => {
        tab.eventListener.dispatchEvent('edit', chatlistInvite);
        tab.close();
      }, (error: ApiError) => {
        toggle();
        throw error;
      });
    }, {listenerSetter: tab.listenerSetter});

    selector.scrollable.prepend(...[
      stickerContainer,
      caption,
      linkSection?.container
    ].filter(Boolean));

    promiseCollector.collect(Promise.all([
      loadAnimationPromise = lottieLoader.loadAnimationFromURLManually('Folders_Shared').then(async(cb) => {
        const player = await cb({
          container: stickerContainer,
          loop: false,
          autoplay: false,
          width: 86,
          height: 86
        });

        animation = player;

        return lottieLoader.waitForFirstFrame(player);
      }),

      wrapFolderTitle(filter.title, tab.middlewareHelper.get()).then((title) => {
        descriptionTitle = document.createElement('span');
        descriptionTitle.append(title);
        updateDescription();
      })
    ]));
  });

  return null;
};

export default SharedFolder;
