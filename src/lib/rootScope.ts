/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Message, StickerSet, Update, NotifyPeer, PeerNotifySettings, PollResults, Poll, WebPage, GroupCall, GroupCallParticipant, ReactionCount, MessagePeerReaction, PhoneCall, Config, Reaction, AttachMenuBot} from '../layer';
import type {Dialog, ForumTopic, MessagesStorageKey, MyMessage} from './appManagers/appMessagesManager';
import type {MyDialogFilter} from './storages/filters';
import type {Folder} from './storages/dialogs';
import type {UserTyping} from './appManagers/appProfileManager';
import type {MyDraftMessage} from './appManagers/appDraftsManager';
import type {ConnectionStatusChange} from './mtproto/connectionStatus';
import type {GroupCallId} from './appManagers/appGroupCallsManager';
import type {AppManagers} from './appManagers/managers';
import type {State} from '../config/state';
import type {Progress} from './appManagers/appDownloadManager';
import type {CallId} from './appManagers/appCallsManager';
import type {MyDocument} from './appManagers/appDocsManager';
import type {MTAppConfig} from './mtproto/appConfig';
import {NULL_PEER_ID, UserAuth} from './mtproto/mtproto_config';
import EventListenerBase from '../helpers/eventListenerBase';
import {MOUNT_CLASS_TO} from '../config/debug';
import MTProtoMessagePort from './mtproto/mtprotoMessagePort';
import {IS_WORKER} from '../helpers/context';

export type BroadcastEvents = {
  'chat_full_update': ChatId,
  'chat_update': ChatId,
  'chat_toggle_forum': {chatId: ChatId, enabled: boolean},
  'chat_participant': Update.updateChannelParticipant,
  'chat_requests': {requestsPending: number, recentRequesters: UserId[], chatId: ChatId}

  'channel_update': ChatId,

  'user_update': UserId,
  'user_auth': UserAuth,
  'user_full_update': UserId,

  'attach_menu_bot': AttachMenuBot,

  'peer_pinned_messages': {peerId: PeerId, mids?: number[], pinned?: boolean, unpinAll?: true},
  'peer_pinned_hidden': {peerId: PeerId, maxId: number},
  'peer_typings': {peerId: PeerId, threadId?: number, typings: UserTyping[]},
  'peer_block': {peerId: PeerId, blocked: boolean},
  'peer_title_edit': {peerId: PeerId, threadId?: number},
  'peer_bio_edit': PeerId,
  'peer_deleted': PeerId, // left chat, deleted user dialog, left channel
  'peer_full_update': PeerId,

  'filter_delete': MyDialogFilter,
  'filter_update': MyDialogFilter,
  'filter_new': MyDialogFilter,
  'filter_order': number[],
  'filter_joined': MyDialogFilter,

  'folder_unread': Omit<Folder, 'dialogs' | 'dispatchUnreadTimeout'>,

  'dialog_draft': {peerId: PeerId, dialog: Dialog | ForumTopic, drop: boolean, draft: MyDraftMessage | undefined},
  'dialog_unread': {peerId: PeerId, dialog: Dialog | ForumTopic},
  'dialog_flush': {peerId: PeerId, dialog: Dialog},
  'dialog_drop': Dialog | ForumTopic,
  'dialog_migrate': {migrateFrom: PeerId, migrateTo: PeerId},
  // 'dialog_top': Dialog,
  'dialog_notify_settings': Dialog | ForumTopic,
  // 'dialog_order': {dialog: Dialog, pos: number},
  'dialogs_multiupdate': Map<PeerId, {dialog?: Dialog, topics?: Map<number, ForumTopic>}>,

  'history_append': {storageKey: MessagesStorageKey, message: Message.message},
  'history_update': {storageKey: MessagesStorageKey, message: MyMessage, sequential?: boolean},
  'history_reply_markup': {peerId: PeerId},
  'history_multiappend': MyMessage,
  'history_delete': {peerId: PeerId, msgs: Set<number>},
  'history_forbidden': PeerId,
  'history_reload': PeerId,
  // 'history_request': void,

  'message_edit': {storageKey: MessagesStorageKey, peerId: PeerId, mid: number, message: MyMessage},
  'message_sent': {storageKey: MessagesStorageKey, tempId: number, tempMessage: any, mid: number, message: MyMessage},
  'message_error': {storageKey: MessagesStorageKey, tempId: number, error: ApiError},
  'message_transcribed': {peerId: PeerId, mid: number, text: string, pending?: boolean},
  'messages_views': {peerId: PeerId, mid: number, views: number}[],
  'messages_reactions': {message: Message.message, changedResults: ReactionCount[]}[],
  'messages_pending': void,
  'messages_read': void,
  'messages_downloaded': {peerId: PeerId, mids: number[]},
  'messages_media_read': {peerId: PeerId, mids: number[]},

  'replies_updated': Message.message,

  'scheduled_new': Message.message,
  'scheduled_delete': {peerId: PeerId, mids: number[]},

  'album_edit': {peerId: PeerId, groupId: string, deletedMids: number[], messages: Message.message[]},

  'stickers_installed': StickerSet.stickerSet,
  'stickers_deleted': StickerSet.stickerSet,
  'stickers_updated': {type: 'recent' | 'faved', stickers: MyDocument[]},
  'stickers_top': Long,
  'stickers_order': {type: 'masks' | 'emojis' | 'stickers', order: Long[]},
  'sticker_updated': {type: 'recent' | 'faved', document: MyDocument, faved: boolean},

  'state_cleared': void,
  'state_synchronized': ChatId | void,
  'state_synchronizing': ChatId | void,

  'contacts_update': UserId,
  'avatar_update': {peerId: PeerId, threadId?: number},
  'poll_update': {poll: Poll, results: PollResults},
  'invalidate_participants': ChatId,
  // 'channel_settings': {channelId: number},
  'webpage_updated': {id: WebPage.webPage['id'], msgs: {peerId: PeerId, mid: number, isScheduled: boolean}[]},

  'connection_status_change': ConnectionStatusChange,
  'settings_updated': {key: string, value: any, settings: State['settings']},
  'draft_updated': {peerId: PeerId, threadId: number, draft: MyDraftMessage | undefined, force?: boolean},

  'background_change': void,

  'privacy_update': Update.updatePrivacy,

  'notify_settings': Update.updateNotifySettings,
  'notify_peer_type_settings': {key: Exclude<NotifyPeer['_'], 'notifyPeer'>, settings: PeerNotifySettings},

  'notification_reset': string,
  'notification_cancel': string,

  'language_change': string,

  'theme_change': void,
  'theme_changed': void,

  'media_play': void,

  'emoji_recent': AppEmoji,

  'download_progress': Progress,
  'document_downloading': DocId,
  'document_downloaded': DocId,

  'choosing_sticker': boolean

  'group_call_update': GroupCall,
  'group_call_participant': {groupCallId: GroupCallId, participant: GroupCallParticipant},
  // 'group_call_video_track_added': {instance: GroupCallInstance}

  'call_update': PhoneCall,
  'call_signaling': {callId: CallId, data: Uint8Array},

  'quick_reaction': Reaction,

  'service_notification': Update.updateServiceNotification,

  'logging_out': void,

  'payment_sent': {peerId: PeerId, mid: number, receiptMessage: Message.messageService},

  'web_view_result_sent': Long,

  'premium_toggle': boolean,
  'premium_toggle_private': {isNew: boolean, isPremium: boolean},

  'config': Config,
  'app_config': MTAppConfig
};

export type BroadcastEventsListeners = {
  [name in keyof BroadcastEvents]: (e: BroadcastEvents[name]) => void
};

export class RootScope extends EventListenerBase<BroadcastEventsListeners> {
  public myId: PeerId;
  private connectionStatus: {[name: string]: ConnectionStatusChange};
  public settings: State['settings'];
  public managers: AppManagers;
  public premium: boolean;

  constructor() {
    super();

    this.myId = NULL_PEER_ID;
    this.connectionStatus = {};
    this.premium = false;

    this.addEventListener('user_auth', ({id}) => {
      this.myId = id.toPeerId();
    });

    this.addEventListener('premium_toggle_private', ({isNew, isPremium}) => {
      this.premium = isPremium;
      this.dispatchEventSingle('premium_toggle', isPremium);
    });

    this.addEventListener('connection_status_change', (status) => {
      this.connectionStatus[status.name] = status;
    });

    this.dispatchEvent = (e, ...args) => {
      super.dispatchEvent(e, ...args);
      MTProtoMessagePort.getInstance().invokeVoid('event', {name: e as string, args});
    };

    if(!IS_WORKER) {
      this.addEventListener('settings_updated', ({settings}) => {
        this.settings = settings;
      });
    }
  }

  public getConnectionStatus() {
    return this.connectionStatus;
  }

  public getPremium() {
    return this.premium;
  }

  public dispatchEventSingle(...args: any[]) {
    // @ts-ignore
    super.dispatchEvent(...args);
  }
}

const rootScope = new RootScope();
MOUNT_CLASS_TO.rootScope = rootScope;
export default rootScope;
