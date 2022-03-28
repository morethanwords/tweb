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

import { LazyLoadQueueBase } from "../../components/lazyLoadQueue";
import ProgressivePreloader from "../../components/preloader";
import { CancellablePromise, deferredPromise } from "../../helpers/cancellablePromise";
import { formatDateAccordingToTodayNew, formatTime, tsNow } from "../../helpers/date";
import { createPosterForVideo } from "../../helpers/files";
import { randomLong } from "../../helpers/random";
import { Chat, ChatFull, Dialog as MTDialog, DialogPeer, DocumentAttribute, InputMedia, InputMessage, InputPeerNotifySettings, InputSingleMedia, Message, MessageAction, MessageEntity, MessageFwdHeader, MessageMedia, MessageReplies, MessageReplyHeader, MessagesDialogs, MessagesFilter, MessagesMessages, MethodDeclMap, NotifyPeer, PeerNotifySettings, PhotoSize, SendMessageAction, Update, Photo, Updates, ReplyMarkup, InputPeer, InputPhoto, InputDocument, InputGeoPoint, WebPage, GeoPoint, ReportReason, MessagesGetDialogs, InputChannel, InputDialogPeer, ReactionCount, MessagePeerReaction, MessagesSearchCounter, Peer, MessageReactions } from "../../layer";
import { ArgumentTypes, InvokeApiOptions } from "../../types";
import I18n, { FormatterArguments, i18n, join, langPack, LangPackKey, UNSUPPORTED_LANG_PACK_KEY, _i18n } from "../langPack";
import { logger, LogTypes } from "../logger";
import type { ApiFileManager } from '../mtproto/apiFileManager';
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import referenceDatabase, { ReferenceContext } from "../mtproto/referenceDatabase";
import serverTimeManager from "../mtproto/serverTimeManager";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import DialogsStorage, { GLOBAL_FOLDER_ID } from "../storages/dialogs";
import FiltersStorage from "../storages/filters";
//import { telegramMeWebService } from "../mtproto/mtproto";
import apiUpdatesManager from "./apiUpdatesManager";
import appChatsManager, { ChatRights } from "./appChatsManager";
import appDocsManager, { MyDocument } from "./appDocsManager";
import appDownloadManager from "./appDownloadManager";
import appPeersManager from "./appPeersManager";
import appPhotosManager, { MyPhoto } from "./appPhotosManager";
import appPollsManager from "./appPollsManager";
import appStateManager from "./appStateManager";
import appUsersManager from "./appUsersManager";
import appWebPagesManager from "./appWebPagesManager";
import appDraftsManager, { MyDraftMessage } from "./appDraftsManager";
import { getFileNameByLocation } from "../../helpers/fileName";
import appProfileManager from "./appProfileManager";
import DEBUG, { MOUNT_CLASS_TO } from "../../config/debug";
import SlicedArray, { Slice, SliceEnd } from "../../helpers/slicedArray";
import appNotificationsManager, { NotifyOptions } from "./appNotificationsManager";
import PeerTitle from "../../components/peerTitle";
import htmlToDocumentFragment from "../../helpers/dom/htmlToDocumentFragment";
import htmlToSpan from "../../helpers/dom/htmlToSpan";
import { MUTE_UNTIL, NULL_PEER_ID, REPLIES_PEER_ID, SERVICE_PEER_ID } from "../mtproto/mtproto_config";
import formatCallDuration from "../../helpers/formatCallDuration";
import appAvatarsManager from "./appAvatarsManager";
import telegramMeWebManager from "../mtproto/telegramMeWebManager";
import { getMiddleware } from "../../helpers/middleware";
import assumeType from "../../helpers/assumeType";
import appMessagesIdsManager from "./appMessagesIdsManager";
import type { MediaSize } from "../../helpers/mediaSizes";
import IMAGE_MIME_TYPES_SUPPORTED from "../../environment/imageMimeTypesSupport";
import VIDEO_MIME_TYPES_SUPPORTED from "../../environment/videoMimeTypesSupport";
import './appGroupCallsManager';
import appGroupCallsManager from "./appGroupCallsManager";
import appReactionsManager from "./appReactionsManager";
import { getRestrictionReason, isRestricted } from "../../helpers/restrictions";
import copy from "../../helpers/object/copy";
import getObjectKeysAndSort from "../../helpers/object/getObjectKeysAndSort";
import forEachReverse from "../../helpers/array/forEachReverse";
import indexOfAndSplice from "../../helpers/array/indexOfAndSplice";
import deepEqual from "../../helpers/object/deepEqual";
import escapeRegExp from "../../helpers/string/escapeRegExp";
import limitSymbols from "../../helpers/string/limitSymbols";
import splitStringByLength from "../../helpers/string/splitStringByLength";
import debounce from "../../helpers/schedulers/debounce";

//console.trace('include');
// TODO: если удалить диалог находясь в папке, то он не удалится из папки и будет виден в настройках

const APITIMEOUT = 0;
const DO_NOT_READ_HISTORY = false;

export type HistoryStorage = {
  count: number | null,
  history: SlicedArray,

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
  history: Slice,
  offsetIdOffset?: number,
};

export type Dialog = MTDialog.dialog;

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
export type MessagesStorage = Map<number, any>;

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

export class AppMessagesManager {
  private messagesStorageByPeerId: {[peerId: string]: MessagesStorage};
  public groupedMessagesStorage: {[groupId: string]: MessagesStorage}; // will be used for albums
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
  public pinnedMessages: {[peerId: PeerId]: PinnedStorage};

  public threadsServiceMessagesIdsStorage: {[peerId_threadId: string]: number};
  private threadsToReplies: {
    [peerId_threadId: string]: string;
  };

  private pendingByRandomId: {
    [randomId: string]: {
      peerId: PeerId,
      tempId: number,
      threadId: number,
      storage: MessagesStorage
    }
  } = {};
  private pendingByMessageId: {[mid: string]: Long} = {};
  private pendingAfterMsgs: {[peerId: PeerId]: PendingAfterMsg} = {};
  public pendingTopMsgs: {[peerId: PeerId]: number} = {};
  private tempFinalizeCallbacks: {
    [tempId: string]: {
      [callbackName: string]: Partial<{
        deferred: CancellablePromise<void>, 
        callback: (message: any) => Promise<any>
      }>
    }
  } = {};
  
  private sendSmthLazyLoadQueue = new LazyLoadQueueBase(10);

  private needSingleMessages: Map<PeerId, Map<number, CancellablePromise<Message>>> = new Map();
  private fetchSingleMessagesPromise: Promise<void> = null;

  private maxSeenId = 0;

  public migratedFromTo: {[peerId: PeerId]: PeerId} = {};
  public migratedToFrom: {[peerId: PeerId]: PeerId} = {};

  private newMessagesHandleTimeout = 0;
  private newMessagesToHandle: {[peerId: PeerId]: Set<number>} = {};
  private newDialogsHandlePromise: Promise<any>;
  private newDialogsToHandle: {[peerId: PeerId]: Dialog} = {};
  public newUpdatesAfterReloadToHandle: {[peerId: PeerId]: Set<Update>} = {};

  private notificationsHandlePromise = 0;
  private notificationsToHandle: {[peerId: PeerId]: {
    fwdCount: number,
    fromId: PeerId,
    topMessage?: MyMessage
  }} = {};

  private reloadConversationsPromise: Promise<void>;
  private reloadConversationsPeers: Map<PeerId, {inputDialogPeer: InputDialogPeer, promise: CancellablePromise<Dialog>}> = new Map();

  public log = logger('MESSAGES', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn);

  public dialogsStorage: DialogsStorage;
  public filtersStorage: FiltersStorage;

  private groupedTempId = 0;

  private typings: {[peerId: PeerId]: {action: SendMessageAction, timeout?: number}} = {};

  private middleware: ReturnType<typeof getMiddleware>;

  private unreadMentions: {[peerId: PeerId]: SlicedArray} = {};
  private goToNextMentionPromises: {[peerId: PeerId]: Promise<any>} = {};
  
  private batchUpdates: {
    [k in keyof BatchUpdates]?: {
      callback: BatchUpdates[k],
      batch: ArgumentTypes<BatchUpdates[k]>[0]
    }
  } = {};
  private batchUpdatesDebounced: () => Promise<void>;

  constructor() {
    this.clear();

    rootScope.addMultipleEventsListeners({
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

      updateDeleteScheduledMessages: this.onUpdateDeleteScheduledMessages
    });

    // ! Invalidate notify settings, can optimize though
    rootScope.addEventListener('notify_peer_type_settings', ({key, settings}) => {
      const dialogs = this.dialogsStorage.getFolderDialogs(0).concat(this.dialogsStorage.getFolderDialogs(1));
      let filterFunc: (dialog: Dialog) => boolean;
      if(key === 'notifyUsers') filterFunc = (dialog) => dialog.peerId.isUser();
      else if(key === 'notifyBroadcasts') filterFunc = (dialog) => dialog.peerId.isBroadcast();
      else filterFunc = (dialog) => appPeersManager.isAnyGroup(dialog.peerId);

      dialogs
      .filter(filterFunc)
      .forEach(dialog => {
        rootScope.dispatchEvent('dialog_notify_settings', dialog);
      });
    });

    rootScope.addEventListener('webpage_updated', ({id, msgs}) => {
      msgs.forEach(({peerId, mid, isScheduled}) => {
        const storage = isScheduled ? this.getScheduledMessagesStorage(peerId) : this.getMessagesStorage(peerId);
        const message = this.getMessageFromStorage(storage, mid) as Message.message;
        if(!message) return;
        message.media = {
          _: 'messageMediaWebPage', 
          webpage: appWebPagesManager.getWebPage(id)
        };

        rootScope.dispatchEvent('message_edit', {
          storage,
          peerId,
          mid
        });
      });
    });

    rootScope.addEventListener('draft_updated', ({peerId, threadId, draft}) => {
      if(threadId) return;

      const dialog = this.getDialogOnly(peerId);
      if(dialog) {
        if(!threadId) {
          dialog.draft = draft;

          let drop = false;
          if(!draft && !appMessagesIdsManager.getServerMessageId(dialog.top_message)) {
            this.dialogsStorage.dropDialog(peerId);
            drop = true;
          } else {
            this.dialogsStorage.generateIndexForDialog(dialog);
            this.dialogsStorage.pushDialog(dialog);
          }

          rootScope.dispatchEvent('dialog_draft', {
            peerId,
            dialog,
            drop,
            draft,
            index: dialog.index
          });
        }
      } else {
        this.reloadConversation(peerId);
      }
    });

    rootScope.addEventListener('poll_update', ({poll}) => {
      const set = appPollsManager.pollToMessages[poll.id];
      if(set) {
        for(const key of set) {
          const [peerId, mid] = key.split('_');

          const message = this.getMessageByPeer(peerId.toPeerId(), +mid);
          this.setDialogToStateIfMessageIsTop(message);
        }
      }
    });
    
    appStateManager.getState().then(state => {
      if(state.maxSeenMsgId) {
        this.maxSeenId = state.maxSeenMsgId;
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
  }

  public clear() {
    if(this.middleware) {
      this.middleware.clean();
    } else {
      this.middleware = getMiddleware();
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

    this.dialogsStorage && this.dialogsStorage.clear();
    this.filtersStorage && this.filtersStorage.clear();
  }

  public construct() {
    this.filtersStorage = new FiltersStorage(this, appPeersManager, appUsersManager, appNotificationsManager, appStateManager, apiUpdatesManager, /* apiManager, */ rootScope);
    this.dialogsStorage = new DialogsStorage(this, appChatsManager, appPeersManager, appUsersManager, appDraftsManager, appNotificationsManager, appStateManager, apiUpdatesManager, serverTimeManager, appMessagesIdsManager);
  }

  public getInputEntities(entities: MessageEntity[]) {
    const sendEntites = copy(entities);
    sendEntites.forEach((entity) => {
      if(entity._ === 'messageEntityMentionName') {
        (entity as any as MessageEntity.inputMessageEntityMentionName)._ = 'inputMessageEntityMentionName';
        (entity as any as MessageEntity.inputMessageEntityMentionName).user_id = appUsersManager.getUserInput(entity.user_id);
      }
    });
    return sendEntites;
  }

  public invokeAfterMessageIsSent(tempId: number, callbackName: string, callback: (message: any) => Promise<any>) {
    const finalize = this.tempFinalizeCallbacks[tempId] ?? (this.tempFinalizeCallbacks[tempId] = {});
    const obj = finalize[callbackName] ?? (finalize[callbackName] = {deferred: deferredPromise<void>()});

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
        //this.log('invoke editMessage callback', message);
        return this.editMessage(message, text, options);
      });
    }

    let entities = options.entities || [];
    if(text) {
      text = RichTextProcessor.parseMarkdown(text, entities);
    }

    const schedule_date = options.scheduleDate || (message.pFlags.is_scheduled ? message.date : undefined);
    return apiManager.invokeApi('messages.editMessage', {
      peer: appPeersManager.getInputPeerById(peerId),
      id: message.id,
      message: text,
      media: options.newMedia,
      entities: entities.length ? this.getInputEntities(entities) : undefined,
      no_webpage: options.noWebPage,
      schedule_date
    }).then((updates) => {
      apiUpdatesManager.processUpdateMessage(updates);
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

  public sendText(peerId: PeerId, text: string, options: Partial<{
    entities: MessageEntity[],
    replyToMsgId: number,
    threadId: number,
    viaBotId: BotId,
    queryId: string,
    resultId: string,
    noWebPage: true,
    replyMarkup: ReplyMarkup,
    clearDraft: true,
    webPage: WebPage,
    scheduleDate: number,
    silent: true,
    sendAsPeerId: PeerId,
  }> = {}) {
    if(!text.trim()) {
      return Promise.resolve();
    }

    //this.checkSendOptions(options);

    if(options.threadId && !options.replyToMsgId) {
      options.replyToMsgId = options.threadId;
    }

    const MAX_LENGTH = rootScope.config.message_length_max;
    if(text.length > MAX_LENGTH) {
      const splitted = splitStringByLength(text, MAX_LENGTH);
      text = splitted[0];

      if(splitted.length > 1) {
        delete options.webPage;
      }

      for(let i = 1; i < splitted.length; ++i) {
        setTimeout(() => {
          this.sendText(peerId, splitted[i], options);
        }, i);
      }
    }

    peerId = appPeersManager.getPeerMigratedTo(peerId) || peerId;

    let entities = options.entities || [];
    if(!options.viaBotId) {
      text = RichTextProcessor.parseMarkdown(text, entities);
      //entities = RichTextProcessor.mergeEntities(entities, RichTextProcessor.parseEntities(text));
    }

    let sendEntites = this.getInputEntities(entities);
    if(!sendEntites.length) {
      sendEntites = undefined;
    }

    const message = this.generateOutgoingMessage(peerId, options);
    message.entities = entities;
    message.message = text;

    const replyToMsgId = options.replyToMsgId ? appMessagesIdsManager.getServerMessageId(options.replyToMsgId) : undefined;
    const isChannel = appPeersManager.isChannel(peerId);

    if(options.webPage) {
      message.media = {
        _: 'messageMediaWebPage',
        webpage: options.webPage
      };
    }

    const toggleError = (on: boolean) => {
      if(on) {
        message.error = true;
      } else {
        delete message.error;
      }
      rootScope.dispatchEvent('messages_pending');
    };

    message.send = () => {
      toggleError(false);
      const sentRequestOptions: PendingAfterMsg = {};
      if(this.pendingAfterMsgs[peerId]) {
        sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
      }

      const sendAs = options.sendAsPeerId ? appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
      let apiPromise: any;
      if(options.viaBotId) {
        apiPromise = apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: appPeersManager.getInputPeerById(peerId),
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId || undefined,
          query_id: options.queryId,
          id: options.resultId,
          clear_draft: options.clearDraft,
          send_as: sendAs
        }, sentRequestOptions);
      } else {
        apiPromise = apiManager.invokeApiAfter('messages.sendMessage', {
          no_webpage: options.noWebPage,
          peer: appPeersManager.getInputPeerById(peerId),
          message: text,
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId || undefined,
          entities: sendEntites,
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate || undefined,
          silent: options.silent,
          send_as: sendAs
        }, sentRequestOptions);
      }

      /* function is<T>(value: any, condition: boolean): value is T {
        return condition;
      } */

      //this.log('sendText', message.mid);
      this.pendingAfterMsgs[peerId] = sentRequestOptions;

      return apiPromise.then((updates: Updates) => {
        //this.log('sendText sent', message.mid);
        //if(is<Updates.updateShortSentMessage>(updates, updates._ === 'updateShortSentMessage')) {
        if(updates._ === 'updateShortSentMessage') {
          //assumeType<Updates.updateShortSentMessage>(updates);

          // * fix copying object with promise
          const promise = message.promise;
          delete message.promise;
          const newMessage = copy(message);
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
        // Testing bad situations
        // var upd = angular.copy(updates)
        // updates.updates.splice(0, 1)

        apiUpdatesManager.processUpdateMessage(updates);

        // $timeout(function () {
        // ApiUpdatesManager.processUpdateMessage(upd)
        // }, 5000)
        message.promise.resolve();
      }, (error: any) => {
        toggleError(true);
        message.promise.reject(error);
      }).finally(() => {
        if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerId];
        }
      });
    };

    this.beforeMessageSending(message, {
      isScheduled: !!options.scheduleDate || undefined, 
      threadId: options.threadId,
      clearDraft: options.clearDraft
    });

    return message.promise;
  }

  public sendFile(peerId: PeerId, file: File | Blob | MyDocument, options: Partial<{
    isRoundMessage: true,
    isVoiceMessage: true,
    isGroupedItem: true,
    isMedia: true,

    replyToMsgId: number,
    sendAsPeerId: PeerId,
    threadId: number,
    groupId: string,
    caption: string,
    entities: MessageEntity[],
    width: number,
    height: number,
    objectURL: string,
    thumb: {
      blob: Blob,
      url: string,
      size: MediaSize
    },
    duration: number,
    background: true,
    silent: true,
    clearDraft: true,
    scheduleDate: number,
    noSound: boolean,

    waveform: Uint8Array,
  }> = {}) {
    peerId = appPeersManager.getPeerMigratedTo(peerId) || peerId;

    //this.checkSendOptions(options);

    const message = this.generateOutgoingMessage(peerId, options);
    const replyToMsgId = options.replyToMsgId ? appMessagesIdsManager.getServerMessageId(options.replyToMsgId) : undefined;

    let attachType: 'document' | 'audio' | 'video' | 'voice' | 'photo', apiFileName: string;

    const fileType = 'mime_type' in file ? file.mime_type : file.type;
    const fileName = file instanceof File ? file.name : '';
    const isDocument = !(file instanceof File) && !(file instanceof Blob);
    let caption = options.caption || '';

    this.log('sendFile', file, fileType);

    const entities = options.entities || [];
    if(caption) {
      caption = RichTextProcessor.parseMarkdown(caption, entities);
    }

    const attributes: DocumentAttribute[] = [];

    const isPhoto = IMAGE_MIME_TYPES_SUPPORTED.has(fileType);

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

      let attribute: DocumentAttribute.documentAttributeAudio = {
        _: 'documentAttributeAudio',
        pFlags: {
          voice: options.isVoiceMessage
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
        type: 'full',
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

      const cacheContext = appDownloadManager.getCacheContext(photo, photoSize.type);
      cacheContext.downloaded = file.size;
      cacheContext.url = options.objectURL || '';
      
      photo = appPhotosManager.savePhoto(photo);
    } else if(VIDEO_MIME_TYPES_SUPPORTED.has(fileType)) {
      attachType = 'video';
      apiFileName = 'video.mp4';
      actionName = 'sendMessageUploadVideoAction';

      const videoAttribute: DocumentAttribute.documentAttributeVideo = {
        _: 'documentAttributeVideo',
        pFlags: {
          round_message: options.isRoundMessage,
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

      const cacheContext = appDownloadManager.getCacheContext(document);
      cacheContext.downloaded = file.size;
      cacheContext.url = options.objectURL || '';

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
          type: 'full',
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

          const thumbCacheContext = appDownloadManager.getCacheContext(document, thumb.type);
          thumbCacheContext.downloaded = thumb.size;
          thumbCacheContext.url = options.thumb.url;
        }
      }

      if(thumb) {
        thumbs.push(thumb);
      }

      /* if(thumbs.length) {
        const thumb = thumbs[0] as PhotoSize.photoSize;
        const docThumb = appPhotosManager.getDocumentCachedThumb(document.id);
        docThumb.downloaded = thumb.size;
        docThumb.url = thumb.url;
      } */
      
      document = appDocsManager.saveDoc(document);
    }

    this.log('sendFile', attachType, apiFileName, file.type, options);

    const preloader = isDocument ? undefined : new ProgressivePreloader({
      attachMethod: 'prepend',
      tryAgainOnFail: false,
      isUpload: true
    });

    const sentDeferred = deferredPromise<InputMedia>();

    if(preloader) {
      preloader.attachPromise(sentDeferred);
      sentDeferred.cancel = () => {
        const error = new Error('Download canceled');
        error.name = 'AbortError';
        sentDeferred.reject(error);
      };

      sentDeferred.catch(err => {
        if(err.name === 'AbortError' && !uploaded) {
          this.log('cancelling upload', media);

          this.cancelPendingMessage(message.random_id);
          this.setTyping(peerId, {_: 'sendMessageCancelAction'});

          if(uploadPromise?.cancel) {
            uploadPromise.cancel();
          }
        }
      });
    }

    const media = isDocument ? undefined : {
      _: photo ? 'messageMediaPhoto' : 'messageMediaDocument',
      pFlags: {},
      preloader,
      photo,
      document,
      promise: sentDeferred
    };

    message.entities = entities;
    message.message = caption;
    message.media = isDocument ? {
      _: 'messageMediaDocument',
      pFlags: {},
      document: file 
    } as MessageMedia.messageMediaDocument : media as any;

    const toggleError = (on: boolean) => {
      if(on) {
        message.error = true;
      } else {
        delete message.error;
      }

      rootScope.dispatchEvent('messages_pending');
    };

    let uploaded = false,
      uploadPromise: ReturnType<ApiFileManager['uploadFile']> = null;

    message.send = () => {
      if(isDocument) {
        const {id, access_hash, file_reference} = file as MyDocument;

        const inputMedia: InputMedia = {
          _: 'inputMediaDocument',
          id: {
            _: 'inputDocument',
            id,
            access_hash,
            file_reference
          }
        };
        
        sentDeferred.resolve(inputMedia);
      } else if(file instanceof File || file instanceof Blob) {
        const load = () => {
          if(!uploaded || message.error) {
            uploaded = false;
            uploadPromise = appDownloadManager.upload(file);
            sentDeferred.notifyAll({done: 0, total: file.size});
          }

          let thumbUploadPromise: typeof uploadPromise;
          if(attachType === 'video' && options.objectURL) {
            thumbUploadPromise = new Promise((resolve, reject) => {
              const thumbPromise = options.thumb && options.thumb.blob ? Promise.resolve(options.thumb) : createPosterForVideo(options.objectURL);
              thumbPromise.then(thumb => {
                if(!thumb) {
                  resolve(null);
                } else {
                  appDownloadManager.upload(thumb.blob).then(resolve, reject);
                }
              }, reject);
            });
          }
  
          uploadPromise && uploadPromise.then(async(inputFile) => {
            /* if(DEBUG) {
              this.log('appMessagesManager: sendFile uploaded:', inputFile);
            } */

            // @ts-ignore
            delete message.media.preloader;

            inputFile.name = apiFileName;
            uploaded = true;
            let inputMedia: InputMedia;
            switch(attachType) {
              case 'photo':
                inputMedia = {
                  _: 'inputMediaUploadedPhoto', 
                  file: inputFile,
                };
                break;

              default:
                inputMedia = {
                  _: 'inputMediaUploadedDocument', 
                  file: inputFile, 
                  mime_type: fileType, 
                  pFlags: {
                    force_file: actionName === 'sendMessageUploadDocumentAction' ? true : undefined,
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
          }, (/* error */) => {
            toggleError(true);
          });
  
          uploadPromise.addNotifyListener((progress: {done: number, total: number}) => {
            /* if(DEBUG) {
              this.log('upload progress', progress);
            } */

            const percents = Math.max(1, Math.floor(100 * progress.done / progress.total));
            if(actionName) {
              this.setTyping(peerId, {_: actionName, progress: percents | 0});
            }
            sentDeferred.notifyAll(progress);
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
      clearDraft: options.clearDraft
    });

    if(!options.isGroupedItem) {
      sentDeferred.then(inputMedia => {
        this.setTyping(peerId, {_: 'sendMessageCancelAction'});

        return apiManager.invokeApi('messages.sendMedia', {
          background: options.background,
          peer: appPeersManager.getInputPeerById(peerId),
          media: inputMedia,
          message: caption,
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId,
          schedule_date: options.scheduleDate,
          silent: options.silent,
          entities,
          clear_draft: options.clearDraft,
          send_as: options.sendAsPeerId ? appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
        }).then((updates) => {
          apiUpdatesManager.processUpdateMessage(updates);
        }, (error) => {
          if(attachType === 'photo' &&
            error.code === 400 &&
            (error.type === 'PHOTO_INVALID_DIMENSIONS' ||
            error.type === 'PHOTO_SAVE_FILE_INVALID')) {
            error.handled = true;
            attachType = 'document';
            message.send();
            return;
          }

          toggleError(true);
          throw error;
        });
      });

      sentDeferred.then(message.promise.resolve, message.promise.reject);
    }

    return {message, promise: sentDeferred};
  }

  public async sendAlbum(peerId: PeerId, files: File[], options: Partial<{
    isMedia: true,
    entities: MessageEntity[],
    replyToMsgId: number,
    sendAsPeerId: PeerId,
    threadId: number,
    caption: string,
    sendFileDetails: Partial<{
      duration: number,
      width: number,
      height: number,
      objectURL: string,
      thumbBlob: Blob,
      thumbURL: string
    }>[],
    silent: true,
    clearDraft: true,
    scheduleDate: number
  }> = {}) {
    //this.checkSendOptions(options);

    if(options.threadId && !options.replyToMsgId) {
      options.replyToMsgId = options.threadId;
    }

    if(files.length === 1) {
      return this.sendFile(peerId, files[0], {...options, ...options.sendFileDetails[0]});
    }

    peerId = appPeersManager.getPeerMigratedTo(peerId) || peerId;
    const replyToMsgId = options.replyToMsgId ? appMessagesIdsManager.getServerMessageId(options.replyToMsgId) : undefined;

    let caption = options.caption || '';
    let entities = options.entities || [];
    if(caption) {
      caption = RichTextProcessor.parseMarkdown(caption, entities);
    }

    this.log('sendAlbum', files, options);

    const groupId = '' + ++this.groupedTempId;

    const messages = files.map((file, idx) => {
      const details = options.sendFileDetails[idx];
      const o: Parameters<AppMessagesManager['sendFile']>[2] = {
        isGroupedItem: true,
        isMedia: options.isMedia,
        scheduleDate: options.scheduleDate,
        silent: options.silent,
        replyToMsgId,
        threadId: options.threadId,
        sendAsPeerId: options.sendAsPeerId,
        groupId,
        ...details
      };

      if(idx === 0) {
        o.caption = caption;
        o.entities = entities;
        //o.replyToMsgId = replyToMsgId;
      }

      return this.sendFile(peerId, file, o).message;
    });

    if(options.clearDraft) {
      setTimeout(() => {
        appDraftsManager.clearDraft(peerId, options.threadId);
      }, 0);
    }
    
    // * test pending
    //return;

    const toggleError = (message: any, on: boolean) => {
      if(on) {
        message.error = true;
      } else {
        delete message.error;
      }

      rootScope.dispatchEvent('messages_pending');
    };

    const inputPeer = appPeersManager.getInputPeerById(peerId);
    const invoke = (multiMedia: InputSingleMedia[]) => {
      this.setTyping(peerId, {_: 'sendMessageCancelAction'});

      const deferred = deferredPromise<void>();
      this.sendSmthLazyLoadQueue.push({
        load: () => {
          return apiManager.invokeApi('messages.sendMultiMedia', {
            peer: inputPeer,
            multi_media: multiMedia,
            reply_to_msg_id: replyToMsgId,
            schedule_date: options.scheduleDate,
            silent: options.silent,
            clear_draft: options.clearDraft,
            send_as: options.sendAsPeerId ? appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
          }).then((updates) => {
            apiUpdatesManager.processUpdateMessage(updates);
            deferred.resolve();
          }, (error) => {
            messages.forEach(message => toggleError(message, true));
            deferred.reject(error);
          });
        }
      });

      return deferred;
    };

    const promises: Promise<InputSingleMedia>[] = messages.map((message) => {
      return (message.send() as Promise<InputMedia>).then((inputMedia) => {
        return apiManager.invokeApi('messages.uploadMedia', {
          peer: inputPeer,
          media: inputMedia
        });
      })
      .then(messageMedia => {
        let inputMedia: InputMedia;
        if(messageMedia._ === 'messageMediaPhoto') {
          const photo = appPhotosManager.savePhoto(messageMedia.photo);
          inputMedia = appPhotosManager.getMediaInput(photo);
        } else if(messageMedia._ === 'messageMediaDocument') {
          const doc = appDocsManager.saveDoc(messageMedia.document);
          inputMedia = appDocsManager.getMediaInput(doc);
        }

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
      }).catch((err: any) => {
        if(err.name === 'AbortError') {
          return null;
        }

        this.log.error('sendAlbum upload item error:', err, message);
        toggleError(message, true);
        throw err;
      });
    });

    return Promise.all(promises).then(inputs => {
      return invoke(inputs.filter(Boolean));
    });
  }

  public sendContact(peerId: PeerId, contactPeerId: PeerId) {
    return this.sendOther(peerId, appUsersManager.getContactMediaInput(contactPeerId));
  }

  public sendOther(peerId: PeerId, inputMedia: InputMedia, options: Partial<{
    replyToMsgId: number,
    threadId: number,
    viaBotId: BotId,
    replyMarkup: ReplyMarkup,
    clearDraft: true,
    queryId: string
    resultId: string,
    scheduleDate: number,
    silent: true,
    geoPoint: GeoPoint,
    sendAsPeerId: PeerId,
  }> = {}) {
    peerId = appPeersManager.getPeerMigratedTo(peerId) || peerId;

    //this.checkSendOptions(options);
    const message = this.generateOutgoingMessage(peerId, options);
    const replyToMsgId = options.replyToMsgId ? appMessagesIdsManager.getServerMessageId(options.replyToMsgId) : undefined;

    let media: MessageMedia;
    switch(inputMedia._) {
      case 'inputMediaPoll': {
        const pollId = '' + message.id;
        inputMedia.poll.id = pollId;
        appPollsManager.savePoll(inputMedia.poll, {
          _: 'pollResults',
          flags: 4,
          total_voters: 0,
          pFlags: {},
          recent_voters: []
        });

        const {poll, results} = appPollsManager.getPoll(pollId);
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
          photo: appPhotosManager.getPhoto((inputMedia.id as InputPhoto.inputPhoto).id)
        };
        break;
      }

      case 'inputMediaDocument': {
        const doc = appDocsManager.getDoc((inputMedia.id as InputDocument.inputDocument).id);
        /* if(doc.sticker && doc.stickerSetInput) {
          appStickersManager.pushPopularSticker(doc.id);
        } */
        media = {
          _: 'messageMediaDocument',
          document: doc
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
      
      // @ts-ignore
      case 'messageMediaPending': {
        media = inputMedia;
        break;
      }
    }

    message.media = media;

    let toggleError = (on: boolean) => {
      /* const historyMessage = this.messagesForHistory[messageId];
      if (on) {
        message.error = true
        if (historyMessage) {
          historyMessage.error = true
        }
      } else {
        delete message.error
        if (historyMessage) {
          delete historyMessage.error
        }
      } */
      rootScope.dispatchEvent('messages_pending');
    };

    message.send = () => {
      const sentRequestOptions: PendingAfterMsg = {};
      if(this.pendingAfterMsgs[peerId]) {
        sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
      }

      const sendAs = options.sendAsPeerId ? appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined;
      let apiPromise: Promise<any>;
      if(options.viaBotId) {
        apiPromise = apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: appPeersManager.getInputPeerById(peerId),
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
        apiPromise = apiManager.invokeApiAfter('messages.sendMedia', {
          peer: appPeersManager.getInputPeerById(peerId),
          media: inputMedia,
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId || undefined,
          message: '',
          clear_draft: options.clearDraft,
          schedule_date: options.scheduleDate,
          silent: options.silent,
          send_as: sendAs
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

        apiUpdatesManager.processUpdateMessage(updates);
      }, (error) => {
        toggleError(true);
      }).finally(() => {
        if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerId];
        }
      });
    };

    this.beforeMessageSending(message, {
      isScheduled: !!options.scheduleDate || undefined, 
      threadId: options.threadId,
      clearDraft: options.clearDraft
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

  private beforeMessageSending(message: Message.message, options: Partial<{
    isGroupedItem: true, 
    isScheduled: true, 
    threadId: number, 
    clearDraft: true
  }> = {}) {
    const messageId = message.id;
    const peerId = this.getMessagePeer(message);
    const storage = options.isScheduled ? this.getScheduledMessagesStorage(peerId) : this.getMessagesStorage(peerId);

    if(options.isScheduled) {
      //if(!options.isGroupedItem) {
      this.saveMessages([message], {storage, isScheduled: true, isOutgoing: true});
      setTimeout(() => {
        rootScope.dispatchEvent('scheduled_new', {peerId, mid: messageId});
      }, 0);
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

      //if(!options.isGroupedItem) {
      this.saveMessages([message], {storage, isOutgoing: true});
      this.setDialogTopMessage(message);
      setTimeout(() => {
        rootScope.dispatchEvent('history_append', {storage, peerId, mid: messageId});
      }, 0);
    }

    this.pendingByRandomId[message.random_id] = {
      peerId, 
      tempId: messageId, 
      threadId: options.threadId, 
      storage
    };

    if(!options.isGroupedItem && message.send) {
      setTimeout(() => {
        if(options.clearDraft) {
          appDraftsManager.clearDraft(peerId, options.threadId);
        }

        message.send();
      }, 0);
    }
  }

  private generateOutgoingMessage(peerId: PeerId, options: Partial<{
    scheduleDate: number,
    replyToMsgId: number,
    sendAsPeerId: PeerId, 
    threadId: number,
    viaBotId: BotId,
    groupId: string,
    replyMarkup: ReplyMarkup,
  }>) {
    if(options.threadId && !options.replyToMsgId) {
      options.replyToMsgId = options.threadId;
    }

    let postAuthor: string;
    const isBroadcast = appPeersManager.isBroadcast(peerId);
    if(isBroadcast) {
      const chat = appPeersManager.getPeer(peerId) as Chat.channel;
      if(chat.pFlags.signatures) {
        const user = appUsersManager.getSelf();
        const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        postAuthor = fullName;
      }
    }

    const message: Message.message = {
      _: 'message',
      id: this.generateTempMessageId(peerId),
      from_id: options.sendAsPeerId ? appPeersManager.getOutputPeer(options.sendAsPeerId) : this.generateFromId(peerId),
      peer_id: appPeersManager.getOutputPeer(peerId),
      post_author: postAuthor, 
      pFlags: this.generateFlags(peerId),
      date: options.scheduleDate || (tsNow(true) + serverTimeManager.serverTimeOffset),
      message: '',
      grouped_id: options.groupId,
      random_id: randomLong(),
      reply_to: this.generateReplyHeader(options.replyToMsgId, options.threadId),
      via_bot_id: options.viaBotId,
      reply_markup: options.replyMarkup,
      replies: this.generateReplies(peerId),
      views: isBroadcast && 1,
      pending: true,
      promise: options.groupId === undefined ? deferredPromise() : undefined
    };

    return message;
  }

  private generateReplyHeader(replyToMsgId: number, replyToTopId?: number) {
    const header = {
      _: 'messageReplyHeader',
      reply_to_msg_id: replyToMsgId || replyToTopId,
    } as MessageReplyHeader;

    if(replyToTopId && header.reply_to_msg_id !== replyToTopId) {
      header.reply_to_top_id = replyToTopId;
    }

    return header;
  }

  private generateReplies(peerId: PeerId) {
    let replies: MessageReplies.messageReplies;
    if(appPeersManager.isBroadcast(peerId)) {
      const channelFull = appProfileManager.getCachedFullChat(peerId.toChatId()) as ChatFull.channelFull;
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
    if(peerId.isAnyChat() && (peerId.isBroadcast() || this.isAnonymousSending(peerId))) {
      return undefined;
    } else {
      return appPeersManager.getOutputPeer(appUsersManager.getSelf().id.toPeerId());
    }
  }

  private generateFlags(peerId: PeerId) {
    const pFlags: Message.message['pFlags'] = {};
    const fromId = appUsersManager.getSelf().id;
    if(peerId !== fromId) {
      pFlags.out = true;

      if(!appPeersManager.isChannel(peerId) && !appUsersManager.isBot(peerId)) {
        pFlags.unread = true;
      }
    }

    if(appPeersManager.isBroadcast(peerId)) {
      pFlags.post = true;
    }

    return pFlags;
  }

  private generateForwardHeader(peerId: PeerId, originalMessage: Message.message) {
    const myId = appUsersManager.getSelf().id.toPeerId();
    const fromId = originalMessage.fromId;
    if(fromId === myId && originalMessage.peerId === myId && !originalMessage.fwd_from) {
      return;
    }

    const fwdHeader: MessageFwdHeader.messageFwdHeader = {
      _: 'messageFwdHeader',
      flags: 0,
      date: originalMessage.date
    };

    let isUserHidden = false;
    if(originalMessage.fwd_from) {
      fwdHeader.from_id = originalMessage.fwd_from.from_id;
      fwdHeader.from_name = originalMessage.fwd_from.from_name;
      fwdHeader.post_author = originalMessage.fwd_from.post_author;
    } else {
      fwdHeader.post_author = originalMessage.post_author;
      
      if(fromId.isUser()) {
        const userFull = appProfileManager.getCachedFullUser(fromId.toUserId());
        if(userFull?.private_forward_name) {
          fwdHeader.from_name = userFull.private_forward_name;
          isUserHidden = true;
        }
      }

      if(!isUserHidden) {
        fwdHeader.from_id = appPeersManager.getOutputPeer(fromId);
      }
    }

    if(appPeersManager.isBroadcast(originalMessage.peerId)) {
      if(originalMessage.post_author) {
        fwdHeader.post_author = originalMessage.post_author;
      }

      fwdHeader.channel_post = originalMessage.id;
    }
    
    if(peerId === myId && !isUserHidden) {
      fwdHeader.saved_from_msg_id = originalMessage.id;
      fwdHeader.saved_from_peer = appPeersManager.getOutputPeer(originalMessage.peerId);
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
      peer_id: appPeersManager.getOutputPeer(peerId),
      mid: maxId,
      peerId,
      date: (photo as Photo.photo).date,
      fromId: peerId
    };

    this.getMessagesStorage(peerId).set(maxId, message);
    return message;
  }

  public isAnonymousSending(peerId: PeerId): boolean {
    return peerId.isAnyChat() && appPeersManager.getPeer(peerId).admin_rights?.pFlags?.anonymous;
  }

  public setDialogTopMessage(message: MyMessage, dialog: MTDialog.dialog = this.getDialogOnly(message.peerId)) {
    if(dialog) {
      dialog.top_message = message.mid;
      
      const historyStorage = this.getHistoryStorage(message.peerId);
      historyStorage.maxId = message.mid;

      this.dialogsStorage.generateIndexForDialog(dialog, false, message);

      this.scheduleHandleNewDialogs(message.peerId, dialog);
    }
  }

  public cancelPendingMessage(randomId: string) {
    const pendingData = this.pendingByRandomId[randomId];

    /* if(DEBUG) {
      this.log('cancelPendingMessage', randomId, pendingData);
    } */

    if(pendingData) {
      const {peerId, tempId, storage} = pendingData;
      const historyStorage = this.getHistoryStorage(peerId);

      apiUpdatesManager.processLocalUpdate({
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
          const peerId = appPeersManager.getPeerId(dialog.peer);
          const mid = appMessagesIdsManager.generateMessageId(dialog.top_message);
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
    outDialogs.forEach(dialog => {
      obj[dialog.peerId] = dialog;
    });
    rootScope.dispatchEvent('dialogs_multiupdate', obj);

    return outDialogs;
  } */

  public async fillConversations(): Promise<void> {
    const middleware = this.middleware.get();
    while(!this.dialogsStorage.isDialogsLoaded(GLOBAL_FOLDER_ID)) {
      const result = await this.getTopMessages(100, GLOBAL_FOLDER_ID);
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

  public getConversations(query = '', offsetIndex?: number, limit?: number, folderId = 0, skipMigrated?: boolean) {
    return this.dialogsStorage.getDialogs(query, offsetIndex, limit, folderId, skipMigrated);
  }

  public getReadMaxIdIfUnread(peerId: PeerId, threadId?: number) {
    const historyStorage = this.getHistoryStorage(peerId, threadId);
    if(threadId) {
      const chatHistoryStorage = this.getHistoryStorage(peerId);
      const readMaxId = Math.max(chatHistoryStorage.readMaxId ?? 0, historyStorage.readMaxId);
      const message = this.getMessageByPeer(peerId, historyStorage.maxId); // usually message is missing, so pFlags.out won't be there anyway
      return !message.pFlags.out && readMaxId < historyStorage.maxId ? readMaxId : 0;
    } else {
      const message = this.getMessageByPeer(peerId, historyStorage.maxId);
      const readMaxId = peerId.isUser() ? Math.max(historyStorage.readMaxId, historyStorage.readOutboxMaxId) : historyStorage.readMaxId;
      return !message.pFlags.out && readMaxId < historyStorage.maxId ? readMaxId : 0;
    }
  }

  // public lolSet = new Set();
  public getTopMessages(limit: number, folderId: number, offsetDate?: number) {
    //const dialogs = this.dialogsStorage.getFolder(folderId);
    let offsetId = 0;
    let offsetPeerId: PeerId;
    let offsetIndex = 0;

    if(offsetDate === undefined) {
      offsetDate = this.dialogsStorage.getOffsetDate(folderId);
    }

    if(offsetDate) {
      offsetIndex = offsetDate * 0x10000;
      offsetDate += serverTimeManager.serverTimeOffset;
    }

    const useLimit = 100;
    const middleware = this.middleware.get();

    // ! ВНИМАНИЕ: ОЧЕНЬ СЛОЖНАЯ ЛОГИКА:
    // ! если делать запрос сначала по папке 0, потом по папке 1, по индексу 0 в массиве будет один и тот же диалог, с dialog.pFlags.pinned, ЛОЛ???
    // ! т.е., с запросом folder_id: 1, и exclude_pinned: 0, в результате будут ещё и закреплённые с папки 0
    const params: MessagesGetDialogs = {
      folder_id: folderId,
      offset_date: offsetDate,
      offset_id: offsetId,
      offset_peer: appPeersManager.getInputPeerById(offsetPeerId),
      limit: useLimit,
      hash: '0'
    };

    return apiManager.invokeApiSingle('messages.getDialogs', params, {
      //timeout: APITIMEOUT,
      noErrorBox: true
    }).then((dialogsResult) => {
      if(!middleware() || dialogsResult._ === 'messages.dialogsNotModified') return null;

      if(DEBUG) {
        this.log('messages.getDialogs result:', dialogsResult.dialogs, {...dialogsResult.dialogs[0]});
      }

      /* if(!offsetDate) {
        telegramMeWebService.setAuthorized(true);
      } */

      // can reset pinned order here
      if(!offsetId && !offsetDate && !offsetPeerId && folderId !== GLOBAL_FOLDER_ID) {
        this.dialogsStorage.resetPinnedOrder(folderId);
      }

      if(!offsetDate) {
        telegramMeWebManager.setAuthorized(true);
      }

      appUsersManager.saveApiUsers(dialogsResult.users);
      appChatsManager.saveApiChats(dialogsResult.chats);
      this.saveMessages(dialogsResult.messages);

      /* if(folderId === 0 && !offsetDate) {
        const found = dialogsResult.dialogs.find(dialog => appPeersManager.getPeerId(dialog.peer) === -1325963535);
        if(!found) {
          debugger;
        }
      } */

      let maxSeenIdIncremented = offsetDate ? true : false;
      let hasPrepend = false;
      const noIdsDialogs: {[peerId: PeerId]: Dialog} = {};
      const setFolderId = folderId === GLOBAL_FOLDER_ID ? 0 : folderId;
      const saveGlobalOffset = folderId === GLOBAL_FOLDER_ID;
      forEachReverse((dialogsResult.dialogs as Dialog[]), dialog => {
        //const d = Object.assign({}, dialog);
        // ! нужно передавать folderId, так как по папке !== 0 нет свойства folder_id
        if(dialog.folder_id === undefined) {
          dialog.folder_id = setFolderId;
        }

        this.dialogsStorage.saveDialog(dialog, undefined, true, saveGlobalOffset);

        if(!maxSeenIdIncremented &&
          !appPeersManager.isChannel(dialog.peerId || appPeersManager.getPeerId(dialog.peer))) {
          this.incrementMaxSeenId(dialog.top_message);
          maxSeenIdIncremented = true;
        }

        if(dialog.peerId === undefined) {
          return;
        }

        // if(!folderId && !dialog.folder_id) {
        //   this.lolSet.add(dialog.peerId);
        // }

        /* if(dialog.peerId === -1213511294) {
          this.log.error('lun bot', folderId, d);
        } */

        if(offsetIndex && dialog.index > offsetIndex) {
          this.scheduleHandleNewDialogs(dialog.peerId, dialog);
          hasPrepend = true;
        }

        // ! это может случиться, если запрос идёт не по папке 0, а по 1. почему-то read'ов нет
        // ! в итоге, чтобы получить 1 диалог, делается первый запрос по папке 0, потом запрос для архивных по папке 1, и потом ещё перезагрузка архивного диалога
        if(!appMessagesIdsManager.getServerMessageId(dialog.read_inbox_max_id) && !appMessagesIdsManager.getServerMessageId(dialog.read_outbox_max_id)) {
          noIdsDialogs[dialog.peerId] = dialog;

          this.log.error('noIdsDialogs', dialog, params);

          /* if(dialog.peerId === -1213511294) {
            this.log.error('lun bot', folderId);
          } */
        }
      });

      const keys = Object.keys(noIdsDialogs);
      if(keys.length) {
        //setTimeout(() => { // test bad situation
          const peerIds = keys.map(key => key.toPeerId());
          const promises = peerIds.map(peerId => this.reloadConversation(peerId));
          Promise.all(promises).then(() => {
            rootScope.dispatchEvent('dialogs_multiupdate', noIdsDialogs);
  
            for(let i = 0; i < peerIds.length; ++i) {
              rootScope.dispatchEvent('dialog_unread', {peerId: peerIds[i]});
            }
          });
        //}, 10e3);
      }

      const count = (dialogsResult as MessagesDialogs.messagesDialogsSlice).count;

      // exclude empty draft dialogs
      const folderDialogs = this.dialogsStorage.getFolderDialogs(folderId, false);
      let dialogsLength = 0;
      for(let i = 0, length = folderDialogs.length; i < length; ++i) {
        if(appMessagesIdsManager.getServerMessageId(folderDialogs[i].top_message)) {
          ++dialogsLength;
        }
      }

      const isEnd = /* limit > dialogsResult.dialogs.length || */ 
        !count || 
        dialogsLength >= count ||
        !dialogsResult.dialogs.length;
      if(isEnd) {
        this.dialogsStorage.setDialogsLoaded(folderId, true);
      }

      if(hasPrepend) {
        this.scheduleHandleNewDialogs();
      } else {
        rootScope.dispatchEvent('dialogs_multiupdate', {});
      }

      const dialogs = (dialogsResult as MessagesDialogs.messagesDialogsSlice).dialogs;
      const slicedDialogs = limit === useLimit ? dialogs : dialogs.slice(0, limit);
      return {
        isEnd: isEnd && slicedDialogs[slicedDialogs.length - 1] === dialogs[dialogs.length - 1], 
        count, 
        dialogs: slicedDialogs
      };
    });
  }

  public forwardMessages(peerId: PeerId, fromPeerId: PeerId, mids: number[], options: Partial<{
    withMyScore: true,
    silent: true,
    scheduleDate: number,
    dropAuthor: boolean,
    dropCaptions: boolean,
    sendAsPeerId: PeerId,
  }> = {}) {
    peerId = appPeersManager.getPeerMigratedTo(peerId) || peerId;
    mids = mids.slice().sort((a, b) => a - b);

    for(let i = 0, length = mids.length; i < length; ++i) {
      const mid = mids[i];
      const originalMessage: Message.message = this.getMessageByPeer(fromPeerId, mid);
      if(originalMessage.pFlags.is_outgoing) { // this can happen when forwarding a changelog
        this.sendText(peerId, originalMessage.message, {
          entities: originalMessage.entities,
          scheduleDate: options.scheduleDate,
          silent: options.silent
        });

        mids.splice(i--, 1);
      }
    }

    if(!mids.length) {
      return Promise.resolve();
    }

    if(options.dropCaptions) {
      options.dropAuthor = true;
    }

    const groups: {
      [groupId: string]: {
        tempId: string,
        messages: Message.message[]
      }
    } = {};

    const newMessages = mids.map(mid => {
      const originalMessage: Message.message = this.getMessageByPeer(fromPeerId, mid);
      const message: Message.message = this.generateOutgoingMessage(peerId, options);

      const keys: Array<keyof Message.message> = [
        'entities', 
        'media', 
        // 'reply_markup'
      ];

      if(!options.dropAuthor) {
        message.fwd_from = this.generateForwardHeader(peerId, originalMessage);
        keys.push('views', 'forwards');

        if(message.fwd_from?.from_name && peerId === rootScope.myId) {
          delete message.from_id;
        }
      }

      if(!options.dropCaptions || !originalMessage.media) {
        keys.push('message');
      }

      keys.forEach(key => {
        // @ts-ignore
        message[key] = originalMessage[key];
      });

      const document = (message.media as MessageMedia.messageMediaDocument)?.document as MyDocument;
      if(document) {
        const types: MyDocument['type'][] = ['round', 'voice'];
        if(types.includes(document.type)) {
          (message as MyMessage).pFlags.media_unread = true;
        }
      }

      if(originalMessage.grouped_id) {
        const group = groups[originalMessage.grouped_id] ?? (groups[originalMessage.grouped_id] = {tempId: '' + ++this.groupedTempId, messages: []});
        group.messages.push(message);
      }

      return message;
    });

    for(const groupId in groups) {
      const group = groups[groupId];
      if(group.messages.length > 1) {
        group.messages.forEach(message => {
          message.grouped_id = group.tempId;
        });
      }
    }

    newMessages.forEach(message => {
      this.beforeMessageSending(message, {
        isScheduled: !!options.scheduleDate || undefined
      });
    });

    const sentRequestOptions: PendingAfterMsg = {};
    if(this.pendingAfterMsgs[peerId]) {
      sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
    }

    const promise = /* true ? Promise.resolve() :  */apiManager.invokeApiAfter('messages.forwardMessages', {
      from_peer: appPeersManager.getInputPeerById(fromPeerId),
      id: mids.map(mid => appMessagesIdsManager.getServerMessageId(mid)),
      random_id: newMessages.map(message => message.random_id),
      to_peer: appPeersManager.getInputPeerById(peerId),
      with_my_score: options.withMyScore,
      silent: options.silent,
      schedule_date: options.scheduleDate,
      drop_author: options.dropAuthor,
      drop_media_captions: options.dropCaptions,
      send_as: options.sendAsPeerId ? appPeersManager.getInputPeerById(options.sendAsPeerId) : undefined
    }, sentRequestOptions).then((updates) => {
      this.log('forwardMessages updates:', updates);
      apiUpdatesManager.processUpdateMessage(updates);
    }).finally(() => {
      if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
        delete this.pendingAfterMsgs[peerId];
      }
    });

    this.pendingAfterMsgs[peerId] = sentRequestOptions;
    return promise;
  }

  public generateEmptyMessage(mid: number): Message.messageEmpty {
    return {
      _: 'messageEmpty',
      id: appMessagesIdsManager.getServerMessageId(mid),
      mid,
      deleted: true,
      pFlags: {}
    };
  }

  public getMessageFromStorage(storage: MessagesStorage, mid: number) {
    return storage && storage.get(mid) || this.generateEmptyMessage(mid);
  }

  private createMessageStorage() {
    const storage: MessagesStorage = new Map();
    
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

  public getMessagesStorage(peerId: PeerId) {
    return this.messagesStorageByPeerId[peerId] ?? (this.messagesStorageByPeerId[peerId] = this.createMessageStorage());
  }

  public getMessageById(messageId: number) {
    for(const peerId in this.messagesStorageByPeerId) {
      if(appPeersManager.isChannel(peerId.toPeerId())) {
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

    return this.getMessageFromStorage(this.getMessagesStorage(peerId), messageId);
  }

  public getMessagePeer(message: any): PeerId {
    const toId = message.peer_id && appPeersManager.getPeerId(message.peer_id) || NULL_PEER_ID;

    return toId;
  }

  public getDialogByPeerId(peerId: PeerId): [Dialog, number] | [] {
    return this.dialogsStorage.getDialog(peerId);
  }

  public getDialogOnly(peerId: PeerId) {
    return this.dialogsStorage.getDialogOnly(peerId);
  }

  public reloadConversation(inputPeer?: PeerId | InputPeer): CancellablePromise<Dialog>;
  public reloadConversation(inputPeer: PeerId | InputPeer) {
    let promise: CancellablePromise<Dialog>;
    if(inputPeer !== undefined) {
      const peerId = appPeersManager.getPeerId(inputPeer);
      let obj = this.reloadConversationsPeers.get(peerId);
      if(obj) {
        promise = obj.promise;
      }

      if(promise) {
        return promise;
      }

      promise = deferredPromise();
      this.reloadConversationsPeers.set(peerId, obj = {
        inputDialogPeer: appPeersManager.getInputDialogPeerById(inputPeer),
        promise
      });
    }

    if(this.reloadConversationsPromise) {
      return promise || this.reloadConversationsPromise;
    }

    this.reloadConversationsPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        const inputDialogPeers: InputDialogPeer[] = [];
        const promises: {[peerId: string]: typeof promise} = {};
        for(const [peerId, {inputDialogPeer, promise}] of this.reloadConversationsPeers) {
          inputDialogPeers.push(inputDialogPeer);
          promises[peerId] = promise;
        }

        this.reloadConversationsPeers.clear();

        const fullfillLeft = () => {
          for(const peerId in promises) {
            promises[peerId].resolve(undefined);
          }
        };

        apiManager.invokeApi('messages.getPeerDialogs', {peers: inputDialogPeers}).then((result) => {
          this.dialogsStorage.applyDialogs(result);

          result.dialogs.forEach((dialog) => {
            const peerId = dialog.peerId;
            if(peerId) {
              promises[peerId].resolve(dialog as Dialog);
              delete promises[peerId];
            }
          });

          fullfillLeft();
          resolve();
        }, (err) => {
          fullfillLeft();
          reject(err);
        }).finally(() => {
          this.reloadConversationsPromise = null;

          if(this.reloadConversationsPeers.size) {
            this.reloadConversation();
          }
        });
      }, 0);
    });

    return promise || this.reloadConversationsPromise;
  }

  private doFlushHistory(peer: InputPeer, just_clear?: boolean, revoke?: boolean): Promise<true> {
    return apiManager.invokeApiSingle('messages.deleteHistory', {
      just_clear,
      revoke,
      peer,
      max_id: 0
    }).then((affectedHistory) => {
      apiUpdatesManager.processUpdateMessage({
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

      return this.doFlushHistory(peer, just_clear, revoke);
    });
  }

  public async flushHistory(peerId: PeerId, justClear?: boolean, revoke?: boolean) {
    if(appPeersManager.isChannel(peerId)) {
      const promise = this.getHistory(peerId, 0, 1);

      const historyResult = promise instanceof Promise ? await promise : promise;

      const channelId = peerId.toChatId();
      const maxId = historyResult.history[0] || 0;
      return apiManager.invokeApiSingle('channels.deleteHistory', {
        channel: appChatsManager.getChannelInput(channelId),
        max_id: appMessagesIdsManager.getServerMessageId(maxId)
      }).then((bool) => {
        if(bool) {
          apiUpdatesManager.processLocalUpdate({
            _: 'updateChannelAvailableMessages',
            channel_id: channelId,
            available_min_id: maxId
          });
        }

        return bool;
      });
    }

    return this.doFlushHistory(appPeersManager.getInputPeerById(peerId), justClear, revoke).then(() => {
      [
        this.historiesStorage, 
        this.threadsStorage, 
        this.searchesStorage, 
        this.pinnedMessages,
        this.pendingAfterMsgs,
        this.pendingTopMsgs
      ].forEach(s => {
        delete s[peerId];
      });

      const m = this.needSingleMessages.get(peerId);
      if(m) {
        m.clear();
      }

      [
        this.messagesStorageByPeerId,
        this.scheduledMessagesStorage
      ].forEach(s => {
        const ss = s[peerId];
        if(ss) {
          ss.clear();
        }
      });
      
      if(justClear) {
        rootScope.dispatchEvent('dialog_flush', {peerId});
      } else {
        delete this.notificationsToHandle[peerId];
        delete this.typings[peerId];
        
        const c = this.reloadConversationsPeers.get(peerId);
        if(c) {
          this.reloadConversationsPeers.delete(peerId);
          c.promise.resolve(undefined);
        }

        this.dialogsStorage.dropDialogOnDeletion(peerId);
      }
    });
  }

  public onPeerDeleted(peerId: number) {

  }

  public hidePinnedMessages(peerId: PeerId) {
    return Promise.all([
      appStateManager.getState(),
      this.getPinnedMessage(peerId)
    ])
    .then(([state, pinned]) => {
      state.hiddenPinnedMessages[peerId] = pinned.maxId;
      rootScope.dispatchEvent('peer_pinned_hidden', {peerId, maxId: pinned.maxId});
    });
  }

  public getPinnedMessage(peerId: PeerId) {
    const p = this.pinnedMessages[peerId] ?? (this.pinnedMessages[peerId] = {});
    if(p.promise) return p.promise;
    else if(p.maxId) return Promise.resolve(p);

    return p.promise = this.getSearch({
      peerId, 
      inputFilter: {_: 'inputMessagesFilterPinned'},
      maxId: 0,
      limit: 1
    }).then(result => {
      p.count = result.count;
      p.maxId = result.history[0]?.mid;
      return p;
    }).finally(() => {
      delete p.promise;
    });
  }

  public updatePinnedMessage(peerId: PeerId, mid: number, unpin?: boolean, silent?: boolean, pm_oneside?: boolean) {
    return apiManager.invokeApi('messages.updatePinnedMessage', {
      peer: appPeersManager.getInputPeerById(peerId),
      unpin,
      silent,
      pm_oneside,
      id: appMessagesIdsManager.getServerMessageId(mid)
    }).then(updates => {
      //this.log('pinned updates:', updates);
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public unpinAllMessages(peerId: PeerId): Promise<boolean> {
    return apiManager.invokeApiSingle('messages.unpinAllMessages', {
      peer: appPeersManager.getInputPeerById(peerId)
    }).then(affectedHistory => {
      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updatePts',
          pts: affectedHistory.pts,
          pts_count: affectedHistory.pts_count
        }
      });

      if(!affectedHistory.offset) {
        const storage = this.getMessagesStorage(peerId);
        storage.forEach((message) => {
          if(message.pFlags.pinned) {
            delete message.pFlags.pinned;
          }
        });

        rootScope.dispatchEvent('peer_pinned_messages', {peerId, unpinAll: true});
        delete this.pinnedMessages[peerId];

        return true;
      }

      return this.unpinAllMessages(peerId);
    });
  }

  public getAlbumText(grouped_id: string) {
    const group = this.groupedMessagesStorage[grouped_id];
    let foundMessages = 0, message: string, totalEntities: MessageEntity[], entities: MessageEntity[];
    for(const [mid, m] of group) {
      if(m.message) {
        if(++foundMessages > 1) break;
        message = m.message;
        totalEntities = m.totalEntities;
        entities = m.entities;
      }
    }

    if(foundMessages > 1) {
      message = undefined;
      totalEntities = undefined;
      entities = undefined;
    }

    return {message, entities, totalEntities};
  }

  public getGroupsFirstMessage(message: Message.message): Message.message {
    if(!message.grouped_id) return message;

    const storage = this.groupedMessagesStorage[message.grouped_id];
    let minMid = Number.MAX_SAFE_INTEGER;
    for(const [mid, message] of storage) {
      if(message.mid < minMid) {
        minMid = message.mid;
      }
    }

    return storage.get(minMid);
  }

  public getMidsByAlbum(grouped_id: string) {
    return getObjectKeysAndSort(this.groupedMessagesStorage[grouped_id], 'asc');
    //return Object.keys(this.groupedMessagesStorage[grouped_id]).map(id => +id).sort((a, b) => a - b);
  }

  public getMidsByMessage(message: Message) {
    if((message as Message.message)?.grouped_id) return this.getMidsByAlbum((message as Message.message).grouped_id);
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
    return appMessagesIdsManager.generateMessageId(dialog?.top_message || 0, true);
  }

  public saveMessage(message: Message, options: Partial<{
    storage: MessagesStorage,
    isScheduled: true,
    isOutgoing: true,
    //isNew: boolean, // * new - from update
  }> = {}) {
    if(message.pFlags === undefined) {
      message.pFlags = {};
    }

    if(message._ === 'messageEmpty') {
      message.deleted = true;
      return;
    }

    // * exclude from state
    // defineNotNumerableProperties(message, ['rReply', 'mid', 'savedFrom', 'fwdFromId', 'fromId', 'peerId', 'reply_to_mid', 'viaBotId']);

    const peerId = this.getMessagePeer(message);
    const storage = options.storage || this.getMessagesStorage(peerId);
    const isChannel = message.peer_id._ === 'peerChannel';
    const isBroadcast = isChannel && appChatsManager.isBroadcast(peerId.toChatId());
    const isMessage = message._ === 'message';

    if(options.isOutgoing) {
      message.pFlags.is_outgoing = true;
    }
    
    const mid = appMessagesIdsManager.generateMessageId(message.id);
    message.mid = mid;

    if(isMessage) {
      if(options.isScheduled) {
        message.pFlags.is_scheduled = true;
      }

      if(message.grouped_id) {
        const storage = this.groupedMessagesStorage[message.grouped_id] ?? (this.groupedMessagesStorage[message.grouped_id] = new Map());
        storage.set(mid, message);
      }

      if(message.via_bot_id) {
        // ! WARNING
        message.viaBotId = message.via_bot_id as any;
      }
    }

    const dialog = this.getDialogOnly(peerId);
    if(dialog && mid) {
      if(mid > dialog[message.pFlags.out
        ? 'read_outbox_max_id'
        : 'read_inbox_max_id']) {
        message.pFlags.unread = true;
      }
    }
    // this.log(dT(), 'msg unread', mid, apiMessage.pFlags.out, dialog && dialog[apiMessage.pFlags.out ? 'read_outbox_max_id' : 'read_inbox_max_id'])

    if(message.reply_to) {
      if(message.reply_to.reply_to_msg_id) {
        message.reply_to.reply_to_msg_id = message.reply_to_mid = appMessagesIdsManager.generateMessageId(message.reply_to.reply_to_msg_id);
      } 

      if(message.reply_to.reply_to_top_id) message.reply_to.reply_to_top_id = appMessagesIdsManager.generateMessageId(message.reply_to.reply_to_top_id);
    }

    if(isMessage && message.replies) {
      if(message.replies.max_id) message.replies.max_id = appMessagesIdsManager.generateMessageId(message.replies.max_id);
      if(message.replies.read_max_id) message.replies.read_max_id = appMessagesIdsManager.generateMessageId(message.replies.read_max_id);
    }

    const overwriting = !!peerId;
    if(!overwriting) {
      message.date -= serverTimeManager.serverTimeOffset;
    }
    
    //storage.generateIndex(message);
    const myId = appUsersManager.getSelf().id.toPeerId();

    const fwdHeader = isMessage && (message as Message.message).fwd_from as MessageFwdHeader;

    message.peerId = peerId;
    if(peerId === myId/*  && !message.from_id && !message.fwd_from */) {
      message.fromId = fwdHeader ? (fwdHeader.from_id ? appPeersManager.getPeerId(fwdHeader.from_id) : NULL_PEER_ID) : myId;
    } else {
      //message.fromId = message.pFlags.post || (!message.pFlags.out && !message.from_id) ? peerId : appPeersManager.getPeerId(message.from_id);
      message.fromId = message.pFlags.post || !message.from_id ? peerId : appPeersManager.getPeerId(message.from_id);
    }

    if(fwdHeader) {
      //if(peerId === myID) {
        if(fwdHeader.saved_from_msg_id) fwdHeader.saved_from_msg_id = appMessagesIdsManager.generateMessageId(fwdHeader.saved_from_msg_id);
        if(fwdHeader.channel_post) fwdHeader.channel_post = appMessagesIdsManager.generateMessageId(fwdHeader.channel_post);

        const peer = fwdHeader.saved_from_peer || fwdHeader.from_id;
        const msgId = fwdHeader.saved_from_msg_id || fwdHeader.channel_post;
        if(peer && msgId) {
          const savedFromPeerId = appPeersManager.getPeerId(peer);
          const savedFromMid = appMessagesIdsManager.generateMessageId(msgId);
          message.savedFrom = savedFromPeerId + '_' + savedFromMid;
        }

        /* if(peerId.isAnyChat() || peerId === myID) {
          message.fromId = appPeersManager.getPeerID(!message.from_id || deepEqual(message.from_id, fwdHeader.from_id) ? fwdHeader.from_id : message.from_id);
        } */
      /* } else {
        apiMessage.fwdPostID = fwdHeader.channel_post;
      } */

      message.fwdFromId = appPeersManager.getPeerId(fwdHeader.from_id);

      if(!overwriting) {
        fwdHeader.date -= serverTimeManager.serverTimeOffset;
      }
    }

    const mediaContext: ReferenceContext = {
      type: 'message',
      peerId,
      messageId: mid
    };

    /* if(isMessage) {
      const entities = message.entities;
      if(entities && entities.find(entity => entity._ === 'messageEntitySpoiler')) {
        message.media = {_: 'messageMediaUnsupported'};
      }
    } */

    if(isMessage && message.media) {
      let unsupported = false;
      switch(message.media._) {
        case 'messageMediaEmpty': {
          delete message.media;
          break;
        }

        case 'messageMediaPhoto': {
          if(message.media.ttl_seconds) {
            unsupported = true;
          } else {
            message.media.photo = appPhotosManager.savePhoto(message.media.photo, mediaContext);
          }

          if(!(message.media as MessageMedia.messageMediaPhoto).photo) { // * found this bug on test DC
            delete message.media;
          }
          
          break;
        }
          
        case 'messageMediaPoll': {
          const result = appPollsManager.savePoll(message.media.poll, message.media.results, message);
          message.media.poll = result.poll;
          message.media.results = result.results;
          break;
        }
          
        case 'messageMediaDocument': {
          if(message.media.ttl_seconds) {
            unsupported = true;
          } else {
            const originalDoc = message.media.document;
            message.media.document = appDocsManager.saveDoc(originalDoc, mediaContext); // 11.04.2020 warning

            if(!message.media.document && originalDoc._ !== 'documentEmpty') {
              unsupported = true;
            }
          }

          break;
        }
          
        case 'messageMediaWebPage': {
          const messageKey = appWebPagesManager.getMessageKeyForPendingWebPage(peerId, mid, options.isScheduled);
          message.media.webpage = appWebPagesManager.saveWebPage(message.media.webpage, messageKey, mediaContext);
          break;
        }
          
        /*case 'messageMediaGame':
          AppGamesManager.saveGame(apiMessage.media.game, apiMessage.mid, mediaContext);
          apiMessage.media.handleMessage = true;
          break; */

        case 'messageMediaInvoice': {
          unsupported = true;
          message.media = {_: 'messageMediaUnsupported'};
          break;
        }

        case 'messageMediaUnsupported': {
          unsupported = true;
          break;
        }
      }

      if(unsupported) {
        message.media = {_: 'messageMediaUnsupported'};
        message.message = '';
        delete message.entities;
        delete message.totalEntities;
      }
    }

    if(!isMessage && message.action) {
      const action = message.action as MessageAction;
      let migrateFrom: PeerId;
      let migrateTo: PeerId;
      const suffix = message.fromId === appUsersManager.getSelf().id ? 'You' : '';

      if((action as MessageAction.messageActionChatEditPhoto).photo) {
        (action as MessageAction.messageActionChatEditPhoto).photo = appPhotosManager.savePhoto((action as MessageAction.messageActionChatEditPhoto).photo, mediaContext);
      }

      if((action as any).document) {
        (action as any).document = appDocsManager.saveDoc((action as any).photo, mediaContext);
      }

      switch(action._) {
        //case 'messageActionChannelEditPhoto':
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
          //assumeType<MessageAction.messageActionGroupCall>(action);

          appGroupCallsManager.saveGroupCall(action.call);

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
          //apiMessage.deleted = true;
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
                action.reason._ === 'phoneCallDiscardReasonMissed'
                  ? 'missed'
                  : 'cancelled'
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
  }

  public saveMessages(messages: any[], options: Partial<{
    storage: MessagesStorage,
    isScheduled: true,
    isOutgoing: true,
    //isNew: boolean, // * new - from update
  }> = {}) {
    if((messages as any).saved) return;
    (messages as any).saved = true;
    messages.forEach((message) => {
      this.saveMessage(message, options);
    });
  }

  private wrapMessageEntities(message: Message.message) {
    const apiEntities = message.entities ? message.entities.slice() : [];
    message.message = RichTextProcessor.fixEmoji(message.message, apiEntities);

    const myEntities = RichTextProcessor.parseEntities(message.message);
    message.totalEntities = RichTextProcessor.mergeEntities(apiEntities, myEntities); // ! only in this order, otherwise bold and emoji formatting won't work
  }

  public wrapMessageForReply(message: MyMessage | MyDraftMessage, text: string, usingMids: number[], plain: true, highlightWord?: string, withoutMediaType?: boolean): string;
  public wrapMessageForReply(message: MyMessage | MyDraftMessage, text?: string, usingMids?: number[], plain?: false, highlightWord?: string, withoutMediaType?: boolean): DocumentFragment;
  public wrapMessageForReply(message: MyMessage | MyDraftMessage, text: string = (message as Message.message).message, usingMids?: number[], plain?: boolean, highlightWord?: string, withoutMediaType?: boolean): DocumentFragment | string {
    const parts: (Node | string)[] = [];

    let hasAlbumKey = false;
    const addPart = (langKey: LangPackKey, part?: string | HTMLElement) => {
      if(langKey) {
        if(part === undefined && hasAlbumKey) {
          return;
        }
        
        part = plain ? I18n.format(langKey, true) : i18n(langKey);
      }
      
      if(plain) {
        parts.push(part);
      } else {
        const el = document.createElement('i');
        if(typeof(part) === 'string') el.innerHTML = part;
        else el.append(part);
        parts.push(el);
      }
    };

    const isRestricted = this.isRestricted(message as any);

    let entities = (message as Message.message).totalEntities;
    if((message as Message.message).media && !isRestricted) {
      assumeType<Message.message>(message);
      let usingFullAlbum = true;
      if(message.grouped_id) {
        if(usingMids) {
          const mids = this.getMidsByMessage(message);
          if(usingMids.length === mids.length) {
            for(const mid of mids) {
              if(!usingMids.includes(mid)) {
                usingFullAlbum = false;
                break;
              }
            }
          } else {
            usingFullAlbum = false;
          }
        }

        if(usingFullAlbum) {
          const albumText = this.getAlbumText(message.grouped_id);
          text = albumText.message;
          entities = albumText.totalEntities;

          if(!withoutMediaType) {
            addPart('AttachAlbum');
            hasAlbumKey = true;
          }
        }
      } else {
        usingFullAlbum = false;
      }

      if((!usingFullAlbum && !withoutMediaType) || !text) {
        const media = message.media;
        switch(media._) {
          case 'messageMediaPhoto':
            addPart('AttachPhoto');
            break;
          case 'messageMediaDice':
            addPart(undefined, plain ? media.emoticon : RichTextProcessor.wrapEmojiText(media.emoticon));
            break;
          case 'messageMediaVenue': {
            text = media.title;
            addPart('AttachLocation');
            break;
          }
          case 'messageMediaGeo':
            addPart('AttachLocation');
            break;
          case 'messageMediaGeoLive':
            addPart('AttachLiveLocation');
            break;
          case 'messageMediaPoll':
            addPart(undefined, plain ? '📊' + ' ' + (media.poll.question || 'poll') : media.poll.rReply);
            break;
          case 'messageMediaContact':
            addPart('AttachContact');
            break;
          case 'messageMediaGame': {
            const f = '🎮' + ' ' + media.game.title;
            addPart(undefined, plain ? f : RichTextProcessor.wrapEmojiText(f));
            break;
          }
          case 'messageMediaDocument': {
            const document = media.document as MyDocument;
  
            if(document.type === 'video') {
              addPart('AttachVideo');
            } else if(document.type === 'voice') {
              addPart('AttachAudio');
            } else if(document.type === 'gif') {
              addPart('AttachGif');
            } else if(document.type === 'round') {
              addPart('AttachRound');
            } else if(document.type === 'sticker') {
              if(document.stickerEmojiRaw) {
                addPart(undefined, (plain ? document.stickerEmojiRaw : document.stickerEmoji) + ' ');
              }
              
              addPart('AttachSticker');
              text = '';
            } else if(document.type === 'audio') {
              const attribute = document.attributes.find(attribute => attribute._ === 'documentAttributeAudio' && (attribute.title || attribute.performer)) as DocumentAttribute.documentAttributeAudio;
              const f = '🎵' + ' ' + (attribute ? [attribute.title, attribute.performer].filter(Boolean).join(' - ') : document.file_name);
              addPart(undefined, plain ? f : RichTextProcessor.wrapEmojiText(f));
            } else {
              addPart(undefined, plain ? document.file_name : RichTextProcessor.wrapEmojiText(document.file_name));
            }
  
            break;
          }

          case 'messageMediaUnsupported': {
            addPart(UNSUPPORTED_LANG_PACK_KEY);
            break;
          }
  
          default:
            //messageText += media._;
            ///////this.log.warn('Got unknown media type!', message);
            break;
        }
      }

      const length = parts.length;
      /* for(let i = 1; i < length; i += 2) {
        parts.splice(i, 0, ', ');
      } */

      if(text && length) {
        parts.push(', ');
      }
    }

    if((message as Message.messageService).action) {
      const actionWrapped = this.wrapMessageActionTextNew((message as Message.messageService), plain);
      if(actionWrapped) {
        addPart(undefined, actionWrapped);
      }
    }

    if(isRestricted) {
      text = getRestrictionReason((message as Message.message).restriction_reason).text;
      entities = [];
    }

    if(text) {
      text = limitSymbols(text, 100);

      if(!entities) {
        entities = [];
      }

      if(plain) {
        parts.push(RichTextProcessor.wrapPlainText(text, entities));
      } else {
        // let entities = RichTextProcessor.parseEntities(text.replace(/\n/g, ' '));

        if(highlightWord) {
          highlightWord = highlightWord.trim();
          let found = false;
          let match: any;
          let regExp = new RegExp(escapeRegExp(highlightWord), 'gi');
          entities = entities.slice(); // fix leaving highlight entity
          while((match = regExp.exec(text)) !== null) {
            entities.push({_: 'messageEntityHighlight', length: highlightWord.length, offset: match.index});
            found = true;
          }
      
          if(found) {
            RichTextProcessor.sortEntities(entities);
          }
        }

        const messageWrapped = RichTextProcessor.wrapRichText(text, {
          noLinebreaks: true, 
          entities, 
          noLinks: true,
          noTextFormat: true
        });
  
        parts.push(htmlToDocumentFragment(messageWrapped) as any);
      }
    }

    if(plain) {
      return parts.join('');
    } else {
      const fragment = document.createDocumentFragment();
      fragment.append(...parts);
      return fragment;
    }
  }

  public wrapSenderToPeer(message: MyMessage) {
    const senderTitle: HTMLElement = document.createElement('span');
    senderTitle.classList.add('sender-title');
    
    const fromMe = message.fromId === rootScope.myId && message.peerId !== rootScope.myId;
    senderTitle.append(
      fromMe ? 
        i18n('FromYou') : 
        new PeerTitle({
          ...this.getMessageSenderPeerIdOrName(message),
          dialog: message.peerId === rootScope.myId
        }).element
      );

    if(appPeersManager.isAnyGroup(message.peerId) || fromMe) {
      const peerTitle = new PeerTitle({peerId: message.peerId}).element;
      senderTitle.append(' ➝ ', peerTitle);
    }

    return senderTitle;
  }

  public getMessageSenderPeerIdOrName(message: MyMessage) {
    if(message.fromId) {
      return {
        peerId: message.fromId
      };
    } else {
      return {
        fromName: (message as Message.message).fwd_from?.from_name
      };
    }
  }

  public wrapSentTime(message: MyMessage) {
    const el: HTMLElement = document.createElement('span');
    el.classList.add('sent-time');
    el.append(formatDateAccordingToTodayNew(new Date(message.date * 1000)));

    return el;
  }

  private wrapJoinVoiceChatAnchor(message: Message.messageService) {
    const action = message.action as MessageAction.messageActionInviteToGroupCall;
    const {onclick, url} = RichTextProcessor.wrapUrl(`tg://voicechat?chat_id=${message.peerId.toChatId()}&id=${action.call.id}&access_hash=${action.call.access_hash}`);
    if(!onclick) {
      return document.createElement('span');
    }
    
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('onclick', onclick + '(this)');

    return a;
  }

  private wrapMessageActionTextNewUnsafe(message: MyMessage, plain?: boolean) {
    const element: HTMLElement = plain ? undefined : document.createElement('span');
    const action = 'action' in message && message.action;

    // this.log('message action:', action);

    if((action as MessageAction.messageActionCustomAction).message) {
      const unsafeMessage = (action as MessageAction.messageActionCustomAction).message;
      if(plain) {
        return RichTextProcessor.wrapPlainText(unsafeMessage);
      } else {
        element.innerHTML = RichTextProcessor.wrapRichText(unsafeMessage, {noLinebreaks: true});
        return element;
      }
    } else {
      let _ = action._;
      //let suffix = '';
      let langPackKey: LangPackKey;
      let args: any[];

      const getNameDivHTML = (peerId: PeerId, plain: boolean) => {
        return plain ? appPeersManager.getPeerTitle(peerId, plain) : (new PeerTitle({peerId})).element;
      };

      switch(action._) {
        case 'messageActionPhoneCall': {
          _ += '.' + (action as any).type;

          args = [formatCallDuration(action.duration, plain)];
          break;
        }

        case 'messageActionGroupCall': {
          _ += '.' + (action as any).type;

          args = [];
          if(!_.endsWith('You') && !message.pFlags.post) {
            args.push(getNameDivHTML(message.fromId, plain));
          }

          if(action.duration !== undefined) {
            args.push(formatCallDuration(action.duration, plain));
          } else {
            args.push(this.wrapJoinVoiceChatAnchor(message as any));
          }

          break;
        }

        case 'messageActionInviteToGroupCall': {
          const peerIds = [message.fromId, action.users[0].toPeerId()];
          let a = 'Chat.Service.VoiceChatInvitation';
          const myId = appUsersManager.getSelf().id;
          if(peerIds[0] === myId) a += 'ByYou';
          else if(peerIds[1] === myId) a += 'ForYou';
          indexOfAndSplice(peerIds, myId);

          langPackKey = a as LangPackKey;
          args = peerIds.map(peerId => getNameDivHTML(peerId, plain));
          args.push(this.wrapJoinVoiceChatAnchor(message as any));
          break;
        }

        case 'messageActionGroupCallScheduled': {
          const today = new Date();
          const date = new Date(action.schedule_date * 1000);
          const daysToStart = (date.getTime() - today.getTime()) / 86400e3;
          const tomorrowDate = new Date(today);
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);

          const isBroadcast = appPeersManager.isBroadcast(message.peerId);
          langPackKey = isBroadcast ? 'ChatList.Service.VoiceChatScheduled.Channel' : 'ChatList.Service.VoiceChatScheduled';
          args = [];
          const myId = appUsersManager.getSelf().id;
          if(message.fromId === myId) {
            langPackKey += 'You';
          } else if(!isBroadcast) {
            args.push(getNameDivHTML(message.fromId, plain));
          }

          let k: LangPackKey, _args: FormatterArguments = [];
          if(daysToStart < 1 && date.getDate() === today.getDate()) {
            k = 'TodayAtFormattedWithToday';
          } else if(daysToStart < 2 && date.getDate() === tomorrowDate.getDate()) {
            k = 'Time.TomorrowAt';
          } else {
            k = 'formatDateAtTime';
            _args.push(new I18n.IntlDateElement({
              date, 
              options: {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit'
              }
            }).element);
          }

          _args.push(formatTime(date));
          const t = i18n(k, _args);
          args.push(t);

          break;
        }

        case 'messageActionChatCreate': {
          const myId = appUsersManager.getSelf().id;
          if(message.fromId === myId) {
            _ += 'You';
          } else {
            args = [getNameDivHTML(message.fromId, plain)];
          }
          
          break;
        }

        case 'messageActionPinMessage': {
          const peerId = message.peerId;
          const pinnedMessage = this.getMessageByPeer(peerId, message.reply_to_mid);

          args = [
            getNameDivHTML(message.fromId, plain),
          ];
          
          if(pinnedMessage.deleted/*  || true */) {
            langPackKey = 'ActionPinnedNoText';

            if(message.reply_to_mid) { // refresh original message
              this.fetchMessageReplyTo(message).then(originalMessage => {
                if(!originalMessage.deleted && !message.deleted) {
                  rootScope.dispatchEvent('message_edit', {
                    storage: this.getMessagesStorage(peerId),
                    peerId: peerId,
                    mid: message.mid
                  });

                  if(this.isMessageIsTopMessage(message)) {
                    rootScope.dispatchEvent('dialogs_multiupdate', {
                      [peerId]: this.getDialogOnly(peerId)
                    });
                  }
                }
              });
            }
          } else {
            const a = document.createElement('i');
            a.dataset.savedFrom = pinnedMessage.peerId + '_' + pinnedMessage.mid;
            a.dir = 'auto';
            a.append(this.wrapMessageForReply(pinnedMessage, undefined, undefined, plain as any));
            args.push(a);
          }

          break;
        }

        case 'messageActionChatJoinedByRequest': {
          const isBroadcast = appPeersManager.isBroadcast(message.peerId);
          if(message.pFlags.out) {
            langPackKey = isBroadcast ? 'RequestToJoinChannelApproved' : 'RequestToJoinGroupApproved';
          } else {
            langPackKey = isBroadcast ? 'ChatService.UserJoinedChannelByRequest' : 'ChatService.UserJoinedGroupByRequest';
            args = [getNameDivHTML(message.fromId, plain)];
          }
          break;
        }

        case 'messageActionContactSignUp':
        case 'messageActionChatReturn':
        case 'messageActionChatLeave':
        case 'messageActionChatJoined':
        case 'messageActionChatEditPhoto':
        case 'messageActionChatDeletePhoto':
        case 'messageActionChatEditVideo':
        case 'messageActionChatJoinedByLink':
        case 'messageActionChannelEditVideo':
        case 'messageActionChannelDeletePhoto': {
          args = [getNameDivHTML(message.fromId, plain)];
          break;
        }

        case 'messageActionChannelEditTitle':
        case 'messageActionChatEditTitle': {
          args = [];
          if(action._ === 'messageActionChatEditTitle') {
            args.push(getNameDivHTML(message.fromId, plain));
          }

          args.push(plain ? action.title : htmlToSpan(RichTextProcessor.wrapEmojiText(action.title)));
          break;
        }

        case 'messageActionChatDeleteUser':
        case 'messageActionChatAddUsers':
        case 'messageActionChatAddUser': {
          const users = (action as MessageAction.messageActionChatAddUser).users 
            || [(action as MessageAction.messageActionChatDeleteUser).user_id];

          args = [getNameDivHTML(message.fromId, plain)];

          if(users.length > 1) {
            const joined = join(
              users.map((userId: UserId) => getNameDivHTML(userId.toPeerId(), plain)),
              false,
              plain
            );
            
            if(plain) {
              args.push(...joined);
            } else {
              const fragment = document.createElement('span');
              fragment.append(...joined);
              args.push(fragment);
            }
          } else {
            args.push(getNameDivHTML(users[0].toPeerId(), plain));
          }

          break;
        }

        case 'messageActionBotAllowed': {
          const anchorHTML = RichTextProcessor.wrapRichText(action.domain, {
            entities: [{
              _: 'messageEntityUrl',
              length: action.domain.length,
              offset: 0
            }]
          });

          const node = htmlToSpan(anchorHTML);

          args = [node];
          break;
        }

        default:
          langPackKey = (langPack[_] || `[${action._}]`) as any;
          break;
      }

      if(!langPackKey) {
        langPackKey = langPack[_];
        if(langPackKey === undefined) {
          langPackKey = '[' + _ + ']' as any;
        }
      }

      if(plain) {
        return I18n.format(langPackKey, true, args);
      } else {
        return _i18n(element, langPackKey, args);
      }

      //str = !langPackKey || langPackKey[0].toUpperCase() === langPackKey[0] ? langPackKey : getNameDivHTML(message.fromId) + langPackKey + (suffix ? ' ' : '');
    }
  }

  public wrapMessageActionTextNew(message: MyMessage, plain: true): string;
  public wrapMessageActionTextNew(message: MyMessage, plain?: false): HTMLElement;
  public wrapMessageActionTextNew(message: MyMessage, plain: boolean): HTMLElement | string;
  public wrapMessageActionTextNew(message: MyMessage, plain?: boolean): HTMLElement | string {
    try {
      return this.wrapMessageActionTextNewUnsafe(message, plain);
    } catch(err) {
      this.log.error('wrapMessageActionTextNewUnsafe error:', err);
      return plain ? '' : document.createElement('span');
    }
  }

  public reportMessages(peerId: PeerId, mids: number[], reason: ReportReason['_'], message?: string) {
    return apiManager.invokeApiSingle('messages.report', {
      peer: appPeersManager.getInputPeerById(peerId),
      id: mids.map(mid => appMessagesIdsManager.getServerMessageId(mid)),
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

      return apiManager.invokeApi('messages.startBot', {
        bot: appUsersManager.getUserInput(botId),
        peer: appPeersManager.getInputPeerById(peerId),
        random_id: randomId,
        start_param: startParam
      }).then((updates) => {
        apiUpdatesManager.processUpdateMessage(updates);
      });
    }

    const str = '/start';
    if(chatId) {
      let promise: Promise<void>;
      if(appChatsManager.isChannel(chatId)) {
        promise = appChatsManager.inviteToChannel(chatId, [botId]);
      } else {
        promise = appChatsManager.addChatUser(chatId, botId, 0);
      }

      return promise.catch((error) => {
        if(error && error.type == 'USER_ALREADY_PARTICIPANT') {
          error.handled = true;
          return;
        }

        throw error;
      }).then(() => {
        const bot = appUsersManager.getUser(botId);
        return this.sendText(peerId, str + '@' + bot.username);
      });
    }

    return this.sendText(peerId, str);
  }

  public editPeerFolders(peerIds: PeerId[], folderId: number) {
    apiManager.invokeApi('folders.editPeerFolders', {
      folder_peers: peerIds.map(peerId => {
        return {
          _: 'inputFolderPeer',
          peer: appPeersManager.getInputPeerById(peerId),
          folder_id: folderId
        };
      })
    }).then(updates => {
      //this.log('editPeerFolders updates:', updates);
      apiUpdatesManager.processUpdateMessage(updates); // WARNING! возможно тут нужно добавлять channelId, и вызывать апдейт для каждого канала отдельно
    });
  }

  public toggleDialogPin(peerId: PeerId, filterId?: number) {
    if(filterId > 1) {
      return this.filtersStorage.toggleDialogPin(peerId, filterId);
    }

    const dialog = this.getDialogOnly(peerId);
    if(!dialog) return Promise.reject();

    const pinned = dialog.pFlags?.pinned ? undefined : true;

    if(pinned) {
      const max = filterId === 1 ? rootScope.config.pinned_infolder_count_max : rootScope.config.pinned_dialogs_count_max;
      if(this.dialogsStorage.getPinnedOrders(filterId).length >= max) {
        return Promise.reject({type: 'PINNED_DIALOGS_TOO_MUCH'});
      }
    }

    return apiManager.invokeApi('messages.toggleDialogPin', {
      peer: appPeersManager.getInputDialogPeerById(peerId),
      pinned
    }).then(bool => {
      if(bool) {
        const pFlags: Update.updateDialogPinned['pFlags'] = pinned ? {pinned} : {};
        apiUpdatesManager.saveUpdate({
          _: 'updateDialogPinned',
          peer: appPeersManager.getDialogPeer(peerId),
          folder_id: filterId,
          pFlags
        });
      }
    });
  }

  public markDialogUnread(peerId: PeerId, read?: true) {
    const dialog = this.getDialogOnly(peerId);
    if(!dialog) return Promise.reject();

    const unread = read || dialog.pFlags?.unread_mark ? undefined : true;
    return apiManager.invokeApi('messages.markDialogUnread', {
      peer: appPeersManager.getInputDialogPeerById(peerId),
      unread
    }).then(bool => {
      if(bool) {
        const pFlags: Update.updateDialogUnreadMark['pFlags'] = unread ? {unread} : {};
        this.onUpdateDialogUnreadMark({
          _: 'updateDialogUnreadMark',
          peer: appPeersManager.getDialogPeer(peerId),
          pFlags
        });
      }
    });
  }

  public migrateChecks(migrateFrom: PeerId, migrateTo: PeerId) {
    if(!this.migratedFromTo[migrateFrom] &&
      !this.migratedToFrom[migrateTo] &&
      appChatsManager.hasChat(migrateTo.toChatId())) {
      const fromChat = appChatsManager.getChat(migrateFrom.toChatId());
      if(fromChat &&
        fromChat.migrated_to &&
        fromChat.migrated_to.channel_id === migrateTo.toChatId()) {
          this.migratedFromTo[migrateFrom] = migrateTo;
          this.migratedToFrom[migrateTo] = migrateFrom;

        //setTimeout(() => {
          rootScope.dispatchEvent('dialog_migrate', {migrateFrom, migrateTo});

          this.dialogsStorage.dropDialogWithEvent(migrateFrom);
        //}, 100);
      }
    }
  }

  private canMessageBeEdited(message: any, kind: 'text' | 'poll') {
    if(message.pFlags.is_outgoing) {
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

    if(message._ !== 'message' ||
        message.deleted ||
        message.fwd_from ||
        message.via_bot_id ||
        message.media && goodMedias.indexOf(message.media._) === -1 ||
        message.fromId && appUsersManager.isBot(message.fromId)) {
      return false;
    }
    
    if(message.media &&
        message.media._ === 'messageMediaDocument' &&
        (message.media.document.sticker || message.media.document.type === 'round')) {
      return false;
    }

    return true;
  }

  public canEditMessage(message: Message.message | Message.messageService, kind: 'text' | 'poll' = 'text') {
    if(!message || !this.canMessageBeEdited(message, kind)) {
      return false;
    }

    // * second rule for saved messages, because there is no 'out' flag
    if(/* message.pFlags.out ||  */this.getMessagePeer(message) === appUsersManager.getSelf().id) {
      return true;
    }

    if(!message.pFlags.out || (
        message.peer_id._ !== 'peerChannel' &&  
        message.date < (tsNow(true) - rootScope.config.edit_time_limit) && 
        (message as Message.message).media?._ !== 'messageMediaPoll'
      )
    ) {
      return false;
    }

    return true;
  }

  public canDeleteMessage(message: MyMessage) {
    return message && (
      message.peerId.isUser() 
      || message.pFlags.out 
      || appChatsManager.getChat(message.peerId.toChatId())._ === 'chat' 
      || appChatsManager.hasRights(message.peerId.toChatId(), 'delete_messages')
    ) && !message.pFlags.is_outgoing;
  }

  public getReplyKeyboard(peerId: PeerId) {
    return this.getHistoryStorage(peerId).replyMarkup;
  }

  public mergeReplyKeyboard(historyStorage: HistoryStorage, message: Message.messageService | Message.message) {
    // this.log('merge', message.mid, message.reply_markup, historyStorage.reply_markup)
    let messageReplyMarkup = (message as Message.message).reply_markup;
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
        messageReplyMarkup.fromId = appPeersManager.getPeerId(message.from_id);
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
      (lastReplyMarkup
        ? message.action.user_id === (lastReplyMarkup as ReplyMarkup.replyKeyboardMarkup).fromId
        : appUsersManager.isBot(message.action.user_id)
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

  public getSearchCounters(peerId: PeerId, filters: MessagesFilter[], canCache = true): Promise<MessagesSearchCounter[]> {
    if(appPeersManager.isRestricted(peerId)) {
      return Promise.resolve(filters.map((filter) => {
        return {
          _: 'messages.searchCounter',
          pFlags: {},
          filter: filter,
          count: 0
        };
      }));
    }

    const func = (canCache ? apiManager.invokeApiCacheable : apiManager.invokeApi).bind(apiManager);
    return func('messages.getSearchCounters', {
      peer: appPeersManager.getInputPeerById(peerId),
      filters
    });
  }

  public filterMessagesByInputFilter(inputFilter: MyInputMessagesFilter, history: number[], storage: MessagesStorage, limit: number) {
    const foundMsgs: MyMessage[] = [];
    if(!history.length) {
      return foundMsgs;
    }

    let filtering = true;
    const neededContents: Partial<{
      [messageMediaType in MessageMedia['_']]: boolean
    }> & Partial<{
      avatar: boolean,
      url: boolean
    }> = {},
      neededDocTypes: MyDocument['type'][] = [], 
      excludeDocTypes: MyDocument['type'][] = []/* ,
      neededFlags: string[] = [] */;

    switch(inputFilter) {
      case 'inputMessagesFilterPhotos':
        neededContents['messageMediaPhoto'] = true;
        break;

      case 'inputMessagesFilterPhotoVideo':
        neededContents['messageMediaPhoto'] = true;
        neededContents['messageMediaDocument'] = true;
        neededDocTypes.push('video');
        break;

      case 'inputMessagesFilterVideo':
        neededContents['messageMediaDocument'] = true;
        neededDocTypes.push('video');
        break;

      case 'inputMessagesFilterDocument':
        neededContents['messageMediaDocument'] = true;
        excludeDocTypes.push('video');
        break;

      case 'inputMessagesFilterVoice':
        neededContents['messageMediaDocument'] = true;
        neededDocTypes.push('voice');
        break;

      case 'inputMessagesFilterRoundVoice':
        neededContents['messageMediaDocument'] = true;
        neededDocTypes.push('round', 'voice');
        break;

      case 'inputMessagesFilterRoundVideo':
        neededContents['messageMediaDocument'] = true;
        neededDocTypes.push('round');
        break;

      case 'inputMessagesFilterMusic':
        neededContents['messageMediaDocument'] = true;
        neededDocTypes.push('audio');
        break;

      case 'inputMessagesFilterUrl':
        neededContents['url'] = true;
        break;

      case 'inputMessagesFilterChatPhotos':
        neededContents['avatar'] = true;
        break;

      /* case 'inputMessagesFilterPinned':
        neededFlags.push('pinned');
        break; */

      /* case 'inputMessagesFilterMyMentions':
        neededContents['mentioned'] = true;
        break; */

      default:
        filtering = false;
        break;
        /* return Promise.resolve({
          count: 0,
          next_rate: 0,
          history: [] as number[]
        }); */
    }

    if(!filtering) {
      return foundMsgs;
    }

    for(let i = 0, length = history.length; i < length; ++i) {
      const message: Message.message | Message.messageService = storage.get(history[i]);
      if(!message) continue;
  
      //|| (neededContents['mentioned'] && message.totalEntities.find((e: any) => e._ === 'messageEntityMention'));
  
      let found = false;
      if(message._ === 'message') {
        if(message.media && neededContents[message.media._]/*  && !message.fwd_from */) {
          const doc = (message.media as MessageMedia.messageMediaDocument).document as MyDocument;
          if(doc && ((neededDocTypes.length && !neededDocTypes.includes(doc.type)) 
            || excludeDocTypes.includes(doc.type))) {
            continue;
          }
  
          found = true;
        } else if(neededContents['url'] && message.message) {
          const goodEntities = ['messageEntityTextUrl', 'messageEntityUrl'];
          if((message.totalEntities as MessageEntity[]).find(e => goodEntities.includes(e._)) || RichTextProcessor.matchUrl(message.message)) {
            found = true;
          }
        }
      } else if(neededContents['avatar'] && 
        message.action && 
        ([
          'messageActionChannelEditPhoto' as const, 
          'messageActionChatEditPhoto' as const, 
          'messageActionChannelEditVideo' as const, 
          'messageActionChatEditVideo' as const
        ] as MessageAction['_'][]).includes(message.action._)) {
        found = true;
      }/*  else if(neededFlags.find(flag => message.pFlags[flag])) {
        found = true;
      } */
  
      if(found) {
        foundMsgs.push(message);
        if(foundMsgs.length >= limit) {
          break;
        }
      }
    }

    return foundMsgs;
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
    if(appPeersManager.isRestricted(peerId)) {
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

    //this.log('search', maxId);

    if(backLimit) {
      limit += backLimit;
    }

    //const beta = inputFilter._ === 'inputMessagesFilterPinned' && !backLimit;
    const beta = false;

    let storage: {
      count?: number;
      history: SlicedArray;
    };

    // * костыль для limit 1, если нужно и получить сообщение, и узнать количество сообщений
    if(peerId && !backLimit && !maxId && !query && limit !== 1 && !threadId/*  && inputFilter._ !== 'inputMessagesFilterPinned' */) {
      storage = beta ? 
        this.getSearchStorage(peerId, inputFilter._) as any : 
        this.getHistoryStorage(peerId);
      foundMsgs = this.filterMessagesByInputFilter(inputFilter._, storage.history.slice, this.getMessagesStorage(peerId), limit);
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
    const method = (canCache ? apiManager.invokeApiCacheable : apiManager.invokeApi).bind(apiManager);

    let apiPromise: Promise<any>;
    if(peerId && !nextRate && folderId === undefined/*  || !query */) {
      apiPromise = method('messages.search', {
        peer: appPeersManager.getInputPeerById(peerId),
        q: query || '',
        filter: inputFilter as any as MessagesFilter,
        min_date: minDate,
        max_date: maxDate,
        limit,
        offset_id: appMessagesIdsManager.getServerMessageId(maxId) || 0,
        add_offset: backLimit ? -backLimit : 0,
        max_id: 0,
        min_id: 0,
        hash: '',
        top_msg_id: appMessagesIdsManager.getServerMessageId(threadId) || 0
      }, {
        //timeout: APITIMEOUT,
        noErrorBox: true
      });
    } else {
      //var offsetDate = 0;
      let offsetPeerId: PeerId;
      let offsetId = 0;
      let offsetMessage = maxId && this.getMessageByPeer(peerId, maxId);

      if(offsetMessage && offsetMessage.date) {
        //offsetDate = offsetMessage.date + serverTimeManager.serverTimeOffset;
        offsetId = offsetMessage.id;
        offsetPeerId = this.getMessagePeer(offsetMessage);
      }

      apiPromise = method('messages.searchGlobal', {
        q: query,
        filter: inputFilter as any as MessagesFilter,
        min_date: minDate,
        max_date: maxDate,
        offset_rate: nextRate,
        offset_peer: appPeersManager.getInputPeerById(offsetPeerId),
        offset_id: offsetId,
        limit,
        folder_id: folderId
      }, {
        //timeout: APITIMEOUT,
        noErrorBox: true
      });
    }

    return apiPromise.then((searchResult: any) => {
      appUsersManager.saveApiUsers(searchResult.users);
      appChatsManager.saveApiChats(searchResult.chats);
      this.saveMessages(searchResult.messages);

      /* if(beta && storage && (!maxId || storage.history[storage.history.length - 1] === maxId)) {
        const storage = this.getSearchStorage(peerId, inputFilter._);
        const add = (searchResult.messages.map((m: any) => m.mid) as number[]).filter(mid => storage.history.indexOf(mid) === -1);
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
          const chat: Chat.chat = appChatsManager.getChat(peerId.toChatId());
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

    const maxMessageId = appMessagesIdsManager.getServerMessageId(Math.max(...this.getMidsByMessage(message)));
    const serviceStartMessage: Message.messageService = {
      _: 'messageService',
      pFlags: {
        is_single: true
      },
      id: appMessagesIdsManager.generateMessageId(maxMessageId, true),
      date: message.date,
      from_id: {_: 'peerUser', user_id: NULL_PEER_ID}/* message.from_id */,
      peer_id: message.peer_id,
      action: {
        _: 'messageActionDiscussionStarted'
      },
      reply_to: this.generateReplyHeader(message.id)
    };

    this.saveMessages([serviceStartMessage], {isOutgoing: true});
    this.threadsServiceMessagesIdsStorage[threadKey] = serviceStartMessage.mid;
  } 

  public getDiscussionMessage(peerId: PeerId, mid: number) {
    return apiManager.invokeApiSingle('messages.getDiscussionMessage', {
      peer: appPeersManager.getInputPeerById(peerId),
      msg_id: appMessagesIdsManager.getServerMessageId(mid)
    }).then(result => {
      appChatsManager.saveApiChats(result.chats);
      appUsersManager.saveApiUsers(result.users);
      this.saveMessages(result.messages);

      const message = this.filterMessages(result.messages[0] as Message.message, message => !!(message as Message.message).replies)[0] as Message.message;
      const threadKey = message.peerId + '_' + message.mid;

      this.generateThreadServiceStartMessage(message);
      
      const historyStorage = this.getHistoryStorage(message.peerId, message.mid);
      result.max_id = historyStorage.maxId = appMessagesIdsManager.generateMessageId(result.max_id) || 0;
      result.read_inbox_max_id = historyStorage.readMaxId = appMessagesIdsManager.generateMessageId(result.read_inbox_max_id ?? message.mid);
      result.read_outbox_max_id = historyStorage.readOutboxMaxId = appMessagesIdsManager.generateMessageId(result.read_outbox_max_id) || 0;

      this.threadsToReplies[threadKey] = peerId + '_' + mid;

      return message;
    });
  }

  private handleNewMessage(peerId: PeerId, mid: number) {
    if(this.newMessagesToHandle[peerId] === undefined) {
      this.newMessagesToHandle[peerId] = new Set();
    }

    this.newMessagesToHandle[peerId].add(mid);
    if(!this.newMessagesHandleTimeout) {
      this.newMessagesHandleTimeout = window.setTimeout(this.handleNewMessages, 0);
    }
  }

  private handleNewMessages = () => {
    clearTimeout(this.newMessagesHandleTimeout);
    this.newMessagesHandleTimeout = 0;

    rootScope.dispatchEvent('history_multiappend', this.newMessagesToHandle);
    this.newMessagesToHandle = {};
  };

  private handleNewDialogs = () => {
    let newMaxSeenId = 0;
    const obj = this.newDialogsToHandle;
    for(const peerId in obj) {
      const dialog = obj[peerId];
      if(!dialog) {
        this.reloadConversation(peerId.toPeerId());
        delete obj[peerId];
      } else {
        this.dialogsStorage.pushDialog(dialog);
        if(!appPeersManager.isChannel(peerId.toPeerId())) {
          newMaxSeenId = Math.max(newMaxSeenId, dialog.top_message || 0);
        }
      }
    }

    //this.log('after order:', this.dialogsStorage[0].map(d => d.peerId));

    if(newMaxSeenId !== 0) {
      this.incrementMaxSeenId(newMaxSeenId);
    }

    rootScope.dispatchEvent('dialogs_multiupdate', obj);
    this.newDialogsToHandle = {};
  };

  public scheduleHandleNewDialogs(peerId?: PeerId, dialog?: Dialog) {
    if(peerId !== undefined) {
      this.newDialogsToHandle[peerId] = dialog;
    }

    if(this.newDialogsHandlePromise) return this.newDialogsHandlePromise;
    return this.newDialogsHandlePromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
        this.newDialogsHandlePromise = undefined;
        this.handleNewDialogs();
      }, 0);
    });
  }

  public deleteMessages(peerId: PeerId, mids: number[], revoke?: boolean) {
    let promise: Promise<any>;

    const localMessageIds = mids.map(mid => appMessagesIdsManager.getServerMessageId(mid));

    if(peerId.isAnyChat() && appPeersManager.isChannel(peerId)) {
      const channelId = peerId.toChatId();
      const channel: Chat.channel = appChatsManager.getChat(channelId);
      if(!channel.pFlags.creator && !channel.admin_rights?.pFlags?.delete_messages) {
        mids = mids.filter((mid) => {
          const message = this.getMessageByPeer(peerId, mid);
          return !!message.pFlags.out;
        });

        if(!mids.length) {
          return;
        }
      }

      promise = apiManager.invokeApi('channels.deleteMessages', {
        channel: appChatsManager.getChannelInput(channelId),
        id: localMessageIds
      }).then((affectedMessages) => {
        apiUpdatesManager.processLocalUpdate({
          _: 'updateDeleteChannelMessages',
          channel_id: channelId,
          messages: mids,
          pts: affectedMessages.pts,
          pts_count: affectedMessages.pts_count
        });
      });
    } else {
      promise = apiManager.invokeApi('messages.deleteMessages', {
        revoke,
        id: localMessageIds
      }).then((affectedMessages) => {
        apiUpdatesManager.processLocalUpdate({
          _: 'updateDeleteMessages',
          messages: mids,
          pts: affectedMessages.pts,
          pts_count: affectedMessages.pts_count
        });
      });
    }

    return promise;
  }

  public readHistory(peerId: PeerId, maxId = 0, threadId?: number, force = false) {
    if(DO_NOT_READ_HISTORY) {
      return Promise.resolve();
    }

    // console.trace('start read')
    this.log('readHistory:', peerId, maxId, threadId);
    if(!this.getReadMaxIdIfUnread(peerId, threadId) && !force) {
      this.log('readHistory: isn\'t unread');
      return Promise.resolve();
    }

    const historyStorage = this.getHistoryStorage(peerId, threadId);

    if(historyStorage.triedToReadMaxId >= maxId) {
      return Promise.resolve();
    }

    let apiPromise: Promise<any>;
    if(threadId) {
      if(!historyStorage.readPromise) {
        apiPromise = apiManager.invokeApi('messages.readDiscussion', {
          peer: appPeersManager.getInputPeerById(peerId),
          msg_id: appMessagesIdsManager.getServerMessageId(threadId),
          read_max_id: appMessagesIdsManager.getServerMessageId(maxId)
        });
      }

      apiUpdatesManager.processLocalUpdate({
        _: 'updateReadChannelDiscussionInbox',
        channel_id: peerId.toChatId(),
        top_msg_id: threadId,
        read_max_id: maxId
      });
    } else if(appPeersManager.isChannel(peerId)) {
      if(!historyStorage.readPromise) {
        apiPromise = apiManager.invokeApi('channels.readHistory', {
          channel: appChatsManager.getChannelInput(peerId.toChatId()),
          max_id: appMessagesIdsManager.getServerMessageId(maxId)
        });
      }

      apiUpdatesManager.processLocalUpdate({
        _: 'updateReadChannelInbox',
        max_id: maxId,
        channel_id: peerId.toChatId(),
        still_unread_count: undefined,
        pts: undefined
      });
    } else {
      if(!historyStorage.readPromise) {
        apiPromise = apiManager.invokeApi('messages.readHistory', {
          peer: appPeersManager.getInputPeerById(peerId),
          max_id: appMessagesIdsManager.getServerMessageId(maxId)
        }).then((affectedMessages) => {
          apiUpdatesManager.processUpdateMessage({
            _: 'updateShort',
            update: {
              _: 'updatePts',
              pts: affectedMessages.pts,
              pts_count: affectedMessages.pts_count
            }
          });
        });
      }

      apiUpdatesManager.processLocalUpdate({
        _: 'updateReadHistoryInbox',
        max_id: maxId,
        peer: appPeersManager.getOutputPeer(peerId),
        still_unread_count: undefined,
        pts: undefined,
        pts_count: undefined
      });
    }

    appNotificationsManager.soundReset(appPeersManager.getPeerString(peerId));

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

  public fixDialogUnreadMentionsIfNoMessage(peerId: PeerId) {
    const dialog = this.getDialogOnly(peerId);
    if(dialog?.unread_mentions_count) {
      this.reloadConversation(peerId);
    }
  }

  public modifyCachedMentions(peerId: PeerId, mid: number, add: boolean) {
    const slicedArray = this.unreadMentions[peerId];
    if(!slicedArray) return;

    if(add) {
      if(slicedArray.first.isEnd(SliceEnd.Top)) {
        slicedArray.insertSlice([mid]);
      }
    } else {
      slicedArray.delete(mid);
    }
  }

  private fixUnreadMentionsCountIfNeeded(peerId: PeerId, slicedArray: SlicedArray) {
    const dialog = this.getDialogOnly(peerId);
    if(!slicedArray.length && dialog?.unread_mentions_count) {
      this.reloadConversation(peerId);
    }
  }

  public goToNextMention(peerId: PeerId) {
    /* this.getUnreadMentions(peerId, 1, 2, 0).then(messages => {
      console.log(messages);
    }); */

    const promise = this.goToNextMentionPromises[peerId];
    if(promise) {
      return promise;
    }

    const slicedArray = this.unreadMentions[peerId] ?? (this.unreadMentions[peerId] = new SlicedArray());
    const length = slicedArray.length;
    const isTopEnd = slicedArray.first.isEnd(SliceEnd.Top);
    if(!length && isTopEnd) {
      this.fixUnreadMentionsCountIfNeeded(peerId, slicedArray);
      return Promise.resolve();
    }

    let loadNextPromise = Promise.resolve();
    if(!isTopEnd && length < 25) {
      loadNextPromise = this.loadNextMentions(peerId);
    }

    return this.goToNextMentionPromises[peerId] = loadNextPromise.then(() => {
      const last = slicedArray.last;
      const mid = last && last[last.length - 1];
      if(mid) {
        slicedArray.delete(mid);
        rootScope.dispatchEvent('history_focus', {peerId, mid});
      } else {
        this.fixUnreadMentionsCountIfNeeded(peerId, slicedArray);
      }
    }).finally(() => {
      delete this.goToNextMentionPromises[peerId];
    });
  }

  public loadNextMentions(peerId: PeerId) {
    const slicedArray = this.unreadMentions[peerId];
    const maxId = slicedArray.first[0] || 1;

    const backLimit = 50;
    const add_offset = -backLimit;
    const limit = backLimit;
    return this.getUnreadMentions(peerId, maxId, add_offset, limit).then(messages => {
      this.mergeHistoryResult(slicedArray, messages, maxId === 1 ? 0 : maxId, limit, add_offset);
    });
  }

  public getUnreadMentions(peerId: PeerId, offsetId: number, add_offset: number, limit: number, maxId = 0, minId = 0) {
    return apiManager.invokeApiSingle('messages.getUnreadMentions', {
      peer: appPeersManager.getInputPeerById(peerId),
      offset_id: appMessagesIdsManager.getServerMessageId(offsetId),
      add_offset,
      limit,
      max_id: appMessagesIdsManager.getServerMessageId(maxId),
      min_id: appMessagesIdsManager.getServerMessageId(minId)
    }).then(messagesMessages => {
      assumeType<Exclude<MessagesMessages, MessagesMessages.messagesMessagesNotModified>>(messagesMessages);
      appUsersManager.saveApiUsers(messagesMessages.users);
      appChatsManager.saveApiChats(messagesMessages.chats);
      this.saveMessages(messagesMessages.messages);

      return messagesMessages;
    });
  }

  public readMessages(peerId: PeerId, msgIds: number[]) {
    if(DO_NOT_READ_HISTORY) {
      return Promise.resolve();
    }

    if(!msgIds.length) {
      return Promise.resolve();
    }

    msgIds = msgIds.map(mid => appMessagesIdsManager.getServerMessageId(mid));
    let promise: Promise<any>, update: Update.updateChannelReadMessagesContents | Update.updateReadMessagesContents;
    if(peerId.isAnyChat() && appPeersManager.isChannel(peerId)) {
      const channelId = peerId.toChatId();

      update = {
        _: 'updateChannelReadMessagesContents',
        channel_id: channelId,
        messages: msgIds
      };

      promise = apiManager.invokeApi('channels.readMessageContents', {
        channel: appChatsManager.getChannelInput(channelId),
        id: msgIds
      });
    } else {
      update = {
        _: 'updateReadMessagesContents',
        messages: msgIds,
        pts: undefined,
        pts_count: undefined
      };

      promise = apiManager.invokeApi('messages.readMessageContents', {
        id: msgIds
      }).then((affectedMessages) => {
        (update as Update.updateReadMessagesContents).pts = affectedMessages.pts;
        (update as Update.updateReadMessagesContents).pts_count = affectedMessages.pts_count;
        apiUpdatesManager.processLocalUpdate(update);
      });
    }

    apiUpdatesManager.processLocalUpdate(update);

    return promise;
  }

  public getHistoryStorage(peerId: PeerId, threadId?: number) {
    if(threadId) {
      //threadId = this.getLocalMessageId(threadId);
      if(!this.threadsStorage[peerId]) this.threadsStorage[peerId] = {};
      return this.threadsStorage[peerId][threadId] ?? (this.threadsStorage[peerId][threadId] = {count: null, history: new SlicedArray()});
    }

    return this.historiesStorage[peerId] ?? (this.historiesStorage[peerId] = {count: null, history: new SlicedArray()});
  }

  private getNotifyPeerSettings(peerId: PeerId) {
    return Promise.all([
      appNotificationsManager.getNotifyPeerTypeSettings(),
      appNotificationsManager.getNotifySettings(appPeersManager.getInputNotifyPeerById(peerId, true))
    ]).then(([_, peerTypeNotifySettings]) => {
      return {
        muted: appNotificationsManager.isPeerLocalMuted(peerId, true),
        peerTypeNotifySettings
      };
    });
  }

  private handleNotifications = () => {
    window.clearTimeout(this.notificationsHandlePromise);
    this.notificationsHandlePromise = 0;

    //var timeout = $rootScope.idle.isIDLE && StatusManager.isOtherDeviceActive() ? 30000 : 1000;
    //const timeout = 1000;

    for(const _peerId in this.notificationsToHandle) {
      const peerId = _peerId.toPeerId();
      if(rootScope.peerId === peerId && !rootScope.idle.isIDLE) {
        continue;
      }

      const notifyPeerToHandle = this.notificationsToHandle[peerId];
      this.getNotifyPeerSettings(peerId).then(({muted, peerTypeNotifySettings}) => {
        const topMessage = notifyPeerToHandle.topMessage;
        if(muted || !topMessage.pFlags.unread) {
          return;
        }

        //setTimeout(() => {
          if(topMessage.pFlags.unread) {
            this.notifyAboutMessage(topMessage, {
              fwdCount: notifyPeerToHandle.fwdCount,
              peerTypeNotifySettings
            });
          }
        //}, timeout);
      });
    }

    this.notificationsToHandle = {};
  };

  private onUpdateMessageId = (update: Update.updateMessageID) => {
    const randomId = update.random_id;
    const pendingData = this.pendingByRandomId[randomId];
    //this.log('AMM updateMessageID:', update, pendingData);
    if(pendingData) {
      const {peerId, tempId, threadId, storage} = pendingData;
      const mid = appMessagesIdsManager.generateMessageId(update.id);
      const message = this.getMessageFromStorage(storage, mid);
      if(!message.deleted) {
        [this.getHistoryStorage(peerId), threadId ? this.getHistoryStorage(peerId, threadId) : undefined]
        .filter(Boolean)
        .forEach(storage => {
          storage.history.delete(tempId);
        });

        this.finalizePendingMessageCallbacks(storage, tempId, message);
      } else {
        this.pendingByMessageId[mid] = randomId;
      }
    }
  };

  private onUpdateNewMessage = (update: Update.updateNewDiscussionMessage | Update.updateNewMessage | Update.updateNewChannelMessage) => {
    const message = update.message as MyMessage;
    const peerId = this.getMessagePeer(message);
    const storage = this.getMessagesStorage(peerId);
    const dialog = this.getDialogOnly(peerId);

    // * local update
    const isLocalThreadUpdate = update._ === 'updateNewDiscussionMessage';

    // * temporary save the message for info (peerId, reply mids...)
    this.saveMessages([message], {storage: new Map()});

    const threadKey = this.getThreadKey(message);
    const threadId = threadKey ? +threadKey.split('_')[1] : undefined;
    if(threadId && !isLocalThreadUpdate && this.threadsStorage[peerId] && this.threadsStorage[peerId][threadId]) {
      const update = {
        _: 'updateNewDiscussionMessage',
        message
      } as Update.updateNewDiscussionMessage;

      this.onUpdateNewMessage(update);
    }

    if(!dialog && !isLocalThreadUpdate) {
      let good = true;
      if(peerId.isAnyChat()) {
        good = appChatsManager.isInChat(peerId.toChatId());
      }

      if(good) {
        const set = this.newUpdatesAfterReloadToHandle[peerId] ?? (this.newUpdatesAfterReloadToHandle[peerId] = new Set());
        if(set.has(update)) {
          this.log.error('here we go again', peerId);
          return;
        }

        (update as any).ignoreExisting = true;
        set.add(update);
        this.scheduleHandleNewDialogs(peerId);
      }

      return;
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

    const pendingMessage = this.checkPendingMessage(message);
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
        historyStorage.count++;
      }
    }

    if(this.mergeReplyKeyboard(historyStorage, message)) {
      rootScope.dispatchEvent('history_reply_markup', {peerId});
    }

    const fromId = message.fromId;
    if(fromId.isUser() && !message.pFlags.out && message.from_id) {
      appUsersManager.forceUserOnline(fromId, message.date);

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
      } else if(appPeersManager.isChannel(peerId)) {
        update = {
          _: 'updateChannelUserTyping',
          action,
          channel_id: peerId.toChatId(),
          from_id: appPeersManager.getOutputPeer(fromId),
          top_msg_id: threadId ? appMessagesIdsManager.getServerMessageId(threadId) : undefined
        };
      } else {
        update = {
          _: 'updateChatUserTyping',
          action,
          chat_id: peerId.toChatId(),
          from_id: appPeersManager.getOutputPeer(fromId)
        };
      }

      apiUpdatesManager.processLocalUpdate(update);
    }

    if(!pendingMessage) {
      this.handleNewMessage(peerId, message.mid);
    }

    if(isLocalThreadUpdate) {
      return;
    }
    
    const inboxUnread = !message.pFlags.out && message.pFlags.unread;
    if(dialog) {
      if(inboxUnread && message.mid > dialog.top_message) {
        const releaseUnreadCount = this.dialogsStorage.prepareDialogUnreadCountModifying(dialog);

        ++dialog.unread_count;
        if(message.pFlags.mentioned) {
          ++dialog.unread_mentions_count;
          this.modifyCachedMentions(peerId, message.mid, true);
        }

        releaseUnreadCount();
      }

      if(message.mid >= dialog.top_message) {
        this.setDialogTopMessage(message, dialog);
      }
    }

    if(inboxUnread/*  && ($rootScope.selectedPeerID != peerID || $rootScope.idle.isIDLE) */) {
      const notifyPeer = peerId;
      let notifyPeerToHandle = this.notificationsToHandle[notifyPeer];
      if(notifyPeerToHandle === undefined) {
        notifyPeerToHandle = this.notificationsToHandle[notifyPeer] = {
          fwdCount: 0,
          fromId: NULL_PEER_ID
        };
      }

      if(notifyPeerToHandle.fromId !== fromId) {
        notifyPeerToHandle.fromId = fromId;
        notifyPeerToHandle.fwdCount = 0;
      }

      if((message as Message.message).fwd_from) {
        ++notifyPeerToHandle.fwdCount;
      }

      notifyPeerToHandle.topMessage = message;

      if(!this.notificationsHandlePromise) {
        this.notificationsHandlePromise = window.setTimeout(this.handleNotifications, 0);
      }
    }
  };

  private onUpdateMessageReactions = (update: Update.updateMessageReactions) => {
    const {peer, msg_id, reactions} = update;
    const mid = appMessagesIdsManager.generateMessageId(msg_id);
    const peerId = appPeersManager.getPeerId(peer);
    const message: MyMessage = this.getMessageByPeer(peerId, mid);

    if(message._ !== 'message') {
      return;
    }

    const recentReactions = reactions?.recent_reactions;
    if(recentReactions?.length && message.pFlags.out) {
      const recentReaction = recentReactions[recentReactions.length - 1];
      const previousReactions = message.reactions;
      const previousRecentReactions = previousReactions?.recent_reactions;
      if(
        appPeersManager.getPeerId(recentReaction.peer_id) !== rootScope.myId && (
          !previousRecentReactions ||
          previousRecentReactions.length <= recentReactions.length
        ) && (
          !previousRecentReactions || 
          !deepEqual(recentReaction, previousRecentReactions[previousRecentReactions.length - 1])
        )
      ) {
        this.getNotifyPeerSettings(peerId).then(({muted, peerTypeNotifySettings}) => {
          if(muted || !peerTypeNotifySettings.show_previews) return;
          this.notifyAboutMessage(message, {
            userReaction: recentReaction,
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
    //this.log('updateDialogUnreadMark', update);
    const peerId = appPeersManager.getPeerId((update.peer as DialogPeer.dialogPeer).peer);
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
      rootScope.dispatchEvent('dialogs_multiupdate', {[peerId]: dialog});
      this.dialogsStorage.setDialogToState(dialog);
    }
  };

  private onUpdateEditMessage = (update: Update.updateEditMessage | Update.updateEditChannelMessage) => {
    const message = update.message as MyMessage;
    const peerId = this.getMessagePeer(message);
    const mid = appMessagesIdsManager.generateMessageId(message.id);
    const storage = this.getMessagesStorage(peerId);
    if(!storage.has(mid)) {
      // this.fixDialogUnreadMentionsIfNoMessage(peerId);
      return;
    }

    // console.trace(dT(), 'edit message', message)
    
    const oldMessage: Message = this.getMessageFromStorage(storage, mid);
    this.saveMessages([message], {storage});
    const newMessage: Message = this.getMessageFromStorage(storage, mid);

    this.handleEditedMessage(oldMessage, newMessage);

    const dialog = this.getDialogOnly(peerId);

    // if sender erased mention
    /* if(dialog.unread_mentions_count && (oldMessage as Message.message)?.pFlags?.mentioned && !message.pFlags.mentioned) {
      --dialog.unread_mentions_count;
      this.modifyCachedMentions(peerId, mid, false);
    } */

    const isTopMessage = dialog && dialog.top_message === mid;
    if((message as Message.messageService).clear_history) {
      if(isTopMessage) {
        rootScope.dispatchEvent('dialog_flush', {peerId});
      }
    } else {
      // no sense in dispatching message_edit since only reactions have changed
      if(oldMessage?._ === 'message' && !deepEqual(oldMessage.reactions, (newMessage as Message.message).reactions)) {
        const newReactions = (newMessage as Message.message).reactions;
        (newMessage as Message.message).reactions = oldMessage.reactions;
        apiUpdatesManager.processLocalUpdate({
          _: 'updateMessageReactions',
          peer: appPeersManager.getOutputPeer(peerId),
          msg_id: message.id,
          reactions: newReactions
        });

        return;
      }

      rootScope.dispatchEvent('message_edit', {
        storage,
        peerId,
        mid
      });

      if(isTopMessage || (message as Message.message).grouped_id) {
        const updatedDialogs: {[peerId: PeerId]: Dialog} = {};
        updatedDialogs[peerId] = dialog;
        rootScope.dispatchEvent('dialogs_multiupdate', updatedDialogs);
        this.dialogsStorage.setDialogToState(dialog);
      }
    }
  };

  private onUpdateReadHistory = (update: Update.updateReadChannelDiscussionInbox | Update.updateReadChannelDiscussionOutbox 
    | Update.updateReadHistoryInbox | Update.updateReadHistoryOutbox 
    | Update.updateReadChannelInbox | Update.updateReadChannelOutbox) => {
    const channelId = (update as Update.updateReadChannelInbox).channel_id;
    const maxId = appMessagesIdsManager.generateMessageId((update as Update.updateReadChannelInbox).max_id || (update as Update.updateReadChannelDiscussionInbox).read_max_id);
    const threadId = appMessagesIdsManager.generateMessageId((update as Update.updateReadChannelDiscussionInbox).top_msg_id);
    const peerId = channelId ? channelId.toPeerId(true) : appPeersManager.getPeerId((update as Update.updateReadHistoryInbox).peer);

    const isOut = update._ === 'updateReadHistoryOutbox' || update._ === 'updateReadChannelOutbox' || update._ === 'updateReadChannelDiscussionOutbox' ? true : undefined;

    const storage = this.getMessagesStorage(peerId);
    const history = getObjectKeysAndSort(storage, 'desc');
    const foundDialog = this.getDialogOnly(peerId);
    const stillUnreadCount = (update as Update.updateReadChannelInbox).still_unread_count;
    let newUnreadCount = 0;
    let newUnreadMentionsCount = 0;
    let foundAffected = false;

    //this.log.warn(dT(), 'read', peerId, isOut ? 'out' : 'in', maxId)

    const historyStorage = this.getHistoryStorage(peerId, threadId);

    if(peerId.isUser() && isOut) {
      appUsersManager.forceUserOnline(peerId);
    }

    if(threadId) {
      const repliesKey = this.threadsToReplies[peerId + '_' + threadId];
      if(repliesKey) {
        const [peerId, mid] = repliesKey.split('_');
        this.updateMessage(peerId.toPeerId(), +mid, 'replies_updated');
      }
    }

    const releaseUnreadCount = !threadId && foundDialog && this.dialogsStorage.prepareDialogUnreadCountModifying(foundDialog);

    for(let i = 0, length = history.length; i < length; i++) {
      const mid = history[i];
      if(mid > maxId) {
        continue;
      }
      
      const message: MyMessage = storage.get(mid);

      if(message.pFlags.out !== isOut) {
        continue;
      }

      if(!message.pFlags.unread) {
        break;
      }

      if(threadId) {
        const replyTo = message.reply_to;
        if(!replyTo || (replyTo.reply_to_top_id || replyTo.reply_to_msg_id) !== threadId) {
          continue;
        }
      }
      
      // this.log.warn('read', messageId, message.pFlags.unread, message)
      if(message.pFlags.unread) {
        delete message.pFlags.unread;
        if(!foundAffected) {
          foundAffected = true;
        }

        if(!message.pFlags.out && !threadId && foundDialog) {
          if(stillUnreadCount === undefined) {
            newUnreadCount = --foundDialog.unread_count;
          }

          if(message.pFlags.mentioned) {
            newUnreadMentionsCount = --foundDialog.unread_mentions_count;
            this.modifyCachedMentions(peerId, message.mid, false);
          }
        }
        
        appNotificationsManager.cancel('msg' + mid);
      }
    }

    if(isOut) historyStorage.readOutboxMaxId = maxId;
    else historyStorage.readMaxId = maxId;

    if(!threadId && foundDialog) {
      if(isOut) foundDialog.read_outbox_max_id = maxId;
      else foundDialog.read_inbox_max_id = maxId;

      if(!isOut) {
        let setCount: number;
        if(stillUnreadCount !== undefined) {
          setCount = stillUnreadCount;
        } else if(newUnreadCount < 0 || !this.getReadMaxIdIfUnread(peerId)) {
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

      if(releaseUnreadCount) {
        releaseUnreadCount();
      }

      this.dialogsStorage.processDialogForFilters(foundDialog);
      
      rootScope.dispatchEvent('dialog_unread', {peerId});
      this.dialogsStorage.setDialogToState(foundDialog);
    }

    if(foundAffected) {
      rootScope.dispatchEvent('messages_read');
    }

    if(!threadId && channelId) {
      const threadKeyPart = peerId + '_';
      for(const threadKey in this.threadsToReplies) {
        if(threadKey.indexOf(threadKeyPart) === 0) {
          const [peerId, mid] = this.threadsToReplies[threadKey].split('_');
          rootScope.dispatchEvent('replies_updated', this.getMessageByPeer(peerId.toPeerId(), +mid));
        }
      }
    }
  };

  private onUpdateReadMessagesContents = (update: Update.updateChannelReadMessagesContents | Update.updateReadMessagesContents) => {
    const channelId = (update as Update.updateChannelReadMessagesContents).channel_id;
    const mids = (update as Update.updateReadMessagesContents).messages.map(id => appMessagesIdsManager.generateMessageId(id));
    const peerId = channelId ? channelId.toPeerId(true) : this.getMessageById(mids[0]).peerId;
    for(let i = 0, length = mids.length; i < length; ++i) {
      const mid = mids[i];
      const message: MyMessage = this.getMessageByPeer(peerId, mid);
      if(!message.deleted) {
        if(message.pFlags.media_unread) {
          delete message.pFlags.media_unread;
          this.setDialogToStateIfMessageIsTop(message);
  
          if(!message.pFlags.out && message.pFlags.mentioned) {
            this.modifyCachedMentions(peerId, mid, false);
          }
        }
      } else {
        this.fixDialogUnreadMentionsIfNoMessage(peerId);
      }
    }

    rootScope.dispatchEvent('messages_media_read', {peerId, mids});
  };

  private onUpdateChannelAvailableMessages = (update: Update.updateChannelAvailableMessages) => {
    const peerId = update.channel_id.toPeerId(true);
    const history = this.getHistoryStorage(peerId).history.slice;
    const availableMinId = appMessagesIdsManager.generateMessageId(update.available_min_id);
    const messages = history.filter(mid => mid <= availableMinId);

    (update as any as Update.updateDeleteChannelMessages).messages = messages;
    this.onUpdateDeleteMessages(update as any as Update.updateDeleteChannelMessages);
  };

  private onUpdateDeleteMessages = (update: Update.updateDeleteMessages | Update.updateDeleteChannelMessages) => {
    const channelId = (update as Update.updateDeleteChannelMessages).channel_id;
    //const messages = (update as any as Update.updateDeleteChannelMessages).messages;
    const messages = (update as any as Update.updateDeleteChannelMessages).messages.map(id => appMessagesIdsManager.generateMessageId(id));
    const peerId: PeerId = channelId ? channelId.toPeerId(true) : this.getMessageById(messages[0]).peerId;
    
    if(!peerId) {
      return;
    }

    apiManager.clearCache('messages.getSearchCounters', (params) => {
      return appPeersManager.getPeerId(params.peer) === peerId;
    });

    const threadKeys: Set<string> = new Set();
    for(const mid of messages) {
      const message = this.getMessageByPeer(peerId, mid);
      const threadKey = this.getThreadKey(message);
      if(threadKey && this.threadsStorage[peerId] && this.threadsStorage[peerId][+threadKey.split('_')[1]]) {
        threadKeys.add(threadKey);
      }
    }
    
    const historyUpdated = this.handleDeletedMessages(peerId, this.getMessagesStorage(peerId), messages);

    const threadsStorages = Array.from(threadKeys).map(threadKey => {
      const [peerId, mid] = threadKey.split('_');
      return this.getHistoryStorage(peerId.toPeerId(), +mid);
    });

    const historyStorage = this.getHistoryStorage(peerId);
    [historyStorage].concat(threadsStorages).forEach(historyStorage => {
      for(const mid of historyUpdated.msgs) {
        historyStorage.history.delete(mid);
      }
      
      if(historyUpdated.count && historyStorage.count) {
        historyStorage.count = Math.max(0, historyStorage.count - historyUpdated.count);
      }
    });

    rootScope.dispatchEvent('history_delete', {peerId, msgs: historyUpdated.msgs});

    const foundDialog = this.getDialogOnly(peerId);
    if(foundDialog) {
      const affected = historyUpdated.unreadMentions || historyUpdated.unread;
      const releaseUnreadCount = affected && this.dialogsStorage.prepareDialogUnreadCountModifying(foundDialog);
      
      if(historyUpdated.unread) {
        foundDialog.unread_count = Math.max(0, foundDialog.unread_count - historyUpdated.unread);
      }

      if(historyUpdated.unreadMentions) {
        foundDialog.unread_mentions_count = !foundDialog.unread_count ? 0 : Math.max(0, foundDialog.unread_mentions_count - historyUpdated.unreadMentions);
      }

      if(affected) {
        releaseUnreadCount();
        rootScope.dispatchEvent('dialog_unread', {peerId});
      }

      if(historyUpdated.msgs.has(foundDialog.top_message)) {
        const slice = historyStorage.history.first;
        if(slice.isEnd(SliceEnd.Bottom) && slice.length) {
          const mid = slice[0];
          const message = this.getMessageByPeer(peerId, mid);
          this.setDialogTopMessage(message, foundDialog);
        } else {
          this.reloadConversation(peerId);
        }
      }
    }
  };

  private onUpdateChannel = (update: Update.updateChannel) => {
    const channelId = update.channel_id;
    const peerId = channelId.toPeerId(true);
    const channel: Chat.channel = appChatsManager.getChat(channelId);

    const needDialog = appChatsManager.isInChat(channelId);
    
    const canViewHistory = !!channel.username || !channel.pFlags.left;
    const hasHistory = this.historiesStorage[peerId] !== undefined;
    
    if(canViewHistory !== hasHistory) {
      delete this.historiesStorage[peerId];
      rootScope.dispatchEvent('history_forbidden', peerId);
    }
    
    const dialog = this.getDialogOnly(peerId);
    if(!!dialog !== needDialog) {
      if(needDialog) {
        this.reloadConversation(peerId);
      } else {
        this.dialogsStorage.dropDialogOnDeletion(peerId);
      }
    }

    rootScope.dispatchEvent('channel_update', channelId);
  };

  private onUpdateChannelReload = (update: Update.updateChannelReload) => {
    const peerId = update.channel_id.toPeerId(true);

    this.dialogsStorage.dropDialog(peerId);

    delete this.historiesStorage[peerId];
    this.reloadConversation(peerId).then(() => {
      rootScope.dispatchEvent('history_reload', peerId);
    });
  };
  
  private onUpdateChannelMessageViews = (update: Update.updateChannelMessageViews) => {
    const views = update.views;
    const peerId = update.channel_id.toPeerId(true);
    const mid = appMessagesIdsManager.generateMessageId(update.id);
    const message: Message.message = this.getMessageByPeer(peerId, mid);
    if(!message.deleted && message.views !== undefined && message.views < views) {
      message.views = views;
      this.pushBatchUpdate('messages_views', this.batchUpdateViews, message.peerId + '_' + message.mid);
      this.setDialogToStateIfMessageIsTop(message);
    }
  };

  private onUpdateServiceNotification = (update: Update.updateServiceNotification) => {
    //this.log('updateServiceNotification', update);
    const fromId = SERVICE_PEER_ID;
    const peerId = fromId;
    const messageId = this.generateTempMessageId(peerId);
    const message: Message.message = {
      _: 'message',
      id: messageId,
      from_id: appPeersManager.getOutputPeer(fromId),
      peer_id: appPeersManager.getOutputPeer(peerId),
      pFlags: {unread: true},
      date: (update.inbox_date || tsNow(true)) + serverTimeManager.serverTimeOffset,
      message: update.message,
      media: update.media,
      entities: update.entities
    };
    if(!appUsersManager.hasUser(fromId)) {
      appUsersManager.saveApiUsers([{
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
    const peerId = channelId ? channelId.toPeerId(true) : appPeersManager.getPeerId((update as Update.updatePinnedMessages).peer);

    /* const storage = this.getSearchStorage(peerId, 'inputMessagesFilterPinned');
    if(storage.count !== storage.history.length) {
      if(storage.count !== undefined) {
        delete this.searchesStorage[peerId]['inputMessagesFilterPinned'];  
      }

      rootScope.broadcast('peer_pinned_messages', peerId);
      break;
    } */

    const messages = update.messages.map(id => appMessagesIdsManager.generateMessageId(id)); 

    const storage = this.getMessagesStorage(peerId);
    const missingMessages = messages.filter(mid => !storage.has(mid));
    const getMissingPromise = missingMessages.length ? Promise.all(missingMessages.map(mid => this.wrapSingleMessage(peerId, mid))) : Promise.resolve();
    getMissingPromise.finally(() => {
      const werePinned = update.pFlags?.pinned;
      if(werePinned) {
        for(const mid of messages) {
          //storage.history.push(mid);
          const message = storage.get(mid);
          message.pFlags.pinned = true;
        }

        /* if(this.pinnedMessages[peerId]?.maxId) {
          const maxMid = Math.max(...messages);
          this.pinnedMessages
        } */

        //storage.history.sort((a, b) => b - a);
      } else {
        for(const mid of messages) {
          //storage.history.findAndSplice(_mid => _mid === mid);
          const message = storage.get(mid);
          delete message.pFlags.pinned;
        }
      }

      /* const info = this.pinnedMessages[peerId];
      if(info) {
        info.count += messages.length * (werePinned ? 1 : -1);
      } */
  
      delete this.pinnedMessages[peerId];
      appStateManager.getState().then(state => {
        delete state.hiddenPinnedMessages[peerId];
        rootScope.dispatchEvent('peer_pinned_messages', {peerId, mids: messages, pinned: werePinned});
      });
    });
  };

  private onUpdateNotifySettings = (update: Update.updateNotifySettings) => {
    const {peer, notify_settings} = update;
    if(peer._ === 'notifyPeer') {
      const peerId = appPeersManager.getPeerId((peer as NotifyPeer.notifyPeer).peer);
    
      const dialog = this.getDialogOnly(peerId);
      if(dialog) {
        dialog.notify_settings = notify_settings;
        rootScope.dispatchEvent('dialog_notify_settings', dialog);
        this.dialogsStorage.setDialogToState(dialog);
      }
    }
  };

  private onUpdateNewScheduledMessage = (update: Update.updateNewScheduledMessage) => {
    const message = update.message as MyMessage;
    const peerId = this.getMessagePeer(message);

    const storage = this.scheduledMessagesStorage[peerId];
    if(storage) {
      const mid = appMessagesIdsManager.generateMessageId(message.id);

      const oldMessage = this.getMessageFromStorage(storage, mid);
      this.saveMessages([message], {storage, isScheduled: true});
      const newMessage = this.getMessageFromStorage(storage, mid);

      if(!oldMessage.deleted) {
        this.handleEditedMessage(oldMessage, newMessage);
        rootScope.dispatchEvent('message_edit', {storage, peerId, mid: message.mid});
      } else {
        const pendingMessage = this.checkPendingMessage(message);
        if(!pendingMessage) {
          rootScope.dispatchEvent('scheduled_new', {peerId, mid: message.mid});
        }
      }
    }
  };

  private onUpdateDeleteScheduledMessages = (update: Update.updateDeleteScheduledMessages) => {
    const peerId = appPeersManager.getPeerId(update.peer);

    const storage = this.scheduledMessagesStorage[peerId];
    if(storage) {
      const mids = update.messages.map(id => appMessagesIdsManager.generateMessageId(id));
      this.handleDeletedMessages(peerId, storage, mids);

      rootScope.dispatchEvent('scheduled_delete', {peerId, mids});
    }
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
    if(threadMessage.peerId?.isAnyChat() && threadMessage.reply_to) {
      const threadId = threadMessage.reply_to.reply_to_top_id || threadMessage.reply_to.reply_to_msg_id;
      threadKey = threadMessage.peerId + '_' + threadId;
    }

    return threadKey;
  }

  public updateMessage(peerId: PeerId, mid: number, broadcastEventName?: 'replies_updated'): Promise<Message.message> {
    const promise: Promise<Message.message> = this.wrapSingleMessage(peerId, mid, true).then(() => {
      const message = this.getMessageByPeer(peerId, mid);

      if(broadcastEventName) {
        rootScope.dispatchEvent(broadcastEventName, message);
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
        rootScope.dispatchEvent('history_update', {storage: pendingData.storage, peerId: message.peerId, mid: message.mid});
      }

      delete this.pendingByMessageId[message.mid];
    }

    return pendingMessage;
  }

  public mutePeer(peerId: PeerId, muteUntil: number) {
    const settings: InputPeerNotifySettings = {
      _: 'inputPeerNotifySettings'
    };

    settings.mute_until = muteUntil;

    return appNotificationsManager.updateNotifySettings({
      _: 'inputNotifyPeer',
      peer: appPeersManager.getInputPeerById(peerId)
    }, settings);
  }

  public togglePeerMute(peerId: PeerId, mute?: boolean) {
    if(mute === undefined) {
      mute = !appNotificationsManager.isPeerLocalMuted(peerId, false);
    }

    return this.mutePeer(peerId, mute ? MUTE_UNTIL : 0);
  }

  public canSendToPeer(peerId: PeerId, threadId?: number, action: ChatRights = 'send_messages') {
    if(appPeersManager.isRestricted(peerId)) {
      return false;
    }
    
    if(peerId.isAnyChat()) {
      //const isChannel = appPeersManager.isChannel(peerId);
      const chat: Chat.chat = appChatsManager.getChat(peerId.toChatId());
      const hasRights = /* isChannel &&  */appChatsManager.hasRights(peerId.toChatId(), action, undefined, !!threadId); 
      return /* !isChannel ||  */hasRights && (!chat.pFlags.left || !!threadId);
    } else {
      return appUsersManager.canSendToUser(peerId);
    }
  }

  public finalizePendingMessage(randomId: Long, finalMessage: MyMessage) {
    const pendingData = this.pendingByRandomId[randomId];
    // this.log('pdata', randomID, pendingData)

    if(pendingData) {
      const {peerId, tempId, threadId, storage} = pendingData;

      [this.getHistoryStorage(peerId), threadId ? this.getHistoryStorage(peerId, threadId) : undefined]
      .filter(Boolean)
      .forEach(storage => {
        storage.history.delete(tempId);
      });

      // this.log('pending', randomID, historyStorage.pending)

      const tempMessage: MyMessage = this.getMessageFromStorage(storage, tempId);
      if(!tempMessage.deleted) {
        delete finalMessage.pFlags.is_outgoing;
        delete finalMessage.pending;
        delete finalMessage.error;
        delete finalMessage.random_id;
        delete finalMessage.send;
      }

      rootScope.dispatchEvent('messages_pending');
      
      delete this.pendingByRandomId[randomId];

      this.finalizePendingMessageCallbacks(storage, tempId, finalMessage);

      return tempMessage;
    }
  }

  public finalizePendingMessageCallbacks(storage: MessagesStorage, tempId: number, message: MyMessage) {
    const callbacks = this.tempFinalizeCallbacks[tempId];
    //this.log.warn(callbacks, tempId);
    if(callbacks !== undefined) {
      for(const name in callbacks) {
        const {deferred, callback} = callbacks[name];
        //this.log(`finalizePendingMessageCallbacks: will invoke ${name} callback`);
        callback(message).then(deferred.resolve, deferred.reject);
      }

      delete this.tempFinalizeCallbacks[tempId];
    }

    // set cached url to media
    if((message as Message.message).media) {
      assumeType<Message.message>(message);
      const {photo: newPhoto, document: newDoc} = message.media as any;
      if(newPhoto) {
        const photo = appPhotosManager.getPhoto('' + tempId);
        if(/* photo._ !== 'photoEmpty' */photo) {
          const newPhotoSize = newPhoto.sizes[newPhoto.sizes.length - 1];
          const cacheContext = appDownloadManager.getCacheContext(newPhoto, newPhotoSize.type);
          const oldCacheContext = appDownloadManager.getCacheContext(photo, 'full');
          Object.assign(cacheContext, oldCacheContext);

          const photoSize = newPhoto.sizes[newPhoto.sizes.length - 1] as PhotoSize.photoSize;

          const downloadOptions = appPhotosManager.getPhotoDownloadOptions(newPhoto, photoSize);
          const fileName = getFileNameByLocation(downloadOptions.location);
          appDownloadManager.fakeDownload(fileName, oldCacheContext.url);
        }
      } else if(newDoc) {
        const doc = appDocsManager.getDoc('' + tempId);
        if(doc) {
          if(/* doc._ !== 'documentEmpty' &&  */doc.type && doc.type !== 'sticker' && doc.mime_type !== 'image/gif') {
            const cacheContext = appDownloadManager.getCacheContext(newDoc);
            const oldCacheContext = appDownloadManager.getCacheContext(doc);
            Object.assign(cacheContext, oldCacheContext);

            const fileName = appDocsManager.getInputFileName(newDoc);
            appDownloadManager.fakeDownload(fileName, oldCacheContext.url);
          }
        }
      } else if((message.media as MessageMedia.messageMediaPoll).poll) {
        delete appPollsManager.polls[tempId];
        delete appPollsManager.results[tempId];
      }
    }

    const tempMessage = this.getMessageFromStorage(storage, tempId);
    storage.delete(tempId);
    
    this.handleReleasingMessage(tempMessage, storage);

    rootScope.dispatchEvent('message_sent', {storage, tempId, tempMessage, mid: message.mid, message});
  }

  public incrementMaxSeenId(maxId: number) {
    if(!maxId || !(!this.maxSeenId || maxId > this.maxSeenId)) {
      return false;
    }

    this.maxSeenId = maxId;
    appStateManager.pushToState('maxSeenMsgId', maxId);

    apiManager.invokeApi('messages.receivedMessages', {
      max_id: appMessagesIdsManager.getServerMessageId(maxId)
    });
  }

  public getMessageReactionsListAndReadParticipants(
    message: Message.message, 
    limit?: number, 
    reaction?: string, 
    offset?: string,
    skipReadParticipants?: boolean,
    skipReactionsList?: boolean
  ) {
    const emptyMessageReactionsList = {
      reactions: [] as MessagePeerReaction[],
      count: 0,
      next_offset: undefined as string
    };

    const canViewMessageReadParticipants = this.canViewMessageReadParticipants(message);
    if(canViewMessageReadParticipants && limit === undefined) {
      limit = 100;
    } else if(limit === undefined) {
      limit = 50;
    }

    return Promise.all([
      canViewMessageReadParticipants && !reaction && !skipReadParticipants ? this.getMessageReadParticipants(message.peerId, message.mid).catch(() => [] as UserId[]) : [] as UserId[],

      message.reactions?.recent_reactions?.length && !skipReactionsList ? appReactionsManager.getMessageReactionsList(message.peerId, message.mid, limit, reaction, offset).catch(err => emptyMessageReactionsList) : emptyMessageReactionsList
    ]).then(([userIds, messageReactionsList]) => {
      const readParticipantsPeerIds = userIds.map(userId => userId.toPeerId());
      
      const filteredReadParticipants = readParticipantsPeerIds.slice();
      forEachReverse(filteredReadParticipants, (peerId, idx, arr) => {
        if(messageReactionsList.reactions.some(reaction => appPeersManager.getPeerId(reaction.peer_id) === peerId)) {
          arr.splice(idx, 1);
        }
      });

      let combined: {peerId: PeerId, reaction?: string}[] = messageReactionsList.reactions.map(reaction => ({peerId: appPeersManager.getPeerId(reaction.peer_id), reaction: reaction.reaction}));
      combined = combined.concat(filteredReadParticipants.map(readPeerId => ({peerId: readPeerId})));
      
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
    return apiManager.invokeApiSingle('messages.getMessageReadParticipants', {
      peer: appPeersManager.getInputPeerById(peerId),
      msg_id: appMessagesIdsManager.getServerMessageId(mid)
    }).then(userIds => { // ! convert long to number
      return userIds.map(userId => userId.toUserId());
    });
  }

  public canViewMessageReadParticipants(message: Message) {
    if(
      message._ !== 'message' || 
      message.pFlags.is_outgoing || 
      !message.pFlags.out || 
      !appPeersManager.isAnyGroup(message.peerId)
    ) {
      return false;
    }

    const chat: Chat.chat | Chat.channel = appChatsManager.getChat(message.peerId.toChatId());
    return chat.participants_count < rootScope.appConfig.chat_read_mark_size_threshold && 
      (tsNow(true) - message.date) < rootScope.appConfig.chat_read_mark_expire_period;
  }

  public incrementMessageViews(peerId: PeerId, mids: number[]) {
    if(!mids.length) {
      return;
    }

    return apiManager.invokeApiSingle('messages.getMessagesViews', {
      peer: appPeersManager.getInputPeerById(peerId),
      id: mids.map(mid => appMessagesIdsManager.getServerMessageId(mid)),
      increment: true
    }).then(views => {
      const updates: Update[] = new Array(mids.length);
      const channelId = peerId.toChatId();
      for(let i = 0, length = mids.length; i < length; ++i) {
        updates[i] = {
          _: 'updateChannelMessageViews',
          channel_id: channelId,
          id: mids[i],
          views: views.views[i].views
        };
      }

      apiUpdatesManager.processUpdateMessage({
        _: 'updates',
        updates,
        chats: views.chats,
        users: views.users
      });
    });
  }

  private notifyAboutMessage(message: MyMessage, options: Partial<{
    fwdCount: number,
    userReaction: MessagePeerReaction,
    peerTypeNotifySettings: PeerNotifySettings
  }> = {}) {
    const peerId = this.getMessagePeer(message);

    if(appPeersManager.isRestricted(peerId)) {
      return;
    }

    const isAnyChat = peerId.isAnyChat();
    const notification: NotifyOptions = {};
    const peerString = appPeersManager.getPeerString(peerId);
    let notificationMessage: string;

    if(options.peerTypeNotifySettings.show_previews) {
      if(message._ === 'message' && message.fwd_from && options.fwdCount) {
        notificationMessage = I18n.format('Notifications.Forwarded', true, [options.fwdCount]);
      } else {
        notificationMessage = this.wrapMessageForReply(message, undefined, undefined, true);

        if(options.userReaction) {
          const langPackKey: LangPackKey = /* isAnyChat ? 'Notification.Group.Reacted' :  */'Notification.Contact.Reacted';
          const args: FormatterArguments = [
            RichTextProcessor.fixEmoji(options.userReaction.reaction), // can be plain heart
            notificationMessage
          ];
  
          /* if(isAnyChat) {
            args.unshift(appPeersManager.getPeerTitle(message.fromId, true));
          } */
  
          notificationMessage = I18n.format(langPackKey, true, args);
        }
      }
    } else {
      notificationMessage = I18n.format('Notifications.New', true);
    }

    notification.title = appPeersManager.getPeerTitle(peerId, true);
    if(isAnyChat && message.fromId !== message.peerId) {
      notification.title = appPeersManager.getPeerTitle(message.fromId, true) +
        ' @ ' +
        notification.title;
    }

    notification.title = RichTextProcessor.wrapPlainText(notification.title);

    notification.onclick = () => {
      rootScope.dispatchEvent('history_focus', {peerId, mid: message.mid});
    };

    notification.message = notificationMessage;
    notification.key = 'msg' + message.mid;
    notification.tag = peerString;
    notification.silent = true;//message.pFlags.silent || false;

    const peerPhoto = appPeersManager.getPeerPhoto(peerId);
    if(peerPhoto) {
      appAvatarsManager.loadAvatar(peerId, peerPhoto, 'photo_small').loadPromise.then(url => {
        if(message.pFlags.unread || options.userReaction) {
          notification.image = url;
          appNotificationsManager.notify(notification);
        }
      });
    } else {
      appNotificationsManager.notify(notification);
    }
  }

  public getScheduledMessagesStorage(peerId: PeerId) {
    return this.scheduledMessagesStorage[peerId] ?? (this.scheduledMessagesStorage[peerId] = this.createMessageStorage());
  }

  public getScheduledMessageByPeer(peerId: PeerId, mid: number) {
    return this.getMessageFromStorage(this.getScheduledMessagesStorage(peerId), mid);
  }

  public getScheduledMessages(peerId: PeerId): Promise<number[]> {
    if(!this.canSendToPeer(peerId)) return Promise.resolve([]);

    const storage = this.getScheduledMessagesStorage(peerId);
    if(storage.size) {
      return Promise.resolve([...storage.keys()]);
    }

    return apiManager.invokeApiSingle('messages.getScheduledHistory', {
      peer: appPeersManager.getInputPeerById(peerId),
      hash: ''
    }).then(historyResult => {
      if(historyResult._ !== 'messages.messagesNotModified') {
        appUsersManager.saveApiUsers(historyResult.users);
        appChatsManager.saveApiChats(historyResult.chats);
        
        const storage = this.getScheduledMessagesStorage(peerId);
        this.saveMessages(historyResult.messages, {storage, isScheduled: true});
        return [...storage.keys()];
      }
      
      return [];
    });
  }

  public sendScheduledMessages(peerId: PeerId, mids: number[]) {
    return apiManager.invokeApi('messages.sendScheduledMessages', {
      peer: appPeersManager.getInputPeerById(peerId),
      id: mids.map(mid => appMessagesIdsManager.getServerMessageId(mid))
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public deleteScheduledMessages(peerId: PeerId, mids: number[]) {
    return apiManager.invokeApi('messages.deleteScheduledMessages', {
      peer: appPeersManager.getInputPeerById(peerId),
      id: mids.map(mid => appMessagesIdsManager.getServerMessageId(mid))
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public getMessageWithReplies(message: Message.message) {
    if(message.peerId !== REPLIES_PEER_ID) {
      message = this.filterMessages(message, message => !!(message as Message.message).replies)[0] as any;
      if(!(message && message.replies && message.replies.pFlags.comments && message.replies.channel_id !== '777')) {
        return;
      }
    }

    return message;
  }

  public isFetchIntervalNeeded(peerId: PeerId) {
    return peerId.isAnyChat() && !appChatsManager.isInChat(peerId.toChatId());
  }

  public isRestricted(message: Message.message) {
    return !!(message.restriction_reason && isRestricted(message.restriction_reason));
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
    let historyResult = this.getHistory(peerId, slice[0] ?? 1, 0, 50, threadId);
    if(historyResult instanceof Promise) {
      historyResult = await historyResult;
    }

    for(let i = 0, length = historyResult.history.length; i < length; ++i) {
      this.handleNewMessage(peerId, historyResult.history[i]);
    }

    return historyStorage;
  }

  /**
   * * https://core.telegram.org/api/offsets, offset_id is inclusive
   */
  public getHistory(peerId: PeerId, maxId = 0, limit: number, backLimit?: number, threadId?: number): Promise<HistoryResult> | HistoryResult {
    const historyStorage = this.getHistoryStorage(peerId, threadId);

    if(appPeersManager.isRestricted(peerId)) {
      const first = historyStorage.history.first;
      first.setEnd(SliceEnd.Both);

      const slice = first.slice(0, 0);
      slice.setEnd(SliceEnd.Both);
      
      return {
        count: 0,
        history: slice,
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

        const history = (historyResult.messages as MyMessage[]).map(message => message.mid);
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
        history: haveSlice.slice,
        offsetIdOffset: haveSlice.offsetIdOffset
      }; 
    }

    return this.fillHistoryStorage(peerId, maxId, limit, offset, historyStorage, threadId).then(() => {
      const slice = historyStorage.history.sliceMe(maxId, offset, limit);
      return {
        count: historyStorage.count,
        history: slice?.slice || historyStorage.history.constructSlice(),
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

  public mergeHistoryResult(slicedArray: SlicedArray, 
    historyResult: Parameters<AppMessagesManager['isHistoryResultEnd']>[0], 
    offset_id: number, 
    limit: number, 
    add_offset: number) {
    const {messages} = historyResult as MessagesMessages.messagesMessagesSlice;
    const isEnd = this.isHistoryResultEnd(historyResult, limit, add_offset);
    const {count, offsetIdOffset, isTopEnd, isBottomEnd} = isEnd;
    const mids = messages.map((message) => {
      return (message as MyMessage).mid;
    });

    // * add bound manually. 
    // * offset_id will be inclusive only if there is 'add_offset' <= -1 (-1 - will only include the 'offset_id')
    // * check that offset_id is not 0
    if(offset_id && appMessagesIdsManager.getServerMessageId(offset_id) && !mids.includes(offset_id) && offsetIdOffset < count) {
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
          rootScope.dispatchEvent('history_reply_markup', {peerId});
        }
      }

      if(isBottomEnd) {
        historyStorage.maxId = slice[0]; // ! WARNING
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
    //console.trace('requestHistory', peerId, maxId, limit, offset);

    //rootScope.broadcast('history_request');

    const options: any = {
      peer: appPeersManager.getInputPeerById(peerId),
      offset_id: appMessagesIdsManager.getServerMessageId(maxId) || 0,
      offset_date: offsetDate,
      add_offset: offset,
      limit,
      max_id: 0,
      min_id: 0,
      hash: 0
    };

    if(threadId) {
      options.msg_id = appMessagesIdsManager.getServerMessageId(threadId) || 0;
    }

    const promise: ReturnType<AppMessagesManager['requestHistory']> = apiManager.invokeApiSingle(threadId ? 'messages.getReplies' : 'messages.getHistory', options, {
      //timeout: APITIMEOUT,
      noErrorBox: true
    }) as any;

    return promise.then((historyResult) => {
      if(DEBUG) {
        this.log('requestHistory result:', peerId, historyResult, maxId, limit, offset);
      }

      appUsersManager.saveApiUsers(historyResult.users);
      appChatsManager.saveApiChats(historyResult.chats);
      this.saveMessages(historyResult.messages);

      if(appPeersManager.isChannel(peerId)) {
        apiUpdatesManager.addChannelState(peerId.toChatId(), (historyResult as MessagesMessages.messagesChannelMessages).pts);
      }

      let length = historyResult.messages.length, count = (historyResult as MessagesMessages.messagesMessagesSlice).count;
      if(length && historyResult.messages[length - 1].deleted) {
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
      switch (error.type) {
        case 'CHANNEL_PRIVATE':
          let channel = appChatsManager.getChat(peerId.toChatId());
          channel = {_: 'channelForbidden', access_hash: channel.access_hash, title: channel.title};
          apiUpdatesManager.processUpdateMessage({
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

    return this.fetchSingleMessagesPromise = new Promise((resolve) => {
      setTimeout(() => {
        const requestPromises: Promise<void>[] = [];
        
        for(const [peerId, map] of this.needSingleMessages) {
          const mids = [...map.keys()];
          const msgIds: InputMessage[] = mids.map((mid) => {
            return {
              _: 'inputMessageID',
              id: appMessagesIdsManager.getServerMessageId(mid)
            };
          });
    
          let promise: Promise<MethodDeclMap['channels.getMessages']['res'] | MethodDeclMap['messages.getMessages']['res']>;
          if(peerId.isAnyChat() && appPeersManager.isChannel(peerId)) {
            promise = apiManager.invokeApiSingle('channels.getMessages', {
              channel: appChatsManager.getChannelInput(peerId.toChatId()),
              id: msgIds
            });
          } else {
            promise = apiManager.invokeApiSingle('messages.getMessages', {
              id: msgIds
            });
          }

          const after = promise.then(getMessagesResult => {
            assumeType<Exclude<MessagesMessages.messagesMessages, MessagesMessages.messagesMessagesNotModified>>(getMessagesResult);

            appUsersManager.saveApiUsers(getMessagesResult.users);
            appChatsManager.saveApiChats(getMessagesResult.chats);
            this.saveMessages(getMessagesResult.messages);

            for(let i = 0; i < getMessagesResult.messages.length; ++i) {
              const message = getMessagesResult.messages[i];
              const mid = appMessagesIdsManager.generateMessageId(message.id);
              const promise = map.get(mid);
              promise.resolve(getMessagesResult.messages[i]);
              map.delete(mid);
            }

            if(map.size) {
              for(const [mid, promise] of map) {
                promise.resolve(this.generateEmptyMessage(mid));
              }
            }
          }).finally(() => {
            rootScope.dispatchEvent('messages_downloaded', {peerId, mids});
          });
    
          requestPromises.push(after);
        }

        this.needSingleMessages.clear();

        Promise.all(requestPromises).finally(() => {
          this.fetchSingleMessagesPromise = null;
          if(this.needSingleMessages.size) this.fetchSingleMessages();
          resolve();
        });
      }, 0);
    });
  }

  public wrapSingleMessage(peerId: PeerId, mid: number, overwrite = false): Promise<Message> {
    const message = this.getMessageByPeer(peerId, mid);
    if(!message.deleted && !overwrite) {
      rootScope.dispatchEvent('messages_downloaded', {peerId, mids: [mid]});
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

  public fetchMessageReplyTo(message: MyMessage): Promise<Message> {
    if(!message.reply_to_mid) return Promise.resolve(this.generateEmptyMessage(0));
    const replyToPeerId = message.reply_to.reply_to_peer_id ? appPeersManager.getPeerId(message.reply_to.reply_to_peer_id) : message.peerId;
    return this.wrapSingleMessage(replyToPeerId, message.reply_to_mid).then(originalMessage => {
      if(originalMessage.deleted) { // ! чтобы не пыталось бесконечно загрузить удалённое сообщение
        delete message.reply_to_mid; // ! WARNING!
      }

      return originalMessage;
    });
  }

  public setTyping(peerId: PeerId, action: SendMessageAction, force?: boolean): Promise<boolean> {
    let typing = this.typings[peerId];
    if(!rootScope.myId || 
      !peerId || 
      !this.canSendToPeer(peerId) || 
      peerId === rootScope.myId ||
      // (!force && deepEqual(typing?.action, action))
      (!force && typing?.action?._ === action._)
    ) {
      return Promise.resolve(false);
    }

    if(typing?.timeout) {
      clearTimeout(typing.timeout);
    }

    typing = this.typings[peerId] = {
      action
    };

    return apiManager.invokeApi('messages.setTyping', {
      peer: appPeersManager.getInputPeerById(peerId),
      action
    }).finally(() => {
      if(typing === this.typings[peerId]) {
        typing.timeout = window.setTimeout(() => {
          delete this.typings[peerId];
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
        referenceDatabase.deleteContext(smth.file_reference, {type: 'message', peerId: message.peerId, messageId: message.mid});
      }

      if('webpage' in media && media.webpage) {
        const isScheduled = this.getScheduledMessagesStorage(message.peerId) === storage;
        const messageKey = appWebPagesManager.getMessageKeyForPendingWebPage(message.peerId, message.mid, isScheduled);
        appWebPagesManager.deleteWebPageFromPending(media.webpage, messageKey);
      }

      if((media as MessageMedia.messageMediaPoll).poll) {
        appPollsManager.updatePollToMessage(message as Message.message, false);
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
      if(message.deleted) {
        this.fixDialogUnreadMentionsIfNoMessage(peerId);
        continue;
      }

      this.handleReleasingMessage(message, storage);

      this.updateMessageRepliesIfNeeded(message);

      if(!message.pFlags.out && !message.pFlags.is_outgoing && message.pFlags.unread) {
        ++history.unread;
        appNotificationsManager.cancel('msg' + mid);

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

      const peerMessagesToHandle = this.newMessagesToHandle[peerId];
      if(peerMessagesToHandle && peerMessagesToHandle.has(mid)) {
        peerMessagesToHandle.delete(mid);
      }
    }

    if(history.albums) {
      for(const groupId in history.albums) {
        rootScope.dispatchEvent('album_edit', {peerId, groupId, deletedMids: [...history.albums[groupId]]});
        /* const mids = this.getMidsByAlbum(groupId);
        if(mids.length) {
          const mid = Math.max(...mids);
          rootScope.$broadcast('message_edit', {peerId, mid, justMedia: false});
        } */
      }
    }

    return history;
  }
  
  private handleEditedMessage(oldMessage: Message, newMessage: Message) {
    if(oldMessage._ === 'message') {
      if((oldMessage.media as MessageMedia.messageMediaWebPage)?.webpage) {
        const messageKey = appWebPagesManager.getMessageKeyForPendingWebPage(oldMessage.peerId, oldMessage.mid, !!oldMessage.pFlags.is_scheduled);
        appWebPagesManager.deleteWebPageFromPending((oldMessage.media as MessageMedia.messageMediaWebPage).webpage, messageKey);
      }
    }
  }

  public getMediaFromMessage(message: any) {
    return message.action ? 
      message.action.photo : 
      message.media && (
        message.media.photo || 
        message.media.document || (
          message.media.webpage && (
            message.media.webpage.document || 
            message.media.webpage.photo
          )
        )
      );
  }

  public isMentionUnread(message: MyMessage) {
    const doc = ((message as Message.message).media as MessageMedia.messageMediaDocument)?.document as MyDocument;
    return message.pFlags.media_unread && 
      message.pFlags.mentioned && 
      (
        !doc || 
        !(['voice', 'round'] as MyDocument['type'][]).includes(doc.type)
      );
  }

  public getDialogUnreadCount(dialog: Dialog) {
    return dialog.unread_count || +!!dialog.pFlags.unread_mark;
  }

  public isDialogUnread(dialog: Dialog) {
    return !!this.getDialogUnreadCount(dialog);
  }

  public canForward(message: Message.message | Message.messageService) {
    return !(message as Message.message).pFlags.noforwards && !appPeersManager.noForwards(message.peerId);
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
      const message: Message.message | Message.messageEmpty = this.getMessageByPeer(peerIdStr.toPeerId(), +mid);
      if(message._ === 'messageEmpty') {
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
      const changedResults = results.filter(reactionCount => {
        const previousReactionCount = previousResults.find(_reactionCount => _reactionCount.reaction === reactionCount.reaction);
        return (
          message.pFlags.out && (
            !previousReactionCount || 
            reactionCount.count > previousReactionCount.count
          )
        ) || (
          reactionCount.pFlags.chosen && (
            !previousReactionCount || 
            !previousReactionCount.pFlags.chosen
          )
        );
      });

      toDispatch.push({message, changedResults});
    }

    return toDispatch;
  };
}

const appMessagesManager = new AppMessagesManager();
MOUNT_CLASS_TO.appMessagesManager = appMessagesManager;
export default appMessagesManager;
