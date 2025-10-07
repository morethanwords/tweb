/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type {ApiFileManager} from '../mtproto/apiFileManager';
import type {MediaSize} from '../../helpers/mediaSize';
import type {Progress} from './appDownloadManager';
import type {VIDEO_MIME_TYPE} from '../../environment/videoMimeTypesSupport';
import type {Mirrors} from '../mtproto/mtprotoworker';
import LazyLoadQueueBase from '../../components/lazyLoadQueueBase';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import tsNow from '../../helpers/tsNow';
import {randomLong} from '../../helpers/random';
import {Chat, ChatFull, Dialog as MTDialog, DialogPeer, DocumentAttribute, InputMedia, InputMessage, InputPeerNotifySettings, InputSingleMedia, Message, MessageAction, MessageEntity, MessageFwdHeader, MessageMedia, MessageReplies, MessageReplyHeader, MessagesDialogs, MessagesFilter, MessagesMessages, MethodDeclMap, NotifyPeer, PeerNotifySettings, PhotoSize, SendMessageAction, Update, Photo, Updates, ReplyMarkup, InputPeer, InputPhoto, InputDocument, InputGeoPoint, WebPage, GeoPoint, ReportReason, MessagesGetDialogs, InputChannel, InputDialogPeer, ReactionCount, MessagePeerReaction, MessagesSearchCounter, Peer, MessageReactions, Document, InputFile, Reaction, ForumTopic as MTForumTopic, MessagesForumTopics, MessagesGetReplies, MessagesGetHistory, MessagesAffectedHistory, UrlAuthResult, MessagesTranscribedAudio, ReadParticipantDate, WebDocument, MessagesSearch, MessagesSearchGlobal, InputReplyTo, InputUser, MessagesSendMessage, MessagesSendMedia, MessagesGetSavedHistory, MessagesSavedDialogs, SavedDialog as MTSavedDialog, User, MissingInvitee, TextWithEntities, ChannelsSearchPosts, FactCheck, MessageExtendedMedia, SponsoredMessage, MessagesSponsoredMessages, InputGroupCall, TodoItem, TodoCompletion} from '../../layer';
import {ArgumentTypes, InvokeApiOptions, Modify} from '../../types';
import {logger, LogTypes} from '../logger';
import {ReferenceContext} from '../mtproto/referenceDatabase';
import {AnyDialog, FilterType, GLOBAL_FOLDER_ID} from '../storages/dialogs';
import {ChatRights} from './appChatsManager';
import {MyDocument} from './appDocsManager';
import {MyPhoto} from './appPhotosManager';
import DEBUG from '../../config/debug';
import SlicedArray, {Slice, SliceEnd} from '../../helpers/slicedArray';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, GENERAL_TOPIC_ID, HIDDEN_PEER_ID, MESSAGES_ALBUM_MAX_SIZE, MUTE_UNTIL, NULL_PEER_ID, REAL_FOLDERS, REAL_FOLDER_ID, REPLIES_HIDDEN_CHANNEL_ID, REPLIES_PEER_ID, SERVICE_PEER_ID, TEST_NO_SAVED, THUMB_TYPE_FULL} from '../mtproto/mtproto_config';
import {getMiddleware} from '../../helpers/middleware';
import assumeType from '../../helpers/assumeType';
import copy from '../../helpers/object/copy';
import getObjectKeysAndSort from '../../helpers/object/getObjectKeysAndSort';
import forEachReverse from '../../helpers/array/forEachReverse';
import deepEqual from '../../helpers/object/deepEqual';
import splitStringByLength from '../../helpers/string/splitStringByLength';
import debounce from '../../helpers/schedulers/debounce';
import {AppManager} from './manager';
import getPhotoMediaInput from './utils/photos/getPhotoMediaInput';
import parseMarkdown from '../richTextProcessor/parseMarkdown';
import getServerMessageId from './utils/messageId/getServerMessageId';
import filterMessagesByInputFilter from './utils/messages/filterMessagesByInputFilter';
import ctx from '../../environment/ctx';
import {getEnvironment} from '../../environment/utils';
import getDialogIndex from './utils/dialogs/getDialogIndex';
import defineNotNumerableProperties from '../../helpers/object/defineNotNumerableProperties';
import getDocumentMediaInput from './utils/docs/getDocumentMediaInput';
import getFileNameForUpload from '../../helpers/getFileNameForUpload';
import noop from '../../helpers/noop';
import appTabsManager from './appTabsManager';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';
import getGroupedText from './utils/messages/getGroupedText';
import pause from '../../helpers/schedulers/pause';
import makeError from '../../helpers/makeError';
import getStickerEffectThumb from './utils/stickers/getStickerEffectThumb';
import getDocumentInput from './utils/docs/getDocumentInput';
import reactionsEqual from './utils/reactions/reactionsEqual';
import getPeerActiveUsernames from './utils/peers/getPeerActiveUsernames';
import {BroadcastEvents} from '../rootScope';
import setBooleanFlag from '../../helpers/object/setBooleanFlag';
import getMessageThreadId from './utils/messages/getMessageThreadId';
import callbackify from '../../helpers/callbackify';
import wrapMessageEntities from '../richTextProcessor/wrapMessageEntities';
import isLegacyMessageId from './utils/messageId/isLegacyMessageId';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';
import insertInDescendSortedArray from '../../helpers/array/insertInDescendSortedArray';
import {LOCAL_ENTITIES} from '../richTextProcessor';
import {isDialog, isSavedDialog, isForumTopic, isMonoforumDialog} from './utils/dialogs/isDialog';
import getDialogKey from './utils/dialogs/getDialogKey';
import getHistoryStorageKey, {getSearchStorageFilterKey} from './utils/messages/getHistoryStorageKey';
import {ApiLimitType} from '../mtproto/api_methods';
import getFwdFromName from './utils/messages/getFwdFromName';
import filterUnique from '../../helpers/array/filterUnique';
import getSearchType from './utils/messages/getSearchType';
import getMainGroupedMessage from './utils/messages/getMainGroupedMessage';
import getUnreadReactions from './utils/messages/getUnreadReactions';
import isMentionUnread from './utils/messages/isMentionUnread';
import canMessageHaveFactCheck from './utils/messages/canMessageHaveFactCheck';
import commonStateStorage from '../commonStateStorage';
import PaidMessagesQueue from './utils/messages/paidMessagesQueue';
import type {ConfirmedPaymentResult} from '../../components/chat/paidMessagesInterceptor';
import RepayRequestHandler, {RepayRequest} from '../mtproto/repayRequestHandler';
import canVideoBeAnimated from './utils/docs/canVideoBeAnimated';
import getPhotoInput from './utils/photos/getPhotoInput';
import {BatchProcessor} from '../../helpers/sortedList';
import {increment, MonoforumDialog} from '../storages/monoforumDialogs';
import formatStarsAmount from './utils/payments/formatStarsAmount';
import {makeMessageMediaInputForSuggestedPost} from './utils/messages/makeMessageMediaInput';

// console.trace('include');
// TODO: если удалить диалог находясь в папке, то он не удалится из папки и будет виден в настройках

const DO_NOT_READ_HISTORY = false;
const DO_NOT_SEND_MESSAGES = false;
const SEND_MESSAGES_TO_PAID_QUEUE = false;
const DO_NOT_DELETE_MESSAGES = false;

const GLOBAL_HISTORY_PEER_ID = NULL_PEER_ID;

export const SUGGESTED_POST_MIN_THRESHOLD_SECONDS = 60; // avoid last minute suggests, or if the user was thinking a lot before clicking send

export enum HistoryType {
  Chat,
  Thread,
  Topic,
  Saved,
  Monoforum
};

export type SendFileDetails = {
  file: File | Blob | MyDocument,
} & Partial<{
  duration: number,
  width: number,
  height: number,
  objectURL: string,
  thumb: {
    isCover?: boolean;

    blob: Blob,
    url: string,
    size: MediaSize
  },
  strippedBytes: PhotoSize.photoStrippedSize['bytes'],
  spoiler: boolean
}>;

export type HistoryStorageKey = `${HistoryStorage['type']}_${PeerId}` | `replies_${PeerId}_${number}` | `search_${PeerId}_${SearchStorageFilterKey}_${number}`;
export type HistoryStorage = {
  _maxId: number,
  _count: number | null,
  count: number | null,
  history: SlicedArray<number>,
  searchHistory?: SlicedArray<`${PeerId}_${number}`>,

  maxId?: number,
  readPromise?: Promise<void>,
  readMaxId?: number,
  readOutboxMaxId?: number,
  triedToReadMaxId?: number,

  maxOutId?: number,
  replyMarkup?: Exclude<ReplyMarkup, ReplyMarkup.replyInlineMarkup>,

  type: 'history' | 'replies' | 'search',
  key: HistoryStorageKey,
  wasFetched?: boolean;

  channelJoinedMid?: number,
  originalInsertSlice?: SlicedArray<number>['insertSlice'],

  // * for search
  filterMessages?: (messages: MyMessage[]) => MyMessage[],
  filterMessage?: (message: MyMessage) => boolean,
  onMidInsertion?: (mid: number) => void,
  nextRate?: number,
};

export type HistoryResult = {
  count: number,
  history: number[],
  isEnd: ReturnType<Slice<number>['getEnds']>,
  offsetIdOffset?: number,
  nextRate?: number,
  messages?: MyMessage[]
};

export type Dialog = MTDialog.dialog;
export type ForumTopic = MTForumTopic.forumTopic;
export type SavedDialog = MTSavedDialog.savedDialog;

export type MyMessage = Message.message | Message.messageService;
export type MyInputMessagesFilter = 'inputMessagesFilterEmpty'
  | 'inputMessagesFilterPhotos'
  | 'inputMessagesFilterPhotoVideo'
  | 'inputMessagesFilterVideo'
  | 'inputMessagesFilterDocument'
  | 'inputMessagesFilterVoice'
  | 'inputMessagesFilterRoundVoice'
  | 'inputMessagesFilterRoundVideo'
  | 'inputMessagesFilterMusic'
  | 'inputMessagesFilterUrl'
  | 'inputMessagesFilterMyMentions'
  | 'inputMessagesFilterChatPhotos'
  | 'inputMessagesFilterPinned';

export type PinnedStorage = Partial<{
  promise: Promise<PinnedStorage>,
  count: number,
  maxId: number
}>;
export type MessagesStorage = Map<number, Message.message | Message.messageService> & {peerId: PeerId, type: MessagesStorageType, key: MessagesStorageKey};
export type MessagesStorageType = 'scheduled' | 'history' | 'grouped';
export type MessagesStorageKey = `${PeerId}_${MessagesStorageType}`;

export type MyMessageActionType = Message.messageService['action']['_'];

type PendingAfterMsg = Partial<InvokeApiOptions & {
  afterMessageId: string,
  messageId: string
}>;

type MapValueType<A> = A extends Map<any, infer V> ? V : never;

export type BatchUpdates = {
  'messages_reactions': AppMessagesManager['batchUpdateReactions'],
  'messages_views': AppMessagesManager['batchUpdateViews']
};

type PendingMessageDetails = {
  peerId: PeerId,
  tempId: number,
  threadId: number,
  storage: MessagesStorage,
  sequential?: boolean
};

const processAfter = (cb: () => void) => {
  // setTimeout(cb, 0);
  cb();
};

export type SuggestedPostPayload = {
  stars?: number;
  timestamp?: number;
  changeMid?: number;
  hasMedia?: boolean;
  monoforumThreadId?: PeerId;
};

export type MessageSendingParams = Partial<{
  peerId: PeerId,
  threadId: number,
  replyToMsgId: number,
  replyToStoryId: number,
  replyToQuote: {text: string, entities?: MessageEntity[], offset?: number},
  replyToPeerId: PeerId,
  replyTo: InputReplyTo,
  replyToMonoforumPeerId: PeerId,
  scheduleDate: number,
  silent: boolean,
  sendAsPeerId: number,
  updateStickersetOrder: boolean,
  savedReaction: Reaction[],
  invertMedia: boolean,
  effect: DocId,
  confirmedPaymentResult: ConfirmedPaymentResult,
  suggestedPost: SuggestedPostPayload
}>;

export type MessageForwardParams = MessageSendingParams & {
  fromPeerId: PeerId,
  mids: number[]
} & Partial<{
  withMyScore: true,
  dropAuthor: boolean,
  dropCaptions: boolean
}>;

export type RequestHistoryOptions = {
  peerId?: PeerId,
  offsetId?: number,
  offsetPeerId?: PeerId, // to get the offset message
  limit?: number,
  addOffset?: number,
  offsetDate?: number,
  threadId?: number,
  monoforumThreadId?: PeerId,
  // search
  nextRate?: number,
  folderId?: number,
  query?: string,
  inputFilter?: {
    _: MyInputMessagesFilter,
  },
  minDate?: number,
  maxDate?: number,
  savedReaction?: (Reaction.reactionCustomEmoji | Reaction.reactionEmoji)[],
  needRealOffsetIdOffset?: boolean,
  fromPeerId?: PeerId,
  isPublicHashtag?: boolean,
  isCacheableSearch?: boolean,
  hashtagType?: 'this' | 'my' | 'public',
  chatType?: 'all' | 'users' | 'groups' | 'channels',
  recursion?: boolean,                  // ! FOR INNER USE ONLY
  historyType?: HistoryType,            // ! FOR INNER USE ONLY
  searchType?: 'cached' | 'uncached'    // ! FOR INNER USE ONLY
};

type GetHistoryTypeOptions = {
  threadId?: number;
  monoforumPeerId?: number;
};

export type SearchStorageFilterKey = string;

type GetUnreadMentionsOptions = {
  peerId: PeerId,
  threadId?: number,
  isReaction?: boolean
};

type UploadThumbAndCoverArgs = {
  peer: InputPeer;
  blob: Blob;
  isCover: boolean;
};

type UploadVideoCoverArgs = {
  peer: InputPeer;
  file: InputFile;
};

type ReadHistoryArgs = {
  peerId: PeerId;
  maxId?: number;
  threadId?: number;
  monoforumThreadId?: PeerId;
  force?: boolean;
};

type MarkDialogUnreadArgs = {
  peerId: PeerId;
  read?: boolean;
  monoforumThreadId?: PeerId;
};

type FlushHistoryArgs = {
  peerId: PeerId;
  justClear?: boolean;
  revoke?: boolean;
  threadOrSavedId?: number;
  monoforumThreadId?: PeerId;
};

type DoFlushHistoryArgs = {
  peerId: PeerId;
  justClear?: boolean;
  revoke?: boolean;
  threadOrSavedId?: number;
  monoforumThreadId?: PeerId;
  participantPeerId?: PeerId;
};

type SendContactArgs = {
  peerId: PeerId;
  monoforumThreadId?: PeerId;
  contactPeerId: PeerId;
  confirmedPaymentResult?: ConfirmedPaymentResult;
};

type MessageContext = {searchStorages?: Set<HistoryStorage>};

export class AppMessagesManager extends AppManager {
  private messagesStorageByPeerId: {[peerId: string]: MessagesStorage};
  private groupedMessagesStorage: {[groupId: string]: MessagesStorage}; // will be used for albums
  private scheduledMessagesStorage: {[peerId: PeerId]: MessagesStorage};
  private historiesStorage: {
    [peerId: PeerId]: HistoryStorage
  };
  private threadsStorage: {
    [peerId: PeerId]: {
      [threadId: string]: HistoryStorage
    }
  };
  private searchesStorage: {
    [peerId: PeerId]: {
      [threadId: string]: {
        [inputFilter in SearchStorageFilterKey]?: HistoryStorage
      }
    }
  } & {[key: HistoryStorageKey]: HistoryStorage};
  private pinnedMessages: {[key: string]: PinnedStorage};
  private references: {[key: string]: MessageContext};

  private threadsServiceMessagesIdsStorage: {[peerId_threadId: string]: number};
  private threadsToReplies: {
    [peerId_threadId: string]: string;
  };

  private pendingByRandomId: {
    [randomId: string]: PendingMessageDetails
  } = {};
  private pendingByMessageId: {[mid: string]: Long} = {};
  private pendingAfterMsgs: {[peerId: PeerId]: PendingAfterMsg} = {};
  public pendingTopMsgs: {[peerId in PeerId | `${PeerId}_${number}`]: number} = {};
  private tempFinalizeCallbacks: {
    [tempId: string]: {
      [callbackName: string]: Partial<{
        deferred: CancellablePromise<void>,
        callback: (message: MyMessage) => Promise<any>
      }>
    }
  } = {};

  private sendSmthLazyLoadQueue = new LazyLoadQueueBase(10);

  private needSingleMessages: Map<PeerId, Map<number, CancellablePromise<Message.message | Message.messageService>>> = new Map();
  private fetchSingleMessagesPromise: Promise<void>;
  private extendedMedia: Map<PeerId, Map<number, CancellablePromise<void>>> = new Map();

  private deletedMessages: Set<string> = new Set();

  private maxSeenId = 0;

  public migratedFromTo: {[peerId: PeerId]: PeerId} = {};
  public migratedToFrom: {[peerId: PeerId]: PeerId} = {};

  private newDialogsHandlePromise: Promise<any>;
  public newDialogsToHandle: Map<PeerId, {dialog?: Dialog, topics?: Map<number, ForumTopic>, saved?: Map<number, SavedDialog>}> = new Map();
  public newUpdatesAfterReloadToHandle: {[key: string]: Set<Update>} = {};

  private notificationsHandlePromise: number;
  private notificationsToHandle: {[key: string]: {
    fwdCount: number,
    fromId: PeerId,
    topMessage?: MyMessage
  }} = {};

  private reloadConversationsPromise: Promise<void>;
  private reloadConversationsPeers: Map<PeerId, {inputDialogPeer: InputDialogPeer, promise: CancellablePromise<Dialog>, sentRequest?: boolean}> = new Map();

  public log = logger('MESSAGES', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn);

  private groupedTempId = 0;
  private mediaTempId = 0;
  private mediaTempMap: {[tempId: number]: number} = {};

  private typings: {[key: string]: {action: SendMessageAction, timeout?: number}} = {};

  private middleware: ReturnType<typeof getMiddleware>;

  private unreadMentions: {[key: string]: SlicedArray<number>} = {};
  private goToNextMentionPromises: {[key: string]: Promise<number>} = {};

  private batchUpdates: {
    [k in keyof BatchUpdates]?: {
      callback: BatchUpdates[k],
      batch: ArgumentTypes<BatchUpdates[k]>[0]
    }
  } = {};
  private batchUpdatesDebounced: () => Promise<void>;

  private uploadFilePromises: {[fileName: string]: CancellablePromise<any>};

  private tempMids: {[peerId: PeerId]: number} = {};

  private historyMaxIdSubscribed: Map<HistoryStorageKey, number> = new Map();

  private factCheckBatcher: Batcher<PeerId, number, FactCheck>;
  private checklistBatcher: Batcher<string, { taskId: number, oldItem?: TodoCompletion, action: 'complete' | 'uncomplete' }, void>;

  private waitingTranscriptions: Map<string, CancellablePromise<MessagesTranscribedAudio>>;
  private paidMessagesQueue = new PaidMessagesQueue;

  private repayRequestHandler: RepayRequestHandler;

  protected after() {
    this.clear(true);

    this.repayRequestHandler = new RepayRequestHandler({
      rootScope: this.rootScope
    });

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateMessageID: this.onUpdateMessageId,

      updateNewDiscussionMessage: this.onUpdateNewMessage,
      updateNewMessage: this.onUpdateNewMessage,
      updateNewChannelMessage: this.onUpdateNewMessage,

      updateDialogUnreadMark: this.onUpdateDialogUnreadMark,

      updateEditMessage: this.onUpdateEditMessage,
      updateEditChannelMessage: this.onUpdateEditMessage,

      updateMessageReactions: this.onUpdateMessageReactions,

      updateReadChannelDiscussionInbox: this.onUpdateReadHistory,
      updateReadChannelDiscussionOutbox: this.onUpdateReadHistory,
      updateReadHistoryInbox: this.onUpdateReadHistory,
      updateReadHistoryOutbox: this.onUpdateReadHistory,
      updateReadChannelInbox: this.onUpdateReadHistory,
      updateReadChannelOutbox: this.onUpdateReadHistory,
      updateReadMonoForumInbox: this.onUpdateReadHistory,
      updateReadMonoForumOutbox: this.onUpdateReadHistory,

      updateChannelReadMessagesContents: this.onUpdateReadMessagesContents,
      updateReadMessagesContents: this.onUpdateReadMessagesContents,

      updateChannelAvailableMessages: this.onUpdateChannelAvailableMessages,

      updateDeleteMessages: this.onUpdateDeleteMessages,
      updateDeleteChannelMessages: this.onUpdateDeleteMessages,

      updateChannel: this.onUpdateChannel,

      updateChannelReload: this.onUpdateChannelReload,

      updateChannelMessageViews: this.onUpdateChannelMessageViews,

      updateServiceNotification: this.onUpdateServiceNotification,

      updatePinnedMessages: this.onUpdatePinnedMessages,
      updatePinnedChannelMessages: this.onUpdatePinnedMessages,

      updateNotifySettings: this.onUpdateNotifySettings,

      updateNewScheduledMessage: this.onUpdateNewScheduledMessage,

      updateDeleteScheduledMessages: this.onUpdateDeleteScheduledMessages,

      updateMessageExtendedMedia: this.onUpdateMessageExtendedMedia,

      updateTranscribedAudio: this.onUpdateTranscribedAudio
    });

    // ! Invalidate notify settings, can optimize though
    this.rootScope.addEventListener('notify_peer_type_settings', ({key, settings}) => {
      const dialogs = this.dialogsStorage.getFolderDialogs(0).concat(this.dialogsStorage.getFolderDialogs(1)) as Dialog[];
      let filterFunc: (dialog: typeof dialogs[0]) => boolean;
      if(key === 'notifyUsers') filterFunc = (dialog) => dialog.peerId.isUser();
      else if(key === 'notifyBroadcasts') filterFunc = (dialog) => this.appPeersManager.isBroadcast(dialog.peerId);
      else filterFunc = (dialog) => this.appPeersManager.isAnyGroup(dialog.peerId);

      dialogs
      .filter(filterFunc)
      .forEach((dialog) => {
        this.rootScope.dispatchEvent('dialog_notify_settings', dialog);
      });
    });

    this.rootScope.addEventListener('webpage_updated', ({id, msgs}) => {
      msgs.forEach(({peerId, mid, isScheduled}) => {
        const storage = isScheduled ? this.getScheduledMessagesStorage(peerId) : this.getHistoryMessagesStorage(peerId);
        const message = this.getMessageFromStorage(storage, mid) as Message.message;
        if(!message) {
          return;
        }

        this.modifyMessage(message, (message) => {
          message.media = {
            _: 'messageMediaWebPage',
            pFlags: {},
            ...(message.media as MessageMedia.messageMediaWebPage || {}),
            webpage: this.appWebPagesManager.getCachedWebPage(id)
          };
        }, storage);

        this.rootScope.dispatchEvent('message_edit', {
          storageKey: storage.key,
          peerId,
          mid,
          message
        });
      });
    });

    this.rootScope.addEventListener('draft_updated', ({peerId, threadId, monoforumThreadId, draft}) => {
      if(monoforumThreadId) {
        const dialog = this.monoforumDialogsStorage.getDialogByParent(peerId, monoforumThreadId);

        if(!dialog) return;

        dialog.draft = draft;
        this.monoforumDialogsStorage.updateDialogIndex(dialog);

        this.rootScope.dispatchEvent('monoforum_draft_update', {dialog});

        return;
      }

      const dialog = this.dialogsStorage.getAnyDialog(peerId, threadId) as Dialog | ForumTopic;
      if(dialog) {
        dialog.draft = draft;

        let drop = false;
        if(!draft && !getServerMessageId(dialog.top_message)) {
          this.dialogsStorage.dropDialog(peerId);
          drop = true;
        } else {
          this.dialogsStorage.generateIndexForDialog(dialog);
          this.dialogsStorage.pushDialog({dialog});
        }

        this.rootScope.dispatchEvent('dialog_draft', {
          peerId,
          dialog,
          drop,
          draft
        });
      } else if(threadId) {
        const chat = this.appChatsManager.getChat(peerId.toChatId());
        if(!chat) {
          this.reloadConversation(peerId);
        } else if((chat as Chat.channel).pFlags.forum) {
          this.dialogsStorage.getForumTopicById(peerId, threadId);
        }
      } else {
        this.reloadConversation(peerId);
      }
    });

    this.rootScope.addEventListener('poll_update', ({poll}) => {
      const set = this.appPollsManager.pollToMessages[poll.id];
      if(!set) {
        return;
      }

      for(const key of set) {
        const [peerId, mid] = key.split('_');

        const message = this.getMessageByPeer(peerId.toPeerId(), +mid);
        if(message) {
          this.onMessageModification(message);
          this.setDialogToStateIfMessageIsTop(message);
        }
      }
    });

    // * clear forum cache
    this.rootScope.addEventListener('chat_toggle_forum', ({chatId, enabled}) => {
      const peerId = chatId.toPeerId(true);
      if(!enabled) {
        delete this.threadsStorage[peerId];

        for(const key in this.pinnedMessages) {
          if(+key === peerId && key.startsWith(peerId + '_')) {
            delete this.pinnedMessages[key];
          }
        }
      }
    });

    this.batchUpdatesDebounced = debounce(() => {
      for(const event in this.batchUpdates) {
        const details = this.batchUpdates[event as keyof BatchUpdates];
        delete this.batchUpdates[event as keyof BatchUpdates];

        // @ts-ignore
        const result = details.callback(details.batch);
        if(result && (!(result instanceof Array) || result.length)) {
          this.rootScope.dispatchEvent(event as keyof BatchUpdates, result as any);
        }
      }
    }, 33, false, true);

    this.factCheckBatcher = new Batcher({
      processBatch: this.processFactCheckBatch
    });

    this.checklistBatcher = new Batcher({
      delay: 500,
      debounce: true,
      processBatch: this.processChecklistBatch
    });

    return this.appStateManager.getState().then((state) => {
      if(state.maxSeenMsgId) {
        this.maxSeenId = state.maxSeenMsgId;
      }
    });
  }

  public clear = (init?: boolean) => {
    if(this.middleware) {
      this.middleware.clean();
      this.waitingTranscriptions.forEach((promise) => promise.reject());
    } else {
      this.middleware = getMiddleware();
      this.uploadFilePromises = {};
    }

    this.messagesStorageByPeerId = {};
    this.groupedMessagesStorage = {};
    this.scheduledMessagesStorage = {};
    this.historiesStorage = {};
    this.threadsStorage = {};
    this.searchesStorage = {};
    this.pinnedMessages = {};
    this.threadsServiceMessagesIdsStorage = {};
    this.threadsToReplies = {};
    this.references = {};
    this.waitingTranscriptions = new Map();

    this.dialogsStorage && this.dialogsStorage.clear(init);
    this.filtersStorage && this.filtersStorage.clear(init);
  };

  public getInputEntities(entities: MessageEntity[]) {
    const sendEntities = copy(entities);
    forEachReverse(sendEntities, (entity, idx, arr) => {
      if(LOCAL_ENTITIES.has(entity._)) {
        arr.splice(idx, 1);
      } else if(entity._ === 'messageEntityMentionName') {
        (entity as any as MessageEntity.inputMessageEntityMentionName)._ = 'inputMessageEntityMentionName';
        (entity as any as MessageEntity.inputMessageEntityMentionName).user_id = this.appUsersManager.getUserInput(entity.user_id);
      }
    });

    if(!sendEntities.length) {
      return;
    }

    return sendEntities;
  }

  public invokeAfterMessageIsSent(tempId: number, callbackName: string, callback: (message: MyMessage) => Promise<any>) {
    const finalize = this.tempFinalizeCallbacks[tempId] ??= {};
    const obj = finalize[callbackName] ??= {deferred: deferredPromise<void>()};

    obj.callback = callback;

    return obj.deferred;
  }

  public editMessage(
    message: MyMessage,
    text: string,
    options: Partial<{
      newMedia: InputMedia,
      scheduleDate: number,
      entities: MessageEntity[]
    }> & Partial<Pick<Parameters<AppMessagesManager['sendText']>[0], 'webPage' | 'webPageOptions' | 'noWebPage' | 'invertMedia'>> = {}
  ): Promise<void> {
    /* if(!this.canEditMessage(messageId)) {
      return Promise.reject({type: 'MESSAGE_EDIT_FORBIDDEN'});
    } */

    const {mid, peerId} = message;

    if(message.pFlags.is_outgoing) {
      return this.invokeAfterMessageIsSent(mid, 'edit', (message) => {
        // this.log('invoke editMessage callback', message);
        return this.editMessage(message, text, options);
      });
    }

    let entities = options.entities || [];
    if(text) {
      [text, entities] = parseMarkdown(text, entities);
    }

    const sendEntities = this.getInputEntities(entities);

    const inputMediaWebPage = this.getInputMediaWebPage(options);

    const schedule_date = options.scheduleDate || ((message as Message.message).pFlags.is_scheduled ? message.date : undefined);
    return this.apiManager.invokeApi('messages.editMessage', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: message.id,
      message: text,
      media: options.newMedia,
      entities: sendEntities,
      no_webpage: options.noWebPage,
      schedule_date,
      invert_media: options.invertMedia,
      ...(inputMediaWebPage ? {media: inputMediaWebPage} : {})
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    }, (error: ApiError) => {
      this.log.error('editMessage error:', error);

      if(error?.type === 'MESSAGE_NOT_MODIFIED') {
        error.handled = true;
        return;
      }

      if(error?.type === 'MESSAGE_EMPTY') {
        error.handled = true;
      }

      throw error;
    });
  }

  public async transcribeAudio(message: Message.message, noPending?: boolean): Promise<MessagesTranscribedAudio> {
    const {id, peerId} = message;

    const process = (result: MessagesTranscribedAudio) => {
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateTranscribedAudio',
        msg_id: message.id,
        peer: this.appPeersManager.getOutputPeer(peerId),
        pFlags: result.pFlags,
        text: result.text,
        transcription_id: result.transcription_id
      });

      return result;
    };

    const key = `${peerId}_${message.mid}`;
    let promise: CancellablePromise<MessagesTranscribedAudio>;
    if(noPending) {
      promise = this.waitingTranscriptions.get(key);
      if(!promise) {
        this.waitingTranscriptions.set(key, promise = deferredPromise());
        promise.finally(() => {
          this.waitingTranscriptions.delete(key);
        });
      }
    }

    const ret = this.apiManager.invokeApiSingleProcess({
      method: 'messages.transcribeAudio',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        msg_id: id
      },
      processResult: process,
      processError: (error) => {
        if(error.type === 'TRANSCRIPTION_FAILED' || error.type === 'MSG_VOICE_MISSING') {
          process({
            _: 'messages.transcribedAudio',
            transcription_id: 0,
            text: '',
            pFlags: {}
          });
        }

        throw error;
      }
    });

    return promise || ret;
  }

  public async sendText(
    options: MessageSendingParams & Partial<{
      text: string,
      entities: MessageEntity[],
      viaBotId: BotId,
      queryId: string,
      resultId: string,
      noWebPage: true,
      replyMarkup: ReplyMarkup,
      clearDraft: true,
      invertMedia: boolean,
      webPage: WebPage,
      webPageOptions: Partial<{
        largeMedia: boolean,
        smallMedia: boolean,
        optional: boolean
      }>
    }>
  ): Promise<void> {
    let {peerId, text} = options;
    if(!text.trim() && !options.suggestedPost?.changeMid) {
      return;
    }

    options.entities ??= [];
    options.webPageOptions ??= {};

    this.checkSendOptions(options);

    const config = await this.apiManager.getConfig();
    const MAX_LENGTH = config.message_length_max;
    const splitted = splitStringByLength(text, MAX_LENGTH);
    text = splitted[0];
    if(splitted.length > 1) {
      if(options.webPage?._ === 'webPage' && !text.includes(options.webPage.url)) {
        delete options.webPage;
      }
    }

    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    let entities = options.entities;
    if(!options.viaBotId) {
      [text, entities] = parseMarkdown(text, entities);
    }

    const sendEntities = this.getInputEntities(entities);

    const message = this.generateOutgoingMessage(peerId, options);
    message.entities = entities;
    message.message = text;

    const isChannel = this.appPeersManager.isChannel(peerId);

    const webPageSend = this.generateOutgoingWebPage(message, options);

    const toggleError = (error?: ApiError, repayRequest?: RepayRequest) => {
      this.onMessagesSendError([message], error, repayRequest);
      this.rootScope.dispatchEvent('messages_pending');
    };

    const paidStars = options.confirmedPaymentResult?.starsAmount || undefined;

    message.send = () => {
      toggleError();
      const sentRequestOptions: PendingAfterMsg = {};
      if(this.pendingAfterMsgs[peerId]) {
        sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
      }

      const sendAs = options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
      const inputPeer = this.appPeersManager.getInputPeerById(peerId);
      const replyTo = options.replyTo;
      let apiPromise: any;
      if(options.viaBotId) {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: inputPeer,
          random_id: message.random_id,
          reply_to: replyTo,
          query_id: options.queryId,
          id: options.resultId,
          clear_draft: options.clearDraft,
          send_as: sendAs,
          allow_paid_stars: paidStars
        }, sentRequestOptions);
      } else {
        let media: InputMedia | undefined;
        if(options.suggestedPost?.changeMid) {
          const changingMessage = this.getMessageByPeer(peerId, options.suggestedPost.changeMid);
          if(changingMessage?._ === 'message')
            media = makeMessageMediaInputForSuggestedPost(changingMessage.media)
        }

        const commonOptions: Partial<MessagesSendMessage | MessagesSendMedia> = {
          peer: inputPeer,
          message: text,
          random_id: message.random_id,
          reply_to: replyTo,
          entities: sendEntities,
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate || undefined,
          silent: options.silent,
          send_as: sendAs,
          update_stickersets_order: options.updateStickersetOrder,
          invert_media: options.invertMedia,
          effect: options.effect,
          allow_paid_stars: paidStars,
          suggested_post: message.suggested_post,
          media
        };

        const mergedOptions: MessagesSendMessage | MessagesSendMedia = {
          ...commonOptions as any,
          ...webPageSend
        };

        apiPromise = this.apiManager.invokeApiAfter(
          options.webPage || media ? 'messages.sendMedia' : 'messages.sendMessage',
          mergedOptions,
          sentRequestOptions
        );
      }

      this.pendingAfterMsgs[peerId] = sentRequestOptions;

      return apiPromise.then((updates: Updates) => {
        if(updates._ === 'updateShortSentMessage') {
          // * fix copying object with promise
          const promise = message.promise;
          delete message.promise;
          const newMessage = copy(message);
          defineNotNumerableProperties(message, ['promise']);
          message.promise = promise;

          newMessage.date = updates.date;
          newMessage.id = updates.id;
          newMessage.media = updates.media;
          newMessage.entities = updates.entities;
          newMessage.ttl_period = updates.ttl_period;
          this.wrapMessageEntities(newMessage);
          if(updates.pFlags.out) {
            newMessage.pFlags.out = true;
          }

          // * override with new updates
          const {pts, pts_count} = updates;

          this.apiUpdatesManager.processLocalUpdate({
            _: 'updateMessageID',
            random_id: message.random_id,
            id: newMessage.id
          });

          this.apiUpdatesManager.processLocalUpdate({
            _: options.scheduleDate ? 'updateNewScheduledMessage' : (isChannel ? 'updateNewChannelMessage' : 'updateNewMessage'),
            message: newMessage,
            pts,
            pts_count
          });

          updates = undefined;
        } else if((updates as Updates.updates).updates) {
          (updates as Updates.updates).updates.forEach((update) => {
            if(update._ === 'updateDraftMessage') {
              update.local = true;
            }
          });
        }

        if(updates) {
          this.apiUpdatesManager.processUpdateMessage(updates);
          this.apiUpdatesManager.processPaidMessageUpdate({
            paidStars,
            wereStarsReserved: options.confirmedPaymentResult?.canUndo
          });
        }

        message.promise.resolve();
      }, (error: ApiError) => {
        const repayRequest = this.repayRequestHandler.tryRegisterRequest({
          error,
          messageCount: 1,
          repayCallback: (override) => {
            this.cancelPendingMessage(message.random_id);
            this.sendText({...options, ...override})
          },
          paidStars,
          wereStarsReserved: options.confirmedPaymentResult?.canUndo
        });

        toggleError(error, repayRequest);
        message.promise.reject(error);
        throw error;
      }).finally(() => {
        if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerId];
        }
      });
    };

    this.beforeMessageSending(message, {
      isScheduled: !!options.scheduleDate || undefined,
      threadId: options.threadId,
      clearDraft: options.clearDraft,
      sequential: true,
      confirmedPaymentResult: options.confirmedPaymentResult
    });

    const promises: ReturnType<AppMessagesManager['sendText']>[] = [message.promise];
    for(let i = 1; i < splitted.length; ++i) {
      promises.push(this.sendText({
        ...options,
        peerId,
        text: splitted[i]
      }));
    }

    return Promise.all(promises).then(noop);
  }

  public sendFile(options: MessageSendingParams & SendFileDetails & Partial<{
    isRoundMessage: boolean,
    isVoiceMessage: boolean,
    isGroupedItem: boolean,
    isMedia: boolean,

    groupId: string,
    caption: string,
    entities: MessageEntity[],
    background: boolean,
    clearDraft: boolean,
    noSound: boolean,

    waveform: Uint8Array,

    stars: number,
    groupedMessage: Message.message,
    useTempMediaId: boolean,

    // ! only for internal use
    processAfter?: typeof processAfter
  }>) {
    let file = options.file;
    let {peerId} = options;
    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    this.checkSendOptions(options);

    const isDocument = !(file instanceof File) && !(file instanceof Blob);
    if(isDocument) {
      file = this.appDocsManager.getDoc((file as MyDocument).id) || file;
    }

    const hadMessageBefore = !!options.groupedMessage;
    const message = options.groupedMessage || this.generateOutgoingMessage(peerId, options);

    let attachType: 'document' | 'audio' | 'video' | 'voice' | 'photo', apiFileName: string;

    const fileType = (file as Document.document).mime_type || file.type;
    const fileName = file instanceof File ? file.name : '';
    let caption = options.caption || '';

    this.log('sendFile', file, fileType);

    let entities = options.entities || [];
    if(caption) {
      [caption, entities] = parseMarkdown(caption, entities);
    }

    const attributes: DocumentAttribute[] = [];

    const isPhoto = getEnvironment().IMAGE_MIME_TYPES_SUPPORTED.has(fileType);

    const strippedPhotoSize: PhotoSize.photoStrippedSize = options.strippedBytes && {
      _: 'photoStrippedSize',
      bytes: options.strippedBytes,
      type: 'i'
    };

    const mediaTempId = options.useTempMediaId ? this.mediaTempId++ : message.id;
    let photo: MyPhoto, document: MyDocument;

    let actionName: Extract<SendMessageAction['_'], 'sendMessageUploadAudioAction' | 'sendMessageUploadDocumentAction' | 'sendMessageUploadPhotoAction' | 'sendMessageUploadVideoAction'>;
    if(isDocument) { // maybe it's a sticker or gif
      attachType = 'document';
      apiFileName = '';
    } else if(fileType.indexOf('audio/') === 0 || ['video/ogg'].indexOf(fileType) >= 0) {
      attachType = 'audio';
      apiFileName = 'audio.' + (fileType.split('/')[1] === 'ogg' ? 'ogg' : 'mp3');
      actionName = 'sendMessageUploadAudioAction';

      if(options.isVoiceMessage) {
        attachType = 'voice';
        if(message) message.pFlags.media_unread = true;
      }

      const attribute: DocumentAttribute.documentAttributeAudio = {
        _: 'documentAttributeAudio',
        pFlags: {
          voice: options.isVoiceMessage || undefined
        },
        waveform: options.waveform,
        duration: options.duration || undefined
      };

      attributes.push(attribute);
    } else if(!options.isMedia) {
      attachType = 'document';
      apiFileName = 'document.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadDocumentAction';
    } else if(isPhoto) {
      attachType = 'photo';
      apiFileName = 'photo.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadPhotoAction';

      const photoSize = {
        _: 'photoSize',
        w: options.width,
        h: options.height,
        type: THUMB_TYPE_FULL,
        location: null,
        size: file.size
      } as PhotoSize.photoSize;

      photo = {
        _: 'photo',
        id: mediaTempId,
        sizes: [photoSize],
        w: options.width,
        h: options.height
      } as any;

      if(strippedPhotoSize) {
        photo.sizes.unshift(strippedPhotoSize);
      }

      this.thumbsStorage.setCacheContextURL(
        photo,
        photoSize.type,
        options.objectURL || '',
        file.size
      );

      photo = this.appPhotosManager.savePhoto(photo);
    } else if(getEnvironment().VIDEO_MIME_TYPES_SUPPORTED.has(fileType as VIDEO_MIME_TYPE)) {
      attachType = 'video';
      apiFileName = 'video.mp4';
      actionName = 'sendMessageUploadVideoAction';

      const videoAttribute: DocumentAttribute.documentAttributeVideo = {
        _: 'documentAttributeVideo',
        pFlags: {
          round_message: options.isRoundMessage || undefined,
          supports_streaming: true
        },
        duration: options.duration,
        w: options.width,
        h: options.height
      };

      attributes.push(videoAttribute);

      // * must follow after video attribute
      if(canVideoBeAnimated(options.noSound, file.size)) {
        attributes.push({
          _: 'documentAttributeAnimated'
        });
      }
    } else {
      attachType = 'document';
      apiFileName = 'document.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadDocumentAction';
    }

    attributes.push({_: 'documentAttributeFilename', file_name: fileName || apiFileName});

    if(
      (['document', 'video', 'audio', 'voice'] as (typeof attachType)[]).includes(attachType) &&
      !isDocument
    ) {
      const thumbs: PhotoSize[] = [];
      document = {
        _: 'document',
        id: mediaTempId,
        duration: options.duration,
        attributes,
        w: options.width,
        h: options.height,
        thumbs,
        mime_type: fileType,
        size: file.size
      } as any;

      if(options.objectURL) {
        this.thumbsStorage.setCacheContextURL(
          document,
          undefined,
          options.objectURL,
          file.size
        );
      }

      let thumb: PhotoSize.photoSize;
      if(isPhoto) {
        attributes.push({
          _: 'documentAttributeImageSize',
          w: options.width,
          h: options.height
        });

        thumb = {
          _: 'photoSize',
          w: options.width,
          h: options.height,
          type: THUMB_TYPE_FULL,
          size: file.size
        };
      } else if(attachType === 'video') {
        if(options.thumb) {
          thumb = {
            _: 'photoSize',
            w: options.thumb.size.width,
            h: options.thumb.size.height,
            type: 'local-thumb',
            size: options.thumb.blob.size
          };

          this.thumbsStorage.setCacheContextURL(
            document,
            thumb.type,
            options.thumb.url,
            thumb.size
          );
        }
      }

      if(thumb) {
        thumbs.push(thumb);
      }

      if(strippedPhotoSize) {
        thumbs.unshift(strippedPhotoSize);
      }

      /* if(thumbs.length) {
        const thumb = thumbs[0] as PhotoSize.photoSize;
        const docThumb = appPhotosManager.getDocumentCachedThumb(document.id);
        docThumb.downloaded = thumb.size;
        docThumb.url = thumb.url;
      } */

      document = this.appDocsManager.saveDoc(document);
    }

    this.log('sendFile', attachType, apiFileName, file.type, options);

    const sentDeferred = deferredPromise<InputMedia>();
    // sentDeferred.cancel = () => {
    //   const error = new Error('Download canceled');
    //   error.name = 'AbortError';
    //   sentDeferred.reject(error);

    //   if(uploadPromise?.cancel) {
    //     uploadPromise.cancel();
    //   }
    // };

    const media: MessageMedia = isDocument ? undefined : {
      _: photo ? 'messageMediaPhoto' : 'messageMediaDocument',
      pFlags: {},
      // preloader,
      photo,
      document
    };

    if(media) {
      defineNotNumerableProperties(media as any, ['promise']);
      (media as any).promise = sentDeferred;

      if(options.spoiler) {
        (media as MessageMedia.messageMediaPhoto).pFlags.spoiler = true;
      }
    }

    const sendEntities = this.getInputEntities(entities);

    const uploadingFileName = !isDocument ? getFileNameForUpload(file as File | Blob) : undefined;
    if(uploadingFileName) {
      this.uploadFilePromises[uploadingFileName] = sentDeferred;
    }

    if(!hadMessageBefore) {
      if(options.invertMedia) {
        message.pFlags.invert_media = true;
      }

      message.entities = entities;
      message.message = caption;
      message.media = isDocument ? {
        _: 'messageMediaDocument',
        pFlags: {},
        document: file
      } as MessageMedia.messageMediaDocument : media;
      message.uploadingFileName = [uploadingFileName];

      if(options.stars) {
        message.media = this.generateOutgoingPaidMedia([message], options.stars);
      }
    }

    const toggleError = (error?: ApiError, repayRequest?: RepayRequest) => {
      this.onMessagesSendError([message], error, repayRequest);
      this.rootScope.dispatchEvent('messages_pending');
    };

    let
      uploaded = false,
      uploadPromise: ReturnType<ApiFileManager['upload']> = null
    ;

    const upload = () => {
      if(isDocument) {
        const inputMedia: InputMedia = {
          _: 'inputMediaDocument',
          id: getDocumentInput(file as MyDocument),
          pFlags: {}
        };

        sentDeferred.resolve(inputMedia);
      } else if(file instanceof File || file instanceof Blob) {
        const load = () => {
          if(!uploaded || message?.error) {
            uploaded = false;

            uploadPromise = this.apiFileManager.upload({file, fileName: uploadingFileName});
            uploadPromise.catch((err) => {
              if(uploaded) {
                return;
              }

              this.log('cancelling upload', media);

              message && this.cancelPendingMessage(message.random_id);
              this.setTyping(peerId, {_: 'sendMessageCancelAction'}, undefined, options.threadId);
              sentDeferred.reject(err);
            });

            uploadPromise.addNotifyListener((progress: Progress) => {
              /* if(DEBUG) {
                this.log('upload progress', progress);
              } */

              const percents = Math.max(1, Math.floor(100 * progress.done / progress.total));
              if(actionName) {
                this.setTyping(peerId, {_: actionName, progress: percents | 0}, undefined, options.threadId);
              }
              sentDeferred.notifyAll(progress);
            });

            sentDeferred.notifyAll({done: 0, total: file.size});
          }

          let thumbUploadPromise: ReturnType<typeof this.uploadThumbAndCover>;
          if(attachType === 'video' && options.objectURL && options.thumb?.blob) {
            thumbUploadPromise = this.uploadThumbAndCover({
              blob: options.thumb.blob,
              isCover: !!options.thumb.isCover,
              peer: this.appPeersManager.getInputPeerById(peerId)
            });
          }

          uploadPromise && uploadPromise.then(async(inputFile) => {
            /* if(DEBUG) {
              this.log('appMessagesManager: sendFile uploaded:', inputFile);
            } */

            (inputFile as InputFile.inputFile).name = apiFileName;
            uploaded = true;
            let inputMedia: InputMedia;
            switch(attachType) {
              case 'photo':
                inputMedia = {
                  _: 'inputMediaUploadedPhoto',
                  file: inputFile,
                  pFlags: {
                    spoiler: options.spoiler || undefined
                  }
                };
                break;

              default:
                inputMedia = {
                  _: 'inputMediaUploadedDocument',
                  file: inputFile,
                  mime_type: fileType,
                  pFlags: {
                    force_file: actionName === 'sendMessageUploadDocumentAction' || undefined,
                    spoiler: options.spoiler || undefined
                    // nosound_video: options.noSound ? true : undefined
                  },
                  attributes
                };
            }

            if(options.stars && !options.isGroupedItem) {
              inputMedia = {
                _: 'inputMediaPaidMedia',
                extended_media: [inputMedia],
                stars_amount: '' + options.stars
              };
            }

            if(thumbUploadPromise) {
              try {
                const thumbUploadResult = await thumbUploadPromise;
                assumeType<InputMedia.inputMediaUploadedDocument>(inputMedia);

                inputMedia.thumb = thumbUploadResult.file;
                inputMedia.video_cover = thumbUploadResult.coverPhoto;
              } catch(err) {
                this.log.error('sendFile thumb upload error:', err);
              }
            }

            sentDeferred.resolve(inputMedia);
          }, (error: ApiError) => {
            toggleError(error);
          });

          return sentDeferred;
        };

        if(options.isGroupedItem) {
          load();
        } else {
          this.sendSmthLazyLoadQueue.push({
            load
          });
        }
      }

      return sentDeferred;
    };

    if(!hadMessageBefore && !options.confirmedPaymentResult?.canUndo) {
      message.send = upload;
    }

    if(!hadMessageBefore) this.beforeMessageSending(message, {
      isGroupedItem: options.isGroupedItem,
      isScheduled: !!options.scheduleDate || undefined,
      threadId: options.threadId,
      clearDraft: options.clearDraft,
      processAfter: options.processAfter
    });

    if(!options.isGroupedItem) {
      const paidStars = options.confirmedPaymentResult?.starsAmount || undefined;

      const invokeSend = (inputMedia: Awaited<typeof sentDeferred>) => {
        return this.apiManager.invokeApi('messages.sendMedia', {
          background: options.background,
          peer: this.appPeersManager.getInputPeerById(peerId),
          media: inputMedia,
          message: caption,
          random_id: message.random_id,
          reply_to: options.replyTo,
          schedule_date: options.scheduleDate,
          silent: options.silent,
          entities: sendEntities,
          clear_draft: options.clearDraft,
          send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined,
          update_stickersets_order: options.updateStickersetOrder,
          invert_media: options.invertMedia,
          effect: options.effect,
          allow_paid_stars: paidStars,
          suggested_post: message.suggested_post
        }).then((updates) => {
          this.apiUpdatesManager.processUpdateMessage(updates)
          this.apiUpdatesManager.processPaidMessageUpdate({
            paidStars,
            wereStarsReserved: options.confirmedPaymentResult?.canUndo
          });
        });
      };

      const send = () => {
        sentDeferred.then((inputMedia) => {
          this.setTyping(peerId, {_: 'sendMessageCancelAction'}, undefined, options.threadId);

          let promise: Promise<void>;
          if(inputMedia._ === 'inputMediaDocument') {
            promise = this.apiFileManager.invokeApiWithReference({
              context: inputMedia.id as InputDocument.inputDocument,
              callback: () => invokeSend(inputMedia)
            });
          } else {
            promise = invokeSend(inputMedia);
          }

          return promise.catch((error: ApiError) => {
            if(attachType === 'photo' &&
              (error.type === 'PHOTO_INVALID_DIMENSIONS' ||
              error.type === 'PHOTO_SAVE_FILE_INVALID')) {
              error.handled = true;
              attachType = 'document';
              message.send();
              return;
            }

            const repayRequest = this.repayRequestHandler.tryRegisterRequest({
              error,
              messageCount: 1,
              paidStars,
              repayCallback: (override) => {
                this.cancelPendingMessage(message.random_id);
                this.sendFile({...options, ...override});
              },
              wereStarsReserved: options.confirmedPaymentResult?.canUndo
            });

            toggleError(error, repayRequest);
            throw error;
          });
        });

        const messagePromise = message.promise as CancellablePromise<void>;
        sentDeferred.then(
          () => messagePromise.resolve(),
          (err) => messagePromise.reject(err)
        );
      };

      if(options.confirmedPaymentResult?.canUndo) {
        upload();

        this.paidMessagesQueue.add(peerId, {
          send,
          cancel: () => {
            this.cancelPendingMessage(message.random_id);
            (message.promise as CancellablePromise<void>)?.reject();
          }
        });
      } else {
        send();
      }
    }

    const ret: {
      message: typeof message,
      promise: typeof sentDeferred,
      send: typeof upload,
      media: typeof media,
      uploadingFileName: typeof uploadingFileName
    } = {
      message,
      media,
      uploadingFileName
    } as any;

    defineNotNumerableProperties(ret, ['promise', 'send']);
    ret.promise = sentDeferred;
    ret.send = upload;

    return ret;
  }

  private async uploadThumbAndCover({blob, isCover, peer}: UploadThumbAndCoverArgs) {
    const file = await this.apiFileManager.upload({file: blob});

    if(!isCover) return {file};

    try {
      const coverPhoto = await this.uploadVideoCover({file, peer});
      return {file, coverPhoto};
    } catch(err) {
      this.log.error('uploadVideoCover error:', err);
    }

    return {file};
  }

  private async uploadVideoCover({file, peer}: UploadVideoCoverArgs) {
    const media: InputMedia.inputMediaUploadedPhoto = {
      _: 'inputMediaUploadedPhoto',
      file,
      pFlags: {}
    };

    const messageMedia = await this.apiManager.invokeApi('messages.uploadMedia', {peer, media});

    if(messageMedia._ !== 'messageMediaPhoto') throw new Error('Uploaded video cover is not a photo');

    const photo = this.appPhotosManager.savePhoto(messageMedia.photo);

    return getPhotoInput(photo);
  }

  public async sendGrouped(options: MessageSendingParams & {
    isMedia?: boolean,
    entities?: MessageEntity[],
    caption?: string,
    sendFileDetails: SendFileDetails[],
    clearDraft?: boolean,
    stars?: number
  }) {
    this.checkSendOptions(options);

    if(options.sendFileDetails.length === 1) {
      return this.sendFile({...options, ...options.sendFileDetails[0]});
    }

    let {peerId} = options;
    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    let caption = options.caption || '';
    let entities = options.entities || [];
    if(caption) {
      [caption, entities] = parseMarkdown(caption, entities);
    }

    let sendEntities = this.getInputEntities(entities);

    const log = this.log.bindPrefix('sendGrouped');
    log(options);

    const groupId = options.stars ? undefined : '' + ++this.groupedTempId;

    const callbacks: Array<() => void> = [];
    const processAfter = (cb: () => void) => {
      callbacks.push(cb);
    };

    let firstMessage: Message.message;
    const isSingleMessageForAlbum = !!options.stars;
    const preserveMediaTempId = this.mediaTempId;
    const results = options.sendFileDetails.map((details, idx) => {
      const o: Parameters<AppMessagesManager['sendFile']>[0] = {
        peerId,
        isGroupedItem: true,
        isMedia: options.isMedia,
        scheduleDate: options.scheduleDate,
        silent: options.silent,
        replyToMsgId: options.replyToMsgId,
        replyToStoryId: options.replyToStoryId,
        replyToQuote: options.replyToQuote,
        threadId: options.threadId,
        sendAsPeerId: options.sendAsPeerId,
        useTempMediaId: isSingleMessageForAlbum,
        groupedMessage: isSingleMessageForAlbum && firstMessage,
        groupId,
        processAfter,
        ...details
      };

      if(idx === 0) {
        o.caption = caption;
        o.entities = entities;
        o.effect = options.effect;
      }

      const result = this.sendFile(o);

      if(idx === 0) {
        firstMessage = result.message;
        firstMessage.paid_message_stars = options.confirmedPaymentResult?.starsAmount;
      }

      return result;
    });

    if(options.stars) {
      const message = results[0].message;
      message.media = this.generateOutgoingPaidMedia(results, options.stars);
      this.mediaTempMap[message.id] = preserveMediaTempId;
      message.uploadingFileName = results.map(({uploadingFileName}) => uploadingFileName);
    }

    if(options.clearDraft) {
      callbacks.push(() => {
        this.appDraftsManager.clearDraft({peerId, threadId: options.threadId, monoforumThreadId: options.replyToMonoforumPeerId});
      });
    }

    callbacks.forEach((callback) => {
      callback();
    });

    // * test pending
    if(DO_NOT_SEND_MESSAGES) {
      return;
    }

    const toggleError = (message: Message.message, error?: ApiError, repayRequest?: RepayRequest) => {
      if(message.error === error) {
        return;
      }

      this.onMessagesSendError([message], error, repayRequest);
      this.rootScope.dispatchEvent('messages_pending');
    };

    const inputPeer = this.appPeersManager.getInputPeerById(peerId);
    const invoke = (multiMedia: InputSingleMedia[]) => {
      this.setTyping(peerId, {_: 'sendMessageCancelAction'}, undefined, options.threadId);

      const deferred = deferredPromise<void>();
      this.sendSmthLazyLoadQueue.push({
        load: () => {
          const paidStars = options.confirmedPaymentResult?.starsAmount * multiMedia.length || undefined
          return this.apiManager.invokeApi(options.stars ? 'messages.sendMedia' : 'messages.sendMultiMedia', {
            peer: inputPeer,
            reply_to: options.replyTo,
            schedule_date: options.scheduleDate,
            silent: options.silent,
            clear_draft: options.clearDraft,
            send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined,
            update_stickersets_order: options.updateStickersetOrder,
            invert_media: options.invertMedia,
            effect: options.effect,
            allow_paid_stars: paidStars,
            ...(options.stars ? {
              media: multiMedia[0].media,
              message: multiMedia[0].message,
              entities: multiMedia[0].entities,
              random_id: multiMedia[0].random_id
            } : {
              multi_media: multiMedia
            })
          }).then((updates) => {
            this.apiUpdatesManager.processUpdateMessage(updates);
            this.apiUpdatesManager.processPaidMessageUpdate({
              paidStars,
              wereStarsReserved: options.confirmedPaymentResult?.canUndo
            });

            deferred.resolve();
          }, (error: ApiError) => {
            const repayRequest = this.repayRequestHandler.tryRegisterRequest({
              error,
              paidStars,
              messageCount: multiMedia.length,
              repayCallback: (override) => {
                results.forEach(({message}) => this.cancelPendingMessage(message.random_id));
                this.sendGrouped({...options, ...override});
              },
              wereStarsReserved: options.confirmedPaymentResult?.canUndo
            });

            results.forEach(({message}) => toggleError(message, error, repayRequest));
            deferred.reject(error);
          });
        }
      });

      return deferred;
    };

    const promises: Promise<InputSingleMedia>[] = results.map(async({message, send}) => {
      let inputMedia: InputMedia;
      try {
        inputMedia = await send() as InputMedia;
      } catch(err) {
        const isUploadCanceled = (err as ApiError).type === 'UPLOAD_CANCELED';
        if(isUploadCanceled && !isSingleMessageForAlbum) {
          return undefined;
        }

        if(!isUploadCanceled) {
          log.error('upload item error:', err, message);
        }
        toggleError(message, err as ApiError);
        throw err;
      }

      let messageMedia: MessageMedia;
      try {
        messageMedia = await this.apiManager.invokeApi('messages.uploadMedia', {
          peer: inputPeer,
          media: inputMedia
        });
      } catch(err) {
        log.error('uploadMedia error:', err, message);
        toggleError(message, err as ApiError);
        throw err;
      }

      const originalInputMedia = inputMedia;
      if(messageMedia._ === 'messageMediaPhoto') {
        const photo = this.appPhotosManager.savePhoto(messageMedia.photo);
        inputMedia = getPhotoMediaInput(photo);
      } else if(messageMedia._ === 'messageMediaDocument') {
        const doc = this.appDocsManager.saveDoc(messageMedia.document);
        inputMedia = getDocumentMediaInput(doc);
      }

      // copy original flags
      const copyProperties: (keyof InputMedia.inputMediaPhoto)[] = [
        'pFlags',
        'ttl_seconds'
      ];

      copyProperties.forEach((property) => {
        // @ts-ignore
        inputMedia[property] = originalInputMedia[property] ?? inputMedia[property];
      });

      const inputSingleMedia: InputSingleMedia = {
        _: 'inputSingleMedia',
        media: inputMedia,
        random_id: message?.random_id,
        message: caption,
        entities: sendEntities
      };

      // * only 1 caption for all inputs
      if(caption) {
        caption = '';
        sendEntities = undefined;
      }

      return inputSingleMedia;
    });

    return Promise.all(promises).then((inputs) => {
      inputs = inputs.filter(Boolean);

      if(options.stars) {
        const spliced = inputs.splice(1, Infinity);
        inputs[0].media = {
          _: 'inputMediaPaidMedia',
          extended_media: [
            inputs[0].media,
            ...spliced.map(({media}) => media)
          ],
          stars_amount: '' + options.stars
        };
      }

      if(options.confirmedPaymentResult?.canUndo) {
        this.paidMessagesQueue.add(peerId, {
          send: () => void invoke(inputs),
          cancel: () => results.forEach(({message}) => this.cancelPendingMessage(message.random_id))
        });
        return;
      }
      return invoke(inputs);
    });
  }

  public sendContact({peerId, contactPeerId, monoforumThreadId, confirmedPaymentResult}: SendContactArgs) {
    return this.sendOther({
      peerId,
      inputMedia: this.appUsersManager.getContactMediaInput(contactPeerId),
      replyToMonoforumPeerId: monoforumThreadId,
      confirmedPaymentResult
    });
  }

  public sendOther(
    options: MessageSendingParams & Partial<{
      inputMedia: InputMedia | {_: 'messageMediaPending', messageMedia: MessageMedia},
      viaBotId: BotId,
      replyMarkup: ReplyMarkup,
      clearDraft: true,
      queryId: string
      resultId: string,
      geoPoint: GeoPoint,
      webDocument?: WebDocument
    }>
  ) {
    let {peerId, inputMedia} = options;
    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    const noOutgoingMessage = /* inputMedia?._ === 'inputMediaPhotoExternal' ||  */inputMedia?._ === 'inputMediaDocumentExternal';
    this.checkSendOptions(options);
    const message = this.generateOutgoingMessage(peerId, options);

    let media: MessageMedia;
    switch(inputMedia._) {
      case 'inputMediaPoll': {
        // const pollId = '' + message.id;
        const pollId = randomLong();
        inputMedia.poll.id = pollId;
        this.appPollsManager.savePoll(inputMedia.poll, {
          _: 'pollResults',
          total_voters: 0,
          pFlags: {},
          recent_voters: []
        });

        const {poll, results} = this.appPollsManager.getPoll(pollId);
        media = {
          _: 'messageMediaPoll',
          poll,
          results
        };

        break;
      }

      case 'inputMediaPhoto': {
        media = {
          _: 'messageMediaPhoto',
          photo: this.appPhotosManager.getPhoto((inputMedia.id as InputPhoto.inputPhoto).id),
          pFlags: {}
        };
        break;
      }

      case 'inputMediaDocument': {
        const doc = this.appDocsManager.getDoc((inputMedia.id as InputDocument.inputDocument).id);
        /* if(doc.sticker && doc.stickerSetInput) {
          appStickersManager.pushPopularSticker(doc.id);
        } */
        media = {
          _: 'messageMediaDocument',
          document: doc,
          pFlags: {}
        };
        break;
      }

      case 'inputMediaContact': {
        media = {
          _: 'messageMediaContact',
          phone_number: inputMedia.phone_number,
          first_name: inputMedia.first_name,
          last_name: inputMedia.last_name,
          user_id: inputMedia.user_id ?? '0',
          vcard: inputMedia.vcard
        };
        break;
      }

      case 'inputMediaGeoPoint': {
        media = {
          _: 'messageMediaGeo',
          geo: options.geoPoint
        };
        break;
      }

      case 'inputMediaVenue': {
        media = {
          _: 'messageMediaVenue',
          geo: options.geoPoint,
          title: inputMedia.title,
          address: inputMedia.address,
          provider: inputMedia.provider,
          venue_id: inputMedia.venue_id,
          venue_type: inputMedia.venue_type
        };
        break;
      }

      case 'inputMediaPhotoExternal': {
        if(noOutgoingMessage) {
          break;
        }

        media = {
          _: 'messageMediaPhotoExternal',
          photo: options.webDocument
        };
        break;
      }

      case 'inputMediaDocumentExternal': {
        if(noOutgoingMessage) {
          break;
        }

        media = {
          _: 'messageMediaDocumentExternal',
          document: options.webDocument
        };
        break;
      }

      case 'inputMediaStory': {
        media = {
          _: 'messageMediaStory',
          id: inputMedia.id,
          pFlags: {},
          peer: this.appPeersManager.getOutputPeer(this.appPeersManager.getPeerId(inputMedia.peer))
        };
        break;
      }

      case 'inputMediaTodo': {
        media = {
          _: 'messageMediaToDo',
          todo: inputMedia.todo
        };
        break;
      }

      case 'messageMediaPending': {
        media = (inputMedia as any).messageMedia;
        break;
      }
    }

    message.media = media;

    const toggleError = (error?: ApiError, repayRequest?: RepayRequest) => {
      this.onMessagesSendError([message], error, repayRequest);
      this.rootScope.dispatchEvent('messages_pending');
    };

    message.send = () => {
      const sentRequestOptions: PendingAfterMsg = {};
      if(this.pendingAfterMsgs[peerId]) {
        sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
      }

      const paidStars = options.confirmedPaymentResult?.starsAmount || undefined;

      const sendAs = options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined;
      let apiPromise: Promise<any>;
      if(options.viaBotId) {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          random_id: message.random_id,
          reply_to: options.replyTo,
          query_id: options.queryId,
          id: options.resultId,
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate,
          silent: options.silent,
          send_as: sendAs,
          allow_paid_stars: paidStars
        }, sentRequestOptions);
      } else {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendMedia', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          media: inputMedia as InputMedia,
          random_id: message.random_id,
          reply_to: options.replyTo,
          message: '',
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate,
          silent: options.silent,
          send_as: sendAs,
          update_stickersets_order: options.updateStickersetOrder,
          allow_paid_stars: paidStars
        }, sentRequestOptions);
      }

      this.pendingAfterMsgs[peerId] = sentRequestOptions;

      return apiPromise.then((updates) => {
        if(updates.updates) {
          updates.updates.forEach((update: Update) => {
            if(update._ === 'updateDraftMessage') {
              update.local = true;
            }
          });
        }

        this.apiUpdatesManager.processUpdateMessage(updates);
        this.apiUpdatesManager.processPaidMessageUpdate({
          paidStars,
          wereStarsReserved: options.confirmedPaymentResult?.canUndo
        });
        promise.resolve();
      }, (error: ApiError) => {
        const repayRequest = this.repayRequestHandler.tryRegisterRequest({
          error,
          paidStars,
          messageCount: 1,
          repayCallback: (override) => {
            this.cancelPendingMessage(message.random_id);
            this.sendOther({...options, ...override});
          },
          wereStarsReserved: options.confirmedPaymentResult?.canUndo
        });
        toggleError(error, repayRequest);
        promise.reject(error);
        throw error;
      }).finally(() => {
        if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerId];
        }
      });
    };

    this.beforeMessageSending(message, {
      isScheduled: !!options.scheduleDate || undefined,
      threadId: options.threadId,
      clearDraft: options.clearDraft,
      sequential: true,
      noOutgoingMessage,
      confirmedPaymentResult: options.confirmedPaymentResult
    });

    const promise = message.promise;
    return promise;
  }

  public getMonoforumThreadId(peerId: PeerId, savedPeerId: Peer) {
    return savedPeerId && this.appPeersManager.isMonoforum(peerId) ? this.appPeersManager.getPeerId(savedPeerId) : undefined;
  }

  public getInputReplyTo(options: MessageSendingParams): InputReplyTo {
    if(options.replyToStoryId) {
      return {
        _: 'inputReplyToStory',
        story_id: options.replyToStoryId,
        peer: this.appPeersManager.getInputPeerById(options.peerId)
      };
    } else if(options.replyToMsgId) {
      return {
        _: 'inputReplyToMessage',
        monoforum_peer_id: this.appPeersManager.canManageDirectMessages(options.peerId) && options.replyToMonoforumPeerId ?
          this.appPeersManager.getInputPeerById(options.replyToMonoforumPeerId) :
          undefined,
        reply_to_msg_id: getServerMessageId(options.replyToMsgId),
        reply_to_peer_id: options.replyToPeerId && this.appPeersManager.getInputPeerById(options.replyToPeerId),
        top_msg_id: options.threadId ? getServerMessageId(options.threadId) : undefined,
        ...(options.replyToQuote && {
          quote_text: options.replyToQuote.text,
          quote_entities: options.replyToQuote.entities,
          quote_offset: options.replyToQuote.offset
        })
      };
    } else if(this.appPeersManager.canManageDirectMessages(options.peerId) && options.replyToMonoforumPeerId) {
      return {
        _: 'inputReplyToMonoForum',
        monoforum_peer_id: this.appPeersManager.getInputPeerById(options.replyToMonoforumPeerId)
      };
    }
  }

  private checkSendOptions(options: MessageSendingParams) {
    if(options.threadId && !options.replyToMsgId) {
      options.replyToMsgId = options.threadId;
    }

    options.replyTo ??= this.getInputReplyTo(options);
    // if(options.scheduleDate) {
    //   const minTimestamp = (Date.now() / 1000 | 0) + 10;
    //   if(options.scheduleDate <= minTimestamp) {
    //     delete options.scheduleDate;
    //   }
    // }
  }

  private beforeMessageSending(message: Message.message, options: Pick<MessageSendingParams, 'threadId' | 'savedReaction' | 'confirmedPaymentResult'> & Partial<{
    isGroupedItem: boolean,
    isScheduled: boolean,
    clearDraft: boolean,
    sequential: boolean,
    processAfter?: (cb: () => void) => void,
    noOutgoingMessage?: boolean
  }> = {}) {
    const messageId = message.id;
    const peerId = this.getMessagePeer(message);
    const storage = options.isScheduled ? this.getScheduledMessagesStorage(peerId) : this.getHistoryMessagesStorage(peerId);
    const monoforumThreadId = this.getMonoforumThreadId(peerId, message.saved_peer_id);

    message.storageKey = storage.key;

    const callbacks: Array<() => void> = [];
    if(options.isScheduled && !options.noOutgoingMessage) {
      // if(!options.isGroupedItem) {
      this.saveMessages([message], {storage, isScheduled: true, isOutgoing: true});
      callbacks.push(() => {
        this.rootScope.dispatchEvent('scheduled_new', message);
      });
    } else if(!options.noOutgoingMessage) {
      /* if(options.threadId && this.threadsStorage[peerId]) {
        delete this.threadsStorage[peerId][options.threadId];
      } */
      const storages: HistoryStorage[] = [
        this.getHistoryStorage(peerId),
        options.threadId ? this.getHistoryStorage(peerId, options.threadId) : undefined
      ].filter(Boolean);

      for(const storage of storages) {
        storage.history.unshift(messageId);
      }

      this.saveMessages([message], {storage, isOutgoing: true});
      this.setDialogTopMessage(message);
      this.updateMessageContextForInserting(message);

      if(options.threadId) {
        const dialog = this.dialogsStorage.getAnyDialog(peerId, options.threadId);
        if(dialog) {
          this.setDialogTopMessage(message, dialog);
        }
      }

      if(monoforumThreadId) {
        this.monoforumDialogsStorage.checkLastMessageForExistingDialog(message);
      }

      callbacks.push(() => {
        this.rootScope.dispatchEvent('history_append', {storageKey: storage.key, message});
        // storages.forEach((historyStorage) => {
        //   this.rootScope.dispatchEvent('history_append', {storageKey: historyStorage.key, message});
        // });
      });
    }

    let pending: PendingMessageDetails;
    if(!options.noOutgoingMessage) {
      pending = this.pendingByRandomId[message.random_id] = {
        peerId,
        tempId: messageId,
        threadId: options.threadId,
        storage,
        sequential: options.sequential
      };

      if(!options.isScheduled) {
        this.pendingTopMsgs[peerId] = messageId;

        if(options.threadId) {
          this.pendingTopMsgs[`${peerId}_${options.threadId}`] = messageId;
        }
      }
    }

    if(message.reactions) {
      const reaction = message.reactions.results[0].reaction;
      this.invokeAfterMessageIsSent(
        messageId,
        'reactions',
        (message) => {
          return this.appReactionsManager.sendReaction({message, reaction});
        }
      );
    }

    if(!options.isGroupedItem && message.send) {
      callbacks.push(() => {
        if(options.clearDraft) {
          this.appDraftsManager.clearDraft({
            peerId,
            threadId: options.threadId,
            monoforumThreadId
          });
        }
        if(DO_NOT_SEND_MESSAGES) return;

        if(SEND_MESSAGES_TO_PAID_QUEUE || options.confirmedPaymentResult?.canUndo) {
          this.paidMessagesQueue.add(peerId, {
            send: () => void message?.send?.(),
            cancel: () => void this.cancelPendingMessage(message?.random_id)
          });
        } else {
          message.send();
        }
      });
    }

    if(callbacks.length) {
      (options.processAfter || processAfter)(() => {
        for(const callback of callbacks) {
          callback();
        }
      });
    }

    return pending;
  }

  public generateStandaloneOutgoingMessage(peerId: PeerId) {
    const message = this.generateOutgoingMessage(peerId, {});
    this.saveMessage(message, {storage: new Map() as any});
    return message;
  }

  public generateOutgoingMessage(
    peerId: PeerId,
    options: MessageSendingParams & Partial<{
      viaBotId: BotId,
      groupId: string,
      replyMarkup: ReplyMarkup,
    }>
  ) {
    let postAuthor: string;
    const isBroadcast = this.appPeersManager.isBroadcast(peerId);
    if(isBroadcast) {
      const chat = this.appPeersManager.getPeer(peerId) as Chat.channel;
      if(chat.pFlags.signatures) {
        const user = this.appUsersManager.getSelf();
        const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        postAuthor = fullName;
      }
    }

    let topMessage: number;
    if(options.threadId && !this.appPeersManager.isForum(peerId)) {
      const historyStorage = this.getHistoryStorage(peerId, options.threadId);
      topMessage = historyStorage.history.first[0];
    }

    let media: MessageMedia;
    if(options.suggestedPost?.changeMid) {
      const changingMessage = this.getMessageByPeer(peerId, options.suggestedPost.changeMid);

      if(changingMessage?._ === 'message' && makeMessageMediaInputForSuggestedPost(changingMessage.media)) {
        media = changingMessage.media;
      }
    }

    let fromId: Peer;
    if(this.appPeersManager.isMonoforum(peerId) && this.appPeersManager.canManageDirectMessages(peerId)) {
      const chat = this.appChatsManager.getChat(peerId.toChatId());
      const linkedChannelId = chat?._ === 'channel' && chat?.pFlags?.monoforum && chat?.linked_monoforum_id?.toPeerId?.(true) || undefined;
      fromId = this.appPeersManager.getOutputPeer(linkedChannelId);
    } else {
      fromId = options.sendAsPeerId ? this.appPeersManager.getOutputPeer(options.sendAsPeerId) : this.generateFromId(peerId);
    }

    const message: Message.message = {
      _: 'message',
      id: this.generateTempMessageId(peerId, topMessage),
      from_id: fromId,
      peer_id: this.appPeersManager.getOutputPeer(peerId),
      post_author: postAuthor,
      pFlags: this.generateFlags(peerId),
      date: options.scheduleDate || (tsNow(true) + this.timeManager.getServerTimeOffset()),
      message: '',
      grouped_id: options.groupId,
      random_id: randomLong(),
      reply_to: this.generateReplyHeader(peerId, options.replyTo),
      via_bot_id: options.viaBotId,
      reply_markup: options.replyMarkup,
      replies: this.generateReplies(peerId, options.replyTo),
      views: isBroadcast && 1,
      pending: true,
      effect: options.effect,
      paid_message_stars: options.confirmedPaymentResult?.starsAmount || undefined,
      saved_peer_id: options.replyToMonoforumPeerId ? this.appPeersManager.getOutputPeer(options.replyToMonoforumPeerId) : (peerId === this.appPeersManager.peerId ? this.appPeersManager.getOutputPeer(this.appPeersManager.peerId) : undefined),
      media,
      suggested_post: options.suggestedPost ? {
        _: 'suggestedPost',
        pFlags: {},
        price: options.suggestedPost.stars ? formatStarsAmount(options.suggestedPost.stars) : undefined,
        schedule_date: options.suggestedPost.timestamp && options.suggestedPost.timestamp >= tsNow(true) + SUGGESTED_POST_MIN_THRESHOLD_SECONDS ?
          options.suggestedPost.timestamp :
          undefined
      } : undefined
    };

    defineNotNumerableProperties(message, ['send', 'promise']);
    if(options.groupId === undefined) {
      message.promise = deferredPromise();
    }

    if(options.savedReaction) {
      message.reactions = {
        _: 'messageReactions',
        pFlags: {
          reactions_as_tags: true
        },
        results: options.savedReaction.map((reaction) => {
          return {
            _: 'reactionCount',
            count: 1,
            reaction,
            chosen_order: 0
          };
        })
      };
    }

    return message;
  }

  private generateReplyHeader(peerId: PeerId, replyTo: InputReplyTo): MessageReplyHeader {
    if(!replyTo) {
      return;
    }

    if(replyTo._ === 'inputReplyToMonoForum') {
      return;
    }

    if(replyTo._ === 'inputReplyToStory') {
      return {
        _: 'messageReplyStoryHeader',
        story_id: replyTo.story_id,
        peer: this.appPeersManager.getOutputPeer(this.appPeersManager.getPeerId(replyTo.peer))
      };
    }

    const replyWillBeInPeerId = peerId;
    const replyToPeerId = this.appPeersManager.getPeerId(replyTo.reply_to_peer_id);
    if(replyToPeerId) {
      peerId = replyToPeerId;
    }

    const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
    const isForum = this.appPeersManager.isForum(peerId);
    const replyToMsgId = this.appMessagesIdsManager.generateMessageId(replyTo.reply_to_msg_id, channelId);
    let replyToTopId = replyTo.top_msg_id ? this.appMessagesIdsManager.generateMessageId(replyTo.top_msg_id, channelId) : undefined;
    const originalMessage = this.getMessageByPeer(peerId, replyToMsgId);

    if(isForum && !replyToTopId && originalMessage) {
      replyToTopId = getMessageThreadId(originalMessage, true);
    }

    const header: MessageReplyHeader = {
      _: 'messageReplyHeader',
      pFlags: {},
      reply_to_msg_id: replyToMsgId || replyToTopId
    };

    if(replyToTopId && isForum && GENERAL_TOPIC_ID !== replyToTopId) {
      header.pFlags.forum_topic = true;
    }

    if(replyToTopId && header.reply_to_msg_id !== replyToTopId) {
      header.reply_to_top_id = replyToTopId;
    }

    if(replyTo.quote_text) {
      header.quote_text = replyTo.quote_text;
      header.quote_entities = replyTo.quote_entities;
      header.quote_offset = replyTo.quote_offset;
      header.pFlags.quote = true;
    }

    if(replyToPeerId) {
      if(replyToPeerId.isUser() || !this.appPeersManager.isPeerPublic(replyToPeerId)) {
        delete header.reply_to_msg_id;
        header.quote_text ??= (originalMessage as Message.message).message;
      } else {
        header.reply_to_peer_id = this.appPeersManager.getOutputPeer(replyToPeerId);
      }
    }

    header.reply_media = (originalMessage as Message.message)?.media;

    if(originalMessage && replyWillBeInPeerId !== originalMessage.peerId) {
      header.reply_from = this.generateForwardHeader(peerId, originalMessage as Message.message, true);
    }

    return header;
  }

  private generateReplies(peerId: PeerId, replyTo?: InputReplyTo) {
    let replies: MessageReplies.messageReplies;
    if(this.appPeersManager.isBroadcast(peerId)) {
      const channelFull = this.appProfileManager.getCachedFullChat(peerId.toChatId()) as ChatFull.channelFull;
      if(channelFull?.linked_chat_id) {
        replies = {
          _: 'messageReplies',
          pFlags: {
            comments: true
          },
          channel_id: channelFull.linked_chat_id,
          replies: 0,
          replies_pts: 0
        };
      }
    } else if(this.appPeersManager.isMegagroup(peerId) && !replyTo) {
      replies = {
        _: 'messageReplies',
        pFlags: {},
        replies: 0,
        replies_pts: 0
      };
    }

    return replies;
  }

  /**
   * Generate correct from_id according to anonymous or broadcast
   * Won't return peer if message is sent by the peer
   */
  public generateFromId(peerId: PeerId) {
    if(this.appPeersManager.isAnyChat(peerId) && (this.appPeersManager.isBroadcast(peerId) || this.isAnonymousSending(peerId))) {
      return undefined;
    } else {
      return this.appPeersManager.getOutputPeer(this.appUsersManager.getSelf().id.toPeerId());
    }
  }

  private generateFlags(peerId: PeerId) {
    const pFlags: Message.message['pFlags'] = {};
    const fromId = this.appUsersManager.getSelf().id;
    if(peerId !== fromId) {
      pFlags.out = true;

      if(!this.appPeersManager.isChannel(peerId) && !this.appUsersManager.isBot(peerId)) {
        pFlags.unread = true;
      }
    }

    if(this.appPeersManager.isBroadcast(peerId)) {
      pFlags.post = true;
    }

    return pFlags;
  }

  private generateForwardHeader(toPeerId: PeerId, originalMessage: Message.message, isReply?: boolean) {
    if(!originalMessage) {
      return;
    }

    const myId = this.appPeersManager.peerId;
    const fromId = originalMessage.fromId;
    const fromPeerId = originalMessage.peerId;
    const originalFwdFrom = originalMessage.fwd_from;
    if(
      fromId === myId &&
      fromPeerId === myId &&
      !originalFwdFrom &&
      !isReply
    ) {
      return;
    }

    const fwdHeader: MessageFwdHeader.messageFwdHeader = {
      _: 'messageFwdHeader',
      date: originalMessage.date,
      pFlags: {}
    };

    let privateForwardName: string;
    if(fromId.isUser()) {
      const userFull = this.appProfileManager.getCachedFullUser(fromId.toUserId());
      privateForwardName = userFull?.private_forward_name;
    }

    if(originalFwdFrom) {
      const copyKeys: (keyof MessageFwdHeader.messageFwdHeader)[] = [
        'from_id',
        'from_name',
        'channel_post',
        'post_author'
      ];

      copyKeys.forEach((key) => {
        // @ts-ignore
        fwdHeader[key] = originalFwdFrom[key];
      });
    } else {
      fwdHeader.post_author = originalMessage.post_author;

      if(!privateForwardName) {
        fwdHeader.from_id = this.appPeersManager.getOutputPeer(fromId);
      }

      if(this.appPeersManager.isBroadcast(fromPeerId)) {
        fwdHeader.channel_post = originalMessage.id;
      }
    }

    fwdHeader.from_name ||= privateForwardName;

    if(toPeerId === myId && !isReply) {
      if(privateForwardName) {
        if(fwdHeader.from_name) {
          fwdHeader.saved_from_name = privateForwardName;
        }
      } else {
        fwdHeader.saved_from_msg_id = originalMessage.id;
        fwdHeader.saved_from_peer = this.appPeersManager.getOutputPeer(fromPeerId);
        if(originalFwdFrom) {
          fwdHeader.saved_from_id = this.appPeersManager.getOutputPeer(fromId);
        }
      }

      if(originalMessage.pFlags.out && !this.appPeersManager.isBroadcast(fromPeerId)) {
        fwdHeader.pFlags.saved_out = true;
      }

      if(originalFwdFrom) {
        fwdHeader.saved_date = originalMessage.date;
      }
    }

    return fwdHeader;
  }

  private getInputMediaWebPage(options: Parameters<AppMessagesManager['sendText']>[0]): InputMedia.inputMediaWebPage {
    if(!options.webPage) {
      return;
    }

    return {
      _: 'inputMediaWebPage',
      url: (options.webPage as WebPage.webPage).url,
      pFlags: {
        force_large_media: options.webPageOptions.largeMedia || undefined,
        force_small_media: options.webPageOptions.smallMedia || undefined,
        optional: options.webPageOptions.optional || undefined
      }
    };
  }

  private generateOutgoingWebPage(
    message: Message.message,
    options: Parameters<AppMessagesManager['sendText']>[0]
  ): {media: InputMedia.inputMediaWebPage} | {no_webpage: boolean} | {} {
    if(message._ !== 'message') {
      return {};
    }

    if(!options.webPage) {
      return {no_webpage: options.noWebPage};
    }

    message.media = {
      _: 'messageMediaWebPage',
      pFlags: {
        force_large_media: options.webPageOptions.largeMedia || undefined,
        force_small_media: options.webPageOptions.smallMedia || undefined
      },
      webpage: options.webPage
    };

    if(options.invertMedia) {
      message.pFlags.invert_media = true;
    }

    return {
      media: this.getInputMediaWebPage(options)
    };
  }

  public generateFakeAvatarMessage(peerId: PeerId, photo: Photo) {
    const maxId = Number.MAX_SAFE_INTEGER;
    const message: Message.messageService = {
      _: 'messageService',
      pFlags: {},
      action: {
        _: 'messageActionChannelEditPhoto',
        photo
      },
      id: maxId,
      peer_id: this.appPeersManager.getOutputPeer(peerId),
      mid: maxId,
      peerId,
      date: (photo as Photo.photo).date,
      fromId: peerId
    };

    this.getHistoryMessagesStorage(peerId).set(maxId, message);
    return message;
  }

  private generateOutgoingPaidMedia(messages: {media?: MessageMedia}[], stars: number): MessageMedia.messageMediaPaidMedia {
    return {
      _: 'messageMediaPaidMedia',
      extended_media: messages.map(({media}) => ({_: 'messageExtendedMedia', media})),
      stars_amount: '' + stars
    };
  }

  public getUploadPromise(uploadFileName: string) {
    return this.uploadFilePromises[uploadFileName];
  }

  public isAnonymousSending(peerId: PeerId): boolean {
    if(!peerId.isAnyChat()) {
      return false;
    }

    const chat = this.appPeersManager.getPeer(peerId);
    return (chat as Chat.channel).admin_rights?.pFlags?.anonymous;
  }

  public setDialogTopMessage(
    message: MyMessage,
    dialog: AnyDialog = this.getDialogOnly(message.peerId)
  ) {
    if(!dialog) {
      return;
    }

    dialog.top_message = message.mid;

    const historyStorage = this.getHistoryStorage(
      message.peerId,
      isDialog(dialog) ? undefined : getDialogKey(dialog)
    );
    historyStorage.maxId = message.mid;

    this.dialogsStorage.generateIndexForDialog(dialog, false, message);

    this.scheduleHandleNewDialogs(message.peerId, dialog);
  }

  public cancelPendingMessage(randomId: string) {
    const pendingData = this.pendingByRandomId[randomId];

    /* if(DEBUG) {
      this.log('cancelPendingMessage', randomId, pendingData);
    } */

    if(pendingData) {
      const {peerId, tempId, storage} = pendingData;
      const historyStorage = this.getHistoryStorage(peerId);

      if(this.appPeersManager.isChannel(peerId)) {
        this.apiUpdatesManager.processLocalUpdate({
          _: 'updateDeleteChannelMessages',
          channel_id: peerId.toChatId(),
          messages: [tempId],
          pts: undefined,
          pts_count: undefined
        });
      } else {
        this.apiUpdatesManager.processLocalUpdate({
          _: 'updateDeleteMessages',
          messages: [tempId],
          pts: undefined,
          pts_count: undefined
        });
      }

      historyStorage.history.delete(tempId);

      delete this.pendingByRandomId[randomId];
      this.deleteMessageFromStorage(storage, tempId);

      return true;
    }

    return false;
  }

  /* public async refreshConversations() {
    const limit = 200, outDialogs: Dialog[] = [];
    for(let folderId = 0; folderId < 2; ++folderId) {
      let offsetDate = 0;
      for(;;) {
        const {dialogs, isEnd} = await this.getTopMessages(limit, folderId, offsetDate);

        if(dialogs.length) {
          outDialogs.push(...dialogs as Dialog[]);
          const dialog = dialogs[dialogs.length - 1];

          // * get peerId and mid manually, because dialog can be migrated peer and it won't be saved
          const peerId = getPeerId(dialog.peer);
          const mid = this.appMessagesIdsManager.generateMessageId(dialog.top_message);
          offsetDate = this.getMessageByPeer(peerId, mid).date;

          if(!offsetDate) {
            console.error('refreshConversations: got no offsetDate', dialog);
            break;
          }
        }

        if(isEnd) {
          break;
        }
      }
    }

    let obj: {[peerId: string]: Dialog} = {};
    outDialogs.forEach((dialog) => {
      obj[dialog.peerId] = dialog;
    });
    rootScope.dispatchEvent('dialogs_multiupdate', obj);

    return outDialogs;
  } */

  public async fillConversations(folderId = GLOBAL_FOLDER_ID): Promise<void> {
    const middleware = this.middleware.get();
    while(!this.dialogsStorage.isDialogsLoaded(folderId)) {
      const result = await this.getTopMessages({limit: 100, folderId});
      if(!middleware() || !result || result.isEnd) {
        break;
      }
    }
  }

  /* public async getConversationsAll(query = '', folderId = 0) {
    const limit = 200, outDialogs: Dialog[] = [];
    for(; folderId < 2; ++folderId) {
      let offsetIndex = 0;
      for(;;) {
        const {dialogs} = await appMessagesManager.getConversations(query, offsetIndex, limit, folderId).promise;

        if(dialogs.length) {
          outDialogs.push(...dialogs);
          offsetIndex = dialogs[dialogs.length - 1].index || 0;
        } else {
          break;
        }
      }
    }

    return outDialogs;
  } */

  public getReadMaxIdIfUnread(peerId: PeerId, threadId?: number) {
    const historyStorage = this.getHistoryStorage(peerId, threadId);
    if(threadId && !this.appChatsManager.isForum(peerId.toChatId())) {
      const chatHistoryStorage = this.getHistoryStorage(peerId);
      const readMaxId = Math.max(chatHistoryStorage.readMaxId ?? 0, historyStorage.readMaxId);
      const message = this.getMessageByPeer(peerId, historyStorage.maxId); // usually message is missing, so pFlags.out won't be there anyway
      return !message?.pFlags?.out && readMaxId < historyStorage.maxId ? readMaxId : 0;
    } else {
      const message = this.getMessageByPeer(peerId, historyStorage.maxId);
      // const readMaxId = peerId.isUser() ? Math.max(historyStorage.readMaxId, historyStorage.readOutboxMaxId) : historyStorage.readMaxId;
      const readMaxId = historyStorage.readMaxId;
      // readMaxId can be 4294967295 (0)
      return !message?.pFlags?.out && readMaxId < historyStorage.maxId && getServerMessageId(readMaxId) ? readMaxId : 0;
    }
  }

  // public lolSet = new Set();
  public getTopMessages({
    limit,
    folderId,
    query,
    offsetTopicId,
    filterType = this.dialogsStorage.getFilterType(folderId)
  }: {
    limit: number,
    folderId: number,
    query?: string,
    offsetTopicId?: ForumTopic['id'],
    filterType?: FilterType
  }) {
    const log = this.log.bindPrefix('getTopMessages');
    // const dialogs = this.dialogsStorage.getFolder(folderId);
    const offsetId = 0;
    let offsetPeerId: PeerId;
    let offsetIndex = 0;
    query ||= undefined;

    let offsetDate = this.dialogsStorage.getOffsetDate(folderId);
    if(offsetDate) {
      offsetIndex = offsetDate * 0x10000;
      offsetDate += this.timeManager.getServerTimeOffset();
    }

    const useLimit = 100;
    const middleware = this.middleware.get();
    const isSearch = !!query;
    const peerId = this.dialogsStorage.isVirtualFilter(folderId) ? folderId : undefined;

    const processResult = (result: MessagesDialogs | MessagesForumTopics | MessagesSavedDialogs) => {
      if(!middleware() || result._ === 'messages.dialogsNotModified' || result._ === 'messages.savedDialogsNotModified') return null;

      log('result', result);

      // can reset pinned order here
      if(
        !peerId &&
        !offsetId &&
        !offsetDate &&
        !offsetPeerId &&
        folderId !== GLOBAL_FOLDER_ID
      ) {
        log('resetting pinned order', folderId);
        this.dialogsStorage.resetPinnedOrder(folderId);
      }

      if(!peerId && !offsetDate) {
        log('adding missed dialogs');
        // telegramMeWebManager.setAuthorized(true);
        this.appDraftsManager.addMissedDialogs();
      }

      this.saveApiResult(result);

      let maxSeenIdIncremented = !!offsetDate;
      let hasPrepend = false;
      const noIdsDialogs: BroadcastEvents['dialogs_multiupdate'] = new Map();
      const setFolderId: REAL_FOLDER_ID = folderId === GLOBAL_FOLDER_ID ? FOLDER_ID_ALL : folderId as REAL_FOLDER_ID;
      const saveGlobalOffset = (!!peerId && !isSearch) || folderId === GLOBAL_FOLDER_ID;
      const items: Array<Dialog | ForumTopic | SavedDialog> =
        (result as MessagesDialogs.messagesDialogsSlice).dialogs as Dialog[] ||
        (result as MessagesForumTopics).topics as ForumTopic[];
      log('saving', {setFolderId, saveGlobalOffset, noIdsDialogs, isSearch});
      forEachReverse(items, (dialog, idx, arr) => {
        if(!dialog) {
          arr.splice(idx, 1);
          return;
        }

        // const d = Object.assign({}, dialog);
        // ! нужно передавать folderId, так как по папке !== 0 нет свойства folder_id
        if(!peerId) {
          (dialog as Dialog).folder_id ??= setFolderId;
        }

        this.dialogsStorage.saveDialog({
          dialog,
          ignoreOffsetDate: !isSearch,
          saveGlobalOffset
        });

        if(dialog.peerId === undefined) {
          arr.splice(idx, 1);
          // this.log.error('bugged dialog?', dialog);
          // debugger;
          return;
        }

        if(
          !maxSeenIdIncremented &&
          !this.appPeersManager.isChannel(dialog.peerId || this.dialogsStorage.getDialogPeerId(dialog))
        ) {
          this.incrementMaxSeenId(dialog.top_message);
          maxSeenIdIncremented = true;
        }

        // if(!folderId && !dialog.folder_id) {
        //   this.lolSet.add(dialog.peerId);
        // }

        if(offsetIndex && getDialogIndex(dialog) > offsetIndex) {
          this.scheduleHandleNewDialogs(dialog.peerId, dialog);
          hasPrepend = true;
        }

        // ! это может случиться, если запрос идёт не по папке 0, а по 1. почему-то read'ов нет
        // ! в итоге, чтобы получить 1 диалог, делается первый запрос по папке 0, потом запрос для архивных по папке 1, и потом ещё перезагрузка архивного диалога
        if(
          !peerId &&
          !isSavedDialog(dialog) &&
          !getServerMessageId(dialog.read_inbox_max_id) &&
          !getServerMessageId(dialog.read_outbox_max_id) &&
          !dialog.unread_count &&
          getServerMessageId(dialog.top_message)
        ) {
          noIdsDialogs.set(dialog.peerId, {dialog: dialog as Dialog});

          this.log.error('noIdsDialogs', dialog, params);
        } else if(dialog.top_message) { // * fix sending status
          const topMessage = this.getMessageByPeer(dialog.peerId, dialog.top_message);
          if(topMessage) {
            this.setMessageUnreadByDialog(topMessage, dialog);
            this.dialogsStorage.setDialogToState(dialog);
          }
        }
      });

      if(noIdsDialogs.size) {
        // setTimeout(() => { // test bad situation
        const peerIds = [...noIdsDialogs.keys()];
        const promises = peerIds.map((peerId) => this.reloadConversation(peerId));
        Promise.all(promises).then(() => {
          this.rootScope.dispatchEvent('dialogs_multiupdate', noIdsDialogs);

          for(let i = 0; i < peerIds.length; ++i) {
            const peerId = peerIds[i];
            this.rootScope.dispatchEvent('dialog_unread', {
              peerId,
              dialog: this.getDialogOnly(peerId)
            });
          }
        });
        // }, 10e3);
      }

      const count = (result as MessagesDialogs.messagesDialogsSlice).count;

      // exclude empty draft dialogs
      const folderDialogs = this.dialogsStorage.getFolderDialogs(folderId, false);
      let dialogsLength = 0;
      if(!isSearch) for(let i = 0, length = folderDialogs.length; i < length; ++i) {
        const dialog = folderDialogs[i];
        if(getServerMessageId(dialog.top_message) || (dialog as Dialog).draft) {
          ++dialogsLength;
        } else {
          this.log.error('something strange with dialog', dialog);
        }
      }

      let isEnd: boolean;
      if(isSearch) {
        isEnd = !count || items.length === count;
      } else {
        isEnd = /* limit > dialogsResult.dialogs.length || */
          !count ||
          dialogsLength >= count ||
          !items.length;
      }

      if(isEnd && !isSearch) {
        this.dialogsStorage.setDialogsLoaded(folderId, true);
      }

      if(hasPrepend) {
        this.scheduleHandleNewDialogs();
      } else {
        this.rootScope.dispatchEvent('dialogs_multiupdate', new Map());
      }

      log('end', {isEnd, hasPrepend, offsetDate: this.dialogsStorage.getOffsetDate(folderId)});

      const dialogs = items;
      const slicedDialogs = limit === useLimit ? dialogs : dialogs.slice(0, limit);
      return {
        isEnd: isEnd && slicedDialogs[slicedDialogs.length - 1] === dialogs[dialogs.length - 1],
        count: count ?? items.length,
        dialogs: slicedDialogs
      };
    };

    const requestOptions: InvokeApiOptions = {
      // timeout: APITIMEOUT,
      noErrorBox: true
    };

    let promise: Promise<ReturnType<typeof processResult>>, method: string, params: any;
    if(filterType === FilterType.Forum) {
      promise = this.apiManager.invokeApiSingleProcess({
        method: method = 'channels.getForumTopics',
        params: params = {
          channel: this.appChatsManager.getChannelInput(peerId.toChatId()),
          limit: useLimit,
          offset_date: offsetTopicId ? undefined : offsetDate,
          offset_id: offsetId,
          offset_topic: offsetTopicId,
          q: query
        },
        options: requestOptions,
        processResult: (result) => {
          result = this.dialogsStorage.processTopics(peerId, result);
          return processResult(result);
        }
      });
    } else if(filterType === FilterType.Saved) {
      promise = this.apiManager.invokeApiSingleProcess({
        method: method = 'messages.getSavedDialogs',
        params: params = {
          offset_date: offsetDate,
          offset_id: offsetId,
          offset_peer: this.appPeersManager.getInputPeerById(offsetPeerId),
          limit: useLimit,
          hash: '0'
        },
        options: requestOptions,
        processResult
      });
    } else {
      // ! ВНИМАНИЕ: ОЧЕНЬ СЛОЖНАЯ ЛОГИКА:
      // ! если делать запрос сначала по папке 0, потом по папке 1, по индексу 0 в массиве будет один и тот же диалог, с dialog.pFlags.pinned, ЛОЛ???
      // ! т.е., с запросом folder_id: 1, и exclude_pinned: 0, в результате будут ещё и закреплённые с папки 0
      promise = this.apiManager.invokeApiSingleProcess({
        method: method = 'messages.getDialogs',
        params: params = {
          folder_id: folderId,
          offset_date: offsetDate,
          offset_id: offsetId,
          offset_peer: this.appPeersManager.getInputPeerById(offsetPeerId),
          limit: useLimit,
          hash: '0'
        },
        options: requestOptions,
        processResult
      });
    }

    log('invoke', method, params);

    return promise;
  }

  public async forwardMessagesInner(options: MessageForwardParams) {
    let {peerId, fromPeerId, mids} = options;
    // delete options.replyToMsgId;
    // delete options.threadId;

    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;
    mids = mids.slice().sort((a, b) => a - b);

    for(let i = 0, length = mids.length; i < length; ++i) {
      const mid = mids[i];
      const originalMessage = this.getMessageByPeer(fromPeerId, mid) as Message.message;
      if(originalMessage.pFlags.is_outgoing) { // this can happen when forwarding a changelog
        this.sendText({
          peerId,
          threadId: options.threadId,
          sendAsPeerId: options.sendAsPeerId,
          text: originalMessage.message,
          entities: originalMessage.entities,
          scheduleDate: options.scheduleDate,
          silent: options.silent,
          confirmedPaymentResult: options.confirmedPaymentResult
        });

        mids.splice(i--, 1);
        --length;
      }
    }

    if(!mids.length) {
      return Promise.resolve();
    }

    const config = await this.apiManager.getConfig();
    const overflowMids = mids.splice(config.forwarded_count_max, mids.length - config.forwarded_count_max);

    if(options.dropCaptions) {
      options.dropAuthor = true;
    }

    const groups: {
      [groupId: string]: {
        tempId: string,
        messages: Message.message[]
      }
    } = {};

    const newMids: number[] = [];
    const newMessages = mids.map((mid) => {
      const originalMessage = this.getMessageByPeer(fromPeerId, mid) as Message.message;
      const message: Message.message = this.generateOutgoingMessage(peerId, options);
      newMids.push(message.id);

      const keys: Array<keyof Message.message> = [
        'entities',
        'media'
        // 'reply_markup'
      ];

      const flags: Array<keyof Message.message['pFlags']> = [
        'invert_media'
      ];

      if(!options.dropAuthor) {
        message.fwd_from = this.generateForwardHeader(peerId, originalMessage);
        keys.push('views', 'forwards');

        if(message.fwd_from?.from_name && peerId === this.appPeersManager.peerId) {
          delete message.from_id;
        }
      }

      if(!options.dropCaptions || !originalMessage.media) {
        keys.push('message');
      }

      const replyToMid = (originalMessage.reply_to as MessageReplyHeader.messageReplyHeader)?.reply_to_msg_id;
      const replyToMessageIdx = mids.indexOf(replyToMid);
      if(replyToMid && replyToMessageIdx !== -1) {
        const newReplyToMid = newMids[replyToMessageIdx];
        message.reply_to = {
          _: 'messageReplyHeader',
          reply_to_msg_id: newReplyToMid,
          pFlags: {}
        };

        /* this.invokeAfterMessageIsSent(newReplyToMid, 'reply', async(originalMessage) => {
          message.reply_to.reply_to_msg_id = originalMessage.mid;
        }); */
      }

      keys.forEach((key) => {
        // @ts-ignore
        message[key] = copy(originalMessage[key]);
      });

      flags.forEach((key) => {
        // @ts-ignore
        message.pFlags[key] = originalMessage.pFlags[key];
      });

      const document = (message.media as MessageMedia.messageMediaDocument)?.document as MyDocument;
      if(document) {
        const types: MyDocument['type'][] = ['round', 'voice'];
        if(types.includes(document.type)) {
          (message as MyMessage).pFlags.media_unread = true;
        }

        if(document.sticker && !this.rootScope.premium) {
          const effectThumb = getStickerEffectThumb(document);
          if(effectThumb) {
            (message.media as MessageMedia.messageMediaDocument).pFlags.nopremium = true;
          }
        }
      }

      if(originalMessage.grouped_id) {
        const group = groups[originalMessage.grouped_id] ??= {tempId: '' + ++this.groupedTempId, messages: []};
        group.messages.push(message);
      }

      if(originalMessage.restriction_reason) {
        message.restriction_reason = originalMessage.restriction_reason;
      }

      if(peerId === this.appPeersManager.peerId) {
        message.saved_peer_id = this.appPeersManager.getOutputPeer(fromPeerId);
      }

      return message;
    });

    for(const groupId in groups) {
      const group = groups[groupId];
      if(group.messages.length > 1) {
        group.messages.forEach((message) => {
          message.grouped_id = group.tempId;
        });

        // * save factcheck to new message
        const originalMainMessage = getMainGroupedMessage(this.getMessagesByGroupedId(groupId));
        const message = getMainGroupedMessage(group.messages);
        if(originalMainMessage.factcheck) {
          message.factcheck = originalMainMessage.factcheck;
        }
      }
    }

    newMessages.forEach((message) => {
      this.beforeMessageSending(message, {
        isScheduled: !!options.scheduleDate || undefined,
        sequential: true,
        threadId: message.peerId === this.appPeersManager.peerId ? fromPeerId : undefined,
        confirmedPaymentResult: options.confirmedPaymentResult
      });
    });

    const sentRequestOptions: PendingAfterMsg = {};
    if(this.pendingAfterMsgs[peerId]) {
      sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
    }

    const paidStars = options.confirmedPaymentResult ? options.confirmedPaymentResult?.starsAmount * mids.length : undefined;

    const send = () => this.apiManager.invokeApiAfter('messages.forwardMessages', {
      from_peer: this.appPeersManager.getInputPeerById(fromPeerId),
      id: mids.map((mid) => getServerMessageId(mid)),
      random_id: newMessages.map((message) => message.random_id),
      to_peer: this.appPeersManager.getInputPeerById(peerId),
      with_my_score: options.withMyScore,
      silent: options.silent,
      schedule_date: options.scheduleDate,
      drop_author: options.dropAuthor,
      drop_media_captions: options.dropCaptions,
      send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined,
      top_msg_id: options.threadId ? this.appMessagesIdsManager.generateMessageId(options.threadId) : undefined,
      allow_paid_stars: paidStars,
      reply_to: this.getInputReplyTo({peerId, replyToMonoforumPeerId: options.replyToMonoforumPeerId})
    }, sentRequestOptions).then((updates) => {
      this.log('forwardMessages updates:', updates);
      this.apiUpdatesManager.processUpdateMessage(updates);
      this.apiUpdatesManager.processPaidMessageUpdate({
        paidStars,
        wereStarsReserved: options.confirmedPaymentResult?.canUndo
      });
    }, (error: ApiError) => {
      const repayRequest = this.repayRequestHandler.tryRegisterRequest({
        error,
        messageCount: newMessages.length,
        paidStars,
        repayCallback: (override) => {
          newMessages.forEach(message => {
            this.cancelPendingMessage(message.random_id);
          });
          this.forwardMessagesInner({...options, mids, ...override});
        },
        wereStarsReserved: options.confirmedPaymentResult?.canUndo
      });

      this.onMessagesSendError(newMessages, error, repayRequest);
      throw error;
    }).finally(() => {
      if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
        delete this.pendingAfterMsgs[peerId];
      }
    });

    const cancel = () => {
      newMessages.forEach(message => this.cancelPendingMessage(message.random_id));
    };

    this.pendingAfterMsgs[peerId] = sentRequestOptions;

    if(options.confirmedPaymentResult?.canUndo) {
      this.paidMessagesQueue.add(peerId, {
        send: () => void send(),
        cancel
      });

      if(overflowMids.length) this.forwardMessages({
        ...options,
        peerId,
        fromPeerId,
        mids: overflowMids
      });

      return;
    }

    const promises: Promise<any>[] = [send()];
    if(overflowMids.length) {
      promises.push(this.forwardMessages({
        ...options,
        peerId,
        fromPeerId,
        mids: overflowMids
      }));
    }

    return Promise.all(promises).then(noop);
  }

  public forwardMessages(options: MessageForwardParams) {
    this.checkSendOptions(options);

    const {peerId, fromPeerId, mids} = options;
    const channelId = this.appPeersManager.isChannel(fromPeerId) ? fromPeerId.toChatId() : undefined;
    const splitted = this.appMessagesIdsManager.splitMessageIdsByChannels(mids, channelId);
    const promises = splitted.map(([_channelId, {mids}]) => {
      return this.forwardMessagesInner({
        ...options,
        peerId,
        fromPeerId: _channelId ? channelId.toPeerId(true) : this.getMessageByPeer(fromPeerId, mids[0]).peerId,
        mids
      });
    });

    return Promise.all(promises).then(noop);
  }

  public generateEmptyMessage(mid: number): Message.message | Message.messageService {
    return undefined;
    // return {
    //   _: 'messageEmpty',
    //   id: getServerMessageId(mid),
    //   mid,
    //   deleted: true,
    //   pFlags: {}
    // };
  }

  private onMessagesSendError(messages: Message.message[], error?: ApiError, repayRequest?: RepayRequest) {
    messages.forEach((message) => {
      if(message.error === error) {
        return;
      }

      // * cancel uploading rest of files if it's a single-message album
      const {uploadingFileName} = message;
      if(uploadingFileName?.length > 1) {
        uploadingFileName.forEach((name) => {
          this.apiFileManager.cancelDownload(name);
        });
      }

      this.modifyMessage(message, (message) => {
        if(error) {
          message.error = error;
          message.repayRequest = repayRequest;
        } else {
          delete message.error;
          delete message.repayRequest;
        }
      }, undefined, true);

      if(error) {
        this.rootScope.dispatchEvent('message_error', {storageKey: message.storageKey, peerId: message.peerId, tempId: message.mid, error});

        const dialog = this.getDialogOnly(message.peerId);
        if(dialog) {
          this.rootScope.dispatchEvent('dialog_unread', {peerId: message.peerId, dialog});
        }
      }
    });
  }

  private onMessageModification(message: MyMessage, storage?: MessagesStorage | MessagesStorageKey) {
    this.setMessageToStorage(storage ?? this.getHistoryMessagesStorage(message.peerId), message);
  }

  public updateMessageContextForDeletion(message: MyMessage, deletion?: boolean, newMid?: number) {
    const context = this.getReferenceContextByMessage(message, true);
    if(!context) {
      return;
    }

    let deleted = false;
    const {searchStorages} = context;
    searchStorages?.forEach((searchStorage) => {
      if(!deletion && searchStorage.filterMessage(message)) {
        return;
      }

      deleted = true;

      searchStorage.history.delete(message.mid);
      if(searchStorage.count) {
        searchStorage.count = Math.max(0, searchStorage.count - 1);
      }

      searchStorages.delete(searchStorage);

      if(this.historyMaxIdSubscribed.has(searchStorage.key) && !newMid) {
        this.rootScope.dispatchEvent('history_delete_key', {historyKey: searchStorage.key, mid: message.mid});
      }
    });

    if(!deleted) {
      return;
    }

    if(searchStorages && !searchStorages.size) {
      delete context.searchStorages;
    }

    if(!Object.keys(context).length) {
      delete this.references[message.peerId + '_' + message.mid];
    }
  }

  public updateMessageContextForInserting(message: MyMessage) {
    const threadId = getMessageThreadId(message);
    const searchStorages = this.searchesStorage[message.peerId];
    if(!searchStorages) {
      return;
    }

    const context = this.getReferenceContextByMessage(message, true);
    const contextSearchStorages = context?.searchStorages;

    const searchStorages2 = filterUnique([searchStorages[undefined as number], searchStorages[threadId]].filter(Boolean));
    searchStorages2.forEach((searchStorages) => {
      for(const key in searchStorages) {
        const searchStorage = searchStorages[key];
        if(contextSearchStorages?.has(searchStorage)) {
          continue;
        }

        if(!searchStorage.filterMessage(message)) {
          continue;
        }

        const {first, last} = searchStorage.history;
        const {mid} = message;

        let inserted = true;
        if(first.isEnd(SliceEnd.Both) && first[0] === undefined) {
          searchStorage.history.unshift(mid);
        } else if(first.isEnd(SliceEnd.Bottom) && first[0] < mid) {
          searchStorage.history.unshift(mid);
        } else if(last.isEnd(SliceEnd.Top) && last[last.length - 1] > mid) {
          searchStorage.history.push(mid);
        } else {
          const found = searchStorage.history.findSliceOffset(mid);
          const slice = found?.slice || [] as number[];
          const lowerIndex = slice.findIndex((_mid) => mid > _mid);
          const lowerValue = slice[lowerIndex];
          const higherValue = slice[lowerIndex - 1];
          if(lowerValue && higherValue) {
            slice.splice(lowerIndex, 0, mid);
          } else {
            inserted = false;
            this.log.error('cannot insert message for search filter', message, found, searchStorage);
          }
        }

        if(inserted) {
          searchStorage.onMidInsertion(mid);
          ++searchStorage.count;
        }

        this.log('inserting message for search filter', message.mid, key);
      }
    });
  }

  public updateMessageContext(message: MyMessage) {
    this.updateMessageContextForDeletion(message);
    this.updateMessageContextForInserting(message);
  }

  public modifyMessage<T extends MyMessage>(
    message: T,
    callback: (message: T) => T | void,
    storage?: false | MessagesStorage | MessagesStorageKey,
    local?: boolean
  ) {
    message = callback(message) || message;
    if(storage !== false) this.onMessageModification(message, storage);
    if(!local) this.setDialogToStateIfMessageIsTop(message);
    this.updateMessageContext(message);

    return message;
  }

  public mirrorAllMessages(port?: MessageEventSource) {
    const mirror: Mirrors['messages'] = {};
    [
      this.messagesStorageByPeerId,
      this.scheduledMessagesStorage
    ].forEach((storages) => {
      for(const key in storages) {
        const storage = storages[key];
        mirror[storage.key] = Object.fromEntries(storage.entries());
      }
    });

    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name: 'messages',
      value: mirror,
      accountNumber: this.getAccountNumber()
    }, port);
  }

  public getMessagesStorageByKey(key: MessagesStorageKey) {
    const s = key.split('_');
    const peerId: PeerId = +s[0];
    const type: MessagesStorageType = s[1] as any;
    return type === 'scheduled' ? this.getScheduledMessagesStorage(peerId) : this.getHistoryMessagesStorage(peerId);
  }

  public getMessageFromStorage(storage: MessagesStorage | MessagesStorageKey, mid: number) {
    storage = this.getMessagesStorage(storage);

    // * use global storage instead
    if(storage?.type === 'history' && isLegacyMessageId(mid)) {
      storage = this.getGlobalHistoryMessagesStorage();
    }

    return storage?.get(mid)/*  || this.generateEmptyMessage(mid) */;
  }

  public setMessageToStorage(storage: MessagesStorage | MessagesStorageKey, message: MyMessage) {
    storage = this.getMessagesStorage(storage);

    const {mid} = message;
    // * global storage mirror
    if(
      storage?.type === 'history' &&
      isLegacyMessageId(mid) &&
      storage.peerId !== GLOBAL_HISTORY_PEER_ID
    ) {
      const globalStorage = this.getGlobalHistoryMessagesStorage();
      this.setMessageToStorage(globalStorage, message);
    }

    if(storage.type !== 'grouped') {
      MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
        name: 'messages',
        key: joinDeepPath(storage.key, mid),
        value: message,
        accountNumber: this.getAccountNumber()
      });
    }

    return storage?.set(mid, message);
  }

  public deleteMessageFromStorage(storage: MessagesStorage, mid: number) {
    if(
      storage?.type === 'history' &&
      isLegacyMessageId(mid) &&
      storage.peerId !== GLOBAL_HISTORY_PEER_ID
    ) {
      const globalStorage = this.getGlobalHistoryMessagesStorage();
      this.deleteMessageFromStorage(globalStorage, mid);
    }

    if(storage.type !== 'grouped') {
      MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
        name: 'messages',
        key: joinDeepPath(storage.key, mid),
        accountNumber: this.getAccountNumber()
      });
    }

    return storage?.delete(mid);
  }

  private createMessageStorage(peerId: PeerId, type: MessagesStorageType) {
    const storage: MessagesStorage = new Map() as any;
    storage.peerId = peerId;
    storage.type = type;
    storage.key = `${peerId}_${type}`;

    /* let num = 0;
    Object.defineProperty(storage, 'num', {
      get: () => ++num,
      set: (_num: number) => num = _num,
      enumerable: false
    });

    Object.defineProperty(storage, 'generateIndex', {
      value: (message: any) => {
        if(message.index === undefined) {
          message.index = (message.date * 0x10000) + (storage.num & 0xFFFF);
        }
      },
      enumerable: false
    }); */

    return storage;
  }

  public getHistoryMessagesStorage(peerId: PeerId) {
    return this.messagesStorageByPeerId[peerId] ??= this.createMessageStorage(peerId, 'history');
  }

  public getGlobalHistoryMessagesStorage() {
    return this.getHistoryMessagesStorage(GLOBAL_HISTORY_PEER_ID);
  }

  public getMessagesStorage(key: MessagesStorageKey | MessagesStorage): MessagesStorage {
    if(typeof(key) === 'object') {
      return key;
    } else {
      return this.getMessagesStorageByKey(key);
    }
  }

  public getMessageById(messageId: number) {
    if(isLegacyMessageId(messageId)) {
      return this.getMessageFromStorage(this.getGlobalHistoryMessagesStorage(), messageId);
    }

    return this.generateEmptyMessage(messageId);

    // for(const peerId in this.messagesStorageByPeerId) {
    //   if(this.appPeersManager.isChannel(peerId.toPeerId())) {
    //     continue;
    //   }

    //   const message = this.messagesStorageByPeerId[peerId].get(messageId);
    //   if(message) {
    //     return message;
    //   }
    // }

    // return this.getMessageFromStorage(null, messageId);
  }

  public getMessageByPeer(peerId: PeerId, messageId: number) {
    if(!peerId) {
      return this.getMessageById(messageId);
    }

    return this.getMessageFromStorage(this.getHistoryMessagesStorage(peerId), messageId);
  }

  public getMessagePeer(message: any): PeerId {
    const toId = message?.peer_id && this.appPeersManager.getPeerId(message.peer_id) || NULL_PEER_ID;

    return toId;
  }

  public getDialogOnly(peerId: PeerId) {
    return this.dialogsStorage.getDialogOnly(peerId);
  }

  public cantForwardDeleteMids(storageKey: MessagesStorageKey, mids: number[]) {
    const storage = this.getMessagesStorage(storageKey);
    let cantForward = !mids.length, cantDelete = !mids.length;
    for(const mid of mids) {
      const message = this.getMessageFromStorage(storage, mid);
      if(!cantForward) {
        cantForward = !this.canForward(message);
      }

      if(!cantDelete) {
        cantDelete = !this.canDeleteMessage(message);
      }

      if(cantForward && cantDelete) break;
    }

    return {cantForward, cantDelete};
  }

  public reloadConversationOrTopic(peerId: PeerId, threadId?: number) {
    if(threadId) {
      this.dialogsStorage.getForumTopicById(peerId, threadId);
    } else {
      this.reloadConversation(peerId);
    }
  }

  public reloadConversation(inputPeer?: PeerId | InputPeer): CancellablePromise<Dialog>;
  public reloadConversation(inputPeer: PeerId | InputPeer, useThrottled?: boolean) {
    const log = this.log.bindPrefix('reloadConversation');
    let promise: CancellablePromise<Dialog>;
    if(inputPeer !== undefined) {
      const peerId = this.appPeersManager.getPeerId(inputPeer);

      let obj = this.reloadConversationsPeers.get(peerId);
      if(obj && (useThrottled || !obj.sentRequest)) {
        promise = obj.promise;
      }

      log.warn({peerId, throttled: !!promise, sentRequest: obj?.sentRequest});

      if(promise) {
        return promise;
      }

      promise = deferredPromise();
      this.reloadConversationsPeers.set(peerId, obj = {
        inputDialogPeer: this.appPeersManager.getInputDialogPeerById(inputPeer),
        promise
      });
    }

    if(this.reloadConversationsPromise) {
      return promise || this.reloadConversationsPromise;
    }

    log('creating throttled promise');
    this.reloadConversationsPromise = pause(0).then(() => {
      const reloadConversationsPeers = new Map(this.reloadConversationsPeers);
      const inputDialogPeers = [...reloadConversationsPeers.values()].map((obj) => {
        obj.sentRequest = true;
        return obj.inputDialogPeer;
      });

      const fullfillLeft = () => {
        log('fullfilling left', reloadConversationsPeers);
        for(const [peerId, obj] of reloadConversationsPeers) {
          if(this.reloadConversationsPeers.get(peerId) === obj) {
            this.reloadConversationsPeers.delete(peerId);
          }

          obj.promise.resolve(undefined);
        }
      };

      const invoke = async() => {
        for(;;) {
          const result = await this.apiManager.invokeApi(
            'messages.getPeerDialogs',
            {peers: inputDialogPeers},
            {floodMaxTimeout: Infinity}
          );
          const currentState = this.apiUpdatesManager.updatesState;
          const {state} = result;
          if(currentState.pts && currentState.pts !== state.pts) {
            this.log.warn('current pts is different, will try again', currentState.pts, state.pts);
            await pause(500);
            continue;
          }

          return result;
        }
      };

      return invoke().then((result) => {
        log('result', result);

        for(const [peerId, obj] of reloadConversationsPeers) {
          if(this.reloadConversationsPeers.get(peerId) === obj) {
            this.reloadConversationsPeers.delete(peerId);
          }
        }

        this.dialogsStorage.applyDialogs(result);

        result.dialogs.forEach((dialog) => {
          const peerId = dialog.peerId;
          if(!peerId) {
            return;
          }

          const obj = reloadConversationsPeers.get(peerId);
          obj.promise.resolve(dialog as Dialog);
          reloadConversationsPeers.delete(peerId);
        });
      }, (err) => {
        log.error(err);
      }).then(() => {
        fullfillLeft();

        this.reloadConversationsPromise = null;
        if(this.reloadConversationsPeers.size) {
          this.reloadConversation();
        }
      });
    });

    return promise || this.reloadConversationsPromise;
  }

  public doFlushHistory({peerId, justClear, revoke, threadOrSavedId, participantPeerId, monoforumThreadId}: DoFlushHistoryArgs): Promise<true> {
    const isSavedDialog = this.appPeersManager.isSavedDialog(peerId, threadOrSavedId);
    let promise: Promise<true>;
    const processResult = (affectedHistory: MessagesAffectedHistory) => {
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updatePts',
        pts: affectedHistory.pts,
        pts_count: affectedHistory.pts_count
      });

      if(!affectedHistory.offset) {
        let filterMessage: (message: MyMessage) => boolean;
        if(monoforumThreadId) {
          filterMessage = (message) => this.appPeersManager.getPeerId(message.saved_peer_id) === monoforumThreadId;
        } else if(participantPeerId) {
          filterMessage = (message) => message.fromId === participantPeerId;
        } else if(isSavedDialog) {
          filterMessage = (message) => {
            const savedPeerId = (message as Message.message).saved_peer_id;
            if(savedPeerId) {
              return this.appPeersManager.getPeerId(savedPeerId) === threadOrSavedId;
            } else {
              return message.fromId === this.appPeersManager.peerId;
            }
          };
        }

        if(filterMessage) {
          const messagesStorage = this.getHistoryMessagesStorage(peerId);
          const deletedMids: number[] = [];
          for(const [mid, message] of messagesStorage) {
            if(filterMessage(message)) {
              deletedMids.push(mid);
            }
          }

          this.apiUpdatesManager.processLocalUpdate(peerId.isUser() ? {
            _: 'updateDeleteMessages',
            messages: deletedMids,
            pts: undefined,
            pts_count: undefined
          } : {
            _: 'updateDeleteChannelMessages',
            channel_id: peerId.toChatId(),
            messages: deletedMids,
            pts: undefined,
            pts_count: undefined
          });
        }

        return true;
      }

      return this.doFlushHistory({peerId, justClear, revoke, threadOrSavedId, monoforumThreadId});
    };

    if(monoforumThreadId) {
      promise = this.apiManager.invokeApiSingleProcess({
        method: 'messages.deleteSavedHistory',
        params: {
          parent_peer: this.appPeersManager.getInputPeerById(peerId),
          peer: this.appPeersManager.getInputPeerById(monoforumThreadId),
          max_id: 0
        },
        processResult
      });
    } else if(participantPeerId) {
      promise = this.apiManager.invokeApiSingleProcess({
        method: 'channels.deleteParticipantHistory',
        params: {
          channel: this.appChatsManager.getChannelInput(peerId.toChatId()),
          participant: this.appPeersManager.getInputPeerById(participantPeerId)
        },
        processResult
      });
    } else if(!threadOrSavedId) {
      promise = this.apiManager.invokeApiSingleProcess({
        method: 'messages.deleteHistory',
        params: {
          just_clear: justClear,
          revoke,
          peer: this.appPeersManager.getInputPeerById(peerId),
          max_id: 0
        },
        processResult
      });
    } else if(isSavedDialog) {
      promise = this.apiManager.invokeApiSingleProcess({
        method: 'messages.deleteSavedHistory',
        params: {
          peer: this.appPeersManager.getInputPeerById(threadOrSavedId),
          max_id: 0
        },
        processResult
      });
    } else {
      promise = this.apiManager.invokeApiSingleProcess({
        method: 'channels.deleteTopicHistory',
        params: {
          channel: this.appChatsManager.getChannelInput(peerId.toChatId()),
          top_msg_id: getServerMessageId(threadOrSavedId)
        },
        processResult
      });
    }

    return promise;
  }

  public async flushHistory({peerId, justClear, revoke, threadOrSavedId, monoforumThreadId}: FlushHistoryArgs) {
    if(this.appPeersManager.isChannel(peerId) && !threadOrSavedId && !monoforumThreadId) {
      const promise = this.getHistory({
        peerId,
        offsetId: 0,
        limit: 1
      });

      const historyResult = await promise;

      const channelId = peerId.toChatId();
      const maxId = historyResult.history[0] || 0;
      return this.apiManager.invokeApiSingle('channels.deleteHistory', {
        channel: this.appChatsManager.getChannelInput(channelId),
        max_id: getServerMessageId(maxId)
      }).then((bool) => {
        if(bool) {
          this.apiUpdatesManager.processLocalUpdate({
            _: 'updateChannelAvailableMessages',
            channel_id: channelId,
            available_min_id: maxId
          });
        }

        return bool;
      });
    }

    return this.doFlushHistory({peerId, justClear, revoke, threadOrSavedId, monoforumThreadId}).then(() => {
      if(monoforumThreadId) {
        this.monoforumDialogsStorage.dropDeletedDialogs(peerId, [monoforumThreadId]);
        return;
      }

      if(!threadOrSavedId) {
        this.flushStoragesByPeerId(peerId);
      }

      if(justClear) {
        this.rootScope.dispatchEvent('dialog_flush', {peerId, dialog: this.getDialogOnly(peerId)});
      } else {
        const key = this.getTypingKey(peerId, threadOrSavedId);
        delete this.notificationsToHandle[key];
        delete this.typings[key];

        if(!threadOrSavedId) {
          const c = this.reloadConversationsPeers.get(peerId);
          if(c) {
            this.reloadConversationsPeers.delete(peerId);
            c.promise.resolve(undefined);
          }
        }

        this.dialogsStorage.dropDialogOnDeletion(peerId, threadOrSavedId);
      }
    });
  }

  private flushStoragesByPeerId(peerId: PeerId) {
    [
      this.historiesStorage,
      this.threadsStorage,
      this.searchesStorage,
      this.pendingAfterMsgs,
      this.pendingTopMsgs
    ].forEach((s) => {
      delete s[peerId];
    });

    for(const key in this.pinnedMessages) {
      if(+key === peerId || key.startsWith(peerId + '_')) {
        delete this.pinnedMessages[key];
      }
    }

    const needSingleMessages = this.needSingleMessages.get(peerId);
    if(needSingleMessages) {
      for(const [mid, promise] of needSingleMessages) {
        promise.resolve(this.generateEmptyMessage(mid));
      }

      needSingleMessages.clear();
    }

    [
      this.messagesStorageByPeerId,
      this.scheduledMessagesStorage
    ].forEach((s) => {
      const ss = s[peerId];
      if(!ss) {
        return;
      }

      if(ss.type === 'history') {
        ss.forEach((message, mid) => {
          delete this.references[peerId + '_' + mid];
        });

        if(!this.appPeersManager.isChannel(peerId)) {
          const globalStorage = this.getGlobalHistoryMessagesStorage();
          ss.forEach((message, mid) => {
            this.deleteMessageFromStorage(globalStorage, mid);
          });
        }
      }

      ss.clear();
      delete s[peerId];
    });

    this.dialogsStorage.flushForumTopicsCache(peerId);
  }

  public hidePinnedMessages(peerId: PeerId) {
    return Promise.all([
      this.appStateManager.getState(),
      this.getPinnedMessage(peerId)
    ])
    .then(([state, pinned]) => {
      state.hiddenPinnedMessages[peerId] = pinned.maxId;
      this.rootScope.dispatchEvent('peer_pinned_hidden', {peerId, maxId: pinned.maxId});
    });
  }

  public getPinnedMessagesKey(peerId: PeerId, threadId?: number) {
    return peerId + (threadId ? '_' + threadId : '');
  }

  public getPinnedMessage(peerId: PeerId, threadId?: number) {
    const p = this.pinnedMessages[this.getPinnedMessagesKey(peerId, threadId)] ??= {};
    if(p.promise) return p.promise;
    else if(p.maxId) return Promise.resolve(p);

    return p.promise = Promise.resolve(this.getHistory({
      peerId,
      inputFilter: {_: 'inputMessagesFilterPinned'},
      offsetId: 0,
      limit: 1,
      threadId
    })).then((result) => {
      p.count = result.count;
      p.maxId = result.history[0];
      return p;
    }).finally(() => {
      delete p.promise;
    });
  }

  public getPinnedMessagesCount(peerId: PeerId, threadId?: number) {
    return this.pinnedMessages[this.getPinnedMessagesKey(peerId, threadId)]?.count;
  }

  public getPinnedMessagesMaxId(peerId: PeerId, threadId?: number) {
    return this.pinnedMessages[this.getPinnedMessagesKey(peerId, threadId)]?.maxId;
  }

  public updatePinnedMessage(peerId: PeerId, mid: number, unpin?: boolean, silent?: boolean, pm_oneside?: boolean) {
    return this.apiManager.invokeApi('messages.updatePinnedMessage', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      unpin,
      silent,
      pm_oneside,
      id: getServerMessageId(mid)
    }).then((updates) => {
      // this.log('pinned updates:', updates);
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public unpinAllMessages(peerId: PeerId): Promise<boolean> {
    return this.apiManager.invokeApiSingle('messages.unpinAllMessages', {
      peer: this.appPeersManager.getInputPeerById(peerId)
    }).then((affectedHistory) => {
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updatePts',
        pts: affectedHistory.pts,
        pts_count: affectedHistory.pts_count
      });

      if(!affectedHistory.offset) {
        const storage = this.getHistoryMessagesStorage(peerId);
        storage.forEach((message) => {
          if((message as Message.message).pFlags.pinned) {
            delete (message as Message.message).pFlags.pinned;
          }
        });

        this.rootScope.dispatchEvent('peer_pinned_messages', {peerId, unpinAll: true});
        delete this.pinnedMessages[this.getPinnedMessagesKey(peerId)];

        return true;
      }

      return this.unpinAllMessages(peerId);
    });
  }

  public getGroupedText(grouped_id: string) {
    const group = this.groupedMessagesStorage[grouped_id];
    return getGroupedText(Array.from(group.values()) as Message.message[]);
  }

  public getGroupsFirstMessage(message: Message.message) {
    if(!message?.grouped_id) return message;

    const storage = this.groupedMessagesStorage[message.grouped_id];
    let minMid = Number.MAX_SAFE_INTEGER;
    for(const [mid, message] of storage) {
      if(message.mid < minMid) {
        minMid = message.mid;
      }
    }

    return this.getMessageFromStorage(storage, minMid) as Message.message;
  }

  public getMidsByGroupedId(groupedId: string, sort: 'asc' | 'desc' = 'asc') {
    return getObjectKeysAndSort(this.groupedMessagesStorage[groupedId], sort);
  }

  public getMessagesByGroupedId(groupedId: string) {
    const mids = this.getMidsByGroupedId(groupedId, 'asc');
    const storage = this.groupedMessagesStorage[groupedId];
    return mids.map((mid) => this.getMessageFromStorage(storage, mid) as Message.message);
  }

  public getMidsByMessage(message: Message) {
    if(!message) return [];
    else if((message as Message.message).grouped_id) return this.getMidsByGroupedId((message as Message.message).grouped_id);
    else return [message.mid];
  }

  public filterMessages(message: MyMessage, verify: (message: MyMessage) => boolean) {
    const out: MyMessage[] = [];
    if((message as Message.message).grouped_id) {
      const storage = this.groupedMessagesStorage[(message as Message.message).grouped_id];
      for(const [mid, message] of storage) {
        if(verify(message)) {
          out.push(message);
        }
      }
    } else {
      if(verify(message)) {
        out.push(message);
      }
    }

    return out;
  }

  public generateTempMessageId(peerId: PeerId, topMessage?: number, canBeOld?: boolean) {
    if(!topMessage) {
      const dialog = this.getDialogOnly(peerId);
      const historyStorage = this.historiesStorage[peerId];
      topMessage = (dialog?.top_message ?? historyStorage?.maxId) || 0;
    }

    const tempMid = this.tempMids[peerId];
    if(tempMid && tempMid > topMessage && !canBeOld) {
      topMessage = tempMid;
    }

    const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
    const newMid = this.appMessagesIdsManager.generateTempMessageId(topMessage, channelId);
    if(!tempMid || newMid > tempMid) {
      this.tempMids[peerId] = newMid;
    }

    return newMid;
  }

  public setMessageUnreadByDialog(
    message: MyMessage,
    dialog: AnyDialog = this.getDialogOnly(message.peerId)
  ) {
    if(isSavedDialog(dialog)) {
      return;
    }

    if(dialog && message.mid) {
      if(message.mid > dialog[message.pFlags.out ?
        'read_outbox_max_id' :
        'read_inbox_max_id']) {
        message.pFlags.unread = true;
      }
    }
  }

  public saveMessage(message: Message, options: Partial<{
    storage: MessagesStorage,
    isScheduled: true,
    isOutgoing: true,
    // isNew: boolean, // * new - from update
  }> = {}) {
    if(!message || message._ === 'messageEmpty') {
      return;
    }

    message.pFlags ??= {};

    // * exclude from state
    // defineNotNumerableProperties(message, ['rReply', 'mid', 'savedFrom', 'fwdFromId', 'fromId', 'peerId', 'reply_to_mid', 'viaBotId']);

    const overwriting = !!message.peerId;
    const peerId = this.getMessagePeer(message);
    const storage = options.storage || this.getHistoryMessagesStorage(peerId);
    const isChannel = message.peer_id._ === 'peerChannel';
    const isBroadcast = isChannel && this.appChatsManager.isBroadcast(peerId.toChatId());
    const isMessage = message._ === 'message';
    const channelId = isChannel ? peerId.toChatId() : undefined;

    if(options.isOutgoing) {
      message.pFlags.is_outgoing = true;
    }

    const mid = this.appMessagesIdsManager.generateMessageId(message.id, channelId);
    message.mid = mid;

    if(isMessage) {
      if(options.isScheduled) {
        message.pFlags.is_scheduled = true;
      }

      if(message.grouped_id) {
        const storage = this.groupedMessagesStorage[message.grouped_id] ??= this.createMessageStorage(peerId, 'grouped');
        this.setMessageToStorage(storage, message);
      }

      if(message.via_bot_id) {
        // ! WARNING
        message.viaBotId = message.via_bot_id as any;
      }
    }

    const mediaContext: ReferenceContext = options.isOutgoing ? undefined : {
      type: 'message',
      peerId,
      messageId: mid
    };

    // this.log(dT(), 'msg unread', mid, apiMessage.pFlags.out, dialog && dialog[apiMessage.pFlags.out ? 'read_outbox_max_id' : 'read_inbox_max_id'])

    const replyTo = message.reply_to;
    if(replyTo) {
      if(replyTo._ === 'messageReplyHeader') {
        const replyToChannelId = (replyTo.reply_to_peer_id as Peer.peerChannel)?.channel_id || channelId;

        if(replyTo.reply_to_msg_id) {
          replyTo.reply_to_msg_id = message.reply_to_mid = this.appMessagesIdsManager.generateMessageId(replyTo.reply_to_msg_id, replyToChannelId);
        }

        if(replyTo.reply_to_top_id) {
          replyTo.reply_to_top_id = this.appMessagesIdsManager.generateMessageId(replyTo.reply_to_top_id, replyToChannelId);
        }

        this.saveMessageMedia(replyTo, mediaContext, options.isScheduled);
      }
    }

    const replies = isMessage && message.replies;
    if(replies) {
      if(replies.max_id) replies.max_id = this.appMessagesIdsManager.generateMessageId(replies.max_id, replies.channel_id);
      if(replies.read_max_id) replies.read_max_id = this.appMessagesIdsManager.generateMessageId(replies.read_max_id, replies.channel_id);
    }

    if(!overwriting) {
      message.date -= this.timeManager.getServerTimeOffset();
    }

    // storage.generateIndex(message);
    const myId = this.appPeersManager.peerId;

    const fwdHeader = isMessage && (message as Message.message).fwd_from;

    message.peerId = peerId;
    if(peerId === myId/*  && !message.from_id && !message.fwd_from */) {
      if(isMessage && !message.saved_peer_id) {
        let peerId: PeerId;
        if(!fwdHeader) {
          peerId = myId;
        } else if(fwdHeader.saved_from_peer) {
          message.saved_peer_id = fwdHeader.saved_from_peer;
        } else if(fwdHeader.from_id) {
          peerId = myId;
        } else if(fwdHeader.from_name) {
          peerId = HIDDEN_PEER_ID;
        } else {
          peerId = myId;
        }

        message.saved_peer_id ||= this.appPeersManager.getOutputPeer(peerId);
      }

      const fromId = (fwdHeader?.saved_from_id/*  && (this.appPeersManager.getPeerId(fwdHeader.saved_from_id) !== myId && fwdHeader.saved_from_id) */) || fwdHeader?.from_id;
      message.fromId = fwdHeader ? (fromId && !getFwdFromName(fwdHeader) ? this.appPeersManager.getPeerId(fromId) : NULL_PEER_ID) : myId;
    } else if(message.from_id) {
      message.fromId = this.appPeersManager.getPeerId(message.from_id);
    } else {
      message.fromId = peerId;
    }

    this.setMessageUnreadByDialog(message);

    if(fwdHeader) {
      // if(peerId === myID) {
      if(fwdHeader.saved_from_msg_id) fwdHeader.saved_from_msg_id = this.appMessagesIdsManager.generateMessageId(fwdHeader.saved_from_msg_id, (fwdHeader.saved_from_peer as Peer.peerChannel).channel_id);
      if(fwdHeader.channel_post) fwdHeader.channel_post = this.appMessagesIdsManager.generateMessageId(fwdHeader.channel_post, (fwdHeader.from_id as Peer.peerChannel).channel_id);

      const peer = fwdHeader.saved_from_peer || fwdHeader.from_id;
      const msgId = fwdHeader.saved_from_msg_id || fwdHeader.channel_post;
      if(peer && msgId) {
        const savedFromPeerId = this.appPeersManager.getPeerId(peer);
        const savedFromMid = this.appMessagesIdsManager.generateMessageId(msgId, (peer as Peer.peerChannel).channel_id);
        message.savedFrom = savedFromPeerId + '_' + savedFromMid;
      }

      /* if(peerId.isAnyChat() || peerId === myID) {
          message.fromId = appPeersManager.getPeerID(!message.from_id || deepEqual(message.from_id, fwdHeader.from_id) ? fwdHeader.from_id : message.from_id);
        } */
      /* } else {
        apiMessage.fwdPostID = fwdHeader.channel_post;
      } */

      message.fwdFromId = this.appPeersManager.getPeerId(fwdHeader.from_id);

      if(!overwriting) {
        fwdHeader.date -= this.timeManager.getServerTimeOffset();
      }
    }

    /* if(isMessage) {
      const entities = message.entities;
      if(entities && entities.find((entity) => entity._ === 'messageEntitySpoiler')) {
        message.media = {_: 'messageMediaUnsupported'};
      }
    } */

    const unsupported = this.saveMessageMedia(message, mediaContext, options.isScheduled);

    // if(isMessage && !unsupported && message.entities) {
    //   unsupported = message.entities.some((entity) => entity._ === 'messageEntityCustomEmoji');
    // }

    if(isMessage && unsupported) {
      message.media = {_: 'messageMediaUnsupported'};
      message.message = '';
      delete message.entities;
      delete message.totalEntities;
    }

    if(!isMessage && message.action) {
      const action = message.action as MessageAction;
      const suffix = message.fromId === this.appUsersManager.getSelf().id ? 'You' : '';
      let migrateFrom: PeerId, migrateTo: PeerId;

      if((action as MessageAction.messageActionChatEditPhoto).photo) {
        (action as MessageAction.messageActionChatEditPhoto).photo =
          this.appPhotosManager.savePhoto((action as MessageAction.messageActionChatEditPhoto).photo, mediaContext);
      }

      if('document' in action) {
        action.document = this.appDocsManager.saveDoc(action.document as Document, mediaContext);
      }

      switch(action._) {
        // case 'messageActionChannelEditPhoto':
        case 'messageActionChatEditPhoto':
          // action.photo = appPhotosManager.savePhoto(action.photo, mediaContext);
          if((action.photo as Photo.photo)?.video_sizes) {
            // @ts-ignore
            action._ = isBroadcast ? 'messageActionChannelEditVideo' : 'messageActionChatEditVideo';
          } else {
            if(isBroadcast) { // ! messageActionChannelEditPhoto не существует в принципе, это используется для перевода.
              // @ts-ignore
              action._ = 'messageActionChannelEditPhoto';
            }
          }
          break;

        case 'messageActionGroupCall': {
          // assumeType<MessageAction.messageActionGroupCall>(action);

          this.appGroupCallsManager.saveGroupCall(action.call as InputGroupCall.inputGroupCall);

          let type: string;
          if(action.duration === undefined) {
            type = 'started';
          } else {
            type = 'ended'
          }

          if(!isBroadcast) {
            type += '_by' + suffix;
          }

          // @ts-ignore
          action.type = type;

          break;
        }

        case 'messageActionChatEditTitle':
          /* if(options.isNew) {
            const chat = appChatsManager.getChat(peerId.toChatId());
            chat.title = action.title;
            appChatsManager.saveApiChat(chat, true);
          } */

          if(isBroadcast) {
            // @ts-ignore
            action._ = 'messageActionChannelEditTitle';
          }
          break;

        case 'messageActionChatDeletePhoto':
          if(isBroadcast) {
            // @ts-ignore
            action._ = 'messageActionChannelDeletePhoto';
          }
          break;

        case 'messageActionChatAddUser':
          if(action.users.length === 1) {
            // @ts-ignore
            action.user_id = action.users[0];
            // @ts-ignore
            if(message.fromId === action.user_id) {
              if(isChannel) {
                // @ts-ignore
                action._ = 'messageActionChatJoined' + suffix;
              } else {
                // @ts-ignore
                action._ = 'messageActionChatReturn' + suffix;
              }
            }
          } else if(action.users.length > 1) {
            // @ts-ignore
            action._ = 'messageActionChatAddUsers';
          }
          break;

        case 'messageActionChatDeleteUser':
          if(message.fromId === action.user_id) {
            // @ts-ignore
            action._ = 'messageActionChatLeave' + suffix;
          }
          break;

        case 'messageActionChannelMigrateFrom':
          migrateFrom = action.chat_id.toPeerId(true);
          migrateTo = peerId;
          break

        case 'messageActionChatMigrateTo':
          migrateFrom = peerId;
          migrateTo = action.channel_id.toPeerId(true);
          break;

        case 'messageActionHistoryClear':
          // apiMessage.deleted = true;
          message.clear_history = true;
          delete message.pFlags.out;
          delete message.pFlags.unread;
          break;

        case 'messageActionPhoneCall':
          // @ts-ignore
          action.type =
            (action.pFlags.video ? 'video_' : '') +
            (action.duration !== undefined ? (message.pFlags.out ? 'out_' : 'in_') : '') +
            (
              action.duration !== undefined ? 'ok' : (
                action.reason._ === 'phoneCallDiscardReasonMissed' ?
                  'missed' :
                  'cancelled'
              )
            );
          break;

        case 'messageActionPrizeStars':
          action.giveaway_msg_id = this.appMessagesIdsManager.generateMessageId(
            action.giveaway_msg_id,
            this.appPeersManager.getPeerId(action.boost_peer).toChatId()
          );
          break;
      }

      if(migrateFrom &&
          migrateTo &&
          !this.getMigration(migrateFrom)) {
        this.migrateChecks(migrateFrom, migrateTo);
      }
    }

    if(isMessage && message.message.length && !message.totalEntities) {
      this.wrapMessageEntities(message);
    }

    this.setMessageToStorage(storage, message);

    return message;
  }

  public saveMessages(messages: any[], options: Partial<{
    storage: MessagesStorage,
    isScheduled: true,
    isOutgoing: true,
    // isNew: boolean, // * new - from update
  }> = {}): (Message.message | Message.messageService)[] {
    if(!messages || (messages as any).saved) return messages;
    (messages as any).saved = true;
    messages.forEach((message, idx, arr) => {
      arr[idx] = this.saveMessage(message, options);
    });

    return messages;
  }

  public saveMessageMedia(message: {
    media?: MessageMedia,
    reply_media?: MessageMedia,
    peerId?: PeerId,
    mid?: number
  }, mediaContext: ReferenceContext, isScheduled?: boolean) {
    const key = 'media' in message ? 'media' : 'reply_media';
    const media = message[key];
    if(!media) {
      return;
    }

    let unsupported = false;

    switch(media._) {
      case 'messageMediaEmpty': {
        delete message[key];
        break;
      }

      case 'messageMediaPhoto': {
        if(media.ttl_seconds) {
          unsupported = true;
        } else {
          media.photo = this.appPhotosManager.savePhoto(media.photo, mediaContext);
        }

        if(!(media as MessageMedia.messageMediaPhoto).photo) { // * found this bug on test DC
          delete message[key];
        }

        break;
      }

      case 'messageMediaPoll': {
        const result = this.appPollsManager.savePoll(media.poll, media.results, message.peerId && message as Message.message);
        media.poll = result.poll;
        media.results = result.results;
        break;
      }

      case 'messageMediaDocument': {
        if(media.ttl_seconds) {
          unsupported = true;
        } else {
          const originalDoc = media.document;

          media.document = this.appDocsManager.saveDoc(originalDoc, mediaContext, media.alt_documents);

          if(!media.document && originalDoc._ !== 'documentEmpty') {
            unsupported = true;
          }
        }

        break;
      }

      case 'messageMediaWebPage': {
        const messageKey = message.peerId ? this.appWebPagesManager.getMessageKeyForPendingWebPage(message.peerId, message.mid, isScheduled) : undefined;
        media.webpage = this.appWebPagesManager.saveWebPage(media.webpage, messageKey, mediaContext);

        if(!media.webpage) {
          delete message[key];
        }

        break;
      }

      /* case 'messageMediaGame':
        AppGamesManager.saveGame(apiMessage.media.game, apiMessage.mid, mediaContext);
        apiMessage.media.handleMessage = true;
        break; */

      case 'messageMediaInvoice': {
        media.photo = this.appWebDocsManager.saveWebDocument(media.photo);
        const extendedMedia = media.extended_media;
        if(extendedMedia?._ === 'messageExtendedMedia') {
          const extendedMediaMedia = extendedMedia.media;
          (extendedMediaMedia as MessageMedia.messageMediaPhoto).photo = this.appPhotosManager.savePhoto((extendedMediaMedia as MessageMedia.messageMediaPhoto).photo, mediaContext);
          (extendedMediaMedia as MessageMedia.messageMediaDocument).document = this.appDocsManager.saveDoc((extendedMediaMedia as MessageMedia.messageMediaDocument).document, mediaContext);
        }
        break;
      }

      case 'messageMediaStory': {
        const cache = this.appStoriesManager.getPeerStoriesCache(this.appPeersManager.getPeerId(media.peer));
        media.story = this.appStoriesManager.saveStoryItems([media.story], cache)[0];
        break;
      }

      case 'messageMediaGiveawayResults': {
        media.launch_msg_id = this.appMessagesIdsManager.generateMessageId(media.launch_msg_id, media.channel_id);
        break;
      }

      case 'messageMediaPaidMedia': {
        media.extended_media.forEach((extendedMedia) => {
          if(extendedMedia._ === 'messageExtendedMedia') {
            this.saveMessageMedia(extendedMedia, mediaContext, isScheduled);
          }
        });
        break;
      }

      case 'messageMediaUnsupported': {
        unsupported = true;
        break;
      }
    }

    return unsupported;
  }

  public saveApiResult(result: Partial<{chats: Chat[], users: User[], messages: Message[]}>) {
    this.appPeersManager.saveApiPeers(result);
    this.saveMessages(result.messages);
  }

  public async getFirstMessageToEdit(peerId: PeerId, threadId?: number) {
    const historyStorage = this.getHistoryStorage(peerId, threadId);
    const slice = historyStorage.history.slice;
    if(slice.isEnd(SliceEnd.Bottom) && slice.length) {
      let goodMessage: Message.message | Message.messageService;
      const myPeerId = this.appPeersManager.peerId;
      for(const mid of slice) {
        const message = this.getMessageByPeer(peerId, mid);
        const good = myPeerId === peerId ? message.fromId === myPeerId : message.pFlags.out;

        if(good) {
          if(await this.canEditMessage(message, 'text')) {
            goodMessage = this.getGroupsFirstMessage(message as Message.message);
            break;
          }

          // * this check will allow editing only last message
          // break;
        }
      }

      return goodMessage;
    }
  }

  public wrapMessageEntities(_message: {message: string, entities?: MessageEntity[], totalEntities?: MessageEntity[]} | TextWithEntities) {
    if('message' in _message) {
      const {message, totalEntities} = wrapMessageEntities(_message.message, _message.entities);
      _message.message = message;
      _message.totalEntities = totalEntities;
    } else {
      const {message, totalEntities} = wrapMessageEntities(_message.text, _message.entities);
      _message.text = message;
      _message.entities = totalEntities;
    }
  }

  public reportMessages(peerId: PeerId, mids: number[], option: Uint8Array, message?: string) {
    return this.apiManager.invokeApiSingle('messages.report', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: mids.map((mid) => getServerMessageId(mid)),
      option,
      message
    });
  }

  public reportSpamMessages(peerId: PeerId, participantPeerId: PeerId, mids: number[]) {
    return this.apiManager.invokeApiSingle('channels.reportSpam', {
      channel: this.appChatsManager.getChannelInput(peerId.toChatId()),
      participant: this.appPeersManager.getInputPeerById(participantPeerId),
      id: mids.map((mid) => getServerMessageId(mid))
    });
  }

  public async unblockBot(botId: BotId) {
    if(await this.appProfileManager.isUserBlocked(botId)) {
      await this.appUsersManager.toggleBlock(botId.toPeerId(false), false);
    }
  }

  public async startBot(botId: BotId, chatId?: ChatId, startParam?: string) {
    const peerId = chatId ? chatId.toPeerId(true) : botId.toPeerId();
    if(!chatId) {
      await this.unblockBot(botId);
    }

    if(startParam) {
      const randomId = randomLong();

      return this.apiManager.invokeApi('messages.startBot', {
        bot: this.appUsersManager.getUserInput(botId),
        peer: this.appPeersManager.getInputPeerById(peerId),
        random_id: randomId,
        start_param: startParam
      }).then((updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      });
    }

    const str = '/start';
    if(chatId) {
      let promise: Promise<MissingInvitee[]>;
      if(this.appChatsManager.isChannel(chatId)) {
        promise = this.appChatsManager.inviteToChannel(chatId, [botId]);
      } else {
        promise = this.appChatsManager.addChatUser(chatId, botId, 0);
      }

      return promise.catch((error: ApiError) => {
        if(error?.type == 'USER_ALREADY_PARTICIPANT') {
          error.handled = true;
          return;
        }

        throw error;
      }).then(() => {
        return this.sendText({
          peerId,
          text: str + '@' + this.appPeersManager.getPeerUsername(botId.toPeerId())
        });
      });
    }

    return this.sendText({
      peerId,
      text: str
    });
  }

  public editPeerFolders(peerIds: PeerId[], folderId: number) {
    this.apiManager.invokeApi('folders.editPeerFolders', {
      folder_peers: peerIds.map((peerId) => {
        return {
          _: 'inputFolderPeer',
          peer: this.appPeersManager.getInputPeerById(peerId),
          folder_id: folderId
        };
      })
    }).then((updates) => {
      const peerId = peerIds[0];
      if(peerIds.length === 1 && folderId === FOLDER_ID_ALL) {
        this.appProfileManager.refreshPeerSettingsIfNeeded(peerId);
      }

      // this.log('editPeerFolders updates:', updates);
      this.apiUpdatesManager.processUpdateMessage(updates); // WARNING! возможно тут нужно добавлять channelId, и вызывать апдейт для каждого канала отдельно
    });
  }

  public getFilter(filterId: number) {
    return this.filtersStorage.getFilter(filterId);
  }

  public async toggleDialogPin(options: {
    peerId: PeerId,
    filterId?: number,
    topicOrSavedId?: number
  }) {
    let {peerId, topicOrSavedId, filterId} = options;

    if(filterId !== undefined && !REAL_FOLDERS.has(filterId)) {
      return this.filtersStorage.toggleDialogPin(peerId, filterId);
    }

    const dialog = this.dialogsStorage.getAnyDialog(peerId, topicOrSavedId);
    if(!dialog) throw undefined;

    const isSaved = isSavedDialog(dialog);
    const isTopic = isForumTopic(dialog);
    const _isDialog = isDialog(dialog);

    filterId ??= this.dialogsStorage.getDialogFilterId(dialog);
    const pinned = dialog.pFlags?.pinned ? undefined : true;

    if(pinned) {
      let limitType: ApiLimitType;
      if(isSaved) {
        limitType = 'savedPin';
      } else if(isTopic) {
        limitType = 'topicPin';
      } else {
        limitType = filterId === FOLDER_ID_ARCHIVE ? 'folderPin' : 'pin';
      }

      const max = await this.apiManager.getLimit(limitType);
      if(this.dialogsStorage.getPinnedOrders(filterId).length >= max) {
        throw makeError(!_isDialog ? 'PINNED_TOO_MUCH' : 'PINNED_DIALOGS_TOO_MUCH');
      }
    }

    if(isTopic) {
      return this.appChatsManager.updatePinnedForumTopic(peerId.toChatId(), topicOrSavedId, pinned);
    }

    let promise: Promise<boolean>;
    if(isSaved) {
      promise = this.apiManager.invokeApi('messages.toggleSavedDialogPin', {
        peer: this.appPeersManager.getInputDialogPeerById(topicOrSavedId),
        pinned
      });
    } else {
      promise = this.apiManager.invokeApi('messages.toggleDialogPin', {
        peer: this.appPeersManager.getInputDialogPeerById(peerId),
        pinned
      });
    }

    return promise.then(() => {
      const pFlags: (Update.updateDialogPinned | Update.updateSavedDialogPinned)['pFlags'] = pinned ? {pinned} : {};
      const dialogPeer = this.appPeersManager.getDialogPeer(isSaved ? topicOrSavedId : peerId);
      this.apiUpdatesManager.saveUpdate(isSaved ? {
        _: 'updateSavedDialogPinned',
        peer: dialogPeer,
        pFlags
      } : {
        _: 'updateDialogPinned',
        peer: dialogPeer,
        folder_id: filterId,
        pFlags
      });
    });
  }

  public async markDialogUnread({peerId, read, monoforumThreadId}: MarkDialogUnreadArgs) {
    const dialog = monoforumThreadId ?
      this.monoforumDialogsStorage.getDialogByParent(peerId, monoforumThreadId) :
      this.getDialogOnly(peerId);

    if(!dialog) return Promise.reject();

    if(
      this.appPeersManager.isForum(peerId) &&
      dialog._ === 'dialog' &&
      !dialog.pFlags.view_forum_as_messages &&
      (read || await this.dialogsStorage.getForumUnreadCount(peerId))
    ) {
      const folder = this.dialogsStorage.getFolder(peerId);
      for(const topicId of folder.unreadPeerIds) {
        const forumTopic = this.dialogsStorage.getForumTopic(peerId, topicId);
        this.readHistory({peerId, maxId: forumTopic.top_message, threadId: topicId, force: true});
      }
      return;
    }

    const unread = read || dialog.pFlags?.unread_mark ? undefined : true;

    if(!unread && dialog.unread_count) {
      const promise = this.readHistory({
        peerId,
        monoforumThreadId,
        maxId: dialog.top_message,
        force: true
      });
      if(!dialog.pFlags.unread_mark) {
        return promise;
      }
    }

    return this.apiManager.invokeApi('messages.markDialogUnread', {
      parent_peer: monoforumThreadId ?
        this.appPeersManager.getInputPeerById(peerId) :
        undefined,
      peer: monoforumThreadId ?
        this.appPeersManager.getInputDialogPeerById(monoforumThreadId) :
        this.appPeersManager.getInputDialogPeerById(peerId),
      unread
    }).then(() => {
      const pFlags: Update.updateDialogUnreadMark['pFlags'] = unread ? {unread} : {};
      this.onUpdateDialogUnreadMark({
        _: 'updateDialogUnreadMark',
        peer: this.appPeersManager.getDialogPeer(peerId),
        saved_peer_id: monoforumThreadId ?
          this.appPeersManager.getOutputPeer(monoforumThreadId) :
          undefined,
        pFlags
      });
    });
  }

  public migrateChecks(migrateFrom: PeerId, migrateTo: PeerId) {
    if(!this.getMigration(migrateFrom) && this.appChatsManager.hasChat(migrateTo.toChatId())) {
      const fromChat = this.appChatsManager.getChat(migrateFrom.toChatId()) as Chat.chat;
      if(fromChat?.migrated_to && (fromChat.migrated_to as InputChannel.inputChannel).channel_id === migrateTo.toChatId()) {
        this.migratedFromTo[migrateFrom] = migrateTo;
        this.migratedToFrom[migrateTo] = migrateFrom;

        this.rootScope.dispatchEvent('dialog_migrate', {migrateFrom, migrateTo});

        this.dialogsStorage.dropDialogWithEvent(migrateFrom);
      }
    }
  }

  private canMessageBeEdited(message: Message, kind: 'text' | 'poll') {
    if((message as Message.message)?.pFlags?.is_outgoing) {
      return false;
    }

    const goodMedias = [
      'messageMediaPhoto',
      'messageMediaDocument',
      'messageMediaWebPage',
      'messageMediaToDo'
    ];

    if(kind === 'poll') {
      goodMedias.push('messageMediaPoll');
    }

    if(!message ||
        message._ !== 'message' ||
        message.fwd_from ||
        message.via_bot_id ||
        message.media && goodMedias.indexOf(message.media._) === -1 ||
        message.fromId && this.appUsersManager.isBot(message.fromId)) {
      return false;
    }

    if(message.media?._ === 'messageMediaDocument' &&
        ((message.media.document as Document.document).sticker || (message.media.document as Document.document).type === 'round')) {
      return false;
    }

    return true;
  }

  public async canEditMessage(message: Message.message | Message.messageService, kind: 'text' | 'poll' = 'text') {
    if(!message || !this.canMessageBeEdited(message, kind)) {
      return false;
    }

    // * second rule for saved messages, because there is no 'out' flag
    if(/* message.pFlags.out ||  */this.getMessagePeer(message) === this.appUsersManager.getSelf().id) {
      return true;
    }

    const {peerId} = message;

    const canEditMessageInPeer = this.appPeersManager.isBroadcast(peerId) ?
      this.appChatsManager.hasRights(peerId.toChatId(), 'edit_messages') :
      (
        peerId.isAnyChat() && kind === 'text' ?
          !this.getMigration(message.peerId)?.next && (this.appChatsManager.hasRights(peerId.toChatId(), 'send_plain') || this.appChatsManager.hasRights(peerId.toChatId(), 'send_media')) :
          true
      ) && message.pFlags.out;

    const cannotManageDirectMessages = this.appPeersManager.isMonoforum(message.peerId) && !this.appPeersManager.canManageDirectMessages(message.peerId);

    if(
      !canEditMessageInPeer || (
        (message.peer_id._ !== 'peerChannel' || cannotManageDirectMessages) &&
        message.date < (tsNow(true) - (await this.apiManager.getConfig()).edit_time_limit) &&
        (message as Message.message).media?._ !== 'messageMediaPoll'
      )
    ) {
      return false;
    }

    return true;
  }

  public canDeleteMessage(message: MyMessage) {
    return message && (
      message.peerId.isUser() ||
      message.pFlags.out ||
      this.appChatsManager.getChat(message.peerId.toChatId())._ === 'chat' ||
      this.appChatsManager.hasRights(message.peerId.toChatId(), 'delete_messages')
    ) && (!message.pFlags.is_outgoing || !!message.error);
  }

  public getReplyKeyboard(peerId: PeerId) {
    return this.getHistoryStorage(peerId).replyMarkup;
  }

  public mergeReplyKeyboard(historyStorage: HistoryStorage, message: Message.messageService | Message.message) {
    // this.log('merge', message.mid, message.reply_markup, historyStorage.reply_markup)
    if(!message) {
      return false;
    }

    const messageReplyMarkup = (message as Message.message).reply_markup;
    if(!messageReplyMarkup &&
      !message.pFlags?.out &&
      !(message as Message.messageService).action) {
      return false;
    }

    if(messageReplyMarkup?._ === 'replyInlineMarkup') {
      return false;
    }

    const lastReplyMarkup = historyStorage.replyMarkup;
    if(messageReplyMarkup) {
      if(lastReplyMarkup && lastReplyMarkup.mid >= message.mid) {
        return false;
      }

      if(messageReplyMarkup.pFlags.selective) {
        return false;
      }

      if(historyStorage.maxOutId &&
        message.mid < historyStorage.maxOutId &&
        (messageReplyMarkup as ReplyMarkup.replyKeyboardMarkup | ReplyMarkup.replyKeyboardForceReply).pFlags.single_use) {
        (messageReplyMarkup as ReplyMarkup.replyKeyboardMarkup | ReplyMarkup.replyKeyboardForceReply).pFlags.hidden = true;
      }

      messageReplyMarkup.mid = message.mid;
      /* messageReplyMarkup = Object.assign({
        mid: message.mid
      }, messageReplyMarkup); */

      if(messageReplyMarkup._ !== 'replyKeyboardHide') {
        messageReplyMarkup.fromId = this.appPeersManager.getPeerId(message.from_id || message.peer_id);
      }

      historyStorage.replyMarkup = messageReplyMarkup;
      // this.log('set', historyStorage.reply_markup)
      return true;
    }

    if(message.pFlags.out) {
      if(lastReplyMarkup) {
        assumeType<ReplyMarkup.replyKeyboardMarkup>(lastReplyMarkup);
        if(lastReplyMarkup.pFlags.single_use &&
          !lastReplyMarkup.pFlags.hidden &&
          (message.mid > lastReplyMarkup.mid || message.pFlags.is_outgoing) &&
          (message as Message.message).message) {
          lastReplyMarkup.pFlags.hidden = true;
          // this.log('set', historyStorage.reply_markup)
          return true;
        }
      } else if(!historyStorage.maxOutId ||
        message.mid > historyStorage.maxOutId) {
        historyStorage.maxOutId = message.mid;
      }
    }

    assumeType<Message.messageService>(message);
    if(message.action?._ === 'messageActionChatDeleteUser' &&
      (lastReplyMarkup ?
        message.action.user_id === (lastReplyMarkup as ReplyMarkup.replyKeyboardMarkup).fromId :
        this.appUsersManager.isBot(message.action.user_id)
      )
    ) {
      historyStorage.replyMarkup = {
        _: 'replyKeyboardHide',
        mid: message.mid,
        pFlags: {}
      };
      // this.log('set', historyStorage.reply_markup)
      return true;
    }

    return false;
  }

  public getReferenceContext(peerId: PeerId, mid: number, onlyCached?: boolean) {
    const key = peerId + '_' + mid;
    let context = this.references[key];
    if(!context && !onlyCached) {
      context = this.references[key] = {};
    }

    return context;
  }

  public getReferenceContextByMessage(message: Message.message | Message.messageService, onlyCached?: boolean) {
    return this.getReferenceContext(message.peerId, message.mid, onlyCached);
  }

  public getSearchStorage(options: RequestHistoryOptions) {
    const o: Parameters<typeof getSearchStorageFilterKey>[0] = {...options, type: 'search'};
    if(getSearchType(options) === 'uncached') {
      const historyStorage = this.createHistoryStorage(o);
      return historyStorage;
    }

    const filter = getSearchStorageFilterKey(o);
    const key = getHistoryStorageKey(o);
    let searchStorage: HistoryStorage;
    if(options.isCacheableSearch) {
      searchStorage = this.searchesStorage[key] ??= this.createHistoryStorage(o);
    } else {
      searchStorage = ((this.searchesStorage[options.peerId] ??= {})[options.threadId || options.monoforumThreadId] ??= {})[filter] ??= this.createHistoryStorage(o);
    }
    if(options.isCacheableSearch) { // * don't update messages list if it's a global search
      if(!searchStorage.searchHistory) {
        const slicedArray = searchStorage.searchHistory = new SlicedArray();
        slicedArray.insertSlice = (slice) => {
          slicedArray.first.push(...slice);
          return slicedArray.first;
        };

        slicedArray.findOffsetInSlice = (offsetId, slice) => {
          const index = slice.indexOf(offsetId);
          if(index !== -1) {
            return {
              slice,
              offset: index + 1
            };
          }
        };
      }
    } else if(!searchStorage.originalInsertSlice) {
      searchStorage.originalInsertSlice = searchStorage.history.insertSlice.bind(searchStorage.history);
      searchStorage.history.insertSlice = (...args) => {
        const slice = searchStorage.originalInsertSlice(...args);
        if(slice) {
          args[0].forEach((mid) => {
            searchStorage.onMidInsertion(mid);
          });
        }

        return slice;
      };

      searchStorage.filterMessages = (messages) => {
        return filterMessagesByInputFilter({
          inputFilter: options.inputFilter._,
          limit: messages.length,
          messages,
          savedReaction: options.savedReaction
        });
      };

      searchStorage.filterMessage = (message) => {
        return !!searchStorage.filterMessages([message]).length;
      };

      searchStorage.onMidInsertion = (mid) => {
        const context = this.getReferenceContext(options.peerId, mid);
        (context.searchStorages ??= new Set()).add(searchStorage);
      };
    }

    return searchStorage;
  }

  public async getSearchCounters(
    peerId: PeerId,
    filters: MessagesFilter[],
    canCache = true,
    threadId?: number
  ): Promise<MessagesSearchCounter[]> {
    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;
    if(await this.appPeersManager.isPeerRestricted(peerId)) {
      return Promise.resolve(filters.map((filter) => {
        return {
          _: 'messages.searchCounter',
          pFlags: {},
          filter: filter,
          count: 0
        };
      }));
    }

    const historyType = this.getHistoryType(peerId, {threadId});
    const migration = this.getMigration(peerId);

    const method = 'messages.getSearchCounters';
    const func = (canCache ? this.apiManager.invokeApiCacheable : this.apiManager.invokeApi).bind(this.apiManager);
    const result = func(method, {
      peer: this.appPeersManager.getInputPeerById(peerId),
      filters,
      top_msg_id: threadId && historyType !== HistoryType.Saved ? getServerMessageId(threadId) : undefined,
      saved_peer_id: historyType === HistoryType.Saved ? this.appPeersManager.getInputPeerById(threadId) : undefined
    }, {cacheSeconds: 60e3});

    if(migration) {
      const legacyResult = func(method, {
        peer: this.appPeersManager.getInputPeerById(migration.prev),
        filters
      });

      return Promise.all([result, legacyResult]).then(([searchCounters, legacySearchCounters]) => {
        const out: MessagesSearchCounter[] = searchCounters.map((searchCounter, idx) => {
          return {
            ...searchCounter,
            count: searchCounter.count + legacySearchCounters[idx].count
          };
        });

        return out;
      });
    }

    return result;
  }

  public filterMessagesByInputFilterFromStorage(inputFilter: MyInputMessagesFilter, history: number[], storage: MessagesStorage | MessagesStorageKey, limit: number) {
    const _storage = this.getMessagesStorage(storage);
    return filterMessagesByInputFilter({inputFilter, messages: history.map((mid) => _storage.get(mid)), limit});
  }

  public subscribeRepliesThread(peerId: PeerId, mid: number) {
    const repliesKey = peerId + '_' + mid;
    for(const threadKey in this.threadsToReplies) {
      if(this.threadsToReplies[threadKey] === repliesKey) return;
    }

    this.getDiscussionMessage(peerId, mid);
  }

  public generateThreadServiceStartMessage(message: Message.message | Message.messageService) {
    const {peerId, mid} = message;
    const threadKey = peerId + '_' + mid;
    const serviceStartMid = this.threadsServiceMessagesIdsStorage[threadKey];
    if(serviceStartMid) return serviceStartMid;

    const maxMid = Math.max(...this.getMidsByMessage(message));
    const serviceStartMessage: Message.messageService = {
      _: 'messageService',
      pFlags: {
        is_single: true
      },
      id: this.generateTempMessageId(peerId, maxMid, true),
      date: message.date,
      from_id: {_: 'peerUser', user_id: NULL_PEER_ID}/* message.from_id */,
      peer_id: message.peer_id,
      action: {
        _: 'messageActionDiscussionStarted'
      },
      reply_to: this.generateReplyHeader(
        peerId,
        this.getInputReplyTo({replyToMsgId: mid, threadId: mid})
      )
    };

    this.saveMessages([serviceStartMessage], {isOutgoing: true});
    return this.threadsServiceMessagesIdsStorage[threadKey] = serviceStartMessage.mid;
  }

  public getThreadServiceMessageId(peerId: PeerId, threadId: number) {
    return this.threadsServiceMessagesIdsStorage[peerId + '_' + threadId];
  }

  public getDiscussionMessage(peerId: PeerId, mid: number) {
    return this.apiManager.invokeApiSingle('messages.getDiscussionMessage', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    }).then((result) => {
      this.saveApiResult(result);

      const message = this.getMessageWithReplies(result.messages[0] as Message.message);
      const threadKey = message.peerId + '_' + message.mid;
      const channelId = message.peerId.toChatId();

      // this.generateThreadServiceStartMessage(message);

      this.log('got discussion message', peerId, mid, result, message.peerId, message.mid);

      const historyStorage = this.getHistoryStorage(message.peerId, message.mid);
      const newMaxId = result.max_id = this.appMessagesIdsManager.generateMessageId(result.max_id, channelId) || 0;
      result.read_inbox_max_id = historyStorage.readMaxId = this.appMessagesIdsManager.generateMessageId(result.read_inbox_max_id ?? message.mid, channelId);
      result.read_outbox_max_id = historyStorage.readOutboxMaxId = this.appMessagesIdsManager.generateMessageId(result.read_outbox_max_id, channelId) || 0;

      const first = historyStorage.history.first;
      if(historyStorage.maxId && historyStorage.maxId < newMaxId && first.isEnd(SliceEnd.Bottom)) {
        first.unsetEnd(SliceEnd.Bottom);
      }
      historyStorage.maxId = newMaxId;

      this.threadsToReplies[threadKey] = peerId + '_' + mid;

      return message;
    });
  }

  private handleNewMessage(message: MyMessage) {
    this.rootScope.dispatchEvent('history_multiappend', message);
  }

  private handleNewDialogs = () => {
    let newMaxSeenId = 0;
    const updateMap: BroadcastEvents['dialogs_multiupdate']= new Map();

    const processDialog = (dialog: AnyDialog) => {
      const {peerId} = dialog;
      this.dialogsStorage.pushDialog({dialog});
      if(!this.appPeersManager.isChannel(peerId)) {
        newMaxSeenId = Math.max(newMaxSeenId, dialog.top_message || 0);
      }

      let cache = updateMap.get(peerId);
      if(!cache) {
        updateMap.set(peerId, cache = {});
      }

      if(isForumTopic(dialog)) {
        (cache.topics ??= new Map()).set(dialog.id, dialog);
      } else if(isSavedDialog(dialog)) {
        (cache.saved ??= new Map()).set(dialog.savedPeerId, dialog);
      } else {
        cache.dialog = dialog;
      }
    };

    for(const [peerId, obj] of this.newDialogsToHandle) {
      const isDialogDefined = 'dialog' in obj;
      const {dialog, topics, saved} = obj;

      if(isDialogDefined) {
        if(!dialog) {
          this.reloadConversation(peerId.toPeerId());
        } else if(this.dialogsStorage.getDialogOnly(peerId)) { // * can be already dropped
          processDialog(dialog);
        }
      }

      topics?.forEach((topic, id) => {
        if(!topic) {
          this.dialogsStorage.getForumTopicById(peerId, id);
        } else if(this.dialogsStorage.getForumTopic(peerId, id)) { // * can be already dropped
          processDialog(topic);
        }
      });

      saved?.forEach((savedDialog, savedPeerId) => {
        if(!savedDialog) {
          this.dialogsStorage.getSavedDialogById(savedPeerId);
        } else if(this.dialogsStorage.getAnyDialog(peerId, savedPeerId)) { // * can be already dropped
          processDialog(savedDialog);
        }
      });
    }

    // this.log('after order:', this.dialogsStorage[0].map((d) => d.peerId));

    if(newMaxSeenId !== 0) {
      this.incrementMaxSeenId(newMaxSeenId);
    }

    this.rootScope.dispatchEvent('dialogs_multiupdate', updateMap);
    this.newDialogsToHandle.clear();
  };

  public scheduleHandleNewDialogs(peerId?: PeerId, dialog?: AnyDialog | ForumTopic['id'] | SavedDialog['savedPeerId']) {
    if(peerId !== undefined) {
      let obj = this.newDialogsToHandle.get(peerId);
      if(!obj) {
        this.newDialogsToHandle.set(peerId, obj = {});
      }

      const isObject = typeof(dialog) === 'object';
      if(!dialog || (isObject && isDialog(dialog))) {
        obj.dialog = dialog as Dialog;
      } else {
        const threadOrSavedId = isObject ? getDialogKey(dialog) : dialog;
        const map: Map<number, ForumTopic | SavedDialog> = this.getHistoryType(
          peerId,
          {threadId: threadOrSavedId}
        ) === HistoryType.Saved ?
          obj.saved ??= new Map() :
          obj.topics ??= new Map();

        if(isObject) {
          map.set(threadOrSavedId, dialog as ForumTopic | SavedDialog);
        } else {
          map.set(threadOrSavedId, undefined);
        }
      }
    }

    return this.newDialogsHandlePromise ??= pause(0).then(() => {
      this.newDialogsHandlePromise = undefined;
      this.handleNewDialogs();
    });
  }

  private async deleteMessagesInner(channelId: ChatId, mids: number[], revoke?: boolean, isRecursion?: boolean) {
    let promise: Promise<any>;

    if(channelId && !isRecursion) {
      const channel = this.appChatsManager.getChat(channelId) as Chat.channel;
      if(!channel.pFlags.creator && !channel.admin_rights?.pFlags?.delete_messages) {
        mids = mids.filter((mid) => {
          const message = this.getMessageByPeer(channelId.toPeerId(true), mid);
          return !!message.pFlags.out;
        });

        if(!mids.length) {
          return;
        }
      }
    }

    const config = await this.apiManager.getConfig();
    const overflowMids = mids.splice(config.forwarded_count_max, mids.length - config.forwarded_count_max);

    const serverMessageIds = mids.map((mid) => {
      const messageId = getServerMessageId(mid);
      // filter outgoing messages
      return this.appMessagesIdsManager.generateMessageId(messageId, channelId) === mid && messageId;
    }).filter(Boolean);

    if(DO_NOT_DELETE_MESSAGES) {
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateDeleteMessages',
        messages: mids,
        pts: 0,
        pts_count: 0
      });

      return;
    }

    if(channelId) {
      promise = this.apiManager.invokeApi('channels.deleteMessages', {
        channel: this.appChatsManager.getChannelInput(channelId),
        id: serverMessageIds
      }).then((affectedMessages) => {
        this.apiUpdatesManager.processLocalUpdate({
          _: 'updateDeleteChannelMessages',
          channel_id: channelId,
          messages: mids,
          pts: affectedMessages.pts,
          pts_count: affectedMessages.pts_count
        });
      });
    } else {
      promise = this.apiManager.invokeApi('messages.deleteMessages', {
        revoke,
        id: serverMessageIds
      }).then((affectedMessages) => {
        this.apiUpdatesManager.processLocalUpdate({
          _: 'updateDeleteMessages',
          messages: mids,
          pts: affectedMessages.pts,
          pts_count: affectedMessages.pts_count
        });
      });
    }

    const promises: (typeof promise)[] = [promise];
    if(overflowMids.length) {
      promises.push(this.deleteMessagesInner(channelId, overflowMids, revoke, true));
    }

    return Promise.all(promises).then(noop);
  }

  public deleteMessages(peerId: PeerId, mids: number[], revoke?: boolean) {
    const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
    const splitted = this.appMessagesIdsManager.splitMessageIdsByChannels(mids, channelId);
    const promises = splitted.map(([channelId, {mids}]) => {
      return this.deleteMessagesInner(channelId, mids, revoke);
    });

    return Promise.all(promises).then(noop);
  }

  public readHistory({peerId, maxId = 0, threadId, monoforumThreadId, force = false}: ReadHistoryArgs) {
    if(DO_NOT_READ_HISTORY) {
      return Promise.resolve();
    }

    // console.trace('start read')
    this.log('readHistory:', peerId, maxId, threadId);
    const readMaxId = this.getReadMaxIdIfUnread(peerId, threadId);
    if(!readMaxId) {
      if(threadId && !force) {
        const forumTopic = this.dialogsStorage.getForumTopic(peerId, threadId);
        if(forumTopic && !getServerMessageId(forumTopic.read_inbox_max_id)) {
          force = true;
        }
      }

      if(!force) {
        const dialog = this.appChatsManager.isForum(peerId.toChatId()) && threadId ?
          this.dialogsStorage.getForumTopic(peerId, threadId) :
          this.appPeersManager.isMonoforum(peerId) && monoforumThreadId ?
            this.monoforumDialogsStorage.getDialogByParent(peerId, monoforumThreadId) :
            this.getDialogOnly(peerId);

        if(dialog && this.isDialogUnread(dialog)) {
          force = true;
        }
      }

      if(!force) {
        this.log('readHistory: isn\'t unread');
        return Promise.resolve();
      }
    }

    const historyStorage = this.getHistoryStorage(peerId, threadId || monoforumThreadId);

    if(historyStorage.triedToReadMaxId >= maxId) {
      return Promise.resolve();
    }

    let apiPromise: Promise<any>;
    if(monoforumThreadId) {
      if(!historyStorage.readPromise) {
        apiPromise = this.apiManager.invokeApi('messages.readSavedHistory', {
          parent_peer: this.appPeersManager.getInputPeerById(peerId),
          peer: this.appPeersManager.getInputPeerById(monoforumThreadId),
          max_id: getServerMessageId(maxId)
        });
      }

      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateReadMonoForumInbox',
        read_max_id: maxId,
        channel_id: peerId.toChatId(),
        saved_peer_id: this.appPeersManager.getOutputPeer(monoforumThreadId)
      });
    } else if(threadId) {
      if(!historyStorage.readPromise) {
        apiPromise = this.apiManager.invokeApi('messages.readDiscussion', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          msg_id: getServerMessageId(threadId),
          read_max_id: getServerMessageId(maxId)
        });
        // apiPromise = new Promise<void>((resolve) => resolve());
      }

      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateReadChannelDiscussionInbox',
        channel_id: peerId.toChatId(),
        top_msg_id: threadId,
        read_max_id: maxId
      });
    } else if(this.appPeersManager.isChannel(peerId)) {
      if(!historyStorage.readPromise) {
        apiPromise = this.apiManager.invokeApi('channels.readHistory', {
          channel: this.appChatsManager.getChannelInput(peerId.toChatId()),
          max_id: getServerMessageId(maxId)
        });
      }

      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateReadChannelInbox',
        max_id: maxId,
        channel_id: peerId.toChatId(),
        still_unread_count: undefined,
        pts: undefined
      });
    } else {
      if(!historyStorage.readPromise) {
        apiPromise = this.apiManager.invokeApi('messages.readHistory', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          max_id: getServerMessageId(maxId)
        }).then((affectedMessages) => {
          this.apiUpdatesManager.processLocalUpdate({
            _: 'updatePts',
            pts: affectedMessages.pts,
            pts_count: affectedMessages.pts_count
          });
        });
      }

      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateReadHistoryInbox',
        max_id: maxId,
        peer: this.appPeersManager.getOutputPeer(peerId),
        still_unread_count: undefined,
        pts: undefined,
        pts_count: undefined
      });
    }

    this.rootScope.dispatchEvent('notification_reset', this.appPeersManager.getPeerString(peerId));

    if(historyStorage.readPromise) {
      return historyStorage.readPromise;
    }

    historyStorage.triedToReadMaxId = maxId;

    apiPromise.finally(() => {
      delete historyStorage.readPromise;

      const {readMaxId} = historyStorage;
      this.log('readHistory: promise finally', maxId, readMaxId);

      if(readMaxId > maxId) {
        this.readHistory({peerId, maxId: readMaxId, threadId, force: true});
      }
    });

    return historyStorage.readPromise = apiPromise;
  }

  public readAllHistory(peerId: PeerId, threadId?: number, force = false) {
    const historyStorage = this.getHistoryStorage(peerId, threadId);
    if(historyStorage.maxId) {
      this.readHistory({peerId, maxId: historyStorage.maxId, threadId, force}); // lol
    }
  }

  private getUnreadMentionsKey({peerId, threadId, isReaction}: GetUnreadMentionsOptions) {
    return peerId + (threadId ? `_${threadId}` : '') + (isReaction ? '_reaction' : '');
  }

  private getDialogUnreadMentions(dialog: Dialog | ForumTopic, isReaction?: boolean) {
    return dialog && (isReaction ? dialog.unread_reactions_count : dialog.unread_mentions_count);
  }

  private fixDialogUnreadMentionsIfNoMessage({peerId, threadId, isReaction, force}: GetUnreadMentionsOptions & {force?: boolean}) {
    const dialog = this.dialogsStorage.getAnyDialog(peerId, threadId) as Dialog | ForumTopic;
    if(force || this.getDialogUnreadMentions(dialog, isReaction)) {
      this.reloadConversationOrTopic(peerId);
    }
  }

  private modifyCachedMentions(options: GetUnreadMentionsOptions & {mid?: number, add: boolean}) {
    const {mid, add} = options;
    const slicedArray = this.unreadMentions[this.getUnreadMentionsKey(options)];
    if(!slicedArray) return;

    if(add) {
      if(slicedArray.first.isEnd(SliceEnd.Top)) {
        slicedArray.insertSlice([mid]);
      }
    } else if(mid) {
      slicedArray.delete(mid);
    } else { // clear it
      slicedArray.slices.splice(1, Infinity);
      slicedArray.first.length = 0;
      slicedArray.first.setEnd(SliceEnd.Both);
    }
  }

  private modifyCachedMentionsAndSave(options: GetUnreadMentionsOptions & {mid: number, addMention?: boolean | number, addReaction?: boolean | number}) {
    const dialog = this.dialogsStorage.getAnyDialog(options.peerId, options.threadId) as Dialog | ForumTopic;
    if(!dialog) {
      return;
    }

    const releaseUnreadCount = this.dialogsStorage.prepareDialogUnreadCountModifying(dialog);

    const a: [boolean | number, 'unread_reactions_count' | 'unread_mentions_count'][] = [
      [options.addMention, 'unread_mentions_count'],
      [options.addReaction, 'unread_reactions_count']
    ];

    a.forEach(([add, key]) => {
      if(add === undefined) {
        return;
      }

      if(add) dialog[key] += +add;
      else dialog[key] = Math.max(0, dialog[key] - Math.max(1, +add));
      this.modifyCachedMentions({
        ...options,
        threadId: isForumTopic(dialog) ? options.threadId : undefined,
        isReaction: key === 'unread_reactions_count',
        add: !!add
      });
    });

    releaseUnreadCount();

    this.rootScope.dispatchEvent('dialog_unread', {peerId: options.peerId, dialog});
    this.dialogsStorage.setDialogToState(dialog);
  }

  private fixUnreadMentionsCountIfNeeded({peerId, threadId, slicedArray, isReaction}: GetUnreadMentionsOptions & {slicedArray: SlicedArray<number>}) {
    const dialog = this.dialogsStorage.getAnyDialog(peerId, threadId) as Dialog | ForumTopic;
    if(!slicedArray.length && this.getDialogUnreadMentions(dialog, isReaction)) {
      this.reloadConversationOrTopic(peerId);
    }
  }

  public goToNextMention(options: GetUnreadMentionsOptions) {
    /* this.getUnreadMentions(peerId, 1, 2, 0).then((messages) => {
      console.log(messages);
    }); */

    const key = this.getUnreadMentionsKey(options);
    const promise = this.goToNextMentionPromises[key];
    if(promise) {
      return promise;
    }

    const slicedArray = this.unreadMentions[key] ??= new SlicedArray();
    const length = slicedArray.length;
    const isTopEnd = slicedArray.first.isEnd(SliceEnd.Top);
    if(!length && isTopEnd) {
      this.fixUnreadMentionsCountIfNeeded({...options, slicedArray});
      return Promise.resolve();
    }

    let loadNextPromise = Promise.resolve();
    if(!isTopEnd && length < 25) {
      loadNextPromise = this.loadNextMentions(options);
    }

    return this.goToNextMentionPromises[key] = loadNextPromise.then(() => {
      const last = slicedArray.last;
      const mid = last && last[last.length - 1];
      if(mid) {
        slicedArray.delete(mid);
        return mid;
      } else {
        this.fixUnreadMentionsCountIfNeeded({...options, slicedArray});
      }
    }).finally(() => {
      delete this.goToNextMentionPromises[key];
    });
  }

  private loadNextMentions(options: GetUnreadMentionsOptions) {
    const {peerId} = options;
    const slicedArray = this.unreadMentions[this.getUnreadMentionsKey(options)];
    const maxId = slicedArray.first[0] || 1;

    const backLimit = 50;
    const addOffset = -backLimit;
    const limit = backLimit;
    return this.getUnreadMentions({...options, offsetId: maxId, addOffset, limit})
    .then((messages) => {
      this.mergeHistoryResult({
        slicedArray,
        historyResult: messages,
        offsetId: maxId === 1 ? 0 : maxId,
        limit,
        addOffset,
        peerId
      });
    });
  }

  private getUnreadMentions({
    peerId,
    offsetId,
    addOffset,
    limit,
    maxId = 0,
    minId = 0,
    threadId,
    isReaction
  }: GetUnreadMentionsOptions & {
    offsetId: number,
    addOffset: number,
    limit: number,
    maxId?: number,
    minId?: number
  }) {
    return this.apiManager.invokeApiSingleProcess({
      method: isReaction ? 'messages.getUnreadReactions' : 'messages.getUnreadMentions',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        offset_id: getServerMessageId(offsetId),
        add_offset: addOffset,
        limit,
        max_id: getServerMessageId(maxId),
        min_id: getServerMessageId(minId),
        top_msg_id: threadId ? getServerMessageId(threadId) : undefined
      },
      processResult: (messagesMessages) => {
        assumeType<Exclude<MessagesMessages, MessagesMessages.messagesMessagesNotModified>>(messagesMessages);
        this.saveApiResult(messagesMessages);

        return messagesMessages;
      }
    });
  }

  public readMessages(peerId: PeerId, msgIds: number[]) {
    if(DO_NOT_READ_HISTORY) {
      return Promise.resolve();
    }

    if(!msgIds.length) {
      return Promise.resolve();
    }

    msgIds = msgIds.map((mid) => getServerMessageId(mid));
    let promise: Promise<any>, update: Update.updateChannelReadMessagesContents | Update.updateReadMessagesContents;
    if(peerId.isAnyChat() && this.appPeersManager.isChannel(peerId)) {
      const channelId = peerId.toChatId();

      update = {
        _: 'updateChannelReadMessagesContents',
        channel_id: channelId,
        messages: msgIds
      };

      promise = this.apiManager.invokeApi('channels.readMessageContents', {
        channel: this.appChatsManager.getChannelInput(channelId),
        id: msgIds
      });
    } else {
      update = {
        _: 'updateReadMessagesContents',
        messages: msgIds,
        pts: undefined,
        pts_count: undefined
      };

      promise = this.apiManager.invokeApi('messages.readMessageContents', {
        id: msgIds
      }).then((affectedMessages) => {
        (update as Update.updateReadMessagesContents).pts = affectedMessages.pts;
        (update as Update.updateReadMessagesContents).pts_count = affectedMessages.pts_count;
        this.apiUpdatesManager.processLocalUpdate(update);
      });
    }

    this.apiUpdatesManager.processLocalUpdate(update);

    return promise;
  }

  public async readMentions(peerId: PeerId, threadId?: number, isReaction?: boolean): Promise<boolean> {
    if(DO_NOT_READ_HISTORY) {
      return;
    }

    return this.apiManager.invokeApi(isReaction ? 'messages.readReactions' : 'messages.readMentions', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      top_msg_id: threadId ? getServerMessageId(threadId) : undefined
    }).then((affectedHistory) => {
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updatePts',
        pts: affectedHistory.pts,
        pts_count: affectedHistory.pts_count
      });

      if(!affectedHistory.offset) {
        const dialog = this.dialogsStorage.getAnyDialog(peerId, threadId) as Dialog | ForumTopic;
        this.modifyCachedMentionsAndSave({
          peerId,
          threadId,
          mid: undefined,
          ...(isReaction ? {addReaction: -dialog.unread_reactions_count} : {addMention: -dialog.unread_mentions_count})
        });
        return true;
      }

      return this.readMentions(peerId, threadId, isReaction);
    });
  }

  public toggleHistoryKeySubscription(historyKey: HistoryStorageKey, subscribe: boolean) {
    if(!historyKey) {
      return;
    }

    const previous = this.historyMaxIdSubscribed.get(historyKey) || 0;
    if(subscribe) {
      this.historyMaxIdSubscribed.set(historyKey, previous + 1);
    } else {
      if(previous) {
        if(previous === 1) this.historyMaxIdSubscribed.delete(historyKey);
        this.historyMaxIdSubscribed.set(historyKey, previous - 1);
      }

      if(!this.historyMaxIdSubscribed.get(historyKey)) {
        delete this.searchesStorage[historyKey];
      }
    }
  }

  public getDetailsForChannelJoinedService(peerId: PeerId, historyStorage: HistoryStorage, slice?: SlicedArray<number>['slice']) {
    if(peerId.isUser() || historyStorage.channelJoinedMid) {
      return;
    }

    const chatId = peerId.toChatId();
    const chat = this.appChatsManager.getChat(chatId);
    const date = (chat as Chat.channel)?.date;
    if(!date || !this.appChatsManager.isInChat(chatId) || !(chat as Chat.channel).pFlags.broadcast) {
      return;
    }

    const slices = slice ? [slice] : historyStorage.history.slices;
    for(const slice of slices) {
      let newerMessage: Message, olderMessage: Message;

      for(const mid of slice) {
        const message = this.getMessageByPeer(peerId, mid);
        if(!message) {
          this.log.error('no message from historyStorage?', peerId, historyStorage, slice, mid);
          debugger;
          continue;
        }

        if(message.date >= date) {
          newerMessage = message;
        } else {
          olderMessage = message;
          break;
        }
      }

      const isNewerGood = newerMessage || slice.isEnd(SliceEnd.Bottom);
      const isOlderGood = olderMessage || slice.isEnd(SliceEnd.Top);
      if(isNewerGood && isOlderGood) {
        return {
          date,
          slice,
          newerMessage,
          olderMessage
        };
      }
    }
  }

  public insertChannelJoinedService(peerId: PeerId, historyStorage: HistoryStorage, _slice?: SlicedArray<number>['slice']) {
    const details = this.getDetailsForChannelJoinedService(peerId, historyStorage, _slice);
    if(!details) {
      return false;
    }

    const {date, slice, newerMessage, olderMessage} = details;

    const mid = this.generateTempMessageId(peerId, olderMessage?.mid || newerMessage.mid - 1);
    this.log('will insert channel joined', peerId, mid, newerMessage?.mid, olderMessage?.mid, slice);

    const message: Message.messageService = {
      _: 'messageService',
      pFlags: {
        is_single: true,
        out: true
      },
      id: mid,
      date,
      from_id: {_: 'peerUser', user_id: NULL_PEER_ID},
      peer_id: this.appPeersManager.getOutputPeer(peerId),
      action: {
        _: 'messageActionChannelJoined'
      }
    };
    this.saveMessages([message], {isOutgoing: true});

    // const insertSlice = historyStorage.originalInsertSlice || historyStorage.history.insertSlice.bind(historyStorage.history);
    // insertSlice([newerMessage?.mid, message.mid, olderMessage?.mid].filter(Boolean));
    insertInDescendSortedArray(slice, mid);

    historyStorage.maxId = Math.max(historyStorage.maxId, message.mid);
    historyStorage.channelJoinedMid = message.mid;
    if(historyStorage.originalInsertSlice) {
      historyStorage.history.insertSlice = historyStorage.originalInsertSlice;
      delete historyStorage.originalInsertSlice;
    }

    const dialog = this.getDialogOnly(peerId);
    if(dialog && dialog.top_message < message.mid) {
      this.setDialogTopMessage(message, dialog);
    }

    this.handleNewMessage(message);

    return true;
  }

  private processNewHistoryStorage(peerId: PeerId, historyStorage: HistoryStorage) {
    if(this.appPeersManager.isBroadcast(peerId) && !historyStorage.originalInsertSlice) {
      historyStorage.originalInsertSlice = historyStorage.history.insertSlice.bind(historyStorage.history);
      historyStorage.history.insertSlice = (...args) => {
        const slice = historyStorage.originalInsertSlice(...args);
        if(slice) {
          this.insertChannelJoinedService(peerId, historyStorage, slice);
        }

        return slice;
      };
    }

    return historyStorage;
  }

  public createHistoryStorage(options: Parameters<typeof getHistoryStorageKey>[0]): HistoryStorage {
    const self = this;
    return {
      history: new SlicedArray(),
      type: options.type,
      key: getHistoryStorageKey(options),
      wasFetched: false,
      _maxId: undefined,
      _count: null,
      get count() {
        return this._count;
      },
      set count(count) {
        this._count = count;
        if(self.historyMaxIdSubscribed.has(this.key)) {
          self.rootScope.dispatchEvent('history_count', {historyKey: this.key, count});
        }
      },
      get maxId() {
        const maxId = this._maxId;
        if(maxId) {
          return maxId;
        }

        const first = this.history.first;
        if(first.isEnd(SliceEnd.Bottom)) {
          return first[0];
        }
      },
      set maxId(maxId) {
        this._maxId = maxId;
      }
    };
  }

  public getHistoryStorage(peerId: PeerId, threadId?: number) {
    if(threadId) {
      // threadId = this.getLocalMessageId(threadId);
      return (this.threadsStorage[peerId] ??= {})[threadId] ??= this.createHistoryStorage({type: 'replies', peerId, threadId});
    }

    return this.historiesStorage[peerId] ??= this.processNewHistoryStorage(peerId, this.createHistoryStorage({type: 'history', peerId}));
  }

  public getHistoryStorageTransferable(options: RequestHistoryOptions & {
    backLimit?: number,
    historyStorage?: HistoryStorage
  }) {
    this.processRequestHistoryOptions(options);
    const historyStorage = options.historyStorage;
    const {
      count,
      history,
      searchHistory,
      maxId,
      readMaxId,
      readOutboxMaxId,
      maxOutId,
      replyMarkup
    } = historyStorage;

    return {
      count,
      history: undefined as HistoryStorage,
      historySerialized: history.toJSON(),
      searchHistory: undefined as HistoryStorage,
      searchHistorySerialized: searchHistory?.toJSON(),
      maxId,
      readMaxId,
      readOutboxMaxId,
      maxOutId,
      replyMarkup
    };
  }

  private getNotifyPeerSettings(peerId: PeerId, threadId?: number) {
    const inputNotifyPeer = this.appPeersManager.getInputNotifyPeerById({peerId, ignorePeerId: true, threadId});
    return Promise.all([
      this.appNotificationsManager.getNotifyPeerTypeSettings(),
      this.appNotificationsManager.getNotifySettings(inputNotifyPeer)
    ]).then(([_, peerTypeNotifySettings]) => {
      return {
        muted: this.appNotificationsManager.isPeerLocalMuted({peerId, respectType: true, threadId}),
        peerTypeNotifySettings
      };
    });
  }

  private handleNotifications = () => {
    ctx.clearTimeout(this.notificationsHandlePromise);
    this.notificationsHandlePromise = undefined;

    // var timeout = $rootScope.idle.isIDLE && StatusManager.isOtherDeviceActive() ? 30000 : 1000;
    // const timeout = 1000;

    for(const key in this.notificationsToHandle) {
      const [peerId, threadId] = key.split('_');
      // if(rootScope.peerId === peerId && !rootScope.idle.isIDLE) {
      // continue;
      // }

      const notifyPeerToHandle = this.notificationsToHandle[key];
      this.getNotifyPeerSettings(peerId.toPeerId(), threadId ? +threadId : undefined)
      .then(({muted, peerTypeNotifySettings}) => {
        const topMessage = notifyPeerToHandle.topMessage;
        if((muted && !topMessage.pFlags.mentioned) || !topMessage.pFlags.unread) {
          return;
        }

        // setTimeout(() => {
        if(topMessage.pFlags.unread) {
          this.notifyAboutMessage(topMessage, {
            fwdCount: notifyPeerToHandle.fwdCount,
            peerTypeNotifySettings
          });
        }
        // }, timeout);
      });
    }

    this.notificationsToHandle = {};
  };

  public getUpdateAfterReloadKey(peerId: PeerId, threadOrSavedId?: number) {
    return peerId + (threadOrSavedId ? '_' + threadOrSavedId : '');
  }

  private handleNewUpdateAfterReload(peerId: PeerId, update: Update, threadOrSavedId?: number) {
    const set = this.newUpdatesAfterReloadToHandle[this.getUpdateAfterReloadKey(peerId, threadOrSavedId)] ??= new Set();
    if(set.has(update)) {
      this.log.error('here we go again', peerId);
      return;
    }

    (update as any).ignoreExisting = true;
    set.add(update);
    this.scheduleHandleNewDialogs(peerId, threadOrSavedId);
  }

  private updateSlowModeOnNewMessage(message: MyMessage) {
    const {peerId} = message;
    if(message.pFlags.out && !peerId.isUser()) {
      const chatId = peerId.toChatId();
      this.appProfileManager.modifyCachedFullChat<ChatFull.channelFull>(chatId, (chatFull) => {
        const chat = this.appChatsManager.getChat(chatId) as Chat.channel;
        if(!(chatFull.slowmode_seconds && !chat.admin_rights)) {
          return false;
        }
        chatFull.slowmode_next_send_date = message.date + chatFull.slowmode_seconds;
      });
    }
  }

  public hasOutgoingMessage(peerId: PeerId) {
    for(const randomId in this.pendingByRandomId) {
      if(this.pendingByRandomId[randomId].peerId === peerId) {
        return true;
      }
    }

    return false;
  }

  private onUpdateMessageId = (update: Update.updateMessageID) => {
    const randomId = update.random_id;
    const pendingData = this.pendingByRandomId[randomId];
    if(!pendingData) {
      return;
    }

    const {peerId} = pendingData;
    const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
    const mid = this.appMessagesIdsManager.generateMessageId(update.id, channelId);
    this.pendingByMessageId[mid] = randomId;
    // const {storage} = pendingData;
    // const message = this.getMessageFromStorage(storage, mid);
    // if(message) { // if message somehow already exists
    //   this.checkPendingMessage(message);
    // }
  };

  private onUpdateNewMessage = (update: Update.updateNewDiscussionMessage | Update.updateNewMessage | Update.updateNewChannelMessage) => {
    const message = update.message as MyMessage;
    const peerId = this.getMessagePeer(message);
    const storage = this.getHistoryMessagesStorage(peerId);

    // * local update
    const isLocalThreadUpdate = update._ === 'updateNewDiscussionMessage';

    // * temporary save the message for info (peerId, reply mids...)
    this.saveMessages([message], {storage: this.createMessageStorage(peerId, 'history')});

    // * check if sent message is already in storage
    // const oldMessage = this.getMessageFromStorage(storage, message.mid);
    // if(
    //   (message as Message.message).pFlags.is_outgoing &&
    //   oldMessage &&
    //   !(oldMessage as Message.message).pFlags.is_outgoing
    // ) {
    //   this.checkPendingMessage(message);
    //   return;
    // }

    const isForum = this.appPeersManager.isForum(peerId);
    const threadKey = this.getThreadKey(message);
    const threadId = threadKey ? +threadKey.split('_')[1] : undefined;

    const dialog = this.dialogsStorage.getAnyDialog(peerId, isLocalThreadUpdate ? threadId : undefined);


    if((!dialog || this.reloadConversationsPeers.has(peerId)) && !isLocalThreadUpdate) {
      let good = true;
      if(peerId.isAnyChat()) {
        good = this.appChatsManager.isInChat(peerId.toChatId());
      }

      if(good) {
        this.handleNewUpdateAfterReload(peerId, update);
        return;
      }

      // return;
    }

    if(threadId && !isLocalThreadUpdate) {
      const threadStorage = this.threadsStorage[peerId]?.[threadId];
      const update = {
        _: 'updateNewDiscussionMessage',
        message
      } as Update.updateNewDiscussionMessage;

      if(this.appChatsManager.isForum(peerId.toChatId()) && !this.dialogsStorage.getForumTopic(peerId, threadId)) {
        // this.dialogsStorage.getForumTopicById(peerId, threadId);
        this.handleNewUpdateAfterReload(peerId, update, threadId);
      } else if(peerId === this.appPeersManager.peerId && !this.dialogsStorage.getAnyDialog(peerId, threadId)) {
        this.handleNewUpdateAfterReload(peerId, update, threadId);
      } else if(threadStorage) {
        this.onUpdateNewMessage(update);
      }
    }

    if(message._ === 'messageService') {
      const {action} = message;
      if(action._ === 'messageActionPaymentSent' && message.reply_to) {
        const replyTo = message.reply_to as MessageReplyHeader.messageReplyHeader;
        this.rootScope.dispatchEvent('payment_sent', {
          peerId: replyTo.reply_to_peer_id ?
            this.appPeersManager.getPeerId(replyTo.reply_to_peer_id) :
            message.peerId,
          mid: message.reply_to_mid,
          receiptMessage: message
        });
      }

      if(action._ === 'messageActionTopicEdit' && !isLocalThreadUpdate) {
        const topic = this.dialogsStorage.getForumTopic(peerId, threadId);
        if(!topic) {
          this.dialogsStorage.getForumTopicById(peerId, threadId);
        } else {
          const oldTopic = copy(topic);

          if(action.title !== undefined) {
            topic.title = action.title;
          }

          if(action.closed !== undefined) {
            setBooleanFlag(topic.pFlags, 'closed', action.closed);
          }

          if(action.hidden !== undefined) {
            setBooleanFlag(topic.pFlags, 'hidden', action.hidden);
          }

          if(action.icon_emoji_id !== undefined) {
            topic.icon_emoji_id = action.icon_emoji_id;
          }

          this.scheduleHandleNewDialogs(peerId, topic);

          this.dialogsStorage.processTopicUpdate(topic, oldTopic);
        }
      }

      if(action._ === 'messageActionPaidMessagesPrice' && this.appPeersManager.isBroadcast(message?.peerId)) {
        const chat = this.appChatsManager.getChat(message.peerId.toChatId());
        const linkedChatId = chat?._ === 'channel' && !chat?.pFlags?.monoforum && chat?.linked_monoforum_id;

        if(linkedChatId) this.reloadConversation(linkedChatId.toPeerId(true));
      }
    }

    /* if(update._ === 'updateNewChannelMessage') {
      const chat = appChatsManager.getChat(peerId.toChatId());
      if(chat.pFlags && (chat.pFlags.left || chat.pFlags.kicked)) {
        return;
      }
    } */

    this.saveMessages([message], {storage});
    // this.log.warn(dT(), 'message unread', message.mid, message.pFlags.unread)

    /* if((message as Message.message).grouped_id) {
      this.log('updateNewMessage', message);
    } */

    this.checkPendingMessage(message);
    const historyStorage = this.getHistoryStorage(peerId, isLocalThreadUpdate ? threadId : undefined);

    if(!isLocalThreadUpdate) {
      this.updateMessageRepliesIfNeeded(message, true);
    }

    // * so message can exist if reloadConversation came back earlier with mid
    const ignoreExisting: boolean = (update as any).ignoreExisting;
    const isExisting = !!historyStorage.history.findSlice(message.mid);
    this.updateMessageContextForInserting(message);
    if(isExisting) {
      if(!ignoreExisting) {
        return false;
      }
    } else {
      // * catch situation with disconnect. if message's id is lower than we already have (in bottom end slice), will sort it
      const firstSlice = historyStorage.history.first;
      if(firstSlice.isEnd(SliceEnd.Bottom)) {
        let i = 0;
        for(const length = firstSlice.length; i < length; ++i) {
          if(message.mid > firstSlice[i]) {
            break;
          }
        }

        firstSlice.splice(i, 0, message.mid);
      } else {
        historyStorage.history.unshift(message.mid);
      }

      if(historyStorage.count !== null) {
        ++historyStorage.count;
      }
    }

    if(!historyStorage.maxId || message.mid > historyStorage.maxId) {
      historyStorage.maxId = message.mid;
    }

    if(this.mergeReplyKeyboard(historyStorage, message)) {
      this.rootScope.dispatchEvent('history_reply_markup', {peerId});
    }

    const fromId = message.fromId;
    if(fromId.isUser() && !message.pFlags.out && message.from_id) {
      if(!(message as Message.message).pFlags.offline) {
        this.appUsersManager.forceUserOnline(fromId, message.date);
      }

      const action: SendMessageAction = {
        _: 'sendMessageCancelAction'
      };

      let update: Update.updateUserTyping | Update.updateChatUserTyping | Update.updateChannelUserTyping;
      if(peerId.isUser()) {
        update = {
          _: 'updateUserTyping',
          action,
          user_id: fromId
        };
      } else if(this.appPeersManager.isChannel(peerId)) {
        update = {
          _: 'updateChannelUserTyping',
          action,
          channel_id: peerId.toChatId(),
          from_id: this.appPeersManager.getOutputPeer(fromId),
          top_msg_id: threadId ? getServerMessageId(threadId) : undefined
        };
      } else {
        update = {
          _: 'updateChatUserTyping',
          action,
          chat_id: peerId.toChatId(),
          from_id: this.appPeersManager.getOutputPeer(fromId)
        };
      }

      this.apiUpdatesManager.processLocalUpdate(update);
    }

    if(!isLocalThreadUpdate) {
      this.updateSlowModeOnNewMessage(message);
    }

    // commented to render the message if it's been sent faster than history_append came to main thread
    // if(!pendingMessage) {
    if(!isLocalThreadUpdate) {
      this.handleNewMessage(message);
    }
    // }

    const isTopic = isForumTopic(dialog);
    const isSaved = isSavedDialog(dialog);
    if((isLocalThreadUpdate && !isTopic && !isSaved) || !dialog) {
      return;
    }

    const inboxUnread = !message.pFlags.out && message.pFlags.unread;

    {
      if(inboxUnread && message.mid > dialog.top_message && !isSaved) {
        const releaseUnreadCount = this.dialogsStorage.prepareDialogUnreadCountModifying(dialog);

        ++dialog.unread_count;
        if(isMentionUnread(message)) {
          ++dialog.unread_mentions_count;
          this.modifyCachedMentions({peerId, mid: message.mid, add: true, threadId: isTopic ? threadId : undefined});
        }

        releaseUnreadCount();
      }

      if(message.mid >= dialog.top_message) {
        this.setDialogTopMessage(message, dialog);
      }
    }

    if(((!isLocalThreadUpdate && !isForum) || isTopic) && inboxUnread) {
      const notifyPeer = threadKey || peerId;
      const notifyPeerToHandle = this.notificationsToHandle[notifyPeer] ??= {
        fwdCount: 0,
        fromId: NULL_PEER_ID
      };

      if(notifyPeerToHandle.fromId !== fromId) {
        notifyPeerToHandle.fromId = fromId;
        notifyPeerToHandle.fwdCount = 0;
      }

      if((message as Message.message).fwd_from) {
        ++notifyPeerToHandle.fwdCount;
      }

      notifyPeerToHandle.topMessage = message;

      this.notificationsHandlePromise ??= ctx.setTimeout(this.handleNotifications, 0);
    }

    const isMonoforumMessage = message.peerId !== this.rootScope.myId && message.saved_peer_id;

    if(isMonoforumMessage) {
      this.monoforumDialogsStorage.checkLastMessageForExistingDialog(message);
    }
  };

  private onUpdateMessageReactions = (update: Update.updateMessageReactions) => {
    const {peer, msg_id, top_msg_id, saved_peer_id, reactions} = update;
    const channelId = (peer as Peer.peerChannel).channel_id;
    const mid = this.appMessagesIdsManager.generateMessageId(msg_id, channelId);
    const threadId = this.appMessagesIdsManager.generateMessageId(top_msg_id, channelId);
    const peerId = this.appPeersManager.getPeerId(peer);
    const monoforumThreadId = this.getMonoforumThreadId(peerId, saved_peer_id);
    const message: MyMessage = this.getMessageByPeer(peerId, mid);

    // TODO: Check if we can avoid refetching the dialog in case we have enough messages to measure the changes ourselves
    if(monoforumThreadId) this.monoforumDialogsStorage.updateDialogIfExists(peerId, monoforumThreadId);

    if(!message) {
      this.fixDialogUnreadMentionsIfNoMessage({peerId, threadId, force: true});
      return;
    }

    const modifyUnreadReactions = (add: boolean) => {
      this.modifyCachedMentionsAndSave({
        peerId,
        mid: message.mid,
        threadId,
        addReaction: add
      });
    };

    const recentReactions = reactions?.recent_reactions;
    const previousReactions = message.reactions;
    const previousRecentReactions = previousReactions?.recent_reactions;
    const isUnread = recentReactions?.some((reaction) => reaction.pFlags.unread);
    const wasUnread = !!previousRecentReactions?.some((reaction) => reaction.pFlags.unread);
    if(recentReactions?.length && message.pFlags.out) { // * if user added a reaction to our message
      const recentReaction = recentReactions[recentReactions.length - 1];
      if(
        this.appPeersManager.getPeerId(recentReaction.peer_id) !== this.appPeersManager.peerId && (
          !previousRecentReactions ||
          previousRecentReactions.length <= recentReactions.length
        ) && (
          !previousRecentReactions ||
          !deepEqual(recentReaction, previousRecentReactions[previousRecentReactions.length - 1])
        ) && isUnread !== wasUnread
      ) {
        this.getNotifyPeerSettings(peerId).then(({muted, peerTypeNotifySettings}) => {
          if(/* muted ||  */!peerTypeNotifySettings.show_previews) return;
          this.notifyAboutMessage(message, {
            peerReaction: recentReaction,
            peerTypeNotifySettings
          });
        });
      }
    }

    if(message.pFlags.out && isUnread !== wasUnread) {
      modifyUnreadReactions(isUnread);
    }

    const key = message.peerId + '_' + message.mid;
    this.pushBatchUpdate('messages_reactions', this.batchUpdateReactions, key, () => copy(message.reactions));

    this.modifyMessage(message, (message) => {
      message.reactions = reactions;
    }, undefined, update.local);
  };

  private onUpdateDialogUnreadMark = (update: Update.updateDialogUnreadMark) => {
    // this.log('updateDialogUnreadMark', update);
    const peerId = this.appPeersManager.getPeerId((update.peer as DialogPeer.dialogPeer).peer);
    const monoforumThreadId = this.getMonoforumThreadId(peerId, update.saved_peer_id);

    const dialog = this.getDialogOnly(peerId);

    if(!dialog) {
      this.scheduleHandleNewDialogs(peerId);
    } else if(monoforumThreadId) {
      this.monoforumDialogsStorage.updateDialogUnreadMark({
        parentPeerId: peerId,
        peerId: monoforumThreadId,
        unread: !!update?.pFlags?.unread
      });
    } else {
      const releaseUnreadCount = this.dialogsStorage.prepareDialogUnreadCountModifying(dialog);

      if(!update.pFlags.unread) {
        delete dialog.pFlags.unread_mark;
      } else {
        dialog.pFlags.unread_mark = true;
      }

      releaseUnreadCount();
      this.dialogsStorage.setDialogToState(dialog);
      this.rootScope.dispatchEvent('dialogs_multiupdate', new Map([[peerId, {dialog}]]));
    }
  };

  private onUpdateEditMessage = (update: Update.updateEditMessage | Update.updateEditChannelMessage) => {
    const message = update.message as MyMessage;
    const peerId = this.getMessagePeer(message);
    const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
    const mid = this.appMessagesIdsManager.generateMessageId(message.id, channelId);
    const storage = this.getHistoryMessagesStorage(peerId);
    if(!storage.has(mid)) {
      this.fixDialogUnreadMentionsIfNoMessage({peerId, threadId: getMessageThreadId(message, this.appPeersManager.isForum(peerId)), force: true});
      // this.fixDialogUnreadMentionsIfNoMessage(peerId);
      return;
    }

    // console.trace(dT(), 'edit message', message)

    const oldMessage: Message = this.getMessageFromStorage(storage, mid);
    const newMessage = this.modifyMessage(oldMessage, () => {
      this.saveMessages([message], {storage});
      const newMessage: Message = this.getMessageFromStorage(storage, mid);
      return newMessage;
    }, false, true);

    this.handleEditedMessage(oldMessage, newMessage, storage);

    const dialog = this.getDialogOnly(peerId);

    // if sender erased mention
    /* if(dialog.unread_mentions_count && (oldMessage as Message.message)?.pFlags?.mentioned && !message.pFlags.mentioned) {
      --dialog.unread_mentions_count;
      this.modifyCachedMentions(peerId, mid, false);
    } */

    const isTopMessage = dialog?.top_message === mid;
    if((message as Message.messageService).clear_history) {
      if(isTopMessage) {
        this.rootScope.dispatchEvent('dialog_flush', {peerId, dialog});
      }

      return;
    }

    let dispatchEditEvent = true;
    // no sense in dispatching message_edit since only reactions have changed
    if(oldMessage && !deepEqual(oldMessage.reactions, (newMessage as Message.message | Message.messageService).reactions)) {
      const newReactions = (newMessage as Message.message | Message.messageService).reactions;
      (newMessage as Message.message | Message.messageService).reactions = oldMessage.reactions;
      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateMessageReactions',
        peer: this.appPeersManager.getOutputPeer(peerId),
        msg_id: message.id,
        reactions: newReactions
      });

      dispatchEditEvent = false;
    }

    dispatchEditEvent && this.rootScope.dispatchEvent('message_edit', {
      storageKey: storage.key,
      peerId,
      mid,
      message
    });

    if(isTopMessage) {
      this.dialogsStorage.setDialogToState(dialog);
    }

    const map: BroadcastEvents['dialogs_multiupdate'] = new Map();
    const getUpdateCache = () => {
      let cache = map.get(peerId);
      if(!cache) {
        map.set(peerId, cache = {});
      }

      return cache;
    };

    if((isTopMessage || (message as Message.message).grouped_id) && dialog) {
      getUpdateCache().dialog = dialog;
    }

    const threadKey = this.getThreadKey(message);
    if(threadKey) {
      const threadOrSavedId = +threadKey.split('_')[1];
      const dialog = this.dialogsStorage.getAnyDialog(peerId, threadOrSavedId);
      if(dialog) {
        (getUpdateCache()[isSavedDialog(dialog) ? 'saved' : 'topics'] ??= new Map()).set(threadOrSavedId, dialog);
      }
    }

    if(map.size) {
      this.rootScope.dispatchEvent('dialogs_multiupdate', map);
    }

    if(message.saved_peer_id && peerId !== this.rootScope.myId) {
      const monoforumThreadId = this.getMonoforumThreadId(peerId, message.saved_peer_id);
      const monoforumDialog = this.monoforumDialogsStorage.getDialogByParent(peerId, monoforumThreadId);

      if(monoforumDialog?.top_message === mid)
        this.rootScope.dispatchEvent('monoforum_dialogs_update', {dialogs: [monoforumDialog]})
    }
  };

  private onUpdateReadHistory = (update: Update.updateReadChannelDiscussionInbox | Update.updateReadChannelDiscussionOutbox
    | Update.updateReadHistoryInbox | Update.updateReadHistoryOutbox
    | Update.updateReadChannelInbox | Update.updateReadChannelOutbox
    | Update.updateReadMonoForumInbox | Update.updateReadMonoForumOutbox) => {
    const channelId = (update as Update.updateReadChannelInbox).channel_id;
    const maxId = this.appMessagesIdsManager.generateMessageId((update as Update.updateReadChannelInbox).max_id || (update as Update.updateReadChannelDiscussionInbox).read_max_id, channelId);
    const threadId = this.appMessagesIdsManager.generateMessageId((update as Update.updateReadChannelDiscussionInbox).top_msg_id, channelId);
    const peerId = channelId ? channelId.toPeerId(true) : this.appPeersManager.getPeerId((update as Update.updateReadHistoryInbox).peer);
    const monoforumThreadId = this.getMonoforumThreadId(peerId, (update as Update.updateReadMonoForumInbox).saved_peer_id);

    const isOut = update._ === 'updateReadHistoryOutbox' ||
      update._ === 'updateReadChannelOutbox' ||
      update._ === 'updateReadChannelDiscussionOutbox' ||
      update._ === 'updateReadMonoForumOutbox' ? true : undefined;

    const isForum = channelId ? this.appChatsManager.isForum(channelId) : false;
    const isMonoforum = channelId ? this.appChatsManager.isMonoforum(channelId) : false;
    const storage = this.getHistoryMessagesStorage(peerId);
    const history = getObjectKeysAndSort(storage, 'desc');
    const foundDialog = threadId && isForum ?
      this.dialogsStorage.getForumTopic(peerId, threadId) :
      this.getDialogOnly(peerId);
    const stillUnreadCount = (update as Update.updateReadChannelInbox).still_unread_count;
    let newUnreadCount = 0;
    let newUnreadMentionsCount = 0;
    let foundAffected = false;

    // this.log.warn(dT(), 'read', peerId, isOut ? 'out' : 'in', maxId)

    const historyStorage = this.getHistoryStorage(peerId, threadId || monoforumThreadId);

    if(peerId.isUser() && isOut) {
      this.appUsersManager.forceUserOnline(peerId.toUserId());
    }

    if(threadId) {
      const repliesKey = this.threadsToReplies[peerId + '_' + threadId];
      if(repliesKey) {
        const [peerId, mid] = repliesKey.split('_');
        this.updateMessage(peerId.toPeerId(), +mid, 'replies_updated');
      }
    }

    const releaseUnreadCount = foundDialog && this.dialogsStorage.prepareDialogUnreadCountModifying(foundDialog);
    const readMaxId = this.getReadMaxIdIfUnread(peerId, threadId || monoforumThreadId);
    const monoforumDialogsTouched: Record<PeerId, MonoforumDialog> = {};

    for(let i = 0, length = history.length; i < length; i++) {
      const mid = history[i];
      if(mid > maxId) {
        continue;
      }

      const message: MyMessage = storage.get(mid);

      if(message.pFlags.out !== isOut) {
        continue;
      }

      const messageThreadId = getMessageThreadId(message, isForum);


      if(threadId && messageThreadId !== threadId ||
        monoforumThreadId && messageThreadId !== monoforumThreadId) {
        continue;
      }

      const isUnread = message.pFlags.unread || (readMaxId && readMaxId < mid);

      if(!isUnread) {
        break;
      }

      // this.log.warn('read', messageId, isUnread, message)
      this.modifyMessage(message, (message) => {
        delete message.pFlags.unread;
      }, storage, true);
      foundAffected ||= true;

      if(!message.pFlags.out && foundDialog) {
        if(stillUnreadCount === undefined) {
          newUnreadCount = --foundDialog.unread_count;
        }

        if(isMentionUnread(message)) {
          newUnreadMentionsCount = --foundDialog.unread_mentions_count;
          this.modifyCachedMentions({peerId, mid: message.mid, add: false});
        }
      }

      if(isMonoforum) {
        const monoforumDialog = this.monoforumDialogsStorage.getDialogByParent(peerId, messageThreadId);
        if(!message.pFlags.out && monoforumDialog) {
          monoforumDialogsTouched[monoforumDialog.peerId] = monoforumDialog;
          increment(monoforumDialog, 'unread_count', -1);
          if(isMentionUnread(message)) {
            increment(monoforumDialog, 'unread_reactions_count', -1);
          }
        }
      }

      this.rootScope.dispatchEvent('notification_cancel', `msg_${this.getAccountNumber()}_${peerId}_${mid}`);
    }

    if(isOut) historyStorage.readOutboxMaxId = maxId;
    else historyStorage.readMaxId = maxId;

    if(foundDialog) {
      if(isOut) foundDialog.read_outbox_max_id = maxId;
      else foundDialog.read_inbox_max_id = maxId;

      if(!isOut) {
        let setCount: number;
        if(stillUnreadCount !== undefined) {
          setCount = stillUnreadCount;
        } else if(
          newUnreadCount < 0 ||
          maxId >= foundDialog.top_message ||
          !readMaxId
        ) {
          setCount = 0;
        } else if(newUnreadCount && foundDialog.top_message > maxId) {
          setCount = newUnreadCount;
        }

        if(setCount !== undefined) {
          foundDialog.unread_count = setCount;
        }

        if(newUnreadMentionsCount < 0 || !foundDialog.unread_count) {
          foundDialog.unread_mentions_count = 0;
        }
      }

      releaseUnreadCount?.();

      this.dialogsStorage.processDialogForFilters(foundDialog);

      this.rootScope.dispatchEvent('dialog_unread', {peerId, dialog: foundDialog});
      this.dialogsStorage.setDialogToState(foundDialog);

      if(!foundAffected && stillUnreadCount === undefined && !isOut && foundDialog.unread_count) {
        if(isForumTopic(foundDialog)) {
          this.dialogsStorage.getForumTopicById(peerId, threadId);
        } else  {
          this.reloadConversation(peerId);
        }
      }
    }

    if(foundAffected) {
      this.rootScope.dispatchEvent('messages_read');
    }

    if(!threadId && channelId) {
      const threadKeyPart = peerId + '_';
      for(const threadKey in this.threadsToReplies) {
        if(threadKey.indexOf(threadKeyPart) === 0) {
          const [peerId, mid] = this.threadsToReplies[threadKey].split('_');
          this.rootScope.dispatchEvent('replies_updated', this.getMessageByPeer(peerId.toPeerId(), +mid) as Message.message);
        }
      }
    }

    const monoforumDialogs = Object.values(monoforumDialogsTouched);
    if(monoforumDialogs.length) {
      this.rootScope.dispatchEvent('monoforum_dialogs_update', {dialogs: monoforumDialogs});
    }
  };

  private onUpdateReadMessagesContents = (update: Update.updateChannelReadMessagesContents | Update.updateReadMessagesContents) => {
    const channelId = (update as Update.updateChannelReadMessagesContents).channel_id;
    const topMsgId = (update as Update.updateChannelReadMessagesContents).top_msg_id;
    const threadId = topMsgId ? this.appMessagesIdsManager.generateMessageId(topMsgId, channelId) : undefined;
    const mids = (update as Update.updateReadMessagesContents).messages.map((id) => this.appMessagesIdsManager.generateMessageId(id, channelId));
    const peerId = channelId ? channelId.toPeerId(true) : this.findPeerIdByMids(mids);
    for(let i = 0, length = mids.length; i < length; ++i) {
      const mid = mids[i];
      const message: MyMessage = this.getMessageByPeer(peerId, mid);
      if(message) {
        if(message.pFlags.media_unread) {
          this.modifyMessage(message, (message) => {
            delete message.pFlags.media_unread;
          });

          if(!message.pFlags.out && isMentionUnread(message)) {
            this.modifyCachedMentionsAndSave({peerId, mid, addMention: false});
          }
        }

        if(getUnreadReactions(message)) {
          const newReactions = copy((message as Message.message).reactions);
          newReactions.recent_reactions.forEach((reaction) => {
            delete reaction.pFlags.unread;
          });
          this.apiUpdatesManager.processLocalUpdate({
            _: 'updateMessageReactions',
            peer: this.appPeersManager.getOutputPeer(peerId),
            msg_id: message.id,
            reactions: newReactions
          });
        }
      } else {
        this.fixDialogUnreadMentionsIfNoMessage({peerId, threadId});
        this.fixDialogUnreadMentionsIfNoMessage({peerId, threadId, isReaction: true});
      }
    }

    this.rootScope.dispatchEvent('messages_media_read', {peerId, mids});
  };

  private onUpdateChannelAvailableMessages = (update: Update.updateChannelAvailableMessages) => {
    const channelId = update.channel_id;
    const peerId = channelId.toPeerId(true);
    const history = this.getHistoryStorage(peerId).history.slice;
    const availableMinId = this.appMessagesIdsManager.generateMessageId(update.available_min_id, channelId);
    const messages = history.filter((mid) => mid <= availableMinId);

    (update as any as Update.updateDeleteChannelMessages).messages = messages;
    this.onUpdateDeleteMessages(update as any as Update.updateDeleteChannelMessages);
  };

  private onUpdateDeleteMessages = (update: Update.updateDeleteMessages | Update.updateDeleteChannelMessages) => {
    const channelId = (update as Update.updateDeleteChannelMessages).channel_id;
    const mids = (update as any as Update.updateDeleteChannelMessages).messages.map((id) => this.appMessagesIdsManager.generateMessageId(id, channelId));
    const peerId: PeerId = channelId ? channelId.toPeerId(true) : this.findPeerIdByMids(mids);

    if(!peerId) {
      return;
    }

    this.apiManager.clearCache('messages.getSearchCounters', (params) => {
      return this.appPeersManager.getPeerId(params.peer) === peerId;
    });

    const
      threadKeys = new Set<string>(),
      virtual = new Map<number, ForumTopic | SavedDialog>(),
      monoforumDialogs: MonoforumDialog[] = []
    ;

    for(const mid of mids) {
      const message = this.getMessageByPeer(peerId, mid);
      const threadKey = this.getThreadKey(message);
      if(!threadKey) {
        continue;
      }

      const threadId = +threadKey.split('_')[1];

      const monoforumDialog = this.monoforumDialogsStorage.getDialogByParent(peerId, threadId);
      monoforumDialog && monoforumDialogs.push(monoforumDialog);

      if(this.threadsStorage[peerId]?.[threadId]) {
        threadKeys.add(threadKey);

        const dialog = this.dialogsStorage.getAnyDialog(peerId, threadId) as ForumTopic | SavedDialog;
        dialog && virtual.set(threadId, dialog);
      }
    }

    const historyUpdated = this.handleDeletedMessages(
      peerId,
      this.getHistoryMessagesStorage(peerId),
      mids
    );

    const threadsStorages = Array.from(threadKeys).map((threadKey) => {
      const [peerId, mid] = threadKey.split('_');
      return this.getHistoryStorage(peerId.toPeerId(), +mid);
    });

    const historyStorages = [
      this.getHistoryStorage(peerId),
      ...threadsStorages
    ];
    historyStorages.forEach((historyStorage) => {
      for(const mid of historyUpdated.msgs) {
        historyStorage.history.delete(mid);
      }

      if(historyUpdated.count && historyStorage.count) {
        historyStorage.count = Math.max(0, historyStorage.count - historyUpdated.count);
      }
    });

    this.rootScope.dispatchEvent('history_delete', {peerId, msgs: historyUpdated.msgs});

    const dialogs: AnyDialog[] = [
      ...virtual.values()
    ];

    const dialog = this.getDialogOnly(peerId);
    if(dialog) {
      dialogs.unshift(dialog);
    }

    dialogs.forEach((dialog) => {
      const isTopic = isForumTopic(dialog);
      const isSaved = isSavedDialog(dialog);
      const _isDialog = isDialog(dialog);
      const affected = !!(historyUpdated.unreadMentions || historyUpdated.unread || historyUpdated.unreadReactions);
      const releaseUnreadCount = affected && this.dialogsStorage.prepareDialogUnreadCountModifying(dialog);

      if(!isSaved && historyUpdated.unread) {
        dialog.unread_count = Math.max(0, dialog.unread_count - historyUpdated.unread);
      }

      if(!isSaved && historyUpdated.unreadMentions) {
        dialog.unread_mentions_count = !dialog.unread_count ? 0 : Math.max(0, dialog.unread_mentions_count - historyUpdated.unreadMentions);
      }

      if(!isSaved && historyUpdated.unreadReactions) {
        dialog.unread_reactions_count = Math.max(0, dialog.unread_reactions_count - historyUpdated.unreadReactions);
      }

      if(affected) {
        releaseUnreadCount();

        if(!isSaved) { // ! WARNING, was `!isTopic` here
          this.rootScope.dispatchEvent('dialog_unread', {peerId, dialog});
        }
      }

      if(historyUpdated.msgs.has(dialog.top_message)) {
        const historyStorage = this.getHistoryStorage(dialog.peerId, _isDialog ? undefined : getDialogKey(dialog));
        const slice = historyStorage.history.first;
        if(slice.isEnd(SliceEnd.Bottom) && slice.length) {
          const mid = slice[0];
          const message = this.getMessageByPeer(peerId, mid);
          this.setDialogTopMessage(message, dialog);
        } else if(isTopic) {
          this.dialogsStorage.getForumTopicById(peerId, dialog.id);
        } else if(isSaved) {
          this.dialogsStorage.getSavedDialogById(dialog.savedPeerId);
        } else {
          this.reloadConversation(peerId);
        }
      }

      this.dialogsStorage.setDialogToState(dialog);
    });

    for(const {parentPeerId, peerId} of monoforumDialogs) {
      // TODO: Do not refetch if the top_message was not deleted or the new top_message is cached
      this.monoforumDialogsStorage.updateDialogsByPeerId({parentPeerId, ids: [peerId]});
    }
  };

  private onUpdateChannel = (update: Update.updateChannel) => {
    const channelId = update.channel_id;
    const peerId = channelId.toPeerId(true);
    const channel = this.appChatsManager.getChat(channelId) as Chat.channel;

    const needDialog = this.appChatsManager.isInChat(channelId);

    const canViewHistory = !!getPeerActiveUsernames(channel)[0] || !channel.pFlags.left;
    const hasHistory = this.historiesStorage[peerId] !== undefined;

    if(canViewHistory !== hasHistory) {
      delete this.historiesStorage[peerId];
      this.rootScope.dispatchEvent('history_forbidden', peerId);
    }

    const dialog = this.getDialogOnly(peerId);
    if(!!dialog !== needDialog) {
      if(needDialog) {
        this.reloadConversation(peerId);
      } else {
        this.dialogsStorage.dropDialogOnDeletion(peerId);
      }
    }

    this.rootScope.dispatchEvent('channel_update', channelId);
  };

  private onUpdateChannelReload = (update: Update.updateChannelReload) => {
    const peerId = update.channel_id.toPeerId(true);

    // if(this.appPeersManager.isForum(peerId)) {
    //   const cache = this.dialogsStorage.getForumTopicsCache(peerId);
    //   if(cache.topics.size) {

    //   }
    // }

    this.flushStoragesByPeerId(peerId);
    Promise.all([
      this.reloadConversation(peerId)
    ]).then(() => {
      this.rootScope.dispatchEvent('history_reload', peerId);
    });
  };

  private onUpdateChannelMessageViews = (update: Update.updateChannelMessageViews) => {
    const views = update.views;
    const peerId = update.channel_id.toPeerId(true);
    const mid = this.appMessagesIdsManager.generateMessageId(update.id, update.channel_id);
    const message = this.getMessageByPeer(peerId, mid) as Message.message;
    if(message?.views !== undefined && message.views < views) {
      this.modifyMessage(message, (message) => {
        message.views = views;
      });
      this.pushBatchUpdate('messages_views', this.batchUpdateViews, message.peerId + '_' + message.mid);
    }
  };

  private onUpdateServiceNotification = (update: Update.updateServiceNotification) => {
    // this.log('updateServiceNotification', update);
    if(update.pFlags?.popup) {
      this.rootScope.dispatchEvent('service_notification', update);
      return;
    }

    const fromId = SERVICE_PEER_ID;
    const peerId = fromId;
    const mid = this.generateTempMessageId(peerId);
    const message: Message.message = {
      _: 'message',
      id: mid,
      from_id: this.appPeersManager.getOutputPeer(fromId),
      peer_id: this.appPeersManager.getOutputPeer(peerId),
      pFlags: {unread: true},
      date: (update.inbox_date || tsNow(true)) + this.timeManager.getServerTimeOffset(),
      message: update.message,
      media: update.media,
      entities: update.entities
    };
    if(!this.appUsersManager.hasUser(fromId)) {
      this.appUsersManager.saveApiUsers([{
        _: 'user',
        id: fromId,
        pFlags: {verified: true},
        access_hash: '0',
        first_name: 'Telegram',
        phone: '42777'
      }]);
    }
    this.saveMessages([message], {isOutgoing: true});

    if(update.inbox_date) {
      this.pendingTopMsgs[peerId] = mid;
      this.onUpdateNewMessage({
        _: 'updateNewMessage',
        message,
        pts: undefined,
        pts_count: undefined
      });
    }
  };

  private onUpdatePinnedMessages = (update: Update.updatePinnedMessages | Update.updatePinnedChannelMessages) => {
    const channelId = update._ === 'updatePinnedChannelMessages' ? update.channel_id : undefined;
    const peerId = channelId ? channelId.toPeerId(true) : this.appPeersManager.getPeerId((update as Update.updatePinnedMessages).peer);

    const mids = update.messages.map((id) => this.appMessagesIdsManager.generateMessageId(id, channelId));
    const pinned = update.pFlags?.pinned;
    const storage = this.getHistoryMessagesStorage(peerId);
    const missingMessages = mids.filter((mid) => !storage.has(mid));
    const getMissingPromise = missingMessages.length && Promise.all(missingMessages.map((mid) => this.reloadMessages(peerId, mid))).catch(noop);
    callbackify(getMissingPromise, () => {
      let processMessage: (message: Message.message) => void;
      if(pinned) {
        processMessage = (message) => {
          message.pFlags.pinned = true;
        };
      } else {
        processMessage = (message) => {
          delete message.pFlags.pinned;
        };
      }

      for(const mid of mids) {
        const message = storage.get(mid) as Message.message;
        this.modifyMessage(message, (message) => {
          processMessage(message);
        }, storage);
      }

      this.resetPinnedMessagesCache(peerId, mids, pinned);
    });
  };

  private onUpdateNotifySettings = (update: Update.updateNotifySettings) => {
    const {peer, notify_settings} = update;
    const isTopic = peer._ === 'notifyForumTopic';
    const isPeerType = peer._ === 'notifyPeer' || isTopic;
    if(!isPeerType) {
      return;
    }

    const peerId = this.appPeersManager.getPeerId(peer.peer);
    const dialog = this.dialogsStorage.getAnyDialog(
      peerId,
      isTopic ? this.appMessagesIdsManager.generateMessageId(peer.top_msg_id, (peer.peer as Peer.peerChannel).channel_id) : undefined
    ) as Dialog | ForumTopic;
    if(!dialog) {
      return;
    }

    dialog.notify_settings = notify_settings;
    this.rootScope.dispatchEvent('dialog_notify_settings', dialog);
    this.dialogsStorage.setDialogToState(dialog);
  };

  private onUpdateNewScheduledMessage = (update: Update.updateNewScheduledMessage) => {
    const message = update.message as MyMessage;
    const peerId = this.getMessagePeer(message);

    const storage = this.scheduledMessagesStorage[peerId];
    if(!storage) {
      return;
    }

    const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
    const mid = this.appMessagesIdsManager.generateMessageId(message.id, channelId);

    const oldMessage = this.getMessageFromStorage(storage, mid);
    this.saveMessages([message], {storage, isScheduled: true});
    const newMessage = this.getMessageFromStorage(storage, mid);

    if(oldMessage) {
      this.handleEditedMessage(oldMessage, newMessage, storage);
      this.rootScope.dispatchEvent('message_edit', {storageKey: storage.key, peerId, mid: message.mid, message});
    } else {
      const pendingMessage = this.checkPendingMessage(message);
      if(!pendingMessage) {
        this.rootScope.dispatchEvent('scheduled_new', message as Message.message);
      }
    }
  };

  private onUpdateDeleteScheduledMessages = (update: Update.updateDeleteScheduledMessages) => {
    const channelId = (update.peer as Peer.peerChannel).channel_id;
    const peerId = this.appPeersManager.getPeerId(update.peer);

    const storage = this.scheduledMessagesStorage[peerId];
    if(storage) {
      const mids = update.messages.map((id) => this.appMessagesIdsManager.generateMessageId(id, channelId));
      this.handleDeletedMessages(peerId, storage, mids);

      this.rootScope.dispatchEvent('scheduled_delete', {peerId, mids});
    }
  };

  private onUpdateMessageExtendedMedia = (update: Update.updateMessageExtendedMedia) => {
    const channelId = (update.peer as Peer.peerChannel).channel_id;
    const peerId = this.appPeersManager.getPeerId(update.peer);
    const mid = this.appMessagesIdsManager.generateMessageId(update.msg_id, channelId);
    const storage = this.getHistoryMessagesStorage(peerId);
    if(!storage.has(mid)) {
      // this.fixDialogUnreadMentionsIfNoMessage(peerId);
      return;
    }

    const message = this.getMessageFromStorage(storage, mid) as Message.message;
    const messageMedia = message.media as MessageMedia.messageMediaInvoice | MessageMedia.messageMediaPaidMedia;
    const b = messageMedia.extended_media;
    const isArray = Array.isArray(b);
    const before = isArray ? b : [b];
    if(before.some((extendedMedia) => extendedMedia?._ === 'messageExtendedMedia')) {
      return;
    }

    messageMedia.extended_media = isArray ? update.extended_media : update.extended_media[0];
    this.onUpdateEditMessage({
      _: 'updateEditMessage',
      message,
      pts: 0,
      pts_count: 0
    });
  };

  private onUpdateTranscribedAudio = (update: Update.updateTranscribedAudio) => {
    const channelId = (update.peer as Peer.peerChannel).channel_id;
    const peerId = this.appPeersManager.getPeerId(update.peer);
    const text = update.text;
    const mid = this.appMessagesIdsManager.generateMessageId(update.msg_id, channelId);

    const key = `${peerId}_${mid}`;
    const waitingPromise = this.waitingTranscriptions.get(key);
    if(!update.pFlags.pending && waitingPromise) {
      waitingPromise.resolve({
        _: 'messages.transcribedAudio',
        pFlags: {},
        text,
        transcription_id: update.transcription_id
      });
    }

    this.rootScope.dispatchEvent('message_transcribed', {peerId, mid, text, pending: update.pFlags.pending});
  };

  public setDialogToStateIfMessageIsTop(message: MyMessage) {
    if(this.isMessageIsTopMessage(message)) {
      this.dialogsStorage.setDialogToState(this.getDialogOnly(message.peerId));
    }
  }

  public isMessageIsTopMessage(message: MyMessage) {
    const dialog = this.getDialogOnly(message.peerId);
    return dialog && dialog.top_message === message.mid;
  }

  private updateMessageRepliesIfNeeded(threadMessage: MyMessage, add: boolean) {
    try { // * на всякий случай, скорее всего это не понадобится
      const threadKey = this.getThreadKey(threadMessage);
      if(threadKey) {
        const repliesKey = this.threadsToReplies[threadKey];
        if(repliesKey) {
          const [peerId, mid] = repliesKey.split('_');

          this.updateMessage(peerId.toPeerId(), +mid, 'replies_updated');
        } else if(threadMessage.reply_to) { // * regular group replies
          const threadId = +threadKey.split('_').pop();
          const originalMessage = this.getMessageByPeer(threadMessage.peerId, threadId) as Message.message;
          const replies = originalMessage?.replies;
          if(replies) {
            this.modifyMessage(originalMessage, (message) => {
              const replies = message.replies;
              replies.replies = Math.max(0, replies.replies + (add ? 1 : -1));
              this.rootScope.dispatchEvent('replies_short_update', message);
            });
          }
        }
      }
    } catch(err) {
      this.log.error('incrementMessageReplies err', err, threadMessage);
    }
  }

  private getThreadKey(threadMessage: MyMessage) {
    let threadKey = '';
    const peerId = threadMessage?.peerId;
    if(!peerId) {
      return threadKey;
    }

    if(peerId.isAnyChat() || (threadMessage as Message.message).saved_peer_id) {
      const threadId = getMessageThreadId(threadMessage, this.appChatsManager.isForum(peerId.toChatId()));
      if(threadId) {
        threadKey = peerId + '_' + threadId;
      }
    }

    return threadKey;
  }

  public updateMessage(peerId: PeerId, mid: number, broadcastEventName?: 'replies_updated'): Promise<Message.message> {
    const promise: Promise<Message.message> = this.reloadMessages(peerId, mid, true).then(() => {
      const message = this.getMessageByPeer(peerId, mid) as Message.message;
      if(!message) {
        return;
      }

      if(broadcastEventName) {
        this.rootScope.dispatchEvent(broadcastEventName, message);
      }

      return message;
    });

    return promise;
  }

  private checkPendingMessage(message: MyMessage) {
    const randomId = this.pendingByMessageId[message.mid];
    let pendingMessage: ReturnType<AppMessagesManager['finalizePendingMessage']>;
    if(randomId) {
      const pendingData = this.pendingByRandomId[randomId];
      if(pendingMessage = this.finalizePendingMessage(randomId, message)) {
        this.rootScope.dispatchEvent('history_update', {
          storageKey: pendingData.storage.key,
          message,
          sequential: pendingData.sequential
        });
      }

      delete this.pendingByMessageId[message.mid];
    }

    return pendingMessage;
  }

  public mutePeer(options: {peerId: PeerId, muteUntil: number, threadId?: number}) {
    if(!(options = this.appNotificationsManager.validatePeerSettings(options))) {
      return;
    }

    const {peerId, muteUntil, threadId} = options;
    const settings: InputPeerNotifySettings = {
      _: 'inputPeerNotifySettings'
    };

    settings.mute_until = muteUntil;

    const peer = this.appPeersManager.getInputPeerById(peerId);
    return this.appNotificationsManager.updateNotifySettings(threadId ? {
      _: 'inputNotifyForumTopic',
      peer,
      top_msg_id: getServerMessageId(threadId)
    } : {
      _: 'inputNotifyPeer',
      peer
    }, settings);
  }

  public togglePeerMute({peerId, mute, threadId}: {peerId: PeerId, mute?: boolean, threadId?: number}) {
    if(mute === undefined) {
      mute = !this.appNotificationsManager.isPeerLocalMuted({peerId, respectType: false, threadId});
    }

    return this.mutePeer({peerId, muteUntil: mute ? MUTE_UNTIL : 0, threadId});
  }

  private findPeerIdByMids(mids: number[]) {
    for(let length = mids.length, i = length - 1; i >= 0; --i) {
      const mid = mids[i];
      const message = this.getMessageById(mid);
      if(message) {
        return message.peerId;
      }
    }
  }

  public async canSendToPeer(peerId: PeerId, threadId?: number, action: ChatRights = 'send_messages') {
    if(await this.appPeersManager.isPeerRestricted(peerId)) {
      return false;
    }

    const appConfig = await this.apiManager.getAppConfig();
    if(appConfig.freeze_since_date) {
      const username = appConfig.freeze_appeal_url.split('/').pop();
      const peer = await this.appUsersManager.resolveUsername(username);
      return peerId === peer.id.toPeerId(peer._ !== 'user');
    }

    if(peerId.isAnyChat()) {
      const chatId = peerId.toChatId();
      if(threadId) {
        const topic = this.dialogsStorage.getForumTopic(peerId, threadId);
        if(topic?.pFlags?.closed && !this.dialogsStorage.canManageTopic(topic)) {
          return false;
        }
      }

      return this.appChatsManager.hasRights(chatId, action, undefined, !!threadId);
    } else {
      return this.appUsersManager.canSendToUser(peerId);
    }
  }

  public finalizePendingMessage(randomId: Long, finalMessage: MyMessage) {
    const pendingData = this.pendingByRandomId[randomId];
    if(!pendingData) {
      return;
    }

    const {peerId, tempId, threadId, storage} = pendingData;

    [
      this.getHistoryStorage(peerId),
      threadId ? this.getHistoryStorage(peerId, threadId) : undefined
    ]
    .filter(Boolean)
    .forEach((storage) => {
      storage.history.delete(tempId);
    });

    // this.log('pending', randomID, historyStorage.pending)

    const tempMessage: MyMessage = this.getMessageFromStorage(storage, tempId);
    if(tempMessage) {
      this.updateMessageContextForDeletion(tempMessage, true, finalMessage.mid);
      delete finalMessage.pFlags.is_outgoing;
      delete finalMessage.pending;
      delete finalMessage.error;
      delete finalMessage.random_id;
      delete finalMessage.send;
    }

    this.rootScope.dispatchEvent('messages_pending');

    delete this.pendingByRandomId[randomId];

    this.finalizePendingMessageCallbacks(storage, tempId, finalMessage);

    return tempMessage;
  }

  public finalizePendingMessageCallbacks(storage: MessagesStorage, tempId: number, message: MyMessage) {
    const callbacks = this.tempFinalizeCallbacks[tempId];
    // this.log.warn(callbacks, tempId);
    if(callbacks !== undefined) {
      for(const name in callbacks) {
        const {deferred, callback} = callbacks[name];
        // this.log(`finalizePendingMessageCallbacks: will invoke ${name} callback`);
        callback(message).then(deferred.resolve.bind(deferred), deferred.reject.bind(deferred));
      }

      delete this.tempFinalizeCallbacks[tempId];
    }

    // set cached url to media
    if((message as Message.message).media) {
      assumeType<Message.message>(message);
      const {photo: newPhoto, document: newDoc} = message.media as any;
      const newExtendedMedia = (message.media as MessageMedia.messageMediaPaidMedia).extended_media as MessageExtendedMedia.messageExtendedMedia[];

      const updatePhoto = (newPhoto: Photo.photo, photoId: string) => {
        const photo = this.appPhotosManager.getPhoto(photoId);
        if(!photo) {
          return;
        }

        const newPhotoSize = newPhoto.sizes[newPhoto.sizes.length - 1];
        const oldCacheContext = this.thumbsStorage.getCacheContext(photo, THUMB_TYPE_FULL);
        this.thumbsStorage.setCacheContextURL(newPhoto, newPhotoSize.type, oldCacheContext.url, oldCacheContext.downloaded);

        // const photoSize = newPhoto.sizes[newPhoto.sizes.length - 1] as PhotoSize.photoSize;
        // const downloadOptions = getPhotoDownloadOptions(newPhoto, photoSize);
        // const fileName = getFileNameByLocation(downloadOptions.location);
        // this.appDownloadManager.fakeDownload(fileName, oldCacheContext.url);
      };

      const updateDocument = (newDoc: Document.document, docId: DocId) => {
        const oldDoc = this.appDocsManager.getDoc(docId);
        if(!oldDoc) {
          return;
        }

        const oldCacheContext = this.thumbsStorage.getCacheContext(oldDoc);
        if(
          /* doc._ !== 'documentEmpty' &&  */
          oldDoc.type &&
          oldDoc.type !== 'sticker' &&
          oldDoc.mime_type !== 'image/gif' &&
          oldCacheContext.url
        ) {
          this.thumbsStorage.setCacheContextURL(newDoc, undefined, oldCacheContext.url, oldCacheContext.downloaded);

          // const fileName = getDocumentInputFileName(newDoc);
          // this.appDownloadManager.fakeDownload(fileName, oldCacheContext.url);
        }
      };

      if(newPhoto) {
        updatePhoto(newPhoto, '' + tempId);
      } else if(newDoc) {
        updateDocument(newDoc, '' + tempId);
      } else if((message.media as MessageMedia.messageMediaPoll).poll) {
        delete this.appPollsManager.polls[tempId];
        delete this.appPollsManager.results[tempId];
      } else if(newExtendedMedia) {
        const mediaTempId = this.mediaTempMap[tempId];
        newExtendedMedia.forEach((extendedMedia, idx) => {
          const {photo} = extendedMedia.media as MessageMedia.messageMediaPhoto;
          const {document} = extendedMedia.media as MessageMedia.messageMediaDocument;
          const id = '' + (mediaTempId + idx);
          if(photo) updatePhoto(photo as Photo.photo, id);
          else if(document) updateDocument(document as Document.document, id);
        });
      }
    }

    const tempMessage = this.getMessageFromStorage(storage, tempId);
    this.deleteMessageFromStorage(storage, tempId);

    if(!(tempMessage as Message.message).reply_markup && (message as Message.message).reply_markup) {
      setTimeout(() => { // TODO: refactor it to normal buttons adding
        if(!this.getMessageFromStorage(storage, message.mid)) {
          return;
        }

        this.rootScope.dispatchEvent('message_edit', {storageKey: storage.key, peerId: message.peerId, mid: message.mid, message});
      }, 0);
    }

    this.handleReleasingMessage(tempMessage, storage);
    this.onMessageModification(message, storage); // * mirror it

    this.rootScope.dispatchEvent('message_sent', {storageKey: storage.key, tempId, tempMessage, mid: message.mid, message});
  }

  public incrementMaxSeenId(maxId: number) {
    if(!maxId || !(!this.maxSeenId || maxId > this.maxSeenId)) {
      return false;
    }

    this.maxSeenId = maxId;
    this.appStateManager.pushToState('maxSeenMsgId', maxId);

    this.apiManager.invokeApi('messages.receivedMessages', {
      max_id: getServerMessageId(maxId)
    });
  }

  public async getMessageReactionsListAndReadParticipants(
    message: Message.message,
    limit?: number,
    reaction?: Reaction,
    offset?: string,
    skipReadParticipants?: boolean,
    skipReactionsList?: boolean
  ) {
    const emptyMessageReactionsList = {
      reactions: [] as MessagePeerReaction[],
      count: 0,
      next_offset: undefined as string
    };

    const canViewMessageReadParticipants = await this.canViewMessageReadParticipants(message);
    limit ??= canViewMessageReadParticipants ? 100 : 50;

    return Promise.all([
      canViewMessageReadParticipants && !reaction && !skipReadParticipants ? this.getMessageReadParticipants(message.peerId, message.mid).catch(() => [] as ReadParticipantDate[]) : [] as ReadParticipantDate[],

      message.reactions?.recent_reactions?.length && !skipReactionsList ? this.appReactionsManager.getMessageReactionsList(message.peerId, message.mid, limit, reaction, offset).catch((err) => emptyMessageReactionsList) : emptyMessageReactionsList
    ]).then(([readParticipantDates, messageReactionsList]) => {
      const filteredReadParticipants = readParticipantDates.slice();
      forEachReverse(filteredReadParticipants, ({user_id}, idx, arr) => {
        if(messageReactionsList.reactions.some((reaction) => this.appPeersManager.getPeerId(reaction.peer_id) === user_id.toPeerId())) {
          arr.splice(idx, 1);
        }
      });

      let combined: {
        peerId: PeerId,
        date?: number,
        reaction?: Reaction
      }[] = messageReactionsList.reactions.map((reaction) => {
        return {
          peerId: this.appPeersManager.getPeerId(reaction.peer_id),
          reaction: reaction.reaction,
          date: reaction.date
        };
      });

      combined = combined.concat(filteredReadParticipants.map(({user_id, date}) => ({date, peerId: user_id.toPeerId()})));

      return {
        reactions: messageReactionsList.reactions,
        reactionsCount: messageReactionsList.count,
        readParticipantDates: readParticipantDates,
        combined: combined,
        nextOffset: messageReactionsList.next_offset
      };
    });
  }

  public getMessageReadParticipants(peerId: PeerId, mid: number) {
    return this.apiManager.invokeApiSingle('messages.getMessageReadParticipants', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    }).then((readParticipantDates) => { // ! convert long to number
      readParticipantDates.forEach((readParticipantDate) => readParticipantDate.user_id = readParticipantDate.user_id.toUserId());
      return readParticipantDates;
    });
  }

  public getOutboxReadDate(peerId: PeerId, mid: number) {
    return this.apiManager.invokeApiSingle('messages.getOutboxReadDate', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    });
  }

  public async canViewMessageReadParticipants(message: Message) {
    if(
      message?._ !== 'message' ||
      message.pFlags.is_outgoing ||
      !message.pFlags.out ||
      message.pFlags.unread ||
      message.peerId === this.appPeersManager.peerId ||
      this.appPeersManager.isBroadcast(message.peerId) ||
      this.appPeersManager.isMonoforum(message.peerId)
    ) {
      return false;
    }

    const appConfig = await this.apiManager.getAppConfig();
    const diff = tsNow(true) - message.date;
    if(message.peerId.isUser()) {
      const userFull = await this.appProfileManager.getProfile(message.peerId.toUserId());
      return diff < appConfig.pm_read_date_expire_period && !userFull.pFlags.read_dates_private;
    }

    const chat = this.appChatsManager.getChat(message.peerId.toChatId()) as Chat.chat | Chat.channel;
    return chat.participants_count <= appConfig.chat_read_mark_size_threshold &&
      diff < appConfig.chat_read_mark_expire_period;
  }

  public incrementMessageViews(peerId: PeerId, mids: number[]) {
    if(!mids.length) {
      return;
    }

    return this.apiManager.invokeApiSingle('messages.getMessagesViews', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: mids.map((mid) => getServerMessageId(mid)),
      increment: true
    }).then((views) => {
      this.appPeersManager.saveApiPeers(views);

      for(let i = 0, length = mids.length; i < length; ++i) {
        this.apiUpdatesManager.processLocalUpdate({
          _: 'updateChannelMessageViews',
          channel_id: peerId.toChatId(),
          id: mids[i],
          views: views.views[i].views
        });
      }
    });
  }

  private async notifyAboutMessage(message: MyMessage, options: Partial<{
    fwdCount: number,
    peerReaction: MessagePeerReaction,
    peerTypeNotifySettings: PeerNotifySettings
  }> = {}) {
    const peerId = this.getMessagePeer(message);

    if(await this.appPeersManager.isPeerRestricted(peerId)) {
      return;
    }

    const settings = await commonStateStorage.get('settings', false);

    let tabs = appTabsManager.getTabs();
    if(!settings.notifyAllAccounts)
      tabs = tabs.filter((tab) => tab.state.accountNumber === this.getAccountNumber());

    tabs.sort((a, b) => a.state.idleStartTime - b.state.idleStartTime);

    let tab = tabs.find((tab) => {
      const {chatPeerIds, accountNumber} = tab.state;
      return accountNumber === this.getAccountNumber() && chatPeerIds[chatPeerIds.length - 1] === peerId;
    });

    if(!tab) {
      tab = tabs.find((tab) => tab.state.accountNumber === this.getAccountNumber());
    }

    if(!tab && tabs.length) {
      tab = !tabs[0].state.idleStartTime ? tabs[0] : tabs[tabs.length - 1];
    }

    const port = MTProtoMessagePort.getInstance<false>();
    port.invokeVoid('notificationBuild', {
      message,
      accountNumber: this.getAccountNumber(),
      isOtherTabActive: !!tab.state.idleStartTime,
      ...options
    }, tab?.source);
  }

  public getScheduledMessagesStorage(peerId: PeerId) {
    return this.scheduledMessagesStorage[peerId] ??= this.createMessageStorage(peerId, 'scheduled');
  }

  public getScheduledMessageByPeer(peerId: PeerId, mid: number) {
    return this.getMessageFromStorage(this.getScheduledMessagesStorage(peerId), mid);
  }

  public getScheduledMessages(peerId: PeerId) {
    if(!this.canSendToPeer(peerId)) return;
    if(this.appPeersManager.isMonoforum(peerId)) return;

    const storage = this.getScheduledMessagesStorage(peerId);
    if(storage.size) {
      return [...storage.keys()];
    }

    return this.apiManager.invokeApiSingle('messages.getScheduledHistory', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      hash: ''
    }).then((historyResult) => {
      if(historyResult._ !== 'messages.messagesNotModified') {
        this.appUsersManager.saveApiUsers(historyResult.users);
        this.appChatsManager.saveApiChats(historyResult.chats);

        const storage = this.getScheduledMessagesStorage(peerId);
        this.saveMessages(historyResult.messages, {storage, isScheduled: true});
        return [...storage.keys()];
      }

      return [];
    });
  }

  public sendScheduledMessages(peerId: PeerId, mids: number[]) {
    return this.apiManager.invokeApi('messages.sendScheduledMessages', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: mids.map((mid) => getServerMessageId(mid))
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public deleteScheduledMessages(peerId: PeerId, mids: number[]) {
    return this.apiManager.invokeApi('messages.deleteScheduledMessages', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: mids.map((mid) => getServerMessageId(mid))
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public getMessageWithReplies(message: Message.message) {
    return getMainGroupedMessage(this.filterMessages(message, (message) => !!(message as Message.message).replies) as Message.message[]);
  }

  public getMessageWithCommentReplies(message: Message.message) {
    if(message.peerId !== REPLIES_PEER_ID) {
      message = this.getMessageWithReplies(message);
      const replies = message?.replies;
      if(!(replies && replies.pFlags.comments && replies.channel_id.toChatId() !== REPLIES_HIDDEN_CHANNEL_ID)) {
        return;
      }
    }

    return message;
  }

  public isFetchIntervalNeeded(peerId: PeerId) {
    return peerId.isAnyChat() && (
      !this.appChatsManager.isInChat(peerId.toChatId()) ||
      this.appChatsManager.isForum(peerId.toChatId())
    );
  }

  // public async getNewHistory(peerId: PeerId, threadId?: number) {
  //   if(!this.isFetchIntervalNeeded(peerId)) {
  //     return;
  //   }

  //   const historyStorage = this.getHistoryStorage(peerId, threadId);
  //   const slice = historyStorage.history.slice;
  //   if(!slice.isEnd(SliceEnd.Bottom)) {
  //     return;
  //   }

  //   delete historyStorage.maxId;
  //   slice.unsetEnd(SliceEnd.Bottom);

  //   // if there is no id - then request by first id because cannot request by id 0 with backLimit
  //   const historyResult = await this.getHistory({peerId, offsetId: slice[0] ?? 1, limit: 0, backLimit: 50, threadId});
  //   for(let i = 0, length = historyResult.history.length; i < length; ++i) {
  //     this.handleNewMessage(this.getMessageByPeer(peerId, historyResult.history[i]));
  //   }

  //   return {isBottomEnd: historyStorage.history.slice.isEnd(SliceEnd.Bottom)};
  // }

  public getMigration(peerId: PeerId) {
    const next = this.migratedFromTo[peerId];
    const prev = this.migratedToFrom[peerId];
    return next || prev ? {next, prev} : undefined;
  }

  public getHistoryType(peerId: PeerId, {threadId, monoforumPeerId}: GetHistoryTypeOptions = {}) {
    if(monoforumPeerId) return HistoryType.Monoforum;

    if(threadId) {
      if(peerId.isUser()) {
        return HistoryType.Saved;
      } else if(this.appPeersManager.isForum(peerId)) {
        return HistoryType.Topic;
      } else {
        return HistoryType.Thread;
      }
    } else {
      return HistoryType.Chat;
    }
  }

  public processRequestHistoryOptions(options: RequestHistoryOptions & {backLimit?: number, historyStorage?: HistoryStorage}) {
    options.offsetId ??= 0;
    options.historyType ??= this.getHistoryType(options.peerId, {threadId: options.threadId, monoforumPeerId: options.monoforumThreadId});
    options.searchType ??= getSearchType(options);
    if(options.savedReaction) {
      options.savedReaction = options.savedReaction.filter(Boolean);
      if(!options.savedReaction.length) {
        delete options.savedReaction;
      } else {
        options.inputFilter ??= {_: 'inputMessagesFilterEmpty'};
      }
    }

    if(options.addOffset === undefined) {
      options.addOffset = 0;

      if(options.backLimit) {
        options.addOffset = -options.backLimit;
        options.limit += options.backLimit;
      }
    }

    if(TEST_NO_SAVED && options.historyType === HistoryType.Saved) {
      throw makeError('SAVED_DIALOGS_UNSUPPORTED');
    }

    options.historyStorage ??= options.searchType ?
      this.getSearchStorage(options) :
      this.getHistoryStorage(options.peerId, options.monoforumThreadId || options.threadId);

    return options;
  }

  /**
   * * https://core.telegram.org/api/offsets, offset_id is inclusive
   */
  public getHistory(options: RequestHistoryOptions & {
    backLimit?: number,
    historyStorage?: HistoryStorage,
    fetchIfWasNotFetched?: boolean
  }): Promise<HistoryResult> | HistoryResult {
    this.processRequestHistoryOptions(options);

    const {historyStorage, limit, addOffset, offsetId, offsetPeerId, needRealOffsetIdOffset} = options;

    const isPeerRestrictedPromise = this.appPeersManager.isPeerRestricted(options.peerId);
    if(isPeerRestrictedPromise instanceof Promise) {
      return isPeerRestrictedPromise.then(() => this.getHistory(options));
    } else if(isPeerRestrictedPromise) {
      const first = historyStorage.history.first;
      first.setEnd(SliceEnd.Both);

      const slice = first.slice(0, 0);
      slice.setEnd(SliceEnd.Both);

      return {
        count: 0,
        history: Array.from(slice),
        isEnd: slice.getEnds(),
        offsetIdOffset: 0
      };
    }

    const getPossibleSlice = () => {
      let haveSlice: ReturnType<SlicedArray<any>['sliceMe']>
      if(historyStorage.searchHistory) {
        haveSlice = historyStorage.searchHistory.sliceMe(offsetId ? `${offsetPeerId}_${offsetId}` : undefined, addOffset, limit);
      } else {
        haveSlice = historyStorage.history.sliceMe(offsetId, addOffset, limit);
      }

      return haveSlice;
    };

    const willFill = options.fetchIfWasNotFetched && !historyStorage.wasFetched;

    const haveSlice = getPossibleSlice();
    if(
      !willFill &&
      haveSlice &&
      (haveSlice.slice.length === limit || (haveSlice.fulfilled & SliceEnd.Both) === SliceEnd.Both) &&
      (!needRealOffsetIdOffset || haveSlice.slice.isEnd(SliceEnd.Bottom))
    ) {
      return {
        count: historyStorage.count,
        history: Array.from(haveSlice.slice),
        isEnd: haveSlice.slice.getEnds(),
        offsetIdOffset: haveSlice.offsetIdOffset,
        messages: options.isCacheableSearch ? haveSlice.slice.map((str) => this.getMessageByPeer(+str.split('_')[0], +str.split('_')[1])) : undefined
      };
    }

    return this.fillHistoryStorage(
      options as Modify<typeof options, {historyStorage: HistoryStorage}>
    ).then((historyResult) => {
      if(options.searchType === 'uncached') {
        // const migration = this.getMigration(options.peerId);
        // if(migration) {
        //   const excludeMid = this.appMessagesIdsManager.generateMessageId(1, migration.next || options.peerId);
        //   const idx = f.indexOf(excludeMid);
        //   if(idx !== -1) {
        //     f.splice(idx, 1);
        //   }
        // }

        const mids = historyResult.messages.map((message) => message.mid);

        return {
          count: (historyResult as MessagesMessages.messagesMessagesSlice).count ?? historyStorage.count,
          history: mids,
          isEnd: historyStorage.history.slice.getEnds(),
          offsetIdOffset: (historyResult as MessagesMessages.messagesMessagesSlice)?.offset_id_offset || 0,
          nextRate: (historyResult as MessagesMessages.messagesMessagesSlice)?.next_rate,
          messages: historyResult.messages as MyMessage[]
        };
      }

      const slice = getPossibleSlice();
      const f = slice?.slice || historyStorage.history.constructSlice();
      const isEnd = f.getEnds();
      let offsetIdOffset: number;
      if(needRealOffsetIdOffset) {
        offsetIdOffset = (historyResult as MessagesMessages.messagesMessagesSlice).offset_id_offset || 0;
      } else {
        offsetIdOffset = slice?.offsetIdOffset || historyStorage.count;
      }

      return {
        count: historyStorage.count,
        history: Array.from(f),
        isEnd,
        offsetIdOffset,
        messages: options.isCacheableSearch ? f.map((v) => this.getMessageByPeer(v.split('_')[0].toPeerId(), +v.split('_')[1])) : undefined
      };
    });
  }

  public isHistoryResultEnd({
    historyResult,
    limit,
    addOffset,
    offsetId,
    offsetPeerId,
    inputFilter,
    peerId
  }: {
    historyResult: Exclude<MessagesMessages, MessagesMessages.messagesMessagesNotModified>,
  } & Pick<RequestHistoryOptions, 'limit' | 'addOffset' | 'offsetId' | 'offsetPeerId' | 'peerId' | 'inputFilter'>) {
    const {offset_id_offset, messages} = historyResult as MessagesMessages.messagesMessagesSlice;

    const mids = messages.map(({mid}) => mid);

    const count = (historyResult as MessagesMessages.messagesMessagesSlice).count || messages.length;

    const topWasMeantToLoad = addOffset < 0 ? limit + addOffset : limit;
    const bottomWasMeantToLoad = Math.abs(addOffset);

    // * means global search
    // * have to reset offsetId, because messages aren't sorted and can be loaded only from the top
    if(!peerId && inputFilter) {
      offsetId = 0;
    }

    let offsetIdOffset = offset_id_offset;
    let isTopEnd = false, isBottomEnd = !offsetId;
    let topLoaded = messages.length, bottomLoaded = 0;
    let isOffsetIncluded = false;

    const serverOffsetId = offsetId && getServerMessageId(offsetId);
    if(serverOffsetId) {
      let i = 0;
      for(const length = mids.length; i < length; ++i) {
        if(offsetId > mids[i]) {
          break;
        }
      }

      isOffsetIncluded = mids.includes(offsetId);
      topLoaded = messages.length - i;
      bottomLoaded = i;
    }

    // offsetIdOffset = undefined;

    // if(offsetIdOffset === undefined && !bottomWasMeantToLoad) {
    //   offsetIdOffset = 0;
    // }

    if(offsetIdOffset !== undefined) {
      isTopEnd = offsetIdOffset >= (count - topWasMeantToLoad) || count < topWasMeantToLoad;
      isBottomEnd = !offsetIdOffset || (addOffset < 0 && (offsetIdOffset + addOffset) <= 0);
    } else if(serverOffsetId) {
      if(topWasMeantToLoad) isTopEnd = topLoaded < topWasMeantToLoad;
      if(bottomWasMeantToLoad) isBottomEnd = bottomLoaded < bottomWasMeantToLoad;

      if(isTopEnd || isBottomEnd) {
        offsetIdOffset = isTopEnd ? count - topLoaded : bottomLoaded - +isOffsetIncluded;
      }
    } else if(messages.length >= count) {
      isTopEnd = true;
      isBottomEnd = true;
    }

    offsetIdOffset ??= 0;

    return {
      count,
      offsetIdOffset,
      isTopEnd,
      isBottomEnd,
      mids,
      topWasMeantToLoad,
      bottomWasMeantToLoad,
      topLoaded,
      bottomLoaded
    };
  }

  public mergeHistoryResult(options: RequestHistoryOptions & {
    slicedArray: SlicedArray<number>,
    historyResult: Parameters<AppMessagesManager['isHistoryResultEnd']>[0]['historyResult'],
    historyStorage?: HistoryStorage
  }) {
    const {
      slicedArray,
      historyResult,
      offsetId,
      addOffset,
      peerId,
      historyStorage
    } = options;

    const searchSlicedArray = historyStorage?.searchHistory;
    const {messages} = historyResult as MessagesMessages.messagesMessagesSlice;
    const isEnd = this.isHistoryResultEnd(options);
    const {count, offsetIdOffset, mids} = isEnd;
    const migration = this.getMigration(peerId);

    if(migration && historyStorage && historyStorage.type !== 'replies') {
      if(migration.prev) {
        isEnd.isTopEnd = false;
      } else if(migration.next) {
        if(isEnd.isBottomEnd) {
          mids.unshift(this.appMessagesIdsManager.generateMessageId(1, migration.next.toChatId()));
          isEnd.isBottomEnd = false;
        }
      }
    }

    // * add bound manually.
    // * offset_id will be inclusive only if there is 'add_offset' <= -1 (-1 - will only include the 'offset_id')
    // * check that offset_id is not 0
    if(
      offsetId &&
      getServerMessageId(offsetId) &&
      !mids.includes(offsetId) &&
      offsetIdOffset <= count &&
      (addOffset || 0) >= 0 && // ! warning
      !searchSlicedArray
    ) {
      let i = 0;
      for(const length = mids.length; i < length; ++i) {
        if(offsetId > mids[i]) {
          break;
        }
      }

      mids.splice(i, 0, offsetId);
    }

    let slice: Slice<any>, hadSlice: boolean;
    if(!count) {
      slice = slicedArray.slice;
      hadSlice = true;
    } else if(searchSlicedArray) {
      let full = messages.map((message) => `${(message as Message.message).peerId}_${message.mid}`) as `${PeerId}_${number}`[];
      full = full.filter((str) => !searchSlicedArray.first.includes(str));
      slice = searchSlicedArray.insertSlice(full);
      hadSlice = !!slice;
    } else {
      slice = slicedArray.insertSlice(mids);
      hadSlice = !!slice;
      slice ||= slicedArray.slice;
    }

    if(hadSlice) {
      if(isEnd.isTopEnd) {
        slice.setEnd(SliceEnd.Top);
      }

      if(isEnd.isBottomEnd) {
        slice.setEnd(SliceEnd.Bottom);
      }
    }

    return {slice, mids, messages, ...isEnd};
  }

  private async fillHistoryStorage(options: RequestHistoryOptions & {
    historyStorage: HistoryStorage,
    recursion?: boolean
  }) {
    const {
      offsetId,
      historyStorage,
      inputFilter,
      recursion       // save before setting
    } = options;

    options.recursion = true;

    let {peerId} = options;

    const wasMaxId = historyStorage.maxId;
    const middleware = this.middleware.get();
    let migration = this.getMigration(peerId);

    let requestPeerId = peerId;
    if(offsetId && migration?.prev && getServerMessageId(offsetId) === offsetId) {
      requestPeerId = migration.prev;
    }

    peerId = options.peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    const isRequestingLegacy = requestPeerId !== peerId;
    const isRequestingGlobalCacheable = options.searchType === 'cached' && options.isCacheableSearch;
    if(isRequestingGlobalCacheable && historyStorage.nextRate) {
      const last = historyStorage.searchHistory.last;
      const [peerId, mid] = last[last.length - 1].split('_');
      const lastMessage = this.getMessageByPeer(peerId.toPeerId(), +mid) as MyMessage;
      options.offsetId = lastMessage.mid;
      options.offsetPeerId = peerId.toPeerId();
      options.nextRate = historyStorage.nextRate;
    }

    const historyResult = await this.requestHistory({
      ...options,
      peerId: requestPeerId
    });

    if(!middleware()) {
      return;
    }

    if(isRequestingGlobalCacheable) {
      historyStorage.nextRate = (historyResult as MessagesMessages.messagesMessagesSlice).next_rate;
    }

    const mergedResult = this.mergeHistoryResult({
      ...options,
      slicedArray: historyStorage.history,
      historyResult,
      peerId: requestPeerId
    });

    historyStorage.wasFetched = true;

    const {
      count,
      isBottomEnd,
      isTopEnd,
      slice,
      messages,
      topWasMeantToLoad,
      bottomWasMeantToLoad,
      topLoaded,
      bottomLoaded
    } = mergedResult;

    if(!isRequestingLegacy) {
      historyStorage.count = count;
    }

    if(!inputFilter) for(let i = 0, length = messages.length; i < length; ++i) {
      const message = messages[i] as MyMessage;
      if(this.mergeReplyKeyboard(historyStorage, message)) {
        this.rootScope.dispatchEvent('history_reply_markup', {peerId});
      }
    }

    if(!inputFilter && isBottomEnd) {
      const newMaxId = slice[0];

      if(historyStorage.maxId === wasMaxId) {
        const first = historyStorage.history.first;
        if(first !== slice) {
          historyStorage.history.deleteSlice(first);
        }

        if(historyStorage.maxId !== newMaxId) {
          historyStorage.maxId = slice[0]; // ! WARNING

          this.reloadConversation(peerId); // when top_message is deleted but cached
        }
      }
    }

    // * load grouped missing messages (only once per recursion)
    if(!inputFilter && !recursion) {
      const firstMessage = messages[0] as Message.message;
      const lastMessage = messages[messages.length - 1] as Message.message;

      const fillMissingGroupedMessages = async(bottom: boolean) => {
        if(!middleware()) {
          return;
        }

        const {
          isEnd,
          history,
          messages = history.map((mid) => this.getMessageByPeer(peerId, mid))
        } = await this.getHistory({
          ...options,
          offsetId: (bottom ? firstMessage : lastMessage).mid,
          limit: (MESSAGES_ALBUM_MAX_SIZE + 1) * 2,
          addOffset: -(MESSAGES_ALBUM_MAX_SIZE + 1)
        });

        if(!middleware()) {
          return;
        }

        // * erase unfilled grouped messages if they're last elements in their history slices
        if(!isEnd[bottom ? 'bottom' : 'top']) {
          if(!bottom) messages.reverse();
          const messagesSlice = messages.slice(0, MESSAGES_ALBUM_MAX_SIZE) as Message.message[];
          const groupedIds = messagesSlice.map((message) => message.grouped_id);
          const slice = messagesSlice[0] && historyStorage.history.findSlice(messagesSlice[0].mid);
          if(
            groupedIds[0] &&
            groupedIds[0] !== groupedIds[MESSAGES_ALBUM_MAX_SIZE - 1] &&
            slice?.index === (bottom ? 0 : slice.slice.length - 1)
          ) {
            messagesSlice.forEach((message) => {
              if(message.grouped_id === groupedIds[0]) {
                historyStorage.history.delete(message.mid);
              }
            });
          }
        }
      };


      if(!isBottomEnd && firstMessage?.grouped_id) {
        await fillMissingGroupedMessages(true);
      }

      if(!isTopEnd && lastMessage?.grouped_id && lastMessage.grouped_id !== firstMessage?.grouped_id) {
        await fillMissingGroupedMessages(false);
      }
    }
    // * grouped end

    if(options.threadId) {
      if(isTopEnd && options.historyType === HistoryType.Thread) {
        const last = historyStorage.history.last;
        const firstMessage = this.getMessageByPeer(peerId, options.threadId/* last[last.length - 1] */) as Message.message;
        const message = this.getMessageWithReplies(firstMessage);
        const threadServiceMid = this.generateThreadServiceStartMessage(message);
        const mids = this.getMidsByMessage(message);
        const addSlice = [
          threadServiceMid,
          ...mids.sort((a, b) => b - a)
        ];

        // * shouldn't happen, but just in case
        forEachReverse(addSlice, (mid, idx, arr) => {
          if(last.includes(mid)) {
            arr.splice(idx, 1);
          }
        });

        const lastLength = last.length;
        if(last.isEnd(SliceEnd.Top) && lastLength) {
          addSlice.unshift(last[lastLength - 1]);
        }

        historyStorage.history.insertSlice(addSlice);

        this.log('inserted thread service start message', peerId, options.threadId, threadServiceMid);
      }

      return historyResult;
    }

    // * support migrated chats
    // * if found migrated chat during the load
    migration ??= this.getMigration(peerId);

    if(migration?.prev && topWasMeantToLoad !== topLoaded && !isTopEnd) {
      const toLoad = topWasMeantToLoad - topLoaded;
      const migratedResult = await this.fillHistoryStorage({
        ...options,
        peerId: migration.prev,
        offsetId: 0,
        limit: toLoad,
        addOffset: 0
      });

      historyResult.messages.push(...migratedResult.messages);

      const migratedResultCount = (migratedResult as MessagesMessages.messagesMessagesSlice).count ?? migratedResult.messages.length;
      (historyResult as MessagesMessages.messagesMessagesSlice).count = ((historyResult as MessagesMessages.messagesMessagesSlice).count || 0) + migratedResultCount;
    }/*  else if(migration?.prev && inputFilter) {
      const migratedResult = await this.requestHistory({
        ...options,
        peerId: migration.prev,
        offsetId: 0,
        limit: 1
      });

      const migratedResultCount = (migratedResult as MessagesMessages.messagesMessagesSlice).count ?? migratedResult.messages.length;
      (historyResult as MessagesMessages.messagesMessagesSlice).count = ((historyResult as MessagesMessages.messagesMessagesSlice).count || 0) + migratedResultCount;

      const offsetIdOffset = (historyResult as MessagesMessages.messagesMessagesSlice).offset_id_offset || 0;
      (historyResult as MessagesMessages.messagesMessagesSlice).offset_id_offset = offsetIdOffset + migratedResultCount;
    } */ else if((migration?.next || isRequestingLegacy) && bottomWasMeantToLoad !== bottomLoaded && !isBottomEnd) {
      const toLoad = bottomWasMeantToLoad - bottomLoaded;
      const migratedResult = await this.fillHistoryStorage({
        ...options,
        offsetId: this.appMessagesIdsManager.generateMessageId(1, peerId.toChatId()),
        limit: toLoad,
        addOffset: -toLoad
      });

      historyResult.messages.unshift(...migratedResult.messages);

      const migratedResultCount = (migratedResult as MessagesMessages.messagesMessagesSlice).count ?? migratedResult.messages.length;
      (historyResult as MessagesMessages.messagesMessagesSlice).count = ((historyResult as MessagesMessages.messagesMessagesSlice).count || 0) + migratedResultCount;

      const offsetIdOffset = (historyResult as MessagesMessages.messagesMessagesSlice).offset_id_offset || 0;
      (historyResult as MessagesMessages.messagesMessagesSlice).offset_id_offset = offsetIdOffset + migratedResultCount;
    } else if(migration && inputFilter && !recursion) {
      const migratedResult = await this.requestHistory({
        ...options,
        peerId: isRequestingLegacy ? peerId : migration.prev,
        offsetId: 0,
        limit: 1
      });

      const migratedResultCount = (migratedResult as MessagesMessages.messagesMessagesSlice).count ?? migratedResult.messages.length;
      (historyResult as MessagesMessages.messagesMessagesSlice).count = ((historyResult as MessagesMessages.messagesMessagesSlice).count || 0) + migratedResultCount;

      const offsetIdOffset = (historyResult as MessagesMessages.messagesMessagesSlice).offset_id_offset || 0;
      (historyResult as MessagesMessages.messagesMessagesSlice).offset_id_offset = offsetIdOffset + migratedResultCount;
    }

    if(!middleware()) {
      return;
    }
    // * migration end

    // * fill grouped messages when loading tags history
    if(inputFilter && options.savedReaction) {
      const differentGroupedMessages = historyResult.messages.filter((message) => (message as Message.message).grouped_id) as Message.message[];
      await Promise.all(differentGroupedMessages.map((message) => {
        return this.getHistory({
          peerId: message.peerId,
          offsetId: message.mid,
          limit: (MESSAGES_ALBUM_MAX_SIZE + 1) * 2,
          addOffset: -(MESSAGES_ALBUM_MAX_SIZE + 1)
        });
      }));
      if(!middleware()) {
        return;
      }
    }

    return historyResult;
  }

  public requestHistory({
    peerId,
    offsetId = 0,
    limit = 50,
    addOffset = 0,
    offsetDate = 0,
    threadId = 0,
    monoforumThreadId,

    offsetPeerId,
    nextRate,
    folderId,
    query,
    inputFilter,
    minDate,
    maxDate,
    historyType = this.getHistoryType(peerId, {threadId}),
    chatType,
    fromPeerId,
    savedReaction,
    isPublicHashtag
  }: RequestHistoryOptions) {
    const offsetMessage = offsetId && this.getMessageByPeer(offsetPeerId || peerId, offsetId);
    offsetPeerId ??= offsetMessage?.peerId;

    offsetId = getServerMessageId(offsetId) || 0;
    threadId = historyType === HistoryType.Saved ? threadId : (getServerMessageId(threadId) || 0);

    minDate = minDate ? minDate / 1000 | 0 : 0;
    maxDate = maxDate ? maxDate / 1000 | 0 : 0;

    let options: MessagesGetReplies | MessagesGetHistory | MessagesSearch | MessagesSearchGlobal | MessagesGetSavedHistory | ChannelsSearchPosts;
    let method: 'messages.getReplies' | 'messages.getHistory' | 'messages.search' | 'messages.searchGlobal' | 'messages.getSavedHistory' | 'channels.searchPosts';
    const commonOptions = {
      peer: this.appPeersManager.getInputPeerById(peerId),
      offset_id: offsetId,
      offset_date: offsetDate,
      add_offset: addOffset,
      limit,
      max_id: 0,
      min_id: 0,
      hash: 0
    };

    if(savedReaction) {
      inputFilter ??= {_: 'inputMessagesFilterEmpty'};
    }

    if(isPublicHashtag) {
      const searchOptions: ChannelsSearchPosts = {
        ...commonOptions,
        hashtag: query.slice(1),
        offset_rate: nextRate,
        offset_peer: this.appPeersManager.getInputPeerById(offsetPeerId)
      };

      method = 'channels.searchPosts';
      options = searchOptions;
    } else if(inputFilter && peerId && !nextRate && folderId === undefined/*  || !query */) {
      const savedPeerIdInput = monoforumThreadId ?
        this.appPeersManager.getInputPeerById(monoforumThreadId) :
        historyType === HistoryType.Saved ?
          this.appPeersManager.getInputPeerById(threadId) :
          undefined;

      const searchOptions: MessagesSearch = {
        ...commonOptions,
        q: query || '',
        filter: inputFilter as any as MessagesFilter,
        min_date: minDate,
        max_date: maxDate,
        top_msg_id: historyType === HistoryType.Saved ? undefined : threadId,
        saved_peer_id: savedPeerIdInput,
        from_id: fromPeerId ? this.appPeersManager.getInputPeerById(fromPeerId) : undefined,
        saved_reaction: savedReaction
      };

      method = 'messages.search';
      options = searchOptions;
    } else if(inputFilter) {
      const searchGlobalOptions: MessagesSearchGlobal = {
        ...commonOptions,
        q: query || '',
        filter: inputFilter as any as MessagesFilter,
        min_date: minDate,
        max_date: maxDate,
        offset_rate: nextRate,
        offset_peer: this.appPeersManager.getInputPeerById(offsetPeerId),
        folder_id: folderId,
        users_only: chatType === 'users' || undefined,
        groups_only: chatType === 'groups' || undefined,
        broadcasts_only: chatType === 'channels' || undefined
      };

      method = 'messages.searchGlobal';
      options = searchGlobalOptions;
    } else if(historyType === HistoryType.Thread || historyType === HistoryType.Topic) {
      const getRepliesOptions: MessagesGetReplies = {
        ...commonOptions,
        msg_id: threadId
      };

      method = 'messages.getReplies';
      options = getRepliesOptions;
    } else if(historyType === HistoryType.Monoforum) {
      const getSavedHistoryOptions: MessagesGetSavedHistory = {
        ...commonOptions,
        parent_peer: this.appPeersManager.getInputPeerById(peerId),
        peer: this.appPeersManager.getInputPeerById(monoforumThreadId)
      };

      method = 'messages.getSavedHistory';
      options = getSavedHistoryOptions;
    } else if(historyType === HistoryType.Saved) {
      const getSavedHistoryOptions: MessagesGetSavedHistory = {
        ...commonOptions,
        peer: this.appPeersManager.getInputPeerById(threadId)
      };

      method = 'messages.getSavedHistory';
      options = getSavedHistoryOptions;
    } else {
      const getHistoryOptions: MessagesGetHistory = {
        ...commonOptions
      };

      method = 'messages.getHistory';
      options = getHistoryOptions;
    }

    const promise = this.apiManager.invokeApiSingle(
      method,
      options,
      {
        // timeout: APITIMEOUT,
        noErrorBox: true
      }
    ) as Promise<Exclude<MessagesMessages, MessagesMessages.messagesMessagesNotModified>>;

    return promise.then((historyResult) => {
      if(DEBUG) {
        this.log('requestHistory result:', peerId, historyResult, offsetId, limit, addOffset);
      }

      const {messages} = historyResult;

      this.saveApiResult(historyResult);

      if('pts' in historyResult) {
        this.apiUpdatesManager.addChannelState(peerId.toChatId(), historyResult.pts);
      }

      let length = messages.length,
        count = (historyResult as MessagesMessages.messagesMessagesSlice).count;
      if(length && !messages[length - 1]) {
        messages.splice(length - 1, 1);
        length--;
        count--;
      }

      return historyResult;
    }, (error: ApiError) => {
      switch(error.type) {
        case 'CHANNEL_PRIVATE':
          let channel = this.appChatsManager.getChat(peerId.toChatId());
          if(channel._ === 'channel') {
            channel = {
              _: 'channelForbidden',
              id: channel.id,
              access_hash: channel.access_hash,
              title: channel.title,
              pFlags: channel.pFlags
            };
          }

          this.appChatsManager.saveApiChats([channel]);

          this.apiUpdatesManager.processLocalUpdate({
            _: 'updateChannel',
            channel_id: channel.id
          });
          break;
      }

      throw error;
    });
  }

  public fetchSingleMessages() {
    return this.fetchSingleMessagesPromise ??= pause(0).then(() => {
      const requestPromises: Promise<void>[] = [];

      for(const [peerId, map] of this.needSingleMessages) {
        const mids = [...map.keys()];
        const msgIds: InputMessage[] = mids.map((mid) => {
          return {
            _: 'inputMessageID',
            id: getServerMessageId(mid)
          };
        });

        let promise: Promise<MethodDeclMap['channels.getMessages']['res'] | MethodDeclMap['messages.getMessages']['res']>;
        const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;
        if(channelId) {
          promise = this.apiManager.invokeApiSingle('channels.getMessages', {
            channel: this.appChatsManager.getChannelInput(channelId),
            id: msgIds
          });
        } else {
          promise = this.apiManager.invokeApiSingle('messages.getMessages', {
            id: msgIds
          });
        }

        const after = promise.then((getMessagesResult) => {
          assumeType<Exclude<MessagesMessages.messagesMessages, MessagesMessages.messagesMessagesNotModified>>(getMessagesResult);

          this.saveApiResult(getMessagesResult);
          const {messages} = getMessagesResult;

          for(let i = 0; i < messages.length; ++i) {
            const message = messages[i];
            if(!message) {
              continue;
            }

            const mid = this.appMessagesIdsManager.generateMessageId(message.id, channelId);
            const promise = map.get(mid);
            promise.resolve(message as MyMessage);
            map.delete(mid);
          }

          if(map.size) {
            for(const [mid, promise] of map) {
              const deletedPeerId = peerId.isAnyChat() && isLegacyMessageId(mid) ? GLOBAL_HISTORY_PEER_ID : peerId;
              this.deletedMessages.add(`${deletedPeerId}_${mid}`);
              promise.resolve(this.generateEmptyMessage(mid));
            }
          }
        }).finally(() => {
          this.rootScope.dispatchEvent('messages_downloaded', {peerId, mids});
        });

        requestPromises.push(after);
      }

      this.needSingleMessages.clear();

      return Promise.all(requestPromises).then(noop, noop).then(() => {
        this.fetchSingleMessagesPromise = undefined;
        if(this.needSingleMessages.size) this.fetchSingleMessages();
      });
    });
  }

  public reloadMessages(peerId: PeerId, mid: number, overwrite?: boolean): Promise<MyMessage>;
  public reloadMessages(peerId: PeerId, mid: number[], overwrite?: boolean): Promise<MyMessage[]>;
  public reloadMessages(peerId: PeerId, mid: number | number[], overwrite?: boolean): Promise<MyMessage | MyMessage[]> {
    if(Array.isArray(mid)) {
      return Promise.all(mid.map((mid) => {
        return this.reloadMessages(peerId, mid, overwrite);
      }));
    }

    if(peerId.isAnyChat() && isLegacyMessageId(mid)) {
      peerId = GLOBAL_HISTORY_PEER_ID;
    }

    const message = this.getMessageByPeer(peerId, mid);
    if(this.deletedMessages.has(`${peerId}_${mid}`) || (message && !overwrite)) {
      this.rootScope.dispatchEvent('messages_downloaded', {peerId, mids: [mid]});
      return Promise.resolve(message);
    } else {
      let map = this.needSingleMessages.get(peerId);
      if(!map) {
        this.needSingleMessages.set(peerId, map = new Map());
      }

      let promise = map.get(mid);
      if(promise) {
        return promise;
      }

      promise = deferredPromise();
      map.set(mid, promise);
      this.fetchSingleMessages();
      return promise;
    }
  }

  public getExtendedMedia(peerId: PeerId, mids: number[]) {
    let map = this.extendedMedia.get(peerId);
    if(!map) {
      this.extendedMedia.set(peerId, map = new Map());
    }

    const deferred = deferredPromise<void>();
    const toRequest: number[] = [];
    const promises = mids.map((mid) => {
      let promise = map.get(mid);
      if(!promise) {
        map.set(mid, promise = deferred);
        toRequest.push(mid);

        promise.then(() => {
          map.delete(mid);
          if(!map.size && this.extendedMedia.get(peerId) === map) {
            this.extendedMedia.delete(peerId);
          }
        });
      }

      return promise;
    });

    if(!toRequest.length) {
      deferred.resolve();
    } else {
      this.apiManager.invokeApi('messages.getExtendedMedia', {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: toRequest.map((mid) => getServerMessageId(mid))
      }).then((updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
        deferred.resolve();
      });
    }

    return Promise.all(promises);
  }

  private clearMessageReplyTo(message: MyMessage) {
    message = this.getMessageByPeer(message.peerId, message.mid); // message can come from other thread
    this.modifyMessage(message, (message) => {
      delete message.reply_to_mid; // ! WARNING!
      delete message.reply_to; // ! WARNING!
    }, this.getHistoryMessagesStorage(message.peerId), true); // * mirror it
  }

  public fetchMessageReplyTo(message: MyMessage) {
    message = this.getMessageByPeer(message.peerId, message.mid); // message can come from other thread
    if(!message.reply_to) return Promise.resolve(this.generateEmptyMessage(0));
    const replyTo = message.reply_to;
    if(replyTo._ === 'messageReplyStoryHeader') {
      const result = this.appStoriesManager.getStoryById(this.appPeersManager.getPeerId(replyTo.peer), replyTo.story_id);
      return callbackify(result, (story) => {
        // if(!story) {
        //   this.clearMessageReplyTo(message);
        // }

        return story;
      });
    }

    const replyToPeerId = replyTo.reply_to_peer_id ? this.appPeersManager.getPeerId(replyTo.reply_to_peer_id) : message.peerId;
    return this.reloadMessages(replyToPeerId, message.reply_to_mid).then((originalMessage) => {
      if(!originalMessage) { // ! break the infinite loop
        this.clearMessageReplyTo(message);
      }

      if(message._ === 'messageService') {
        const peerId = message.peerId;
        this.rootScope.dispatchEvent('message_edit', {
          storageKey: `${peerId}_history`,
          peerId: peerId,
          mid: message.mid,
          message
        });

        if(this.isMessageIsTopMessage(message)) {
          this.rootScope.dispatchEvent('dialogs_multiupdate', new Map([[peerId, {dialog: this.getDialogOnly(peerId)}]]));
        }
      }

      return originalMessage;
    });
  }

  private getTypingKey(peerId: PeerId, threadId?: number) {
    return threadId ? `${peerId}_${threadId}` : peerId;
  }

  public setTyping(
    peerId: PeerId,
    action: SendMessageAction,
    force?: boolean,
    threadId?: number
  ): Promise<boolean> {
    if(threadId && !this.appPeersManager.isForum(peerId)) {
      threadId = undefined;
    }

    const key = this.getTypingKey(peerId, threadId);
    let typing = this.typings[key];
    if(
      !peerId ||
      !this.canSendToPeer(peerId) ||
      peerId === this.appPeersManager.peerId ||
      // (!force && deepEqual(typing?.action, action))
      (!force && typing?.action?._ === action._) ||
      this.appPeersManager.isMonoforum(peerId)
    ) {
      return Promise.resolve(false);
    }

    if(typing?.timeout) {
      clearTimeout(typing.timeout);
    }

    typing = this.typings[key] = {
      action
    };

    return this.apiManager.invokeApi('messages.setTyping', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      action,
      top_msg_id: threadId ? getServerMessageId(threadId) : undefined
    }).finally(() => {
      if(typing === this.typings[key]) {
        typing.timeout = ctx.setTimeout(() => {
          delete this.typings[key];
        }, 6000);
      }
    });
  }

  private handleReleasingMessage(message: MyMessage, storage: MessagesStorage) {
    const media = (message as Message.message).media;
    if(media) {
      const c = (media as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage || media as MessageMedia.messageMediaPhoto | MessageMedia.messageMediaDocument;
      const smth: Photo.photo | MyDocument = (c as MessageMedia.messageMediaPhoto).photo as any || (c as MessageMedia.messageMediaDocument).document as any;

      if(smth?.file_reference) {
        this.referenceDatabase.deleteContext(smth.file_reference, {type: 'message', peerId: message.peerId, messageId: message.mid});
      }

      if('webpage' in media && media.webpage) {
        const isScheduled = this.getScheduledMessagesStorage(message.peerId) === storage;
        const messageKey = this.appWebPagesManager.getMessageKeyForPendingWebPage(message.peerId, message.mid, isScheduled);
        this.appWebPagesManager.deleteWebPageFromPending(media.webpage, messageKey);
      }

      if((media as MessageMedia.messageMediaPoll).poll) {
        this.appPollsManager.updatePollToMessage(message as Message.message, false);
      }
    }
  }

  private handleDeletedMessages(peerId: PeerId, storage: MessagesStorage, messages: number[]) {
    // type T = {savedPeerId?: number};
    const history: {
      count: number,
      unread: number,
      unreadMentions: number,
      unreadReactions: number,
      // msgs: Map<number, {savedPeerId?: number}>,
      msgs: Set<number>,
      grouped?: {[groupId: string]: Set<number>},
    } = {
      count: 0,
      unread: 0,
      unreadMentions: 0,
      unreadReactions: 0,
      msgs: new Set()
    };

    const shouldClearContexts = storage.type === 'history';

    for(const mid of messages) {
      const message: MyMessage = this.getMessageFromStorage(storage, mid);
      if(!message) {
        this.fixDialogUnreadMentionsIfNoMessage({peerId});
        this.fixDialogUnreadMentionsIfNoMessage({peerId, isReaction: true});
        continue;
      }

      this.handleReleasingMessage(message, storage);

      {
        const deletedPeerId = peerId.isAnyChat() && isLegacyMessageId(mid) ? GLOBAL_HISTORY_PEER_ID : peerId;
        this.deletedMessages.add(`${deletedPeerId}_${message.mid}`);
      }

      if((message as Message.message).pFlags.pinned) {
        this.resetPinnedMessagesCache(peerId, [mid], false);
      }

      this.updateMessageRepliesIfNeeded(message, false);

      if(!message.pFlags.out && !message.pFlags.is_outgoing && message.pFlags.unread) {
        ++history.unread;
        this.rootScope.dispatchEvent('notification_cancel', `msg_${this.getAccountNumber()}_${peerId}_${mid}`);

        if(isMentionUnread(message)) {
          ++history.unreadMentions;
          this.modifyCachedMentions({peerId, mid, add: false});
        }
      }

      // const details: T = {};
      // const savedPeerId = (message as Message.message).saved_peer_id;
      // if(savedPeerId) {
      //   details.savedPeerId = this.appPeersManager.getPeerId(savedPeerId);
      // }

      ++history.count;
      history.msgs.add(mid/* , details */);

      const groupedId = (message as Message.message).grouped_id;
      if(groupedId) {
        const groupedStorage = this.groupedMessagesStorage[groupedId];
        if(groupedStorage) {
          this.deleteMessageFromStorage(groupedStorage, mid);

          if(!history.grouped) history.grouped = {};
          (history.grouped[groupedId] || (history.grouped[groupedId] = new Set())).add(mid);

          if(!groupedStorage.size) {
            delete history.grouped;
            delete this.groupedMessagesStorage[groupedId];
          }
        }
      }

      if(shouldClearContexts) {
        this.updateMessageContextForDeletion(message, true);

        // * it should have a better place :(
        const reactions = (message as Message.message).reactions;
        if(reactions && reactions.pFlags.reactions_as_tags) {
          this.appReactionsManager.processMessageReactionsChanges({
            message: message as Message.message,
            changedResults: [],
            removedResults: reactions.results
          });
        }

        const recentReactions = reactions?.recent_reactions;
        if(message.pFlags.out && recentReactions?.some((reaction) => reaction.pFlags.unread)) {
          ++history.unreadReactions;
          this.modifyCachedMentions({
            peerId,
            mid,
            add: false,
            isReaction: true
          });
        }

        this.appTranslationsManager.resetMessageTranslations(message.peerId, message.mid);
      }

      this.deleteMessageFromStorage(storage, mid);
    }

    if(history.grouped) {
      for(const groupedId in history.grouped) {
        this.dispatchGroupedEdit(groupedId, storage, [...history.grouped[groupedId]]);
        /* const mids = this.getMidsByAlbum(groupId);
        if(mids.length) {
          const mid = Math.max(...mids);
          rootScope.$broadcast('message_edit', {peerId, mid, justMedia: false});
        } */
      }
    }

    return history;
  }

  private handleEditedMessage(oldMessage: Message, newMessage: Message, storage: MessagesStorage) {
    if(oldMessage._ === 'message') {
      if((oldMessage.media as MessageMedia.messageMediaWebPage)?.webpage) {
        const messageKey = this.appWebPagesManager.getMessageKeyForPendingWebPage(oldMessage.peerId, oldMessage.mid, !!oldMessage.pFlags.is_scheduled);
        this.appWebPagesManager.deleteWebPageFromPending((oldMessage.media as MessageMedia.messageMediaWebPage).webpage, messageKey);
      }

      const groupedId = oldMessage.grouped_id;
      if(groupedId) {
        this.dispatchGroupedEdit(groupedId, storage, []);
      }

      const isTranslated = this.appTranslationsManager.hasTriedToTranslateMessage(oldMessage.peerId, oldMessage.mid);
      if(isTranslated && (
        oldMessage.message !== (newMessage as Message.message).message ||
        !deepEqual(oldMessage.entities, (newMessage as Message.message).entities)
      )) {
        this.appTranslationsManager.resetMessageTranslations(oldMessage.peerId, oldMessage.mid);
      }
    }
  }

  private dispatchGroupedEdit(groupedId: string, storage: MessagesStorage, deletedMids?: number[]) {
    const mids = this.getMidsByGroupedId(groupedId);
    const messages = mids.map((mid) => this.getMessageFromStorage(storage, mid)) as Message.message[];
    this.rootScope.dispatchEvent('grouped_edit', {peerId: messages[0].peerId, groupedId, deletedMids: deletedMids || [], messages});
  }

  public getDialogUnreadCount(dialog: Dialog | ForumTopic | MonoforumDialog) {
    let unreadCount = dialog.unread_count;
    if(!isForumTopic(dialog) && !isMonoforumDialog(dialog) && this.appPeersManager.isForum(dialog.peerId) && !dialog.pFlags.view_forum_as_messages) {
      const forumUnreadCount = this.dialogsStorage.getForumUnreadCount(dialog.peerId);
      if(forumUnreadCount instanceof Promise) {
        unreadCount = 0;
      } else {
        unreadCount = forumUnreadCount.count;
      }
    }

    return unreadCount || +!!(dialog as Dialog).pFlags?.unread_mark;
  }

  public isDialogUnread(dialog: AnyDialog | MonoforumDialog) {
    return !isSavedDialog(dialog) && !!this.getDialogUnreadCount(dialog);
  }

  public canForward(message: Message.message | Message.messageService) {
    return message?._ === 'message' &&
      !(message as Message.message).pFlags.noforwards &&
      !this.appPeersManager.noForwards(message.peerId);
  }

  private pushBatchUpdate<E extends keyof BatchUpdates, C extends BatchUpdates[E]>(
    event: E,
    callback: C,
    key: string,
    getElementCallback?: () => MapValueType<ArgumentTypes<C>[0]>
  ) {
    let details = this.batchUpdates[event];
    if(!details) {
      // @ts-ignore
      details = this.batchUpdates[event] = {
        callback,
        batch: new Map()
      };
    }

    if(!details.batch.has(key)) {
      // @ts-ignore
      details.batch.set(key, getElementCallback ? getElementCallback() : undefined);
      this.batchUpdatesDebounced();
    }
  }

  private resetPinnedMessagesCache(peerId: PeerId, mids: number[], pinned: boolean) {
    delete this.pinnedMessages[this.getPinnedMessagesKey(peerId)];
    this.appStateManager.getState().then((state) => {
      delete state.hiddenPinnedMessages[peerId];
      this.rootScope.dispatchEvent('peer_pinned_messages', {peerId, mids, pinned});
    });
  }

  private getMessagesFromMap<T extends Map<any, any>>(map: T) {
    const newMap: Map<Message.message, MapValueType<T>> = new Map();
    for(const [key, value] of map) {
      const [peerIdStr, mid] = key.split('_');
      const message = this.getMessageByPeer(peerIdStr.toPeerId(), +mid) as Message.message;
      if(!message) {
        continue;
      }

      newMap.set(message, value);
    }

    return newMap;
  }

  private batchUpdateViews = (batch: Map<string, undefined>) => {
    const toDispatch: {peerId: PeerId, mid: number, views: number}[] = [];

    const map = this.getMessagesFromMap(batch);
    for(const [message] of map) {
      toDispatch.push({
        peerId: message.peerId,
        mid: message.mid,
        views: message.views
      })
    }

    return toDispatch;
  };

  private batchUpdateReactions = (batch: Map<string, MessageReactions>) => {
    const toDispatch: BroadcastEvents['messages_reactions'] = [];

    const map = this.getMessagesFromMap(batch);
    for(const [message, previousReactions] of map) {
      const results = message.reactions?.results ?? [];
      const previousResults = previousReactions?.results ?? [];
      const changedResults = results.filter((reactionCount) => {
        const previousReactionCount = previousResults.find((_reactionCount) => reactionsEqual(_reactionCount.reaction, reactionCount.reaction));
        return (
          message.pFlags.out && (
            !previousReactionCount ||
            reactionCount.count > previousReactionCount.count
          )
        ) || (
          reactionCount.chosen_order !== undefined && (
            !previousReactionCount ||
            previousReactionCount.chosen_order === undefined
          )
        );
      });

      const removedResults = previousResults.filter((reactionCount) => {
        return !results.some((_reactionCount) => reactionsEqual(_reactionCount.reaction, reactionCount.reaction));
      });

      toDispatch.push({message, changedResults, removedResults});
    }

    return toDispatch;
  };

  public saveDefaultSendAs(peerId: PeerId, sendAsPeerId: PeerId) {
    this.appProfileManager.modifyCachedFullChat<ChatFull.channelFull>(peerId.toChatId(), (channelFull) => {
      channelFull.default_send_as = this.appPeersManager.getOutputPeer(sendAsPeerId);
    });

    return this.apiManager.invokeApi('messages.saveDefaultSendAs', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      send_as: this.appPeersManager.getInputPeerById(sendAsPeerId)
    });
  }

  public sendBotRequestedPeer(peerId: PeerId, mid: number, buttonId: number, requestedPeerIds: PeerId[]) {
    return this.apiManager.invokeApi('messages.sendBotRequestedPeer', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid),
      button_id: buttonId,
      requested_peers: requestedPeerIds.map((peerId) => this.appPeersManager.getInputPeerById(peerId))
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public reportSpam(peerId: PeerId) {
    return this.apiManager.invokeApi('messages.reportSpam', {
      peer: this.appPeersManager.getInputPeerById(peerId)
    });
  }

  private processFactCheckBatch = async(batch: AppMessagesManager['factCheckBatcher']['batchMap']) => {
    for(const [peerId, midsMap] of batch) {
      const mids = [...midsMap.keys()].slice(0, 100);

      try {
        const result = await this.apiManager.invokeApi('messages.getFactCheck', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          msg_id: mids.map((mid) => getServerMessageId(mid))
        });

        result.forEach((factCheck, idx) => {
          const mid = mids[idx];

          const message = this.getMessageByPeer(peerId, mid) as Message.message;
          if(message) {
            this.modifyMessage(message, (message) => {
              message.factcheck = factCheck;
            });
          }

          const promise = midsMap.get(mid);
          promise.resolve(factCheck);
          midsMap.delete(mid);
        });
      } catch(err) {
        mids.forEach((mid) => {
          const promise = midsMap.get(mid);
          promise.reject(err);
          midsMap.delete(mid);
        });
      }

      if(!midsMap.size) {
        batch.delete(peerId);
      }
    }
  };

  public canUpdateFactCheck(peerId: PeerId, mid: number) {
    if(!this.appPeersManager.isBroadcast(peerId)) {
      return false;
    }

    const message = this.getMessageByPeer(peerId, mid);
    if(!canMessageHaveFactCheck(message)) {
      return false;
    }

    return callbackify(this.apiManager.getAppConfig(), (appConfig) => {
      return !!appConfig.can_edit_factcheck;
    });
  }

  public updateFactCheck(peerId: PeerId, mid: number, text?: TextWithEntities) {
    let promise: Promise<Updates>;
    if(!text) {
      promise = this.apiManager.invokeApi('messages.deleteFactCheck', {
        peer: this.appPeersManager.getInputPeerById(peerId),
        msg_id: getServerMessageId(mid)
      });
    } else {
      promise = this.apiManager.invokeApi('messages.editFactCheck', {
        peer: this.appPeersManager.getInputPeerById(peerId),
        msg_id: getServerMessageId(mid),
        text
      });
    }

    return promise.then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public getFactCheck(peerId: PeerId, mid: number) {
    const message = this.getMessageByPeer(peerId, mid) as Message.message;
    if(message && message.factcheck && !message.factcheck.pFlags.need_check) {
      return message.factcheck;
    }

    return this.factCheckBatcher.addToBatch(peerId, mid);
  }

  public reportSponsoredMessage(randomId: SponsoredMessage['random_id'], option: Uint8Array) {
    return this.apiManager.invokeApi('messages.reportSponsoredMessage', {
      random_id: randomId,
      option
    });
  }

  public getSponsoredMessage(peerId: PeerId): Promise<MessagesSponsoredMessages> {
    // return Promise.resolve({
    //   '_': 'messages.sponsoredMessages',
    //   'posts_between': 5,
    //   'messages': Array.from({length: 5}, () => ({
    //     '_': 'sponsoredMessage',
    //     'pFlags': {},
    //     'flags': 9,
    //     'random_id': new Uint8Array([80, 5, 249, 174, 44, 73, 173, 14, 246, 81, 187, 182, 223, 5, 4, 128]),
    //     'from_id': {
    //       '_': 'peerUser',
    //       'user_id': 983000232
    //     },
    //     'message': 'This is a long sponsored message. In fact, it has the maximum length allowed on the platform – 160 characters 😬😬. It\'s promoting a bot with a start parameter.' + peerId,
    //     'url': 'https://t.me/QuizBot?start=GreatMinds',
    //     'title': 'QuizBot',
    //     'button_text': 'Start'
    //   })),
    //   'chats': [],
    //   'users': [
    //     {
    //       '_': 'user',
    //       'pFlags': {
    //         'bot': true,
    //         'verified': true,
    //         'apply_min_photo': true
    //       },
    //       'flags': 34226219,
    //       'id': 983000232,
    //       'access_hash': '-294959558742535650',
    //       'first_name': 'Quiz Bot',
    //       'username': 'QuizBot',
    //       'photo': {
    //         '_': 'userProfilePhoto',
    //         'pFlags': {},
    //         'flags': 2,
    //         'photo_id': '4221953848856651689',
    //         'stripped_thumb': new Uint8Array([1, 8, 8, 155, 247, 95, 103, 255, 0, 110, 138, 40, 174, 132, 142, 6, 238, 127]),
    //         'dc_id': 2
    //       },
    //       'bot_info_version': 11,
    //       'bot_inline_placeholder': 'Search a quiz...',
    //       'sortName': 'quiz bot'
    //     }
    //   ]
    // });

    // * don't show sponsored messages in own channels
    if(!peerId.isUser() && this.canSendToPeer(peerId)) {
      return Promise.resolve({
        _: 'messages.sponsoredMessagesEmpty'
      });
    }

    const promise = this.apiManager.invokeApiCacheable('messages.getSponsoredMessages', {
      peer: this.appPeersManager.getInputPeerById(peerId)
    }, {cacheSeconds: 300});

    return promise.then((sponsoredMessages) => {
      if(sponsoredMessages._ !== 'messages.sponsoredMessages') {
        return sponsoredMessages;
      }

      this.appPeersManager.saveApiPeers(sponsoredMessages);

      const sponsoredMessage = sponsoredMessages.messages.shift();
      sponsoredMessages.messages.push(sponsoredMessage);

      sponsoredMessages.messages.forEach((sponsoredMessage) => {
        if(sponsoredMessage.photo) {
          sponsoredMessage.photo = this.appPhotosManager.savePhoto(sponsoredMessage.photo);
        }

        if(sponsoredMessage.media) {
          this.saveMessageMedia(sponsoredMessage, undefined);
        }

        // sponsoredMessage.pFlags.can_report = true;
      });

      return sponsoredMessages;
    });
  }

  public viewSponsoredMessage(randomId: SponsoredMessage['random_id']) {
    return this.apiManager.invokeApiSingle('messages.viewSponsoredMessage', {
      random_id: randomId
    });
  }

  public clickSponsoredMessage(randomId: SponsoredMessage['random_id']) {
    return this.apiManager.invokeApiSingle('messages.clickSponsoredMessage', {
      random_id: randomId
    });
  }

  public sendQueuedPaidMessages(peerId: PeerId) {
    this.paidMessagesQueue.sendFor(peerId);
  }

  public cancelQueuedPaidMessages(peerId: PeerId) {
    this.paidMessagesQueue.cancelFor(peerId);
  }

  public confirmRepayRequest(requestId: number, confirmedPaymentResult: ConfirmedPaymentResult) {
    this.repayRequestHandler.confirmRepayRequest(requestId, confirmedPaymentResult);
  }

  public cancelRepayRequest(requestId: number) {
    this.repayRequestHandler.cancelRepayRequest(requestId);
  }

  public async updateTodo(params: {
    peerId: PeerId,
    mid: number,
    taskId: number,
    action: 'complete' | 'uncomplete',
  }) {
    // generate message_edit update
    const storage = this.getHistoryMessagesStorage(params.peerId);
    const message = this.getMessageFromStorage(storage, params.mid) as Message.message;
    if(!message) {
      return;
    }

    let oldItem: TodoCompletion;
    this.modifyMessage(message, (message) => {
      const checklist = message.media as MessageMedia.messageMediaToDo;
      if(!checklist.completions) checklist.completions = []
      const now = Date.now() / 1000

      if(params.action === 'complete') {
        const existing = checklist.completions.findIndex((completion) => completion.id === params.taskId);
        if(existing !== -1) {
          checklist.completions.splice(existing, 1);
        }

        checklist.completions.push({
          _: 'todoCompletion',
          id: params.taskId,
          completed_by: this.rootScope.myId,
          date: now
        })
      } else {
        const existing = checklist.completions.findIndex((completion) => completion.id === params.taskId);
        if(existing !== -1) {
          oldItem = checklist.completions[existing];
          checklist.completions.splice(existing, 1);
        }
      }
    }, storage)

    this.rootScope.dispatchEvent('message_edit', {
      storageKey: storage.key,
      peerId: params.peerId,
      mid: params.mid,
      message
    })

    const key = `${params.peerId}:${params.mid}`;
    this.checklistBatcher.addToBatch(key, {taskId: params.taskId, oldItem, action: params.action});
  }

  private processChecklistBatch = async(batch: AppMessagesManager['checklistBatcher']['batchMap']) => {
    for(const [key, list] of batch) {
      const [peerId, mid] = key.split(':').map(Number);

      const completedIds = new Set<number>();
      const incompletedIds = new Set<number>();
      const incompletedItems = new Map<number, TodoCompletion>();

      for(const [{taskId, oldItem, action}, promise] of list) {
        promise.resolve();

        if(action === 'complete') {
          incompletedIds.delete(taskId);
          incompletedItems.delete(taskId);
          completedIds.add(taskId);
        } else {
          completedIds.delete(taskId);
          incompletedIds.add(taskId);
          if(oldItem) {
            incompletedItems.set(taskId, oldItem);
          }
        }
      }

      if(!completedIds.size && !incompletedIds.size) {
        continue;
      }

      try {
        const updates = await this.apiManager.invokeApi('messages.toggleTodoCompleted', {
          completed: Array.from(completedIds),
          incompleted: Array.from(incompletedIds),
          peer: this.appPeersManager.getInputPeerById(peerId),
          msg_id: getServerMessageId(mid)
        });

        this.apiUpdatesManager.processUpdateMessage(updates);
      } catch(e) {
        console.error(e);

        if((e as any).type !== 'MESSAGE_NOT_MODIFIED') {
        // revert
          const storage = this.getHistoryMessagesStorage(peerId);
          const message = this.getMessageFromStorage(storage, mid) as Message.message;
          if(!message) {
            return;
          }

          this.modifyMessage(message, (message) => {
            const checklist = message.media as MessageMedia.messageMediaToDo;
            if(!checklist.completions) checklist.completions = []

            for(const oldItem of incompletedItems.values()) {
              checklist.completions.push(oldItem)
            }

            for(const taskId of completedIds) {
              const idx = checklist.completions.findIndex((completion) => completion.id === taskId);
              if(idx !== -1) {
                checklist.completions.splice(idx, 1);
              }
            }
          }, storage)

          this.rootScope.dispatchEvent('message_edit', {
            storageKey: storage.key,
            peerId,
            mid,
            message
          })
        }
      }
    }

    batch.clear()
  }

  public async appendTodo(params: {
    peerId: PeerId,
    mid: number,
    tasks: TodoItem[]
  }) {
    // generate message_edit update
    const storage = this.getHistoryMessagesStorage(params.peerId);
    const message = this.getMessageFromStorage(storage, params.mid) as Message.message;
    if(!message) {
      return;
    }

    this.modifyMessage(message, (message) => {
      const checklist = message.media as MessageMedia.messageMediaToDo;
      checklist.todo.list.push(...params.tasks);
    }, storage)

    this.rootScope.dispatchEvent('message_edit', {
      storageKey: storage.key,
      peerId: params.peerId,
      mid: params.mid,
      message
    })

    await this.apiManager.invokeApiSingleProcess({
      method: 'messages.appendTodoList',
      params: {
        peer: this.appPeersManager.getInputPeerById(params.peerId),
        msg_id: getServerMessageId(params.mid),
        list: params.tasks
      },
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      }
    })
  }
}

class Batcher<Key, Id, Result> {
  private batchMap: Map<Key, Map<Id, CancellablePromise<Result>>>;
  private delay: number;
  private debounce: boolean;
  private timeoutId: number;
  private _processBatch: (batch: Batcher<Key, Id, Result>['batchMap']) => Promise<any>;

  constructor(options: {
    delay?: number
    debounce?: boolean
    processBatch: (batch: Batcher<Key, Id, Result>['batchMap']) => Promise<any>
  }) {
    this.batchMap = new Map();
    this.delay = options.delay ?? 0;
    this.debounce = options.debounce ?? false;
    this._processBatch = options.processBatch;
  }

  private async processBatch() {
    await this._processBatch(this.batchMap);

    this.timeoutId = undefined;
    if(this.batchMap.size) {
      this.scheduleBatch();
    }
  }

  private scheduleBatch() {
    if(this.debounce && this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    if(!this.timeoutId) {
      this.timeoutId = ctx.setTimeout(() => {
        this.processBatch();
      }, this.delay);
    }
  }

  public addToBatch(key: Key, id: Id): Promise<Result> {
    if(!this.batchMap.has(key)) {
      this.batchMap.set(key, new Map());
    }

    const idMap = this.batchMap.get(key)!;
    const existingPromise = idMap.get(id);

    if(existingPromise) {
      return existingPromise;
    } else {
      const promise = deferredPromise<Result>();
      idMap.set(id, promise);
      this.scheduleBatch();
      return promise;
    }
  }
}
