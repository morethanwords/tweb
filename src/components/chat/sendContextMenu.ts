/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import contextMenuController from '../../helpers/contextMenuController';
import {attachContextMenuListener} from '../../helpers/dom/attachContextMenuListener';
import cancelEvent from '../../helpers/dom/cancelEvent';
import ListenerSetter from '../../helpers/listenerSetter';
import {getMiddleware, Middleware, MiddlewareHelper} from '../../helpers/middleware';
import {Reaction} from '../../layer';
import rootScope from '../../lib/rootScope';
import {ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from '../buttonMenu';
import PopupPremium from '../popups/premium';
import ChatContextMenu from './contextMenu';
import {ChatReactionsMenu} from './reactionsMenu';

export default class SendMenu {
  private type: 'schedule' | 'reminder';
  private isPaid: boolean;
  private middlewareHelper: MiddlewareHelper;

  constructor(private options: {
    onSilentClick: () => void,
    onScheduleClick: () => void,
    onSendWhenOnlineClick?: () => void,
    onRef: (element: HTMLElement) => void,
    middleware: Middleware,
    openSide: string,
    onContextElement: HTMLElement,
    onOpen?: () => boolean,
    canSendWhenOnline?: () => boolean | Promise<boolean>,
    withEffects?: () => boolean,
    effect?: () => DocId,
    onEffect?: (effect: DocId) => void
  }) {
    this.middlewareHelper = options.middleware.create();
    this.createMenu();
  }

  public setPeerParams(params: {peerId: PeerId, isPaid: boolean}) {
    this.type = params.peerId === rootScope.myId ? 'reminder' : 'schedule';
    this.isPaid = params.isPaid;
  }

  private createButtons(): ButtonMenuItemOptionsVerifiable[] {
    return [{
      icon: 'mute',
      text: 'Chat.Send.WithoutSound',
      onClick: this.options.onSilentClick,
      verify: () => this.type === 'schedule'
    }, {
      icon: 'schedule',
      text: 'Chat.Send.ScheduledMessage',
      onClick: this.options.onScheduleClick,
      verify: () => this.type === 'schedule' && !this.isPaid
    }, {
      icon: 'schedule',
      text: 'Chat.Send.SetReminder',
      onClick: this.options.onScheduleClick,
      verify: () => this.type === 'reminder'
    }, {
      icon: 'online',
      text: 'Schedule.SendWhenOnline',
      onClick: this.options.onSendWhenOnlineClick,
      verify: () => this.type === 'schedule' && this.options.canSendWhenOnline?.() && !this.isPaid
    }, {
      icon: 'crossround',
      text: 'Effect.Remove',
      danger: true,
      onClick: () => this.options.onEffect(undefined),
      verify: () => !!this.options.effect?.()
    }];
  }

  private createMenu() {
    this.middlewareHelper.clean();
    const middleware = this.middlewareHelper.get();

    const listenerSetter = new ListenerSetter();
    middleware.onClean(() => {
      listenerSetter.removeAll();
    });

    this.createButtons();
    const buttons = this.createButtons();
    const element = ButtonMenuSync({buttons, listenerSetter});
    element.classList.add('menu-send', this.options.openSide);
    this.options.onRef(element);

    attachContextMenuListener({
      element: this.options.onContextElement,
      callback: async(e) => {
        if(this.options.onOpen && !this.options.onOpen()) {
          return;
        }

        cancelEvent(e);
        await Promise.all(buttons.map(async(button) => {
          const result = await button.verify();
          button.element.classList.toggle('hide', !result);
        }));

        const middlewareHelper = getMiddleware();
        const middleware = middlewareHelper.get();

        const reactionsMenuPosition = 'horizontal';
        let reactionsMenu: ChatReactionsMenu;
        if(this.options.withEffects?.()) {
          reactionsMenu = new ChatReactionsMenu({
            managers: rootScope.managers,
            type: reactionsMenuPosition,
            middleware,
            onFinish: async(reaction) => {
              contextMenuController.close();
              reaction = await reaction;
              if(!reaction) {
                return;
              }

              const stickerDocId = (reaction as Reaction.reactionCustomEmoji).document_id;
              if(!rootScope.premium && !reactionsMenu.freeCustomEmoji.has(stickerDocId)) {
                PopupPremium.show({feature: 'premium_stickers'});
                return;
              }

              const availableEffects = await rootScope.managers.appReactionsManager.getAvailableEffects();
              const availableEffect = availableEffects.find((effect) => effect.effect_sticker_id === stickerDocId);
              this.options.onEffect(availableEffect.id);
            },
            getOpenPosition: (hasMenu) => ChatContextMenu.getReactionsOpenPosition(reactionsMenu, hasMenu),
            isEffects: true
          });

          await reactionsMenu.init();

          // const menuPadding = ChatContextMenu.getReactionsMenuPadding(reactionsMenuPosition);
        }

        const reactionsCallbacks = reactionsMenu && ChatContextMenu.appendReactionsMenu({element: element, reactionsMenu, reactionsMenuPosition});

        contextMenuController.openBtnMenu(element, () => {
          reactionsCallbacks?.onClose();
          middlewareHelper.destroy();
          this.createMenu();
          setTimeout(() => {
            element.remove();
          }, 400);
        });

        reactionsCallbacks?.onAfterInit();
      },
      listenerSetter
    });
  }
};
