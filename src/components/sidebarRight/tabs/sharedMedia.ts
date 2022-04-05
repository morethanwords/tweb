/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMessagesManager from "../../../lib/appManagers/appMessagesManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import rootScope from "../../../lib/rootScope";
import AppSearchSuper, { SearchSuperType } from "../../appSearchSuper.";
import SidebarSlider, { SliderSuperTab } from "../../slider";
import { TransitionSlider } from "../../transition";
import AppEditChatTab from "./editChat";
import PeerTitle from "../../peerTitle";
import AppEditContactTab from "./editContact";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import Button from "../../button";
import ButtonIcon from "../../buttonIcon";
import { i18n, LangPackKey } from "../../../lib/langPack";
import { toastNew } from "../../toast";
import AppAddMembersTab from "../../sidebarLeft/tabs/addMembers";
import PopupPickUser from "../../popups/pickUser";
import PopupPeer, { PopupPeerButtonCallbackCheckboxes, PopupPeerCheckboxOptions } from "../../popups/peer";
import ButtonCorner from "../../buttonCorner";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import PeerProfile from "../../peerProfile";

// TODO: отредактированное сообщение не изменится
export default class AppSharedMediaTab extends SliderSuperTab {
  private editBtn: HTMLElement;

  private peerId: PeerId;
  private threadId = 0;

  private historiesStorage: {
    [peerId: PeerId]: Partial<{
      [type in SearchSuperType]: {mid: number, peerId: PeerId}[]
    }>
  } = {};

  private searchSuper: AppSearchSuper;

  private profile: PeerProfile;
  private peerChanged: boolean;

  constructor(slider: SidebarSlider) {
    super(slider, false);
  }

  public init() {
    //const perf = performance.now();

    this.container.classList.add('shared-media-container', 'profile-container');

    // * header
    const newCloseBtn = Button('btn-icon sidebar-close-button', {noRipple: true});
    this.closeBtn.replaceWith(newCloseBtn);
    this.closeBtn = newCloseBtn;

    const animatedCloseIcon = document.createElement('div');
    animatedCloseIcon.classList.add('animated-close-icon');
    newCloseBtn.append(animatedCloseIcon);

    const transitionContainer = document.createElement('div');
    transitionContainer.className = 'transition slide-fade';
    
    const transitionFirstItem = document.createElement('div');
    transitionFirstItem.classList.add('transition-item');

    this.title.append(i18n('Profile'));
    this.editBtn = ButtonIcon('edit');
    //const moreBtn = ButtonIcon('more');

    transitionFirstItem.append(this.title, this.editBtn/* , moreBtn */);

    const transitionLastItem = document.createElement('div');
    transitionLastItem.classList.add('transition-item');

    const secondTitle: HTMLElement = this.title.cloneNode() as any;
    secondTitle.append(i18n('PeerInfo.SharedMedia'));

    transitionLastItem.append(secondTitle);

    transitionContainer.append(transitionFirstItem, transitionLastItem);

    this.header.append(transitionContainer);

    // * body

    this.profile = new PeerProfile(this.scrollable);
    this.profile.init();
    
    this.scrollable.append(this.profile.element);

    const HEADER_HEIGHT = 56;
    this.scrollable.onAdditionalScroll = () => {
      const rect = this.searchSuper.nav.getBoundingClientRect(); 
      if(!rect.width) return;

      const top = rect.top - 1;
      setIsSharedMedia(top <= HEADER_HEIGHT);
    };

    const setIsSharedMedia = (isSharedMedia: boolean) => {
      animatedCloseIcon.classList.toggle('state-back', isSharedMedia);
      this.searchSuper.container.classList.toggle('is-full-viewport', isSharedMedia);
      transition(+isSharedMedia);

      if(!isSharedMedia) {
        this.searchSuper.cleanScrollPositions();
      }
    };

    const transition = TransitionSlider(transitionContainer, 'slide-fade', 400, null, false);

    transition(0);

    attachClickEvent(this.closeBtn, (e) => {
      if(this.closeBtn.firstElementChild.classList.contains('state-back')) {
        this.scrollable.scrollIntoViewNew({
          element: this.scrollable.container.firstElementChild as HTMLElement, 
          position: 'start'
        });
        transition(0);
        animatedCloseIcon.classList.remove('state-back');
      } else if(!this.scrollable.isHeavyAnimationInProgress) {
        this.slider.onCloseBtnClick();
      }
    });

    attachClickEvent(this.editBtn, (e) => {
      let tab: AppEditChatTab | AppEditContactTab;
      if(this.peerId.isAnyChat()) {
        tab = new AppEditChatTab(this.slider);
      } else {
        tab = new AppEditContactTab(this.slider);
      }

      if(tab) {
        if(tab instanceof AppEditChatTab) {
          tab.chatId = this.peerId.toChatId();
        } else {
          tab.peerId = this.peerId;
        }
        
        tab.open();
      }
    });

    rootScope.addEventListener('contacts_update', (userId) => {
      if(this.peerId === userId) {
        this.toggleEditBtn();
      }
    });

    rootScope.addEventListener('chat_update', (chatId) => {
      if(this.peerId === chatId.toPeerId(true)) {
        this.toggleEditBtn();
      }
    });

    rootScope.addEventListener('history_multiappend', (msgIdsByPeer) => {
      for(const peerId in msgIdsByPeer) {
        this.renderNewMessages(peerId.toPeerId(), Array.from(msgIdsByPeer[peerId]));
      }
    });
    
    rootScope.addEventListener('history_delete', ({peerId, msgs}) => {
      this.deleteDeletedMessages(peerId, Array.from(msgs));
    });

    // Calls when message successfully sent and we have an id
    rootScope.addEventListener('message_sent', ({message}) => {
      this.renderNewMessages(message.peerId, [message.mid]);
    });

    //this.container.prepend(this.closeBtn.parentElement);

    this.searchSuper = new AppSearchSuper({
      mediaTabs: [{
        inputFilter: 'inputMessagesFilterEmpty',
        name: 'PeerMedia.Members',
        type: 'members'
      }, {
        inputFilter: 'inputMessagesFilterPhotoVideo',
        name: 'SharedMediaTab2',
        type: 'media'
      }, {
        inputFilter: 'inputMessagesFilterDocument',
        name: 'SharedFilesTab2',
        type: 'files'
      }, {
        inputFilter: 'inputMessagesFilterUrl',
        name: 'SharedLinksTab2',
        type: 'links'
      }, {
        inputFilter: 'inputMessagesFilterMusic',
        name: 'SharedMusicTab2',
        type: 'music'
      }, {
        inputFilter: 'inputMessagesFilterRoundVoice',
        name: 'SharedVoiceTab2',
        type: 'voice'
      }], 
      scrollable: this.scrollable,
      onChangeTab: (mediaTab) => {
        let timeout = mediaTab.type === 'members' && rootScope.settings.animationsEnabled ? 250 : 0;
        setTimeout(() => {
          btnAddMembers.classList.toggle('is-hidden', mediaTab.type !== 'members');
        }, timeout);
      }
    });

    this.searchSuper.scrollStartCallback = () => {
      setIsSharedMedia(true);
    };

    this.profile.element.append(this.searchSuper.container);

    const btnAddMembers = ButtonCorner({icon: 'addmember_filled'});
    this.content.append(btnAddMembers);

    btnAddMembers.addEventListener('click', () => {
      const peerId = this.peerId;
      const id = this.peerId.toChatId();
      const isChannel = appChatsManager.isChannel(id);

      const showConfirmation = (peerIds: PeerId[], callback: (checked: PopupPeerButtonCallbackCheckboxes) => void) => {
        let titleLangKey: LangPackKey, titleLangArgs: any[],
          descriptionLangKey: LangPackKey, descriptionLangArgs: any[],
          checkboxes: PopupPeerCheckboxOptions[];

        if(peerIds.length > 1) {
          titleLangKey = 'AddMembersAlertTitle';
          titleLangArgs = [i18n('Members', [peerIds.length])];
          descriptionLangKey = 'AddMembersAlertCountText';
          descriptionLangArgs = peerIds.map(peerId => {
            const b = document.createElement('b');
            b.append(new PeerTitle({peerId}).element);
            return b;
          });

          if(!isChannel) {
            checkboxes = [{
              text: 'AddMembersForwardMessages',
              checked: true
            }];
          }
        } else {
          titleLangKey = 'AddOneMemberAlertTitle';
          descriptionLangKey = 'AddMembersAlertNamesText';
          const b = document.createElement('b');
          b.append(new PeerTitle({
            peerId: peerIds[0]
          }).element);
          descriptionLangArgs = [b];

          if(!isChannel) {
            checkboxes = [{
              text: 'AddOneMemberForwardMessages',
              textArgs: [new PeerTitle({peerId: peerIds[0]}).element],
              checked: true
            }];
          }
        }

        descriptionLangArgs.push(new PeerTitle({
          peerId
        }).element);

        new PopupPeer('popup-add-members', {
          peerId,
          titleLangKey,
          descriptionLangKey,
          descriptionLangArgs,
          buttons: [{
            langKey: 'Add',
            callback
          }],
          checkboxes
        }).show();
      };

      const onError = (err: any) => {
        if(err.type === 'USER_PRIVACY_RESTRICTED') {
          toastNew({langPackKey: 'InviteToGroupError'});
        }
      };
      
      if(isChannel) {
        const tab = new AppAddMembersTab(this.slider);
        tab.open({
          type: 'channel',
          skippable: false,
          takeOut: (peerIds) => {
            showConfirmation(peerIds, () => {
              const promise = appChatsManager.inviteToChannel(id, peerIds);
              promise.catch(onError);
              tab.attachToPromise(promise);
            });

            return false;
          },
          title: 'GroupAddMembers',
          placeholder: 'SendMessageTo'
        });
      } else {
        new PopupPickUser({
          peerTypes: ['contacts'],
          placeholder: 'Search',
          onSelect: (peerId) => {
            setTimeout(() => {
              showConfirmation([peerId], (checked) => {
                appChatsManager.addChatUser(id, peerId, checked.size ? undefined : 0)
                .catch(onError);
              });
            }, 0);
          },
        });
      }
    });

    //console.log('construct shared media time:', performance.now() - perf);
  }

  public renderNewMessages(peerId: PeerId, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;
    
    mids = mids.slice().reverse(); // ! because it will be ascend sorted array
    for(const mediaTab of this.searchSuper.mediaTabs) {
      const inputFilter = mediaTab.inputFilter;
      const filtered = this.searchSuper.filterMessagesByType(mids.map(mid => appMessagesManager.getMessageByPeer(peerId, mid)), inputFilter);
      if(filtered.length) {
        const history = this.historiesStorage[peerId][inputFilter];
        if(history) {
          history.unshift(...filtered.map(message => ({mid: message.mid, peerId: message.peerId})));
        }

        if(this.peerId === peerId && this.searchSuper.usedFromHistory[inputFilter] !== -1) {
          this.searchSuper.usedFromHistory[inputFilter] += filtered.length;
          this.searchSuper.performSearchResult(filtered, mediaTab, false);
        }
      }
    }
  }

  public deleteDeletedMessages(peerId: PeerId, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;

    for(const mid of mids) {
      for(const type of this.searchSuper.mediaTabs) {
        const inputFilter = type.inputFilter;

        const history = this.historiesStorage[peerId][inputFilter];
        if(!history) continue;

        const idx = history.findIndex(m => m.mid === mid);
        if(idx !== -1) {
          history.splice(idx, 1);

          if(this.peerId === peerId) {
            const container = this.searchSuper.tabs[inputFilter];
            const div = container.querySelector(`div[data-mid="${mid}"][data-peer-id="${peerId}"]`) as HTMLElement;
            if(div) {
              if(this.searchSuper.selection.isSelecting) {
                this.searchSuper.selection.toggleByElement(div);
              }

              div.remove();
            }
  
            if(this.searchSuper.usedFromHistory[inputFilter] >= (idx + 1)) {
              this.searchSuper.usedFromHistory[inputFilter]--;
            }
          }

          break;
        }
      }
    }

    this.scrollable.onScroll();
  }

  public cleanupHTML() {
    // const perf = performance.now();
    this.profile.cleanupHTML();
    
    this.editBtn.classList.add('hide');

    this.searchSuper.cleanupHTML(true);

    this.container.classList.toggle('can-add-members', this.searchSuper.canViewMembers() && appChatsManager.hasRights(this.peerId.toChatId(), 'invite_users'));

    // console.log('cleanupHTML shared media time:', performance.now() - perf);
  }

  public setLoadMutex(promise: Promise<any>) {
    this.searchSuper.loadMutex = promise;
  }

  public setPeer(peerId: PeerId, threadId = 0) {
    if(this.peerId === peerId && this.threadId === threadId) return false;

    this.peerId = peerId;
    this.threadId = threadId;
    this.peerChanged = true;

    if(this.init) {
      this.init();
      this.init = null;
    }

    this.searchSuper.setQuery({
      peerId, 
      //threadId, 
      historyStorage: this.historiesStorage[peerId] ?? (this.historiesStorage[peerId] = {})
    });

    this.profile.setPeer(peerId, threadId);
    
    return true;
  }

  public fillProfileElements() {
    if(!this.peerChanged) {
      return;
    }

    this.peerChanged = false;

    this.cleanupHTML();

    this.profile.fillProfileElements();

    this.toggleEditBtn();
  }

  private toggleEditBtn() {
    let show: boolean;
    if(this.peerId.isUser()) {
      show = this.peerId !== rootScope.myId && appUsersManager.isContact(this.peerId.toUserId());
    } else {
      show = appChatsManager.hasRights(this.peerId.toChatId(), 'change_info');
    }

    this.editBtn.classList.toggle('hide', !show);
  }

  public loadSidebarMedia(single: boolean, justLoad = false) {
    this.searchSuper.load(single, justLoad);
  }

  onOpenAfterTimeout() {
    this.scrollable.onScroll();
  }
}

// MOUNT_CLASS_TO && (MOUNT_CLASS_TO.AppSharedMediaTab = AppSharedMediaTab);
