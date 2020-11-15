import type { StickerSet, Update } from "../layer";
import type { MyDocument } from "./appManagers/appDocsManager";
import type { AppMessagesManager, Dialog } from "./appManagers/appMessagesManager";
import type { Poll, PollResults } from "./appManagers/appPollsManager";
import type { MyDialogFilter } from "./storages/filters";
import type { ConnectionStatusChange } from "../types";
import { MOUNT_CLASS_TO } from "./mtproto/mtproto_config";

type BroadcastEvents = {
  'user_update': number,
  'user_auth': {dcID?: number, id: number},
  'peer_changed': number,
  'peer_pinned_message': number,

  'filter_delete': MyDialogFilter,
  'filter_update': MyDialogFilter,
  'filter_order': number[],
  
  'dialog_draft': {peerID: number, draft: any, index: number},
  'dialog_unread': {peerID: number, count?: number},
  'dialog_flush': {peerID: number},
  'dialog_drop': {peerID: number, dialog?: Dialog},
  'dialog_migrate': {migrateFrom: number, migrateTo: number},
  //'dialog_top': Dialog,
  'dialog_notify_settings': number,
  'dialogs_multiupdate': {[peerID: string]: Dialog},
  'dialogs_archived_unread': {count: number},
  
  'history_append': {peerID: number, messageID: number, my?: boolean},
  'history_update': {peerID: number, mid: number},
  'history_reply_markup': {peerID: number},
  'history_multiappend': AppMessagesManager['newMessagesToHandle'],
  'history_delete': {peerID: number, msgs: {[mid: number]: true}},
  'history_forbidden': number,
  'history_reload': number,
  'history_request': void,
  
  'message_edit': {peerID: number, mid: number, justMedia: boolean},
  'message_views': {mid: number, views: number},
  'message_sent': {tempID: number, mid: number},
  'messages_pending': void,
  'messages_read': void,
  'messages_downloaded': number[],
  'messages_media_read': number[],

  'album_edit': {peerID: number, groupID: string, deletedMids: number[]},

  'stickers_installed': StickerSet.stickerSet,
  'stickers_deleted': StickerSet.stickerSet,

  'audio_play': {doc: MyDocument, mid: number},
  'audio_pause': void,

  //'contacts_update': any,
  'avatar_update': number,
  'chat_full_update': number,
  'poll_update': {poll: Poll, results: PollResults},
  'chat_update': number,
  'stateSynchronized': void,
  'channel_settings': {channelID: number},
  'webpage_updated': {id: string, msgs: number[]},

  'apiUpdate': Update,
  'download_progress': any,
  'connection_status_change': ConnectionStatusChange
  //'draft_updated': any,
};

class RootScope {
  public overlayIsActive: boolean = false;
  public selectedPeerID = 0;
  public myID = 0;
  public idle = {
    isIDLE: false
  };
  public connectionStatus: {[name: string]: ConnectionStatusChange} = {};

  constructor() {
    this.on('user_auth', (e) => {
      this.myID = e.detail.id;
    });

    this.on('connection_status_change', (e) => {
      const status = e.detail;
      this.connectionStatus[e.detail.name] = status;
    });
  }

  public broadcast = <T extends keyof BroadcastEvents>(name: T, detail?: BroadcastEvents[T]) => {
    /* if(name != 'user_update') {
      console.debug(dT(), 'Broadcasting ' + name + ' event, with args:', detail);
    } */

    const myCustomEvent = new CustomEvent(name, {detail});
    document.dispatchEvent(myCustomEvent);
  };

  public on = <T extends keyof BroadcastEvents>(name: T, callback: (e: Omit<CustomEvent, 'detail'> & {detail: BroadcastEvents[T]}) => any) => {
    // @ts-ignore
    document.addEventListener(name, callback);
  };

  public off = <T extends keyof BroadcastEvents>(name: T, callback: (e: Omit<CustomEvent, 'detail'> & {detail: BroadcastEvents[T]}) => any) => {
    // @ts-ignore
    document.removeEventListener(name, callback);
  };
}

const rootScope = new RootScope();

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.rootScope = rootScope);
export default rootScope;