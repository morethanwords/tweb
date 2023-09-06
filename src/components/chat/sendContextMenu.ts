/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import contextMenuController from '../../helpers/contextMenuController';
import {attachContextMenuListener} from '../../helpers/dom/attachContextMenuListener';
import cancelEvent from '../../helpers/dom/cancelEvent';
import ListenerSetter from '../../helpers/listenerSetter';
import rootScope from '../../lib/rootScope';
import {ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from '../buttonMenu';

export default class SendMenu {
  public sendMenu: HTMLElement;
  private sendMenuButtons: ButtonMenuItemOptionsVerifiable[];
  private type: 'schedule' | 'reminder';

  constructor(options: {
    onSilentClick: () => void,
    onScheduleClick: () => void,
    onSendWhenOnlineClick?: () => void,
    listenerSetter?: ListenerSetter,
    openSide: string,
    onContextElement: HTMLElement,
    onOpen?: () => boolean,
    canSendWhenOnline?: () => boolean | Promise<boolean>
  }) {
    this.sendMenuButtons = [{
      icon: 'mute',
      text: 'Chat.Send.WithoutSound',
      onClick: options.onSilentClick,
      verify: () => this.type === 'schedule'
    }, {
      icon: 'schedule',
      text: 'Chat.Send.ScheduledMessage',
      onClick: options.onScheduleClick,
      verify: () => this.type === 'schedule'
    }, {
      icon: 'schedule',
      text: 'Chat.Send.SetReminder',
      onClick: options.onScheduleClick,
      verify: () => this.type === 'reminder'
    }, {
      icon: 'online',
      text: 'Schedule.SendWhenOnline',
      onClick: options.onSendWhenOnlineClick,
      verify: () => this.type === 'schedule' && options.canSendWhenOnline?.()
    }];

    this.sendMenu = ButtonMenuSync({buttons: this.sendMenuButtons, listenerSetter: options.listenerSetter});
    this.sendMenu.classList.add('menu-send', options.openSide);

    attachContextMenuListener({
      element: options.onContextElement,
      callback: async(e) => {
        if(options.onOpen && !options.onOpen()) {
          return;
        }

        cancelEvent(e);
        await Promise.all(this.sendMenuButtons.map(async(button) => {
          const result = await button.verify();
          button.element.classList.toggle('hide', !result);
        }));

        contextMenuController.openBtnMenu(this.sendMenu);
      },
      listenerSetter: options.listenerSetter
    });
  }

  public setPeerId(peerId: PeerId) {
    this.type = peerId === rootScope.myId ? 'reminder' : 'schedule';
  }
};
