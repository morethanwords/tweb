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
import rootScope, {BroadcastEvents} from '../../lib/rootScope';
import Button, {replaceButtonIcon} from '../button';
import ButtonIcon from '../buttonIcon';
import ButtonMenuToggle from '../buttonMenuToggle';
import ChatAudio from './audio';
import ChatPinnedMessage from './pinnedMessage';
import ListenerSetter from '../../helpers/listenerSetter';
import PopupDeleteDialog from '../popups/deleteDialog';
import appNavigationController from '../appNavigationController';
import {LEFT_COLUMN_ACTIVE_CLASSNAME} from '../sidebarLeft';
import PeerTitle from '../peerTitle';
import I18n, {LangPackKey, i18n} from '../../lib/langPack';
import findUpClassName from '../../helpers/dom/findUpClassName';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {toast, toastNew} from '../toast';
import replaceContent from '../../helpers/dom/replaceContent';
import {ChatFull, Chat as MTChat, GroupCall, Dialog} from '../../layer';
import PopupPickUser from '../popups/pickUser';
import PopupPeer, {PopupPeerCheckboxOptions} from '../popups/peer';
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
import {modifyAckedPromise} from '../../helpers/modifyAckedResult';
import callbackify from '../../helpers/callbackify';
import ChatActions from './actions';
import confirmationPopup from '../confirmationPopup';
import {avatarNew, findUpAvatar} from '../avatarNew';
import {Middleware, MiddlewareHelper, getMiddleware} from '../../helpers/middleware';
import setBadgeContent from '../../helpers/setBadgeContent';
import createBadge from '../../helpers/createBadge';
import AppStatisticsTab from '../sidebarRight/tabs/statistics';
import {ChatType} from './chat';
import AppBoostsTab from '../sidebarRight/tabs/boosts';
import ChatLive from './topbarLive/container';
import {RtmpStartStreamPopup} from '../rtmp/adminPopup';
import assumeType from '../../helpers/assumeType';
import PinnedContainer from './pinnedContainer';
import IS_LIVE_STREAM_SUPPORTED from '../../environment/liveStreamSupport';
import ChatTranslation from './translation';
import {useAppSettings} from '../../stores/appSettings';
import PopupSendGift from '../popups/sendGift';
import PaidMessagesInterceptor, {PAYMENT_REJECTED} from './paidMessagesInterceptor';
import ChatRemoveFee from './removeFee';

type ButtonToVerify = {element?: HTMLElement, verify: () => boolean | Promise<boolean>};

const PINNED_ALWAYS_FLOATING = false;

export default class ChatTopbar {
  public container: HTMLDivElement;
  private btnBack: HTMLButtonElement;
  private btnBackBadge: HTMLElement;
  private chatInfo: HTMLDivElement;
  private avatar: ReturnType<typeof avatarNew>;
  private avatarMiddlewareHelper: MiddlewareHelper;
  private title: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private chatUtils: HTMLDivElement;
  private btnJoin: HTMLButtonElement;
  private btnPinned: HTMLButtonElement;
  private btnCall: HTMLButtonElement;
  private btnGroupCall: HTMLButtonElement;
  private btnGroupCallMenu: HTMLElement;
  private btnMute: HTMLButtonElement;
  private btnSearch: HTMLButtonElement;
  private btnMore: HTMLElement;

  private chatActions: ChatActions;
  private chatRequests: ChatRequests;
  private chatRemoveFee: ChatRemoveFee;
  private chatAudio: ChatAudio;
  private chatLive: ChatLive;
  private chatTranslation: ChatTranslation;
  public pinnedMessage: ChatPinnedMessage;
  private pinnedContainers: PinnedContainer[];

  private setUtilsRAF: number;

  public listenerSetter: ListenerSetter;

  private menuButtons: Parameters<typeof ButtonMenuToggle>[0]['buttons'];
  private buttonsToVerify: ButtonToVerify[];
  private chatInfoContainer: HTMLDivElement;
  private person: HTMLDivElement;

  private titleMiddlewareHelper: MiddlewareHelper;
  private status: ReturnType<ChatTopbar['createStatus']>;

  constructor(
    private chat: Chat,
    public appSidebarRight: AppSidebarRight,
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
    this.btnBackBadge = createBadge('span', 20, 'primary');
    this.btnBackBadge.classList.add('back-unread-badge');
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

    person.append(content);
    this.chatInfo.append(person);

    // * chat utils section
    this.chatUtils = document.createElement('div');
    this.chatUtils.classList.add('chat-utils');

    this.chatAudio = new ChatAudio(this, this.chat, this.managers);
    this.chatRequests = new ChatRequests(this, this.chat, this.managers);
    this.chatActions = new ChatActions(this, this.chat, this.managers);
    this.chatRemoveFee = new ChatRemoveFee(this, this.chat, this.managers);
    if(IS_LIVE_STREAM_SUPPORTED) this.chatLive = new ChatLive(this, this.chat, this.managers);
    this.chatTranslation = new ChatTranslation(this, this.chat, this.managers);

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
      this.btnGroupCallMenu,
      this.btnMute,
      this.btnSearch,
      this.btnMore
    ].filter(Boolean));

    this.pushButtonToVerify(this.btnCall, this.verifyCallButton.bind(this, 'voice'));
    this.pushButtonToVerify(this.btnGroupCall, this.verifyVideoChatButton.bind(this, 'nonadmin'));
    this.pushButtonToVerify(this.btnGroupCallMenu, this.verifyVideoChatButton.bind(this, 'admin'));

    this.chatInfoContainer.append(this.btnBack, this.chatInfo, this.chatUtils);
    this.container.append(this.chatInfoContainer);

    if(this.pinnedMessage) {
      this.appendPinnedMessage(this.pinnedMessage);
    }

    const pinnedContainers = this.pinnedContainers = [
      this.chatAudio,
      this.chatRequests,
      this.chatActions,
      this.chatLive,
      this.chatTranslation,
      this.chatRemoveFee
    ].filter(Boolean);
    this.container.append(...pinnedContainers.map((pinnedContainer) => pinnedContainer.container));

    // * construction end

    // * fix topbar overflow section

    this.listenerSetter.add(window)('resize', this.onResize);
    this.listenerSetter.add(mediaSizes)('changeScreen', this.onChangeScreen);

    attachClickEvent(this.container, (e) => {
      if(
        findUpClassName(e.target, 'topbar-search-container') ||
        !(e.target as HTMLElement).isConnected ||
        findUpClassName(e.target, 'pinned-translation') ||
        findUpClassName(e.target, 'chat-search-top')
      ) {
        return;
      }

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
        } else if(container.dataset.peerId) {
          const peerId = container.dataset.peerId.toPeerId();
          const searchContext = appMediaPlaybackController.getSearchContext();
          this.chat.appImManager.setInnerPeer({
            peerId,
            lastMsgId: mid,
            type: searchContext.isScheduled ? ChatType.Scheduled : undefined,
            threadId: searchContext.threadId
          });
        }
      } else {
        const avatar = findUpAvatar(e.target);
        if(mediaSizes.activeScreen === ScreenSize.medium && document.body.classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME)) {
          onBtnBackClick();
        } else if(avatar) {
          if(avatar.classList.contains('has-stories')) {
            return;
          }

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

      if(this.chat.type === ChatType.Search) {
        this.chat.resetSearch();
        return;
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

  private verifyVideoChatButton = async(type?: 'group' | 'broadcast' | 'admin' | 'nonadmin') => {
    if(!IS_GROUP_CALL_SUPPORTED || this.peerId.isUser() || this.chat.type !== ChatType.Chat || this.chat.threadId) return false;

    const currentGroupCall = groupCallsController.groupCall;
    const chatId = this.peerId.toChatId();
    if(currentGroupCall?.chatId === chatId) {
      return false;
    }

    if(type) {
      if(((type === 'group' && await this.managers.appPeersManager.isBroadcast(this.peerId))) ||
        ((type === 'broadcast' && await this.managers.appPeersManager.isAnyGroup(this.peerId)))) {
        return false;
      }
    }

    const chat = apiManagerProxy.getChat(chatId);
    if(hasRights(chat, 'manage_call')) {
      if(type === 'admin') return !(chat as MTChat.chat).pFlags?.call_active;
    }
    if(!(chat as MTChat.chat).pFlags?.call_active) return false;

    const fullChat = await this.managers.appProfileManager.getChatFull(chatId);
    const groupCall = await this.managers.appGroupCallsManager.getGroupCallFull(fullChat.call.id);
    if(groupCall?._ !== 'groupCall') return false;

    return !groupCall.pFlags.rtmp_stream;
  };

  private verifyCallButton = async(type?: CallType) => {
    if(!IS_CALL_SUPPORTED || !this.peerId.isUser() || this.chat.type !== ChatType.Chat) return false;
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
      verify: async() => this.chat.type === ChatType.Chat && rootScope.myId !== this.peerId && !(await this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.peerId, respectType: false, threadId: this.chat.threadId}))
    }, {
      icon: 'unmute',
      text: 'ChatList.Context.Unmute',
      onClick: this.onUnmuteClick,
      verify: () => this.chat.type === ChatType.Chat && rootScope.myId !== this.peerId && this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.peerId, respectType: false, threadId: this.chat.threadId})
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
        return this.chat.type === ChatType.Chat && !!(chatFull as ChatFull.channelFull)?.linked_chat_id;
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
      icon: 'topics',
      text: 'TopicViewAsTopics',
      onClick: () => {
        this.chat.appImManager.toggleViewAsMessages(this.peerId, false);
      },
      verify: async() => {
        const dialog = await this.managers.appMessagesManager.getDialogOnly(this.peerId);
        return !!(dialog && (dialog as Dialog.dialog).pFlags.view_forum_as_messages);
      }
    }, {
      icon: 'topics',
      text: 'SavedViewAsChats',
      onClick: () => {
        this.chat.appImManager.toggleViewAsMessages(this.peerId, false);
      },
      verify: () => this.peerId === rootScope.myId && !this.chat.threadId && !rootScope.settings.savedAsForum
    }, {
      icon: 'select',
      text: 'Chat.Menu.SelectMessages',
      onClick: () => {
        const selection = this.chat.selection;
        selection.toggleSelection(true, true);
        apiManagerProxy.getState().then((state) => {
          const [appSettings, setAppSettings] = useAppSettings();
          if(appSettings.chatContextMenuHintWasShown) {
            return;
          }

          const original = selection.toggleByElement.bind(selection);
          selection.toggleByElement = async(bubble) => {
            setAppSettings('chatContextMenuHintWasShown', true);
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
        this.addContact();
      },
      verify: async() => this.peerId.isUser() && !(await this.managers.appPeersManager.isContact(this.peerId))
    }, {
      icon: 'forward',
      text: 'ShareContact',
      onClick: () => {
        const contactPeerId = this.peerId;
        PopupPickUser.createSharingPicker({
          onSelect: async(peerId) => {
            const preparedPaymentResult = await PaidMessagesInterceptor.prepareStarsForPayment({messageCount: 1, peerId});
            if(preparedPaymentResult === PAYMENT_REJECTED) throw new Error();

            const send = () => {
              this.managers.appMessagesManager.sendContact(peerId, contactPeerId, preparedPaymentResult);
              this.chat.appImManager.setInnerPeer({peerId});
            };

            if(preparedPaymentResult) return void send();

            return new Promise((resolve, reject) => {
              PopupElement.createPopup(PopupPeer, '', {
                titleLangKey: 'SendMessageTitle',
                descriptionLangKey: 'SendContactToGroupText',
                descriptionLangArgs: [new PeerTitle({peerId, dialog: true}).element],
                buttons: [{
                  langKey: 'Send',
                  callback: async() => {
                    resolve();
                    send();
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
          }
        });
      },
      verify: async() => rootScope.myId !== this.peerId && this.peerId.isUser() && (await this.managers.appPeersManager.isContact(this.peerId)) && !!(await this.managers.appUsersManager.getUser(this.peerId.toUserId())).phone
    }, {
      icon: 'gift',
      text: 'Chat.Menu.SendGift',
      onClick: () => PopupElement.createPopup(PopupSendGift, this.peerId),
      verify: async() => this.chat.isChannel || (this.chat.peerId.isUser() && this.managers.appUsersManager.isRegularUser(this.peerId))
    }, {
      icon: 'statistics',
      text: 'Statistics',
      onClick: () => {
        this.appSidebarRight.createTab(AppStatisticsTab).open(this.peerId.toChatId());
        this.appSidebarRight.toggleSidebar(true);
      },
      verify: () => this.managers.appProfileManager.canViewStatistics(this.peerId)
    }, {
      icon: 'addboost',
      text: 'Boosts',
      onClick: () => {
        this.appSidebarRight.createTab(AppBoostsTab).open(this.peerId);
        this.appSidebarRight.toggleSidebar(true);
      },
      verify: () => this.chat.isBroadcast && this.managers.appProfileManager.canViewStatistics(this.peerId)
    }, {
      icon: 'bots',
      text: 'Settings',
      onClick: () => {
        // [ ] Bot with paid stars?
        this.managers.appMessagesManager.sendText({peerId: this.peerId, text: '/settings'});
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
        this.blockUser();
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
        this.managers.appUsersManager.toggleBlock(this.peerId, false).then(() => {
          toastNew({langPackKey: 'UserUnblocked'});
        });
      },
      verify: async() => {
        const userFull = await this.managers.appProfileManager.getCachedFullUser(this.peerId.toUserId());
        return !!userFull?.pFlags?.blocked;
      }
    }, {
      icon: 'delete',
      danger: true,
      text: 'Delete',
      onClick: () => {
        PopupElement.createPopup(PopupDeleteDialog, this.peerId, undefined, undefined, this.chat.threadId);
      },
      verify: async() => this.chat.type === ChatType.Saved || (
        this.chat.type === ChatType.Chat &&
        !!(await this.managers.appMessagesManager.getDialogOnly(this.peerId))
      )
    }];

    this.btnSearch = ButtonIcon('search');
    this.attachClickEvent(this.btnSearch, (e) => {
      this.chat.initSearch();
    }, true);
  }

  public addContact() {
    if(!this.appSidebarRight.isTabExists(AppEditContactTab)) {
      const tab = this.appSidebarRight.createTab(AppEditContactTab);
      tab.peerId = this.peerId;
      tab.open();

      this.appSidebarRight.toggleSidebar(true);
    }
  }

  public async blockUser(showReport?: boolean, showDelete?: boolean, onConfirmed?: (promise: Promise<any>) => void) {
    const peerId = this.peerId;
    const checkboxes: PopupPeerCheckboxOptions[] = [
      showReport && {
        text: 'DeleteReportSpam',
        checked: true
      },
      showDelete && {
        text: 'DeleteThisChat',
        checked: true
      }
    ];

    const checked = await confirmationPopup({
      peerId,
      titleLangKey: 'BlockUser',
      descriptionLangKey: 'AreYouSureBlockContact2',
      descriptionLangArgs: [new PeerTitle({peerId}).element],
      button: {
        langKey: 'BlockUser',
        isDanger: true
      },
      checkboxes: checkboxes.filter(Boolean)
    });

    const [reportSpam, deleteChat] = Array.isArray(checked) ? checked : [];

    const promise = Promise.all([
      reportSpam && this.managers.appMessagesManager.reportSpam(peerId),
      deleteChat && this.managers.appMessagesManager.flushHistory(peerId, false, true),
      this.managers.appUsersManager.toggleBlock(peerId, true)
    ]);

    onConfirmed?.(promise);

    await promise;

    toastNew({langPackKey: 'UserBlocked'});
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

  private get peerId() {
    return this.chat.peerId;
  }

  public constructPeerHelpers() {
    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('info');

    this.pinnedMessage = new ChatPinnedMessage(this, this.chat, this.managers);

    this.btnJoin = Button('btn-primary btn-color-primary chat-join hide');
    this.btnCall = ButtonIcon('phone');
    this.btnGroupCall = ButtonIcon('videochat');
    this.btnGroupCallMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'videochat',
        text: 'Rtmp.Topbar.StartVideoChat',
        onClick: this.onJoinGroupCallClick
      }, {
        icon: 'link',
        text: 'Rtmp.Topbar.StreamWith',
        onClick: () => {
          PopupElement.createPopup(RtmpStartStreamPopup, {peerId: this.peerId}).show();
        },
        verify: () => IS_LIVE_STREAM_SUPPORTED
      }],
      icon: 'videochat'
    });
    this.btnPinned = ButtonIcon('pinlist chat-pinlist');
    this.btnMute = ButtonIcon('mute');

    this.attachClickEvent(this.btnCall, this.onCallClick.bind(this, 'voice'));
    this.attachClickEvent(this.btnGroupCall, this.onJoinGroupCallClick);

    this.attachClickEvent(this.btnPinned, () => {
      this.openPinned(true);
    });

    this.attachClickEvent(this.btnMute, () => {
      const muted = !!+this.btnMute.dataset.muted;
      if(muted) {
        this.onUnmuteClick();
      } else {
        this.onMuteClick();
      }
    });

    this.attachClickEvent(this.btnJoin, this.onJoinClick.bind(this, this.btnJoin));

    this.listenerSetter.add(rootScope)('folder_unread', (folder) => {
      if(folder.id !== FOLDER_ID_ALL) {
        return;
      }

      const size = folder.unreadUnmutedPeerIds.size;
      setBadgeContent(this.btnBackBadge, size ? '' + formatNumber(size, 1) : '');
      // this.btnBack.classList.remove('tgico-left', 'tgico-previous');
      // this.btnBack.classList.add(size ? 'tgico-previous' : 'tgico-left');
    });

    this.listenerSetter.add(rootScope)('chat_update', (chatId) => {
      if(this.peerId === chatId.toPeerId(true)) {
        const chat = apiManagerProxy.getChat(chatId) as Channel/*  | Chat */;
        if(!chat.pFlags.broadcast) {
          return;
        }

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

    this.listenerSetter.add(rootScope)('peer_settings', async({peerId, settings}) => {
      if(this.peerId !== peerId) {
        return;
      }

      const callback = this.chatActions.set(peerId, settings);
      callback();
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
      if(this.chat.type !== ChatType.Pinned || peerId !== this.peerId) {
        return;
      }

      if(mids) {
        this.setTitle();
      }
    });

    return this;
  }

  public openPinned(byCurrent: boolean) {
    this.chat.appImManager.setInnerPeer({
      peerId: this.peerId,
      lastMsgId: byCurrent ? +this.pinnedMessage.pinnedMessageContainer.container.dataset.mid : 0,
      type: ChatType.Pinned
    });
  }

  public onJoinClick = async(button: HTMLElement) => {
    const middleware = this.chat.bubbles.getMiddleware();
    button.setAttribute('disabled', 'true');

    const chatId = this.peerId.toChatId();
    let promise: Promise<any>;
    if(await this.managers.appChatsManager.isChannel(chatId)) {
      promise = this.managers.appChatsManager.joinChannel(chatId);
    } else {
      promise = this.managers.appChatsManager.addChatUser(chatId, rootScope.myId);
    }

    promise.catch((err) => {
      assumeType<ApiError>(err);
      switch(err.type) {
        case 'INVITE_REQUEST_SENT': {
          toastNew({langPackKey: 'Chat.SendJoinRequest.Info'});
          return;
        }
      }

      throw err;
    }).finally(() => {
      if(!middleware()) {
        return;
      }

      button.removeAttribute('disabled');
    });
  };

  private onMuteClick = () => {
    PopupElement.createPopup(PopupMute, this.peerId);
  };

  private onUnmuteClick = () => {
    this.managers.appMessagesManager.togglePeerMute({peerId: this.peerId, threadId: this.chat.threadId});
  };

  private onResize = () => {
    this.setUtilsWidth(true);
    this.setFloating();
  };

  private onChangeScreen = (from: ScreenSize, to: ScreenSize) => {
    const isFloating = to === ScreenSize.mobile || PINNED_ALWAYS_FLOATING;
    // this.chatAudio && this.chatAudio.divAndCaption.container.classList.toggle('is-floating', to === ScreenSize.mobile);
    this.pinnedMessage && this.pinnedMessage.pinnedMessageContainer.container.classList.toggle('is-floating', isFloating);
    this.onResize();
  };

  public destroy() {
    // this.chat.log.error('Topbar destroying');
    this.listenerSetter.removeAll();

    this.status?.destroy();
    this.titleMiddlewareHelper?.destroy();
    this.avatarMiddlewareHelper?.destroy();
    this.pinnedMessage?.destroy();
    this.pinnedContainers?.forEach((pinnedContainer) => pinnedContainer.destroy());

    delete this.pinnedMessage;
    delete this.chatAudio;
    delete this.chatRequests;
    delete this.chatActions;
    delete this.chatLive;
    delete this.chatTranslation;
    delete this.chatRemoveFee;
  }

  public cleanup() {
    if(!this.chat.peerId) {
      this.container.classList.add('hide');
    }
  }

  private appendPinnedMessage(pinnedMessage: ChatPinnedMessage) {
    const container = pinnedMessage.pinnedMessageContainer.container;
    if(this.pinnedMessage && this.pinnedMessage !== pinnedMessage) {
      this.pinnedMessage.pinnedMessageContainer.container.replaceWith(container);
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

    let newAvatar: ChatTopbar['avatar'], newAvatarMiddlewareHelper: ChatTopbar['avatarMiddlewareHelper'];
    const isSaved = this.chat.type === ChatType.Saved;
    const needArrowBack = this.chat.type === ChatType.Search;
    if([ChatType.Chat].includes(this.chat.type) || isSaved) {
      const usePeerId = isSaved ? threadId : peerId;
      const useThreadId = isSaved ? undefined : threadId;
      const avatar = this.avatar;
      if(
        !avatar ||
        avatar.node.dataset.peerId.toPeerId() !== usePeerId ||
        avatar.node.dataset.threadId !== (useThreadId ? '' + useThreadId : undefined) ||
        peerId === rootScope.myId
      ) {
        newAvatar = avatarNew({
          middleware: (newAvatarMiddlewareHelper = getMiddleware()).get(),
          isDialog: true,
          size: 42,
          peerId: usePeerId,
          threadId: useThreadId,
          wrapOptions: {customEmojiSize: makeMediaSize(32, 32)},
          withStories: true,
          meAsNotes: isSaved
        });
        newAvatar.node.classList.add('person-avatar');
      } else {
        newAvatar = this.avatar;
      }
    }

    this.status?.destroy();
    const status = this.status = this.createStatus();

    const promises = [
      this.managers.appPeersManager.isBroadcast(peerId),
      this.managers.appPeersManager.isAnyChat(peerId),
      peerId.isAnyChat() ? apiManagerProxy.getChat(peerId.toChatId()) : undefined,
      newAvatar?.readyThumbPromise,
      this.setTitleManual(),
      status?.prepare(true),
      apiManagerProxy.getState(),
      modifyAckedPromise(this.chatRequests?.setPeerId(peerId)),
      modifyAckedPromise(this.chatActions?.setPeerId(peerId)),
      modifyAckedPromise(this.chatRemoveFee?.setPeerId(peerId))
    ] as const;

    const [
      isBroadcast,
      isAnyChat,
      chat,
      _,
      setTitleCallback,
      setStatusCallback,
      state,
      setRequestsCallback,
      setActionsCallback,
      setChatRemoveFeeCallback
    ] = await Promise.all(promises);

    if(!middleware() && newAvatarMiddlewareHelper) {
      newAvatarMiddlewareHelper.destroy();
    }

    return () => {
      const canHaveSomeButtons = !(this.chat.type === ChatType.Pinned || this.chat.type === ChatType.Scheduled);
      this.btnMute && this.btnMute.classList.toggle('hide', !isBroadcast || !canHaveSomeButtons);
      if(this.btnJoin) {
        if(isBroadcast && !this.chat.isRestricted && canHaveSomeButtons) {
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

      if(this.avatar !== newAvatar) {
        if(newAvatar) {
          this.person.prepend(newAvatar.node);
        }

        if(this.avatar) {
          this.avatarMiddlewareHelper.destroy();
          this.avatar.node.remove();
        }

        this.avatar = newAvatar;
        this.avatarMiddlewareHelper = newAvatarMiddlewareHelper;
        this.container.classList.toggle('has-avatar', !!newAvatar);
      }

      this.setUtilsWidth();

      this.verifyButtons();

      if(this.btnMore) {
        this.btnMore.classList.toggle('hide', !canHaveSomeButtons);
      }

      const isPinnedMessagesNeeded = this.chat.isPinnedMessagesNeeded();
      if(isPinnedMessagesNeeded || this.chat.type === ChatType.Discussion) {
        if(this.chat.wasAlreadyUsed || !this.pinnedMessage) { // * change
          const newPinnedMessage = new ChatPinnedMessage(this, this.chat, this.managers);
          this.appendPinnedMessage(newPinnedMessage);
          this.pinnedMessage?.destroy();
          this.pinnedMessage = newPinnedMessage;
        }

        if(isPinnedMessagesNeeded) {
          this.pinnedMessage.hidden = !!state.hiddenPinnedMessages[peerId];
        } else if(this.chat.type === ChatType.Discussion) {
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

      if(setActionsCallback.result instanceof Promise) {
        this.chatActions.unset(peerId);
      }

      if(setChatRemoveFeeCallback.result instanceof Promise) {
        this.chatRemoveFee.hide();
      }

      this.chatLive?.setPeerId(peerId);
      this.chatTranslation?.setPeerId(peerId);
      this.chatRemoveFee?.setPeerId(peerId);

      callbackify(setRequestsCallback.result, (callback) => {
        if(!middleware()) {
          return;
        }

        callback();
      });

      callbackify(setActionsCallback.result, (callback) => {
        if(!middleware()) {
          return;
        }

        callback();
      });

      callbackify(setChatRemoveFeeCallback.result, (callback) => {
        if(!middleware()) {
          return;
        }

        callback();
      });

      this.container.classList.toggle('show-back-button', needArrowBack);
    };
  }

  public async setTitleManual(count?: number) {
    const {peerId, threadId} = this.chat;
    let titleEl: HTMLElement, icons: Element[];
    const oldMiddlewareHelper = this.titleMiddlewareHelper;
    oldMiddlewareHelper?.destroy();
    const middlewareHelper = this.titleMiddlewareHelper = getMiddleware();
    const middleware = middlewareHelper.get();
    if(this.chat.type === ChatType.Pinned) {
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
    } else if(this.chat.type === ChatType.Scheduled) {
      titleEl = i18n(peerId === rootScope.myId ? 'Reminders' : 'ScheduledMessages');
    } else if(this.chat.type === ChatType.Discussion) {
      const el = this.messagesCounter(middleware, 'Chat.Title.Comments', this.chat.isForum);
      if(count === undefined) {
        const historyStorage = await this.chat.getHistoryStorage();
        if(!middleware()) return;
        el.compareAndUpdate(historyStorage.count === null ? {key: 'Loading', args: undefined} : {args: [historyStorage.count - (this.chat.isForum ? 1 : 0)]});
      }

      titleEl = el.element;
    } else if(this.chat.type === ChatType.Chat || this.chat.type === ChatType.Saved) {
      const usePeerId = this.chat.type === ChatType.Saved ? threadId : peerId;
      [titleEl/* , icons */] = await Promise.all([
        wrapPeerTitle({
          peerId: usePeerId,
          dialog: true,
          withIcons: !threadId,
          threadId: threadId,
          wrapOptions: {middleware},
          meAsNotes: this.chat.type === ChatType.Saved
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
    const isBroadcast = await this.managers.appPeersManager.isBroadcast(peerId);
    if(isBroadcast) {
      replaceButtonIcon(this.btnMute, muted ? 'unmute' : 'mute');
      this.btnMute.dataset.muted = '' + +muted;
    }

    this.btnMute.style.display = isBroadcast ? '' : 'none';
  }

  // ! У МЕНЯ ПРОСТО СГОРЕЛО, САФАРИ КОНЧЕННЫЙ БРАУЗЕР - ЕСЛИ НЕ СКРЫВАТЬ БЛОК, ТО ПРИ ПЕРЕВОРОТЕ ЭКРАНА НА АЙФОНЕ БЛОК БУДЕТ НЕПРАВИЛЬНО ШИРИНЫ, ДАЖЕ БЕЗ ЭТОЙ ФУНКЦИИ!
  public setUtilsWidth = (resize = false) => {
    // return;
    if(this.setUtilsRAF) window.cancelAnimationFrame(this.setUtilsRAF);

    if(IS_SAFARI && resize) {
      this.chatUtils.classList.add('hide');
    }

    this.setUtilsRAF = window.requestAnimationFrame(() => {
      if(IS_SAFARI && resize) {
        this.chatUtils.classList.remove('hide');
      }

      const width = /* chatUtils.scrollWidth */this.chatUtils.getBoundingClientRect().width;
      this.chat.log('utils width:', width);
      this.container.style.setProperty('--utils-width', width + 'px');

      this.setUtilsRAF = 0;
    });
  };

  public setFloating = () => {
    const containers = [
      ...(this.pinnedContainers || []),
      this.pinnedMessage?.pinnedMessageContainer
    ].filter(Boolean);
    let top = 56, floatingHeight = 0;
    const count = containers.reduce((acc, container) => {
      const isFloating = container.isFloating();
      this.container.classList.toggle(`is-pinned-${container.className}-floating`, isFloating);

      if(!container.isVisible()) {
        return acc;
      }

      if(isFloating) {
        floatingHeight += container.height;
        container.container.style.top = top + 'px';
        top += container.height;
      } else {
        container.container.style.top = '';
      }

      return acc + +isFloating;
    }, 0);
    this.container.dataset.floating = '' + count;
    this.container.style.setProperty('--pinned-floating-height', `calc(${floatingHeight}px + var(--topbar-floating-call-height)`);
  };

  private messagesCounter(middleware: Middleware, key: LangPackKey, minusFirst?: boolean) {
    const el = new I18n.IntlElement({
      key,
      args: [1]
    });

    const historyStorageKey = this.chat.historyStorageKey;
    const onHistoryCount: (data: BroadcastEvents['history_count']) => void = ({historyKey, count}) => {
      if(historyStorageKey === historyKey) {
        el.compareAndUpdate({key, args: [count - (minusFirst ? 1 : 0)]});
      }
    };

    rootScope.addEventListener('history_count', onHistoryCount);
    this.managers.appMessagesManager.toggleHistoryKeySubscription(historyStorageKey, true);
    middleware.onDestroy(() => {
      rootScope.removeEventListener('history_count', onHistoryCount);
      this.managers.appMessagesManager.toggleHistoryKeySubscription(historyStorageKey, false);
    });

    return el;
  }

  private createStatus() {
    if(!this.subtitle || (this.chat.type !== ChatType.Chat && this.chat.type !== ChatType.Saved)) return;
    const middlewareHelper = getMiddleware();
    const middleware = middlewareHelper.get();
    const listenerSetter = new ListenerSetter();

    let prepare: (needClear: boolean) => Promise<() => void>;
    if(this.chat.type === ChatType.Saved) {
      const el = this.messagesCounter(middleware, 'messages');

      prepare = async() => {
        const historyStorage = await this.chat.getHistoryStorage();
        el.compareAndUpdate({args: [historyStorage.count]});
        return () => replaceContent(this.subtitle, el.element);
      };
    } else if(this.chat.threadId) {
      prepare = async() => {
        const title = await wrapPeerTitle({peerId: this.peerId, dialog: true});
        const span = i18n('TopicProfileStatus', [title]);

        return () => replaceContent(this.subtitle, span);
      };
    } else {
      const peerId = this.peerId;

      listenerSetter.add(rootScope)('peer_typings', ({peerId: _peerId}) => {
        if(peerId === _peerId) {
          setAuto();
        }
      });

      listenerSetter.add(rootScope)('user_update', (userId) => {
        if(peerId === userId.toPeerId()) {
          setAuto();
        }
      });

      const interval = window.setInterval(() => setAuto(), 60e3);

      middleware.onDestroy(() => {
        clearInterval(interval);
      });

      prepare = (needClear) => {
        return this.chat.appImManager.setPeerStatus({
          peerId,
          element: this.subtitle,
          needClear,
          useWhitespace: false,
          middleware
        });
      };
    }

    middleware.onDestroy(() => {
      listenerSetter.removeAll();
    });

    const setAuto = () => {
      prepare(false).then((callback) => middleware() && callback?.());
    };

    return {
      prepare,
      destroy: () => middlewareHelper.destroy()
    };
  }
}
