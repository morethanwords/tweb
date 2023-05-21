/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Channel} from '../../lib/appManagers/appChatsManager';
import type {AppSidebarRight} from '../sidebarRight';
import type Chat from './chat';
import {RIGHT_COLUMN_ACTIVE_CLASSNAME} from '../sidebarRight';
import mediaSizes, {ScreenSize} from '../../helpers/mediaSizes';
import {IS_SAFARI} from '../../environment/userAgent';
import rootScope from '../../lib/rootScope';
import AvatarElement from '../avatar';
import Button from '../button';
import ButtonIcon from '../buttonIcon';
import ButtonMenuToggle from '../buttonMenuToggle';
import ChatAudio from './audio';
import ChatPinnedMessage from './pinnedMessage';
import ListenerSetter from '../../helpers/listenerSetter';
import PopupDeleteDialog from '../popups/deleteDialog';
import appNavigationController from '../appNavigationController';
import {LEFT_COLUMN_ACTIVE_CLASSNAME} from '../sidebarLeft';
import PeerTitle from '../peerTitle';
import {i18n} from '../../lib/langPack';
import findUpClassName from '../../helpers/dom/findUpClassName';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import findUpTag from '../../helpers/dom/findUpTag';
import {toast, toastNew} from '../toast';
import replaceContent from '../../helpers/dom/replaceContent';
import {ChatFull, Chat as MTChat, GroupCall} from '../../layer';
import PopupPickUser from '../popups/pickUser';
import PopupPeer from '../popups/peer';
import AppEditContactTab from '../sidebarRight/tabs/editContact';
import appMediaPlaybackController from '../appMediaPlaybackController';
import IS_GROUP_CALL_SUPPORTED from '../../environment/groupCallSupport';
import IS_CALL_SUPPORTED from '../../environment/callSupport';
import {CallType} from '../../lib/calls/types';
import PopupMute from '../popups/mute';
import {AppManagers} from '../../lib/appManagers/managers';
import hasRights from '../../lib/appManagers/utils/chats/hasRights';
import wrapPeerTitle from '../wrappers/peerTitle';
import groupCallsController from '../../lib/calls/groupCallsController';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {makeMediaSize} from '../../helpers/mediaSize';
import {FOLDER_ID_ALL} from '../../lib/mtproto/mtproto_config';
import formatNumber from '../../helpers/number/formatNumber';
import PopupElement from '../popups';
import ChatRequests from './requests';
import modifyAckedResult, {modifyAckedPromise} from '../../helpers/modifyAckedResult';
import callbackify from '../../helpers/callbackify';

type ButtonToVerify = {element?: HTMLElement, verify: () => boolean | Promise<boolean>};

const PINNED_ALWAYS_FLOATING = false;

export default class ChatTopbar {
  public container: HTMLDivElement;
  private btnBack: HTMLButtonElement;
  private btnBackBadge: HTMLElement;
  private chatInfo: HTMLDivElement;
  private avatarElement: AvatarElement;
  private title: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private chatUtils: HTMLDivElement;
  private btnJoin: HTMLButtonElement;
  private btnPinned: HTMLButtonElement;
  private btnCall: HTMLButtonElement;
  private btnGroupCall: HTMLButtonElement;
  private btnMute: HTMLButtonElement;
  private btnSearch: HTMLButtonElement;
  private btnMore: HTMLElement;

  private chatRequests: ChatRequests;
  private chatAudio: ChatAudio;
  public pinnedMessage: ChatPinnedMessage;

  private setUtilsRAF: number;
  private setPeerStatusInterval: number;

  public listenerSetter: ListenerSetter;

  private menuButtons: Parameters<typeof ButtonMenuToggle>[0]['buttons'];
  private buttonsToVerify: ButtonToVerify[];
  private chatInfoContainer: HTMLDivElement;
  private person: HTMLDivElement;

  constructor(
    private chat: Chat,
    private appSidebarRight: AppSidebarRight,
    private managers: AppManagers
  ) {
    this.listenerSetter = new ListenerSetter();

    this.menuButtons = [];
    this.buttonsToVerify = [];
  }

  public construct() {
    // this.chat.log.error('Topbar construction');

    this.container = document.createElement('div');
    this.container.classList.add('sidebar-header', 'topbar', 'hide');
    this.container.dataset.floating = '0';

    this.btnBack = ButtonIcon('left sidebar-close-button', {noRipple: true});
    this.btnBackBadge = document.createElement('span');
    this.btnBackBadge.classList.add('badge', 'badge-20', 'badge-primary', 'back-unread-badge');
    this.btnBack.append(this.btnBackBadge);

    // * chat info section
    this.chatInfoContainer = document.createElement('div');
    this.chatInfoContainer.classList.add('chat-info-container');

    this.chatInfo = document.createElement('div');
    this.chatInfo.classList.add('chat-info');

    const person = this.person = document.createElement('div');
    person.classList.add('person');

    const content = document.createElement('div');
    content.classList.add('content');

    const top = document.createElement('div');
    top.classList.add('top');

    this.title = document.createElement('div');
    this.title.classList.add('user-title');

    top.append(this.title);

    const bottom = document.createElement('div');
    bottom.classList.add('bottom');

    if(this.subtitle) {
      bottom.append(this.subtitle);
    }

    content.append(top, bottom);
    if(this.avatarElement) {
      person.append(this.avatarElement);
    }

    person.append(content);
    this.chatInfo.append(person);

    // * chat utils section
    this.chatUtils = document.createElement('div');
    this.chatUtils.classList.add('chat-utils');

    this.chatAudio = new ChatAudio(this, this.chat, this.managers);
    this.chatRequests = new ChatRequests(this, this.chat, this.managers);

    if(this.menuButtons.length) {
      this.btnMore = ButtonMenuToggle({
        listenerSetter: this.listenerSetter,
        direction: 'bottom-left',
        buttons: this.menuButtons,
        onOpen: async(e, element) => {
          const deleteButton = this.menuButtons[this.menuButtons.length - 1];
          if(deleteButton?.element) {
            const deleteButtonText = await this.managers.appPeersManager.getDeleteButtonText(this.peerId);
            deleteButton.element.lastChild.replaceWith(i18n(deleteButtonText));
          }
        }
      });
    }

    this.chatUtils.append(...[
      // this.chatAudio ? this.chatAudio.divAndCaption.container : null,
      // this.pinnedMessage ? this.pinnedMessage.pinnedMessageContainer.divAndCaption.container : null,
      this.btnJoin,
      this.btnPinned,
      this.btnCall,
      this.btnGroupCall,
      this.btnMute,
      this.btnSearch,
      this.btnMore
    ].filter(Boolean));

    this.pushButtonToVerify(this.btnCall, this.verifyCallButton.bind(this, 'voice'));
    this.pushButtonToVerify(this.btnGroupCall, this.verifyVideoChatButton);

    this.chatInfoContainer.append(this.btnBack, this.chatInfo, this.chatUtils);
    this.container.append(this.chatInfoContainer);

    if(this.pinnedMessage) {
      this.appendPinnedMessage(this.pinnedMessage);
    }

    if(this.chatAudio) {
      // this.container.append(this.chatAudio.divAndCaption.container, this.chatUtils);
      this.container.append(this.chatAudio.divAndCaption.container);
    }

    if(this.chatRequests) {
      this.container.append(this.chatRequests.divAndCaption.container);
    }

    // * construction end

    // * fix topbar overflow section

    this.listenerSetter.add(window)('resize', this.onResize);
    this.listenerSetter.add(mediaSizes)('changeScreen', this.onChangeScreen);

    attachClickEvent(this.container, (e) => {
      const container = findUpClassName(e.target, 'pinned-container');
      blurActiveElement();
      if(container) {
        cancelEvent(e);

        if(findUpClassName(e.target, 'progress-line') || findUpClassName(e.target, 'pinned-container-wrapper-utils')) {
          return;
        }

        const mid = +container.dataset.mid;
        if(container.classList.contains('pinned-message')) {
          // if(!this.pinnedMessage.locked) {
          this.pinnedMessage.followPinnedMessage(mid);
          // }
        } else {
          const peerId = container.dataset.peerId.toPeerId();
          const searchContext = appMediaPlaybackController.getSearchContext();
          this.chat.appImManager.setInnerPeer({
            peerId,
            lastMsgId: mid,
            type: searchContext.isScheduled ? 'scheduled' : (searchContext.threadId ? 'discussion' : undefined),
            threadId: searchContext.threadId
          });
        }
      } else {
        if(mediaSizes.activeScreen === ScreenSize.medium && document.body.classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME)) {
          onBtnBackClick();
        } else if(findUpTag(e.target, 'AVATAR-ELEMENT')) {
          this.appSidebarRight.toggleSidebar(!document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME));
        } else {
          this.appSidebarRight.toggleSidebar(true);
        }
      }
    }, {listenerSetter: this.listenerSetter});

    const onBtnBackClick = (e?: Event) => {
      if(e) {
        cancelEvent(e);
      }

      // const item = appNavigationController.findItemByType('chat');
      // * return manually to chat by arrow, since can't get back to
      if(mediaSizes.activeScreen === ScreenSize.medium && document.body.classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME)) {
        this.chat.appImManager.setPeer({peerId: this.peerId});
      } else {
        const isFirstChat = this.chat.appImManager.chats.indexOf(this.chat) === 0;
        appNavigationController.back(isFirstChat ? 'im' : 'chat');
        /* return;

        if(mediaSizes.activeScreen === ScreenSize.medium && !appNavigationController.findItemByType('chat')) {
          this.chat.appImManager.setPeer(0);
          blurActiveElement();
        } else {
          appNavigationController.back('chat');
        } */
      }
    };

    attachClickEvent(this.btnBack, onBtnBackClick, {listenerSetter: this.listenerSetter});
  }

  private pushButtonToVerify(element: HTMLElement, verify: ButtonToVerify['verify']) {
    if(!element) {
      return;
    }

    this.buttonsToVerify.push({element, verify});
  }

  private verifyButtons = (e?: Event) => {
    const isMenuOpen = !!e || !!(this.btnMore && this.btnMore.classList.contains('menu-open'));

    e && cancelEvent(e);

    const r = async() => {
      const buttons = this.buttonsToVerify.concat(isMenuOpen ? this.menuButtons as any : []);
      const results = await Promise.all(buttons.map(async(button) => {
        return {
          result: await button.verify(),
          button
        }
      }));

      results.forEach(({button, result}) => {
        button.element.classList.toggle('hide', !result);
      });
    };

    r();
  };

  private verifyVideoChatButton = async(type?: 'group' | 'broadcast') => {
    if(!IS_GROUP_CALL_SUPPORTED || this.peerId.isUser() || this.chat.type !== 'chat' || this.chat.threadId) return false;

    const currentGroupCall = groupCallsController.groupCall;
    const chatId = this.peerId.toChatId();
    if(currentGroupCall?.chatId === chatId) {
      return false;
    }

    if(type) {
      if(((await this.managers.appPeersManager.isBroadcast(this.peerId)) && type === 'group') ||
        ((await this.managers.appPeersManager.isAnyGroup(this.peerId)) && type === 'broadcast')) {
        return false;
      }
    }

    const chat = await this.managers.appChatsManager.getChat(chatId);
    return (chat as MTChat.chat).pFlags?.call_active || hasRights(chat, 'manage_call');
  };

  private verifyCallButton = async(type?: CallType) => {
    if(!IS_CALL_SUPPORTED || !this.peerId.isUser() || this.chat.type !== 'chat') return false;
    const userId = this.peerId.toUserId();
    const userFull = await this.managers.appProfileManager.getCachedFullUser(userId);

    return !!userFull && !!(type === 'voice' ? userFull.pFlags.phone_calls_available : userFull.pFlags.video_calls_available);
  };

  public constructUtils() {
    this.menuButtons = [{
      icon: 'search',
      text: 'Search',
      onClick: () => {
        this.chat.initSearch();
      },
      verify: () => mediaSizes.isMobile
    }, /* {
      icon: 'pinlist',
      text: 'Pinned Messages',
      onClick: () => this.openPinned(false),
      verify: () => mediaSizes.isMobile
    }, */{
      icon: 'mute',
      text: 'ChatList.Context.Mute',
      onClick: this.onMuteClick,
      verify: async() => this.chat.type === 'chat' && rootScope.myId !== this.peerId && !(await this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.peerId, respectType: false, threadId: this.chat.threadId}))
    }, {
      icon: 'unmute',
      text: 'ChatList.Context.Unmute',
      onClick: () => {
        this.managers.appMessagesManager.togglePeerMute({peerId: this.peerId, threadId: this.chat.threadId});
      },
      verify: async() => this.chat.type === 'chat' && rootScope.myId !== this.peerId && (await this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.peerId, respectType: false, threadId: this.chat.threadId}))
    }, {
      icon: 'comments',
      text: 'ViewDiscussion',
      onClick: () => {
        const middleware = this.chat.bubbles.getMiddleware();
        Promise.resolve(this.managers.appProfileManager.getChannelFull(this.peerId.toChatId())).then((channelFull) => {
          if(middleware() && channelFull.linked_chat_id) {
            this.chat.appImManager.setInnerPeer({
              peerId: channelFull.linked_chat_id.toPeerId(true)
            });
          }
        });
      },
      verify: async() => {
        const chatFull = await this.managers.appProfileManager.getCachedFullChat(this.peerId.toChatId());
        return this.chat.type === 'chat' && !!(chatFull as ChatFull.channelFull)?.linked_chat_id;
      }
    }, {
      icon: 'phone',
      text: 'Call',
      onClick: this.onCallClick.bind(this, 'voice'),
      verify: this.verifyCallButton.bind(this, 'voice')
    }, {
      icon: 'videocamera',
      text: 'VideoCall',
      onClick: this.onCallClick.bind(this, 'video'),
      verify: this.verifyCallButton.bind(this, 'video')
    }, {
      icon: 'videochat',
      text: 'PeerInfo.Action.LiveStream',
      onClick: this.onJoinGroupCallClick,
      verify: this.verifyVideoChatButton.bind(this, 'broadcast')
    }, {
      icon: 'videochat',
      text: 'PeerInfo.Action.VoiceChat',
      onClick: this.onJoinGroupCallClick,
      verify: this.verifyVideoChatButton.bind(this, 'group')
    }, {
      icon: 'select',
      text: 'Chat.Menu.SelectMessages',
      onClick: () => {
        const selection = this.chat.selection;
        selection.toggleSelection(true, true);
        apiManagerProxy.getState().then((state) => {
          if(state.chatContextMenuHintWasShown) {
            return;
          }

          const original = selection.toggleByElement.bind(selection);
          selection.toggleByElement = async(bubble) => {
            this.managers.appStateManager.pushToState('chatContextMenuHintWasShown', true);
            toast(i18n('Chat.Menu.Hint'));

            selection.toggleByElement = original;
            selection.toggleByElement(bubble);
          };
        });
      },
      verify: () => !this.chat.selection.isSelecting && !!this.chat.bubbles.getRenderedLength()
    }, {
      icon: 'select',
      text: 'Chat.Menu.ClearSelection',
      onClick: () => {
        this.chat.selection.cancelSelection();
      },
      verify: () => this.chat.selection.isSelecting
    }, {
      icon: 'adduser',
      text: 'AddContact',
      onClick: () => {
        if(!this.appSidebarRight.isTabExists(AppEditContactTab)) {
          const tab = this.appSidebarRight.createTab(AppEditContactTab);
          tab.peerId = this.peerId;
          tab.open();

          this.appSidebarRight.toggleSidebar(true);
        }
      },
      verify: async() => this.peerId.isUser() && !(await this.managers.appPeersManager.isContact(this.peerId))
    }, {
      icon: 'forward',
      text: 'ShareContact',
      onClick: () => {
        const contactPeerId = this.peerId;
        PopupPickUser.createSharingPicker((peerId) => {
          return new Promise((resolve, reject) => {
            PopupElement.createPopup(PopupPeer, '', {
              titleLangKey: 'SendMessageTitle',
              descriptionLangKey: 'SendContactToGroupText',
              descriptionLangArgs: [new PeerTitle({peerId, dialog: true}).element],
              buttons: [{
                langKey: 'Send',
                callback: () => {
                  resolve();

                  this.managers.appMessagesManager.sendContact(peerId, contactPeerId);
                  this.chat.appImManager.setInnerPeer({peerId});
                }
              }, {
                langKey: 'Cancel',
                callback: () => {
                  reject();
                },
                isCancel: true
              }],
              peerId,
              overlayClosable: true
            }).show();
          });
        });
      },
      verify: async() => rootScope.myId !== this.peerId && this.peerId.isUser() && (await this.managers.appPeersManager.isContact(this.peerId)) && !!(await this.managers.appUsersManager.getUser(this.peerId.toUserId())).phone
    }, {
      icon: 'gift',
      text: 'GiftPremium',
      onClick: () => this.chat.appImManager.giftPremium(this.peerId),
      verify: () => this.chat.canGiftPremium()
    }, {
      icon: 'bots',
      text: 'Settings',
      onClick: () => {
        this.managers.appMessagesManager.sendText(this.peerId, '/settings');
      },
      verify: async() => {
        try {
          const attachMenuBot = await this.managers.appAttachMenuBotsManager.getAttachMenuBot(this.peerId.toUserId());
          return !!attachMenuBot?.pFlags?.has_settings;
        } catch(err) {
          return false;
        }
      }
    }, {
      icon: 'lock',
      text: 'BlockUser',
      onClick: () => {
        PopupElement.createPopup(PopupPeer, '', {
          peerId: this.peerId,
          titleLangKey: 'BlockUser',
          descriptionLangKey: 'AreYouSureBlockContact2',
          descriptionLangArgs: [new PeerTitle({peerId: this.peerId}).element],
          buttons: [{
            langKey: 'BlockUser',
            isDanger: true,
            callback: () => {
              this.managers.appUsersManager.toggleBlock(this.peerId, true).then((value) => {
                if(value) {
                  toastNew({langPackKey: 'UserBlocked'});
                }
              });
            }
          }]
        }).show();
      },
      verify: async() => {
        if(!this.peerId.isUser()) return false;
        const userFull = await this.managers.appProfileManager.getCachedFullUser(this.peerId.toUserId());
        return this.peerId !== rootScope.myId && userFull && !userFull.pFlags?.blocked;
      }
    }, {
      icon: 'lockoff',
      text: 'Unblock',
      onClick: () => {
        this.managers.appUsersManager.toggleBlock(this.peerId, false).then((value) => {
          if(value) {
            toastNew({langPackKey: 'UserUnblocked'});
          }
        });
      },
      verify: async() => {
        const userFull = await this.managers.appProfileManager.getCachedFullUser(this.peerId.toUserId());
        return !!userFull?.pFlags?.blocked;
      }
    }, {
      icon: 'delete danger',
      text: 'Delete',
      onClick: () => {
        PopupElement.createPopup(PopupDeleteDialog, this.peerId/* , 'leave' */);
      },
      verify: async() => this.chat.type === 'chat' && !!(await this.managers.appMessagesManager.getDialogOnly(this.peerId))
    }];

    this.btnSearch = ButtonIcon('search');
    this.attachClickEvent(this.btnSearch, (e) => {
      this.chat.initSearch();
    }, true);
  }

  public attachClickEvent(el: HTMLElement, cb: (e: MouseEvent) => void, noBlur?: boolean) {
    attachClickEvent(el, (e) => {
      cancelEvent(e);
      !noBlur && blurActiveElement();
      cb(e);
    }, {listenerSetter: this.listenerSetter});
  }

  private onCallClick(type: CallType) {
    this.chat.appImManager.callUser(this.peerId.toUserId(), type);
  }

  private onJoinGroupCallClick = () => {
    this.chat.appImManager.joinGroupCall(this.peerId);
  };

  private constructAvatar() {
    const avatarElement = new AvatarElement();
    avatarElement.isDialog = true;
    avatarElement.classList.add('avatar-42', 'person-avatar');
    return avatarElement;
  }

  private get peerId() {
    return this.chat.peerId;
  }

  public constructPeerHelpers() {
    this.avatarElement = this.constructAvatar();

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('info');

    this.pinnedMessage = new ChatPinnedMessage(this, this.chat, this.managers);

    this.btnJoin = Button('btn-primary btn-color-primary chat-join hide');
    this.btnCall = ButtonIcon('phone');
    this.btnGroupCall = ButtonIcon('videochat');
    this.btnPinned = ButtonIcon('pinlist');
    this.btnMute = ButtonIcon('mute');

    this.attachClickEvent(this.btnCall, this.onCallClick.bind(this, 'voice'));
    this.attachClickEvent(this.btnGroupCall, this.onJoinGroupCallClick);

    this.attachClickEvent(this.btnPinned, () => {
      this.openPinned(true);
    });

    this.attachClickEvent(this.btnMute, this.onMuteClick);

    this.attachClickEvent(this.btnJoin, async() => {
      const middleware = this.chat.bubbles.getMiddleware();
      this.btnJoin.setAttribute('disabled', 'true');

      const chatId = this.peerId.toChatId();
      let promise: Promise<any>;
      if(await this.managers.appChatsManager.isChannel(chatId)) {
        promise = this.managers.appChatsManager.joinChannel(chatId);
      } else {
        promise = this.managers.appChatsManager.addChatUser(chatId, rootScope.myId);
      }

      promise.finally(() => {
        if(!middleware()) {
          return;
        }

        this.btnJoin.removeAttribute('disabled');
      });
    });

    this.listenerSetter.add(rootScope)('folder_unread', (folder) => {
      if(folder.id !== FOLDER_ID_ALL) {
        return;
      }

      const size = folder.unreadUnmutedPeerIds.size;
      this.btnBackBadge.textContent = size ? '' + formatNumber(size, 1) : '';
      // this.btnBack.classList.remove('tgico-left', 'tgico-previous');
      // this.btnBack.classList.add(size ? 'tgico-previous' : 'tgico-left');
    });

    this.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      if(this.peerId === chatId.toPeerId(true)) {
        const chat = await this.managers.appChatsManager.getChat(chatId) as Channel/*  | Chat */;

        this.btnJoin.classList.toggle('hide', !(chat as Channel)?.pFlags?.left);
        this.setUtilsWidth();
        this.verifyButtons();
      }
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(dialog.peerId === this.peerId) {
        this.setMutedState();
      }
    });

    this.listenerSetter.add(rootScope)('peer_typings', ({peerId}) => {
      if(this.peerId === peerId) {
        this.setPeerStatus();
      }
    });

    this.listenerSetter.add(rootScope)('user_update', (userId) => {
      if(this.peerId === userId.toPeerId()) {
        this.setPeerStatus();
      }
    });

    this.listenerSetter.add(rootScope)('peer_full_update', (peerId) => {
      if(this.peerId === peerId) {
        this.verifyButtons();
      }
    });

    this.listenerSetter.add(rootScope)('chat_requests', ({chatId, recentRequesters, requestsPending}) => {
      if(this.peerId !== chatId.toPeerId(true)) {
        return;
      }

      const middleware = this.chat.bubbles.getMiddleware();
      this.chatRequests.set(
        this.peerId,
        recentRequesters.map((userId) => userId.toPeerId(false)),
        requestsPending
      ).then((callback) => {
        if(!middleware()) {
          return;
        }

        callback();
      });
    });

    this.chat.addEventListener('setPeer', (mid, isTopMessage) => {
      const middleware = this.chat.bubbles.getMiddleware();
      apiManagerProxy.getState().then((state) => {
        if(!middleware() || !this.pinnedMessage) return;

        this.pinnedMessage.hidden = !!state.hiddenPinnedMessages[this.chat.peerId];

        if(isTopMessage) {
          this.pinnedMessage.unsetScrollDownListener();
          this.pinnedMessage.testMid(mid, 0); // * because slider will not let get bubble by document.elementFromPoint
        } else if(!this.pinnedMessage.locked) {
          this.pinnedMessage.handleFollowingPinnedMessage();
          this.pinnedMessage.testMid(mid);
        }
      });
    });

    this.listenerSetter.add(rootScope)('peer_pinned_messages', ({peerId, mids}) => {
      if(this.chat.type !== 'pinned' || peerId !== this.peerId) {
        return;
      }

      if(mids) {
        this.setTitle();
      }
    });

    this.setPeerStatusInterval = window.setInterval(this.setPeerStatus, 60e3);

    return this;
  }

  public openPinned(byCurrent: boolean) {
    this.chat.appImManager.setInnerPeer({
      peerId: this.peerId,
      lastMsgId: byCurrent ? +this.pinnedMessage.pinnedMessageContainer.divAndCaption.container.dataset.mid : 0,
      type: 'pinned'
    });
  }

  private onMuteClick = () => {
    PopupElement.createPopup(PopupMute, this.peerId);
  };

  private onResize = () => {
    this.setUtilsWidth(true);
    this.setFloating();
  };

  private onChangeScreen = (from: ScreenSize, to: ScreenSize) => {
    const isFloating = to === ScreenSize.mobile || PINNED_ALWAYS_FLOATING;
    this.container.classList.toggle('is-pinned-floating', mediaSizes.isMobile || isFloating);
    // this.chatAudio && this.chatAudio.divAndCaption.container.classList.toggle('is-floating', to === ScreenSize.mobile);
    this.pinnedMessage && this.pinnedMessage.pinnedMessageContainer.divAndCaption.container.classList.toggle('is-floating', isFloating);
    this.onResize();
  };

  public destroy() {
    // this.chat.log.error('Topbar destroying');
    this.listenerSetter.removeAll();
    window.clearInterval(this.setPeerStatusInterval);

    this.pinnedMessage?.destroy(); // * возможно это можно не делать
    this.chatAudio?.destroy();
    this.chatRequests?.destroy();

    delete this.pinnedMessage;
    delete this.chatAudio;
    delete this.chatRequests;
  }

  public cleanup() {
    if(!this.chat.peerId) {
      this.container.classList.add('hide');
    }
  }

  private appendPinnedMessage(pinnedMessage: ChatPinnedMessage) {
    const container = pinnedMessage.pinnedMessageContainer.divAndCaption.container;
    if(this.pinnedMessage && this.pinnedMessage !== pinnedMessage) {
      this.pinnedMessage.pinnedMessageContainer.divAndCaption.container.replaceWith(container);
    } else {
      if(PINNED_ALWAYS_FLOATING) {
        this.container.append(container);
      } else {
        this.chatUtils.prepend(container);
      }
    }
  }

  public async finishPeerChange(options: Parameters<Chat['finishPeerChange']>[0]) {
    const {peerId, threadId} = this.chat;
    const {middleware} = options;

    let newAvatar: AvatarElement;
    if(this.chat.type === 'chat') {
      if(this.avatarElement?.peerId !== this.peerId || this.avatarElement.threadId !== this.chat.threadId) {
        newAvatar = this.constructAvatar();
      } else {
        newAvatar = this.avatarElement;
      }
    }

    const [
      isBroadcast,
      isAnyChat,
      chat,
      _,
      setTitleCallback,
      setStatusCallback,
      state,
      setRequestsCallback
    ] = await Promise.all([
      this.managers.appPeersManager.isBroadcast(peerId),
      this.managers.appPeersManager.isAnyChat(peerId),
      peerId.isAnyChat() ? this.managers.appChatsManager.getChat(peerId.toChatId()) : undefined,
      newAvatar ? newAvatar.updateWithOptions({peerId, threadId, wrapOptions: {customEmojiSize: makeMediaSize(32, 32)}}) : undefined,
      this.setTitleManual(),
      this.setPeerStatusManual(true),
      apiManagerProxy.getState(),
      modifyAckedPromise(this.chatRequests.setPeerId(peerId))
    ]);

    return () => {
      const canHaveSomeButtons = !(this.chat.type === 'pinned' || this.chat.type === 'scheduled');
      this.btnMute && this.btnMute.classList.toggle('hide', !isBroadcast || !canHaveSomeButtons);
      if(this.btnJoin) {
        if(isAnyChat && !this.chat.isRestricted && canHaveSomeButtons) {
          replaceContent(this.btnJoin, i18n(isBroadcast ? 'Chat.Subscribe' : 'ChannelJoin'));
          this.btnJoin.classList.toggle('hide', !(chat as MTChat.chat)?.pFlags?.left);
        } else {
          this.btnJoin.classList.add('hide');
        }
      }

      if(this.btnSearch) {
        this.btnSearch.classList.toggle('hide', !canHaveSomeButtons);
      }

      if(this.btnPinned) {
        this.btnPinned.classList.toggle('hide', !canHaveSomeButtons);
      }

      if(this.avatarElement !== newAvatar) {
        if(newAvatar) {
          if(this.avatarElement) {
            this.avatarElement.replaceWith(newAvatar);
          } else {
            this.person.prepend(newAvatar);
          }
        }

        this.avatarElement?.remove();
        this.avatarElement = newAvatar;
      }

      this.setUtilsWidth();

      this.verifyButtons();

      if(this.btnMore) {
        this.btnMore.classList.toggle('hide', !canHaveSomeButtons);
      }

      const isPinnedMessagesNeeded = this.chat.isPinnedMessagesNeeded();
      if(isPinnedMessagesNeeded || this.chat.type === 'discussion') {
        if(this.chat.wasAlreadyUsed || !this.pinnedMessage) { // * change
          const newPinnedMessage = new ChatPinnedMessage(this, this.chat, this.managers);
          this.appendPinnedMessage(newPinnedMessage);
          this.pinnedMessage?.destroy();
          this.pinnedMessage = newPinnedMessage;
        }

        if(isPinnedMessagesNeeded) {
          this.pinnedMessage.hidden = !!state.hiddenPinnedMessages[peerId];
        } else if(this.chat.type === 'discussion') {
          this.pinnedMessage.pinnedMid = this.chat.threadId;
          this.pinnedMessage.count = 1;
          this.pinnedMessage.pinnedIndex = 0;
          this.pinnedMessage._setPinnedMessage();
        }
      } else if(this.pinnedMessage) {
        this.pinnedMessage.destroy();
        this.pinnedMessage = undefined;
      }

      setTitleCallback();
      setStatusCallback?.();
      this.subtitle.classList.toggle('hide', !setStatusCallback);
      this.setMutedState();

      this.container.classList.remove('hide');

      if(setRequestsCallback.result instanceof Promise) {
        this.chatRequests.unset(peerId);
      }

      callbackify(setRequestsCallback.result, (callback) => {
        if(!middleware()) {
          return;
        }

        callback();
      });
    };
  }

  public async setTitleManual(count?: number) {
    const {peerId, threadId} = this.chat;
    const middleware = () => this.chat.bubbles.getMiddleware();
    let titleEl: HTMLElement, icons: Element[];
    if(this.chat.type === 'pinned') {
      if(count === undefined) titleEl = i18n('Loading');
      else titleEl = i18n('PinnedMessagesCount', [count]);

      if(count === undefined) {
        this.managers.appMessagesManager.getSearchCounters(
          peerId,
          [{_: 'inputMessagesFilterPinned'}],
          false
        ).then((result) => {
          if(!middleware()) return;
          const count = result[0].count;
          this.setTitle(count);

          // ! костыль х2, это нужно делать в другом месте
          if(!count) {
            this.chat.appImManager.setPeer(); // * close tab

            // ! костыль, это скроет закреплённые сообщения сразу, вместо того, чтобы ждать пока анимация перехода закончится
            const originalChat = this.chat.appImManager.chat;
            if(originalChat.topbar.pinnedMessage) {
              originalChat.topbar.pinnedMessage.pinnedMessageContainer.toggle(true);
            }
          }
        });
      }
    } else if(this.chat.type === 'scheduled') {
      titleEl = i18n(peerId === rootScope.myId ? 'Reminders' : 'ScheduledMessages');
    } else if(this.chat.type === 'discussion') {
      if(count === undefined) {
        const result = await this.managers.acknowledged.appMessagesManager.getHistory({
          peerId,
          offsetId: 0,
          limit: 1,
          backLimit: 0,
          threadId
        });
        if(!middleware()) return;
        if(result.cached) {
          const historyResult = await result.result;
          if(!middleware()) return;
          count = historyResult.count;
        } else result.result.then((historyResult) => {
          if(!middleware()) return;
          this.setTitle(historyResult.count);
        });
      }

      if(count === undefined) titleEl = i18n('Loading');
      else titleEl = i18n('Chat.Title.Comments', [count]);
    } else if(this.chat.type === 'chat') {
      [titleEl/* , icons */] = await Promise.all([
        wrapPeerTitle({
          peerId,
          dialog: true,
          withIcons: !threadId,
          threadId: threadId
        })
        // generateTitleIcons(peerId)
      ]);

      if(!middleware()) {
        return;
      }
    }

    return () => {
      replaceContent(this.title, titleEl);
      // if(icons) {
      //   this.title.append(...icons);
      // }
    };
  }

  public setTitle(count?: number) {
    this.setTitleManual(count).then((setTitleCallback) => setTitleCallback());
  }

  public async setMutedState() {
    if(!this.btnMute) return;

    const peerId = this.peerId;
    const muted = await this.managers.appNotificationsManager.isPeerLocalMuted({peerId, respectType: false, threadId: this.chat.threadId});
    if(await this.managers.appPeersManager.isBroadcast(peerId)) { // not human
      this.btnMute.classList.remove('tgico-mute', 'tgico-unmute');
      this.btnMute.classList.add(muted ? 'tgico-unmute' : 'tgico-mute');
      this.btnMute.style.display = '';
    } else {
      this.btnMute.style.display = 'none';
    }
  }

  // ! У МЕНЯ ПРОСТО СГОРЕЛО, САФАРИ КОНЧЕННЫЙ БРАУЗЕР - ЕСЛИ НЕ СКРЫВАТЬ БЛОК, ТО ПРИ ПЕРЕВОРОТЕ ЭКРАНА НА АЙФОНЕ БЛОК БУДЕТ НЕПРАВИЛЬНО ШИРИНЫ, ДАЖЕ БЕЗ ЭТОЙ ФУНКЦИИ!
  public setUtilsWidth = (resize = false) => {
    // return;
    if(this.setUtilsRAF) window.cancelAnimationFrame(this.setUtilsRAF);

    if(IS_SAFARI && resize) {
      this.chatUtils.classList.add('hide');
    }

    // mutationObserver.disconnect();
    this.setUtilsRAF = window.requestAnimationFrame(() => {
      // mutationRAF = window.requestAnimationFrame(() => {

      // setTimeout(() => {
      if(IS_SAFARI && resize) {
        this.chatUtils.classList.remove('hide');
      }
      /* this.chatInfo.style.removeProperty('--utils-width');
          void this.chatInfo.offsetLeft; // reflow */
      const width = /* chatUtils.scrollWidth */this.chatUtils.getBoundingClientRect().width;
      this.chat.log('utils width:', width);
      this.container.style.setProperty('--utils-width', width + 'px');
      // this.chatInfo.classList.toggle('have-utils-width', !!width);
      // }, 0);

      this.setUtilsRAF = 0;

      // mutationObserver.observe(chatUtils, observeOptions);
      // });
    });
  };

  public setFloating = () => {
    const containers = [
      this.chatAudio,
      this.chatRequests,
      this.pinnedMessage?.pinnedMessageContainer
    ].filter(Boolean);
    const count = containers.reduce((acc, container) => {
      const isFloating = container.isFloating();
      this.container.classList.toggle(`is-pinned-${container.className}-floating`, isFloating);

      if(!container.isVisible()) {
        return acc;
      }

      return acc + +isFloating;
    }, 0);
    this.container.dataset.floating = '' + count;
  };

  public setPeerStatusManual = async(needClear = false) => {
    if(!this.subtitle || this.chat.type !== 'chat') return;

    if(this.chat.threadId) {
      const title = await wrapPeerTitle({peerId: this.peerId, dialog: true});
      const span = i18n('TopicProfileStatus', [title]);
      return () => replaceContent(this.subtitle, span);
    }

    const peerId = this.peerId;
    return this.chat.appImManager.setPeerStatus({
      peerId,
      element: this.subtitle,
      needClear,
      useWhitespace: false,
      middleware: () => peerId === this.peerId
    });
  };

  public setPeerStatus = (needClear?: boolean) => {
    return this.setPeerStatusManual(needClear).then((callback) => {
      callback?.();
    });
  };
}
