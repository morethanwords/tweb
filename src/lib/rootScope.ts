/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { Message, StickerSet, Update, NotifyPeer, PeerNotifySettings, ConstructorDeclMap } from "../layer";
import type { MyDocument } from "./appManagers/appDocsManager";
import type { AppMessagesManager, Dialog, MessagesStorage } from "./appManagers/appMessagesManager";
import type { Poll, PollResults } from "./appManagers/appPollsManager";
import type { MyDialogFilter } from "./storages/filters";
import type { ConnectionStatusChange } from "../types";
import type { UserTyping } from "./appManagers/appChatsManager";
import type Chat from "../components/chat/chat";
import type { UserAuth } from "./mtproto/mtproto_config";
import type { State, Theme } from "./appManagers/appStateManager";
import type { MyDraftMessage } from "./appManagers/appDraftsManager";
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
  'dialogs_multiupdate': {[peerId: string]: Dialog},
  'dialogs_archived_unread': {count: number},
  
  'history_append': {storage: MessagesStorage, peerId: number, mid: number},
  'history_update': {storage: MessagesStorage, peerId: number, mid: number},
  'history_reply_markup': {peerId: number},
  'history_multiappend': AppMessagesManager['newMessagesToHandle'],
  'history_delete': {peerId: number, msgs: {[mid: number]: true}},
  'history_forbidden': number,
  'history_reload': number,
  'history_focus': {peerId: number, mid?: number},
  //'history_request': void,
  
  'message_edit': {storage: MessagesStorage, peerId: number, mid: number},
  'message_views': {mid: number, views: number},
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
  
  'state_synchronized': number,
  'state_synchronizing': number,
  
  'contacts_update': number,
  'avatar_update': number,
  'chat_full_update': number,
  'poll_update': {poll: Poll, results: PollResults},
  'chat_update': number,
  //'channel_settings': {channelId: number},
  'webpage_updated': {id: string, msgs: number[]},

  'download_progress': any,
  'connection_status_change': ConnectionStatusChange,
  'settings_updated': {key: string, value: any},
  'draft_updated': {peerId: number, threadId: number, draft: MyDraftMessage | undefined},

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

  'language_change': void,
  
  'theme_change': void,

  'instance_deactivated': void
};

export class RootScope extends EventListenerBase<{
  [name in Update['_']]: (update: ConstructorDeclMap[name]) => void
} & {
  [name in keyof BroadcastEvents]: (e: BroadcastEvents[name]) => void
}> {
  private _overlayIsActive: boolean = false;
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
  public systemTheme: Theme['name'];

  constructor() {
    super();

    this.on('peer_changed', (peerId) => {
      this.peerId = peerId;
    });

    this.on('user_auth', (e) => {
      this.myId = e;
    });

    this.on('connection_status_change', (e) => {
      const status = e;
      this.connectionStatus[e.name] = status;
    });

    this.on('idle', (isIDLE) => {
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
          this.broadcast('theme_change');
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

  get overlayIsActive() {
    return this._overlayIsActive;
  }

  set overlayIsActive(value: boolean) {
    this._overlayIsActive = value;
    this.broadcast('overlay_toggle', value);
  }

  public getTheme(name: Theme['name'] = this.settings.theme === 'system' ? this.systemTheme : this.settings.theme) {
    return this.settings.themes.find(t => t.name === name);
  }

  public broadcast = <T extends keyof BroadcastEvents>(name: T, detail?: BroadcastEvents[T]) => {
    /* //if(DEBUG) {
      if(name !== 'user_update') {
        console.debug('Broadcasting ' + name + ' event, with args:', detail);
      }
    //} */

    this.dispatchEvent(name, detail);
  };

  public on = <T extends keyof BroadcastEvents>(name: T, callback: (e: BroadcastEvents[T]) => any, once?: true) => {
    super.addEventListener(name, callback, once);
  };

  public addEventListener = this.on;

  public off = <T extends keyof BroadcastEvents>(name: T, callback: (e: BroadcastEvents[T]) => any) => {
    super.removeEventListener(name, callback);
  };

  public removeEventListener = this.off;
}

const rootScope = new RootScope();
MOUNT_CLASS_TO.rootScope = rootScope;
export default rootScope;

/* rootScope.addEventListener('album_edit', (e) => {
  
});

rootScope.addEventListener<'album_edit'>('album_edit', (e) => {
  
}); */
