/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { Message, StickerSet, Update, NotifyPeer, PeerNotifySettings, ConstructorDeclMap, Config } from "../layer";
import type { MyDocument } from "./appManagers/appDocsManager";
import type { AppMessagesManager, Dialog, MessagesStorage } from "./appManagers/appMessagesManager";
import type { Poll, PollResults } from "./appManagers/appPollsManager";
import type { MyDialogFilter } from "./storages/filters";
import type { UserTyping } from "./appManagers/appProfileManager";
import type Chat from "../components/chat/chat";
import type { UserAuth } from "./mtproto/mtproto_config";
import type { State, Theme } from "./appManagers/appStateManager";
import type { MyDraftMessage } from "./appManagers/appDraftsManager";
import type { PushSubscriptionNotify } from "./mtproto/webPushApiManager";
import type { PushNotificationObject } from "./serviceWorker/push";
import type { ConnectionStatusChange } from "./mtproto/connectionStatus";
import EventListenerBase from "../helpers/eventListenerBase";
import { MOUNT_CLASS_TO } from "../config/debug";

export type BroadcastEvents = {
  'user_update': number,
  'user_auth': UserAuth,
  'peer_changed': number,
  'peer_changing': Chat,
  'peer_pinned_messages': {peerId: number, mids?: number[], pinned?: boolean, unpinAll?: true},
  'peer_pinned_hidden': {peerId: number, maxId: number},
  'peer_typings': {peerId: number, typings: UserTyping[]},
  'peer_block': {peerId: number, blocked: boolean},
  'peer_title_edit': number,
  'peer_bio_edit': number,

  'filter_delete': MyDialogFilter,
  'filter_update': MyDialogFilter,
  'filter_order': number[],
  
  'dialog_draft': {peerId: number, draft: MyDraftMessage | undefined, index: number},
  'dialog_unread': {peerId: number},
  'dialog_flush': {peerId: number},
  'dialog_drop': {peerId: number, dialog?: Dialog},
  'dialog_migrate': {migrateFrom: number, migrateTo: number},
  //'dialog_top': Dialog,
  'dialog_notify_settings': Dialog,
  // 'dialog_order': {dialog: Dialog, pos: number},
  'dialogs_multiupdate': {[peerId: string]: Dialog},
  'dialogs_archived_unread': {count: number},
  
  'history_append': {storage: MessagesStorage, peerId: number, mid: number},
  'history_update': {storage: MessagesStorage, peerId: number, mid: number},
  'history_reply_markup': {peerId: number},
  'history_multiappend': AppMessagesManager['newMessagesToHandle'],
  'history_delete': {peerId: number, msgs: Set<number>},
  'history_forbidden': number,
  'history_reload': number,
  'history_focus': {peerId: number, threadId?: number, mid?: number},
  //'history_request': void,
  
  'message_edit': {storage: MessagesStorage, peerId: number, mid: number},
  'message_views': {peerId: number, mid: number, views: number},
  'message_sent': {storage: MessagesStorage, tempId: number, tempMessage: any, mid: number},
  'messages_pending': void,
  'messages_read': void,
  'messages_downloaded': {peerId: number, mids: number[]},
  'messages_media_read': {peerId: number, mids: number[]},

  'replies_updated': Message.message,

  'scheduled_new': {peerId: number, mid: number},
  'scheduled_delete': {peerId: number, mids: number[]},

  'album_edit': {peerId: number, groupId: string, deletedMids: number[]},

  'stickers_installed': StickerSet.stickerSet,
  'stickers_deleted': StickerSet.stickerSet,

  'audio_play': {doc: MyDocument, mid: number, peerId: number},
  'audio_pause': void,
  
  'state_cleared': void,
  'state_synchronized': number | void,
  'state_synchronizing': number | void,
  
  'contacts_update': number,
  'avatar_update': number,
  'chat_full_update': number,
  'poll_update': {poll: Poll, results: PollResults},
  'chat_update': number,
  'invalidate_participants': number,
  //'channel_settings': {channelId: number},
  'webpage_updated': {id: string, msgs: {peerId: number, mid: number, isScheduled: boolean}[]},

  'connection_status_change': ConnectionStatusChange,
  'settings_updated': {key: string, value: any},
  'draft_updated': {peerId: number, threadId: number, draft: MyDraftMessage | undefined, force?: boolean},
  
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
  
  'download_start': string,
  'download_progress': any,

  'context_menu_toggle': boolean
};

export class RootScope extends EventListenerBase<{
  [name in Update['_']]: (update: ConstructorDeclMap[name]) => void
} & {
  [name in keyof BroadcastEvents]: (e: BroadcastEvents[name]) => void
}> {
  public overlaysActive = 0;
  public myId = 0;
  public idle = {
    isIDLE: true,
    deactivated: false,
    focusPromise: Promise.resolve(),
    focusResolve: () => {}
  };
  public connectionStatus: {[name: string]: ConnectionStatusChange} = {};
  public settings: State['settings'];
  public peerId = 0;
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

  constructor() {
    super();

    this.addEventListener('peer_changed', (peerId) => {
      this.peerId = peerId;
    });

    this.addEventListener('user_auth', (e) => {
      this.myId = e.id;
    });

    this.addEventListener('connection_status_change', (e) => {
      const status = e;
      this.connectionStatus[e.name] = status;
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
    const isNight = this.getTheme().name === 'night';
    const colorScheme = document.head.querySelector('[name="color-scheme"]');
    if(colorScheme) {
      colorScheme.setAttribute('content', isNight ? 'dark' : 'light');
    }

    document.documentElement.classList.toggle('night', isNight);
  }

  get isOverlayActive() {
    return this.overlaysActive > 0;
  }

  set isOverlayActive(value: boolean) {
    this.overlaysActive += value ? 1 : -1;
    this.dispatchEvent('overlay_toggle', this.isOverlayActive);
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
