/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { Message, StickerSet, Update, NotifyPeer, PeerNotifySettings, ConstructorDeclMap, Config, PollResults, Poll, WebPage, GroupCall, GroupCallParticipant, PhoneCall, MethodDeclMap, MessageReactions, ReactionCount } from "../layer";
import type { MyDocument } from "./appManagers/appDocsManager";
import type { AppMessagesManager, Dialog, MessagesStorage, MyMessage } from "./appManagers/appMessagesManager";
import type { MyDialogFilter } from "./storages/filters";
import type { Folder } from "./storages/dialogs";
import type { UserTyping } from "./appManagers/appProfileManager";
import type { State, Theme } from "./appManagers/appStateManager";
import type { MyDraftMessage } from "./appManagers/appDraftsManager";
import type { PushSubscriptionNotify } from "./mtproto/webPushApiManager";
import type { PushNotificationObject } from "./serviceWorker/push";
import type { ConnectionStatusChange } from "./mtproto/connectionStatus";
import type { GroupCallId } from "./appManagers/appGroupCallsManager";
import type GroupCallInstance from "./calls/groupCallInstance";
import type CallInstance from "./calls/callInstance";
import type { StreamAmplitude } from "./calls/streamManager";
import type Chat from "../components/chat/chat";
import { NULL_PEER_ID, UserAuth } from "./mtproto/mtproto_config";
import EventListenerBase from "../helpers/eventListenerBase";
import { MOUNT_CLASS_TO } from "../config/debug";
import { MTAppConfig } from "./mtproto/appConfig";

export type BroadcastEvents = {
  'chat_full_update': ChatId,
  'chat_update': ChatId,

  'channel_update': ChatId,
  
  'user_update': UserId,
  'user_auth': UserAuth,
  'user_full_update': UserId,

  'chat_changing': {from: Chat, to: Chat},

  'peer_changed': PeerId,
  'peer_changing': Chat,
  'peer_pinned_messages': {peerId: PeerId, mids?: number[], pinned?: boolean, unpinAll?: true},
  'peer_pinned_hidden': {peerId: PeerId, maxId: number},
  'peer_typings': {peerId: PeerId, typings: UserTyping[]},
  'peer_block': {peerId: PeerId, blocked: boolean},
  'peer_title_edit': PeerId,
  'peer_bio_edit': PeerId,
  'peer_deleted': PeerId, // left chat, deleted user dialog, left channel
  'peer_full_update': PeerId,

  'filter_delete': MyDialogFilter,
  'filter_update': MyDialogFilter,
  'filter_new': MyDialogFilter,
  'filter_order': number[],

  'folder_unread': Folder,
  
  'dialog_draft': {peerId: PeerId, dialog: Dialog, drop: boolean, draft: MyDraftMessage | undefined, index: number},
  'dialog_unread': {peerId: PeerId},
  'dialog_flush': {peerId: PeerId},
  'dialog_drop': {peerId: PeerId, dialog?: Dialog},
  'dialog_migrate': {migrateFrom: PeerId, migrateTo: PeerId},
  //'dialog_top': Dialog,
  'dialog_notify_settings': Dialog,
  // 'dialog_order': {dialog: Dialog, pos: number},
  'dialogs_multiupdate': {[peerId: PeerId]: Dialog},
  
  'history_append': {storage: MessagesStorage, peerId: PeerId, mid: number},
  'history_update': {storage: MessagesStorage, peerId: PeerId, mid: number},
  'history_reply_markup': {peerId: PeerId},
  'history_multiappend': AppMessagesManager['newMessagesToHandle'],
  'history_delete': {peerId: PeerId, msgs: Set<number>},
  'history_forbidden': PeerId,
  'history_reload': PeerId,
  'history_focus': {peerId: PeerId, threadId?: number, mid?: number, startParam?: string},
  //'history_request': void,
  
  'message_edit': {storage: MessagesStorage, peerId: PeerId, mid: number},
  'message_views': {peerId: PeerId, mid: number, views: number},
  'message_sent': {storage: MessagesStorage, tempId: number, tempMessage: any, mid: number, message: MyMessage},
  'message_reactions': {message: Message.message, changedResults: ReactionCount[]},
  'messages_pending': void,
  'messages_read': void,
  'messages_downloaded': {peerId: PeerId, mids: number[]},
  'messages_media_read': {peerId: PeerId, mids: number[]},

  'replies_updated': Message.message,

  'scheduled_new': {peerId: PeerId, mid: number},
  'scheduled_delete': {peerId: PeerId, mids: number[]},

  'album_edit': {peerId: PeerId, groupId: string, deletedMids: number[]},

  'stickers_installed': StickerSet.stickerSet,
  'stickers_deleted': StickerSet.stickerSet,

  'media_play': {doc: MyDocument, message: Message.message, media: HTMLMediaElement},
  'media_pause': void,
  'media_playback_params': {volume: number, muted: boolean, playbackRate: number},
  'media_stop': void,
  
  'state_cleared': void,
  'state_synchronized': ChatId | void,
  'state_synchronizing': ChatId | void,
  
  'contacts_update': UserId,
  'avatar_update': PeerId,
  'poll_update': {poll: Poll, results: PollResults},
  'invalidate_participants': ChatId,
  //'channel_settings': {channelId: number},
  'webpage_updated': {id: WebPage.webPage['id'], msgs: {peerId: PeerId, mid: number, isScheduled: boolean}[]},

  'connection_status_change': ConnectionStatusChange,
  'settings_updated': {key: string, value: any},
  'draft_updated': {peerId: PeerId, threadId: number, draft: MyDraftMessage | undefined, force?: boolean},
  
  'event-heavy-animation-start': void,
  'event-heavy-animation-end': void,
  
  'im_mount': void,
  'im_tab_change': number,
  
  'idle': boolean,
  
  'overlay_toggle': boolean,
  
  'background_change': void,
  
  'privacy_update': Update.updatePrivacy,
  
  'notify_settings': Update.updateNotifySettings,
  'notify_peer_type_settings': {key: Exclude<NotifyPeer['_'], 'notifyPeer'>, settings: PeerNotifySettings},
  
  'language_change': string,
  
  'theme_change': void,
  
  'instance_activated': void,
  'instance_deactivated': void,
  
  'push_notification_click': PushNotificationObject,
  'push_init': PushSubscriptionNotify,
  'push_subscribe': PushSubscriptionNotify,
  'push_unsubscribe': PushSubscriptionNotify,
  
  'emoji_recent': string,
  
  'download_start': DocId,
  'download_progress': any,
  'document_downloaded': MyDocument,

  'context_menu_toggle': boolean,
  'choosing_sticker': boolean

  'group_call_instance': GroupCallInstance,
  'group_call_update': GroupCall,
  'group_call_amplitude': {amplitudes: StreamAmplitude[], type: 'all' | 'input'},
  'group_call_participant': {groupCallId: GroupCallId, participant: GroupCallParticipant},
  // 'group_call_video_track_added': {instance: GroupCallInstance}

  'call_instance': {hasCurrent: boolean, instance: CallInstance},
  'call_accepting': CallInstance, // это костыль. используется при параллельном вызове, чтобы заменить звонок в topbarCall
  'call_incompatible': UserId,

  'quick_reaction': string,

  'missed_reactions_element': {message: Message.message, changedResults: ReactionCount[]}
};

export class RootScope extends EventListenerBase<{
  [name in Update['_']]: (update: ConstructorDeclMap[name]) => void
} & {
  [name in keyof BroadcastEvents]: (e: BroadcastEvents[name]) => void
}> {
  public overlaysActive = 0;
  public myId: PeerId;
  public idle = {
    isIDLE: true,
    deactivated: false,
    focusPromise: Promise.resolve(),
    focusResolve: () => {}
  };
  public connectionStatus: {[name: string]: ConnectionStatusChange} = {};
  public settings: State['settings'];
  public peerId: PeerId;
  public filterId = 0;
  public systemTheme: Theme['name'];
  public config: Partial<Config.config> = {
    forwarded_count_max: 100,
    edit_time_limit: 86400 * 2,
    pinned_dialogs_count_max: 5,
    pinned_infolder_count_max: 100,
    message_length_max: 4096,
    caption_length_max: 1024,
  };
  public appConfig: MTAppConfig;

  public themeColor: string;
  private _themeColorElem: Element;

  constructor() {
    super();

    this.addEventListener('peer_changed', (peerId) => {
      this.peerId = peerId;
      document.body.classList.toggle('has-chat', !!peerId);
    });

    this.addEventListener('user_auth', ({id}) => {
      // @ts-ignore
      this.myId = typeof(NULL_PEER_ID) === 'number' ? +id : '' + id;
    });

    this.addEventListener('connection_status_change', (status) => {
      this.connectionStatus[status.name] = status;
    });

    this.addEventListener('idle', (isIDLE) => {
      if(isIDLE) {
        this.idle.focusPromise = new Promise((resolve) => {
          this.idle.focusResolve = resolve;
        });
      } else {
        this.idle.focusResolve();
      }
    });
  }

  get themeColorElem() {
    if(this._themeColorElem !== undefined) {
      return this._themeColorElem;
    }

    return this._themeColorElem = document.head.querySelector('[name="theme-color"]') as Element || null;
  }

  public setThemeColor(color = this.themeColor) {
    if(!color) {
      color = this.isNight() ? '#212121' : '#ffffff';
    }

    const themeColorElem = this.themeColorElem;
    if(themeColorElem) {
      themeColorElem.setAttribute('content', color);
    }
  }

  public setThemeListener() {
    try {
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const checkDarkMode = () => {
        //const theme = this.getTheme();
        this.systemTheme = darkModeMediaQuery.matches ? 'night' : 'day';
        //const newTheme = this.getTheme();

        if(this.myId) {
          this.dispatchEvent('theme_change');
        } else {
          this.setTheme();
        }
      };

      if('addEventListener' in darkModeMediaQuery) {
        darkModeMediaQuery.addEventListener('change', checkDarkMode);
      } else if('addListener' in darkModeMediaQuery) {
        (darkModeMediaQuery as any).addListener(checkDarkMode);
      }

      checkDarkMode();
    } catch(err) {

    }
  }

  public setTheme() {
    const isNight = this.isNight();
    const colorScheme = document.head.querySelector('[name="color-scheme"]');
    if(colorScheme) {
      colorScheme.setAttribute('content', isNight ? 'dark' : 'light');
    }

    document.documentElement.classList.toggle('night', isNight);
    this.setThemeColor();
  }

  get isOverlayActive() {
    return this.overlaysActive > 0;
  }

  set isOverlayActive(value: boolean) {
    this.overlaysActive += value ? 1 : -1;
    this.dispatchEvent('overlay_toggle', this.isOverlayActive);
  }

  public isNight() {
    return this.getTheme().name === 'night';
  }

  public getTheme(name: Theme['name'] = this.settings.theme === 'system' ? this.systemTheme : this.settings.theme) {
    return this.settings.themes.find(t => t.name === name);
  }
}

const rootScope = new RootScope();
MOUNT_CLASS_TO.rootScope = rootScope;
export default rootScope;

/* rootScope.addEventListener('album_edit', (e) => {
  
});

rootScope.addEventListener<'album_edit'>('album_edit', (e) => {
  
}); */
