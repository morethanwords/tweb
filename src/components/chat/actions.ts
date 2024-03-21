/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatTopbar from './topbar';
import DivAndCaption from '../divAndCaption';
import PinnedContainer from './pinnedContainer';
import Chat from './chat';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {LangPackKey, i18n} from '../../lib/langPack';
import {PeerSettings} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import callbackify from '../../helpers/callbackify';
import ripple from '../ripple';
import findUpClassName from '../../helpers/dom/findUpClassName';
import confirmationPopup from '../confirmationPopup';

export default class ChatActions extends PinnedContainer {
  protected peerId: PeerId;
  protected actions: {key: (keyof PeerSettings['pFlags']), onClick: () => void, danger?: boolean}[];
  protected filteredActions: ChatActions['actions'];
  // protected middlewareHelper: MiddlewareHelper;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className: 'actions',
      divAndCaption: new DivAndCaption(
        'pinned-actions',
        (options) => {
          // replaceContent(this.divAndCaption.title, options.title);
          // replaceContent(this.divAndCaption.subtitle, options.subtitle);
        }
      ),
      onClose: () => {
        this.managers.appProfileManager.hidePeerSettingsBar(this.peerId);
      },
      floating: true,
      height: 52
    });

    // this.middlewareHelper = getMiddleware();

    this.wrapper.firstElementChild.remove();

    this.divAndCaption.border.remove();
    this.divAndCaption.content.remove();

    const attachClick = (elem: HTMLElement, callback: (e: MouseEvent) => void) => {
      attachClickEvent(elem, (e) => {
        cancelEvent(e);
        callback(e);
      }, {listenerSetter: this.topbar.listenerSetter});
    };

    attachClick(this.wrapper, (e) => {
      const target = findUpClassName(e.target, 'pinned-actions-button');
      if(!target) {
        return;
      }

      const key = target.dataset.key;
      const action = this.actions.find((action) => action.key === key);
      action.onClick();
    });

    this.actions = [{
      key: 'autoarchived',
      onClick: async() => {
        const promise = this.managers.appMessagesManager.editPeerFolders([this.peerId], 0);
        this.freeze(promise);
      }
    }, {
      key: 'block_contact',
      onClick: () => {
        this.chat.topbar.blockUser(
          this.filteredActions.some((action) => action.key === 'report_spam'),
          true,
          (promise) => {
            this.freeze(promise);
          }
        );
      },
      danger: true
    }, {
      key: 'add_contact',
      onClick: () => {
        this.chat.topbar.addContact();
      }
    }, {
      key: 'report_spam',
      onClick: async() => {
        const peerId = this.peerId;
        if(peerId.isUser()) {
          this.actions.find((action) => action.key === 'block_contact').onClick();
        } else {
          await confirmationPopup({
            titleLangKey: 'Chat.Confirm.ReportSpam.Header',
            descriptionLangKey: this.managers.appPeersManager.isBroadcast(peerId) ? 'Chat.Confirm.ReportSpam.Channel' : 'Chat.Confirm.ReportSpam.Group',
            button: {
              langKey: 'ReportChat'
            }
          });

          const promise = Promise.all([
            this.managers.appMessagesManager.reportSpam(peerId),
            this.managers.appChatsManager.leave(peerId.toChatId())
          ]);
          this.freeze(promise);
        }
      },
      danger: true
    }];
  }

  private async freeze(promise: Promise<any>) {
    this.wrapper.classList.add('is-disabled');
    try {
      await promise;
    } catch(err) {

    }

    this.wrapper.classList.remove('is-disabled');
  }

  public unset(peerId: PeerId) {
    this.peerId = peerId;
    this.toggle(true);
  }

  public set(peerId: PeerId, settings: PeerSettings) {
    const supportedActions = settings?.pFlags ?
      this.actions.filter((action) => settings.pFlags[action.key]) :
      [];
    if(!supportedActions.length) {
      return () => this.unset(peerId);
    }

    return () => {
      this.peerId = peerId;
      this.filteredActions = supportedActions;
      const langPackKeyMap: {
        [key in typeof supportedActions[0]['key']]?: LangPackKey
      } = {
        add_contact: 'AddContact',
        autoarchived: 'Unarchive',
        block_contact: 'BlockUser',
        report_spam: 'DeleteReportSpam'
      };

      const buttons: HTMLElement[] = [];
      for(let i = 0, length = Math.min(2, supportedActions.length); i < length; ++i) {
        const action = supportedActions[i];
        const button = document.createElement('div');
        button.classList.add(
          'pinned-actions-button',
          action.danger ? 'danger' : 'primary'
        );

        if(length > 1) {
          button.classList.add('half', i === 0 ? 'is-first' : 'is-last');
        }

        button.dataset.key = action.key;
        buttons.push(button);

        const text = i18n(langPackKeyMap[action.key]);
        text.classList.add('pinned-actions-button-text');
        ripple(button);
        button.append(text);
      }

      this.wrapper.replaceChildren(...buttons, this.wrapperUtils);
      this.toggle(false);
    };
  }

  // private getMiddleware() {
  //   this.middlewareHelper.clean();
  //   return this.middlewareHelper.get();
  // }

  public setPeerId(peerId: PeerId) {
    // const middleware = this.getMiddleware();
    return Promise.all([
      this.chat.managers.acknowledged.appProfileManager.getPeerSettings(peerId)
    ]).then(([peerSettingsAcked]) => {
      return {
        cached: peerSettingsAcked.cached,
        result: callbackify(peerSettingsAcked.result, (peerSettings) => {
          return this.set(peerId, peerSettings);
        })
      };
    });
  }

  // public destroy() {
  //   super.destroy();
  //   this.middlewareHelper.destroy();
  // }
}
