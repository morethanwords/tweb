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
import { formatTime, tsNow } from "../../helpers/date";
import { createPosterForVideo } from "../../helpers/files";
import { copy, getObjectKeysAndSort } from "../../helpers/object";
import { randomLong } from "../../helpers/random";
import { splitStringByLength, limitSymbols, escapeRegExp } from "../../helpers/string";
import { Chat, ChatFull, Dialog as MTDialog, DialogPeer, DocumentAttribute, InputMedia, InputMessage, InputPeerNotifySettings, InputSingleMedia, Message, MessageAction, MessageEntity, MessageFwdHeader, MessageMedia, MessageReplies, MessageReplyHeader, MessagesDialogs, MessagesFilter, MessagesMessages, MethodDeclMap, NotifyPeer, PeerNotifySettings, PhotoSize, SendMessageAction, Update, Photo, Updates, ReplyMarkup, InputPeer } from "../../layer";
import { InvokeApiOptions } from "../../types";
import I18n, { i18n, join, langPack, LangPackKey, _i18n } from "../langPack";
import { logger, LogTypes } from "../logger";
import type { ApiFileManager } from '../mtproto/apiFileManager';
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import referenceDatabase, { ReferenceContext } from "../mtproto/referenceDatabase";
import serverTimeManager from "../mtproto/serverTimeManager";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import DialogsStorage from "../storages/dialogs";
import FiltersStorage from "../storages/filters";
//import { telegramMeWebService } from "../mtproto/mtproto";
import apiUpdatesManager from "./apiUpdatesManager";
import appChatsManager from "./appChatsManager";
import appDocsManager, { MyDocument } from "./appDocsManager";
import appDownloadManager from "./appDownloadManager";
import appPeersManager from "./appPeersManager";
import appPhotosManager, { MyPhoto } from "./appPhotosManager";
import appPollsManager from "./appPollsManager";
import appStateManager from "./appStateManager";
import appUsersManager from "./appUsersManager";
import appWebPagesManager from "./appWebPagesManager";
import appDraftsManager from "./appDraftsManager";
import { getFileNameByLocation } from "../../helpers/fileName";
import appProfileManager from "./appProfileManager";
import DEBUG, { MOUNT_CLASS_TO } from "../../config/debug";
import SlicedArray, { Slice, SliceEnd } from "../../helpers/slicedArray";
import appNotificationsManager, { NotifyOptions } from "./appNotificationsManager";
import PeerTitle from "../../components/peerTitle";
import { forEachReverse } from "../../helpers/array";
import htmlToDocumentFragment from "../../helpers/dom/htmlToDocumentFragment";
import htmlToSpan from "../../helpers/dom/htmlToSpan";
import { REPLIES_PEER_ID } from "../mtproto/mtproto_config";
import formatCallDuration from "../../helpers/formatCallDuration";
import appAvatarsManager from "./appAvatarsManager";
import telegramMeWebManager from "../mtproto/telegramMeWebManager";
import { getMiddleware } from "../../helpers/middleware";
import assumeType from "../../helpers/assumeType";

//console.trace('include');
// TODO: если удалить сообщение в непрогруженном диалоге, то при обновлении, из-за стейта, последнего сообщения в чатлисте не будет
// TODO: если удалить диалог находясь в папке, то он не удалится из папки и будет виден в настройках

const APITIMEOUT = 0;

export type HistoryStorage = {
  count: number | null,
  history: SlicedArray,

  maxId?: number,
  readPromise?: Promise<void>,
  readMaxId?: number,
  readOutboxMaxId?: number,
  triedToReadMaxId?: number,

  maxOutId?: number,
  reply_markup?: Exclude<ReplyMarkup, ReplyMarkup.replyInlineMarkup>
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
export type MessagesStorage = {
  //generateIndex: (message: any) => void
  [mid: string]: any
};

export type MyMessageActionType = Message.messageService['action']['_'];

type PendingAfterMsg = Partial<InvokeApiOptions & {
  afterMessageId: string,
  messageId: string
}>;

export class AppMessagesManager {
  private static MESSAGE_ID_INCREMENT = 0x10000;
  private static MESSAGE_ID_OFFSET = 0xFFFFFFFF;

  private messagesStorageByPeerId: {[peerId: string]: MessagesStorage};
  public groupedMessagesStorage: {[groupId: string]: MessagesStorage}; // will be used for albums
  private scheduledMessagesStorage: {[peerId: string]: MessagesStorage};
  private historiesStorage: {
    [peerId: string]: HistoryStorage
  };
  private threadsStorage: {
    [peerId: string]: {
      [threadId: string]: HistoryStorage
    }
  };
  private searchesStorage: {
    [peerId: string]: Partial<{
      [inputFilter in MyInputMessagesFilter]: {
        count?: number,
        history: number[]
      }
    }>
  };
  public pinnedMessages: {[peerId: string]: PinnedStorage};

  public threadsServiceMessagesIdsStorage: {[peerId_threadId: string]: number};
  private threadsToReplies: {
    [peerId_threadId: string]: string;
  };

  private pendingByRandomId: {
    [randomId: string]: {
      peerId: number,
      tempId: number,
      threadId: number,
      storage: MessagesStorage
    }
  } = {};
  private pendingByMessageId: {[mid: string]: string} = {};
  private pendingAfterMsgs: {[peerId: string]: PendingAfterMsg} = {};
  public pendingTopMsgs: {[peerId: string]: number} = {};
  private tempNum = 0;
  private tempFinalizeCallbacks: {
    [tempId: string]: {
      [callbackName: string]: Partial<{
        deferred: CancellablePromise<void>, 
        callback: (message: any) => Promise<any>
      }>
    }
  } = {};
  
  private sendSmthLazyLoadQueue = new LazyLoadQueueBase(1);

  private needSingleMessages: {[peerId: string]: number[]} = {};
  private fetchSingleMessagesPromise: Promise<void> = null;

  private maxSeenId = 0;

  public migratedFromTo: {[peerId: number]: number} = {};
  public migratedToFrom: {[peerId: number]: number} = {};

  private newMessagesHandleTimeout = 0;
  private newMessagesToHandle: {[peerId: string]: Set<number>} = {};
  private newDialogsHandlePromise: Promise<any>;
  private newDialogsToHandle: {[peerId: string]: Dialog} = {};
  public newUpdatesAfterReloadToHandle: {[peerId: string]: Set<Update>} = {};

  private notificationsHandlePromise = 0;
  private notificationsToHandle: {[peerId: string]: {
    fwdCount: number,
    fromId: number,
    topMessage?: MyMessage
  }} = {};

  private reloadConversationsPromise: Promise<void>;
  private reloadConversationsPeers: Set<number> = new Set();

  public log = logger('MESSAGES', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn);

  public dialogsStorage: DialogsStorage;
  public filtersStorage: FiltersStorage;

  private groupedTempId = 0;

  private typings: {[peerId: string]: {type: SendMessageAction['_'], timeout?: number}} = {};

  private middleware: ReturnType<typeof getMiddleware>;

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
      this.getConversationsAll().then(dialogs => {
        let filterFunc: (dialog: Dialog) => boolean;
        if(key === 'notifyUsers') filterFunc = (dialog) => dialog.peerId > 0;
        else if(key === 'notifyBroadcasts') filterFunc = (dialog) => appChatsManager.isBroadcast(-dialog.peerId);
        else filterFunc = (dialog) => appPeersManager.isAnyGroup(dialog.peerId);

        dialogs
        .filter(filterFunc)
        .forEach(dialog => {
          rootScope.dispatchEvent('dialog_notify_settings', dialog);
        });
      });
    });

    rootScope.addEventListener('webpage_updated', (e) => {
      const eventData = e;
      eventData.msgs.forEach((mid) => {
        const message = this.getMessageById(mid) as Message.message;
        if(!message) return;
        message.media = {
          _: 'messageMediaWebPage', 
          webpage: appWebPagesManager.getWebPage(eventData.id)
        };

        const peerId = this.getMessagePeer(message);
        const storage = this.getMessagesStorage(peerId);
        rootScope.dispatchEvent('message_edit', {
          storage,
          peerId,
          mid
        });
      });
    });

    rootScope.addEventListener('draft_updated', (e) => {
      const {peerId, threadId, draft} = e;

      if(threadId) return;

      const dialog = this.getDialogOnly(peerId);
      if(dialog && !threadId) {
        dialog.draft = draft;
        this.dialogsStorage.generateIndexForDialog(dialog);
        this.dialogsStorage.pushDialog(dialog);

        rootScope.dispatchEvent('dialog_draft', {
          peerId,
          draft,
          index: dialog.index
        });
      } else {
        this.reloadConversation(peerId);
      }
    });
    
    appStateManager.getState().then(state => {
      if(state.maxSeenMsgId) {
        this.maxSeenId = state.maxSeenMsgId;
      }
    });
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
    this.dialogsStorage = new DialogsStorage(this, appChatsManager, appPeersManager, appUsersManager, appDraftsManager, appNotificationsManager, appStateManager, apiUpdatesManager, serverTimeManager);
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

  public sendText(peerId: number, text: string, options: Partial<{
    entities: any[],
    replyToMsgId: number,
    threadId: number,
    viaBotId: number,
    queryId: string,
    resultId: string,
    noWebPage: true,
    reply_markup: any,
    clearDraft: true,
    webPage: any,
    scheduleDate: number,
    silent: true
  }> = {}) {
    if(typeof(text) !== 'string' || !text.length) {
      return;
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

    const replyToMsgId = options.replyToMsgId ? this.getServerMessageId(options.replyToMsgId) : undefined;
    const isChannel = appPeersManager.isChannel(peerId);

    if(options.webPage) {
      message.media = {
        _: 'messageMediaWebPage',
        webpage: options.webPage
      };
    }

    const toggleError = (on: any) => {
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

      let apiPromise: any;
      if(options.viaBotId) {
        apiPromise = apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: appPeersManager.getInputPeerById(peerId),
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId || undefined,
          query_id: options.queryId,
          id: options.resultId,
          clear_draft: options.clearDraft
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
          silent: options.silent
        }, sentRequestOptions);
      }

      /* function is<T>(value: any, condition: boolean): value is T {
        return condition;
      } */

      //this.log('sendText', message.mid);
      apiPromise.then((updates: Updates) => {
        //this.log('sendText sent', message.mid);
        //if(is<Updates.updateShortSentMessage>(updates, updates._ === 'updateShortSentMessage')) {
        if(updates._ === 'updateShortSentMessage') {
          //assumeType<Updates.updateShortSentMessage>(updates);
          message.date = updates.date;
          message.id = updates.id;
          message.media = updates.media;
          message.entities = updates.entities;
          this.wrapMessageEntities(message);
          if(updates.pFlags.out) {
            message.pFlags.out = true;
          }

          // * override with new updates
          updates = {
            _: 'updates',
            users: [],
            chats: [],
            seq: 0,
            updates: [{
              _: 'updateMessageID',
              random_id: message.random_id,
              id: updates.id
            }, {
              _: options.scheduleDate ? 'updateNewScheduledMessage' : (isChannel ? 'updateNewChannelMessage' : 'updateNewMessage'),
              message: message,
              pts: updates.pts,
              pts_count: updates.pts_count
            }]
          } as any;
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
      }, (/* error: any */) => {
        toggleError(true);
      }).finally(() => {
        if(this.pendingAfterMsgs[peerId] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerId];
        }
      });

      this.pendingAfterMsgs[peerId] = sentRequestOptions;
    }

    this.beforeMessageSending(message, {
      isScheduled: !!options.scheduleDate || undefined, 
      threadId: options.threadId,
      clearDraft: options.clearDraft
    });
  }

  public sendFile(peerId: number, file: File | Blob | MyDocument, options: Partial<{
    isRoundMessage: true,
    isVoiceMessage: true,
    isGroupedItem: true,
    isMedia: true,

    replyToMsgId: number,
    threadId: number,
    groupId: string,
    caption: string,
    entities: MessageEntity[],
    width: number,
    height: number,
    objectURL: string,
    thumbBlob: Blob,
    thumbURL: string,
    duration: number,
    background: true,
    silent: true,
    clearDraft: true,
    scheduleDate: number,

    waveform: Uint8Array,
  }> = {}) {
    peerId = appPeersManager.getPeerMigratedTo(peerId) || peerId;

    //this.checkSendOptions(options);

    const message = this.generateOutgoingMessage(peerId, options);
    const replyToMsgId = options.replyToMsgId ? this.getServerMessageId(options.replyToMsgId) : undefined;

    let attachType: string, apiFileName: string;

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

    const isPhoto = ['image/jpeg', 'image/png', 'image/bmp'].indexOf(fileType) >= 0;

    let photo: MyPhoto, document: MyDocument;

    let actionName: SendMessageAction['_'];
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
    } else if(fileType.indexOf('video/') === 0) {
      attachType = 'video';
      apiFileName = 'video.mp4';
      actionName = 'sendMessageUploadVideoAction';

      let videoAttribute: DocumentAttribute.documentAttributeVideo = {
        _: 'documentAttributeVideo',
        pFlags: {
          round_message: options.isRoundMessage
        }, 
        duration: options.duration,
        w: options.width,
        h: options.height
      };

      attributes.push(videoAttribute);
    } else {
      attachType = 'document';
      apiFileName = 'document.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadDocumentAction';
    }

    attributes.push({_: 'documentAttributeFilename', file_name: fileName || apiFileName});

    if(['document', 'video', 'audio', 'voice'].indexOf(attachType) !== -1 && !isDocument) {
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
        if(options.thumbURL) {
          thumb = {
            _: 'photoSize',
            w: options.width,
            h: options.height,
            type: 'full',
            size: options.thumbBlob.size
          };

          const thumbCacheContext = appDownloadManager.getCacheContext(document, thumb.type);
          thumbCacheContext.downloaded = thumb.size;
          thumbCacheContext.url = options.thumbURL;
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

          sentDeferred.reject(err);
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
    } : media;

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
              const blobPromise = options.thumbBlob ? Promise.resolve(options.thumbBlob) : createPosterForVideo(options.objectURL);
              blobPromise.then(blob => {
                if(!blob) {
                  resolve(null);
                } else {
                  appDownloadManager.upload(blob).then(resolve, reject);
                }
              }, reject);
            });
          }
  
          uploadPromise && uploadPromise.then(async(inputFile) => {
            /* if(DEBUG) {
              this.log('appMessagesManager: sendFile uploaded:', inputFile);
            } */

            delete message.media.preloader;

            inputFile.name = apiFileName;
            uploaded = true;
            let inputMedia: InputMedia;
            switch(attachType) {
              case 'photo':
                inputMedia = {
                  _: 'inputMediaUploadedPhoto', 
                  file: inputFile
                };
                break;

              default:
                inputMedia = {
                  _: 'inputMediaUploadedDocument', 
                  file: inputFile, 
                  mime_type: fileType, 
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
          clear_draft: options.clearDraft
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
        });
      });
    }

    return {message, promise: sentDeferred};
  }

  public async sendAlbum(peerId: number, files: File[], options: Partial<{
    isMedia: true,
    entities: MessageEntity[],
    replyToMsgId: number,
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
    const replyToMsgId = options.replyToMsgId ? this.getServerMessageId(options.replyToMsgId) : undefined;

    let caption = options.caption || '';
    let entities = options.entities || [];
    if(caption) {
      caption = RichTextProcessor.parseMarkdown(caption, entities);
    }

    this.log('sendAlbum', files, options);

    const groupId = '' + ++this.groupedTempId;

    const messages = files.map((file, idx) => {
      const details = options.sendFileDetails[idx];
      const o: any = {
        isGroupedItem: true,
        isMedia: options.isMedia,
        scheduleDate: options.scheduleDate,
        silent: options.silent,
        replyToMsgId,
        threadId: options.threadId,
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

    if(options.threadId) {
      appDraftsManager.syncDraft(peerId, options.threadId);
    } else {
      appDraftsManager.saveDraft(peerId, options.threadId, null, {notify: true});  
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
    const invoke = (multiMedia: any[]) => {
      this.setTyping(peerId, {_: 'sendMessageCancelAction'});

      this.sendSmthLazyLoadQueue.push({
        load: () => {
          return apiManager.invokeApi('messages.sendMultiMedia', {
            peer: inputPeer,
            multi_media: multiMedia,
            reply_to_msg_id: replyToMsgId,
            schedule_date: options.scheduleDate,
            silent: options.silent,
            clear_draft: options.clearDraft
          }).then((updates) => {
            apiUpdatesManager.processUpdateMessage(updates);
          }, (error) => {
            messages.forEach(message => toggleError(message, true));
          });
        }
      });
    };

    const promises: Promise<InputSingleMedia>[] = messages.map((message, idx) => {
      return (message.send() as Promise<InputMedia>).then((inputMedia: InputMedia) => {
        return apiManager.invokeApi('messages.uploadMedia', {
          peer: inputPeer,
          media: inputMedia
        });
      })
      .then(messageMedia => {
        let inputMedia: any;
        if(messageMedia._ === 'messageMediaPhoto') {
          const photo = appPhotosManager.savePhoto(messageMedia.photo);
          inputMedia = appPhotosManager.getInput(photo);
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

    Promise.all(promises).then(inputs => {
      invoke(inputs.filter(Boolean));
    });
  }

  public sendOther(peerId: number, inputMedia: any, options: Partial<{
    replyToMsgId: number,
    threadId: number,
    viaBotId: number,
    reply_markup: any,
    clearDraft: true,
    queryId: string
    resultId: string,
    scheduleDate: number,
    silent: true
  }> = {}) {
    peerId = appPeersManager.getPeerMigratedTo(peerId) || peerId;

    //this.checkSendOptions(options);
    const message = this.generateOutgoingMessage(peerId, options);
    const replyToMsgId = options.replyToMsgId ? this.getServerMessageId(options.replyToMsgId) : undefined;

    let media;
    switch(inputMedia._) {
      case 'inputMediaPoll': {
        inputMedia.poll.id = message.id;
        appPollsManager.savePoll(inputMedia.poll, {
          _: 'pollResults',
          flags: 4,
          total_voters: 0,
          pFlags: {},
        });

        const {poll, results} = appPollsManager.getPoll('' + message.id);
        media = {
          _: 'messageMediaPoll',
          poll,
          results
        };

        break;
      }
      /* case 'inputMediaPhoto':
        media = {
          _: 'messageMediaPhoto',
          photo: appPhotosManager.getPhoto(inputMedia.id.id),
          caption: inputMedia.caption || ''
        };
        break;

      case 'inputMediaDocument':
        var doc = appDocsManager.getDoc(inputMedia.id.id);
        if(doc.sticker && doc.stickerSetInput) {
          appStickersManager.pushPopularSticker(doc.id);
        }
        media = {
          _: 'messageMediaDocument',
          'document': doc,
          caption: inputMedia.caption || ''
        };
        break;

      case 'inputMediaContact':
        media = {
          _: 'messageMediaContact',
          phone_number: inputMedia.phone_number,
          first_name: inputMedia.first_name,
          last_name: inputMedia.last_name,
          user_id: 0
        };
        break;

      case 'inputMediaGeoPoint':
        media = {
          _: 'messageMediaGeo',
          geo: {
            _: 'geoPoint',
            'lat': inputMedia.geo_point['lat'],
            'long': inputMedia.geo_point['long']
          }
        };
        break;

      case 'inputMediaVenue':
        media = {
          _: 'messageMediaVenue',
          geo: {
            _: 'geoPoint',
            'lat': inputMedia.geo_point['lat'],
            'long': inputMedia.geo_point['long']
          },
          title: inputMedia.title,
          address: inputMedia.address,
          provider: inputMedia.provider,
          venue_id: inputMedia.venue_id
        };
        break;

      case 'messageMediaPending':
        media = inputMedia;
        break; */
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

      let apiPromise: Promise<any>;
      if(options.viaBotId) {
        apiPromise = apiManager.invokeApiAfter('messages.sendInlineBotResult', {
          peer: appPeersManager.getInputPeerById(peerId),
          random_id: message.random_id,
          reply_to_msg_id: replyToMsgId || undefined,
          query_id: options.queryId,
          id: options.resultId,
          clear_draft: options.clearDraft
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
          silent: options.silent
        }, sentRequestOptions);
      }

      apiPromise.then((updates) => {
        if(updates.updates) {
          updates.updates.forEach((update: any) => {
            if(update._ === 'updateDraftMessage') {
              update.local = true
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
      this.pendingAfterMsgs[peerId] = sentRequestOptions;
    }

    this.beforeMessageSending(message, {
      isScheduled: !!options.scheduleDate || undefined, 
      threadId: options.threadId,
      clearDraft: options.clearDraft
    });
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

  private beforeMessageSending(message: any, options: Partial<{
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
      setTimeout(() => {
        this.setDialogTopMessage(message);
        rootScope.dispatchEvent('history_append', {storage, peerId, mid: messageId});
      }, 0);
    }

    if(!options.isGroupedItem && options.clearDraft) {
      if(options.threadId) {
        appDraftsManager.syncDraft(peerId, options.threadId);
      } else {
        appDraftsManager.saveDraft(peerId, options.threadId, null, {notify: true});  
      }
    }
    
    this.pendingByRandomId[message.random_id] = {
      peerId, 
      tempId: messageId, 
      threadId: options.threadId, 
      storage
    };

    if(!options.isGroupedItem && message.send) {
      setTimeout(message.send, 0);
      //setTimeout(message.send, 4000);
      //setTimeout(message.send, 7000);
    }
  }

  private generateOutgoingMessage(peerId: number, options: Partial<{
    scheduleDate: number,
    replyToMsgId: number,
    threadId: number,
    viaBotId: number,
    groupId: string,
    reply_markup: any,
  }>) {
    if(options.threadId && !options.replyToMsgId) {
      options.replyToMsgId = options.threadId;
    }

    const message: any = {
      _: 'message',
      id: this.generateTempMessageId(peerId),
      from_id: this.generateFromId(peerId),
      peer_id: appPeersManager.getOutputPeer(peerId),
      pFlags: this.generateFlags(peerId),
      date: options.scheduleDate || (tsNow(true) + serverTimeManager.serverTimeOffset),
      message: '',
      grouped_id: options.groupId,
      random_id: randomLong(),
      reply_to: this.generateReplyHeader(options.replyToMsgId, options.threadId),
      via_bot_id: options.viaBotId,
      reply_markup: options.reply_markup,
      replies: this.generateReplies(peerId),
      views: appPeersManager.isBroadcast(peerId) && 1,
      pending: true,
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

  private generateReplies(peerId: number) {
    let replies: MessageReplies.messageReplies;
    if(appPeersManager.isBroadcast(peerId)) {
      const channelFull = appProfileManager.chatsFull[-peerId] as ChatFull.channelFull;
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
  private generateFromId(peerId: number) {
    if(peerId < 0 && (appPeersManager.isBroadcast(peerId) || appPeersManager.getPeer(peerId).admin_rights?.pFlags?.anonymous)) {
      return undefined;
    } else {
      return appPeersManager.getOutputPeer(appUsersManager.getSelf().id);
    }
  }

  private generateFlags(peerId: number) {
    const pFlags: any = {};
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

  private generateForwardHeader(peerId: number, originalMessage: Message.message) {
    const myId = appUsersManager.getSelf().id;
    if(originalMessage.fromId === myId && originalMessage.peerId === myId && !originalMessage.fwd_from) {
      return;
    }

    const fwdHeader: MessageFwdHeader.messageFwdHeader = {
      _: 'messageFwdHeader',
      flags: 0,
      date: originalMessage.date
    };

    if(originalMessage.fwd_from) {
      fwdHeader.from_id = originalMessage.fwd_from.from_id;
      fwdHeader.from_name = originalMessage.fwd_from.from_name;
      fwdHeader.post_author = originalMessage.fwd_from.post_author;
    } else {
      fwdHeader.from_id = appPeersManager.getOutputPeer(originalMessage.fromId);
      fwdHeader.post_author = originalMessage.post_author;
    }

    if(appPeersManager.isBroadcast(originalMessage.peerId)) {
      if(originalMessage.post_author) {
        fwdHeader.post_author = originalMessage.post_author;
      }

      fwdHeader.channel_post = originalMessage.id;
    }
    
    // * there is no way to detect whether user profile is hidden
    if(peerId === myId) {
      fwdHeader.saved_from_msg_id = originalMessage.id;
      fwdHeader.saved_from_peer = appPeersManager.getOutputPeer(originalMessage.peerId);
    }

    return fwdHeader;
  }

  public generateFakeAvatarMessage(peerId: number, photo: Photo) {
    const maxId = Number.MAX_SAFE_INTEGER;
    const message = {
      _: 'messageService',
      action: {
        _: 'messageActionChannelEditPhoto',
        photo
      },
      mid: maxId,
      peerId,
      date: (photo as Photo.photo).date,
      fromId: peerId
    } as Message.messageService;

    this.getMessagesStorage(peerId)[maxId] = message;
    return message;
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
      delete storage[tempId];

      return true;
    }

    return false;
  }

  public async refreshConversations() {
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
          const mid = this.generateMessageId(dialog.top_message);
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
  }

  public async getConversationsAll(query = '', folderId = 0) {
    const limit = 200, outDialogs: Dialog[] = [];
    for(; folderId < 2; ++folderId) {
      let offsetIndex = 0;
      for(;;) {
        const {dialogs} = await appMessagesManager.getConversations(query, offsetIndex, limit, folderId);
  
        if(dialogs.length) {
          outDialogs.push(...dialogs);
          offsetIndex = dialogs[dialogs.length - 1].index || 0;
        } else {
          break;
        }
      }
    }

    return outDialogs;
  }

  public getConversations(query = '', offsetIndex?: number, limit = 20, folderId = 0) {
    return this.dialogsStorage.getDialogs(query, offsetIndex, limit, folderId);
  }

  public getReadMaxIdIfUnread(peerId: number, threadId?: number) {
    const historyStorage = this.getHistoryStorage(peerId, threadId);
    if(threadId) {
      const chatHistoryStorage = this.getHistoryStorage(peerId);
      const readMaxId = Math.max(chatHistoryStorage.readMaxId ?? 0, historyStorage.readMaxId);
      const message = this.getMessageByPeer(peerId, historyStorage.maxId); // usually message is missing, so pFlags.out won't be there anyway
      return !message.pFlags.out && readMaxId < historyStorage.maxId ? readMaxId : 0;
    } else {
      const message = this.getMessageByPeer(peerId, historyStorage.maxId);
      const readMaxId = peerId > 0 ? Math.max(historyStorage.readMaxId, historyStorage.readOutboxMaxId) : historyStorage.readMaxId;
      return !message.pFlags.out && readMaxId < historyStorage.maxId ? readMaxId : 0;
    }
  }

  // public lolSet = new Set();
  public getTopMessages(limit: number, folderId: number, offsetDate?: number) {
    //const dialogs = this.dialogsStorage.getFolder(folderId);
    let offsetId = 0;
    let offsetPeerId = 0;
    let offsetIndex = 0;

    if(offsetDate === undefined) {
      offsetDate = this.dialogsStorage.getOffsetDate(folderId);
    }

    if(offsetDate) {
      offsetIndex = offsetDate * 0x10000;
      offsetDate += serverTimeManager.serverTimeOffset;
    }

    const middleware = this.middleware.get();

    // ! ВНИМАНИЕ: ОЧЕНЬ СЛОЖНАЯ ЛОГИКА:
    // ! если делать запрос сначала по папке 0, потом по папке 1, по индексу 0 в массиве будет один и тот же диалог, с dialog.pFlags.pinned, ЛОЛ???
    // ! т.е., с запросом folder_id: 1, и exclude_pinned: 0, в результате будут ещё и закреплённые с папки 0
    return apiManager.invokeApiSingle('messages.getDialogs', {
      folder_id: folderId,
      offset_date: offsetDate,
      offset_id: offsetId,
      offset_peer: appPeersManager.getInputPeerById(offsetPeerId),
      limit,
      hash: 0
    }, {
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
      if(!offsetId && !offsetDate && !offsetPeerId) {
        this.dialogsStorage.resetPinnedOrder(folderId);
      }

      if(!offsetDate) {
        telegramMeWebManager.setAuthorized(true);
      }

      appUsersManager.saveApiUsers(dialogsResult.users);
      appChatsManager.saveApiChats(dialogsResult.chats);
      this.saveMessages(dialogsResult.messages);

      let maxSeenIdIncremented = offsetDate ? true : false;
      let hasPrepend = false;
      const noIdsDialogs: {[peerId: number]: Dialog} = {};
      forEachReverse((dialogsResult.dialogs as Dialog[]), dialog => {
        //const d = Object.assign({}, dialog);
        // ! нужно передавать folderId, так как по папке !== 0 нет свойства folder_id
        this.dialogsStorage.saveDialog(dialog, dialog.folder_id ?? folderId, true);

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
        if(!this.getServerMessageId(dialog.read_inbox_max_id) && !this.getServerMessageId(dialog.read_outbox_max_id)) {
          noIdsDialogs[dialog.peerId] = dialog;

          this.log.error('noIdsDialogs', dialog);

          /* if(dialog.peerId === -1213511294) {
            this.log.error('lun bot', folderId);
          } */
        }
      });

      if(Object.keys(noIdsDialogs).length) {
        //setTimeout(() => { // test bad situation
          this.reloadConversation(Object.keys(noIdsDialogs).map(id => +id)).then(() => {
            rootScope.dispatchEvent('dialogs_multiupdate', noIdsDialogs);
  
            for(let peerId in noIdsDialogs) {
              rootScope.dispatchEvent('dialog_unread', {peerId: +peerId});
            }
          });
        //}, 10e3);
      }

      const count = (dialogsResult as MessagesDialogs.messagesDialogsSlice).count;

      // exclude empty draft dialogs
      const dialogs = this.dialogsStorage.getFolder(folderId, false);
      let dialogsLength = 0;
      for(let i = 0, length = dialogs.length; i < length; ++i) {
        if(this.getServerMessageId(dialogs[i].top_message)) {
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

      return {
        isEnd, 
        count, 
        dialogs: (dialogsResult as MessagesDialogs.messagesDialogsSlice).dialogs
      };
    });
  }

  public forwardMessages(peerId: number, fromPeerId: number, mids: number[], options: Partial<{
    withMyScore: true,
    silent: true,
    scheduleDate: number
  }> = {}) {
    peerId = appPeersManager.getPeerMigratedTo(peerId) || peerId;
    mids = mids.slice().sort((a, b) => a - b);

    const groups: {
      [groupId: string]: {
        tempId: string,
        messages: any[]
      }
    } = {};

    const newMessages = mids.map(mid => {
      const originalMessage: Message.message = this.getMessageByPeer(fromPeerId, mid);
      const message: Message.message = this.generateOutgoingMessage(peerId, options);
      message.fwd_from = this.generateForwardHeader(peerId, originalMessage);

      (['entities', 'forwards', 'message', 'media', 'reply_markup', 'views'] as any as Array<keyof MyMessage>).forEach(key => {
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
      id: mids.map(mid => this.getServerMessageId(mid)),
      random_id: newMessages.map(message => message.random_id),
      to_peer: appPeersManager.getInputPeerById(peerId),
      with_my_score: options.withMyScore,
      silent: options.silent,
      schedule_date: options.scheduleDate
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

  public getMessageFromStorage(storage: MessagesStorage, messageId: number) {
    return storage && storage[messageId] || {
      _: 'messageEmpty',
      id: messageId,
      deleted: true,
      pFlags: {}
    };
  }

  private createMessageStorage() {
    const storage: MessagesStorage = {} as any;
    
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

  public getMessagesStorage(peerId: number) {
    return this.messagesStorageByPeerId[peerId] ?? (this.messagesStorageByPeerId[peerId] = this.createMessageStorage());
  }

  public getMessageById(messageId: number) {
    for(const peerId in this.messagesStorageByPeerId) {
      if(appPeersManager.isChannel(+peerId)) {
        continue;
      }

      const message = this.messagesStorageByPeerId[peerId][messageId];
      if(message) {
        return message;
      }
    }

    return this.getMessageFromStorage(null, messageId);
  }

  public getMessageByPeer(peerId: number, messageId: number) {
    if(!peerId) {
      return this.getMessageById(messageId);
    }

    return this.getMessageFromStorage(this.getMessagesStorage(peerId), messageId);
  }

  public getMessagePeer(message: any): number {
    const toId = message.peer_id && appPeersManager.getPeerId(message.peer_id) || 0;

    return toId;
  }

  public getDialogByPeerId(peerId: number): [Dialog, number] | [] {
    return this.dialogsStorage.getDialog(peerId);
  }

  public getDialogOnly(peerId: number) {
    return this.dialogsStorage.getDialogOnly(peerId);
  }

  public reloadConversation(peerId?: number | number[]) {
    if(peerId !== undefined) {
      [].concat(peerId).forEach(peerId => {
        if(!this.reloadConversationsPeers.has(peerId)) {
          this.reloadConversationsPeers.add(peerId);
          //this.log('will reloadConversation', peerId);
        }
      });
    }

    if(this.reloadConversationsPromise) return this.reloadConversationsPromise;
    return this.reloadConversationsPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        const peers = Array.from(this.reloadConversationsPeers).map(peerId => appPeersManager.getInputDialogPeerById(peerId));
        this.reloadConversationsPeers.clear();

        apiManager.invokeApi('messages.getPeerDialogs', {peers}).then((result) => {
          this.dialogsStorage.applyDialogs(result);
          resolve();
        }, reject).finally(() => {
          this.reloadConversationsPromise = null;

          if(this.reloadConversationsPeers.size) {
            this.reloadConversation();
          }
        });
      }, 0);
    });
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

  public async flushHistory(peerId: number, justClear?: boolean, revoke?: boolean) {
    if(appPeersManager.isChannel(peerId)) {
      const promise = this.getHistory(peerId, 0, 1);

      const historyResult = promise instanceof Promise ? await promise : promise;

      const channelId = -peerId;
      const maxId = historyResult.history[0] || 0;
      return apiManager.invokeApiSingle('channels.deleteHistory', {
        channel: appChatsManager.getChannelInput(channelId),
        max_id: this.getServerMessageId(maxId)
      }).then(() => {
        apiUpdatesManager.processLocalUpdate({
          _: 'updateChannelAvailableMessages',
          channel_id: channelId,
          available_min_id: maxId
        });

        return true;
      });
    }

    return this.doFlushHistory(appPeersManager.getInputPeerById(peerId), justClear, revoke).then(() => {
      delete this.historiesStorage[peerId];
      delete this.messagesStorageByPeerId[peerId];
      delete this.scheduledMessagesStorage[peerId];
      delete this.threadsStorage[peerId];
      delete this.searchesStorage[peerId];
      delete this.pinnedMessages[peerId];
      delete this.pendingAfterMsgs[peerId];
      delete this.pendingTopMsgs[peerId];
      delete this.needSingleMessages[peerId];
      
      if(justClear) {
        rootScope.dispatchEvent('dialog_flush', {peerId});
      } else {
        delete this.notificationsToHandle[peerId];
        delete this.typings[peerId];
        this.reloadConversationsPeers.delete(peerId);

        this.dialogsStorage.dropDialog(peerId);
        rootScope.dispatchEvent('dialog_drop', {peerId});
      }
    });
  }

  public hidePinnedMessages(peerId: number) {
    return Promise.all([
      appStateManager.getState(),
      this.getPinnedMessage(peerId)
    ])
    .then(([state, pinned]) => {
      state.hiddenPinnedMessages[peerId] = pinned.maxId;
      rootScope.dispatchEvent('peer_pinned_hidden', {peerId, maxId: pinned.maxId});
    });
  }

  public getPinnedMessage(peerId: number) {
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

  public updatePinnedMessage(peerId: number, mid: number, unpin?: boolean, silent?: boolean, pm_oneside?: boolean) {
    return apiManager.invokeApi('messages.updatePinnedMessage', {
      peer: appPeersManager.getInputPeerById(peerId),
      unpin,
      silent,
      pm_oneside,
      id: this.getServerMessageId(mid)
    }).then(updates => {
      //this.log('pinned updates:', updates);
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public unpinAllMessages(peerId: number): Promise<boolean> {
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
        for(const mid in storage) {
          const message = storage[mid];
          if(message.pFlags.pinned) {
            delete message.pFlags.pinned;
          }
        }

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
    for(const i in group) {
      const m = group[i];
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

  public getMidsByAlbum(grouped_id: string) {
    return getObjectKeysAndSort(this.groupedMessagesStorage[grouped_id], 'asc');
    //return Object.keys(this.groupedMessagesStorage[grouped_id]).map(id => +id).sort((a, b) => a - b);
  }

  public getMidsByMessage(message: any) {
    if(message?.grouped_id) return this.getMidsByAlbum(message.grouped_id);
    else return [message.mid];
  }

  public filterMessages(message: any, verify: (message: MyMessage) => boolean) {
    const out: MyMessage[] = [];
    if(message.grouped_id) {
      const storage = this.groupedMessagesStorage[message.grouped_id];
      for(const mid in storage) {
        const message = storage[mid];
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

  public generateTempMessageId(peerId: number) {
    const dialog = this.getDialogOnly(peerId);
    return this.generateMessageId(dialog?.top_message || 0, true);
  }

  public generateMessageId(messageId: number, temp = false) {
    const q = AppMessagesManager.MESSAGE_ID_OFFSET;
    const num = temp ? ++this.tempNum : 0;
    if(messageId >= q) {
      if(temp) {
        return messageId + (num & (AppMessagesManager.MESSAGE_ID_INCREMENT - 1));
      }

      return messageId;
    }

    return q + (messageId * AppMessagesManager.MESSAGE_ID_INCREMENT + (num & (AppMessagesManager.MESSAGE_ID_INCREMENT - 1)));
  }

  /**
   * * will ignore outgoing offset
   */
  public getServerMessageId(messageId: number) {
    const q = AppMessagesManager.MESSAGE_ID_OFFSET;
    if(messageId < q) { // id 0 -> mid 0xFFFFFFFF, so 0xFFFFFFFF must convert to 0
      return messageId;
    }

    const l = AppMessagesManager.MESSAGE_ID_INCREMENT - 1;
    const used = messageId & l;
    if(used !== l) {
      messageId -= used + 1;
    }

    return (messageId - q) / AppMessagesManager.MESSAGE_ID_INCREMENT;
  }

  public incrementMessageId(messageId: number, increment: number) {
    return this.generateMessageId(this.getServerMessageId(messageId) + increment);
  }

  public saveMessages(messages: any[], options: Partial<{
    storage: MessagesStorage,
    isScheduled: true,
    isOutgoing: true,
    //isNew: boolean, // * new - from update
  }> = {}) {
    //let groups: Set<string>;
    messages.forEach((message) => {
      if(message.pFlags === undefined) {
        message.pFlags = {};
      }

      if(message._ === 'messageEmpty') {
        return;
      }

      // * exclude from state
      // defineNotNumerableProperties(message, ['rReply', 'mid', 'savedFrom', 'fwdFromId', 'fromId', 'peerId', 'reply_to_mid', 'viaBotId']);

      const peerId = this.getMessagePeer(message);
      const storage = options.storage || this.getMessagesStorage(peerId);
      const isChannel = message.peer_id._ === 'peerChannel';
      const channelId = isChannel ? -peerId : 0;
      const isBroadcast = isChannel && appChatsManager.isBroadcast(channelId);

      if(options.isScheduled) {
        message.pFlags.is_scheduled = true;
      }

      if(options.isOutgoing) {
        message.pFlags.is_outgoing = true;
      }
      
      const mid = this.generateMessageId(message.id);
      message.mid = mid;

      if(message.grouped_id) {
        const storage = this.groupedMessagesStorage[message.grouped_id] ?? (this.groupedMessagesStorage[message.grouped_id] = {});
        storage[mid] = message;
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
          message.reply_to.reply_to_msg_id = message.reply_to_mid = this.generateMessageId(message.reply_to.reply_to_msg_id);
        } 

        if(message.reply_to.reply_to_top_id) message.reply_to.reply_to_top_id = this.generateMessageId(message.reply_to.reply_to_top_id);
      }

      if(message.replies) {
        if(message.replies.max_id) message.replies.max_id = this.generateMessageId(message.replies.max_id);
        if(message.replies.read_max_id) message.replies.read_max_id = this.generateMessageId(message.replies.read_max_id);
      }

      const overwriting = !!peerId;
      if(!overwriting) {
        message.date -= serverTimeManager.serverTimeOffset;
      }
      
      //storage.generateIndex(message);
      const myId = appUsersManager.getSelf().id;

      message.peerId = peerId;
      if(peerId === myId/*  && !message.from_id && !message.fwd_from */) {
        message.fromId = message.fwd_from ? (message.fwd_from.from_id ? appPeersManager.getPeerId(message.fwd_from.from_id) : 0) : myId;
      } else {
        //message.fromId = message.pFlags.post || (!message.pFlags.out && !message.from_id) ? peerId : appPeersManager.getPeerId(message.from_id);
        message.fromId = message.pFlags.post || !message.from_id ? peerId : appPeersManager.getPeerId(message.from_id);
      }

      const fwdHeader = message.fwd_from as MessageFwdHeader;
      if(fwdHeader) {
        //if(peerId === myID) {
          if(fwdHeader.saved_from_msg_id) fwdHeader.saved_from_msg_id = this.generateMessageId(fwdHeader.saved_from_msg_id);
          if(fwdHeader.channel_post) fwdHeader.channel_post = this.generateMessageId(fwdHeader.channel_post);

          const peer = fwdHeader.saved_from_peer || fwdHeader.from_id;
          const msgId = fwdHeader.saved_from_msg_id || fwdHeader.channel_post;
          if(peer && msgId) {
            const savedFromPeerId = appPeersManager.getPeerId(peer);
            const savedFromMid = this.generateMessageId(msgId);
            message.savedFrom = savedFromPeerId + '_' + savedFromMid;
          }

          /* if(peerId < 0 || peerId === myID) {
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

      if(message.via_bot_id > 0) {
        message.viaBotId = message.via_bot_id;
      }

      const mediaContext: ReferenceContext = {
        type: 'message',
        peerId,
        messageId: mid
      };

      if(message.media) {
        switch(message.media._) {
          case 'messageMediaEmpty':
            delete message.media;
            break;
          case 'messageMediaPhoto':
            if(message.media.ttl_seconds) {
              message.media = {_: 'messageMediaUnsupportedWeb'};
            } else {
              message.media.photo = appPhotosManager.savePhoto(message.media.photo, mediaContext);
            }

            if(!message.media.photo) { // * found this bug on test DC
              delete message.media;
            }
            
            break;
          case 'messageMediaPoll':
            message.media.poll = appPollsManager.savePoll(message.media.poll, message.media.results);
            break;
          case 'messageMediaDocument':
            if(message.media.ttl_seconds) {
              message.media = {_: 'messageMediaUnsupportedWeb'};
            } else {
              message.media.document = appDocsManager.saveDoc(message.media.document, mediaContext); // 11.04.2020 warning
            }

            break;
          case 'messageMediaWebPage':
            message.media.webpage = appWebPagesManager.saveWebPage(message.media.webpage, message.mid, mediaContext);
            break;
          /*case 'messageMediaGame':
            AppGamesManager.saveGame(apiMessage.media.game, apiMessage.mid, mediaContext);
            apiMessage.media.handleMessage = true;
            break; */
          case 'messageMediaInvoice':
            message.media = {_: 'messageMediaUnsupportedWeb'};
            break;
        }
      }

      if(message.action) {
        const action = message.action;
        let migrateFrom: number;
        let migrateTo: number;
        const suffix = message.fromId === appUsersManager.getSelf().id ? 'You' : '';
        switch(action._) {
          //case 'messageActionChannelEditPhoto':
          case 'messageActionChatEditPhoto':
            action.photo = appPhotosManager.savePhoto(action.photo, mediaContext);
            if(action.photo.video_sizes) {
              action._ = isBroadcast ? 'messageActionChannelEditVideo' : 'messageActionChatEditVideo';
            } else {
              if(isBroadcast) { // ! messageActionChannelEditPhoto не существует в принципе, это используется для перевода.
                action._ = 'messageActionChannelEditPhoto';
              }
            }
            break;
          
          case 'messageActionGroupCall': {
            //assumeType<MessageAction.messageActionGroupCall>(action);

            let type: string;
            if(action.duration === undefined) {
              type = 'started';
              if(peerId !== message.fromId) {
                type += '_by' + suffix;
              }
            } else {
              type = 'ended_by' + suffix;
            }

            action.type = type;

            break;
          }

          case 'messageActionChatEditTitle':
            /* if(options.isNew) {
              const chat = appChatsManager.getChat(-peerId);
              chat.title = action.title;
              appChatsManager.saveApiChat(chat, true);
            } */
            
            if(isBroadcast) {
              action._ = 'messageActionChannelEditTitle';
            }
            break;

          case 'messageActionChatDeletePhoto':
            if(isBroadcast) {
              action._ = 'messageActionChannelDeletePhoto';
            }
            break;

          case 'messageActionChatAddUser':
            if(action.users.length === 1) {
              action.user_id = action.users[0];
              if(message.fromId === action.user_id) {
                if(isChannel) {
                  action._ = 'messageActionChatJoined' + suffix;
                } else {
                  action._ = 'messageActionChatReturn' + suffix;
                }
              }
            } else if(action.users.length > 1) {
              action._ = 'messageActionChatAddUsers';
            }
            break;

          case 'messageActionChatDeleteUser':
            if(message.fromId === action.user_id) {
              action._ = 'messageActionChatLeave' + suffix;
            }
            break;

          case 'messageActionChannelMigrateFrom':
            migrateFrom = -action.chat_id;
            migrateTo = -channelId;
            break

          case 'messageActionChatMigrateTo':
            migrateFrom = -channelId;
            migrateTo = -action.channel_id;
            break;

          case 'messageActionHistoryClear':
            //apiMessage.deleted = true;
            message.clear_history = true;
            delete message.pFlags.out;
            delete message.pFlags.unread;
            break;

          case 'messageActionPhoneCall':
            action.type = 
              (message.pFlags.out ? 'out_' : 'in_') +
              (
                action.reason._ === 'phoneCallDiscardReasonMissed' ||
                action.reason._ === 'phoneCallDiscardReasonBusy'
                   ? 'missed'
                   : 'ok'
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

      if(message.message && message.message.length && !message.totalEntities) {
        this.wrapMessageEntities(message);  
      }

      storage[mid] = message;
    });

    /* if(groups) {
      for(const groupId of groups) {
        const mids = this.groupedMessagesStorage[groupId];
        for(const mid in mids) {
          const message = this.groupedMessagesStorage[groupId][mid];
          message.rReply = this.getRichReplyText(message);
        }
      }
    } */
  }

  private wrapMessageEntities(message: any) {
    const apiEntities = message.entities ? message.entities.slice() : [];
    message.message = RichTextProcessor.fixEmoji(message.message, apiEntities);

    const myEntities = RichTextProcessor.parseEntities(message.message);
    message.totalEntities = RichTextProcessor.mergeEntities(apiEntities, myEntities); // ! only in this order, otherwise bold and emoji formatting won't work
  }

  public wrapMessageForReply(message: any, text: string, usingMids: number[], plain: true, highlightWord?: string): string;
  public wrapMessageForReply(message: any, text?: string, usingMids?: number[], plain?: false, highlightWord?: string): DocumentFragment;
  public wrapMessageForReply(message: any, text: string = message.message, usingMids?: number[], plain?: boolean, highlightWord?: string): DocumentFragment | string {
    const parts: (HTMLElement | string)[] = [];

    const addPart = (langKey: LangPackKey, part?: string | HTMLElement, text?: string) => {
      if(langKey) {
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

      if(text) {
        parts.push(', ');
      }
    };

    if(message.media) {
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
          text = this.getAlbumText(message.grouped_id).message;
          addPart('AttachAlbum', undefined, text);
        }
      } else {
        usingFullAlbum = false;
      }

      if(!usingFullAlbum) {
        const media = message.media;
        switch(media._) {
          case 'messageMediaPhoto':
            addPart('AttachPhoto', undefined, message.message);
            break;
          case 'messageMediaDice':
            addPart(undefined, plain ? media.emoticon : RichTextProcessor.wrapEmojiText(media.emoticon));
            break;
          case 'messageMediaVenue': {
            const text = plain ? media.title : RichTextProcessor.wrapEmojiText(media.title);
            addPart('AttachLocation', undefined, text);
            parts.push(htmlToDocumentFragment(text) as any);
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
            const prefix = '🎮' + ' ';
            addPart(undefined, plain ? prefix + media.game.title : RichTextProcessor.wrapEmojiText(prefix + media.game.title));
            break;
          }
          case 'messageMediaDocument':
            let document = media.document;
  
            if(document.type === 'video') {
              addPart('AttachVideo', undefined, message.message);
            } else if(document.type === 'voice') {
              addPart('AttachAudio', undefined, message.message);
            } else if(document.type === 'gif') {
              addPart('AttachGif', undefined, message.message);
            } else if(document.type === 'round') {
              addPart('AttachRound', undefined, message.message);
            } else if(document.type === 'sticker') {
              addPart(undefined, ((plain ? document.stickerEmojiRaw : document.stickerEmoji) || '') + 'Sticker');
              text = '';
            } else {
              addPart(document.file_name, undefined, message.message);
            }
  
            break;
  
          default:
            //messageText += media._;
            ///////this.log.warn('Got unknown media type!', message);
            break;
        }
      } 
    }

    if(message.action) {
      const actionWrapped = this.wrapMessageActionTextNew(message, plain);
      if(actionWrapped) {
        addPart(undefined, actionWrapped);
      }
    }

    if(text) {
      text = limitSymbols(text, 100);

      if(plain) {
        parts.push(text);
      } else {
        let entities = RichTextProcessor.parseEntities(text.replace(/\n/g, ' '));

        if(highlightWord) {
          highlightWord = highlightWord.trim();
          if(!entities) entities = [];
          let found = false;
          let match: any;
          let regExp = new RegExp(escapeRegExp(highlightWord), 'gi');
          while((match = regExp.exec(text)) !== null) {
            entities.push({_: 'messageEntityHighlight', length: highlightWord.length, offset: match.index});
            found = true;
          }
      
          if(found) {
            entities.sort((a, b) => a.offset - b.offset);
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

  public getSenderToPeerText(message: MyMessage) {
    let senderTitle = '', peerTitle: string;
    
    senderTitle = message.pFlags.out ? 'You' : appPeersManager.getPeerTitle(message.fromId, false, false);
    peerTitle = appPeersManager.isAnyGroup(message.peerId) || (message.pFlags.out && message.peerId !== rootScope.myId) ? 
      appPeersManager.getPeerTitle(message.peerId, false, false) : 
      '';

    if(peerTitle) {
      senderTitle += ' ➝ ' + peerTitle;
    }

    return senderTitle;
  }

  public wrapMessageActionTextNew(message: any, plain: true): string;
  public wrapMessageActionTextNew(message: any, plain?: false): HTMLElement;
  public wrapMessageActionTextNew(message: any, plain: boolean): HTMLElement | string;
  public wrapMessageActionTextNew(message: any, plain?: boolean): HTMLElement | string {
    const element: HTMLElement = plain ? undefined : document.createElement('span');
    const action = message.action as MessageAction;

    // this.log('message action:', action);

    if((action as MessageAction.messageActionCustomAction).message) {
      if(plain) {
        return RichTextProcessor.wrapPlainText(message.message);
      } else {
        element.innerHTML = RichTextProcessor.wrapRichText((action as MessageAction.messageActionCustomAction).message, {noLinebreaks: true});
        return element;
      }
    } else {
      let _ = action._;
      //let suffix = '';
      let langPackKey: LangPackKey;
      let args: any[];

      const getNameDivHTML = (peerId: number, plain: boolean) => {
        return plain ? appPeersManager.getPeerTitle(peerId, plain) + ' ' : (new PeerTitle({peerId})).element;
      };

      switch(action._) {
        case 'messageActionPhoneCall': {
          _ += '.' + (action as any).type;

          args = [formatCallDuration(action.duration)];
          break;
        }

        case 'messageActionGroupCall': {
          _ += '.' + (action as any).type;

          args = [];
          if(!_.endsWith('You')) {
            args.push(getNameDivHTML(message.fromId, plain));
          }

          args.push(formatCallDuration(action.duration));
          break;
        }

        case 'messageActionInviteToGroupCall': {
          const peerIds = [message.fromId, action.users[0]];
          let a = 'ActionGroupCall';
          const myId = appUsersManager.getSelf().id;
          if(peerIds[0] === myId) a += 'You';
          a += 'Invited';
          if(peerIds[1] === myId) a += 'You';
          peerIds.findAndSplice(peerId => peerId === myId);

          langPackKey = a as LangPackKey;
          args = peerIds.map(peerId => getNameDivHTML(peerId, plain));
          break;
        }

        case 'messageActionGroupCallScheduled': {
          const today = new Date();
          const date = new Date(action.schedule_date * 1000);
          const daysToStart = (date.getTime() - today.getTime()) / 86400e3;
          const tomorrowDate = new Date(today);
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);

          langPackKey = 'ChatList.Service.VoiceChatScheduled';
          const myId = appUsersManager.getSelf().id;
          if(message.fromId === myId) {
            langPackKey += 'You';
          }

          let k: LangPackKey, _args: any[] = [];
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
          args = [t];

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

        case 'messageActionPinMessage':
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
          const users: number[] = (action as MessageAction.messageActionChatAddUser).users 
            || [(action as MessageAction.messageActionChatDeleteUser).user_id];

          args = [getNameDivHTML(message.fromId, plain)];

          if(users.length > 1) {
            if(plain) {
              args.push(...users.map((userId: number) => (getNameDivHTML(userId, true) as string).trim()).join(', '));
            } else {
              const fragment = document.createElement('span');
              fragment.append(
                ...join(
                  users.map((userId: number) => getNameDivHTML(userId, false)) as HTMLElement[],
                  false
                )
              );
              args.push(fragment);
            }
          } else {
            args.push(getNameDivHTML(users[0], plain));
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

  public editPeerFolders(peerIds: number[], folderId: number) {
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

  public toggleDialogPin(peerId: number, filterId?: number) {
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

  public markDialogUnread(peerId: number, read?: true) {
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

  public migrateChecks(migrateFrom: number, migrateTo: number) {
    if(!this.migratedFromTo[migrateFrom] &&
      !this.migratedToFrom[migrateTo] &&
      appChatsManager.hasChat(-migrateTo)) {
      const fromChat = appChatsManager.getChat(-migrateFrom);
      if(fromChat &&
        fromChat.migrated_to &&
        fromChat.migrated_to.channel_id === -migrateTo) {
          this.migratedFromTo[migrateFrom] = migrateTo;
          this.migratedToFrom[migrateTo] = migrateFrom;

        //setTimeout(() => {
          rootScope.dispatchEvent('dialog_migrate', {migrateFrom, migrateTo});

          const dropped = this.dialogsStorage.dropDialog(migrateFrom);
          if(dropped.length) {
            rootScope.dispatchEvent('dialog_drop', {peerId: migrateFrom, dialog: dropped[0]});
          }
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

  public canEditMessage(message: any, kind: 'text' | 'poll' = 'text') {
    if(!message || !this.canMessageBeEdited(message, kind)) {
      return false;
    }

    // * second rule for saved messages, because there is no 'out' flag
    if(/* message.pFlags.out ||  */this.getMessagePeer(message) === appUsersManager.getSelf().id) {
      return true;
    }

    if((message.date < (tsNow(true) - rootScope.config.edit_time_limit) && 
      message.media?._ !== 'messageMediaPoll') || !message.pFlags.out) {
      return false;
    }

    return true;
  }

  public canDeleteMessage(message: any) {
    return message && (
      message.peerId > 0 
      || message.fromId === rootScope.myId 
      || appChatsManager.getChat(message.peerId)._ === 'chat' 
      || appChatsManager.hasRights(message.peerId, 'delete_messages')
    ) && !message.pFlags.is_outgoing;
  }

  public getReplyKeyboard(peerId: number) {
    return this.getHistoryStorage(peerId).reply_markup;
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

    const lastReplyMarkup = historyStorage.reply_markup;
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

      historyStorage.reply_markup = messageReplyMarkup;
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
      historyStorage.reply_markup = {
        _: 'replyKeyboardHide',
        mid: message.mid,
        pFlags: {}
      };
      // this.log('set', historyStorage.reply_markup)
      return true;
    }

    return false;
  }

  public getSearchStorage(peerId: number, inputFilter: MyInputMessagesFilter) {
    if(!this.searchesStorage[peerId]) this.searchesStorage[peerId] = {};
    if(!this.searchesStorage[peerId][inputFilter]) this.searchesStorage[peerId][inputFilter] = {history: []};
    return this.searchesStorage[peerId][inputFilter];
  }

  public getSearchCounters(peerId: number, filters: MessagesFilter[], canCache = true) {
    const func = (canCache ? apiManager.invokeApiCacheable : apiManager.invokeApi).bind(apiManager);
    return func('messages.getSearchCounters', {
      peer: appPeersManager.getInputPeerById(peerId),
      filters
    });
  }

  public getSearch({peerId, query, inputFilter, maxId, limit, nextRate, backLimit, threadId, folderId, minDate, maxDate}: {
    peerId?: number,
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
    if(!peerId) peerId = 0;
    if(!query) query = '';
    if(!inputFilter) inputFilter = {_: 'inputMessagesFilterEmpty'};
    if(limit === undefined) limit = 20;
    if(!nextRate) nextRate = 0;
    if(!backLimit) backLimit = 0;

    minDate = minDate ? minDate / 1000 | 0 : 0;
    maxDate = maxDate ? maxDate / 1000 | 0 : 0;

    const foundMsgs: Message.message[] = [];

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
      let filtering = true;

      const history = /* maxId ? storage.history.slice(storage.history.indexOf(maxId) + 1) :  */storage.history;

      if(storage !== undefined && history.length) {
        const neededContents: {
          [messageMediaType: string]: boolean
        } = {},
          neededDocTypes: string[] = [], 
          excludeDocTypes: string[] = []/* ,
          neededFlags: string[] = [] */;

        switch(inputFilter._) {
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

        if(filtering) {
          const storage = this.getMessagesStorage(peerId);
          for(let i = 0, length = history.length; i < length; i++) {
            const message = storage[history.slice[i]];

            if(!message) continue;
  
            //|| (neededContents['mentioned'] && message.totalEntities.find((e: any) => e._ === 'messageEntityMention'));
  
            let found = false;
            if(message.media && neededContents[message.media._] && !message.fwd_from) {
              if(message.media._ === 'messageMediaDocument') {
                if((neededDocTypes.length && !neededDocTypes.includes(message.media.document.type)) 
                  || excludeDocTypes.includes(message.media.document.type)) {
                  continue;
                }
              }
  
              found = true;
            } else if(neededContents['url'] && message.message) {
              const goodEntities = ['messageEntityTextUrl', 'messageEntityUrl'];
              if((message.totalEntities as MessageEntity[]).find(e => goodEntities.includes(e._)) || RichTextProcessor.matchUrl(message.message)) {
                found = true;
              }
            } else if(neededContents['avatar'] && message.action && ['messageActionChannelEditPhoto', 'messageActionChatEditPhoto', 'messageActionChannelEditVideo', 'messageActionChatEditVideo'].includes(message.action._)) {
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
        }
      }
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
        offset_id: this.getServerMessageId(maxId) || 0,
        add_offset: backLimit ? -backLimit : 0,
        max_id: 0,
        min_id: 0,
        hash: 0,
        top_msg_id: this.getServerMessageId(threadId) || 0
      }, {
        //timeout: APITIMEOUT,
        noErrorBox: true
      });
    } else {
      //var offsetDate = 0;
      let offsetPeerId = 0;
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

      searchResult.messages.forEach((message: any) => {
        const peerId = this.getMessagePeer(message);
        if(peerId < 0) {
          const chat = appChatsManager.getChat(-peerId);
          if(chat.migrated_to) {
            this.migrateChecks(peerId, -chat.migrated_to.channel_id);
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

  public subscribeRepliesThread(peerId: number, mid: number) {
    const repliesKey = peerId + '_' + mid;
    for(const threadKey in this.threadsToReplies) {
      if(this.threadsToReplies[threadKey] === repliesKey) return;
    }

    this.getDiscussionMessage(peerId, mid);
  }

  public generateThreadServiceStartMessage(message: Message.message) {
    const threadKey = message.peerId + '_' + message.mid;
    if(this.threadsServiceMessagesIdsStorage[threadKey]) return;

    const maxMessageId = this.getServerMessageId(Math.max(...this.getMidsByMessage(message)));
    const serviceStartMessage: Message.messageService = {
      _: 'messageService',
      pFlags: {
        is_single: true
      },
      id: this.generateMessageId(maxMessageId, true),
      date: message.date,
      from_id: {_: 'peerUser', user_id: 0}/* message.from_id */,
      peer_id: message.peer_id,
      action: {
        _: 'messageActionCustomAction',
        message: 'Discussion started'
      },
      reply_to: this.generateReplyHeader(message.id)
    };

    this.saveMessages([serviceStartMessage], {isOutgoing: true});
    this.threadsServiceMessagesIdsStorage[threadKey] = serviceStartMessage.mid;
  } 

  public getDiscussionMessage(peerId: number, mid: number) {
    return apiManager.invokeApiSingle('messages.getDiscussionMessage', {
      peer: appPeersManager.getInputPeerById(peerId),
      msg_id: this.getServerMessageId(mid)
    }).then(result => {
      appChatsManager.saveApiChats(result.chats);
      appUsersManager.saveApiUsers(result.users);
      this.saveMessages(result.messages);

      const message = this.filterMessages(result.messages[0], message => !!(message as Message.message).replies)[0] as Message.message;
      const threadKey = message.peerId + '_' + message.mid;

      this.generateThreadServiceStartMessage(message);
      
      const historyStorage = this.getHistoryStorage(message.peerId, message.mid);
      result.max_id = historyStorage.maxId = this.generateMessageId(result.max_id) || 0;
      result.read_inbox_max_id = historyStorage.readMaxId = this.generateMessageId(result.read_inbox_max_id ?? message.mid);
      result.read_outbox_max_id = historyStorage.readOutboxMaxId = this.generateMessageId(result.read_outbox_max_id) || 0;

      this.threadsToReplies[threadKey] = peerId + '_' + mid;

      return message;
    });
  }

  private handleNewMessage(peerId: number, mid: number) {
    if(this.newMessagesToHandle[peerId] === undefined) {
      this.newMessagesToHandle[peerId] = new Set();
    }

    this.newMessagesToHandle[peerId].add(mid);
    if(!this.newMessagesHandleTimeout) {
      this.newMessagesHandleTimeout = window.setTimeout(this.handleNewMessages, 0);
    }
  }

  handleNewMessages = () => {
    clearTimeout(this.newMessagesHandleTimeout);
    this.newMessagesHandleTimeout = 0;

    rootScope.dispatchEvent('history_multiappend', this.newMessagesToHandle);
    this.newMessagesToHandle = {};
  };

  handleNewDialogs = () => {
    let newMaxSeenId = 0;
    const obj = this.newDialogsToHandle;
    for(const peerId in obj) {
      const dialog = obj[peerId];
      if(!dialog) {
        this.reloadConversation(+peerId);
        delete obj[peerId];
      } else {
        this.dialogsStorage.pushDialog(dialog);
        if(!appPeersManager.isChannel(+peerId)) {
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

  public scheduleHandleNewDialogs(peerId?: number, dialog?: Dialog) {
    if(peerId !== undefined) {
      this.newDialogsToHandle[peerId] = dialog;
    }

    if(this.newDialogsHandlePromise) return this.newDialogsHandlePromise;
    return this.newDialogsHandlePromise = new Promise((resolve) => {
      setTimeout(() => {
        this.newDialogsHandlePromise = undefined;
        this.handleNewDialogs();
      }, 0);
    });
  }

  public deleteMessages(peerId: number, mids: number[], revoke?: boolean) {
    let promise: Promise<any>;

    const localMessageIds = mids.map(mid => this.getServerMessageId(mid));

    if(peerId < 0 && appPeersManager.isChannel(peerId)) {
      const channelId = -peerId;
      const channel = appChatsManager.getChat(channelId);
      if(!channel.pFlags.creator && !(channel.pFlags.editor && channel.pFlags.megagroup)) {
        const goodMsgIds: number[] = [];
        if(channel.pFlags.editor || channel.pFlags.megagroup) {
          mids.forEach((msgId, i) => {
            const message = this.getMessageByPeer(peerId, mids[i]);
            if(message.pFlags.out) {
              goodMsgIds.push(msgId);
            }
          });
        }

        if(!goodMsgIds.length) {
          return;
        }

        mids = goodMsgIds;
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

  // TODO: cancel notification by peer when this function is being called
  public readHistory(peerId: number, maxId = 0, threadId?: number, force = false) {
    // return Promise.resolve();
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
          msg_id: this.getServerMessageId(threadId),
          read_max_id: this.getServerMessageId(maxId)
        });
      }

      apiUpdatesManager.processLocalUpdate({
        _: 'updateReadChannelDiscussionInbox',
        channel_id: -peerId,
        top_msg_id: threadId,
        read_max_id: maxId
      });
    } else if(appPeersManager.isChannel(peerId)) {
      if(!historyStorage.readPromise) {
        apiPromise = apiManager.invokeApi('channels.readHistory', {
          channel: appChatsManager.getChannelInput(-peerId),
          max_id: this.getServerMessageId(maxId)
        });
      }

      apiUpdatesManager.processLocalUpdate({
        _: 'updateReadChannelInbox',
        max_id: maxId,
        channel_id: -peerId,
        still_unread_count: undefined,
        pts: undefined
      });
    } else {
      if(!historyStorage.readPromise) {
        apiPromise = apiManager.invokeApi('messages.readHistory', {
          peer: appPeersManager.getInputPeerById(peerId),
          max_id: this.getServerMessageId(maxId)
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

      this.log('readHistory: promise finally', maxId, historyStorage.readMaxId);

      if(historyStorage.readMaxId > maxId) {
        this.readHistory(peerId, historyStorage.readMaxId, threadId, true);
      }
    });

    return historyStorage.readPromise = apiPromise;
  }

  public readAllHistory(peerId: number, threadId?: number, force = false) {
    const historyStorage = this.getHistoryStorage(peerId, threadId);
    if(historyStorage.maxId) {
      this.readHistory(peerId, historyStorage.maxId, threadId, force); // lol
    }
  }

  public readMessages(peerId: number, msgIds: number[]) {
    msgIds = msgIds.map(mid => this.getServerMessageId(mid));
    if(peerId < 0 && appPeersManager.isChannel(peerId)) {
      const channelId = -peerId;
      apiManager.invokeApi('channels.readMessageContents', {
        channel: appChatsManager.getChannelInput(channelId),
        id: msgIds
      }).then(() => {
        apiUpdatesManager.processLocalUpdate({
          _: 'updateChannelReadMessagesContents',
          channel_id: channelId,
          messages: msgIds
        });
      });
    } else {
      apiManager.invokeApi('messages.readMessageContents', {
        id: msgIds
      }).then((affectedMessages) => {
        apiUpdatesManager.processLocalUpdate({
          _: 'updateReadMessagesContents',
          messages: msgIds,
          pts: affectedMessages.pts,
          pts_count: affectedMessages.pts_count
        });
      });
    }
  }

  public getHistoryStorage(peerId: number, threadId?: number) {
    if(threadId) {
      //threadId = this.getLocalMessageId(threadId);
      if(!this.threadsStorage[peerId]) this.threadsStorage[peerId] = {};
      return this.threadsStorage[peerId][threadId] ?? (this.threadsStorage[peerId][threadId] = {count: null, history: new SlicedArray()});
    }

    return this.historiesStorage[peerId] ?? (this.historiesStorage[peerId] = {count: null, history: new SlicedArray()});
  }

  private handleNotifications = () => {
    window.clearTimeout(this.notificationsHandlePromise);
    this.notificationsHandlePromise = 0;

    //var timeout = $rootScope.idle.isIDLE && StatusManager.isOtherDeviceActive() ? 30000 : 1000;
    //const timeout = 1000;

    for(const _peerId in this.notificationsToHandle) {
      const peerId = +_peerId;

      if(rootScope.peerId === peerId && !rootScope.idle.isIDLE) {
        continue;
      }

      const notifyPeerToHandle = this.notificationsToHandle[peerId];

      Promise.all([
        appNotificationsManager.getNotifyPeerTypeSettings(),
        appNotificationsManager.getNotifySettings(appPeersManager.getInputNotifyPeerById(peerId, true))
      ]).then(([_, peerTypeNotifySettings]) => {
        const topMessage = notifyPeerToHandle.topMessage;
        if(appNotificationsManager.isPeerLocalMuted(peerId, true) || !topMessage.pFlags.unread) {
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
      //const mid = update.id;
      const mid = this.generateMessageId(update.id);
      const message = this.getMessageFromStorage(storage, mid);
      if(!message.deleted) {
        [this.getHistoryStorage(peerId), threadId ? this.getHistoryStorage(peerId, threadId) : undefined]
        .filter(Boolean)
        .forEach(storage => {
          storage.history.delete(tempId);
        });

        this.finalizePendingMessageCallbacks(storage, tempId, mid);
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
    this.saveMessages([message], {storage: {}});

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
      if(peerId < 0) {
        good = appChatsManager.isInChat(-peerId);
      }

      if(good) {
        const set = this.newUpdatesAfterReloadToHandle[peerId] ?? (this.newUpdatesAfterReloadToHandle[peerId] = new Set());
        if(set.has(update)) {
          this.log.error('here we go again', peerId);
          return;
        }

        this.scheduleHandleNewDialogs(peerId);
        set.add(update);
      }

      return;
    }

    /* if(update._ === 'updateNewChannelMessage') {
      const chat = appChatsManager.getChat(-peerId);
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

    if(historyStorage.history.findSlice(message.mid)) {
      return false;
    }

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

    if(this.mergeReplyKeyboard(historyStorage, message)) {
      rootScope.dispatchEvent('history_reply_markup', {peerId});
    }

    const fromId = message.fromId;
    if(fromId > 0 && !message.pFlags.out && message.from_id) {
      appUsersManager.forceUserOnline(fromId, message.date);

      const action: SendMessageAction = {
        _: 'sendMessageCancelAction'
      };

      let update: Update.updateUserTyping | Update.updateChatUserTyping | Update.updateChannelUserTyping;
      if(peerId > 0) {
        update = {
          _: 'updateUserTyping',
          action,
          user_id: fromId
        };
      } else if(appPeersManager.isChannel(peerId)) {
        update = {
          _: 'updateChannelUserTyping',
          action,
          channel_id: -peerId,
          from_id: appPeersManager.getOutputPeer(fromId),
          top_msg_id: threadId ? this.getServerMessageId(threadId) : undefined
        };
      } else {
        update = {
          _: 'updateChatUserTyping',
          action,
          chat_id: -peerId,
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
      this.setDialogTopMessage(message, dialog);
      if(inboxUnread) {
        dialog.unread_count++;
      }
    }

    if(inboxUnread/*  && ($rootScope.selectedPeerID != peerID || $rootScope.idle.isIDLE) */) {
      const notifyPeer = peerId;
      let notifyPeerToHandle = this.notificationsToHandle[notifyPeer];
      if(notifyPeerToHandle === undefined) {
        notifyPeerToHandle = this.notificationsToHandle[notifyPeer] = {
          fwdCount: 0,
          fromId: 0
        };
      }

      if(notifyPeerToHandle.fromId !== fromId) {
        notifyPeerToHandle.fromId = fromId;
        notifyPeerToHandle.fwdCount = 0;
      }

      if((message as Message.message).fwd_from) {
        notifyPeerToHandle.fwdCount++;
      }

      notifyPeerToHandle.topMessage = message;

      if(!this.notificationsHandlePromise) {
        this.notificationsHandlePromise = window.setTimeout(this.handleNotifications, 0);
      }
    }
  };

  private onUpdateDialogUnreadMark = (update: Update.updateDialogUnreadMark) => {
    //this.log('updateDialogUnreadMark', update);
    const peerId = appPeersManager.getPeerId((update.peer as DialogPeer.dialogPeer).peer);
    const dialog = this.getDialogOnly(peerId);

    if(!dialog) {
      this.scheduleHandleNewDialogs(peerId);
    } else {
      if(!update.pFlags.unread) {
        delete dialog.pFlags.unread_mark;
      } else {
        dialog.pFlags.unread_mark = true;
      }

      rootScope.dispatchEvent('dialogs_multiupdate', {[peerId]: dialog});
      this.dialogsStorage.setDialogToState(dialog);
    }
  };

  private onUpdateEditMessage = (update: Update.updateEditMessage | Update.updateEditChannelMessage) => {
    const message = update.message as MyMessage;
    const peerId = this.getMessagePeer(message);
    const mid = this.generateMessageId(message.id);
    const storage = this.getMessagesStorage(peerId);
    if(storage[mid] === undefined) {
      return;
    }

    // console.trace(dT(), 'edit message', message)
    
    const oldMessage = this.getMessageFromStorage(storage, mid);
    this.saveMessages([message], {storage});
    const newMessage = this.getMessageFromStorage(storage, mid);

    this.handleEditedMessage(oldMessage, newMessage);

    const dialog = this.getDialogOnly(peerId);
    const isTopMessage = dialog && dialog.top_message === mid;
    if((message as Message.message).clear_history) {
      if(isTopMessage) {
        rootScope.dispatchEvent('dialog_flush', {peerId});
      }
    } else {
      rootScope.dispatchEvent('message_edit', {
        storage,
        peerId,
        mid
      });

      if(isTopMessage || (message as Message.message).grouped_id) {
        const updatedDialogs: {[peerId: number]: Dialog} = {};
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
    const maxId = this.generateMessageId((update as Update.updateReadChannelInbox).max_id || (update as Update.updateReadChannelDiscussionInbox).read_max_id);
    const threadId = this.generateMessageId((update as Update.updateReadChannelDiscussionInbox).top_msg_id);
    const peerId = channelId ? -channelId : appPeersManager.getPeerId((update as Update.updateReadHistoryInbox).peer);

    const isOut = update._ === 'updateReadHistoryOutbox' || update._ === 'updateReadChannelOutbox' || update._ === 'updateReadChannelDiscussionOutbox' ? true : undefined;

    const storage = this.getMessagesStorage(peerId);
    const history = getObjectKeysAndSort(storage, 'desc');
    const foundDialog = this.getDialogOnly(peerId);
    const stillUnreadCount = (update as Update.updateReadChannelInbox).still_unread_count;
    let newUnreadCount = 0;
    let foundAffected = false;

    //this.log.warn(dT(), 'read', peerId, isOut ? 'out' : 'in', maxId)

    const historyStorage = this.getHistoryStorage(peerId, threadId);

    if(peerId > 0 && isOut) {
      appUsersManager.forceUserOnline(peerId);
    }

    if(threadId) {
      const repliesKey = this.threadsToReplies[peerId + '_' + threadId];
      if(repliesKey) {
        const [peerId, mid] = repliesKey.split('_').map(n => +n);
        this.updateMessage(peerId, mid, 'replies_updated');
      }
    }

    for(let i = 0, length = history.length; i < length; i++) {
      const messageId = history[i];
      if(messageId > maxId) {
        continue;
      }
      
      const message = storage[messageId];

      if(message.pFlags.out !== isOut) {
        continue;
      }

      if(!message.pFlags.unread) {
        break;
      }

      if(threadId) {
        const replyTo = message.reply_to as MessageReplyHeader;
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

        if(!message.pFlags.out && !threadId && foundDialog && stillUnreadCount === undefined) {
          newUnreadCount = --foundDialog.unread_count;
        }
        
        appNotificationsManager.cancel('msg' + messageId);
      }
    }

    if(isOut) historyStorage.readOutboxMaxId = maxId;
    else historyStorage.readMaxId = maxId;

    if(!threadId && foundDialog) {
      if(isOut) foundDialog.read_outbox_max_id = maxId;
      else foundDialog.read_inbox_max_id = maxId;

      if(!isOut) {
        if(newUnreadCount < 0 || !this.getReadMaxIdIfUnread(peerId)) {
          foundDialog.unread_count = 0;
        } else if(newUnreadCount && foundDialog.top_message > maxId) {
          foundDialog.unread_count = newUnreadCount;
        }
      }
      
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
          const [peerId, mid] = this.threadsToReplies[threadKey].split('_').map(n => +n);
          rootScope.dispatchEvent('replies_updated', this.getMessageByPeer(peerId, mid));
        }
      }
    }
  };

  private onUpdateReadMessagesContents = (update: Update.updateChannelReadMessagesContents | Update.updateReadMessagesContents) => {
    const channelId = (update as Update.updateChannelReadMessagesContents).channel_id;
    const mids = (update as Update.updateReadMessagesContents).messages.map(id => this.generateMessageId(id));
    const peerId = channelId ? -channelId : this.getMessageById(mids[0]).peerId;
    for(const mid of mids) {
      const message = this.getMessageByPeer(peerId, mid);
      if(!message.deleted) {
        delete message.pFlags.media_unread;
        this.setDialogToStateIfMessageIsTop(message);
      }
    }

    rootScope.dispatchEvent('messages_media_read', {peerId, mids});
  };

  private onUpdateChannelAvailableMessages = (update: Update.updateChannelAvailableMessages) => {
    const channelId: number = update.channel_id;
    const messages: number[] = [];
    const peerId: number = -channelId;
    const history = this.getHistoryStorage(peerId).history.slice;
    if(history.length) {
      history.forEach((msgId: number) => {
        if(!update.available_min_id || msgId <= update.available_min_id) {
          messages.push(msgId);
        }
      });
    }

    (update as any as Update.updateDeleteChannelMessages).messages = messages;
    this.onUpdateDeleteMessages(update as any as Update.updateDeleteChannelMessages);
  };

  private onUpdateDeleteMessages = (update: Update.updateDeleteMessages | Update.updateDeleteChannelMessages) => {
    const channelId: number = (update as Update.updateDeleteChannelMessages).channel_id;
    //const messages = (update as any as Update.updateDeleteChannelMessages).messages;
    const messages = (update as any as Update.updateDeleteChannelMessages).messages.map(id => this.generateMessageId(id));
    const peerId: number = channelId ? -channelId : this.getMessageById(messages[0]).peerId;
    
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
      const splitted = threadKey.split('_');
      return this.getHistoryStorage(+splitted[0], +splitted[1]);
    });

    [this.getHistoryStorage(peerId)].concat(threadsStorages).forEach(historyStorage => {
      for(const mid in historyUpdated.msgs) {
        historyStorage.history.delete(+mid);
      }
      if(historyUpdated.count &&
        historyStorage.count !== null &&
        historyStorage.count > 0) {
        historyStorage.count -= historyUpdated.count;
        if(historyStorage.count < 0) {
          historyStorage.count = 0;
        }
      }
    });

    rootScope.dispatchEvent('history_delete', {peerId, msgs: historyUpdated.msgs});

    const foundDialog = this.getDialogOnly(peerId);
    if(foundDialog) {
      if(historyUpdated.unread) {
        foundDialog.unread_count -= historyUpdated.unread;

        rootScope.dispatchEvent('dialog_unread', {peerId});
      }

      if(historyUpdated.msgs[foundDialog.top_message]) {
        this.reloadConversation(peerId);
      }
    }
  };

  private onUpdateChannel = (update: Update.updateChannel) => {
    const channelId: number = update.channel_id;
    const peerId = -channelId;
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
        this.reloadConversation(-channelId);
      } else {
        if(dialog) {
          this.dialogsStorage.dropDialog(peerId);
          rootScope.dispatchEvent('dialog_drop', {peerId, dialog});
        }
      }
    }
  };

  private onUpdateChannelReload = (update: Update.updateChannelReload) => {
    const channelId = update.channel_id;
    const peerId = -channelId;

    this.dialogsStorage.dropDialog(peerId);

    delete this.historiesStorage[peerId];
    this.reloadConversation(-channelId).then(() => {
      rootScope.dispatchEvent('history_reload', peerId);
    });
  };
  
  private onUpdateChannelMessageViews = (update: Update.updateChannelMessageViews) => {
    const views = update.views;
    //const mid = update.id;
    const mid = this.generateMessageId(update.id);
    const message = this.getMessageByPeer(-update.channel_id, mid);
    if(!message.deleted && message.views && message.views < views) {
      message.views = views;
      rootScope.dispatchEvent('message_views', {mid, views});
    }
  };

  private onUpdateServiceNotification = (update: Update.updateServiceNotification) => {
    //this.log('updateServiceNotification', update);
    const fromId = 777000;
    const peerId = fromId;
    const messageId = this.generateTempMessageId(peerId);
    const message: any = {
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
        access_hash: 0,
        first_name: 'Telegram',
        phone: '42777'
      }]);
    }
    this.saveMessages([message], {isOutgoing: true});

    if(update.inbox_date) {
      this.pendingTopMsgs[peerId] = messageId;
      this.onUpdateNewMessage({
        _: 'updateNewMessage',
        message
      } as any);
    }
  };

  private onUpdatePinnedMessages = (update: Update.updatePinnedMessages | Update.updatePinnedChannelMessages) => {
    const channelId = update._ === 'updatePinnedChannelMessages' ? update.channel_id : undefined;
    const peerId = channelId ? -channelId : appPeersManager.getPeerId((update as Update.updatePinnedMessages).peer);

    /* const storage = this.getSearchStorage(peerId, 'inputMessagesFilterPinned');
    if(storage.count !== storage.history.length) {
      if(storage.count !== undefined) {
        delete this.searchesStorage[peerId]['inputMessagesFilterPinned'];  
      }

      rootScope.broadcast('peer_pinned_messages', peerId);
      break;
    } */

    const messages = update.messages.map(id => this.generateMessageId(id)); 

    const storage = this.getMessagesStorage(peerId);
    const missingMessages = messages.filter(mid => !storage[mid]);
    const getMissingPromise = missingMessages.length ? Promise.all(missingMessages.map(mid => this.wrapSingleMessage(peerId, mid))) : Promise.resolve();
    getMissingPromise.finally(() => {
      const werePinned = update.pFlags?.pinned;
      if(werePinned) {
        for(const mid of messages) {
          //storage.history.push(mid);
          const message = storage[mid];
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
          const message = storage[mid];
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
      const mid = this.generateMessageId(message.id);

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
      const mids = update.messages.map(id => this.generateMessageId(id));
      this.handleDeletedMessages(peerId, storage, mids);

      rootScope.dispatchEvent('scheduled_delete', {peerId, mids});
    }
  };

  public setDialogToStateIfMessageIsTop(message: any) {
    const dialog = this.getDialogOnly(message.peerId);
    if(dialog && dialog.top_message === message.mid) {
      this.dialogsStorage.setDialogToState(dialog);
    }
  }

  private updateMessageRepliesIfNeeded(threadMessage: MyMessage) {
    try { // * на всякий случай, скорее всего это не понадобится
      const threadKey = this.getThreadKey(threadMessage);
      if(threadKey) {
        const repliesKey = this.threadsToReplies[threadKey];
        if(repliesKey) {
          const [peerId, mid] = repliesKey.split('_').map(n => +n);

          this.updateMessage(peerId, mid, 'replies_updated');
        }
      }
    } catch(err) {
      this.log.error('incrementMessageReplies err', err, threadMessage);
    }
  }

  private getThreadKey(threadMessage: MyMessage) {
    let threadKey = '';
    if(threadMessage.peerId < 0 && threadMessage.reply_to) {
      const threadId = threadMessage.reply_to.reply_to_top_id || threadMessage.reply_to.reply_to_msg_id;
      threadKey = threadMessage.peerId + '_' + threadId;
    }

    return threadKey;
  }

  public updateMessage(peerId: number, mid: number, broadcastEventName?: 'replies_updated'): Promise<Message.message> {
    const promise: Promise<Message.message> = this.wrapSingleMessage(peerId, mid, true).then(() => {
      const message = this.getMessageByPeer(peerId, mid);

      if(broadcastEventName) {
        rootScope.dispatchEvent(broadcastEventName, message);
      }

      return message;
    });
    
    return promise;
  }

  private checkPendingMessage(message: any) {
    const randomId = this.pendingByMessageId[message.mid];
    let pendingMessage: any;
    if(randomId) {
      const pendingData = this.pendingByRandomId[randomId];
      if(pendingMessage = this.finalizePendingMessage(randomId, message)) {
        rootScope.dispatchEvent('history_update', {storage: pendingData.storage, peerId: message.peerId, mid: message.mid});
      }

      delete this.pendingByMessageId[message.mid];
    }

    return pendingMessage;
  }

  public mutePeer(peerId: number, mute?: boolean) {
    const settings: InputPeerNotifySettings = {
      _: 'inputPeerNotifySettings'
    };

    if(mute === undefined) {
      mute = !appNotificationsManager.isPeerLocalMuted(peerId, false);
    }
    
    settings.mute_until = mute ? 0x7FFFFFFF : 0;

    return appNotificationsManager.updateNotifySettings({
      _: 'inputNotifyPeer',
      peer: appPeersManager.getInputPeerById(peerId)
    }, settings);
  }

  public canWriteToPeer(peerId: number, threadId?: number) {
    if(peerId < 0) {
      //const isChannel = appPeersManager.isChannel(peerId);
      const hasRights = /* isChannel &&  */appChatsManager.hasRights(-peerId, 'send_messages', undefined, !!threadId); 
      return /* !isChannel ||  */hasRights;
    } else {
      return appUsersManager.canSendToUser(peerId);
    }
  }

  public finalizePendingMessage(randomId: string, finalMessage: any) {
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

      const message = this.getMessageFromStorage(storage, tempId);
      if(!message.deleted) {
        delete message.pFlags.is_outgoing;
        delete message.pending;
        delete message.error;
        delete message.random_id;
        delete message.send;

        rootScope.dispatchEvent('messages_pending');
      }
      
      delete this.pendingByRandomId[randomId];

      this.finalizePendingMessageCallbacks(storage, tempId, finalMessage.mid);

      return message;
    }

    return false;
  }

  public finalizePendingMessageCallbacks(storage: MessagesStorage, tempId: number, mid: number) {
    const message = this.getMessageFromStorage(storage, mid);
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
    if(message.media) {
      if(message.media.photo) {
        const photo = appPhotosManager.getPhoto('' + tempId);
        if(/* photo._ !== 'photoEmpty' */photo) {
          const newPhoto = message.media.photo as MyPhoto;
          const newPhotoSize = newPhoto.sizes[newPhoto.sizes.length - 1];
          const cacheContext = appDownloadManager.getCacheContext(newPhoto, newPhotoSize.type);
          const oldCacheContext = appDownloadManager.getCacheContext(photo, 'full');
          Object.assign(cacheContext, oldCacheContext);

          const photoSize = newPhoto.sizes[newPhoto.sizes.length - 1] as PhotoSize.photoSize;

          const downloadOptions = appPhotosManager.getPhotoDownloadOptions(newPhoto, photoSize);
          const fileName = getFileNameByLocation(downloadOptions.location);
          appDownloadManager.fakeDownload(fileName, oldCacheContext.url);
        }
      } else if(message.media.document) {
        const doc = appDocsManager.getDoc('' + tempId);
        if(doc) {
          if(/* doc._ !== 'documentEmpty' &&  */doc.type && doc.type !== 'sticker') {
            const newDoc = message.media.document;
            const cacheContext = appDownloadManager.getCacheContext(newDoc);
            const oldCacheContext = appDownloadManager.getCacheContext(doc);
            Object.assign(cacheContext, oldCacheContext);

            const fileName = appDocsManager.getInputFileName(newDoc);
            appDownloadManager.fakeDownload(fileName, oldCacheContext.url);
          }
        }
      } else if(message.media.poll) {
        delete appPollsManager.polls[tempId];
        delete appPollsManager.results[tempId];
      }
    }

    const tempMessage = this.getMessageFromStorage(storage, tempId);
    delete storage[tempId];
    
    this.handleReleasingMessage(tempMessage);

    rootScope.dispatchEvent('message_sent', {storage, tempId, tempMessage, mid});
  }

  public incrementMaxSeenId(maxId: number) {
    if(!maxId || !(!this.maxSeenId || maxId > this.maxSeenId)) {
      return false;
    }

    this.maxSeenId = maxId;
    appStateManager.pushToState('maxSeenMsgId', maxId);

    apiManager.invokeApi('messages.receivedMessages', {
      max_id: this.getServerMessageId(maxId)
    });
  }

  private notifyAboutMessage(message: MyMessage, options: Partial<{
    fwdCount: number,
    peerTypeNotifySettings: PeerNotifySettings
  }> = {}) {
    const peerId = this.getMessagePeer(message);
    const notification: NotifyOptions = {};
    const peerString = appPeersManager.getPeerString(peerId);
    let notificationMessage: string;

    if(options.peerTypeNotifySettings.show_previews) {
      if(message._ === 'message' && message.fwd_from && options.fwdCount) {
        notificationMessage = I18n.format('Notifications.Forwarded', true, [options.fwdCount]);
      } else {
        notificationMessage = this.wrapMessageForReply(message, undefined, undefined, true);
      }
    } else {
      notificationMessage = I18n.format('Notifications.New', true);
    }

    notification.title = appPeersManager.getPeerTitle(peerId, true);
    if(peerId < 0 && message.fromId !== message.peerId) {
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
        if(message.pFlags.unread) {
          notification.image = url;
          appNotificationsManager.notify(notification);
        }
      });
    } else {
      appNotificationsManager.notify(notification);
    }
  }

  public getScheduledMessagesStorage(peerId: number) {
    return this.scheduledMessagesStorage[peerId] ?? (this.scheduledMessagesStorage[peerId] = this.createMessageStorage());
  }

  public getScheduledMessages(peerId: number): Promise<number[]> {
    if(!this.canWriteToPeer(peerId)) return Promise.resolve([]);

    const storage = this.getScheduledMessagesStorage(peerId);
    if(Object.keys(storage).length) {
      return Promise.resolve(Object.keys(storage).map(id => +id));
    }

    return apiManager.invokeApiSingle('messages.getScheduledHistory', {
      peer: appPeersManager.getInputPeerById(peerId),
      hash: 0
    }).then(historyResult => {
      if(historyResult._ !== 'messages.messagesNotModified') {
        appUsersManager.saveApiUsers(historyResult.users);
        appChatsManager.saveApiChats(historyResult.chats);
        
        const storage = this.getScheduledMessagesStorage(peerId);
        this.saveMessages(historyResult.messages, {storage, isScheduled: true});
        return Object.keys(storage).map(id => +id);
      }
      
      return [];
    });
  }

  public sendScheduledMessages(peerId: number, mids: number[]) {
    return apiManager.invokeApi('messages.sendScheduledMessages', {
      peer: appPeersManager.getInputPeerById(peerId),
      id: mids.map(mid => this.getServerMessageId(mid))
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public deleteScheduledMessages(peerId: number, mids: number[]) {
    return apiManager.invokeApi('messages.deleteScheduledMessages', {
      peer: appPeersManager.getInputPeerById(peerId),
      id: mids.map(mid => this.getServerMessageId(mid))
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public getMessageWithReplies(message: Message.message) {
    if(message.peerId !== REPLIES_PEER_ID) {
      message = this.filterMessages(message, message => !!(message as Message.message).replies)[0] as any;
      if(!(message && message.replies && message.replies.pFlags.comments && message.replies.channel_id !== 777)) {
        return;
      }
    }

    return message;
  }

  public isFetchIntervalNeeded(peerId: number) {
    return peerId < 0 && !appChatsManager.isInChat(peerId);
  }

  public async getNewHistory(peerId: number, threadId?: number) {
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
  public getHistory(peerId: number, maxId = 0, limit: number, backLimit?: number, threadId?: number): Promise<HistoryResult> | HistoryResult {
    const historyStorage = this.getHistoryStorage(peerId, threadId);

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

  public fillHistoryStorage(peerId: number, offset_id: number, limit: number, add_offset: number, historyStorage: HistoryStorage, threadId?: number): Promise<void> {
    return this.requestHistory(peerId, offset_id, limit, add_offset, undefined, threadId).then((historyResult) => {
      const {offset_id_offset, count, messages} = historyResult as MessagesMessages.messagesMessagesSlice;

      historyStorage.count = count || messages.length;
      const offsetIdOffset = offset_id_offset || 0;

      const topWasMeantToLoad = add_offset < 0 ? limit + add_offset : limit;

      const isTopEnd = offsetIdOffset >= (historyStorage.count - topWasMeantToLoad) || historyStorage.count < topWasMeantToLoad;
      const isBottomEnd = !offsetIdOffset || (add_offset < 0 && (offsetIdOffset + add_offset) <= 0);

      /* if(!maxId && historyResult.messages.length) {
        maxId = this.incrementMessageId((historyResult.messages[0] as MyMessage).mid, 1);
      }

      const wasTotalCount = historyStorage.history.length; */

      const mids = messages.map((message) => {
        if(this.mergeReplyKeyboard(historyStorage, message as MyMessage)) {
          rootScope.dispatchEvent('history_reply_markup', {peerId});
        }

        return (message as MyMessage).mid;
      });

      // * add bound manually. 
      // * offset_id will be inclusive only if there is 'add_offset' <= -1 (-1 - will only include the 'offset_id')
      if(offset_id && !mids.includes(offset_id) && offsetIdOffset < historyStorage.count) {
        let i = 0;
        for(const length = mids.length; i < length; ++i) {
          if(offset_id > mids[i]) {
            break;
          }
        }

        mids.splice(i, 0, offset_id);
      }
      
      const slice = historyStorage.history.insertSlice(mids) || historyStorage.history.slice;
      if(isTopEnd) {
        slice.setEnd(SliceEnd.Top);
      }
  
      if(isBottomEnd) {
        slice.setEnd(SliceEnd.Bottom);
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

  public requestHistory(peerId: number, maxId: number, limit = 0, offset = 0, offsetDate = 0, threadId = 0): Promise<Exclude<MessagesMessages, MessagesMessages.messagesMessagesNotModified>> {
    //console.trace('requestHistory', peerId, maxId, limit, offset);

    //rootScope.broadcast('history_request');

    const options: any = {
      peer: appPeersManager.getInputPeerById(peerId),
      offset_id: this.getServerMessageId(maxId) || 0,
      offset_date: offsetDate,
      add_offset: offset,
      limit,
      max_id: 0,
      min_id: 0,
      hash: 0
    };

    if(threadId) {
      options.msg_id = this.getServerMessageId(threadId) || 0;
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
        apiUpdatesManager.addChannelState(-peerId, (historyResult as MessagesMessages.messagesChannelMessages).pts);
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
          let channel = appChatsManager.getChat(-peerId);
          channel = {_: 'channelForbidden', access_hash: channel.access_hash, title: channel.title};
          apiUpdatesManager.processUpdateMessage({
            _: 'updates',
            updates: [{
              _: 'updateChannel',
              channel_id: -peerId
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
        let promises: Promise<void>[] = [];
        
        for(const peerId in this.needSingleMessages) {
          const mids = this.needSingleMessages[peerId];
          delete this.needSingleMessages[peerId];
    
          const msgIds: InputMessage[] = mids.map((msgId: number) => {
            return {
              _: 'inputMessageID',
              id: this.getServerMessageId(msgId)
            };
          });
    
          let promise: Promise<MethodDeclMap['channels.getMessages']['res'] | MethodDeclMap['messages.getMessages']['res']>;
          if(+peerId < 0 && appPeersManager.isChannel(+peerId)) {
            promise = apiManager.invokeApiSingle('channels.getMessages', {
              channel: appChatsManager.getChannelInput(-+peerId),
              id: msgIds
            });
          } else {
            promise = apiManager.invokeApiSingle('messages.getMessages', {
              id: msgIds
            });
          }
    
          promises.push(promise.then(getMessagesResult => {
            if(getMessagesResult._ !== 'messages.messagesNotModified') {
              appUsersManager.saveApiUsers(getMessagesResult.users);
              appChatsManager.saveApiChats(getMessagesResult.chats);
              this.saveMessages(getMessagesResult.messages);
            }
    
            rootScope.dispatchEvent('messages_downloaded', {peerId: +peerId, mids});
          }));
        }

        Promise.all(promises).finally(() => {
          this.fetchSingleMessagesPromise = null;
          if(Object.keys(this.needSingleMessages).length) this.fetchSingleMessages();
          resolve();
        });
      }, 0);
    });
  }

  public wrapSingleMessage(peerId: number, msgId: number, overwrite = false): Promise<void> {
    if(!this.getMessageByPeer(peerId, msgId).deleted && !overwrite) {
      rootScope.dispatchEvent('messages_downloaded', {peerId, mids: [msgId]});
      return Promise.resolve();
    } else if(!this.needSingleMessages[peerId] || this.needSingleMessages[peerId].indexOf(msgId) === -1) {
      (this.needSingleMessages[peerId] ?? (this.needSingleMessages[peerId] = [])).push(msgId);
      return this.fetchSingleMessages();
    } else if(this.fetchSingleMessagesPromise) {
      return this.fetchSingleMessagesPromise;
    }
  }

  public setTyping(peerId: number, action: SendMessageAction): Promise<boolean> {
    let typing = this.typings[peerId];
    if(!rootScope.myId || 
      !peerId || 
      !this.canWriteToPeer(peerId) || 
      peerId === rootScope.myId ||
      typing?.type === action._
    ) {
      return Promise.resolve(false);
    }

    if(typing?.timeout) {
      clearTimeout(typing.timeout);
    }

    typing = this.typings[peerId] = {
      type: action._
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

  private handleReleasingMessage(message: MyMessage) {
    if('media' in message) {
      // @ts-ignore
      const c = message.media.webpage || message.media;
      const smth: Photo.photo | MyDocument = c.photo || c.document;

      if(smth?.file_reference) {
        referenceDatabase.deleteContext(smth.file_reference, {type: 'message', peerId: message.peerId, messageId: message.mid});
      }

      if('webpage' in message.media) {
        appWebPagesManager.deleteWebPageFromPending(message.media.webpage, message.mid);
      }
    }
  }

  private handleDeletedMessages(peerId: number, storage: MessagesStorage, messages: number[]) {
    const history: {
      count: number, 
      unread: number, 
      msgs: {[mid: number]: true},
      albums?: {[groupId: string]: Set<number>},
    } = {count: 0, unread: 0, msgs: {}} as any;

    for(const mid of messages) {
      const message: MyMessage = this.getMessageFromStorage(storage, mid);
      if(message.deleted) continue;

      this.handleReleasingMessage(message);

      this.updateMessageRepliesIfNeeded(message);

      if(!message.pFlags.out && !message.pFlags.is_outgoing && message.pFlags.unread) {
        history.unread++;
        appNotificationsManager.cancel('msg' + mid);
      }
      history.count++;
      history.msgs[mid] = true;

      message.deleted = true;

      if(message._ !== 'messageService' && message.grouped_id) {
        const groupedStorage = this.groupedMessagesStorage[message.grouped_id];
        if(groupedStorage) {
          delete groupedStorage[mid];

          if(!history.albums) history.albums = {};
          (history.albums[message.grouped_id] || (history.albums[message.grouped_id] = new Set())).add(mid);

          if(!Object.keys(groupedStorage).length) {
            delete history.albums;
            delete this.groupedMessagesStorage[message.grouped_id];
          }
        }
      }

      delete storage[mid];

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
  
  private handleEditedMessage(oldMessage: any, newMessage: any) {
    if(oldMessage.media?.webpage) {
      appWebPagesManager.deleteWebPageFromPending(oldMessage.media.webpage, oldMessage.mid);
    }
  }
}

const appMessagesManager = new AppMessagesManager();
MOUNT_CLASS_TO.appMessagesManager = appMessagesManager;
export default appMessagesManager;
