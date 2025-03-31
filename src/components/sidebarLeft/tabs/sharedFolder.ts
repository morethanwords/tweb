/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import filterUnique from '../../../helpers/array/filterUnique';
import {copyTextToClipboard} from '../../../helpers/clipboard';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import shake from '../../../helpers/dom/shake';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import ListenerSetter from '../../../helpers/listenerSetter';
import {Chat, DialogFilter, ExportedChatlistInvite, User} from '../../../layer';
import appDialogsManager, {DialogElement} from '../../../lib/appManagers/appDialogsManager';
import appImManager from '../../../lib/appManagers/appImManager';
import hasRights from '../../../lib/appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '../../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import getPeerId from '../../../lib/appManagers/utils/peers/getPeerId';
import I18n, {LangPackKey, i18n} from '../../../lib/langPack';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import wrapPlainText from '../../../lib/richTextProcessor/wrapPlainText';
import lottieLoader, {LottieLoader} from '../../../lib/rlottie/lottieLoader';
import RLottiePlayer from '../../../lib/rlottie/rlottiePlayer';
import rootScope from '../../../lib/rootScope';
import AppSelectPeers from '../../appSelectPeers';
import Button from '../../button';
import ButtonIcon from '../../buttonIcon';
import ButtonMenuToggle from '../../buttonMenuToggle';
import type {ConfirmedPaymentResult} from '../../chat/paidMessagesInterceptor';
import confirmationPopup from '../../confirmationPopup';
import PopupPickUser from '../../popups/pickUser';
import ripple from '../../ripple';
import SettingSection from '../../settingSection';
import {SliderSuperTabEventable} from '../../sliderTab';
import {toastNew} from '../../toast';
import wrapFolderTitle from '../../wrappers/folderTitle';
import getChatMembersString from '../../wrappers/getChatMembersString';

export class InviteLink {
  public container: HTMLDivElement;
  public textElement: HTMLDivElement;
  public button: HTMLButtonElement;
  public buttonText: HTMLSpanElement
  public onButtonClick: () => void;

  public url: string;

  constructor({
    buttons,
    button,
    onButtonClick,
    listenerSetter,
    url,
    noRightButton,
    onClick
  }: {
    buttons?: Parameters<typeof ButtonMenuToggle>[0]['buttons'],
    button?: HTMLButtonElement | false,
    onButtonClick?: () => void,
    listenerSetter: ListenerSetter,
    url?: string,
    noRightButton?: boolean,
    onClick?: () => void
  }) {
    this.onButtonClick = onButtonClick;

    const linkContainer = this.container = document.createElement('div');
    linkContainer.classList.add('invite-link-container');

    const link = document.createElement('div');
    link.classList.add('invite-link', 'rp-overflow');

    const text = this.textElement = document.createElement('div');
    text.classList.add('invite-link-text');

    let rightButton: HTMLElement;
    if(buttons) {
      rightButton = ButtonMenuToggle({
        buttons,
        direction: 'bottom-left',
        buttonOptions: {noRipple: true},
        listenerSetter
      });
    } else if(!noRightButton) {
      rightButton = ButtonIcon('copy', {noRipple: true});
      attachClickEvent(rightButton, () => this.copyLink(), {listenerSetter});
    }

    if(rightButton) rightButton.classList.add('invite-link-menu');

    if(!button && button !== false) {
      button = Button('', {text: 'ShareLink'});
      this.buttonText = button.lastElementChild as HTMLSpanElement;
      attachClickEvent(button, () => {
        if(this.onButtonClick) this.onButtonClick();
        else this.shareLink();
      }, {listenerSetter});
    }

    if(button) {
      this.button = button;
      button.className = 'btn-primary btn-color-primary invite-link-button';
    }

    if(url) this.setUrl(url);
    ripple(link);
    link.append(...[
      text,
      rightButton
    ].filter(Boolean));

    linkContainer.append(link, button || '');

    attachClickEvent(link, onClick || (() => this.copyLink()), {listenerSetter});
  }

  public setUrl(url: string) {
    let s = url;
    if(s.includes('//')) {
      s = url.split('//').slice(1).join('//');
    }
    this.textElement.replaceChildren(wrapPlainText(s));
    this.url = url;
  }

  public copyLink = (url: string = this.url) => {
    copyTextToClipboard(url);
    toastNew({langPackKey: 'LinkCopied'});
  };

  public shareLink = (url: string = this.url) => {
    PopupPickUser.createSharingPicker({
      onSelect: async(peerId) => {
        // Cannot use normal import here :(
        const {default: PaidMessagesInterceptor, PAYMENT_REJECTED} = await import('../../chat/paidMessagesInterceptor');

        const preparedPaymentResult = await PaidMessagesInterceptor.prepareStarsForPayment({messageCount: 1, peerId});
        if(preparedPaymentResult === PAYMENT_REJECTED) throw new Error();

        rootScope.managers.appMessagesManager.sendText({
          peerId,
          text: url,
          confirmedPaymentResult: preparedPaymentResult as ConfirmedPaymentResult
        });
        appImManager.setInnerPeer({peerId});
      }
    });
  };
}

export default class AppSharedFolderTab extends SliderSuperTabEventable<{
  delete: () => void,
  edit: (chatlistInvite: ExportedChatlistInvite) => void
}> {
  private caption: HTMLElement;
  private stickerContainer: HTMLElement;
  private descriptionI18n: I18n.IntlElement;
  private descriptionTitle: HTMLElement;
  private chatsTitleI18n: I18n.IntlElement;
  private confirmBtn: HTMLElement;

  private loadAnimationPromise: ReturnType<LottieLoader['waitForFirstFrame']>;
  private animation: RLottiePlayer;

  public filter: DialogFilter.dialogFilterChatlist;
  public chatlistInvite: ExportedChatlistInvite;
  private selector: AppSelectPeers;

  private elementMap: Map<PeerId, DialogElement>;

  public isConfirmationNeededOnClose = () => {
    if(this.confirmBtn.classList.contains('hide')) return;
    return confirmationPopup({
      descriptionLangKey: 'BotWebViewChangesMayNotBeSaved',
      button: {
        isDanger: true,
        langKey: 'BotWebViewCloseAnyway'
      }
    });
  };

  public static getInitArgs() {
    return {
      animationData: lottieLoader.loadAnimationFromURLManually('Folders_Shared')
    };
  }

  public async init(p: ReturnType<typeof AppSharedFolderTab['getInitArgs']> = AppSharedFolderTab.getInitArgs()) {
    this.container.classList.add('edit-folder-container', 'shared-folder-container');
    this.caption = document.createElement('div');
    this.caption.classList.add('caption');
    this.descriptionI18n = new I18n.IntlElement();
    this.caption.append(this.descriptionI18n.element);
    this.stickerContainer = document.createElement('div');
    this.stickerContainer.classList.add('sticker-container');
    this.confirmBtn = ButtonIcon('check btn-confirm hide blue');

    this.header.append(this.confirmBtn);

    this.elementMap = new Map();

    this.content.remove();

    this.setTitle('SharedFolder.Edit.Title');

    this.listenerSetter.add(rootScope)('filter_update', (filter) => {
      if(this.filter.id === filter.id) {
        this.filter = filter as DialogFilter.dialogFilterChatlist;
      }
    });

    let linkSection: SettingSection;
    if(this.chatlistInvite) {
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
            this.managers.filtersStorage.deleteExportedInvite(
              this.filter.id,
              this.chatlistInvite.url
            ).then(() => {
              this.eventListener.dispatchEvent('delete');
              this.close();
            });
          }
        }],
        listenerSetter: this.listenerSetter,
        url: this.chatlistInvite.url
      });

      section.content.append(inviteLink.container);
    }

    {
      const titleI18n = this.chatsTitleI18n = new I18n.IntlElement();

      this.selector = new AppSelectPeers({
        middleware: this.middlewareHelper.get(),
        appendTo: this.container,
        onChange: this.onSelectChange,
        peerType: [],
        renderResultsFunc: this.renderResults,
        sectionNameLangPackKey: titleI18n.element,
        sectionCaption: 'SharedFolder.Edit.Subtitle',
        managers: this.managers,
        noSearch: true,
        multiSelect: true
      });

      this.selector.scrollable.attachBorderListeners(this.container);

      const chatlistPeers = this.chatlistInvite?.peers ?? [];
      const selectedPeers = chatlistPeers.map((peer) => getPeerId(peer));
      this.selector.addInitial(selectedPeers);

      const combinedPeerIds = filterUnique(selectedPeers.concat(this.filter.includePeerIds));

      const peers = await Promise.all(combinedPeerIds.map((peerId) => this.managers.appPeersManager.getPeer(peerId)));
      const ratings: Map<typeof peers[0], number> = new Map();
      const peerIds: Map<typeof peers[0], PeerId> = new Map();
      const peersMap: Map<PeerId, typeof peers[0]> = new Map();
      peers.forEach((peer) => {
        const peerId = peer.id.toPeerId(peer._ !== 'user');
        peerIds.set(peer, peerId);
        peersMap.set(peerId, peer);

        let rating = 0;
        if(!this.canSelectPeer(peer)) {
          rating = -1;
        } else if(this.selector.selected.has(peerId)) {
          rating = 1;
        }

        ratings.set(peer, rating);
      });
      peers.sort((a, b) => ratings.get(b) - ratings.get(a));
      this.selector.renderResultsFunc(peers.map((peer) => peerIds.get(peer)));

      const _add = this.selector.add.bind(this.selector);
      this.selector.add = (options) => {
        const peerId = options.key.toPeerId();
        const dialogElement = this.elementMap.get(peerId as PeerId);
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

      const _remove = this.selector.remove.bind(this.selector);
      this.selector.remove = (...args) => {
        const peerId = args[0].toPeerId();
        if(this.selector.selected.size <= 1) {
          shake(this.elementMap.get(peerId).container);
          return false;
        }

        return _remove(...args);
      };
    }

    attachClickEvent(this.confirmBtn, () => {
      const toggle = toggleDisability([this.confirmBtn], true);
      this.managers.filtersStorage.editExportedInvite(
        this.filter.id,
        this.chatlistInvite.url,
        [...this.selector.selected] as PeerId[],
        this.filter.title.text
      ).then((chatlistInvite) => {
        this.eventListener.dispatchEvent('edit', chatlistInvite);
        this.close();
      }, (error: ApiError) => {
        toggle();
        throw error;
      });
    }, {listenerSetter: this.listenerSetter});

    this.selector.scrollable.prepend(...[
      this.stickerContainer,
      this.caption,
      linkSection?.container
    ].filter(Boolean));

    return Promise.all([
      this.loadAnimationPromise = p.animationData.then(async(cb) => {
        const player = await cb({
          container: this.stickerContainer,
          loop: false,
          autoplay: false,
          width: 86,
          height: 86
        });

        this.animation = player;

        return lottieLoader.waitForFirstFrame(player);
      }),

      wrapFolderTitle(this.filter.title, this.middlewareHelper.get()).then((title) => {
        this.descriptionTitle = document.createElement('span');
        this.descriptionTitle.append(title);
        this.updateDescription();
      })
    ]);
  }

  canSelectPeer = (peer: Chat | User) => {
    if(!peer || !this.chatlistInvite) {
      return false;
    }

    if(peer._ === 'user'/*  || peer._ === 'chat' */) {
      return false;
    }

    return !!getPeerActiveUsernames(peer).length || hasRights(peer as Chat.channel | Chat.chat, 'invite_links');
  };

  onSelectChange = (length: number) => {
    this.updateDescription(length);
    if(!this.chatlistInvite) {
      return;
    }

    const peerIds = [...this.selector.selected];
    const prev = this.chatlistInvite.peers.map((peer) => getPeerId(peer));
    const isSame = prev.length === peerIds.length && prev.every((peerId) => peerIds.includes(peerId));
    this.confirmBtn.classList.toggle('hide', isSame);
  };

  renderResults = async(peerIds: PeerId[]) => {
    const promises = peerIds.map(async(peerId) => {
      const peer = await this.managers.appPeersManager.getPeer(peerId);

      const dialogElement = appDialogsManager.addDialogNew({
        peerId,
        container: this.selector.list,
        rippleEnabled: true,
        avatarSize: 'abitbigger',
        meAsSaved: false,
        wrapOptions: {
          middleware: this.middlewareHelper.get()
        }
      });

      const {dom} = dialogElement;

      this.elementMap.set(peerId, dialogElement);

      const selected = this.selector.selected.has(peerId);
      dom.containerEl.append(this.selector.checkbox(selected));
      // if(selected) dom.listEl.classList.add('active');

      const canSelect = this.canSelectPeer(peer);
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

  private updateDescription(length = this.chatlistInvite ? this.chatlistInvite.peers.length : undefined) {
    if(!this.chatlistInvite) {
      this.descriptionI18n.compareAndUpdate({key: 'SharedFolder.NoChats'});
      this.chatsTitleI18n.compareAndUpdate({key: 'SharedFolder.NoChats.Title'});
    } else {
      this.descriptionI18n.update({
        key: 'SharedFolder.Edit.Description',
        args: [
          this.descriptionTitle,
          i18n('Chats', [length])
        ]
      });

      this.chatsTitleI18n.update({
        key: 'ChatsSelected',
        args: [length]
      });
    }
  }

  onOpenAfterTimeout() {
    this.loadAnimationPromise.then(() => {
      this.animation.autoplay = true;
      this.animation.play();
    });
  }
}
