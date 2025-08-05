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
import namedPromises from '../../helpers/namedPromises';
import safeAssign from '../../helpers/object/safeAssign';
import {Chat} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {i18n} from '../../lib/langPack';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {AckedResult} from '../../lib/mtproto/superMessagePort';
import rootScope from '../../lib/rootScope';
import {avatarNew} from '../avatarNew';
import {ButtonMenuItemOptions, ButtonMenuSync} from '../buttonMenu';
import ButtonMenuToggle from '../buttonMenuToggle';
import Icon from '../icon';
import PeerTitle from '../peerTitle';
import PopupPremium from '../popups/premium';
import SetTransition from '../singleTransition';
import getChatMembersString from '../wrappers/getChatMembersString';

const SEND_AS_ANIMATION_DURATION = 300;

export interface ChatSendAsOptions {
  managers: AppManagers;
  onReady: (container: HTMLElement, skipAnimation?: boolean) => void,
  onChange: (sendAsPeerId: PeerId) => void
  forPaidReaction?: boolean,
  menuContainer?: HTMLElement
  defaultPeerId?: PeerId
}

export default class ChatSendAs {
  private avatar: ReturnType<typeof avatarNew>;
  private container: HTMLElement;
  private closeBtn: HTMLElement;
  private btnMenu: HTMLElement;
  private sendAsPeers: {peerId: PeerId, needPremium?: boolean}[];
  private sendAsPeerId: PeerId;
  private updatingPromise: ReturnType<ChatSendAs['updateManual']>;
  private middlewareHelper: ReturnType<typeof getMiddleware>;
  private listenerSetter: ListenerSetter;
  private peerId: PeerId;
  private addedListener: boolean;
  private buttons: ButtonMenuItemOptions[];

  private managers: ChatSendAsOptions['managers'];
  private onReady: ChatSendAsOptions['onReady'];
  private onChange: ChatSendAsOptions['onChange'];
  private forPaidReaction: ChatSendAsOptions['forPaidReaction'];
  private menuContainer: ChatSendAsOptions['menuContainer'];
  private defaultPeerId: ChatSendAsOptions['defaultPeerId'];

  constructor(options: ChatSendAsOptions) {
    safeAssign(this, options);
    this.middlewareHelper = getMiddleware();
    this.listenerSetter = new ListenerSetter();
    this.construct();
  }

  private construct() {
    this.container = document.createElement('div');
    this.container.classList.add('new-message-send-as-container');

    this.closeBtn = document.createElement('div');
    this.closeBtn.classList.add('new-message-send-as-close', 'new-message-send-as-avatar');
    this.closeBtn.append(Icon('close'));

    const sendAsButtons: ButtonMenuItemOptions[] = [{
      text: this.forPaidReaction ? 'SendReactionAsTitle' : 'SendMessageAsTitle',
      onClick: undefined
    }];

    this.buttons = [];

    let previousAvatar: ChatSendAs['avatar'];
    const onSendAsMenuToggle = (visible: boolean) => {
      if(this.forPaidReaction) {
        return;
      }
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
          element: previousAvatar.node,
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
      container: this.menuContainer ?? this.container,
      direction: this.forPaidReaction ? 'bottom-center' : 'top-right',
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

  private async updateButtons(peers: ChatSendAs['sendAsPeers']) {
    const promises: Promise<ButtonMenuItemOptions>[] = peers.map(async(sendAsPeer, idx) => {
      const textElement = document.createElement('div');

      const {peerId: sendAsPeerId, needPremium} = sendAsPeer;

      const subtitle = document.createElement('div');
      subtitle.classList.add('btn-menu-item-subtitle');
      if(sendAsPeerId.isUser()) {
        subtitle.append(i18n('Chat.SendAs.PersonalAccount'));
      } else if(sendAsPeerId === this.peerId && (apiManagerProxy.getPeer(this.peerId) as Chat.channel).pFlags.megagroup) {
        subtitle.append(i18n('VoiceChat.DiscussionGroup'));
      } else {
        subtitle.append(await getChatMembersString(sendAsPeerId.toChatId()));
      }

      const title = document.createElement('div');
      title.append(new PeerTitle({peerId: sendAsPeerId}).element);

      if(needPremium) {
        title.append(Icon('premium_lock', 'new-message-send-as-lock'));
      }

      textElement.append(
        title,
        subtitle
      );

      return {
        onClick: idx ? async() => {
          if(sendAsPeer.needPremium && !rootScope.premium) {
            PopupPremium.show();
            return;
          }

          const currentPeerId = this.peerId;
          this.changeSendAsPeerId(sendAsPeerId);

          const middleware = this.middlewareHelper.get();
          const executeButtonsUpdate = () => {
            if(this.sendAsPeerId !== sendAsPeerId || !middleware()) return;
            const peers = this.sendAsPeers.slice();
            const idx = peers.findIndex((peer) => peer.peerId === sendAsPeerId);
            if(idx !== -1) peers.splice(idx, 1);
            peers.unshift(sendAsPeer);
            this.updateButtons(peers);
          };

          if(liteMode.isAvailable('animations')) {
            setTimeout(executeButtonsUpdate, 250);
          } else {
            executeButtonsUpdate();
          }

          if(!this.forPaidReaction) {
            this.managers.appMessagesManager.saveDefaultSendAs(currentPeerId, sendAsPeerId);
          }
        } : undefined,
        textElement
      };
    });

    const buttons = await Promise.all(promises);
    const btnMenu = ButtonMenuSync({buttons}/* , this.listenerSetter */);
    buttons.forEach((button, idx) => {
      const {peerId} = peers[idx];
      const avatar = avatarNew({
        middleware: this.middlewareHelper.get(),
        size: 26,
        peerId
      });
      avatar.node.classList.add('btn-menu-item-icon', 'btn-menu-item-avatar');

      if(!idx) {
        avatar.node.classList.add('active');
      }

      button.element.prepend(avatar.node);
    });

    this.buttons = buttons;

    // if already opened
    this.btnMenu?.append(...this.buttons.map((button) => button.element));
  }

  private async updateAvatar(sendAsPeerId: PeerId, skipAnimation?: boolean) {
    const previousAvatar = this.avatar;
    if(previousAvatar) {
      if(previousAvatar.node.dataset.peerId.toPeerId() === sendAsPeerId) {
        return;
      }
    }

    if(!previousAvatar) {
      skipAnimation = true;
    }

    const useRafs = skipAnimation ? 0 : 2;
    const duration = skipAnimation ? 0 : SEND_AS_ANIMATION_DURATION;
    const avatar = this.avatar = avatarNew({
      middleware: this.middlewareHelper.get(),
      size: 30,
      isDialog: false,
      peerId: sendAsPeerId
    });
    avatar.node.classList.add('new-message-send-as-avatar');
    await avatar.readyThumbPromise;

    SetTransition({
      element: avatar.node,
      className: 'is-visible',
      forwards: true,
      duration,
      useRafs
    });
    if(previousAvatar) {
      SetTransition({
        element: previousAvatar.node,
        className: 'is-visible',
        forwards: false,
        duration,
        onTransitionEnd: () => {
          previousAvatar.node.remove();
        },
        useRafs
      });
    }

    this.container.append(avatar.node);
  }

  private changeSendAsPeerId(sendAsPeerId: PeerId, skipAnimation?: boolean) {
    this.sendAsPeerId = sendAsPeerId;
    this.onChange(sendAsPeerId);
    return this.updateAvatar(sendAsPeerId, skipAnimation);
  }

  private getDefaultSendAs(): Promise<AckedResult<PeerId>> {
    if(this.forPaidReaction) {
      return Promise.resolve({
        cached: true,
        result: Promise.resolve(this.defaultPeerId)
      });
    }

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

    const {isChannel, isMonoforum} = await namedPromises({
      isChannel: this.managers.appPeersManager.isChannel(peerId),
      isMonoforum: this.managers.appPeersManager.isMonoforum(peerId)
    });

    if(this.updatingPromise || !isChannel || isMonoforum) {
      return;
    }

    const middleware = this.middlewareHelper.get(() => {
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

      Promise.all([
        this.managers.appChatsManager.getSendAs(chatId, this.forPaidReaction),
        apiManagerProxy.isPremiumFeaturesHidden()
      ]).then(([sendAsPeers, isPremiumFeaturesHidden]) => {
        if(!middleware()) return;

        if(isPremiumFeaturesHidden) {
          sendAsPeers = sendAsPeers.filter((sendAsPeer) => !sendAsPeer.pFlags.premium_required);
        }

        const peers: ChatSendAs['sendAsPeers'] = sendAsPeers.map((sendAsPeer) => {
          return {
            peerId: getPeerId(sendAsPeer.peer),
            needPremium: sendAsPeer.pFlags.premium_required
          }
        });
        this.sendAsPeers = peers.slice();

        const idx = peers.findIndex((peer) => peer.peerId === sendAsPeerId);
        if(idx !== -1) {
          const peer = peers.splice(idx, 1)[0];
          peers.unshift(peer);
        } else {
          peers.unshift({peerId: sendAsPeerId});
        }

        this.updateButtons(peers);
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

    this.middlewareHelper.clean();
    this.updatingPromise = undefined;
    this.peerId = peerId;
  }

  public getSendAsPeerId() {
    return this.sendAsPeerId;
  }

  public destroy() {
    this.container.remove();
    this.setPeerId();
    this.listenerSetter.removeAll();
  }
}
