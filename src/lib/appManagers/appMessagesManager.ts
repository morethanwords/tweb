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
import LazyLoadQueueBase from '../../components/lazyLoadQueueBase';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import tsNow from '../../helpers/tsNow';
import {randomLong} from '../../helpers/random';
import {Chat, ChatFull, Dialog as MTDialog, DialogPeer, DocumentAttribute, InputMedia, InputMessage, InputPeerNotifySettings, InputSingleMedia, Message, MessageAction, MessageEntity, MessageFwdHeader, MessageMedia, MessageReplies, MessageReplyHeader, MessagesDialogs, MessagesFilter, MessagesMessages, MethodDeclMap, NotifyPeer, PeerNotifySettings, PhotoSize, SendMessageAction, Update, Photo, Updates, ReplyMarkup, InputPeer, InputPhoto, InputDocument, InputGeoPoint, WebPage, GeoPoint, ReportReason, MessagesGetDialogs, InputChannel, InputDialogPeer, ReactionCount, MessagePeerReaction, MessagesSearchCounter, Peer, MessageReactions, Document, InputFile, Reaction, ForumTopic as MTForumTopic, MessagesForumTopics, MessagesGetReplies, MessagesGetHistory, MessagesAffectedHistory, UrlAuthResult, MessagesTranscribedAudio} from '../../layer';
import {ArgumentTypes, InvokeApiOptions} from '../../types';
import {logger, LogTypes} from '../logger';
import {ReferenceContext} from '../mtproto/referenceDatabase';
import DialogsStorage, {GLOBAL_FOLDER_ID} from '../storages/dialogs';
import {ChatRights} from './appChatsManager';
import {MyDocument} from './appDocsManager';
import {MyPhoto} from './appPhotosManager';
import {getFileNameByLocation} from '../../helpers/fileName';
import DEBUG from '../../config/debug';
import SlicedArray, {Slice, SliceEnd} from '../../helpers/slicedArray';
import {FOLDER_ID_ALL, GENERAL_TOPIC_ID, MUTE_UNTIL, NULL_PEER_ID, REAL_FOLDER_ID, REPLIES_HIDDEN_CHANNEL_ID, REPLIES_PEER_ID, SERVICE_PEER_ID, THUMB_TYPE_FULL} from '../mtproto/mtproto_config';
// import telegramMeWebManager from '../mtproto/telegramMeWebManager';
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
import getPhotoDownloadOptions from './utils/photos/getPhotoDownloadOptions';
import fixEmoji from '../richTextProcessor/fixEmoji';
import mergeEntities from '../richTextProcessor/mergeEntities';
import parseEntities from '../richTextProcessor/parseEntities';
import parseMarkdown from '../richTextProcessor/parseMarkdown';
import getServerMessageId from './utils/messageId/getServerMessageId';
import generateMessageId from './utils/messageId/generateMessageId';
import filterMessagesByInputFilter from './utils/messages/filterMessagesByInputFilter';
import ctx from '../../environment/ctx';
import {getEnvironment} from '../../environment/utils';
import getDialogIndex from './utils/dialogs/getDialogIndex';
import defineNotNumerableProperties from '../../helpers/object/defineNotNumerableProperties';
import getDocumentMediaInput from './utils/docs/getDocumentMediaInput';
import getDocumentInputFileName from './utils/docs/getDocumentInputFileName';
import getFileNameForUpload from '../../helpers/getFileNameForUpload';
import noop from '../../helpers/noop';
import appTabsManager from './appTabsManager';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';
import getAlbumText from './utils/messages/getAlbumText';
import pause from '../../helpers/schedulers/pause';
import makeError from '../../helpers/makeError';
import getStickerEffectThumb from './utils/stickers/getStickerEffectThumb';
import getDocumentInput from './utils/docs/getDocumentInput';
import reactionsEqual from './utils/reactions/reactionsEqual';
import getPeerActiveUsernames from './utils/peers/getPeerActiveUsernames';
import {BroadcastEvents} from '../rootScope';
import setBooleanFlag from '../../helpers/object/setBooleanFlag';
import getMessageThreadId from './utils/messages/getMessageThreadId';

// console.trace('include');
// TODO: если удалить диалог находясь в папке, то он не удалится из папки и будет виден в настройках

const APITIMEOUT = 0;
const DO_NOT_READ_HISTORY = false;

export type SendFileDetails = {
  file: File | Blob | MyDocument,
} & Partial<{
  duration: number,
  width: number,
  height: number,
  objectURL: string,
  thumb: {
    blob: Blob,
    url: string,
    size: MediaSize
  },
  strippedBytes: PhotoSize.photoStrippedSize['bytes'],
  spoiler: boolean
}>;

export type HistoryStorage = {
  count: number | null,
  history: SlicedArray<number>,

  maxId?: number,
  readPromise?: Promise<void>,
  readMaxId?: number,
  readOutboxMaxId?: number,
  triedToReadMaxId?: number,

  maxOutId?: number,
  replyMarkup?: Exclude<ReplyMarkup, ReplyMarkup.replyInlineMarkup>
};

export type HistoryResult = {
  count: number,
  history: number[],
  isEnd: ReturnType<Slice<number>['getEnds']>,
  offsetIdOffset?: number,
};

export type Dialog = MTDialog.dialog;
export type ForumTopic = MTForumTopic.forumTopic;

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

const UPDATE_STICKERSET_ORDER = true;

export type MessageSendingParams = Partial<{
  threadId: number,
  replyToMsgId: number,
  scheduleDate: number,
  silent: boolean,
  sendAsPeerId: number,
}>;

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
    [peerId: PeerId]: Partial<{
      [inputFilter in MyInputMessagesFilter]: {
        count?: number,
        history: number[]
      }
    }>
  };
  private pinnedMessages: {[key: string]: PinnedStorage};

  private threadsServiceMessagesIdsStorage: {[peerId_threadId: string]: number};
  private threadsToReplies: {
    [peerId_threadId: string]: string;
  };

  private pendingByRandomId: {
    [randomId: string]: PendingMessageDetails
  } = {};
  private pendingByMessageId: {[mid: string]: Long} = {};
  private pendingAfterMsgs: {[peerId: PeerId]: PendingAfterMsg} = {};
  public pendingTopMsgs: {[peerId: PeerId]: number} = {};
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

  private maxSeenId = 0;

  public migratedFromTo: {[peerId: PeerId]: PeerId} = {};
  public migratedToFrom: {[peerId: PeerId]: PeerId} = {};

  private newDialogsHandlePromise: Promise<any>;
  private newDialogsToHandle: Map<PeerId, {dialog?: Dialog, topics?: Map<number, ForumTopic>}> = new Map();
  public newUpdatesAfterReloadToHandle: {[key: string]: Set<Update>} = {};

  private notificationsHandlePromise: number;
  private notificationsToHandle: {[key: string]: {
    fwdCount: number,
    fromId: PeerId,
    topMessage?: MyMessage
  }} = {};

  private reloadConversationsPromise: Promise<void>;
  private reloadConversationsPeers: Map<PeerId, {inputDialogPeer: InputDialogPeer, promise: CancellablePromise<Dialog>}> = new Map();

  public log = logger('MESSAGES', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn);

  private groupedTempId = 0;

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

  protected after() {
    this.clear(true);

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
      const dialogs = this.dialogsStorage.getFolderDialogs(0).concat(this.dialogsStorage.getFolderDialogs(1));
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
        if(!message) return;
        message.media = {
          _: 'messageMediaWebPage',
          webpage: this.appWebPagesManager.getCachedWebPage(id)
        };

        this.rootScope.dispatchEvent('message_edit', {
          storageKey: storage.key,
          peerId,
          mid,
          message
        });
      });
    });

    this.rootScope.addEventListener('draft_updated', ({peerId, threadId, draft}) => {
      const dialog = this.dialogsStorage.getDialogOrTopic(peerId, threadId);
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
      if(set) {
        for(const key of set) {
          const [peerId, mid] = key.split('_');

          const message = this.getMessageByPeer(peerId.toPeerId(), +mid);
          if(message) {
            this.setDialogToStateIfMessageIsTop(message);
          }
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
          // @ts-ignore
          rootScope.dispatchEvent(event as keyof BatchUpdates, result);
        }
      }
    }, 33, false, true);

    return this.appStateManager.getState().then((state) => {
      if(state.maxSeenMsgId) {
        this.maxSeenId = state.maxSeenMsgId;
      }
    });
  }

  public clear = (init?: boolean) => {
    if(this.middleware) {
      this.middleware.clean();
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

    this.dialogsStorage && this.dialogsStorage.clear(init);
    this.filtersStorage && this.filtersStorage.clear(init);
  };

  public getInputEntities(entities: MessageEntity[]) {
    const sendEntites = copy(entities);
    sendEntites.forEach((entity) => {
      if(entity._ === 'messageEntityMentionName') {
        (entity as any as MessageEntity.inputMessageEntityMentionName)._ = 'inputMessageEntityMentionName';
        (entity as any as MessageEntity.inputMessageEntityMentionName).user_id = this.appUsersManager.getUserInput(entity.user_id);
      }
    });
    return sendEntites;
  }

  public invokeAfterMessageIsSent(tempId: number, callbackName: string, callback: (message: MyMessage) => Promise<any>) {
    const finalize = this.tempFinalizeCallbacks[tempId] ??= {};
    const obj = finalize[callbackName] ??= {deferred: deferredPromise<void>()};

    obj.callback = callback;

    return obj.deferred;
  }

  public editMessage(message: any, text: string, options: Partial<{
    noWebPage: true,
    newMedia: any,
    scheduleDate: number,
    entities: MessageEntity[]
  }> = {}): Promise<void> {
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

    const entities = options.entities || [];
    if(text) {
      text = parseMarkdown(text, entities);
    }

    const schedule_date = options.scheduleDate || (message.pFlags.is_scheduled ? message.date : undefined);
    return this.apiManager.invokeApi('messages.editMessage', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: message.id,
      message: text,
      media: options.newMedia,
      entities: entities.length ? this.getInputEntities(entities) : undefined,
      no_webpage: options.noWebPage,
      schedule_date
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
    }, (error) => {
      this.log.error('editMessage error:', error);

      if(error && error.type === 'MESSAGE_NOT_MODIFIED') {
        error.handled = true;
        return;
      }
      if(error && error.type === 'MESSAGE_EMPTY') {
        error.handled = true;
      }
      return Promise.reject(error);
    });
  }

  public async transcribeAudio(message: Message.message): Promise<MessagesTranscribedAudio> {
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
    };

    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.transcribeAudio',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        msg_id: id
      },
      processResult: (result) => {
        process(result);
        return result;
      },
      processError: (error) => {
        if(error.type === 'TRANSCRIPTION_FAILED') {
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
  }

  public async sendText(peerId: PeerId, text: string, options: MessageSendingParams & Partial<{
    entities: MessageEntity[],
    viaBotId: BotId,
    queryId: string,
    resultId: string,
    noWebPage: true,
    replyMarkup: ReplyMarkup,
    clearDraft: true,
    webPage: WebPage,
  }> = {}): Promise<void> {
    if(!text.trim()) {
      return;
    }

    options.entities ??= [];

    // this.checkSendOptions(options);
    if(options.threadId && !options.replyToMsgId) {
      options.replyToMsgId = options.threadId;
    }

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

    const entities = options.entities;
    if(!options.viaBotId) {
      text = parseMarkdown(text, entities);
      // entities = mergeEntities(entities, parseEntities(text));
    }

    let sendEntites = this.getInputEntities(entities);
    if(!sendEntites.length) {
      sendEntites = undefined;
    }

    const message = this.generateOutgoingMessage(peerId, options);
    message.entities = entities;
    message.message = text;

    const replyToMsgId = options.replyToMsgId ? getServerMessageId(options.replyToMsgId) : undefined;
    const isChannel = this.appPeersManager.isChannel(peerId);

    if(options.webPage) {
      message.media = {
        _: 'messageMediaWebPage',
        webpage: options.webPage
      };
    }

    const toggleError = (error?: ApiError) => {
      this.onMessagesSendError([message], error);
      this.rootScope.dispatchEvent('messages_pending');
    };

    message.send = () => {
      toggleError();
      const sentRequestOptions: PendingAfterMsg = {};
      if(this.pendingAfterMsgs[peerId]) {
        sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
      }

      const sendAs = options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
      let apiPromise: any;
      if(options.viaBotId) {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId || undefined,
          query_id: options.queryId,
          id: options.resultId,
          clear_draft: options.clearDraft,
          send_as: sendAs
        }, sentRequestOptions);
      } else {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendMessage', {
          no_webpage: options.noWebPage,
          peer: this.appPeersManager.getInputPeerById(peerId),
          message: text,
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId || undefined,
          entities: sendEntites,
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate || undefined,
          silent: options.silent,
          send_as: sendAs,
          update_stickersets_order: UPDATE_STICKERSET_ORDER
        }, sentRequestOptions);
      }

      /* function is<T>(value: any, condition: boolean): value is T {
        return condition;
      } */

      // this.log('sendText', message.mid);
      this.pendingAfterMsgs[peerId] = sentRequestOptions;

      return apiPromise.then((updates: Updates) => {
        // this.log('sendText sent', message.mid);
        // if(is<Updates.updateShortSentMessage>(updates, updates._ === 'updateShortSentMessage')) {
        if(updates._ === 'updateShortSentMessage') {
          // assumeType<Updates.updateShortSentMessage>(updates);

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
          this.wrapMessageEntities(newMessage);
          if(updates.pFlags.out) {
            newMessage.pFlags.out = true;
          }

          // * override with new updates
          updates = {
            _: 'updates',
            users: [],
            chats: [],
            seq: 0,
            date: undefined,
            updates: [{
              _: 'updateMessageID',
              random_id: message.random_id,
              id: newMessage.id
            }, {
              _: options.scheduleDate ? 'updateNewScheduledMessage' : (isChannel ? 'updateNewChannelMessage' : 'updateNewMessage'),
              message: newMessage,
              pts: updates.pts,
              pts_count: updates.pts_count
            }]
          };
        } else if((updates as Updates.updates).updates) {
          (updates as Updates.updates).updates.forEach((update) => {
            if(update._ === 'updateDraftMessage') {
              update.local = true;
            }
          });
        }

        // this.reloadConversation(peerId);

        // setTimeout(() => {
        this.apiUpdatesManager.processUpdateMessage(updates);
        // }, 5000);
        message.promise.resolve();
      }, (error: ApiError) => {
        toggleError(error);
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
      sequential: true
    });

    const promises: ReturnType<AppMessagesManager['sendText']>[] = [message.promise];
    for(let i = 1; i < splitted.length; ++i) {
      promises.push(this.sendText(peerId, splitted[i], options));
    }

    return Promise.all(promises).then(noop);
  }

  public sendFile(peerId: PeerId, options: MessageSendingParams & SendFileDetails & Partial<{
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

    // ! only for internal use
    processAfter?: typeof processAfter
  }>) {
    const file = options.file;
    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    // this.checkSendOptions(options);

    const message = this.generateOutgoingMessage(peerId, options);
    const replyToMsgId = options.replyToMsgId ? getServerMessageId(options.replyToMsgId) : undefined;

    let attachType: 'document' | 'audio' | 'video' | 'voice' | 'photo', apiFileName: string;

    const fileType = 'mime_type' in file ? file.mime_type : file.type;
    const fileName = file instanceof File ? file.name : '';
    const isDocument = !(file instanceof File) && !(file instanceof Blob);
    let caption = options.caption || '';

    this.log('sendFile', file, fileType);

    const entities = options.entities || [];
    if(caption) {
      caption = parseMarkdown(caption, entities);
    }

    const attributes: DocumentAttribute[] = [];

    const isPhoto = getEnvironment().IMAGE_MIME_TYPES_SUPPORTED.has(fileType);

    const strippedPhotoSize: PhotoSize.photoStrippedSize = options.strippedBytes && {
      _: 'photoStrippedSize',
      bytes: options.strippedBytes,
      type: 'i'
    };

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
        message.pFlags.media_unread = true;
      }

      const attribute: DocumentAttribute.documentAttributeAudio = {
        _: 'documentAttributeAudio',
        pFlags: {
          voice: options.isVoiceMessage || undefined
        },
        waveform: options.waveform,
        duration: options.duration || 0
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
        id: '' + message.id,
        sizes: [photoSize],
        w: options.width,
        h: options.height
      } as any;

      if(strippedPhotoSize) {
        photo.sizes.unshift(strippedPhotoSize);
      }

      const cacheContext = this.thumbsStorage.getCacheContext(photo, photoSize.type);
      cacheContext.downloaded = file.size;
      cacheContext.url = options.objectURL || '';

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
      if(options.noSound &&
        file.size > (10 * 1024) &&
        file.size < (10 * 1024 * 1024)) {
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

    if((['document', 'video', 'audio', 'voice'] as (typeof attachType)[]).indexOf(attachType) !== -1 && !isDocument) {
      const thumbs: PhotoSize[] = [];
      document = {
        _: 'document',
        id: '' + message.id,
        duration: options.duration,
        attributes,
        w: options.width,
        h: options.height,
        thumbs,
        mime_type: fileType,
        size: file.size
      } as any;

      if(options.objectURL) {
        const cacheContext = this.thumbsStorage.getCacheContext(document);
        cacheContext.downloaded = file.size;
        cacheContext.url = options.objectURL;
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

          const thumbCacheContext = this.thumbsStorage.getCacheContext(document, thumb.type);
          thumbCacheContext.downloaded = thumb.size;
          thumbCacheContext.url = options.thumb.url;
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

    message.entities = entities;
    message.message = caption;
    message.media = isDocument ? {
      _: 'messageMediaDocument',
      pFlags: {},
      document: file
    } as MessageMedia.messageMediaDocument : media;

    const uploadingFileName = !isDocument ? getFileNameForUpload(file) : undefined;
    message.uploadingFileName = uploadingFileName;

    if(uploadingFileName) {
      this.uploadFilePromises[uploadingFileName] = sentDeferred;
    }

    const toggleError = (error?: ApiError) => {
      this.onMessagesSendError([message], error);
      this.rootScope.dispatchEvent('messages_pending');
    };

    let uploaded = false,
      uploadPromise: ReturnType<ApiFileManager['upload']> = null;

    message.send = () => {
      if(isDocument) {
        const inputMedia: InputMedia = {
          _: 'inputMediaDocument',
          id: getDocumentInput(file),
          pFlags: {}
        };

        sentDeferred.resolve(inputMedia);
      } else if(file instanceof File || file instanceof Blob) {
        const load = () => {
          if(!uploaded || message.error) {
            uploaded = false;

            uploadPromise = this.apiFileManager.upload({file, fileName: uploadingFileName});
            uploadPromise.catch((err) => {
              if(!uploaded) {
                this.log('cancelling upload', media);

                this.cancelPendingMessage(message.random_id);
                this.setTyping(peerId, {_: 'sendMessageCancelAction'}, undefined, options.threadId);
                sentDeferred.reject(err);
              }
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

          let thumbUploadPromise: typeof uploadPromise;
          if(attachType === 'video' && options.objectURL && options.thumb?.blob) {
            thumbUploadPromise = this.apiFileManager.upload({file: options.thumb.blob});
          }

          uploadPromise && uploadPromise.then(async(inputFile) => {
            /* if(DEBUG) {
              this.log('appMessagesManager: sendFile uploaded:', inputFile);
            } */

            inputFile.name = apiFileName;
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

            if(thumbUploadPromise) {
              try {
                const inputFile = await thumbUploadPromise;
                (inputMedia as InputMedia.inputMediaUploadedDocument).thumb = inputFile;
              } catch(err) {
                this.log.error('sendFile thumb upload error:', err);
              }
            }

            sentDeferred.resolve(inputMedia);
          }, (error: ApiError) => {
            toggleError(error);
            throw error;
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

    this.beforeMessageSending(message, {
      isGroupedItem: options.isGroupedItem,
      isScheduled: !!options.scheduleDate || undefined,
      threadId: options.threadId,
      clearDraft: options.clearDraft,
      processAfter: options.processAfter
    });

    if(!options.isGroupedItem) {
      sentDeferred.then((inputMedia) => {
        this.setTyping(peerId, {_: 'sendMessageCancelAction'}, undefined, options.threadId);

        return this.apiManager.invokeApi('messages.sendMedia', {
          background: options.background,
          peer: this.appPeersManager.getInputPeerById(peerId),
          media: inputMedia,
          message: caption,
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId,
          schedule_date: options.scheduleDate,
          silent: options.silent,
          entities,
          clear_draft: options.clearDraft,
          send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
        }).then((updates) => {
          this.apiUpdatesManager.processUpdateMessage(updates);
        }, (error: ApiError) => {
          if(attachType === 'photo' &&
            error.code === 400 &&
            (error.type === 'PHOTO_INVALID_DIMENSIONS' ||
            error.type === 'PHOTO_SAVE_FILE_INVALID')) {
            error.handled = true;
            attachType = 'document';
            message.send();
            return;
          }

          toggleError(error);
          throw error;
        });
      });

      sentDeferred.then(message.promise.resolve, message.promise.reject);
    }

    const ret: {
      message: typeof message,
      promise: typeof sentDeferred
    } = {
      message
    } as any;

    defineNotNumerableProperties(ret, ['promise']);
    ret.promise = sentDeferred;

    return ret;
  }

  public async sendAlbum(peerId: PeerId, options: MessageSendingParams & {
    isMedia?: boolean,
    entities?: MessageEntity[],
    caption?: string,
    sendFileDetails: SendFileDetails[],
    clearDraft?: boolean
  }) {
    // this.checkSendOptions(options);

    if(options.threadId && !options.replyToMsgId) {
      options.replyToMsgId = options.threadId;
    }

    if(options.sendFileDetails.length === 1) {
      return this.sendFile(peerId, {...options, ...options.sendFileDetails[0]});
    }

    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;
    const replyToMsgId = options.replyToMsgId ? getServerMessageId(options.replyToMsgId) : undefined;

    let caption = options.caption || '';
    let entities = options.entities || [];
    if(caption) {
      caption = parseMarkdown(caption, entities);
    }

    this.log('sendAlbum', options);

    const groupId = '' + ++this.groupedTempId;

    const callbacks: Array<() => void> = [];
    const processAfter = (cb: () => void) => {
      callbacks.push(cb);
    };

    const messages = options.sendFileDetails.map((details, idx) => {
      const o: Parameters<AppMessagesManager['sendFile']>[1] = {
        isGroupedItem: true,
        isMedia: options.isMedia,
        scheduleDate: options.scheduleDate,
        silent: options.silent,
        replyToMsgId,
        threadId: options.threadId,
        sendAsPeerId: options.sendAsPeerId,
        groupId,
        processAfter,
        ...details
      };

      if(idx === 0) {
        o.caption = caption;
        o.entities = entities;
        // o.replyToMsgId = replyToMsgId;
      }

      return this.sendFile(peerId, o).message;
    });

    if(options.clearDraft) {
      callbacks.push(() => {
        this.appDraftsManager.clearDraft(peerId, options.threadId);
      });
    }

    callbacks.forEach((callback) => {
      callback();
    });

    // * test pending
    // return;

    const toggleError = (message: Message.message, error?: ApiError) => {
      this.onMessagesSendError([message], error);
      this.rootScope.dispatchEvent('messages_pending');
    };

    const inputPeer = this.appPeersManager.getInputPeerById(peerId);
    const invoke = (multiMedia: InputSingleMedia[]) => {
      this.setTyping(peerId, {_: 'sendMessageCancelAction'}, undefined, options.threadId);

      const deferred = deferredPromise<void>();
      this.sendSmthLazyLoadQueue.push({
        load: () => {
          return this.apiManager.invokeApi('messages.sendMultiMedia', {
            peer: inputPeer,
            multi_media: multiMedia,
            reply_to_msg_id: replyToMsgId,
            schedule_date: options.scheduleDate,
            silent: options.silent,
            clear_draft: options.clearDraft,
            send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined,
            update_stickersets_order: UPDATE_STICKERSET_ORDER
          }).then((updates) => {
            this.apiUpdatesManager.processUpdateMessage(updates);
            deferred.resolve();
          }, (error: ApiError) => {
            messages.forEach((message) => toggleError(message, error));
            deferred.reject(error);
          });
        }
      });

      return deferred;
    };

    const promises: Promise<InputSingleMedia>[] = messages.map((message) => {
      return (message.send() as Promise<InputMedia>).then((inputMedia) => {
        return Promise.all([
          inputMedia,
          this.apiManager.invokeApi('messages.uploadMedia', {
            peer: inputPeer,
            media: inputMedia
          })
        ]);
      })
      .then(([originalInputMedia, messageMedia]) => {
        let inputMedia: InputMedia;
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
          random_id: message.random_id,
          message: caption,
          entities
        };

        // * only 1 caption for all inputs
        if(caption) {
          caption = '';
          entities = [];
        }

        return inputSingleMedia;
      }).catch((err: ApiError) => {
        this.log.error('sendAlbum upload item error:', err, message);
        toggleError(message, err);
        throw err;
      });
    });

    return Promise.all(promises).then((inputs) => {
      return invoke(inputs.filter(Boolean));
    });
  }

  public sendContact(peerId: PeerId, contactPeerId: PeerId) {
    return this.sendOther(peerId, this.appUsersManager.getContactMediaInput(contactPeerId));
  }

  public sendOther(
    peerId: PeerId,
    inputMedia: InputMedia | {_: 'messageMediaPending', messageMedia: MessageMedia},
    options: MessageSendingParams & Partial<{
      viaBotId: BotId,
      replyMarkup: ReplyMarkup,
      clearDraft: true,
      queryId: string
      resultId: string,
      geoPoint: GeoPoint
    }> = {}
  ) {
    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    // this.checkSendOptions(options);
    const message = this.generateOutgoingMessage(peerId, options);
    const replyToMsgId = options.replyToMsgId ? getServerMessageId(options.replyToMsgId) : undefined;

    let media: MessageMedia;
    switch(inputMedia._) {
      case 'inputMediaPoll': {
        const pollId = '' + message.id;
        inputMedia.poll.id = pollId;
        this.appPollsManager.savePoll(inputMedia.poll, {
          _: 'pollResults',
          flags: 4,
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

      case 'messageMediaPending': {
        media = (inputMedia as any).messageMedia;
        break;
      }
    }

    message.media = media;

    const toggleError = (error?: ApiError) => {
      this.onMessagesSendError([message], error);
      this.rootScope.dispatchEvent('messages_pending');
    };

    message.send = () => {
      const sentRequestOptions: PendingAfterMsg = {};
      if(this.pendingAfterMsgs[peerId]) {
        sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
      }

      const sendAs = options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined;
      let apiPromise: Promise<any>;
      if(options.viaBotId) {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId || undefined,
          query_id: options.queryId,
          id: options.resultId,
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate,
          silent: options.silent,
          send_as: sendAs
        }, sentRequestOptions);
      } else {
        apiPromise = this.apiManager.invokeApiAfter('messages.sendMedia', {
          peer: this.appPeersManager.getInputPeerById(peerId),
          media: inputMedia as InputMedia,
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId || undefined,
          message: '',
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate,
          silent: options.silent,
          send_as: sendAs,
          update_stickersets_order: UPDATE_STICKERSET_ORDER
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
      }, (error: ApiError) => {
        toggleError(error);
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
      sequential: true
    });

    return message.promise;
  }

  /* private checkSendOptions(options: Partial<{
    scheduleDate: number
  }>) {
    if(options.scheduleDate) {
      const minTimestamp = (Date.now() / 1000 | 0) + 10;
      if(options.scheduleDate <= minTimestamp) {
        delete options.scheduleDate;
      }
    }
  } */

  private beforeMessageSending(message: Message.message, options: Pick<MessageSendingParams, 'threadId'> & Partial<{
    isGroupedItem: boolean,
    isScheduled: boolean,
    clearDraft: boolean,
    sequential: boolean,
    processAfter?: (cb: () => void) => void
  }> = {}) {
    const messageId = message.id;
    const peerId = this.getMessagePeer(message);
    const storage = options.isScheduled ? this.getScheduledMessagesStorage(peerId) : this.getHistoryMessagesStorage(peerId);
    message.storageKey = storage.key;
    const callbacks: Array<() => void> = [];
    if(options.isScheduled) {
      // if(!options.isGroupedItem) {
      this.saveMessages([message], {storage, isScheduled: true, isOutgoing: true});
      callbacks.push(() => {
        this.rootScope.dispatchEvent('scheduled_new', message);
      });
    } else {
      /* if(options.threadId && this.threadsStorage[peerId]) {
        delete this.threadsStorage[peerId][options.threadId];
      } */
      const storages: HistoryStorage[] = [
        this.getHistoryStorage(peerId),
        options.threadId ? this.getHistoryStorage(peerId, options.threadId) : undefined
      ];

      for(const storage of storages) {
        if(storage) {
          storage.history.unshift(messageId);
        }
      }

      this.saveMessages([message], {storage, isOutgoing: true});
      this.setDialogTopMessage(message);

      if(options.threadId) {
        const forumTopic = this.dialogsStorage.getForumTopic(peerId, options.threadId);
        if(forumTopic) {
          this.setDialogTopMessage(message, forumTopic);
        }
      }

      callbacks.push(() => {
        this.rootScope.dispatchEvent('history_append', {storageKey: storage.key, message});
      });
    }

    const pending: PendingMessageDetails = this.pendingByRandomId[message.random_id] = {
      peerId,
      tempId: messageId,
      threadId: options.threadId,
      storage,
      sequential: options.sequential
    };

    this.pendingTopMsgs[peerId] = messageId;

    if(!options.isGroupedItem && message.send) {
      callbacks.push(() => {
        if(options.clearDraft) {
          this.appDraftsManager.clearDraft(peerId, options.threadId);
        }

        message.send();
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

  private generateOutgoingMessage(peerId: PeerId, options: MessageSendingParams & Partial<{
    viaBotId: BotId,
    groupId: string,
    replyMarkup: ReplyMarkup,
  }>) {
    if(options.threadId && !options.replyToMsgId) {
      options.replyToMsgId = options.threadId;
    }

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

    const message: Message.message = {
      _: 'message',
      id: this.generateTempMessageId(peerId),
      from_id: options.sendAsPeerId ? this.appPeersManager.getOutputPeer(options.sendAsPeerId) : this.generateFromId(peerId),
      peer_id: this.appPeersManager.getOutputPeer(peerId),
      post_author: postAuthor,
      pFlags: this.generateFlags(peerId),
      date: options.scheduleDate || (tsNow(true) + this.timeManager.getServerTimeOffset()),
      message: '',
      grouped_id: options.groupId,
      random_id: randomLong(),
      reply_to: this.generateReplyHeader(peerId, options.replyToMsgId, options.threadId),
      via_bot_id: options.viaBotId,
      reply_markup: options.replyMarkup,
      replies: this.generateReplies(peerId),
      views: isBroadcast && 1,
      pending: true
    };

    defineNotNumerableProperties(message, ['send', 'promise']);
    if(options.groupId === undefined) {
      message.promise = deferredPromise();
    }

    return message;
  }

  private generateReplyHeader(peerId: PeerId, replyToMsgId: number, replyToTopId?: number) {
    const isForum = this.appPeersManager.isForum(peerId);
    if(isForum && !replyToTopId) {
      const originalMessage = this.getMessageByPeer(peerId, replyToMsgId);
      if(originalMessage) {
        replyToTopId = getMessageThreadId(originalMessage, true);
      }
    }

    const header: MessageReplyHeader = {
      _: 'messageReplyHeader',
      reply_to_msg_id: replyToMsgId || replyToTopId,
      pFlags: {}
    };

    if(replyToTopId && isForum && GENERAL_TOPIC_ID !== replyToTopId) {
      header.pFlags.forum_topic = true;
    }

    if(replyToTopId && header.reply_to_msg_id !== replyToTopId) {
      header.reply_to_top_id = replyToTopId;
    }

    return header;
  }

  private generateReplies(peerId: PeerId) {
    let replies: MessageReplies.messageReplies;
    if(this.appPeersManager.isBroadcast(peerId)) {
      const channelFull = this.appProfileManager.getCachedFullChat(peerId.toChatId()) as ChatFull.channelFull;
      if(channelFull?.linked_chat_id) {
        replies = {
          _: 'messageReplies',
          flags: 1,
          pFlags: {
            comments: true
          },
          channel_id: channelFull.linked_chat_id,
          replies: 0,
          replies_pts: 0
        };
      }
    }

    return replies;
  }

  /**
   * Generate correct from_id according to anonymous or broadcast
   */
  private generateFromId(peerId: PeerId) {
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

  private generateForwardHeader(peerId: PeerId, originalMessage: Message.message) {
    const myId = this.appUsersManager.getSelf().id.toPeerId();
    const fromId = originalMessage.fromId;
    if(fromId === myId && originalMessage.peerId === myId && !originalMessage.fwd_from) {
      return;
    }

    const fwdHeader: MessageFwdHeader.messageFwdHeader = {
      _: 'messageFwdHeader',
      flags: 0,
      date: originalMessage.date,
      pFlags: {}
    };

    let isUserHidden = false;
    if(originalMessage.fwd_from) {
      fwdHeader.from_id = originalMessage.fwd_from.from_id;
      fwdHeader.from_name = originalMessage.fwd_from.from_name;
      fwdHeader.post_author = originalMessage.fwd_from.post_author;
    } else {
      fwdHeader.post_author = originalMessage.post_author;

      if(fromId.isUser()) {
        const userFull = this.appProfileManager.getCachedFullUser(fromId.toUserId());
        if(userFull?.private_forward_name) {
          fwdHeader.from_name = userFull.private_forward_name;
          isUserHidden = true;
        }
      }

      if(!isUserHidden) {
        fwdHeader.from_id = this.appPeersManager.getOutputPeer(fromId);
      }
    }

    if(this.appPeersManager.isBroadcast(originalMessage.peerId)) {
      if(originalMessage.post_author) {
        fwdHeader.post_author = originalMessage.post_author;
      }

      fwdHeader.channel_post = originalMessage.id;
    }

    if(peerId === myId && !isUserHidden) {
      fwdHeader.saved_from_msg_id = originalMessage.id;
      fwdHeader.saved_from_peer = this.appPeersManager.getOutputPeer(originalMessage.peerId);
    }

    return fwdHeader;
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
    dialog: MTDialog.dialog | ForumTopic = this.getDialogOnly(message.peerId)
  ) {
    if(!dialog) {
      return;
    }

    dialog.top_message = message.mid;

    const historyStorage = this.getHistoryStorage(message.peerId, dialog._ === 'forumTopic' ? dialog.id : undefined);
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

      this.apiUpdatesManager.processLocalUpdate({
        _: 'updateDeleteMessages',
        messages: [tempId],
        pts: undefined,
        pts_count: undefined
      });

      historyStorage.history.delete(tempId);

      delete this.pendingByRandomId[randomId];
      storage.delete(tempId);

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
          const mid = generateMessageId(dialog.top_message);
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
      if(!middleware() || result.isEnd) {
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
      const readMaxId = peerId.isUser() ? Math.max(historyStorage.readMaxId, historyStorage.readOutboxMaxId) : historyStorage.readMaxId;
      // readMaxId can be 4294967295 (0)
      return !message?.pFlags?.out && readMaxId < historyStorage.maxId && getServerMessageId(readMaxId) ? readMaxId : 0;
    }
  }

  // public lolSet = new Set();
  public getTopMessages({limit, folderId}: {
    limit: number,
    folderId: number
  }) {
    // const dialogs = this.dialogsStorage.getFolder(folderId);
    const offsetId = 0;
    let offsetPeerId: PeerId;
    let offsetIndex = 0;

    let offsetDate = this.dialogsStorage.getOffsetDate(folderId);
    if(offsetDate) {
      offsetIndex = offsetDate * 0x10000;
      offsetDate += this.timeManager.getServerTimeOffset();
    }

    const useLimit = 100;
    const middleware = this.middleware.get();
    const peerId = this.dialogsStorage.isFilterIdForForum(folderId) ? folderId : undefined;

    const processResult = (result: MessagesDialogs | MessagesForumTopics) => {
      if(!middleware() || result._ === 'messages.dialogsNotModified') return null;

      if(DEBUG) {
        this.log('messages.getDialogs result:', result);
      }

      // can reset pinned order here
      if(!peerId && !offsetId && !offsetDate && !offsetPeerId && folderId !== GLOBAL_FOLDER_ID) {
        this.dialogsStorage.resetPinnedOrder(folderId);
      }

      if(!peerId && !offsetDate) {
        // telegramMeWebManager.setAuthorized(true);
        this.appDraftsManager.addMissedDialogs();
      }

      this.appUsersManager.saveApiUsers(result.users);
      this.appChatsManager.saveApiChats(result.chats);
      this.saveMessages(result.messages);

      let maxSeenIdIncremented = offsetDate ? true : false;
      let hasPrepend = false;
      const noIdsDialogs: BroadcastEvents['dialogs_multiupdate'] = new Map();
      const setFolderId: REAL_FOLDER_ID = folderId === GLOBAL_FOLDER_ID ? FOLDER_ID_ALL : folderId as REAL_FOLDER_ID;
      const saveGlobalOffset = !!peerId || folderId === GLOBAL_FOLDER_ID;
      const items: Array<Dialog | ForumTopic> =
        (result as MessagesDialogs.messagesDialogsSlice).dialogs as Dialog[] ||
        (result as MessagesForumTopics).topics as ForumTopic[];
      forEachReverse(items, (dialog) => {
        if(!dialog) {
          return;
        }

        // const d = Object.assign({}, dialog);
        // ! нужно передавать folderId, так как по папке !== 0 нет свойства folder_id
        if(!peerId) {
          (dialog as Dialog).folder_id ??= setFolderId;
        }

        this.dialogsStorage.saveDialog({
          dialog,
          ignoreOffsetDate: true,
          saveGlobalOffset
        });

        if(dialog.peerId === undefined) {
          this.log.error('bugged dialog?', dialog);
          debugger;
          return;
        }

        if(!maxSeenIdIncremented &&
          !this.appPeersManager.isChannel(dialog.peerId || this.appPeersManager.getPeerId(dialog.peer))) {
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
        if(!peerId && !getServerMessageId(dialog.read_inbox_max_id) && !getServerMessageId(dialog.read_outbox_max_id)) {
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
      for(let i = 0, length = folderDialogs.length; i < length; ++i) {
        const dialog = folderDialogs[i];
        if(getServerMessageId(dialog.top_message)) {
          ++dialogsLength;
        } else {
          this.log.error('something strange with dialog', dialog);
        }
      }

      const isEnd = /* limit > dialogsResult.dialogs.length || */
        !count ||
        dialogsLength >= count ||
        !items.length;
      if(isEnd) {
        this.dialogsStorage.setDialogsLoaded(folderId, true);
      }

      if(hasPrepend) {
        this.scheduleHandleNewDialogs();
      } else {
        this.rootScope.dispatchEvent('dialogs_multiupdate', new Map());
      }

      const dialogs = items;
      const slicedDialogs = limit === useLimit ? dialogs : dialogs.slice(0, limit);
      return {
        isEnd: isEnd && slicedDialogs[slicedDialogs.length - 1] === dialogs[dialogs.length - 1],
        count,
        dialogs: slicedDialogs
      };
    };

    let promise: Promise<ReturnType<typeof processResult>>, params: any;
    if(peerId) {
      promise = this.apiManager.invokeApiSingleProcess({
        method: 'channels.getForumTopics',
        params: params = {
          channel: this.appChatsManager.getChannelInput(peerId.toChatId()),
          limit: useLimit,
          offset_date: offsetDate,
          offset_id: offsetId,
          offset_topic: 0
        },
        options: {
          // timeout: APITIMEOUT,
          noErrorBox: true
        },
        processResult: (result) => {
          result = this.dialogsStorage.processTopics(peerId, result);
          return processResult(result);
        }
      });
    } else {
      // ! ВНИМАНИЕ: ОЧЕНЬ СЛОЖНАЯ ЛОГИКА:
      // ! если делать запрос сначала по папке 0, потом по папке 1, по индексу 0 в массиве будет один и тот же диалог, с dialog.pFlags.pinned, ЛОЛ???
      // ! т.е., с запросом folder_id: 1, и exclude_pinned: 0, в результате будут ещё и закреплённые с папки 0
      promise = this.apiManager.invokeApiSingleProcess({
        method: 'messages.getDialogs',
        params: params = {
          folder_id: folderId,
          offset_date: offsetDate,
          offset_id: offsetId,
          offset_peer: this.appPeersManager.getInputPeerById(offsetPeerId),
          limit: useLimit,
          hash: '0'
        },
        options: {
          // timeout: APITIMEOUT,
          noErrorBox: true
        },
        processResult
      });
    }

    return promise;
  }

  public async forwardMessages(peerId: PeerId, fromPeerId: PeerId, mids: number[], options: MessageSendingParams & Partial<{
    withMyScore: true,
    dropAuthor: boolean,
    dropCaptions: boolean
  }> = {}) {
    delete options.replyToMsgId;
    delete options.threadId;

    peerId = this.appPeersManager.getPeerMigratedTo(peerId) || peerId;
    mids = mids.slice().sort((a, b) => a - b);

    for(let i = 0, length = mids.length; i < length; ++i) {
      const mid = mids[i];
      const originalMessage = this.getMessageByPeer(fromPeerId, mid) as Message.message;
      if(originalMessage.pFlags.is_outgoing) { // this can happen when forwarding a changelog
        this.sendText(peerId, originalMessage.message, {
          entities: originalMessage.entities,
          scheduleDate: options.scheduleDate,
          silent: options.silent
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

      const replyToMid = originalMessage.reply_to?.reply_to_msg_id;
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

      return message;
    });

    for(const groupId in groups) {
      const group = groups[groupId];
      if(group.messages.length > 1) {
        group.messages.forEach((message) => {
          message.grouped_id = group.tempId;
        });
      }
    }

    newMessages.forEach((message) => {
      this.beforeMessageSending(message, {
        isScheduled: !!options.scheduleDate || undefined,
        sequential: true
      });
    });

    const sentRequestOptions: PendingAfterMsg = {};
    if(this.pendingAfterMsgs[peerId]) {
      sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
    }

    const promise = /* true ? Promise.resolve() :  */this.apiManager.invokeApiAfter('messages.forwardMessages', {
      from_peer: this.appPeersManager.getInputPeerById(fromPeerId),
      id: mids.map((mid) => getServerMessageId(mid)),
      random_id: newMessages.map((message) => message.random_id),
      to_peer: this.appPeersManager.getInputPeerById(peerId),
      with_my_score: options.withMyScore,
      silent: options.silent,
      schedule_date: options.scheduleDate,
      drop_author: options.dropAuthor,
      drop_media_captions: options.dropCaptions,
      send_as: options.sendAsPeerId ? this.appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
    }, sentRequestOptions).then((updates) => {
      this.log('forwardMessages updates:', updates);
      this.apiUpdatesManager.processUpdateMessage(updates);
    }, (error: ApiError) => {
      this.onMessagesSendError(newMessages, error);
      throw error;
    }).finally(() => {
      if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
        delete this.pendingAfterMsgs[peerId];
      }
    });

    this.pendingAfterMsgs[peerId] = sentRequestOptions;

    const promises: (typeof promise)[] = [promise];
    if(overflowMids.length) {
      promises.push(this.forwardMessages(peerId, fromPeerId, overflowMids, options));
    }

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

  private onMessagesSendError(messages: Message.message[], error?: ApiError) {
    messages.forEach((message) => {
      if(message.error === error) {
        return;
      }

      if(error) {
        message.error = error;
        this.rootScope.dispatchEvent('message_error', {storageKey: message.storageKey, tempId: message.mid, error});

        const dialog = this.getDialogOnly(message.peerId);
        if(dialog) {
          this.rootScope.dispatchEvent('dialog_unread', {peerId: message.peerId, dialog});
        }
      } else {
        delete message.error;
      }
    });
  }

  public getMessagesStorageByKey(key: MessagesStorageKey) {
    const s = key.split('_');
    const peerId: PeerId = +s[0];
    const type: MessagesStorageType = s[1] as any;
    return type === 'scheduled' ? this.getScheduledMessagesStorage(peerId) : this.getHistoryMessagesStorage(peerId);
  }

  public getMessageFromStorage(storage: MessagesStorage | MessagesStorageKey, mid: number) {
    if(typeof(storage) === 'string') {
      storage = this.getMessagesStorageByKey(storage);
    }

    return storage && storage.get(mid)/*  || this.generateEmptyMessage(mid) */;
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

  public getMessagesStorage(key: MessagesStorageKey | MessagesStorage): MessagesStorage {
    if(typeof(key) === 'object') {
      return key;
    } else {
      return this.getMessagesStorageByKey(key);
    }
  }

  public getMessageById(messageId: number) {
    for(const peerId in this.messagesStorageByPeerId) {
      if(this.appPeersManager.isChannel(peerId.toPeerId())) {
        continue;
      }

      const message = this.messagesStorageByPeerId[peerId].get(messageId);
      if(message) {
        return message;
      }
    }

    return this.getMessageFromStorage(null, messageId);
  }

  public getMessageByPeer(peerId: PeerId, messageId: number) {
    if(!peerId) {
      return this.getMessageById(messageId);
    }

    return this.getMessageFromStorage(this.getHistoryMessagesStorage(peerId), messageId);
  }

  public getMessagePeer(message: any): PeerId {
    const toId = message.peer_id && this.appPeersManager.getPeerId(message.peer_id) || NULL_PEER_ID;

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
  public reloadConversation(inputPeer: PeerId | InputPeer) {
    let promise: CancellablePromise<Dialog>;
    if(inputPeer !== undefined) {
      const peerId = this.appPeersManager.getPeerId(inputPeer);
      this.log.warn('reloadConversation', peerId);

      let obj = this.reloadConversationsPeers.get(peerId);
      if(obj) {
        promise = obj.promise;
      }

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

    this.reloadConversationsPromise = pause(0).then(() => {
      const inputDialogPeers: InputDialogPeer[] = [];
      const promises: {[peerId: string]: typeof promise} = {};
      for(const [peerId, {inputDialogPeer, promise}] of this.reloadConversationsPeers) {
        inputDialogPeers.push(inputDialogPeer);
        promises[peerId] = promise;
      }

      const fullfillLeft = () => {
        for(const peerId in promises) {
          this.reloadConversationsPeers.delete(+peerId);
          promises[peerId].resolve(undefined);
        }
      };

      const invoke = async() => {
        for(;;) {
          const result = await this.apiManager.invokeApi('messages.getPeerDialogs', {peers: inputDialogPeers});
          const currentState = this.apiUpdatesManager.updatesState;
          const {state} = result;
          if(currentState.pts && currentState.pts !== state.pts) {
            await pause(500);
            continue;
          }

          return result;
        }
      };

      return invoke().then((result) => {
        for(const peerId in promises) {
          this.reloadConversationsPeers.delete(+peerId);
        }

        this.dialogsStorage.applyDialogs(result);

        result.dialogs.forEach((dialog) => {
          const peerId = dialog.peerId;
          if(peerId) {
            promises[peerId].resolve(dialog as Dialog);
            delete promises[peerId];
          }
        });
      }, noop).then(() => {
        fullfillLeft();

        this.reloadConversationsPromise = null;
        if(this.reloadConversationsPeers.size) {
          this.reloadConversation();
        }
      });
    });

    return promise || this.reloadConversationsPromise;
  }

  private doFlushHistory(peerId: PeerId, just_clear?: boolean, revoke?: boolean, threadId?: number): Promise<true> {
    let promise: Promise<true>;
    const processResult = (affectedHistory: MessagesAffectedHistory) => {
      this.apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updatePts',
          pts: affectedHistory.pts,
          pts_count: affectedHistory.pts_count
        }
      });

      if(!affectedHistory.offset) {
        return true;
      }

      return this.doFlushHistory(peerId, just_clear, revoke, threadId);
    };

    if(!threadId) {
      promise = this.apiManager.invokeApiSingleProcess({
        method: 'messages.deleteHistory',
        params: {
          just_clear,
          revoke,
          peer: this.appPeersManager.getInputPeerById(peerId),
          max_id: 0
        },
        processResult
      });
    } else {
      promise = this.apiManager.invokeApiSingleProcess({
        method: 'channels.deleteTopicHistory',
        params: {
          channel: this.appChatsManager.getChannelInput(peerId.toChatId()),
          top_msg_id: getServerMessageId(threadId)
        },
        processResult
      });
    }

    return promise;
  }

  public async flushHistory(peerId: PeerId, justClear?: boolean, revoke?: boolean, threadId?: number) {
    if(this.appPeersManager.isChannel(peerId) && !threadId) {
      const promise = this.getHistory(peerId, 0, 1);

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

    return this.doFlushHistory(peerId, justClear, revoke, threadId).then(() => {
      if(!threadId) {
        this.flushStoragesByPeerId(peerId);
      }

      if(justClear) {
        this.rootScope.dispatchEvent('dialog_flush', {peerId, dialog: this.getDialogOnly(peerId)});
      } else {
        const key = this.getTypingKey(peerId, threadId);
        delete this.notificationsToHandle[key];
        delete this.typings[key];

        if(!threadId) {
          const c = this.reloadConversationsPeers.get(peerId);
          if(c) {
            this.reloadConversationsPeers.delete(peerId);
            c.promise.resolve(undefined);
          }
        }

        this.dialogsStorage.dropDialogOnDeletion(peerId, threadId);
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
      if(ss) {
        ss.clear();
      }
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

    return p.promise = this.getSearch({
      peerId,
      inputFilter: {_: 'inputMessagesFilterPinned'},
      maxId: 0,
      limit: 1,
      threadId
    }).then((result) => {
      p.count = result.count;
      p.maxId = result.history[0]?.mid;
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
      this.apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updatePts',
          pts: affectedHistory.pts,
          pts_count: affectedHistory.pts_count
        }
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

  public getAlbumText(grouped_id: string) {
    const group = this.groupedMessagesStorage[grouped_id];
    return getAlbumText(Array.from(group.values()) as Message.message[]);
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

  public getMidsByAlbum(groupedId: string, sort: 'asc' | 'desc' = 'asc') {
    return getObjectKeysAndSort(this.groupedMessagesStorage[groupedId], sort);
  }

  public getMessagesByAlbum(groupedId: string) {
    const mids = this.getMidsByAlbum(groupedId, 'asc');
    const storage = this.groupedMessagesStorage[groupedId];
    return mids.map((mid) => this.getMessageFromStorage(storage, mid) as Message.message);
  }

  public getMidsByMessage(message: Message) {
    if(!message) return [];
    else if((message as Message.message).grouped_id) return this.getMidsByAlbum((message as Message.message).grouped_id);
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

  public generateTempMessageId(peerId: PeerId) {
    const dialog = this.getDialogOnly(peerId);
    return this.appMessagesIdsManager.generateTempMessageId(dialog?.top_message || 0);
  }

  public setMessageUnreadByDialog(message: MyMessage, dialog: Dialog | ForumTopic = this.getDialogOnly(message.peerId)) {
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

    const peerId = this.getMessagePeer(message);
    const storage = options.storage || this.getHistoryMessagesStorage(peerId);
    const isChannel = message.peer_id._ === 'peerChannel';
    const isBroadcast = isChannel && this.appChatsManager.isBroadcast(peerId.toChatId());
    const isMessage = message._ === 'message';

    if(options.isOutgoing) {
      message.pFlags.is_outgoing = true;
    }

    const mid = generateMessageId(message.id);
    message.mid = mid;

    if(isMessage) {
      if(options.isScheduled) {
        message.pFlags.is_scheduled = true;
      }

      if(message.grouped_id) {
        const storage = this.groupedMessagesStorage[message.grouped_id] ??= this.createMessageStorage(peerId, 'grouped');
        storage.set(mid, message);
      }

      if(message.via_bot_id) {
        // ! WARNING
        message.viaBotId = message.via_bot_id as any;
      }
    }

    // this.log(dT(), 'msg unread', mid, apiMessage.pFlags.out, dialog && dialog[apiMessage.pFlags.out ? 'read_outbox_max_id' : 'read_inbox_max_id'])

    const replyTo = message.reply_to;
    if(replyTo) {
      if(replyTo.reply_to_msg_id) {
        replyTo.reply_to_msg_id = message.reply_to_mid = generateMessageId(replyTo.reply_to_msg_id);
      }

      if(replyTo.reply_to_top_id) {
        replyTo.reply_to_top_id = generateMessageId(replyTo.reply_to_top_id);
      }
    }

    const replies = isMessage && message.replies;
    if(replies) {
      if(replies.max_id) replies.max_id = generateMessageId(replies.max_id);
      if(replies.read_max_id) replies.read_max_id = generateMessageId(replies.read_max_id);
    }

    const overwriting = !!peerId;
    if(!overwriting) {
      message.date -= this.timeManager.getServerTimeOffset();
    }

    // storage.generateIndex(message);
    const myId = this.appPeersManager.peerId;

    const fwdHeader = isMessage && (message as Message.message).fwd_from;

    message.peerId = peerId;
    if(peerId === myId/*  && !message.from_id && !message.fwd_from */) {
      message.fromId = fwdHeader ? (fwdHeader.from_id ? this.appPeersManager.getPeerId(fwdHeader.from_id) : NULL_PEER_ID) : myId;
    } else {
      // message.fromId = message.pFlags.post || (!message.pFlags.out && !message.from_id) ? peerId : appPeersManager.getPeerId(message.from_id);
      message.fromId = message.pFlags.post || !message.from_id ? peerId : this.appPeersManager.getPeerId(message.from_id);
    }

    this.setMessageUnreadByDialog(message);

    if(fwdHeader) {
      // if(peerId === myID) {
      if(fwdHeader.saved_from_msg_id) fwdHeader.saved_from_msg_id = generateMessageId(fwdHeader.saved_from_msg_id);
      if(fwdHeader.channel_post) fwdHeader.channel_post = generateMessageId(fwdHeader.channel_post);

      const peer = fwdHeader.saved_from_peer || fwdHeader.from_id;
      const msgId = fwdHeader.saved_from_msg_id || fwdHeader.channel_post;
      if(peer && msgId) {
        const savedFromPeerId = this.appPeersManager.getPeerId(peer);
        const savedFromMid = generateMessageId(msgId);
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

    const mediaContext: ReferenceContext = {
      type: 'message',
      peerId,
      messageId: mid
    };

    /* if(isMessage) {
      const entities = message.entities;
      if(entities && entities.find((entity) => entity._ === 'messageEntitySpoiler')) {
        message.media = {_: 'messageMediaUnsupported'};
      }
    } */

    let unsupported = false;
    const media = isMessage && message.media;
    if(media) {
      switch(media._) {
        case 'messageMediaEmpty': {
          delete message.media;
          break;
        }

        case 'messageMediaPhoto': {
          if(media.ttl_seconds) {
            unsupported = true;
          } else {
            media.photo = this.appPhotosManager.savePhoto(media.photo, mediaContext);
          }

          if(!(media as MessageMedia.messageMediaPhoto).photo) { // * found this bug on test DC
            delete message.media;
          }

          break;
        }

        case 'messageMediaPoll': {
          const result = this.appPollsManager.savePoll(media.poll, media.results, message);
          media.poll = result.poll;
          media.results = result.results;
          break;
        }

        case 'messageMediaDocument': {
          if(media.ttl_seconds) {
            unsupported = true;
          } else {
            const originalDoc = media.document;
            media.document = this.appDocsManager.saveDoc(originalDoc, mediaContext); // 11.04.2020 warning

            if(!media.document && originalDoc._ !== 'documentEmpty') {
              unsupported = true;
            }
          }

          break;
        }

        case 'messageMediaWebPage': {
          const messageKey = this.appWebPagesManager.getMessageKeyForPendingWebPage(peerId, mid, options.isScheduled);
          media.webpage = this.appWebPagesManager.saveWebPage(media.webpage, messageKey, mediaContext);

          if(!media.webpage) {
            delete message.media;
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

        case 'messageMediaUnsupported': {
          unsupported = true;
          break;
        }
      }
    }

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
        (action as MessageAction.messageActionChatEditPhoto).photo = this.appPhotosManager.savePhoto((action as MessageAction.messageActionChatEditPhoto).photo, mediaContext);
      }

      if((action as any).document) {
        (action as any).document = this.appDocsManager.saveDoc((action as any).photo, mediaContext);
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

          this.appGroupCallsManager.saveGroupCall(action.call);

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
      }

      if(migrateFrom &&
          migrateTo &&
          !this.migratedFromTo[migrateFrom] &&
          !this.migratedToFrom[migrateTo]) {
        this.migrateChecks(migrateFrom, migrateTo);
      }
    }

    /* if(message.grouped_id) {
      if(!groups) {
        groups = new Set();
      }

      groups.add(message.grouped_id);
    } else {
      message.rReply = this.getRichReplyText(message);
    } */

    if(isMessage && message.message.length && !message.totalEntities) {
      this.wrapMessageEntities(message);
    }

    storage.set(mid, message);

    return message;
  }

  public saveMessages(messages: any[], options: Partial<{
    storage: MessagesStorage,
    isScheduled: true,
    isOutgoing: true,
    // isNew: boolean, // * new - from update
  }> = {}): (Message.message | Message.messageService)[] {
    if((messages as any).saved) return messages;
    (messages as any).saved = true;
    messages.forEach((message, idx, arr) => {
      arr[idx] = this.saveMessage(message, options);
    });

    return messages;
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
            goodMessage = message;
            break;
          }

          // * this check will allow editing only last message
          // break;
        }
      }

      return goodMessage;
    }
  }

  private wrapMessageEntities(message: Message.message) {
    const apiEntities = message.entities ? message.entities.slice() : [];
    message.message = fixEmoji(message.message, apiEntities);

    const myEntities = parseEntities(message.message);
    message.totalEntities = mergeEntities(apiEntities, myEntities); // ! only in this order, otherwise bold and emoji formatting won't work
  }

  public reportMessages(peerId: PeerId, mids: number[], reason: ReportReason['_'], message?: string) {
    return this.apiManager.invokeApiSingle('messages.report', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      id: mids.map((mid) => getServerMessageId(mid)),
      reason: {
        _: reason
      },
      message
    });
  }

  public startBot(botId: BotId, chatId?: ChatId, startParam?: string) {
    const peerId = chatId ? chatId.toPeerId(true) : botId.toPeerId();
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
      let promise: Promise<void>;
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
        return this.sendText(peerId, str + '@' + this.appPeersManager.getPeerUsername(botId.toPeerId()));
      });
    }

    return this.sendText(peerId, str);
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
    topicId?: number
  }) {
    const {peerId, topicId, filterId = topicId ? peerId : undefined} = options;
    if(filterId === undefined) {
      throw new Error('No filterId');
    }

    if(filterId > 1) {
      return this.filtersStorage.toggleDialogPin(peerId, filterId);
    }

    const dialog = this.dialogsStorage.getDialogOrTopic(peerId, topicId);
    if(!dialog) throw undefined;

    const pinned = dialog.pFlags?.pinned ? undefined : true;

    if(pinned) {
      const max = await this.apiManager.getLimit(topicId ? 'topicPin' : (filterId === 1 ? 'folderPin' : 'pin'));
      if(this.dialogsStorage.getPinnedOrders(filterId).length >= max) {
        throw makeError(topicId ? 'PINNED_TOO_MUCH' : 'PINNED_DIALOGS_TOO_MUCH');
      }
    }

    if(topicId) {
      return this.appChatsManager.updatePinnedForumTopic(peerId.toChatId(), topicId, pinned);
    }

    return this.apiManager.invokeApi('messages.toggleDialogPin', {
      peer: this.appPeersManager.getInputDialogPeerById(peerId),
      pinned
    }).then((bool) => {
      const pFlags: Update.updateDialogPinned['pFlags'] = pinned ? {pinned} : {};
      this.apiUpdatesManager.saveUpdate({
        _: 'updateDialogPinned',
        peer: this.appPeersManager.getDialogPeer(peerId),
        folder_id: filterId,
        pFlags
      });
    });
  }

  public markDialogUnread(peerId: PeerId, read?: true) {
    const dialog = this.getDialogOnly(peerId);
    if(!dialog) return Promise.reject();

    const unread = read || dialog.pFlags?.unread_mark ? undefined : true;
    return this.apiManager.invokeApi('messages.markDialogUnread', {
      peer: this.appPeersManager.getInputDialogPeerById(peerId),
      unread
    }).then((bool) => {
      if(bool) {
        const pFlags: Update.updateDialogUnreadMark['pFlags'] = unread ? {unread} : {};
        this.onUpdateDialogUnreadMark({
          _: 'updateDialogUnreadMark',
          peer: this.appPeersManager.getDialogPeer(peerId),
          pFlags
        });
      }
    });
  }

  public migrateChecks(migrateFrom: PeerId, migrateTo: PeerId) {
    if(!this.migratedFromTo[migrateFrom] &&
      !this.migratedToFrom[migrateTo] &&
      this.appChatsManager.hasChat(migrateTo.toChatId())) {
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
      'messageMediaWebPage'
    ];

    if(kind === 'poll') {
      goodMedias.push('messageMediaPoll');
    }

    if(!message ||
        message._ !== 'message' ||
        message.deleted ||
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

    const canEditMessageInPeer = this.appPeersManager.isBroadcast(message.peerId) ?
      this.appChatsManager.hasRights(message.peerId.toChatId(), 'edit_messages') :
      message.pFlags.out;

    if(
      !canEditMessageInPeer || (
        message.peer_id._ !== 'peerChannel' &&
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
        messageReplyMarkup.fromId = this.appPeersManager.getPeerId(message.from_id);
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

  public getSearchStorage(peerId: PeerId, inputFilter: MyInputMessagesFilter) {
    if(!this.searchesStorage[peerId]) this.searchesStorage[peerId] = {};
    if(!this.searchesStorage[peerId][inputFilter]) this.searchesStorage[peerId][inputFilter] = {history: []};
    return this.searchesStorage[peerId][inputFilter];
  }

  public getSearchCounters(
    peerId: PeerId,
    filters: MessagesFilter[],
    canCache = true,
    threadId?: number
  ): Promise<MessagesSearchCounter[]> {
    if(this.appPeersManager.isPeerRestricted(peerId)) {
      return Promise.resolve(filters.map((filter) => {
        return {
          _: 'messages.searchCounter',
          pFlags: {},
          filter: filter,
          count: 0
        };
      }));
    }

    const func = (canCache ? this.apiManager.invokeApiCacheable : this.apiManager.invokeApi).bind(this.apiManager);
    return func('messages.getSearchCounters', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      filters,
      top_msg_id: threadId ? getServerMessageId(threadId) : undefined
    });
  }

  public filterMessagesByInputFilterFromStorage(inputFilter: MyInputMessagesFilter, history: number[], storage: MessagesStorage | MessagesStorageKey, limit: number) {
    const _storage = this.getMessagesStorage(storage);
    return filterMessagesByInputFilter(inputFilter, history.map((mid) => _storage.get(mid)), limit);
  }

  public getSearch({peerId, query, inputFilter, maxId, limit, nextRate, backLimit, threadId, folderId, minDate, maxDate}: {
    peerId?: PeerId,
    maxId?: number,
    limit?: number,
    nextRate?: number,
    backLimit?: number,
    threadId?: number,
    folderId?: number,
    query?: string,
    inputFilter?: {
      _: MyInputMessagesFilter
    },
    minDate?: number,
    maxDate?: number
  }): Promise<{
    count: number,
    next_rate: number,
    offset_id_offset: number,
    history: MyMessage[]
  }> {
    if(this.appPeersManager.isPeerRestricted(peerId)/*  || true */) {
      return Promise.resolve({
        count: 0,
        offset_id_offset: 0,
        next_rate: undefined,
        history: []
      });
    }

    if(!query) query = '';
    if(!inputFilter) inputFilter = {_: 'inputMessagesFilterEmpty'};
    if(limit === undefined) limit = 20;
    if(!nextRate) nextRate = 0;
    if(!backLimit) backLimit = 0;

    minDate = minDate ? minDate / 1000 | 0 : 0;
    maxDate = maxDate ? maxDate / 1000 | 0 : 0;

    let foundMsgs: MyMessage[] = [];

    // this.log('search', maxId);

    if(backLimit) {
      limit += backLimit;
    }

    // const beta = inputFilter._ === 'inputMessagesFilterPinned' && !backLimit;
    const beta = false;

    let storage: {
      count?: number;
      history: SlicedArray<number>;
    };

    // * костыль для limit 1, если нужно и получить сообщение, и узнать количество сообщений
    if(peerId && !backLimit && !maxId && !query && limit !== 1 && !threadId/*  && inputFilter._ !== 'inputMessagesFilterPinned' */) {
      storage = beta ?
        this.getSearchStorage(peerId, inputFilter._) as any :
        this.getHistoryStorage(peerId);
      foundMsgs = this.filterMessagesByInputFilterFromStorage(inputFilter._, storage.history.slice, this.getHistoryMessagesStorage(peerId), limit);
    }

    if(foundMsgs.length) {
      if(foundMsgs.length < limit && (beta ? storage.count !== storage.history.length : true)) {
        maxId = foundMsgs[foundMsgs.length - 1].mid;
        limit = limit - foundMsgs.length;
      } else {
        return Promise.resolve({
          count: beta ? storage.count : 0,
          next_rate: 0,
          offset_id_offset: 0,
          history: foundMsgs
        });
      }
    } else if(beta && storage?.count) {
      return Promise.resolve({
        count: storage.count,
        next_rate: 0,
        offset_id_offset: 0,
        history: []
      });
    }

    const canCache = false && (['inputMessagesFilterChatPhotos', 'inputMessagesFilterPinned'] as MyInputMessagesFilter[]).includes(inputFilter._);
    const method = (canCache ? this.apiManager.invokeApiCacheable : this.apiManager.invokeApi).bind(this.apiManager);

    let apiPromise: Promise<any>;
    if(peerId && !nextRate && folderId === undefined/*  || !query */) {
      apiPromise = method('messages.search', {
        peer: this.appPeersManager.getInputPeerById(peerId),
        q: query || '',
        filter: inputFilter as any as MessagesFilter,
        min_date: minDate,
        max_date: maxDate,
        limit,
        offset_id: getServerMessageId(maxId) || 0,
        add_offset: backLimit ? -backLimit : 0,
        max_id: 0,
        min_id: 0,
        hash: '',
        top_msg_id: getServerMessageId(threadId) || 0
      }, {
        // timeout: APITIMEOUT,
        noErrorBox: true
      });
    } else {
      // var offsetDate = 0;
      let offsetPeerId: PeerId;
      let offsetId = 0;
      const offsetMessage = maxId && this.getMessageByPeer(peerId, maxId);

      if(offsetMessage && offsetMessage.date) {
        // offsetDate = offsetMessage.date + timeManager.getServerTimeOffset();
        offsetId = offsetMessage.id;
        offsetPeerId = this.getMessagePeer(offsetMessage);
      }

      apiPromise = method('messages.searchGlobal', {
        q: query,
        filter: inputFilter as any as MessagesFilter,
        min_date: minDate,
        max_date: maxDate,
        offset_rate: nextRate,
        offset_peer: this.appPeersManager.getInputPeerById(offsetPeerId),
        offset_id: offsetId,
        limit,
        folder_id: folderId
      }, {
        // timeout: APITIMEOUT,
        noErrorBox: true
      });
    }

    return apiPromise.then((searchResult: any) => {
      this.appUsersManager.saveApiUsers(searchResult.users);
      this.appChatsManager.saveApiChats(searchResult.chats);
      this.saveMessages(searchResult.messages);

      /* if(beta && storage && (!maxId || storage.history[storage.history.length - 1] === maxId)) {
        const storage = this.getSearchStorage(peerId, inputFilter._);
        const add = (searchResult.messages.map((m: any) => m.mid) as number[]).filter((mid) => storage.history.indexOf(mid) === -1);
        storage.history.push(...add);
        storage.history.sort((a, b) => b - a);
        storage.count = searchResult.count;
      } */

      if(DEBUG) {
        this.log('getSearch result:', inputFilter, searchResult);
      }

      const foundCount: number = searchResult.count || (foundMsgs.length + searchResult.messages.length);

      searchResult.messages.forEach((message: MyMessage) => {
        const peerId = this.getMessagePeer(message);
        if(peerId.isAnyChat()) {
          const chat = this.appChatsManager.getChat(peerId.toChatId()) as Chat.chat;
          if(chat.migrated_to) {
            this.migrateChecks(peerId, (chat.migrated_to as InputChannel.inputChannel).channel_id.toPeerId(true));
          }
        }

        foundMsgs.push(message);
      });

      return {
        count: foundCount,
        offset_id_offset: searchResult.offset_id_offset || 0,
        next_rate: searchResult.next_rate,
        history: foundMsgs
      };
    });
  }

  public subscribeRepliesThread(peerId: PeerId, mid: number) {
    const repliesKey = peerId + '_' + mid;
    for(const threadKey in this.threadsToReplies) {
      if(this.threadsToReplies[threadKey] === repliesKey) return;
    }

    this.getDiscussionMessage(peerId, mid);
  }

  public generateThreadServiceStartMessage(message: Message.message | Message.messageService) {
    const threadKey = message.peerId + '_' + message.mid;
    if(this.threadsServiceMessagesIdsStorage[threadKey]) return;

    const maxMessageId = getServerMessageId(Math.max(...this.getMidsByMessage(message)));
    const serviceStartMessage: Message.messageService = {
      _: 'messageService',
      pFlags: {
        is_single: true
      },
      id: this.appMessagesIdsManager.generateTempMessageId(maxMessageId),
      date: message.date,
      from_id: {_: 'peerUser', user_id: NULL_PEER_ID}/* message.from_id */,
      peer_id: message.peer_id,
      action: {
        _: 'messageActionDiscussionStarted'
      },
      reply_to: this.generateReplyHeader(message.peerId, message.id)
    };

    this.saveMessages([serviceStartMessage], {isOutgoing: true});
    this.threadsServiceMessagesIdsStorage[threadKey] = serviceStartMessage.mid;
  }

  public getThreadServiceMessageId(peerId: PeerId, threadId: number) {
    return this.threadsServiceMessagesIdsStorage[peerId + '_' + threadId];
  }

  public getDiscussionMessage(peerId: PeerId, mid: number) {
    return this.apiManager.invokeApiSingle('messages.getDiscussionMessage', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    }).then((result) => {
      this.appChatsManager.saveApiChats(result.chats);
      this.appUsersManager.saveApiUsers(result.users);
      this.saveMessages(result.messages);

      const message = this.getMessageWithReplies(result.messages[0] as Message.message);
      const threadKey = message.peerId + '_' + message.mid;

      this.generateThreadServiceStartMessage(message);

      const historyStorage = this.getHistoryStorage(message.peerId, message.mid);
      const newMaxId = result.max_id = generateMessageId(result.max_id) || 0;
      result.read_inbox_max_id = historyStorage.readMaxId = generateMessageId(result.read_inbox_max_id ?? message.mid);
      result.read_outbox_max_id = historyStorage.readOutboxMaxId = generateMessageId(result.read_outbox_max_id) || 0;

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

    const processDialog = (dialog: MTDialog.dialog | ForumTopic) => {
      const {peerId} = dialog;
      this.dialogsStorage.pushDialog({dialog});
      if(!this.appPeersManager.isChannel(peerId)) {
        newMaxSeenId = Math.max(newMaxSeenId, dialog.top_message || 0);
      }

      let cache = updateMap.get(peerId);
      if(!cache) {
        updateMap.set(peerId, cache = {});
      }

      if(dialog._ === 'forumTopic') {
        (cache.topics ??= new Map()).set(dialog.id, dialog);
      } else {
        cache.dialog = dialog;
      }
    };

    for(const [peerId, obj] of this.newDialogsToHandle) {
      const isDialogDefined = 'dialog' in obj;
      const {dialog, topics} = obj;

      if(isDialogDefined) {
        if(!dialog) {
          this.reloadConversation(peerId.toPeerId());
        } else if(this.dialogsStorage.getDialogOnly(peerId)) { // * can be already dropped
          processDialog(dialog);
        }
      }

      if(topics) {
        topics?.forEach((topic, id) => {
          if(!topic) {
            this.dialogsStorage.getForumTopicById(peerId, id);
          } else if(this.dialogsStorage.getForumTopic(peerId, id)) { // * can be already dropped
            processDialog(topic);
          }
        });
      }
    }

    // this.log('after order:', this.dialogsStorage[0].map((d) => d.peerId));

    if(newMaxSeenId !== 0) {
      this.incrementMaxSeenId(newMaxSeenId);
    }

    this.rootScope.dispatchEvent('dialogs_multiupdate', updateMap);
    this.newDialogsToHandle.clear();
  };

  public scheduleHandleNewDialogs(peerId?: PeerId, dialog?: Dialog | ForumTopic | ForumTopic['id']) {
    if(peerId !== undefined) {
      let obj = this.newDialogsToHandle.get(peerId);
      if(!obj) {
        this.newDialogsToHandle.set(peerId, obj = {});
      }

      const isObject = typeof(dialog) === 'object';
      if(!dialog || (isObject && dialog._ === 'dialog')) {
        obj.dialog = dialog as Dialog;
      } else {
        obj.topics ??= new Map();
        if(isObject) {
          obj.topics.set((dialog as ForumTopic).id, dialog as ForumTopic);
        } else {
          obj.topics.set(dialog as number, undefined);
        }
      }
    }

    return this.newDialogsHandlePromise ??= pause(0).then(() => {
      this.newDialogsHandlePromise = undefined;
      this.handleNewDialogs();
    });
  }

  public async deleteMessages(peerId: PeerId, mids: number[], revoke?: boolean, isRecursion?: boolean) {
    let promise: Promise<any>;

    const isChannel = this.appPeersManager.isChannel(peerId);
    const channelId = isChannel && peerId.toChatId();
    if(isChannel && !isRecursion) {
      const channel = this.appChatsManager.getChat(channelId) as Chat.channel;
      if(!channel.pFlags.creator && !channel.admin_rights?.pFlags?.delete_messages) {
        mids = mids.filter((mid) => {
          const message = this.getMessageByPeer(peerId, mid);
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
      return generateMessageId(messageId) === mid && messageId;
    }).filter(Boolean);

    if(isChannel) {
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
      promises.push(this.deleteMessages(peerId, overflowMids, revoke, true));
    }

    return Promise.all(promises).then(noop);
  }

  public readHistory(peerId: PeerId, maxId = 0, threadId?: number, force = false) {
    if(DO_NOT_READ_HISTORY) {
      return Promise.resolve();
    }

    // console.trace('start read')
    this.log('readHistory:', peerId, maxId, threadId);
    const readMaxId = this.getReadMaxIdIfUnread(peerId, threadId);
    if(!readMaxId) {
      if(threadId && !force) {
        const forumTopic = this.dialogsStorage.getForumTopic(peerId, threadId);
        if(!getServerMessageId(forumTopic.read_inbox_max_id)) {
          force = true;
        }
      }

      if(!force) {
        const dialog = this.appChatsManager.isForum(peerId.toChatId()) && threadId ?
          this.dialogsStorage.getForumTopic(peerId, threadId) :
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

    const historyStorage = this.getHistoryStorage(peerId, threadId);

    if(historyStorage.triedToReadMaxId >= maxId) {
      return Promise.resolve();
    }

    let apiPromise: Promise<any>;
    if(threadId) {
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
          this.apiUpdatesManager.processUpdateMessage({
            _: 'updateShort',
            update: {
              _: 'updatePts',
              pts: affectedMessages.pts,
              pts_count: affectedMessages.pts_count
            }
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
        this.readHistory(peerId, readMaxId, threadId, true);
      }
    });

    return historyStorage.readPromise = apiPromise;
  }

  public readAllHistory(peerId: PeerId, threadId?: number, force = false) {
    const historyStorage = this.getHistoryStorage(peerId, threadId);
    if(historyStorage.maxId) {
      this.readHistory(peerId, historyStorage.maxId, threadId, force); // lol
    }
  }

  private getUnreadMentionsKey(peerId: PeerId, threadId?: number) {
    return peerId + (threadId ? `_${threadId}` : '');
  }

  private fixDialogUnreadMentionsIfNoMessage(peerId: PeerId, threadId?: number) {
    const dialog = this.dialogsStorage.getDialogOrTopic(peerId, threadId);
    if(dialog?.unread_mentions_count) {
      this.reloadConversationOrTopic(peerId);
    }
  }

  private modifyCachedMentions(peerId: PeerId, mid: number, add: boolean, threadId?: number) {
    const slicedArray = this.unreadMentions[this.getUnreadMentionsKey(peerId, threadId)];
    if(!slicedArray) return;

    if(add) {
      if(slicedArray.first.isEnd(SliceEnd.Top)) {
        slicedArray.insertSlice([mid]);
      }
    } else {
      slicedArray.delete(mid);
    }
  }

  private fixUnreadMentionsCountIfNeeded(peerId: PeerId, slicedArray: SlicedArray<number>, threadId?: number) {
    const dialog = this.dialogsStorage.getDialogOrTopic(peerId, threadId);
    if(!slicedArray.length && dialog?.unread_mentions_count) {
      this.reloadConversationOrTopic(peerId);
    }
  }

  public goToNextMention(peerId: PeerId, threadId?: number) {
    /* this.getUnreadMentions(peerId, 1, 2, 0).then((messages) => {
      console.log(messages);
    }); */

    const key = this.getUnreadMentionsKey(peerId, threadId);
    const promise = this.goToNextMentionPromises[key];
    if(promise) {
      return promise;
    }

    const slicedArray = this.unreadMentions[peerId] ??= new SlicedArray();
    const length = slicedArray.length;
    const isTopEnd = slicedArray.first.isEnd(SliceEnd.Top);
    if(!length && isTopEnd) {
      this.fixUnreadMentionsCountIfNeeded(peerId, slicedArray, threadId);
      return Promise.resolve();
    }

    let loadNextPromise = Promise.resolve();
    if(!isTopEnd && length < 25) {
      loadNextPromise = this.loadNextMentions(peerId, threadId);
    }

    return this.goToNextMentionPromises[key] = loadNextPromise.then(() => {
      const last = slicedArray.last;
      const mid = last && last[last.length - 1];
      if(mid) {
        slicedArray.delete(mid);
        return mid;
      } else {
        this.fixUnreadMentionsCountIfNeeded(peerId, slicedArray, threadId);
      }
    }).finally(() => {
      delete this.goToNextMentionPromises[key];
    });
  }

  private loadNextMentions(peerId: PeerId, threadId?: number) {
    const slicedArray = this.unreadMentions[peerId];
    const maxId = slicedArray.first[0] || 1;

    const backLimit = 50;
    const add_offset = -backLimit;
    const limit = backLimit;
    return this.getUnreadMentions(peerId, maxId, add_offset, limit, undefined, undefined, threadId)
    .then((messages) => {
      this.mergeHistoryResult(slicedArray, messages, maxId === 1 ? 0 : maxId, limit, add_offset);
    });
  }

  private getUnreadMentions(
    peerId: PeerId,
    offsetId: number,
    add_offset: number,
    limit: number,
    maxId = 0,
    minId = 0,
    threadId?: number
  ) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.getUnreadMentions',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        offset_id: getServerMessageId(offsetId),
        add_offset,
        limit,
        max_id: getServerMessageId(maxId),
        min_id: getServerMessageId(minId),
        top_msg_id: threadId ? getServerMessageId(threadId) : undefined
      },
      processResult: (messagesMessages) => {
        assumeType<Exclude<MessagesMessages, MessagesMessages.messagesMessagesNotModified>>(messagesMessages);
        this.appUsersManager.saveApiUsers(messagesMessages.users);
        this.appChatsManager.saveApiChats(messagesMessages.chats);
        this.saveMessages(messagesMessages.messages);

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

  public getHistoryStorage(peerId: PeerId, threadId?: number) {
    if(threadId) {
      // threadId = this.getLocalMessageId(threadId);
      return (this.threadsStorage[peerId] ??= {})[threadId] ??= {count: null, history: new SlicedArray()};
    }

    return this.historiesStorage[peerId] ??= {count: null, history: new SlicedArray()};
  }

  public getHistoryStorageTransferable(peerId: PeerId, threadId?: number) {
    const historyStorage = this.getHistoryStorage(peerId, threadId);
    const {
      count,
      history,
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

  public getUpdateAfterReloadKey(peerId: PeerId, threadId?: number) {
    return peerId + (threadId ? '_' + threadId : '');
  }

  private handleNewUpdateAfterReload(peerId: PeerId, update: Update, threadId?: number) {
    const set = this.newUpdatesAfterReloadToHandle[this.getUpdateAfterReloadKey(peerId, threadId)] ??= new Set();
    if(set.has(update)) {
      this.log.error('here we go again', peerId);
      return;
    }

    (update as any).ignoreExisting = true;
    set.add(update);
    this.scheduleHandleNewDialogs(peerId, threadId);
  }

  private onUpdateMessageId = (update: Update.updateMessageID) => {
    const randomId = update.random_id;
    const pendingData = this.pendingByRandomId[randomId];
    if(!pendingData) {
      return;
    }

    const mid = generateMessageId(update.id);
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
    const dialog = this.dialogsStorage.getDialogOrTopic(peerId, isLocalThreadUpdate ? threadId : undefined);

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
      } else if(threadStorage) {
        this.onUpdateNewMessage(update);
      }
    }

    if(message._ === 'messageService') {
      const {action} = message;
      if(action._ === 'messageActionPaymentSent' && message.reply_to) {
        this.rootScope.dispatchEvent('payment_sent', {
          peerId: message.reply_to.reply_to_peer_id ?
            this.appPeersManager.getPeerId(message.reply_to.reply_to_peer_id) :
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
      this.updateMessageRepliesIfNeeded(message);
    }

    // * so message can exist if reloadConversation came back earlier with mid
    const ignoreExisting: boolean = (update as any).ignoreExisting;
    const isExisting = !!historyStorage.history.findSlice(message.mid);
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
      this.appUsersManager.forceUserOnline(fromId, message.date);

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

    // commented to render the message if it's been sent faster than history_append came to main thread
    // if(!pendingMessage) {
    this.handleNewMessage(message);
    // }

    const isTopic = dialog?._ === 'forumTopic';
    if((isLocalThreadUpdate && !isTopic) || !dialog) {
      return;
    }

    const inboxUnread = !message.pFlags.out && message.pFlags.unread;

    {
      if(inboxUnread && message.mid > dialog.top_message) {
        const releaseUnreadCount = this.dialogsStorage.prepareDialogUnreadCountModifying(dialog);

        ++dialog.unread_count;
        if(message.pFlags.mentioned) {
          ++dialog.unread_mentions_count;
          this.modifyCachedMentions(peerId, message.mid, true, isTopic ? threadId : undefined);
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
  };

  private onUpdateMessageReactions = (update: Update.updateMessageReactions) => {
    const {peer, msg_id, reactions} = update;
    const mid = generateMessageId(msg_id);
    const peerId = this.appPeersManager.getPeerId(peer);
    const message: MyMessage = this.getMessageByPeer(peerId, mid);

    if(message?._ !== 'message') {
      return;
    }

    const recentReactions = reactions?.recent_reactions;
    if(recentReactions?.length && message.pFlags.out) {
      const recentReaction = recentReactions[recentReactions.length - 1];
      const previousReactions = message.reactions;
      const previousRecentReactions = previousReactions?.recent_reactions;
      if(
        this.appPeersManager.getPeerId(recentReaction.peer_id) !== this.appPeersManager.peerId && (
          !previousRecentReactions ||
          previousRecentReactions.length <= recentReactions.length
        ) && (
          !previousRecentReactions ||
          !deepEqual(recentReaction, previousRecentReactions[previousRecentReactions.length - 1])
        )
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

    const key = message.peerId + '_' + message.mid;
    this.pushBatchUpdate('messages_reactions', this.batchUpdateReactions, key, () => copy(message.reactions));

    message.reactions = reactions;

    if(!update.local) {
      this.setDialogToStateIfMessageIsTop(message);
    }
  };

  private onUpdateDialogUnreadMark = (update: Update.updateDialogUnreadMark) => {
    // this.log('updateDialogUnreadMark', update);
    const peerId = this.appPeersManager.getPeerId((update.peer as DialogPeer.dialogPeer).peer);
    const dialog = this.getDialogOnly(peerId);

    if(!dialog) {
      this.scheduleHandleNewDialogs(peerId);
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
    const mid = generateMessageId(message.id);
    const storage = this.getHistoryMessagesStorage(peerId);
    if(!storage.has(mid)) {
      // this.fixDialogUnreadMentionsIfNoMessage(peerId);
      return;
    }

    // console.trace(dT(), 'edit message', message)

    const oldMessage: Message = this.getMessageFromStorage(storage, mid);
    this.saveMessages([message], {storage});
    const newMessage: Message = this.getMessageFromStorage(storage, mid);

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
    } else {
      let dispatchEditEvent = true;
      // no sense in dispatching message_edit since only reactions have changed
      if(oldMessage?._ === 'message' && !deepEqual(oldMessage.reactions, (newMessage as Message.message).reactions)) {
        const newReactions = (newMessage as Message.message).reactions;
        (newMessage as Message.message).reactions = oldMessage.reactions;
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
        const topicId = +threadKey.split('_')[1];
        const topic = this.dialogsStorage.getForumTopic(peerId, topicId);
        if(topic) {
          (getUpdateCache().topics ??= new Map()).set(topicId, topic);
        }
      }

      if(map.size) {
        this.rootScope.dispatchEvent('dialogs_multiupdate', map);
      }
    }
  };

  private onUpdateReadHistory = (update: Update.updateReadChannelDiscussionInbox | Update.updateReadChannelDiscussionOutbox
    | Update.updateReadHistoryInbox | Update.updateReadHistoryOutbox
    | Update.updateReadChannelInbox | Update.updateReadChannelOutbox) => {
    const channelId = (update as Update.updateReadChannelInbox).channel_id;
    const maxId = generateMessageId((update as Update.updateReadChannelInbox).max_id || (update as Update.updateReadChannelDiscussionInbox).read_max_id);
    const threadId = generateMessageId((update as Update.updateReadChannelDiscussionInbox).top_msg_id);
    const peerId = channelId ? channelId.toPeerId(true) : this.appPeersManager.getPeerId((update as Update.updateReadHistoryInbox).peer);

    const isOut = update._ === 'updateReadHistoryOutbox' ||
      update._ === 'updateReadChannelOutbox' ||
      update._ === 'updateReadChannelDiscussionOutbox' ? true : undefined;

    const isForum = channelId ? this.appChatsManager.isForum(channelId) : false;
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

    const historyStorage = this.getHistoryStorage(peerId, threadId);

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
    const readMaxId = this.getReadMaxIdIfUnread(peerId, threadId);

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
      if(threadId && messageThreadId !== threadId) {
        continue;
      }

      const isUnread = message.pFlags.unread || (readMaxId && readMaxId < mid);

      if(!isUnread) {
        break;
      }

      // this.log.warn('read', messageId, isUnread, message)
      delete message.pFlags.unread;
      foundAffected ||= true;

      if(!message.pFlags.out && foundDialog) {
        if(stillUnreadCount === undefined) {
          newUnreadCount = --foundDialog.unread_count;
        }

        if(message.pFlags.mentioned) {
          newUnreadMentionsCount = --foundDialog.unread_mentions_count;
          this.modifyCachedMentions(peerId, message.mid, false);
        }
      }

      this.rootScope.dispatchEvent('notification_cancel', 'msg' + mid);
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
        if(foundDialog._ === 'forumTopic') {
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
  };

  private onUpdateReadMessagesContents = (update: Update.updateChannelReadMessagesContents | Update.updateReadMessagesContents) => {
    const channelId = (update as Update.updateChannelReadMessagesContents).channel_id;
    const topMsgId = (update as Update.updateChannelReadMessagesContents).top_msg_id;
    const threadId = topMsgId ? generateMessageId(topMsgId) : undefined;
    const mids = (update as Update.updateReadMessagesContents).messages.map((id) => generateMessageId(id));
    const peerId = channelId ? channelId.toPeerId(true) : this.findPeerIdByMids(mids);
    for(let i = 0, length = mids.length; i < length; ++i) {
      const mid = mids[i];
      const message: MyMessage = this.getMessageByPeer(peerId, mid);
      if(message) {
        if(message.pFlags.media_unread) {
          delete message.pFlags.media_unread;
          this.setDialogToStateIfMessageIsTop(message);

          if(!message.pFlags.out && message.pFlags.mentioned) {
            this.modifyCachedMentions(peerId, mid, false, threadId);
          }
        }
      } else {
        this.fixDialogUnreadMentionsIfNoMessage(peerId, threadId);
      }
    }

    this.rootScope.dispatchEvent('messages_media_read', {peerId, mids});
  };

  private onUpdateChannelAvailableMessages = (update: Update.updateChannelAvailableMessages) => {
    const peerId = update.channel_id.toPeerId(true);
    const history = this.getHistoryStorage(peerId).history.slice;
    const availableMinId = generateMessageId(update.available_min_id);
    const messages = history.filter((mid) => mid <= availableMinId);

    (update as any as Update.updateDeleteChannelMessages).messages = messages;
    this.onUpdateDeleteMessages(update as any as Update.updateDeleteChannelMessages);
  };

  private onUpdateDeleteMessages = (update: Update.updateDeleteMessages | Update.updateDeleteChannelMessages) => {
    const channelId = (update as Update.updateDeleteChannelMessages).channel_id;
    // const messages = (update as any as Update.updateDeleteChannelMessages).messages;
    const messages = (update as any as Update.updateDeleteChannelMessages).messages.map((id) => generateMessageId(id));
    const peerId: PeerId = channelId ? channelId.toPeerId(true) : this.findPeerIdByMids(messages);

    if(!peerId) {
      return;
    }

    this.apiManager.clearCache('messages.getSearchCounters', (params) => {
      return this.appPeersManager.getPeerId(params.peer) === peerId;
    });

    const threadKeys: Set<string> = new Set(), topics: Map<number, ForumTopic> = new Map();
    for(const mid of messages) {
      const message = this.getMessageByPeer(peerId, mid);
      const threadKey = this.getThreadKey(message);
      if(!threadKey) {
        continue;
      }

      const threadId = +threadKey.split('_')[1];
      if(this.threadsStorage[peerId]?.[threadId]) {
        threadKeys.add(threadKey);

        if(!topics.has(threadId)) {
          const topic = this.dialogsStorage.getForumTopic(peerId, threadId);
          if(topic) {
            topics.set(threadId, topic);
          }
        }
      }
    }

    const historyUpdated = this.handleDeletedMessages(
      peerId,
      this.getHistoryMessagesStorage(peerId),
      messages
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

    const dialogs: (MTDialog.dialog | ForumTopic)[] = [
      ...topics.values()
    ];

    const dialog = this.getDialogOnly(peerId);
    if(dialog) {
      dialogs.unshift(dialog);
    }

    dialogs.forEach((dialog) => {
      const isTopic = dialog._ === 'forumTopic';
      const affected = historyUpdated.unreadMentions || historyUpdated.unread;
      const releaseUnreadCount = affected && this.dialogsStorage.prepareDialogUnreadCountModifying(dialog);

      if(historyUpdated.unread) {
        dialog.unread_count = Math.max(0, dialog.unread_count - historyUpdated.unread);
      }

      if(historyUpdated.unreadMentions) {
        dialog.unread_mentions_count = !dialog.unread_count ? 0 : Math.max(0, dialog.unread_mentions_count - historyUpdated.unreadMentions);
      }

      if(affected) {
        releaseUnreadCount();

        if(!isTopic) {
          this.rootScope.dispatchEvent('dialog_unread', {peerId, dialog});
        }
      }

      if(historyUpdated.msgs.has(dialog.top_message)) {
        const historyStorage = this.getHistoryStorage(dialog.peerId, isTopic ? dialog.id : undefined);
        const slice = historyStorage.history.first;
        if(slice.isEnd(SliceEnd.Bottom) && slice.length) {
          const mid = slice[0];
          const message = this.getMessageByPeer(peerId, mid);
          this.setDialogTopMessage(message, dialog);
        } else if(isTopic) {
          this.dialogsStorage.getForumTopicById(peerId, dialog.id);
        } else {
          this.reloadConversation(peerId);
        }
      }
    });
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
    const peerId = update.peerId ?? update.channel_id.toPeerId(true);
    const mid = generateMessageId(update.id);
    const message = this.getMessageByPeer(peerId, mid) as Message.message;
    if(message?.views !== undefined && message.views < views) {
      message.views = views;
      this.pushBatchUpdate('messages_views', this.batchUpdateViews, message.peerId + '_' + message.mid);
      this.setDialogToStateIfMessageIsTop(message);
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
    const messageId = this.generateTempMessageId(peerId);
    const message: Message.message = {
      _: 'message',
      id: messageId,
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
      this.pendingTopMsgs[peerId] = messageId;
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

    /* const storage = this.getSearchStorage(peerId, 'inputMessagesFilterPinned');
    if(storage.count !== storage.history.length) {
      if(storage.count !== undefined) {
        delete this.searchesStorage[peerId]['inputMessagesFilterPinned'];
      }

      rootScope.broadcast('peer_pinned_messages', peerId);
      break;
    } */

    const messages = update.messages.map((id) => generateMessageId(id));

    const storage = this.getHistoryMessagesStorage(peerId);
    const missingMessages = messages.filter((mid) => !storage.has(mid));
    const getMissingPromise = missingMessages.length ? Promise.all(missingMessages.map((mid) => this.reloadMessages(peerId, mid))) : Promise.resolve();
    getMissingPromise.finally(() => {
      const werePinned = update.pFlags?.pinned;
      if(werePinned) {
        for(const mid of messages) {
          // storage.history.push(mid);
          const message = storage.get(mid) as Message.message;
          message.pFlags.pinned = true;
        }

        /* if(this.pinnedMessages[peerId]?.maxId) {
          const maxMid = Math.max(...messages);
          this.pinnedMessages
        } */

        // storage.history.sort((a, b) => b - a);
      } else {
        for(const mid of messages) {
          // storage.history.findAndSplice((_mid) => _mid === mid);
          const message = storage.get(mid) as Message.message;
          delete message.pFlags.pinned;
        }
      }

      /* const info = this.pinnedMessages[peerId];
      if(info) {
        info.count += messages.length * (werePinned ? 1 : -1);
      } */

      delete this.pinnedMessages[this.getPinnedMessagesKey(peerId)];
      this.appStateManager.getState().then((state) => {
        delete state.hiddenPinnedMessages[peerId];
        this.rootScope.dispatchEvent('peer_pinned_messages', {peerId, mids: messages, pinned: werePinned});
      });
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
    const dialog = this.dialogsStorage.getDialogOrTopic(peerId, isTopic ? generateMessageId(peer.top_msg_id) : undefined);
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

    const mid = generateMessageId(message.id);

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
    const peerId = this.appPeersManager.getPeerId(update.peer);

    const storage = this.scheduledMessagesStorage[peerId];
    if(storage) {
      const mids = update.messages.map((id) => generateMessageId(id));
      this.handleDeletedMessages(peerId, storage, mids);

      this.rootScope.dispatchEvent('scheduled_delete', {peerId, mids});
    }
  };

  private onUpdateMessageExtendedMedia = (update: Update.updateMessageExtendedMedia) => {
    const peerId = this.appPeersManager.getPeerId(update.peer);
    const mid = generateMessageId(update.msg_id);
    const storage = this.getHistoryMessagesStorage(peerId);
    if(!storage.has(mid)) {
      // this.fixDialogUnreadMentionsIfNoMessage(peerId);
      return;
    }

    const message = this.getMessageFromStorage(storage, mid) as Message.message;
    const messageMedia = message.media as MessageMedia.messageMediaInvoice;
    if(messageMedia.extended_media?._ === 'messageExtendedMedia') {
      return;
    }

    messageMedia.extended_media = update.extended_media;
    this.onUpdateEditMessage({
      _: 'updateEditMessage',
      message,
      pts: 0,
      pts_count: 0
    });
  };

  private onUpdateTranscribedAudio = (update: Update.updateTranscribedAudio) => {
    const peerId = this.appPeersManager.getPeerId(update.peer);
    const text = update.text;
    const mid = generateMessageId(update.msg_id);

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

  private updateMessageRepliesIfNeeded(threadMessage: MyMessage) {
    try { // * на всякий случай, скорее всего это не понадобится
      const threadKey = this.getThreadKey(threadMessage);
      if(threadKey) {
        const repliesKey = this.threadsToReplies[threadKey];
        if(repliesKey) {
          const [peerId, mid] = repliesKey.split('_');

          this.updateMessage(peerId.toPeerId(), +mid, 'replies_updated');
        }
      }
    } catch(err) {
      this.log.error('incrementMessageReplies err', err, threadMessage);
    }
  }

  private getThreadKey(threadMessage: MyMessage) {
    let threadKey = '';
    if(threadMessage?.peerId?.isAnyChat()) {
      const threadId = getMessageThreadId(threadMessage, this.appChatsManager.isForum(threadMessage.peerId.toChatId()));
      if(threadId) {
        threadKey = threadMessage.peerId + '_' + threadId;
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

  public canSendToPeer(peerId: PeerId, threadId?: number, action: ChatRights = 'send_messages') {
    if(this.appPeersManager.isPeerRestricted(peerId)) {
      return false;
    }

    if(peerId.isAnyChat()) {
      const chatId = peerId.toChatId();
      if(threadId) {
        const topic = this.dialogsStorage.getForumTopic(peerId, threadId);
        if(topic?.pFlags?.closed && !this.appChatsManager.hasRights(chatId, 'manage_topics')) {
          return false;
        }
      }

      // const isChannel = appPeersManager.isChannel(peerId);
      const chat = this.appChatsManager.getChat(chatId) as Chat.chat;
      const hasRights = /* isChannel &&  */this.appChatsManager.hasRights(chatId, action, undefined, !!threadId);
      return /* !isChannel ||  */hasRights && (!chat.pFlags.left || !!threadId);
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
        callback(message).then(deferred.resolve, deferred.reject);
      }

      delete this.tempFinalizeCallbacks[tempId];
    }

    // set cached url to media
    if((message as Message.message).media) {
      assumeType<Message.message>(message);
      const {photo: newPhoto, document: newDoc} = message.media as any;
      if(newPhoto) {
        const photo = this.appPhotosManager.getPhoto('' + tempId);
        if(/* photo._ !== 'photoEmpty' */photo) {
          const newPhotoSize = newPhoto.sizes[newPhoto.sizes.length - 1];
          const cacheContext = this.thumbsStorage.getCacheContext(newPhoto, newPhotoSize.type);
          const oldCacheContext = this.thumbsStorage.getCacheContext(photo, THUMB_TYPE_FULL);
          Object.assign(cacheContext, oldCacheContext);

          const photoSize = newPhoto.sizes[newPhoto.sizes.length - 1] as PhotoSize.photoSize;

          const downloadOptions = getPhotoDownloadOptions(newPhoto, photoSize);
          const fileName = getFileNameByLocation(downloadOptions.location);
          // this.appDownloadManager.fakeDownload(fileName, oldCacheContext.url);
        }
      } else if(newDoc) {
        const oldDoc = this.appDocsManager.getDoc('' + tempId);
        if(oldDoc) {
          const oldCacheContext = this.thumbsStorage.getCacheContext(oldDoc);
          if(
            /* doc._ !== 'documentEmpty' &&  */
            oldDoc.type &&
            oldDoc.type !== 'sticker' &&
            oldDoc.mime_type !== 'image/gif' &&
            oldCacheContext.url
          ) {
            const cacheContext = this.thumbsStorage.getCacheContext(newDoc);
            Object.assign(cacheContext, oldCacheContext);

            const fileName = getDocumentInputFileName(newDoc);
            // this.appDownloadManager.fakeDownload(fileName, oldCacheContext.url);
          }
        }
      } else if((message.media as MessageMedia.messageMediaPoll).poll) {
        delete this.appPollsManager.polls[tempId];
        delete this.appPollsManager.results[tempId];
      }
    }

    const tempMessage = this.getMessageFromStorage(storage, tempId);
    storage.delete(tempId);

    if(!(tempMessage as Message.message).reply_markup && (message as Message.message).reply_markup) {
      setTimeout(() => { // TODO: refactor it to normal buttons adding
        if(!this.getMessageFromStorage(storage, message.mid)) {
          return;
        }

        this.rootScope.dispatchEvent('message_edit', {storageKey: storage.key, peerId: message.peerId, mid: message.mid, message});
      }, 0);
    }

    this.handleReleasingMessage(tempMessage, storage);

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
    if(canViewMessageReadParticipants && limit === undefined) {
      limit = 100;
    } else if(limit === undefined) {
      limit = 50;
    }

    return Promise.all([
      canViewMessageReadParticipants && !reaction && !skipReadParticipants ? this.getMessageReadParticipants(message.peerId, message.mid).catch(() => [] as UserId[]) : [] as UserId[],

      message.reactions?.recent_reactions?.length && !skipReactionsList ? this.appReactionsManager.getMessageReactionsList(message.peerId, message.mid, limit, reaction, offset).catch((err) => emptyMessageReactionsList) : emptyMessageReactionsList
    ]).then(([userIds, messageReactionsList]) => {
      const readParticipantsPeerIds = userIds.map((userId) => userId.toPeerId());

      const filteredReadParticipants = readParticipantsPeerIds.slice();
      forEachReverse(filteredReadParticipants, (peerId, idx, arr) => {
        if(messageReactionsList.reactions.some((reaction) => this.appPeersManager.getPeerId(reaction.peer_id) === peerId)) {
          arr.splice(idx, 1);
        }
      });

      let combined: {peerId: PeerId, reaction?: Reaction}[] = messageReactionsList.reactions.map((reaction) => ({peerId: this.appPeersManager.getPeerId(reaction.peer_id), reaction: reaction.reaction}));
      combined = combined.concat(filteredReadParticipants.map((readPeerId) => ({peerId: readPeerId})));

      return {
        reactions: messageReactionsList.reactions,
        reactionsCount: messageReactionsList.count,
        readParticipants: readParticipantsPeerIds,
        combined: combined,
        nextOffset: messageReactionsList.next_offset
      };
    });
  }

  public getMessageReadParticipants(peerId: PeerId, mid: number): Promise<UserId[]> {
    return this.apiManager.invokeApiSingle('messages.getMessageReadParticipants', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid)
    }).then((userIds) => { // ! convert long to number
      return userIds.map((userId) => userId.toUserId());
    });
  }

  public async canViewMessageReadParticipants(message: Message) {
    if(
      message?._ !== 'message' ||
      message.pFlags.is_outgoing ||
      !message.pFlags.out ||
      !this.appPeersManager.isAnyGroup(message.peerId)
    ) {
      return false;
    }

    const chat = this.appChatsManager.getChat(message.peerId.toChatId()) as Chat.chat | Chat.channel;
    const appConfig = await this.apiManager.getAppConfig();
    return chat.participants_count <= appConfig.chat_read_mark_size_threshold &&
      (tsNow(true) - message.date) < appConfig.chat_read_mark_expire_period;
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
      const updates: Update[] = new Array(mids.length);
      for(let i = 0, length = mids.length; i < length; ++i) {
        updates[i] = {
          _: 'updateChannelMessageViews',
          channel_id: NULL_PEER_ID,
          peerId,
          id: mids[i],
          views: views.views[i].views
        };
      }

      this.apiUpdatesManager.processUpdateMessage({
        _: 'updates',
        updates,
        chats: views.chats,
        users: views.users
      });
    });
  }

  private notifyAboutMessage(message: MyMessage, options: Partial<{
    fwdCount: number,
    peerReaction: MessagePeerReaction,
    peerTypeNotifySettings: PeerNotifySettings
  }> = {}) {
    const peerId = this.getMessagePeer(message);

    if(this.appPeersManager.isPeerRestricted(peerId)) {
      return;
    }

    const tabs = appTabsManager.getTabs();
    let tab = tabs.find((tab) => {
      const {chatPeerIds} = tab.state;
      return chatPeerIds[chatPeerIds.length - 1] === peerId;
    });

    if(!tab && tabs.length) {
      tabs.sort((a, b) => a.state.idleStartTime - b.state.idleStartTime);
      tab = !tabs[0].state.idleStartTime ? tabs[0] : tabs[tabs.length - 1];
    }

    const port = MTProtoMessagePort.getInstance<false>();
    port.invokeVoid('notificationBuild', {
      message,
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
    return this.filterMessages(message, (message) => !!(message as Message.message).replies)[0] as any;
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

  public async getNewHistory(peerId: PeerId, threadId?: number) {
    if(!this.isFetchIntervalNeeded(peerId)) {
      return;
    }

    const historyStorage = this.getHistoryStorage(peerId, threadId);
    const slice = historyStorage.history.slice;
    if(!slice.isEnd(SliceEnd.Bottom)) {
      return;
    }

    delete historyStorage.maxId;
    slice.unsetEnd(SliceEnd.Bottom);

    // if there is no id - then request by first id because cannot request by id 0 with backLimit
    const historyResult = await this.getHistory(peerId, slice[0] ?? 1, 0, 50, threadId);
    for(let i = 0, length = historyResult.history.length; i < length; ++i) {
      this.handleNewMessage(this.getMessageByPeer(peerId, historyResult.history[i]));
    }

    return {isBottomEnd: historyStorage.history.slice.isEnd(SliceEnd.Bottom)};
  }

  /**
   * * https://core.telegram.org/api/offsets, offset_id is inclusive
   */
  // public getHistory(peerId: PeerId, maxId?: number, limit?: number, backLimit?: number, threadId?: number, onlyCache?: false): Promise<HistoryResult> | HistoryResult;
  // public getHistory(peerId: PeerId, maxId?: number, limit?: number, backLimit?: number, threadId?: number, onlyCache?: true): HistoryResult;
  public getHistory(peerId: PeerId, maxId: number = 0, limit?: number, backLimit?: number, threadId?: number/* , onlyCache?: boolean */): Promise<HistoryResult> | HistoryResult {
    const historyStorage = this.getHistoryStorage(peerId, threadId);

    if(this.appPeersManager.isPeerRestricted(peerId)) {
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

    let offset = 0;
    /*
    let offsetFound = true;

    if(maxId) {
      offsetFound = false;
      for(; offset < historyStorage.history.length; offset++) {
        if(maxId > historyStorage.history.slice[offset]) {
          offsetFound = true;
          break;
        }
      }
    }

    if(offsetFound && (
      historyStorage.count !== null && historyStorage.history.length === historyStorage.count ||
      historyStorage.history.length >= offset + limit
      )) {
      if(backLimit) {
        backLimit = Math.min(offset, backLimit);
        offset = Math.max(0, offset - backLimit);
        limit += backLimit;
      } else {
        limit = limit;
      }

      const history = historyStorage.history.slice.slice(offset, offset + limit);
      return {
        count: historyStorage.count,
        history: history,
        offsetIdOffset: offset
      };
    }

    if(offsetFound) {
      offset = 0;
    } */

    if(backLimit) {
      offset = -backLimit;
      limit += backLimit;

      /* return this.requestHistory(reqPeerId, maxId, limit, offset, undefined, threadId).then((historyResult) => {
        historyStorage.count = (historyResult as MessagesMessages.messagesMessagesSlice).count || historyResult.messages.length;

        const history = (historyResult.messages as MyMessage[]).map((message) => message.mid);
        return {
          count: historyStorage.count,
          history,
          offsetIdOffset: (historyResult as MessagesMessages.messagesMessagesSlice).offset_id_offset || 0
        };
      }); */
    }

    const haveSlice = historyStorage.history.sliceMe(maxId, offset, limit);
    if(haveSlice && (haveSlice.slice.length === limit || (haveSlice.fulfilled & SliceEnd.Both) === SliceEnd.Both)) {
      return {
        count: historyStorage.count,
        history: Array.from(haveSlice.slice),
        isEnd: haveSlice.slice.getEnds(),
        offsetIdOffset: haveSlice.offsetIdOffset
      };
    }

    // if(onlyCache) {
    //   return;
    // }

    return this.fillHistoryStorage(peerId, maxId, limit, offset, historyStorage, threadId).then(() => {
      const slice = historyStorage.history.sliceMe(maxId, offset, limit);
      const f = slice?.slice || historyStorage.history.constructSlice();
      return {
        count: historyStorage.count,
        history: Array.from(f),
        isEnd: f.getEnds(),
        offsetIdOffset: slice?.offsetIdOffset || historyStorage.count
      };
    });
  }

  public isHistoryResultEnd(historyResult: Exclude<MessagesMessages, MessagesMessages.messagesMessagesNotModified>, limit: number, add_offset: number) {
    const {offset_id_offset, messages} = historyResult as MessagesMessages.messagesMessagesSlice;

    const count = (historyResult as MessagesMessages.messagesMessagesSlice).count || messages.length;
    const offsetIdOffset = offset_id_offset || 0;

    const topWasMeantToLoad = add_offset < 0 ? limit + add_offset : limit;

    const isTopEnd = offsetIdOffset >= (count - topWasMeantToLoad) || count < topWasMeantToLoad;
    const isBottomEnd = !offsetIdOffset || (add_offset < 0 && (offsetIdOffset + add_offset) <= 0);

    return {count, offsetIdOffset, isTopEnd, isBottomEnd};
  }

  public mergeHistoryResult(
    slicedArray: SlicedArray<number>,
    historyResult: Parameters<AppMessagesManager['isHistoryResultEnd']>[0],
    offset_id: number,
    limit: number,
    add_offset: number
  ) {
    const {messages} = historyResult as MessagesMessages.messagesMessagesSlice;
    const isEnd = this.isHistoryResultEnd(historyResult, limit, add_offset);
    const {count, offsetIdOffset, isTopEnd, isBottomEnd} = isEnd;
    const mids = messages.map((message) => {
      return (message as MyMessage).mid;
    });

    // * add bound manually.
    // * offset_id will be inclusive only if there is 'add_offset' <= -1 (-1 - will only include the 'offset_id')
    // * check that offset_id is not 0
    if(offset_id && getServerMessageId(offset_id) && !mids.includes(offset_id) && offsetIdOffset < count) {
      let i = 0;
      for(const length = mids.length; i < length; ++i) {
        if(offset_id > mids[i]) {
          break;
        }
      }

      mids.splice(i, 0, offset_id);
    }

    const slice = slicedArray.insertSlice(mids) || slicedArray.slice;
    if(isTopEnd) {
      slice.setEnd(SliceEnd.Top);
    }

    if(isBottomEnd) {
      slice.setEnd(SliceEnd.Bottom);
    }

    return {slice, mids, messages, ...isEnd};
  }

  public fillHistoryStorage(peerId: PeerId, offset_id: number, limit: number, add_offset: number, historyStorage: HistoryStorage, threadId?: number): Promise<void> {
    const wasMaxId = historyStorage.maxId;
    return this.requestHistory(peerId, offset_id, limit, add_offset, undefined, threadId).then((historyResult) => {
      const {count, isBottomEnd, slice, messages} = this.mergeHistoryResult(historyStorage.history, historyResult, offset_id, limit, add_offset);

      historyStorage.count = count;

      /* if(!maxId && historyResult.messages.length) {
        maxId = this.incrementMessageId((historyResult.messages[0] as MyMessage).mid, 1);
      }

      const wasTotalCount = historyStorage.history.length; */

      for(let i = 0, length = messages.length; i < length; ++i) {
        const message = messages[i] as MyMessage;
        if(this.mergeReplyKeyboard(historyStorage, message)) {
          this.rootScope.dispatchEvent('history_reply_markup', {peerId});
        }
      }

      if(isBottomEnd) {
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

      /* const isBackLimit = offset < 0 && -offset !== fullLimit;
      if(isBackLimit) {
        return;
      }

      const totalCount = historyStorage.history.length;
      fullLimit -= (totalCount - wasTotalCount);

      const migratedNextPeer = this.migratedFromTo[peerId];
      const migratedPrevPeer = this.migratedToFrom[peerId]
      const isMigrated = migratedNextPeer !== undefined || migratedPrevPeer !== undefined;

      if(isMigrated) {
        historyStorage.count = Math.max(historyStorage.count, totalCount) + 1;
      }

      if(fullLimit > 0) {
        maxId = historyStorage.history.slice[totalCount - 1];
        if(isMigrated) {
          if(!historyResult.messages.length) {
            if(migratedPrevPeer) {
              maxId = 0;
              peerId = migratedPrevPeer;
            } else {
              historyStorage.count = totalCount;
              return true;
            }
          }

          return this.fillHistoryStorage(peerId, maxId, fullLimit, historyStorage, threadId);
        } else if(totalCount < historyStorage.count) {
          return this.fillHistoryStorage(peerId, maxId, fullLimit, offset, historyStorage, threadId);
        }
      } */
    });
  }

  public requestHistory(peerId: PeerId, maxId: number, limit = 0, offset = 0, offsetDate = 0, threadId = 0): Promise<Exclude<MessagesMessages, MessagesMessages.messagesMessagesNotModified>> {
    // console.trace('requestHistory', peerId, maxId, limit, offset);

    // rootScope.broadcast('history_request');

    const options: MessagesGetReplies | MessagesGetHistory = {
      peer: this.appPeersManager.getInputPeerById(peerId),
      offset_id: getServerMessageId(maxId) || 0,
      offset_date: offsetDate,
      add_offset: offset,
      limit,
      max_id: 0,
      min_id: 0,
      hash: 0
    };

    if(threadId) {
      (options as MessagesGetReplies).msg_id = getServerMessageId(threadId) || 0;
    }

    const promise: ReturnType<AppMessagesManager['requestHistory']> = this.apiManager.invokeApiSingle(threadId ? 'messages.getReplies' : 'messages.getHistory', options, {
      // timeout: APITIMEOUT,
      noErrorBox: true
    }) as any;

    return promise.then((historyResult) => {
      if(DEBUG) {
        this.log('requestHistory result:', peerId, historyResult, maxId, limit, offset);
      }

      this.appUsersManager.saveApiUsers(historyResult.users);
      this.appChatsManager.saveApiChats(historyResult.chats);
      this.saveMessages(historyResult.messages);

      if('pts' in historyResult) {
        this.apiUpdatesManager.addChannelState(peerId.toChatId(), historyResult.pts);
      }

      let length = historyResult.messages.length, count = (historyResult as MessagesMessages.messagesMessagesSlice).count;
      if(length && !historyResult.messages[length - 1]) {
        historyResult.messages.splice(length - 1, 1);
        length--;
        count--;
      }

      // will load more history if last message is album grouped (because it can be not last item)
      // historyResult.messages: desc sorted
      const historyStorage = this.getHistoryStorage(peerId, threadId);
      const oldestMessage: Message.message = historyResult.messages[length - 1] as any;
      if(length && oldestMessage.grouped_id) {
        const foundSlice = historyStorage.history.findSlice(oldestMessage.mid);
        if(foundSlice && (foundSlice.slice.length + historyResult.messages.length) < count) {
          return this.requestHistory(peerId, oldestMessage.mid, 10, 0, offsetDate, threadId).then((_historyResult) => {
            return historyResult;
          });
        }
      }

      return historyResult;
    }, (error) => {
      switch(error.type) {
        case 'CHANNEL_PRIVATE':
          let channel = this.appChatsManager.getChat(peerId.toChatId());
          if(channel._ === 'channel') {
            channel = {
              _: 'channelForbidden',
              id: peerId.toChatId(),
              access_hash: channel.access_hash,
              title: channel.title,
              pFlags: channel.pFlags
            };
          }

          this.apiUpdatesManager.processUpdateMessage({
            _: 'updates',
            updates: [{
              _: 'updateChannel',
              channel_id: peerId.toChatId()
            }],
            chats: [channel],
            users: []
          });
          break;
      }

      throw error;
    });
  }

  public fetchSingleMessages() {
    if(this.fetchSingleMessagesPromise) {
      return this.fetchSingleMessagesPromise;
    }

    return this.fetchSingleMessagesPromise = pause(0).then(() => {
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
        if(peerId.isAnyChat() && this.appPeersManager.isChannel(peerId)) {
          promise = this.apiManager.invokeApiSingle('channels.getMessages', {
            channel: this.appChatsManager.getChannelInput(peerId.toChatId()),
            id: msgIds
          });
        } else {
          promise = this.apiManager.invokeApiSingle('messages.getMessages', {
            id: msgIds
          });
        }

        const after = promise.then((getMessagesResult) => {
          assumeType<Exclude<MessagesMessages.messagesMessages, MessagesMessages.messagesMessagesNotModified>>(getMessagesResult);

          this.appUsersManager.saveApiUsers(getMessagesResult.users);
          this.appChatsManager.saveApiChats(getMessagesResult.chats);
          const messages = this.saveMessages(getMessagesResult.messages);

          for(let i = 0; i < messages.length; ++i) {
            const message = messages[i];
            if(!message) {
              continue;
            }

            const mid = generateMessageId(message.id);
            const promise = map.get(mid);
            promise.resolve(message);
            map.delete(mid);
          }

          if(map.size) {
            for(const [mid, promise] of map) {
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

    const message = this.getMessageByPeer(peerId, mid);
    if(message && !overwrite) {
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

  public fetchMessageReplyTo(message: MyMessage) {
    if(!message.reply_to_mid) return Promise.resolve(this.generateEmptyMessage(0));
    const replyToPeerId = message.reply_to.reply_to_peer_id ? this.appPeersManager.getPeerId(message.reply_to.reply_to_peer_id) : message.peerId;
    return this.reloadMessages(replyToPeerId, message.reply_to_mid).then((originalMessage) => {
      if(!originalMessage) { // ! break the infinite loop
        message = this.getMessageByPeer(message.peerId, message.mid); // message can come from other thread
        delete message.reply_to_mid; // ! WARNING!
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
      (!force && typing?.action?._ === action._)
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
    const history: {
      count: number,
      unread: number,
      unreadMentions: number,
      msgs: Set<number>,
      albums?: {[groupId: string]: Set<number>},
    } = {
      count: 0,
      unread: 0,
      unreadMentions: 0,
      msgs: new Set()
    };

    for(const mid of messages) {
      const message: MyMessage = this.getMessageFromStorage(storage, mid);
      if(!message) {
        this.fixDialogUnreadMentionsIfNoMessage(peerId);
        continue;
      }

      this.handleReleasingMessage(message, storage);

      this.updateMessageRepliesIfNeeded(message);

      if(!message.pFlags.out && !message.pFlags.is_outgoing && message.pFlags.unread) {
        ++history.unread;
        this.rootScope.dispatchEvent('notification_cancel', 'msg' + mid);

        if(message.pFlags.mentioned) {
          ++history.unreadMentions;
          this.modifyCachedMentions(peerId, mid, false);
        }
      }

      ++history.count;
      history.msgs.add(mid);

      message.deleted = true;

      const groupedId = (message as Message.message).grouped_id;
      if(groupedId) {
        const groupedStorage = this.groupedMessagesStorage[groupedId];
        if(groupedStorage) {
          groupedStorage.delete(mid);

          if(!history.albums) history.albums = {};
          (history.albums[groupedId] || (history.albums[groupedId] = new Set())).add(mid);

          if(!groupedStorage.size) {
            delete history.albums;
            delete this.groupedMessagesStorage[groupedId];
          }
        }
      }

      storage.delete(mid);
    }

    if(history.albums) {
      for(const groupedId in history.albums) {
        this.dispatchAlbumEdit(groupedId, storage, [...history.albums[groupedId]]);
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
        this.dispatchAlbumEdit(groupedId, storage, []);
      }
    }
  }

  private dispatchAlbumEdit(groupedId: string, storage: MessagesStorage, deletedMids?: number[]) {
    const mids = this.getMidsByAlbum(groupedId);
    const messages = mids.map((mid) => this.getMessageFromStorage(storage, mid)) as Message.message[];
    this.rootScope.dispatchEvent('album_edit', {peerId: messages[0].peerId, groupId: groupedId, deletedMids: deletedMids || [], messages});
  }

  public getDialogUnreadCount(dialog: Dialog | ForumTopic) {
    let unreadCount = dialog.unread_count;
    if(!this.dialogsStorage.isTopic(dialog) && this.appPeersManager.isForum(dialog.peerId)) {
      const forumUnreadCount = this.dialogsStorage.getForumUnreadCount(dialog.peerId);
      if(forumUnreadCount instanceof Promise) {
        unreadCount = 0;
      } else {
        unreadCount = forumUnreadCount.count;
      }
    }

    return unreadCount || +!!(dialog as Dialog).pFlags?.unread_mark;
  }

  public isDialogUnread(dialog: Dialog | ForumTopic) {
    return !!this.getDialogUnreadCount(dialog);
  }

  public canForward(message: Message.message | Message.messageService) {
    return message?._ === 'message' && !(message as Message.message).pFlags.noforwards && !this.appPeersManager.noForwards(message.peerId);
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
    const toDispatch: {message: Message.message, changedResults: ReactionCount.reactionCount[]}[] = [];

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

      toDispatch.push({message, changedResults});
    }

    return toDispatch;
  };

  public saveDefaultSendAs(peerId: PeerId, sendAsPeerId: PeerId) {
    const channelFull = this.appProfileManager.getCachedFullChat(peerId.toChatId()) as ChatFull.channelFull;
    channelFull.default_send_as = this.appPeersManager.getOutputPeer(sendAsPeerId);
    return this.apiManager.invokeApi('messages.saveDefaultSendAs', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      send_as: this.appPeersManager.getInputPeerById(sendAsPeerId)
    });
  }
}
