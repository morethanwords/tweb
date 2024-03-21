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
import I18n from '../../lib/langPack';
import {ChatFull} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import StackedAvatars from '../stackedAvatars';
import appSidebarRight from '../sidebarRight';
import AppChatRequestsTab from '../sidebarRight/tabs/chatRequests';
import callbackify from '../../helpers/callbackify';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {ONE_DAY} from '../../helpers/date';
import {MiddlewareHelper, getMiddleware} from '../../helpers/middleware';

export default class ChatRequests extends PinnedContainer {
  protected titleElement: I18n.IntlElement;
  protected stackedAvatars: StackedAvatars;
  protected stackedAvatarsMiddlewareHelper: MiddlewareHelper;
  protected peerId: PeerId;
  // protected middlewareHelper: MiddlewareHelper;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className: 'requests',
      divAndCaption: new DivAndCaption(
        'pinned-requests',
        (options) => {
          // replaceContent(this.divAndCaption.title, options.title);
          // replaceContent(this.divAndCaption.subtitle, options.subtitle);
        }
      ),
      onClose: () => {
        apiManagerProxy.getState().then((state) => {
          state.hideChatJoinRequests[this.peerId] = Date.now();
          this.managers.appStateManager.pushToState('hideChatJoinRequests', state.hideChatJoinRequests);
        });
      },
      floating: true,
      height: 52
    });

    // this.middlewareHelper = getMiddleware();

    attachClickEvent(this.wrapper, async(e) => {
      cancelEvent(e);
      if(appSidebarRight.isTabExists(AppChatRequestsTab)) {
        return;
      }

      const tab = appSidebarRight.createTab(AppChatRequestsTab);
      await tab.open(this.chat.peerId.toChatId());
      appSidebarRight.toggleSidebar(true);
    }, {listenerSetter: this.topbar.listenerSetter});

    this.divAndCaption.border.remove();
    this.divAndCaption.content.remove();

    this.titleElement = new I18n.IntlElement({
      key: 'Chat.Header.RequestToJoin',
      args: [0],
      element: this.divAndCaption.title
    });
  }

  public unset(peerId: PeerId) {
    this.peerId = peerId;
    if(this.stackedAvatars) {
      this.stackedAvatars.container.remove();
      this.stackedAvatarsMiddlewareHelper.destroy();
    }
    this.toggle(true);
  }

  public async set(peerId: PeerId, peerIds: PeerId[], length: number) {
    if(!peerIds.length) {
      return () => this.unset(peerId);
    }

    const oldStackedAvatars = this.stackedAvatars;
    const oldStackedAvatarsMiddlewareHelper = this.stackedAvatarsMiddlewareHelper;
    this.stackedAvatarsMiddlewareHelper = getMiddleware();
    const avatars = this.stackedAvatars = new StackedAvatars({avatarSize: 32, middleware: this.stackedAvatarsMiddlewareHelper.get()});
    const loadPromises: Promise<any>[] = [];
    avatars.render(peerIds, loadPromises);
    await Promise.all(loadPromises);

    return () => {
      this.peerId = peerId;
      this.titleElement.compareAndUpdate({args: [length]});
      this.wrapperUtils.before(avatars.container, this.titleElement.element);
      if(oldStackedAvatars) {
        oldStackedAvatars.container.remove();
        oldStackedAvatarsMiddlewareHelper?.destroy();
      }
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
      this.chat.managers.acknowledged.appProfileManager.getProfileByPeerId(peerId),
      apiManagerProxy.getState()
    ]).then(([peerFullAcked, state]) => {
      return {
        cached: peerFullAcked.cached,
        result: callbackify(peerFullAcked.result, (peerFull) => {
          const recentRequesters = (peerFull as ChatFull.channelFull)?.recent_requesters;
          if(recentRequesters &&
            (!state.hideChatJoinRequests[peerId] || (Date.now() - state.hideChatJoinRequests[peerId]) >= ONE_DAY)) {
            return this.set(
              peerId,
              recentRequesters.slice(0, 3).map((userId) => userId.toPeerId(false)),
              (peerFull as ChatFull.channelFull).requests_pending
            );
          } else {
            return this.set(peerId, [], 0);
          }
        })
      };
    });
  }

  // public destroy() {
  //   super.destroy();
  //   this.middlewareHelper.destroy();
  // }
}
