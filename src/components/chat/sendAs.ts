/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import callbackify from '../../helpers/callbackify';
import ListenerSetter from '../../helpers/listenerSetter';
import liteMode from '../../helpers/liteMode';
import {getMiddleware} from '../../helpers/middleware';
import {modifyAckedPromise} from '../../helpers/modifyAckedResult';
import {ChatFull} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {i18n} from '../../lib/langPack';
import {AckedResult} from '../../lib/mtproto/superMessagePort';
import rootScope from '../../lib/rootScope';
import AvatarElement from '../avatar';
import {ButtonMenuItemOptions, ButtonMenuSync} from '../buttonMenu';
import ButtonMenuToggle from '../buttonMenuToggle';
import PeerTitle from '../peerTitle';
import SetTransition from '../singleTransition';
import getChatMembersString from '../wrappers/getChatMembersString';

const SEND_AS_ANIMATION_DURATION = 300;

export default class ChatSendAs {
  private avatar: AvatarElement;
  private container: HTMLElement;
  private closeBtn: HTMLElement;
  private btnMenu: HTMLElement;
  private sendAsPeerIds: PeerId[];
  private sendAsPeerId: PeerId;
  private updatingPromise: ReturnType<ChatSendAs['updateManual']>;
  private middleware: ReturnType<typeof getMiddleware>;
  private listenerSetter: ListenerSetter;
  private peerId: PeerId;
  private addedListener: boolean;
  private buttons: ButtonMenuItemOptions[];

  constructor(
    private managers: AppManagers,
    private onReady: (container: HTMLElement, skipAnimation?: boolean) => void,
    private onChange: (sendAsPeerId: PeerId) => void
  ) {
    this.middleware = getMiddleware();
    this.listenerSetter = new ListenerSetter();
    this.construct();
  }

  private construct() {
    this.container = document.createElement('div');
    this.container.classList.add('new-message-send-as-container');

    this.closeBtn = document.createElement('div');
    this.closeBtn.classList.add('new-message-send-as-close', 'new-message-send-as-avatar', 'tgico-close');

    const sendAsButtons: ButtonMenuItemOptions[] = [{
      text: 'SendMessageAsTitle',
      onClick: undefined
    }];

    this.buttons = [];

    let previousAvatar: HTMLElement;
    const onSendAsMenuToggle = (visible: boolean) => {
      if(visible) {
        previousAvatar = this.avatar;
      }

      const isChanged = this.avatar !== previousAvatar;
      const useRafs = !visible && isChanged ? 2 : 0;

      SetTransition({
        element: this.closeBtn,
        className: 'is-visible',
        forwards: visible,
        duration: SEND_AS_ANIMATION_DURATION,
        useRafs
      });
      if(!isChanged) {
        SetTransition({
          element: previousAvatar,
          className: 'is-visible',
          forwards: !visible,
          duration: SEND_AS_ANIMATION_DURATION,
          useRafs
        });
      }
    };

    ButtonMenuToggle({
      buttonOptions: {noRipple: true},
      listenerSetter: this.listenerSetter,
      container: this.container,
      direction: 'top-right',
      buttons: sendAsButtons,
      onOpenBefore: () => {
        onSendAsMenuToggle(true);
      },
      onOpen: (e, btnMenu) => {
        sendAsButtons[0].element.classList.add('btn-menu-item-header');
        this.btnMenu = btnMenu as any;
        this.btnMenu.classList.add('scrollable', 'scrollable-y');
        this.btnMenu.append(...this.buttons.map((button) => button.element));
      },
      onClose: () => {
        onSendAsMenuToggle(false);
      },
      onCloseAfter: () => {
        this.btnMenu = undefined;
      }
    });

    this.container.append(this.closeBtn);
  }

  private async updateButtons(peerIds: PeerId[]) {
    const promises: Promise<ButtonMenuItemOptions>[] = peerIds.map(async(sendAsPeerId, idx) => {
      const textElement = document.createElement('div');

      const subtitle = document.createElement('div');
      subtitle.classList.add('btn-menu-item-subtitle');
      if(sendAsPeerId.isUser()) {
        subtitle.append(i18n('Chat.SendAs.PersonalAccount'));
      } else if(sendAsPeerId === this.peerId) {
        subtitle.append(i18n('VoiceChat.DiscussionGroup'));
      } else {
        subtitle.append(await getChatMembersString(sendAsPeerId.toChatId()));
      }

      textElement.append(
        new PeerTitle({peerId: sendAsPeerId}).element,
        subtitle
      );

      return {
        onClick: idx ? async() => {
          const currentPeerId = this.peerId;
          this.changeSendAsPeerId(sendAsPeerId);

          const middleware = this.middleware.get();
          const executeButtonsUpdate = () => {
            if(this.sendAsPeerId !== sendAsPeerId || !middleware()) return;
            const peerIds = this.sendAsPeerIds.slice();
            indexOfAndSplice(peerIds, sendAsPeerId);
            peerIds.unshift(sendAsPeerId);
            this.updateButtons(peerIds);
          };

          if(liteMode.isAvailable('animations')) {
            setTimeout(executeButtonsUpdate, 250);
          } else {
            executeButtonsUpdate();
          }

          // return;
          this.managers.appMessagesManager.saveDefaultSendAs(currentPeerId, sendAsPeerId);
        } : undefined,
        textElement
      };
    });

    const buttons = await Promise.all(promises);
    const btnMenu = ButtonMenuSync({buttons}/* , this.listenerSetter */);
    buttons.forEach((button, idx) => {
      const peerId = peerIds[idx];
      const avatar = new AvatarElement();
      avatar.classList.add('avatar-26', 'btn-menu-item-icon');
      avatar.updateWithOptions({peerId});

      if(!idx) {
        avatar.classList.add('active');
      }

      button.element.prepend(avatar);
    });

    this.buttons = buttons;

    // if already opened
    this.btnMenu?.append(...this.buttons.map((button) => button.element));
  }

  private async updateAvatar(sendAsPeerId: PeerId, skipAnimation?: boolean) {
    const previousAvatar = this.avatar;
    if(previousAvatar) {
      if(previousAvatar.peerId === sendAsPeerId) {
        return;
      }
    }

    if(!previousAvatar) {
      skipAnimation = true;
    }

    const useRafs = skipAnimation ? 0 : 2;
    const duration = skipAnimation ? 0 : SEND_AS_ANIMATION_DURATION;
    const avatar = this.avatar = new AvatarElement();
    avatar.classList.add('new-message-send-as-avatar', 'avatar-30');
    await avatar.updateWithOptions({
      isDialog: false,
      peerId: sendAsPeerId
    });

    SetTransition({
      element: avatar,
      className: 'is-visible',
      forwards: true,
      duration,
      useRafs
    });
    if(previousAvatar) {
      SetTransition({
        element: previousAvatar,
        className: 'is-visible',
        forwards: false,
        duration,
        onTransitionEnd: () => {
          previousAvatar.remove();
        },
        useRafs
      });
    }

    this.container.append(avatar);
  }

  private changeSendAsPeerId(sendAsPeerId: PeerId, skipAnimation?: boolean) {
    this.sendAsPeerId = sendAsPeerId;
    this.onChange(sendAsPeerId);
    return this.updateAvatar(sendAsPeerId, skipAnimation);
  }

  private getDefaultSendAs(): Promise<AckedResult<PeerId>> {
    // return rootScope.myId;
    return this.managers.acknowledged.appProfileManager.getChannelFull(this.peerId.toChatId()).then((acked) => {
      return {
        cached: acked.cached,
        result: acked.result.then((channelFull) => {
          return channelFull.default_send_as ? getPeerId(channelFull.default_send_as) : undefined
        })
      };
    });
  }

  public async updateManual(skipAnimation?: boolean): Promise<() => void> {
    const peerId = this.peerId;
    if(this.updatingPromise || !(await this.managers.appPeersManager.isChannel(peerId))) {
      return;
    }

    const middleware = this.middleware.get(() => {
      return !this.updatingPromise || this.updatingPromise === updatingPromise;
    });

    const {container} = this;
    const chatId = peerId.toChatId();
    const result = (await modifyAckedPromise(this.getDefaultSendAs())).result;
    // const result = Promise.resolve(this.getDefaultSendAs());

    const wasSkippingAnimation = skipAnimation;
    if(result instanceof Promise) {
      skipAnimation = undefined;
    }

    const auto = wasSkippingAnimation && !skipAnimation;

    const updatingPromise = this.updatingPromise = callbackify(result, async(sendAsPeerId) => {
      if(!middleware() || sendAsPeerId === undefined) return;

      await this.changeSendAsPeerId(sendAsPeerId, skipAnimation);
      if(!middleware()) return;

      this.managers.appChatsManager.getSendAs(chatId).then((sendAsPeers) => {
        if(!middleware()) return;

        const peers = sendAsPeers.filter((sendAsPeer) => !sendAsPeer.pFlags.premium_required).map((sendAsPeer) => sendAsPeer.peer);
        const peerIds = peers.map((peer) => getPeerId(peer));
        this.sendAsPeerIds = peerIds.slice();

        indexOfAndSplice(peerIds, sendAsPeerId);
        peerIds.unshift(sendAsPeerId);
        this.updateButtons(peerIds);
      });

      const callback = () => {
        this.onReady(container, skipAnimation);

        if(!this.addedListener) {
          this.listenerSetter.add(rootScope)('peer_full_update', (peerId) => {
            if(this.peerId === peerId) {
              this.update();
            }
          });

          this.addedListener = true;
        }
      };

      if(auto) {
        callback();
        return;
      }

      return callback;
    });

    updatingPromise.finally(() => {
      if(this.updatingPromise === updatingPromise) {
        this.updatingPromise = undefined;
      }
    });

    if(!auto) {
      return updatingPromise;
    }
  }

  public update(skipAnimation?: boolean) {
    return this.updateManual(skipAnimation).then((callback) => callback?.());
  }

  public setPeerId(peerId?: PeerId) {
    /* if(this.avatar) {
      this.avatar.remove();
      this.avatar = undefined;
    } */

    this.middleware.clean();
    this.updatingPromise = undefined;
    this.peerId = peerId;
  }

  public destroy() {
    this.container.remove();
    this.setPeerId();
    this.listenerSetter.removeAll();
  }
}
