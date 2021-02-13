import { LazyLoadQueueBase } from "../../components/lazyLoadQueue";
import ProgressivePreloader from "../../components/preloader";
import { CancellablePromise, deferredPromise } from "../../helpers/cancellablePromise";
import { tsNow } from "../../helpers/date";
import { createPosterForVideo } from "../../helpers/files";
import { copy, defineNotNumerableProperties, getObjectKeysAndSort } from "../../helpers/object";
import { randomLong } from "../../helpers/random";
import { splitStringByLength, limitSymbols } from "../../helpers/string";
import { ChatFull, Dialog as MTDialog, DialogPeer, DocumentAttribute, InputMedia, InputMessage, InputNotifyPeer, InputPeerNotifySettings, InputSingleMedia, Message, MessageAction, MessageEntity, MessageFwdHeader, MessageMedia, MessageReplies, MessageReplyHeader, MessagesDialogs, MessagesFilter, MessagesMessages, MessagesPeerDialogs, MethodDeclMap, NotifyPeer, PhotoSize, SendMessageAction, Update } from "../../layer";
import { InvokeApiOptions } from "../../types";
import { langPack } from "../langPack";
import { logger, LogLevels } from "../logger";
import type { ApiFileManager } from '../mtproto/apiFileManager';
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import referenceDatabase, { ReferenceContext } from "../mtproto/referenceDatabase";
import serverTimeManager from "../mtproto/serverTimeManager";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import searchIndexManager from '../searchIndexManager';
import DialogsStorage from "../storages/dialogs";
import FiltersStorage from "../storages/filters";
//import { telegramMeWebService } from "../mtproto/mtproto";
import apiUpdatesManager from "./apiUpdatesManager";
import appChatsManager, { Channel } from "./appChatsManager";
import appDocsManager, { MyDocument } from "./appDocsManager";
import appDownloadManager from "./appDownloadManager";
import appPeersManager from "./appPeersManager";
import appPhotosManager, { MyPhoto } from "./appPhotosManager";
import appPollsManager from "./appPollsManager";
import appStateManager from "./appStateManager";
import appUsersManager from "./appUsersManager";
import appWebPagesManager from "./appWebPagesManager";
import appDraftsManager from "./appDraftsManager";
import pushHeavyTask from "../../helpers/heavyQueue";
import { getFileNameByLocation } from "../../helpers/fileName";
import appProfileManager from "./appProfileManager";
import DEBUG, { MOUNT_CLASS_TO } from "../../config/debug";

//console.trace('include');
// TODO: если удалить сообщение в непрогруженном диалоге, то при обновлении, из-за стейта, последнего сообщения в чатлисте не будет
// TODO: если удалить диалог находясь в папке, то он не удалится из папки и будет виден в настройках

const APITIMEOUT = 0;

export type HistoryStorage = {
  count: number | null,
  history: number[],

  maxId?: number,
  readPromise?: Promise<void>,
  readMaxId?: number,
  readOutboxMaxId?: number,

  maxOutId?: number,
  reply_markup?: any
};

export type HistoryResult = {
  count: number,
  history: number[],
  offsetIdOffset?: number
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
export class AppMessagesManager {
  public static MESSAGE_ID_INCREMENT = 0x10000;
  public static MESSAGE_ID_OFFSET = 0xFFFFFFFF;

  public messagesStorageByPeerId: {[peerId: string]: MessagesStorage} = {};
  public groupedMessagesStorage: {[groupId: string]: MessagesStorage} = {}; // will be used for albums
  public scheduledMessagesStorage: {[peerId: string]: MessagesStorage} = {};
  public historiesStorage: {
    [peerId: string]: HistoryStorage
  } = {};
  public threadsStorage: {
    [peerId: string]: {
      [threadId: string]: HistoryStorage
    }
  } = {};
  public searchesStorage: {
    [peerId: string]: Partial<{
      [inputFilter in MyInputMessagesFilter]: {
        count?: number,
        history: number[]
      }
    }>
  } = {};
  public pinnedMessages: {[peerId: string]: PinnedStorage} = {};

  public threadsServiceMessagesIdsStorage: {[peerId_threadId: string]: number} = {};
  public threadsToReplies: {
    [peerId_threadId: string]: string;
  } = {};

  public pendingByRandomId: {
    [randomId: string]: {
      peerId: number,
      tempId: number,
      storage: MessagesStorage
    }
  } = {};
  public pendingByMessageId: {[mid: string]: string} = {};
  public pendingAfterMsgs: any = {};
  public pendingTopMsgs: {[peerId: string]: number} = {};
  public sendFilePromise: CancellablePromise<void> = Promise.resolve();
  public tempNum = 0;
  public tempFinalizeCallbacks: {
    [tempId: string]: {
      [callbackName: string]: Partial<{
        deferred: CancellablePromise<void>, 
        callback: (message: any) => Promise<any>
      }>
    }
  } = {};
  
  public sendSmthLazyLoadQueue = new LazyLoadQueueBase(1);

  public needSingleMessages: {[peerId: string]: number[]} = {};
  private fetchSingleMessagesPromise: Promise<void> = null;

  public maxSeenId = 0;

  public migratedFromTo: {[peerId: number]: number} = {};
  public migratedToFrom: {[peerId: number]: number} = {};

  public newMessagesHandlePromise = 0;
  public newMessagesToHandle: {[peerId: string]: number[]} = {};
  public newDialogsHandlePromise = 0;
  public newDialogsToHandle: {[peerId: string]: {reload: true} | Dialog} = {};
  public newUpdatesAfterReloadToHandle: any = {};

  private reloadConversationsPromise: Promise<void>;
  private reloadConversationsPeers: number[] = [];

  private dialogsIndex = searchIndexManager.createIndex();
  private cachedResults: {
    query: string,
    count: number,
    dialogs: Dialog[],
    folderId: number
  } = {
    query: '',
    count: 0,
    dialogs: [],
    folderId: 0
  };

  private log = logger('MESSAGES', LogLevels.error | LogLevels.debug | LogLevels.log | LogLevels.warn);

  public dialogsStorage: DialogsStorage;
  public filtersStorage: FiltersStorage;

  private groupedTempId = 0;

  constructor() {
    this.dialogsStorage = new DialogsStorage(this, appChatsManager, appPeersManager, serverTimeManager);
    this.filtersStorage = new FiltersStorage(appPeersManager, appUsersManager, /* apiManager, */ rootScope);

    rootScope.on('apiUpdate', (e) => {
      this.handleUpdate(e);
    });

    rootScope.on('webpage_updated', (e) => {
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
        rootScope.broadcast('message_edit', {
          storage,
          peerId,
          mid
        });
      });
    });

    rootScope.on('draft_updated', (e) => {
      const {peerId, threadId, draft} = e;

      if(threadId) return;

      const dialog = this.getDialogByPeerId(peerId)[0];
      if(dialog && !threadId) {
        dialog.draft = draft;
        this.dialogsStorage.generateIndexForDialog(dialog);
        this.dialogsStorage.pushDialog(dialog);

        rootScope.broadcast('dialog_draft', {
          peerId,
          draft,
          index: dialog.index
        });
      } else {
        this.reloadConversation(peerId);
      }
    });

    appStateManager.addListener('save', () => {
      const messages: any[] = [];
      const dialogs: Dialog[] = [];
      const items: any[] = [];
      
      const processDialog = (dialog: MTDialog.dialog) => {
        const historyStorage = this.getHistoryStorage(dialog.peerId);
        const history = [].concat(historyStorage.history);
        //dialog = copy(dialog);
        let removeUnread = 0;
        for(const mid of history) {
          const message = this.getMessageByPeer(dialog.peerId, mid);
          if(/* message._ !== 'messageEmpty' &&  */!message.pFlags.is_outgoing) {
            messages.push(message);
      
            if(message.fromId !== dialog.peerId) {
              appStateManager.setPeer(message.fromId, appPeersManager.getPeer(message.fromId));
            }
    
            /* dialog.top_message = message.mid;
            this.dialogsStorage.generateIndexForDialog(dialog, false, message); */
    
            break;
          } else if(message.pFlags && message.pFlags.unread) {
            ++removeUnread;
          }
        }
    
        if(removeUnread && dialog.unread_count) dialog.unread_count -= removeUnread; 
    
        dialog.unread_count = Math.max(0, dialog.unread_count);
        dialogs.push(dialog);
    
        appStateManager.setPeer(dialog.peerId, appPeersManager.getPeer(dialog.peerId));
      };

      for(const folderId in this.dialogsStorage.byFolders) {
        const folder = this.dialogsStorage.getFolder(+folderId);
        
        for(let dialog of folder) {
          items.push([dialog]);
        }
      }

      return pushHeavyTask({
        items, 
        process: processDialog, 
        context: this
      }).then(() => {
        appStateManager.pushToState('dialogs', dialogs);
        appStateManager.pushToState('messages', messages);
        appStateManager.pushToState('filters', this.filtersStorage.filters);
        appStateManager.pushToState('allDialogsLoaded', this.dialogsStorage.allDialogsLoaded);
        appStateManager.pushToState('maxSeenMsgId', this.maxSeenId);
      });
    });

    appStateManager.getState().then(state => {
      if(state.maxSeenMsgId) {
        this.maxSeenId = state.maxSeenMsgId;
      }

      const messages = state.messages;
      if(messages) {
        /* let tempId = this.tempId;

        for(let message of messages) {
          if(message.id < tempId) {
            tempId = message.id;
          }
        }

        if(tempId !== this.tempId) {
          this.log('Set tempId to:', tempId);
          this.tempId = tempId;
        } */

        this.saveMessages(messages);
      }

      if(!state.dialogs || !Object.keys(state.dialogs).length) {
        state.allDialogsLoaded = {};
      }
      
      if(state.allDialogsLoaded) {
        this.dialogsStorage.allDialogsLoaded = state.allDialogsLoaded;
      }

      if(state.filters) {
        for(const filterId in state.filters) {
          this.filtersStorage.saveDialogFilter(state.filters[filterId], false);
        }
      }

      if(state.dialogs) {
        state.dialogs.forEachReverse(dialog => {
          dialog.top_message = this.getServerMessageId(dialog.top_message); // * fix outgoing message to avoid copying dialog

          this.saveConversation(dialog);

          // ! WARNING, убрать это когда нужно будет делать чтобы pending сообщения сохранялись
          const message = this.getMessageByPeer(dialog.peerId, dialog.top_message);
          if(message.deleted) {
            this.reloadConversation(dialog.peerId);
          }
        });
      }
    });
  }

  public getInputEntities(entities: MessageEntity[]) {
    var sendEntites = copy(entities);
    sendEntites.forEach((entity: any) => {
      if(entity._ === 'messageEntityMentionName') {
        entity._ = 'inputMessageEntityMentionName';
        entity.user_id = appUsersManager.getUserInput(entity.user_id);
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

    const MAX_LENGTH = 4096;
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
      rootScope.broadcast('messages_pending');
    };

    message.send = () => {
      toggleError(false);
      const sentRequestOptions: InvokeApiOptions = {};
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

      //this.log('sendText', message.mid);
      apiPromise.then((updates: any) => {
        //this.log('sendText sent', message.mid);
        if(updates._ === 'updateShortSentMessage') {
          message.date = updates.date;
          message.id = updates.id;
          message.media = updates.media;
          message.entities = updates.entities;

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
          };
        } else if(updates.updates) {
          updates.updates.forEach((update: any) => {
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

    let actionName = '';
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

      photo = {
        _: 'photo',
        id: '' + message.id,
        sizes: [{
          _: 'photoSize',
          w: options.width,
          h: options.height,
          type: 'full',
          location: null,
          size: file.size
        }],
        w: options.width,
        h: options.height
      } as any;

      defineNotNumerableProperties(photo, ['downloaded', 'url']);
      photo.downloaded = file.size;
      photo.url = options.objectURL || '';
      
      appPhotosManager.savePhoto(photo);
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

      defineNotNumerableProperties(document, ['downloaded', 'url']);
      // @ts-ignore
      document.downloaded = file.size;
      document.url = options.objectURL || '';

      if(isPhoto) {
        attributes.push({
          _: 'documentAttributeImageSize',
          w: options.width,
          h: options.height
        });

        thumbs.push({
          _: 'photoSize',
          w: options.width,
          h: options.height,
          type: 'full',
          location: null,
          size: file.size,
          url: options.objectURL
        });
      } else if(attachType === 'video') {
        if(options.thumbURL) {
          thumbs.push({
            _: 'photoSize',
            w: options.width,
            h: options.height,
            type: 'full',
            location: null,
            size: options.thumbBlob.size,
            url: options.thumbURL
          });
        }

        const thumb = thumbs[0] as PhotoSize.photoSize;
        const docThumb = appPhotosManager.getDocumentCachedThumb(document.id);
        docThumb.downloaded = thumb.size;
        docThumb.url = thumb.url;
      }

      /* if(thumbs.length) {
        const thumb = thumbs[0] as PhotoSize.photoSize;
        const docThumb = appPhotosManager.getDocumentCachedThumb(document.id);
        docThumb.downloaded = thumb.size;
        docThumb.url = thumb.url;
      } */
      
      appDocsManager.saveDoc(document);
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
          this.setTyping(peerId, 'sendMessageCancelAction');

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

      rootScope.broadcast('messages_pending');
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
            this.setTyping(peerId, {_: actionName, progress: percents | 0});
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
        this.setTyping(peerId, 'sendMessageCancelAction');

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

    if(options.clearDraft) {
      appDraftsManager.syncDraft(peerId, options.threadId);
    }
    
    // * test pending
    //return;

    const toggleError = (message: any, on: boolean) => {
      if(on) {
        message.error = true;
      } else {
        delete message.error;
      }

      rootScope.broadcast('messages_pending');
    };

    const inputPeer = appPeersManager.getInputPeerById(peerId);
    const invoke = (multiMedia: any[]) => {
      this.setTyping(peerId, 'sendMessageCancelAction');

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
      rootScope.broadcast('messages_pending');
    };

    message.send = () => {
      const sentRequestOptions: any = {};
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
        rootScope.broadcast('scheduled_new', {peerId, mid: messageId});
      }, 0);
    } else {
      if(options.threadId && this.threadsStorage[peerId]) {
        delete this.threadsStorage[peerId][options.threadId];
      }
      //if(options.threadId) {
        const historyStorage = this.getHistoryStorage(peerId/* , options.threadId */);
        historyStorage.history.unshift(messageId);
      //}

      /* const historyStorage = this.getHistoryStorage(peerId);
      historyStorage.history.unshift(messageId); */

      //if(!options.isGroupedItem) {
      this.saveMessages([message], {storage, isOutgoing: true});
      setTimeout(() => {
        rootScope.broadcast('history_append', {peerId, messageId, my: true});

        this.setDialogTopMessage(message);
      }, 0);
    }

    if(!options.isGroupedItem && options.clearDraft && !options.threadId) {
      appDraftsManager.syncDraft(peerId, options.threadId);
    }
    
    this.pendingByRandomId[message.random_id] = {peerId, tempId: messageId, storage};

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
      if(channelFull.linked_chat_id) {
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
    if(originalMessage.fromId === myId && !originalMessage.fwd_from) {
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

  public setDialogTopMessage(message: MyMessage, dialog: MTDialog.dialog = this.getDialogByPeerId(message.peerId)[0]) {
    if(dialog) {
      dialog.top_message = message.mid;
      
      const historyStorage = this.getHistoryStorage(message.peerId);
      historyStorage.maxId = message.mid;

      this.dialogsStorage.generateIndexForDialog(dialog, false, message);

      this.newDialogsToHandle[message.peerId] = dialog;
      this.scheduleHandleNewDialogs();
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
      const pos = historyStorage.history.indexOf(tempId);

      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updateDeleteMessages',
          messages: [tempId]
        }
      });

      if(pos !== -1) {
        historyStorage.history.splice(pos, 1);
      }

      delete this.pendingByRandomId[randomId];
      delete storage[tempId];

      return true;
    }

    return false;
  }

  public async getConversationsAll(query = '', folderId = 0) {
    const limit = 100, outDialogs: Dialog[] = [];
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
    const realFolderId = folderId > 1 ? 0 : folderId;
    let curDialogStorage = this.dialogsStorage.getFolder(folderId);

    if(query) {
      if(!limit || this.cachedResults.query !== query || this.cachedResults.folderId !== folderId) {
        this.cachedResults.query = query;
        this.cachedResults.folderId = folderId;

        const results = searchIndexManager.search(query, this.dialogsIndex);

        this.cachedResults.dialogs = [];

        for(const peerId in this.dialogsStorage.dialogs) {
          const dialog = this.dialogsStorage.dialogs[peerId];
          if(results[dialog.peerId] && dialog.folder_id === folderId) {
            this.cachedResults.dialogs.push(dialog);
          }
        }

        this.cachedResults.dialogs.sort((d1, d2) => d2.index - d1.index);

        this.cachedResults.count = this.cachedResults.dialogs.length;
      }

      curDialogStorage = this.cachedResults.dialogs;
    } else {
      this.cachedResults.query = '';
    }

    let offset = 0;
    if(offsetIndex > 0) {
      for(; offset < curDialogStorage.length; offset++) {
        if(offsetIndex > curDialogStorage[offset].index) {
          break;
        }
      }
    }

    if(query || this.dialogsStorage.allDialogsLoaded[realFolderId] || curDialogStorage.length >= offset + limit) {
      return Promise.resolve({
        dialogs: curDialogStorage.slice(offset, offset + limit),
        count: this.dialogsStorage.allDialogsLoaded[realFolderId] ? curDialogStorage.length : null,
        isEnd: this.dialogsStorage.allDialogsLoaded[realFolderId] && (offset + limit) >= curDialogStorage.length
      });
    }

    return this.getTopMessages(limit, realFolderId).then(totalCount => {
      //const curDialogStorage = this.dialogsStorage[folderId];

      offset = 0;
      if(offsetIndex > 0) {
        for(; offset < curDialogStorage.length; offset++) {
          if(offsetIndex > curDialogStorage[offset].index) {
            break;
          }
        }
      }

      //this.log.warn(offset, offset + limit, curDialogStorage.dialogs.length, this.dialogsStorage.dialogs.length);

      return {
        dialogs: curDialogStorage.slice(offset, offset + limit),
        count: totalCount,
        isEnd: this.dialogsStorage.allDialogsLoaded[realFolderId] && (offset + limit) >= curDialogStorage.length
      };
    });
  }

  public getReadMaxIdIfUnread(peerId: number, threadId?: number) {
    const historyStorage = this.getHistoryStorage(peerId, threadId);
    if(threadId) {
      const chatHistoryStorage = this.getHistoryStorage(peerId);
      const readMaxId = Math.max(chatHistoryStorage.readMaxId, historyStorage.readMaxId);
      const message = this.getMessageByPeer(peerId, historyStorage.maxId);
      return !message.pFlags.out && readMaxId < historyStorage.maxId ? readMaxId : 0;
    } else {
      const message = this.getMessageByPeer(peerId, historyStorage.maxId);
      const maxId = peerId > 0 ? Math.max(historyStorage.readMaxId, historyStorage.readOutboxMaxId) : historyStorage.readMaxId;
      return !message.pFlags.out && maxId < historyStorage.maxId ? maxId : 0;
    }
  }

  public getTopMessages(limit: number, folderId: number): Promise<number> {
    const dialogs = this.dialogsStorage.getFolder(folderId);
    let offsetId = 0;
    let offsetDate = 0;
    let offsetPeerId = 0;
    let offsetIndex = 0;

    if(this.dialogsStorage.dialogsOffsetDate[folderId]) {
      offsetDate = this.dialogsStorage.dialogsOffsetDate[folderId] + serverTimeManager.serverTimeOffset;
      offsetIndex = this.dialogsStorage.dialogsOffsetDate[folderId] * 0x10000;
    }

    // ! ВНИМАНИЕ: ОЧЕНЬ СЛОЖНАЯ ЛОГИКА:
    // ! если делать запрос сначала по папке 0, потом по папке 1, по индексу 0 в массиве будет один и тот же диалог, с dialog.pFlags.pinned, ЛОЛ???
    // ! т.е., с запросом folder_id: 1, и exclude_pinned: 0, в результате будут ещё и закреплённые с папки 0
    return apiManager.invokeApi('messages.getDialogs', {
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
      if(dialogsResult._ === 'messages.dialogsNotModified') return null;

      if(DEBUG) {
        this.log('messages.getDialogs result:', dialogsResult.dialogs, {...dialogsResult.dialogs[0]});
      }

      /* if(!offsetDate) {
        telegramMeWebService.setAuthorized(true);
      } */

      appUsersManager.saveApiUsers(dialogsResult.users);
      appChatsManager.saveApiChats(dialogsResult.chats);
      this.saveMessages(dialogsResult.messages);

      let maxSeenIdIncremented = offsetDate ? true : false;
      let hasPrepend = false;
      const noIdsDialogs: {[peerId: number]: Dialog} = {};
      (dialogsResult.dialogs as Dialog[]).forEachReverse(dialog => {
        //const d = Object.assign({}, dialog);
        // ! нужно передавать folderId, так как по папке !== 0 нет свойства folder_id
        this.saveConversation(dialog, dialog.folder_id ?? folderId);

        /* if(dialog.peerId === -1213511294) {
          this.log.error('lun bot', folderId, d);
        } */

        if(offsetIndex && dialog.index > offsetIndex) {
          this.newDialogsToHandle[dialog.peerId] = dialog;
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

        if(!maxSeenIdIncremented &&
            !appPeersManager.isChannel(appPeersManager.getPeerId(dialog.peer))) {
          this.incrementMaxSeenId(dialog.top_message);
          maxSeenIdIncremented = true;
        }
      });

      if(Object.keys(noIdsDialogs).length) {
        //setTimeout(() => { // test bad situation
          this.reloadConversation(Object.keys(noIdsDialogs).map(id => +id)).then(() => {
            rootScope.broadcast('dialogs_multiupdate', noIdsDialogs);
  
            for(let peerId in noIdsDialogs) {
              rootScope.broadcast('dialog_unread', {peerId: +peerId});
            }
          });
        //}, 10e3);
      }

      const count = (dialogsResult as MessagesDialogs.messagesDialogsSlice).count;

      if(!dialogsResult.dialogs.length ||
        !count ||
        dialogs.length >= count) {
        this.dialogsStorage.allDialogsLoaded[folderId] = true;
      }

      if(hasPrepend) {
        this.scheduleHandleNewDialogs();
      } else {
        rootScope.broadcast('dialogs_multiupdate', {});
      }

      return count;
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
      const originalMessage = this.getMessageByPeer(fromPeerId, mid);
      const message = this.generateOutgoingMessage(peerId, options);
      message.fwd_from = this.generateForwardHeader(peerId, originalMessage);

      (['entities', 'forwards', 'message', 'media', 'reply_markup', 'views'] as any as Array<keyof MyMessage>).forEach(key => {
        message[key] = originalMessage[key];
      });

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

    const sentRequestOptions: InvokeApiOptions = {};
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

  public reloadConversation(peerId: number | number[]) {
    [].concat(peerId).forEach(peerId => {
      if(!this.reloadConversationsPeers.includes(peerId)) {
        this.reloadConversationsPeers.push(peerId);
        //this.log('will reloadConversation', peerId);
      }
    });

    if(this.reloadConversationsPromise) return this.reloadConversationsPromise;
    return this.reloadConversationsPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        const peers = this.reloadConversationsPeers.map(peerId => appPeersManager.getInputDialogPeerById(peerId));
        this.reloadConversationsPeers.length = 0;

        apiManager.invokeApi('messages.getPeerDialogs', {peers}).then((result) => {
          this.applyConversations(result);
          resolve();
        }, reject).finally(() => {
          this.reloadConversationsPromise = null;
        });
      }, 0);
    });
  }

  private doFlushHistory(inputPeer: any, justClear?: true): Promise<true> {
    return apiManager.invokeApi('messages.deleteHistory', {
      just_clear: justClear,
      peer: inputPeer,
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

      return this.doFlushHistory(inputPeer, justClear);
    })
  }

  public async flushHistory(peerId: number, justClear?: true) {
    if(appPeersManager.isChannel(peerId)) {
      const promise = this.getHistory(peerId, 0, 1);

      const historyResult = promise instanceof Promise ? await promise : promise;

      const channelId = -peerId;
      const maxId = historyResult.history[0] || 0;
      return apiManager.invokeApi('channels.deleteHistory', {
        channel: appChatsManager.getChannelInput(channelId),
        max_id: maxId
      }).then(() => {
        apiUpdatesManager.processUpdateMessage({
          _: 'updateShort',
          update: {
            _: 'updateChannelAvailableMessages',
            channel_id: channelId,
            available_min_id: maxId
          }
        });

        return true;
      });
    }

    return this.doFlushHistory(appPeersManager.getInputPeerById(peerId), justClear).then(() => {
      delete this.historiesStorage[peerId];
      delete this.messagesStorageByPeerId[peerId];

      if(justClear) {
        rootScope.broadcast('dialog_flush', {peerId});
      } else {
        this.dialogsStorage.dropDialog(peerId);

        rootScope.broadcast('dialog_drop', {peerId});
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
      rootScope.broadcast('peer_pinned_hidden', {peerId, maxId: pinned.maxId});
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

  public updatePinnedMessage(peerId: number, mid: number, unpin?: true, silent?: true, oneSide?: true) {
    return apiManager.invokeApi('messages.updatePinnedMessage', {
      peer: appPeersManager.getInputPeerById(peerId),
      unpin,
      silent,
      pm_oneside: oneSide,
      id: this.getServerMessageId(mid)
    }).then(updates => {
      //this.log('pinned updates:', updates);
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public unpinAllMessages(peerId: number): Promise<boolean> {
    return apiManager.invokeApi('messages.unpinAllMessages', {
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

        rootScope.broadcast('peer_pinned_messages', {peerId, unpinAll: true});
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
    const dialog = this.getDialogByPeerId(peerId)[0];
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
    if(messageId <= q) {
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
    isOutgoing: true
  }> = {}) {
    let groups: Set<string>;
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

      const dialog = this.getDialogByPeerId(peerId)[0];
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

      const overwriting = !!message.peerId;
      if(!overwriting) {
        message.date -= serverTimeManager.serverTimeOffset;
      }
      
      //storage.generateIndex(message);
      const myId = appUsersManager.getSelf().id;

      message.peerId = peerId;
      if(message.peerId === myId/*  && !message.from_id && !message.fwd_from */) {
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
          case 'messageMediaGeoLive':
            message.media._ = 'messageMediaGeo';
            break;
        }
      }

      if(message.action) {
        let migrateFrom: number;
        let migrateTo: number;
        switch(message.action._) {
          //case 'messageActionChannelEditPhoto':
          case 'messageActionChatEditPhoto':
            message.action.photo = appPhotosManager.savePhoto(message.action.photo, mediaContext);
            if(isBroadcast) { // ! messageActionChannelEditPhoto не существует в принципе, это используется для перевода.
              message.action._ = 'messageActionChannelEditPhoto';
            }
            break;

          case 'messageActionChatEditTitle':
            if(isBroadcast) {
              message.action._ = 'messageActionChannelEditTitle';
            }
            break;

          case 'messageActionChatDeletePhoto':
            if(isBroadcast) {
              message.action._ = 'messageActionChannelDeletePhoto';
            }
            break;

          case 'messageActionChatAddUser':
            if(message.action.users.length === 1) {
              message.action.user_id = message.action.users[0];
              if(message.fromId === message.action.user_id) {
                if(isChannel) {
                  message.action._ = 'messageActionChatJoined';
                } else {
                  message.action._ = 'messageActionChatReturn';
                }
              }
            } else if(message.action.users.length > 1) {
              message.action._ = 'messageActionChatAddUsers';
            }
            break;

          case 'messageActionChatDeleteUser':
            if(message.fromId === message.action.user_id) {
              message.action._ = 'messageActionChatLeave';
            }
            break;

          case 'messageActionChannelMigrateFrom':
            migrateFrom = -message.action.chat_id;
            migrateTo = -channelId;
            break

          case 'messageActionChatMigrateTo':
            migrateFrom = -channelId;
            migrateTo = -message.action.channel_id;
            break;

          case 'messageActionHistoryClear':
            //apiMessage.deleted = true;
            message.clear_history = true;
            delete message.pFlags.out;
            delete message.pFlags.unread;
            break;

          case 'messageActionPhoneCall':
            delete message.fromId;
            message.action.type = 
              (message.pFlags.out ? 'out_' : 'in_') +
              (
                message.action.reason._ === 'phoneCallDiscardReasonMissed' ||
                message.action.reason._ === 'phoneCallDiscardReasonBusy'
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

      if(message.grouped_id) {
        if(!groups) {
          groups = new Set();
        }

        groups.add(message.grouped_id);
      } else {
        message.rReply = this.getRichReplyText(message);
      }

      if(message.message && message.message.length && !message.totalEntities) {
        const myEntities = RichTextProcessor.parseEntities(message.message);
        const apiEntities = message.entities || [];
        message.totalEntities = RichTextProcessor.mergeEntities(apiEntities, myEntities); // ! only in this order, otherwise bold and emoji formatting won't work
      }

      storage[mid] = message;
    });

    if(groups) {
      for(const groupId of groups) {
        const mids = this.groupedMessagesStorage[groupId];
        for(const mid in mids) {
          const message = this.groupedMessagesStorage[groupId][mid];
          message.rReply = this.getRichReplyText(message);
        }
      }
    }
  }

  public getRichReplyText(message: any, text: string = message.message, usingMids?: number[]) {
    let messageText = '';

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
          messageText += '<i>Album' + (text ? ', ' : '') + '</i>';
        }
      } else {
        usingFullAlbum = false;
      }

      if(!usingFullAlbum) {
        const media = message.media;
        switch(media._) {
          case 'messageMediaPhoto':
            messageText += '<i>Photo' + (message.message ? ', ' : '') + '</i>';
            break;
          case 'messageMediaDice':
            messageText += RichTextProcessor.wrapEmojiText(media.emoticon);
            break;
          case 'messageMediaGeo':
            messageText += '<i>Geolocation</i>';
            break;
          case 'messageMediaPoll':
            messageText += '<i>' + media.poll.rReply + '</i>';
            break;
          case 'messageMediaContact':
            messageText += '<i>Contact</i>';
            break;
          case 'messageMediaDocument':
            let document = media.document;
  
            if(document.type === 'video') {
              messageText = '<i>Video' + (message.message ? ', ' : '') + '</i>';
            } else if(document.type === 'voice') {
              messageText = '<i>Voice message</i>';
            } else if(document.type === 'gif') {
              messageText = '<i>GIF' + (message.message ? ', ' : '') + '</i>';
            } else if(document.type === 'round') {
              messageText = '<i>Video message' + (message.message ? ', ' : '') + '</i>';
            } else if(document.type === 'sticker') {
              messageText = (document.stickerEmoji || '') + '<i>Sticker</i>';
              text = '';
            } else {
              messageText = '<i>' + document.file_name + (message.message ? ', ' : '') + '</i>';
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
      const str = this.wrapMessageActionText(message);

      messageText = str ? '<i>' + str + '</i>' : '';
    }

    let messageWrapped = '';
    if(text) {
      text = limitSymbols(text, 100);

      const entities = RichTextProcessor.parseEntities(text.replace(/\n/g, ' '));

      messageWrapped = RichTextProcessor.wrapRichText(text, {
        noLinebreaks: true, 
        entities, 
        noLinks: true,
        noTextFormat: true
      });
    }

    return messageText + messageWrapped;
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

  public wrapMessageActionText(message: any) {
    const action = message.action as MessageAction;

    let str = '';
    if((action as MessageAction.messageActionCustomAction).message) {
      str = RichTextProcessor.wrapRichText((action as MessageAction.messageActionCustomAction).message, {noLinebreaks: true});
    } else {
      let _ = action._;
      let suffix = '';
      let l = '';

      const getNameDivHTML = (peerId: number) => {
        const title = appPeersManager.getPeerTitle(peerId);
        return title ? `<div class="name inline" data-peer-id="${peerId}">${title}</div> ` : '';
      };

      switch(action._) {
        case "messageActionPhoneCall": {
          _ += '.' + (action as any).type;

          const duration = action.duration;
          if(duration) {
            const d: string[] = [];
    
            d.push(duration % 60 + ' s');
            if(duration >= 60) d.push((duration / 60 | 0) + ' min');
            //if(duration >= 3600) d.push((duration / 3600 | 0) + ' h');
            suffix = ' (' + d.reverse().join(' ') + ')';
          }

          return langPack[_] + suffix;
        }

        case 'messageActionChatDeleteUser':
        // @ts-ignore
        case 'messageActionChatAddUsers':
        case 'messageActionChatAddUser': {
          const users: number[] = (action as MessageAction.messageActionChatAddUser).users || [(action as MessageAction.messageActionChatDeleteUser).user_id];

          l = langPack[_].replace('{}', users.map((userId: number) => getNameDivHTML(userId)).join(', '));
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
          
          l = langPack[_].replace('{}', anchorHTML);
          break;
        }

        default:
          str = langPack[_] || `[${action._}]`;
          break;
      }

      if(!l) {
        l = langPack[_];
        if(!l) {
          l = '[' + _ + ']';
        }
      }

      str = l[0].toUpperCase() === l[0] ? l : getNameDivHTML(message.fromId) + l + (suffix ? ' ' : '');
    }

    //this.log('message action:', action);

    return str;
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
      this.filtersStorage.toggleDialogPin(peerId, filterId);
      return;
    }

    const dialog = this.getDialogByPeerId(peerId)[0];
    if(!dialog) return Promise.reject();

    const pinned = dialog.pFlags?.pinned ? undefined : true;
    return apiManager.invokeApi('messages.toggleDialogPin', {
      peer: appPeersManager.getInputDialogPeerById(peerId),
      pinned
    }).then(bool => {
      if(bool) {
        const pFlags: Update.updateDialogPinned['pFlags'] = pinned ? {pinned} : {};
        this.handleUpdate({
          _: 'updateDialogPinned',
          peer: appPeersManager.getDialogPeer(peerId),
          folder_id: filterId,
          pFlags
        });
      }
    });
  }

  public markDialogUnread(peerId: number, read?: true) {
    const dialog = this.getDialogByPeerId(peerId)[0];
    if(!dialog) return Promise.reject();

    const unread = read || dialog.pFlags?.unread_mark ? undefined : true;
    return apiManager.invokeApi('messages.markDialogUnread', {
      peer: appPeersManager.getInputDialogPeerById(peerId),
      unread
    }).then(bool => {
      if(bool) {
        const pFlags: Update.updateDialogUnreadMark['pFlags'] = unread ? {unread} : {};
        this.handleUpdate({
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

        setTimeout(() => {
          const dropped = this.dialogsStorage.dropDialog(migrateFrom);
          if(dropped.length) {
            rootScope.broadcast('dialog_drop', {peerId: migrateFrom, dialog: dropped[0]});
          }

          rootScope.broadcast('dialog_migrate', {migrateFrom, migrateTo});
        }, 100);
      }
    }
  }

  public canMessageBeEdited(message: any, kind: 'text' | 'poll') {
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
    if(message.pFlags.out || this.getMessagePeer(message) === appUsersManager.getSelf().id) {
      return true;
    }

    if((message.date < tsNow(true) - (2 * 86400) && message.media?._ !== 'messageMediaPoll') || !message.pFlags.out) {
      return false;
    }

    return true;
  }

  public canDeleteMessage(message: any) {
    return message && (
      message.peerId > 0 
      || message.fromId === rootScope.myId 
      || appChatsManager.getChat(message.peerId)._ === 'chat' 
      || appChatsManager.hasRights(message.peerId, 'deleteRevoke')
    );
  }

  public applyConversations(dialogsResult: MessagesPeerDialogs.messagesPeerDialogs) {
    // * В эту функцию попадут только те диалоги, в которых есть read_inbox_max_id и read_outbox_max_id, в отличие от тех, что будут в getTopMessages

    // ! fix 'dialogFolder', maybe there is better way to do it, this only can happen by 'messages.getPinnedDialogs' by folder_id: 0
    dialogsResult.dialogs.forEachReverse((dialog, idx) => {
      if(dialog._ === 'dialogFolder') {
        dialogsResult.dialogs.splice(idx, 1);
      }
    });

    appUsersManager.saveApiUsers(dialogsResult.users);
    appChatsManager.saveApiChats(dialogsResult.chats);
    this.saveMessages(dialogsResult.messages);

    this.log('applyConversation', dialogsResult);

    const updatedDialogs: {[peerId: number]: Dialog} = {};
    (dialogsResult.dialogs as Dialog[]).forEach((dialog) => {
      const peerId = appPeersManager.getPeerId(dialog.peer);
      let topMessage = dialog.top_message;
      const topPendingMessage = this.pendingTopMsgs[peerId];
      if(topPendingMessage) {
        if(!topMessage 
          || (this.getMessageByPeer(peerId, topPendingMessage) as MyMessage).date > (this.getMessageByPeer(peerId, topMessage) as MyMessage).date) {
          dialog.top_message = topMessage = topPendingMessage;
          this.getHistoryStorage(peerId).maxId = topPendingMessage;
        }
      }

      /* const d = Object.assign({}, dialog);
      if(peerId === 239602833) {
        this.log.error('applyConversation lun', dialog, d);
      } */

      if(topMessage || (dialog.draft && dialog.draft._ === 'draftMessage')) {
        //const wasDialogBefore = this.getDialogByPeerID(peerId)[0];

        // here need to just replace, not FULL replace dialog! WARNING
        /* if(wasDialogBefore?.pFlags?.pinned && !dialog?.pFlags?.pinned) {
          this.log.error('here need to just replace, not FULL replace dialog! WARNING', wasDialogBefore, dialog);
          if(!dialog.pFlags) dialog.pFlags = {};
          dialog.pFlags.pinned = true;
        } */

        this.saveConversation(dialog);
        
        /* if(wasDialogBefore) {
          rootScope.$broadcast('dialog_top', dialog);
        } else { */
          //if(wasDialogBefore?.top_message !== topMessage) {
            updatedDialogs[peerId] = dialog;
          //}
        //}
      } else {
        const dropped = this.dialogsStorage.dropDialog(peerId);
        if(dropped.length) {
          rootScope.broadcast('dialog_drop', {peerId: peerId, dialog: dropped[0]});
        }
      }

      if(this.newUpdatesAfterReloadToHandle[peerId] !== undefined) {
        for(const i in this.newUpdatesAfterReloadToHandle[peerId]) {
          const update = this.newUpdatesAfterReloadToHandle[peerId][i];
          this.handleUpdate(update);
        }

        delete this.newUpdatesAfterReloadToHandle[peerId];
      }
    });

    if(Object.keys(updatedDialogs).length) {
      rootScope.broadcast('dialogs_multiupdate', updatedDialogs);
    }
  }

  public generateDialog(peerId: number) {
    const dialog: Dialog = {
      _: 'dialog',
      pFlags: {},
      peer: appPeersManager.getOutputPeer(peerId),
      top_message: 0,
      read_inbox_max_id: 0,
      read_outbox_max_id: 0,
      unread_count: 0,
      unread_mentions_count: 0,
      notify_settings: {
        _: 'peerNotifySettings',
      },
    };

    return dialog;
  }

  public saveConversation(dialog: Dialog, folderId = 0) {
    const peerId = appPeersManager.getPeerId(dialog.peer);
    if(!peerId) {
      return false;
    }

    if(dialog._ !== 'dialog'/*  || peerId === 239602833 */) {
      console.error('saveConversation not regular dialog', dialog, Object.assign({}, dialog));
    }
    
    const channelId = appPeersManager.isChannel(peerId) ? -peerId : 0;
    const peerText = appPeersManager.getPeerSearchText(peerId);
    searchIndexManager.indexObject(peerId, peerText, this.dialogsIndex);

    let mid: number, message;
    if(dialog.top_message) {
      mid = this.generateMessageId(dialog.top_message);//dialog.top_message;
      message = this.getMessageByPeer(peerId, mid);
    } else {
      mid = this.generateTempMessageId(peerId);
      message = {
        _: 'message',
        id: mid,
        mid,
        from_id: appPeersManager.getOutputPeer(appUsersManager.getSelf().id),
        peer_id: appPeersManager.getOutputPeer(peerId),
        deleted: true,
        pFlags: {out: true},
        date: 0,
        message: ''
      };
      this.saveMessages([message], {isOutgoing: true});
    }

    if(!message?.pFlags) {
      this.log.error('saveConversation no message:', dialog, message);
    }

    if(!channelId && peerId < 0) {
      const chat = appChatsManager.getChat(-peerId);
      if(chat && chat.migrated_to && chat.pFlags.deactivated) {
        const migratedToPeer = appPeersManager.getPeerId(chat.migrated_to);
        this.migratedFromTo[peerId] = migratedToPeer;
        this.migratedToFrom[migratedToPeer] = peerId;
        return;
      }
    }

    const wasDialogBefore = this.getDialogByPeerId(peerId)[0];

    dialog.top_message = mid;
    dialog.read_inbox_max_id = wasDialogBefore && !dialog.read_inbox_max_id ? wasDialogBefore.read_inbox_max_id : this.generateMessageId(dialog.read_inbox_max_id);
    dialog.read_outbox_max_id = wasDialogBefore && !dialog.read_outbox_max_id ? wasDialogBefore.read_outbox_max_id : this.generateMessageId(dialog.read_outbox_max_id);

    if(!dialog.hasOwnProperty('folder_id')) {
      if(dialog._ === 'dialog') {
        // ! СЛОЖНО ! СМОТРИ В getTopMessages
        dialog.folder_id = wasDialogBefore ? wasDialogBefore.folder_id : folderId;
      }/*  else if(dialog._ === 'dialogFolder') {
        dialog.folder_id = dialog.folder.id;
      } */
    }

    dialog.draft = appDraftsManager.saveDraft(peerId, 0, dialog.draft);
    dialog.peerId = peerId;

    // Because we saved message without dialog present
    if(message.pFlags.is_outgoing) {
      if(mid > dialog[message.pFlags.out ? 'read_outbox_max_id' : 'read_inbox_max_id']) message.pFlags.unread = true;
      else delete message.pFlags.unread;
    }

    let historyStorage = this.getHistoryStorage(peerId);
    if(historyStorage === undefined/*  && !message.deleted */) { // warning
      historyStorage.history.push(mid);
      /* if(mid < 0 && message.pFlags.unread) {
        dialog.unread_count++;
      } */
      if(this.mergeReplyKeyboard(historyStorage, message)) {
        rootScope.broadcast('history_reply_markup', {peerId});
      }
    } else if(!historyStorage.history.length) {
      historyStorage.history.push(mid);
    }

    historyStorage.maxId = mid;
    historyStorage.readMaxId = dialog.read_inbox_max_id;
    historyStorage.readOutboxMaxId = dialog.read_outbox_max_id;

    if(channelId && dialog.pts) {
      apiUpdatesManager.addChannelState(channelId, dialog.pts);
    }

    this.dialogsStorage.generateIndexForDialog(dialog);
    this.dialogsStorage.pushDialog(dialog, message.date);
  }

  public mergeReplyKeyboard(historyStorage: HistoryStorage, message: any) {
    // this.log('merge', message.mid, message.reply_markup, historyStorage.reply_markup)
    if(!message.reply_markup &&
      !message.pFlags?.out &&
      !message.action) {
      return false;
    }
    if(message.reply_markup &&
      message.reply_markup._ === 'replyInlineMarkup') {
      return false;
    }
    var messageReplyMarkup = message.reply_markup;
    var lastReplyMarkup = historyStorage.reply_markup;
    if(messageReplyMarkup) {
      if(lastReplyMarkup && lastReplyMarkup.mid >= message.mid) {
        return false;
      }

      if(messageReplyMarkup.pFlags.selective) {
        return false;
      }

      if(historyStorage.maxOutId &&
        message.mid < historyStorage.maxOutId &&
        messageReplyMarkup.pFlags.single_use) {
        messageReplyMarkup.pFlags.hidden = true;
      }
      messageReplyMarkup = Object.assign({
        mid: message.mid
      }, messageReplyMarkup);
      if(messageReplyMarkup._ !== 'replyKeyboardHide') {
        messageReplyMarkup.fromId = appPeersManager.getPeerId(message.from_id);
      }
      historyStorage.reply_markup = messageReplyMarkup;
      // this.log('set', historyStorage.reply_markup)
      return true;
    }

    if(message.pFlags.out) {
      if(lastReplyMarkup) {
        if(lastReplyMarkup.pFlags.single_use &&
          !lastReplyMarkup.pFlags.hidden &&
          (message.mid > lastReplyMarkup.mid || message.pFlags.is_outgoing) &&
          message.message) {
          lastReplyMarkup.pFlags.hidden = true;
          // this.log('set', historyStorage.reply_markup)
          return true;
        }
      } else if(!historyStorage.maxOutId ||
        message.mid > historyStorage.maxOutId) {
        historyStorage.maxOutId = message.mid;
      }
    }

    if(message.action &&
      message.action._ === 'messageActionChatDeleteUser' &&
      (lastReplyMarkup
        ? message.action.user_id === lastReplyMarkup.fromId
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

  public getSearchCounters(peerId: number, filters: MessagesFilter[]) {
    return apiManager.invokeApi('messages.getSearchCounters', {
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
      history: number[];
    };

    // * костыль для limit 1, если нужно и получить сообщение, и узнать количество сообщений
    if(peerId && !backLimit && !maxId && !query && limit !== 1 && !threadId/*  && inputFilter._ !== 'inputMessagesFilterPinned' */) {
      storage = beta ? 
        this.getSearchStorage(peerId, inputFilter._) : 
        this.getHistoryStorage(peerId);
      let filtering = true;

      const history = maxId ? storage.history.slice(storage.history.indexOf(maxId) + 1) : storage.history;

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
            const message = storage[history[i]];
  
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
            } else if(neededContents['avatar'] && message.action && ['messageActionChannelEditPhoto', 'messageActionChatEditPhoto'].includes(message.action._)) {
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

    let apiPromise: Promise<any>;
    if(peerId && !nextRate && folderId === undefined/*  || !query */) {
      apiPromise = apiManager.invokeApi('messages.search', {
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

      apiPromise = apiManager.invokeApi('messages.searchGlobal', {
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

      if(beta && storage && (!maxId || storage.history[storage.history.length - 1] === maxId)) {
        const storage = this.getSearchStorage(peerId, inputFilter._);
        const add = (searchResult.messages.map((m: any) => m.mid) as number[]).filter(mid => storage.history.indexOf(mid) === -1);
        storage.history.push(...add);
        storage.history.sort((a, b) => b - a);
        storage.count = searchResult.count;
      }

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

    const serviceStartMessage: Message.messageService = {
      _: 'messageService',
      pFlags: {
        is_single: true
      } as any,
      id: this.generateMessageId(message.id, true),
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
    return apiManager.invokeApi('messages.getDiscussionMessage', {
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
      result.read_inbox_max_id = historyStorage.readMaxId = this.generateMessageId(result.read_inbox_max_id) || 0;
      result.read_outbox_max_id = historyStorage.readOutboxMaxId = this.generateMessageId(result.read_outbox_max_id) || 0;

      this.threadsToReplies[threadKey] = peerId + '_' + mid;

      return message;
    });
  }

  handleNewMessages = () => {
    clearTimeout(this.newMessagesHandlePromise);
    this.newMessagesHandlePromise = 0;

    rootScope.broadcast('history_multiappend', this.newMessagesToHandle);
    this.newMessagesToHandle = {};
  };

  handleNewDialogs = () => {
    clearTimeout(this.newDialogsHandlePromise);
    this.newDialogsHandlePromise = 0;
    
    let newMaxSeenId = 0;
    for(const peerId in this.newDialogsToHandle) {
      const dialog = this.newDialogsToHandle[peerId];
      if('reload' in dialog) {
        this.reloadConversation(+peerId);
        delete this.newDialogsToHandle[peerId];
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

    rootScope.broadcast('dialogs_multiupdate', this.newDialogsToHandle as any);
    this.newDialogsToHandle = {};
  };

  public scheduleHandleNewDialogs() {
    if(!this.newDialogsHandlePromise) {
      this.newDialogsHandlePromise = window.setTimeout(this.handleNewDialogs, 0);
    }
  }

  public deleteMessages(peerId: number, mids: number[], revoke?: true) {
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
        apiUpdatesManager.processUpdateMessage({
          _: 'updateShort',
          update: {
            _: 'updateDeleteChannelMessages',
            channel_id: channelId,
            messages: mids,
            pts: affectedMessages.pts,
            pts_count: affectedMessages.pts_count
          }
        });
      });
    } else {
      promise = apiManager.invokeApi('messages.deleteMessages', {
        revoke,
        id: localMessageIds
      }).then((affectedMessages) => {
        apiUpdatesManager.processUpdateMessage({
          _: 'updateShort',
          update: {
            _: 'updateDeleteMessages',
            messages: mids,
            pts: affectedMessages.pts,
            pts_count: affectedMessages.pts_count
          }
        });
      });
    }

    return promise;
  }

  public readHistory(peerId: number, maxId = 0, threadId?: number, force = false) {
    // return Promise.resolve();
    // console.trace('start read')
    this.log('readHistory:', peerId, maxId, threadId);
    if(!this.getReadMaxIdIfUnread(peerId, threadId) && !force) {
      this.log('readHistory: isn\'t unread');
      return Promise.resolve();
    }

    const isChannel = appPeersManager.isChannel(peerId);
    const historyStorage = this.getHistoryStorage(peerId, threadId);

    let apiPromise: Promise<any>;
    if(threadId) {
      if(!historyStorage.readPromise) {
        apiPromise = apiManager.invokeApi('messages.readDiscussion', {
          peer: appPeersManager.getInputPeerById(peerId),
          msg_id: this.getServerMessageId(threadId),
          read_max_id: this.getServerMessageId(maxId)
        });
      }

      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updateReadChannelDiscussionInbox',
          channel_id: -peerId,
          top_msg_id: threadId,
          read_max_id: maxId
        } as Update.updateReadChannelDiscussionInbox
      });
    } else if(isChannel) {
      if(!historyStorage.readPromise) {
        apiPromise = apiManager.invokeApi('channels.readHistory', {
          channel: appChatsManager.getChannelInput(-peerId),
          max_id: this.getServerMessageId(maxId)
        });
      }

      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updateReadChannelInbox',
          max_id: maxId,
          channel_id: -peerId
        }
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

      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updateReadHistoryInbox',
          max_id: maxId,
          peer: appPeersManager.getOutputPeer(peerId)
        }
      });
    }

    if(historyStorage.readPromise) {
      return historyStorage.readPromise;
    }

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
        apiUpdatesManager.processUpdateMessage({
          _: 'updateShort',
          update: {
            _: 'updateChannelReadMessagesContents',
            channel_id: channelId,
            messages: msgIds
          }
        });
      });
    } else {
      apiManager.invokeApi('messages.readMessageContents', {
        id: msgIds
      }).then((affectedMessages) => {
        apiUpdatesManager.processUpdateMessage({
          _: 'updateShort',
          update: {
            _: 'updateReadMessagesContents',
            messages: msgIds,
            pts: affectedMessages.pts,
            pts_count: affectedMessages.pts_count
          }
        });
      });
    }
  }

  public getHistoryStorage(peerId: number, threadId?: number) {
    if(threadId) {
      //threadId = this.getLocalMessageId(threadId);
      if(!this.threadsStorage[peerId]) this.threadsStorage[peerId] = {};
      return this.threadsStorage[peerId][threadId] ?? (this.threadsStorage[peerId][threadId] = {count: null, history: []});
    }

    return this.historiesStorage[peerId] ?? (this.historiesStorage[peerId] = {count: null, history: []});
  }

  public handleUpdate(update: Update) {
    /* if(DEBUG) {
      this.log.debug('handleUpdate', update._, update);
    } */

    switch(update._) {
      case 'updateMessageID': {
        const randomId = update.random_id;
        const pendingData = this.pendingByRandomId[randomId];
        //this.log('AMM updateMessageID:', update, pendingData);
        if(pendingData) {
          const {peerId, tempId, storage} = pendingData;
          //const mid = update.id;
          const mid = this.generateMessageId(update.id);
          const message = this.getMessageFromStorage(storage, mid);
          if(!message.deleted) {
            const historyStorage = this.getHistoryStorage(peerId);
            const pos = historyStorage.history.indexOf(tempId);
            if(pos !== -1) {
              historyStorage.history.splice(pos, 1);
            }

            this.finalizePendingMessageCallbacks(storage, tempId, mid);
          } else {
            this.pendingByMessageId[mid] = randomId;
          }
        }

        break;
      }

      case 'updateNewMessage':
      case 'updateNewChannelMessage': {
        const message = update.message as MyMessage;
        const peerId = this.getMessagePeer(message);
        const storage = this.getMessagesStorage(peerId);
        const foundDialog = this.getDialogByPeerId(peerId);

        if(!foundDialog.length && (peerId > 0 || !appChatsManager.getChat(-peerId).pFlags.left)) {
          this.newDialogsToHandle[peerId] = {reload: true};
          this.scheduleHandleNewDialogs();
          if(this.newUpdatesAfterReloadToHandle[peerId] === undefined) {
            this.newUpdatesAfterReloadToHandle[peerId] = [];
          }
          this.newUpdatesAfterReloadToHandle[peerId].push(update);
          break;
        }

        /* if(update._ === 'updateNewChannelMessage') {
          const chat = appChatsManager.getChat(-peerId);
          if(chat.pFlags && (chat.pFlags.left || chat.pFlags.kicked)) {
            break;
          }
        } */

        this.saveMessages([message], {storage});
        // this.log.warn(dT(), 'message unread', message.mid, message.pFlags.unread)

        const pendingMessage = this.checkPendingMessage(message);
        const historyStorage = this.getHistoryStorage(peerId);
        this.updateMessageRepliesIfNeeded(message);

        const history = historyStorage.history;
        if(history.indexOf(message.mid) !== -1) {
          return false;
        }
        const topMsgId = history[0];
        history.unshift(message.mid);
        if(message.mid < topMsgId) {
          history.sort((a, b) => {
            return b - a;
          });
        }
  
        if(historyStorage.count !== null) {
          historyStorage.count++;
        }
  
        if(this.mergeReplyKeyboard(historyStorage, message)) {
          rootScope.broadcast('history_reply_markup', {peerId});
        }
  
        if(message.fromId > 0 && !message.pFlags.out && message.from_id) {
          appUsersManager.forceUserOnline(message.fromId, message.date);
        }

        if(!pendingMessage) {
          if(this.newMessagesToHandle[peerId] === undefined) {
            this.newMessagesToHandle[peerId] = [];
          }
  
          this.newMessagesToHandle[peerId].push(message.mid);
          if(!this.newMessagesHandlePromise) {
            this.newMessagesHandlePromise = window.setTimeout(this.handleNewMessages, 0);
          }
        }
        
        const dialog = foundDialog[0];
        if(dialog) {
          const inboxUnread = !message.pFlags.out && message.pFlags.unread;
          this.setDialogTopMessage(message, dialog);
          if(inboxUnread) {
            dialog.unread_count++;
          }
        }

        break;
      }

      case 'updateDialogUnreadMark': {
        //this.log('updateDialogUnreadMark', update);
        const peerId = appPeersManager.getPeerId((update.peer as DialogPeer.dialogPeer).peer);
        const foundDialog = this.getDialogByPeerId(peerId);

        if(!foundDialog.length) {
          this.newDialogsToHandle[peerId] = {reload: true};
          this.scheduleHandleNewDialogs();
        } else {
          const dialog = foundDialog[0];

          if(!update.pFlags.unread) {
            delete dialog.pFlags.unread_mark;
          } else {
            dialog.pFlags.unread_mark = true;
          }

          rootScope.broadcast('dialogs_multiupdate', {peerId: dialog});
        }

        break;
      }

      case 'updateFolderPeers': { // only 0 and 1 folders
        //this.log('updateFolderPeers', update);
        const peers = update.folder_peers;

        this.scheduleHandleNewDialogs();
        peers.forEach((folderPeer) => {
          const {folder_id, peer} = folderPeer;

          const peerId = appPeersManager.getPeerId(peer);
          const dropped = this.dialogsStorage.dropDialog(peerId);
          if(!dropped.length) {
            this.newDialogsToHandle[peerId] = {reload: true};
          } else {
            const dialog = dropped[0];
            this.newDialogsToHandle[peerId] = dialog;

            if(dialog.pFlags?.pinned) {
              delete dialog.pFlags.pinned;
              this.dialogsStorage.pinnedOrders[folder_id].findAndSplice(p => p === dialog.peerId);
            }

            dialog.folder_id = folder_id;

            this.dialogsStorage.generateIndexForDialog(dialog);
            this.dialogsStorage.pushDialog(dialog); // need for simultaneously updatePinnedDialogs
          }
        });
        break;
      }

      case 'updateDialogPinned': {
        const folderId = update.folder_id ?? 0;
        //this.log('updateDialogPinned', update);
        const peerId = appPeersManager.getPeerId((update.peer as DialogPeer.dialogPeer).peer);
        const foundDialog = this.getDialogByPeerId(peerId);

        // этот код внизу никогда не сработает, в папках за пиннед отвечает updateDialogFilter
        /* if(update.folder_id > 1) {
          const filter = this.filtersStorage.filters[update.folder_id];
          if(update.pFlags.pinned) {
            filter.pinned_peers.unshift(peerId);
          } else {
            filter.pinned_peers.findAndSplice(p => p === peerId);
          }
        } */

        this.scheduleHandleNewDialogs();
        if(!foundDialog.length) {
          this.newDialogsToHandle[peerId] = {reload: true};
        } else {
          const dialog = foundDialog[0];
          this.newDialogsToHandle[peerId] = dialog;

          if(!update.pFlags.pinned) {
            delete dialog.pFlags.pinned;
            this.dialogsStorage.pinnedOrders[folderId].findAndSplice(p => p === dialog.peerId);
          } else { // means set
            dialog.pFlags.pinned = true;
          }

          this.dialogsStorage.generateIndexForDialog(dialog);
        } 

        break;
      }

      case 'updatePinnedDialogs': {
        const folderId = update.folder_id ?? 0;
        
        const handleOrder = (order: number[]) => {
          this.dialogsStorage.pinnedOrders[folderId].length = 0;
          let willHandle = false;
          order.reverse(); // index must be higher
          order.forEach((peerId) => {
            newPinned[peerId] = true;
  
            const foundDialog = this.getDialogByPeerId(peerId);
            if(!foundDialog.length) {
              this.newDialogsToHandle[peerId] = {reload: true};
              willHandle = true;
              return;
            }
  
            const dialog = foundDialog[0];
            dialog.pFlags.pinned = true;
            this.dialogsStorage.generateIndexForDialog(dialog);
  
            this.newDialogsToHandle[peerId] = dialog;
            willHandle = true;
          });
          
          this.dialogsStorage.getFolder(folderId).forEach(dialog => {
            const peerId = dialog.peerId;
            if(dialog.pFlags.pinned && !newPinned[peerId]) {
              this.newDialogsToHandle[peerId] = {reload: true};
              willHandle = true;
            }
          });
  
          if(willHandle) {
            this.scheduleHandleNewDialogs();
          }
        };

        //this.log('updatePinnedDialogs', update);
        const newPinned: {[peerId: number]: true} = {};
        if(!update.order) {
          apiManager.invokeApi('messages.getPinnedDialogs', {
            folder_id: folderId
          }).then((dialogsResult) => {
            // * for test reordering and rendering
            // dialogsResult.dialogs.reverse();

            this.applyConversations(dialogsResult);

            handleOrder(dialogsResult.dialogs.map(d => d.peerId));

            /* dialogsResult.dialogs.forEach((dialog) => {
              newPinned[dialog.peerId] = true;
            });

            this.dialogsStorage.getFolder(folderId).forEach((dialog) => {
              const peerId = dialog.peerId;
              if(dialog.pFlags.pinned && !newPinned[peerId]) {
                this.newDialogsToHandle[peerId] = {reload: true};
                this.scheduleHandleNewDialogs();
              }
            }); */
          });

          break;
        }

        //this.log('before order:', this.dialogsStorage[0].map(d => d.peerId));

        handleOrder(update.order.map(peer => appPeersManager.getPeerId((peer as DialogPeer.dialogPeer).peer)));

        break;
      }   

      case 'updateEditMessage':
      case 'updateEditChannelMessage': {
        const message = update.message as MyMessage;
        const peerId = this.getMessagePeer(message);
        const mid = this.generateMessageId(message.id);
        const storage = this.getMessagesStorage(peerId);
        if(storage[mid] === undefined) {
          break;
        }

        // console.trace(dT(), 'edit message', message)
        
        const oldMessage = this.getMessageFromStorage(storage, mid);
        this.saveMessages([message], {storage});
        const newMessage = this.getMessageFromStorage(storage, mid);

        this.handleEditedMessage(oldMessage, newMessage);

        const dialog = this.getDialogByPeerId(peerId)[0];
        const isTopMessage = dialog && dialog.top_message === mid;
        // @ts-ignore
        if(message.clear_history) { // that's will never happen
          if(isTopMessage) {
            rootScope.broadcast('dialog_flush', {peerId});
          }
        } else {
          rootScope.broadcast('message_edit', {
            storage,
            peerId,
            mid
          });

          if(isTopMessage || (message as Message.message).grouped_id) {
            const updatedDialogs: {[peerId: number]: Dialog} = {};
            updatedDialogs[peerId] = dialog;
            rootScope.broadcast('dialogs_multiupdate', updatedDialogs);
          }
        }
        break;
      }

      case 'updateReadChannelDiscussionInbox':
      case 'updateReadChannelDiscussionOutbox':
      case 'updateReadHistoryInbox':
      case 'updateReadHistoryOutbox':
      case 'updateReadChannelInbox':
      case 'updateReadChannelOutbox': {
        const channelId = (update as Update.updateReadChannelInbox).channel_id;
        const maxId = this.generateMessageId((update as Update.updateReadChannelInbox).max_id || (update as Update.updateReadChannelDiscussionInbox).read_max_id);
        const threadId = this.generateMessageId((update as Update.updateReadChannelDiscussionInbox).top_msg_id);
        const peerId = channelId ? -channelId : appPeersManager.getPeerId((update as Update.updateReadHistoryInbox).peer);

        const isOut = update._ === 'updateReadHistoryOutbox' || update._ === 'updateReadChannelOutbox' || update._ === 'updateReadChannelDiscussionOutbox' ? true : undefined;

        const storage = this.getMessagesStorage(peerId);
        const history = getObjectKeysAndSort(storage, 'desc');
        const foundDialog = this.getDialogByPeerId(peerId)[0];
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

            if(!message.pFlags.out && !threadId && stillUnreadCount === undefined) {
              newUnreadCount = --foundDialog.unread_count;
              //NotificationsManager.cancel('msg' + messageId); // warning
            }
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
  
          rootScope.broadcast('dialog_unread', {peerId});
        }

        if(foundAffected) {
          rootScope.broadcast('messages_read');
        }

        if(!threadId && channelId) {
          const threadKeyPart = peerId + '_';
          for(const threadKey in this.threadsToReplies) {
            if(threadKey.indexOf(threadKeyPart) === 0) {
              const [peerId, mid] = this.threadsToReplies[threadKey].split('_').map(n => +n);
              rootScope.broadcast('replies_updated', this.getMessageByPeer(peerId, mid));
            }
          }
        }

        break;
      }

      case 'updateChannelReadMessagesContents':
      case 'updateReadMessagesContents': {
        const channelId = (update as Update.updateChannelReadMessagesContents).channel_id;
        const peerId = channelId ? -channelId : this.getMessageById(update.messages[0]).peerId;
        const messages: number[] = update.messages;
        for(const messageId of messages) {
          const message = this.getMessageByPeer(peerId, messageId);
          if(!message.deleted) {
            delete message.pFlags.media_unread;
          }
        }

        rootScope.broadcast('messages_media_read', {peerId, mids: messages.map(id => this.generateMessageId(id))});
        break;
      }

      case 'updateChannelAvailableMessages': {
        const channelId: number = update.channel_id;
        const messages: number[] = [];
        const peerId: number = -channelId;
        const history = this.getHistoryStorage(peerId).history;
        if(history.length) {
          history.forEach((msgId: number) => {
            if(!update.available_min_id || msgId <= update.available_min_id) {
              messages.push(msgId);
            }
          });
        }

        (update as any as Update.updateDeleteChannelMessages).messages = messages;
      }

      case 'updateDeleteMessages':
      case 'updateDeleteChannelMessages': {
        const channelId: number = (update as Update.updateDeleteChannelMessages).channel_id;
        //const messages = (update as any as Update.updateDeleteChannelMessages).messages;
        const messages = (update as any as Update.updateDeleteChannelMessages).messages.map(id => this.generateMessageId(id));
        const peerId = channelId ? -channelId : this.getMessageById(messages[0]).peerId;
        
        if(!peerId) {
          break;
        }
        
        const historyUpdated = this.handleDeletedMessages(peerId, this.getMessagesStorage(peerId), messages);

        const historyStorage = this.getHistoryStorage(peerId);
        //if(historyStorage !== undefined) {
          const newHistory = historyStorage.history.filter(mid => !historyUpdated.msgs[mid]);
          historyStorage.history = newHistory;
          if(historyUpdated.count &&
            historyStorage.count !== null &&
            historyStorage.count > 0) {
            historyStorage.count -= historyUpdated.count;
            if(historyStorage.count < 0) {
              historyStorage.count = 0;
            }
          }

          rootScope.broadcast('history_delete', {peerId, msgs: historyUpdated.msgs});
        //}

        const foundDialog = this.getDialogByPeerId(peerId)[0];
        if(foundDialog) {
          if(historyUpdated.unread) {
            foundDialog.unread_count -= historyUpdated.unread;

            rootScope.broadcast('dialog_unread', {peerId});
          }

          if(historyUpdated.msgs[foundDialog.top_message]) {
            this.reloadConversation(peerId);
          }
        }
        break;
      }

      case 'updateChannel': {
        const channelId: number = update.channel_id;
        const peerId = -channelId;
        const channel = appChatsManager.getChat(channelId);

        const needDialog = channel._ === 'channel' && (!channel.pFlags.left && !channel.pFlags.kicked);
        const foundDialog = this.getDialogByPeerId(peerId);
        const hasDialog = foundDialog.length > 0;

        const canViewHistory = channel._ === 'channel' && (channel.username || !channel.pFlags.left && !channel.pFlags.kicked);
        const hasHistory = this.historiesStorage[peerId] !== undefined;

        if(canViewHistory !== hasHistory) {
          delete this.historiesStorage[peerId];
          rootScope.broadcast('history_forbidden', peerId);
        }

        if(hasDialog !== needDialog) {
          if(needDialog) {
            this.reloadConversation(-channelId);
          } else {
            if(foundDialog[0]) {
              this.dialogsStorage.dropDialog(peerId);
              rootScope.broadcast('dialog_drop', {peerId: peerId, dialog: foundDialog[0]});
            }
          }
        }

        break;
      }

      // @ts-ignore
      case 'updateChannelReload': {
        // @ts-ignore
        const channelId: number = update.channel_id;
        const peerId = -channelId;

        this.dialogsStorage.dropDialog(peerId);

        delete this.historiesStorage[peerId];
        this.reloadConversation(-channelId).then(() => {
          rootScope.broadcast('history_reload', peerId);
        });

        break;
      }

      case 'updateChannelMessageViews': {
        const views = update.views;
        //const mid = update.id;
        const mid = this.generateMessageId(update.id);
        const message = this.getMessageByPeer(-update.channel_id, mid);
        if(!message.deleted && message.views && message.views < views) {
          message.views = views;
          rootScope.broadcast('message_views', {mid, views});
        }
        break;
      }
        
      case 'updateServiceNotification': {
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
          this.handleUpdate({
            _: 'updateNewMessage',
            message: message
          } as any);
        }

        break;
      }

      case 'updatePinnedMessages':
      case 'updatePinnedChannelMessages': {
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
            rootScope.broadcast('peer_pinned_messages', {peerId, mids: messages, pinned: werePinned});
          });
        });

        break;
      }

      case 'updateNotifySettings': {
        const {peer, notify_settings} = update;
        
        const peerId = appPeersManager.getPeerId((peer as NotifyPeer.notifyPeer).peer);
        
        const dialog = this.getDialogByPeerId(peerId)[0];
        if(dialog) {
          dialog.notify_settings = notify_settings;
          rootScope.broadcast('dialog_notify_settings', peerId);
        }

        /////this.log('updateNotifySettings', peerId, notify_settings);
        break;
      }

      case 'updateNewScheduledMessage': {
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
            rootScope.broadcast('message_edit', {storage, peerId, mid: message.mid});
          } else {
            const pendingMessage = this.checkPendingMessage(message);
            if(!pendingMessage) {
              rootScope.broadcast('scheduled_new', {peerId, mid: message.mid});
            }
          }
        }
        
        break;
      }

      case 'updateDeleteScheduledMessages': {
        const peerId = appPeersManager.getPeerId(update.peer);

        const storage = this.scheduledMessagesStorage[peerId];
        if(storage) {
          const mids = update.messages.map(id => this.generateMessageId(id));
          this.handleDeletedMessages(peerId, storage, mids);

          rootScope.broadcast('scheduled_delete', {peerId, mids});
        }

        break;
      }
    }
  }

  private updateMessageRepliesIfNeeded(threadMessage: MyMessage) {
    try { // * на всякий случай, скорее всего это не понадобится
      if(threadMessage.peerId < 0 && threadMessage.reply_to) {
        const threadId = threadMessage.reply_to.reply_to_top_id || threadMessage.reply_to.reply_to_msg_id;
        const threadKey = threadMessage.peerId + '_' + threadId;
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

  public updateMessage(peerId: number, mid: number, broadcastEventName?: 'replies_updated'): Promise<Message.message> {
    const promise: Promise<Message.message> = this.wrapSingleMessage(peerId, mid, true).then(() => {
      const message = this.getMessageByPeer(peerId, mid);

      if(broadcastEventName) {
        rootScope.broadcast(broadcastEventName, message);
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
        rootScope.broadcast('history_update', {storage: pendingData.storage, peerId: message.peerId, mid: message.mid});
      }

      delete this.pendingByMessageId[message.mid];
    }

    return pendingMessage;
  }

  public isDialogMuted(dialog: MTDialog.dialog) {
    let muted = false;
    if(dialog && dialog.notify_settings && dialog.notify_settings.mute_until) {
      //muted = new Date(dialog.notify_settings.mute_until * 1000) > new Date();
      muted = (dialog.notify_settings.mute_until * 1000) > Date.now();
    }

    return muted;
  }

  public isPeerMuted(peerId: number) {
    if(peerId === rootScope.myId) return false;

    return this.isDialogMuted(this.getDialogByPeerId(peerId)[0]);
  }

  public mutePeer(peerId: number) {
    let inputPeer = appPeersManager.getInputPeerById(peerId);
    let inputNotifyPeer: InputNotifyPeer.inputNotifyPeer = {
      _: 'inputNotifyPeer',
      peer: inputPeer
    };
    
    let settings: InputPeerNotifySettings = {
      _: 'inputPeerNotifySettings'
    };

    let dialog = appMessagesManager.getDialogByPeerId(peerId)[0];
    let muted = true;
    if(dialog && dialog.notify_settings) {
      muted = dialog.notify_settings.mute_until > (Date.now() / 1000 | 0);
    }
    
    if(!muted) {
      settings.mute_until = 2147483647;
    }
    
    apiManager.invokeApi('account.updateNotifySettings', {
      peer: inputNotifyPeer,
      settings: settings
    }).then(bool => {
      if(bool) {
        this.handleUpdate({
          _: 'updateNotifySettings', 
          peer: {
            _: 'notifyPeer',
            peer: appPeersManager.getOutputPeer(peerId)
          }, 
          notify_settings: { // ! WOW, IT WORKS !
            ...settings,
            _: 'peerNotifySettings',
          }
        });
      }
    });
  }

  public canWriteToPeer(peerId: number) {
    if(peerId < 0) {
      const isChannel = appPeersManager.isChannel(peerId);
      const hasRights = isChannel && appChatsManager.hasRights(-peerId, 'send'); 
      return !isChannel || hasRights;
    } else {
      return appUsersManager.canSendToUser(peerId);
    }
  }

  public finalizePendingMessage(randomId: string, finalMessage: any) {
    const pendingData = this.pendingByRandomId[randomId];
    // this.log('pdata', randomID, pendingData)

    if(pendingData) {
      const {peerId, tempId, storage} = pendingData;
      const historyStorage = this.getHistoryStorage(peerId);

      // this.log('pending', randomID, historyStorage.pending)
      const pos = historyStorage.history.indexOf(tempId);
      if(pos !== -1) {
        historyStorage.history.splice(pos, 1);
      }

      const message = this.getMessageFromStorage(storage, tempId);
      if(!message.deleted) {
        delete message.pFlags.is_outgoing;
        delete message.pending;
        delete message.error;
        delete message.random_id;
        delete message.send;

        rootScope.broadcast('messages_pending');
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
          // костыль
          defineNotNumerableProperties(newPhoto, ['downloaded', 'url']);
          newPhoto.downloaded = photo.downloaded;
          newPhoto.url = photo.url;

          const photoSize = newPhoto.sizes[newPhoto.sizes.length - 1] as PhotoSize.photoSize;
          defineNotNumerableProperties(photoSize, ['url']);
          photoSize.url = photo.url;

          const downloadOptions = appPhotosManager.getPhotoDownloadOptions(newPhoto, photoSize);
          const fileName = getFileNameByLocation(downloadOptions.location);
          appDownloadManager.fakeDownload(fileName, photo.url);
        }
      } else if(message.media.document) {
        const doc = appDocsManager.getDoc('' + tempId);
        if(doc) {
          if(/* doc._ !== 'documentEmpty' &&  */doc.type && doc.type !== 'sticker') {
            const newDoc = message.media.document;
            newDoc.downloaded = doc.downloaded;
            newDoc.url = doc.url;

            const fileName = appDocsManager.getInputFileName(newDoc);
            appDownloadManager.fakeDownload(fileName, doc.url);
          }
        }
      } else if(message.media.poll) {
        delete appPollsManager.polls[tempId];
        delete appPollsManager.results[tempId];
      }
    }

    const tempMessage = this.getMessageFromStorage(storage, tempId);
    delete storage[tempId];

    rootScope.broadcast('message_sent', {storage, tempId, tempMessage, mid});
  }

  public incrementMaxSeenId(maxId: number) {
    if(!maxId || !(!this.maxSeenId || maxId > this.maxSeenId)) {
      return false;
    }

    this.maxSeenId = maxId;

    apiManager.invokeApi('messages.receivedMessages', {
      max_id: this.getServerMessageId(maxId)
    });
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

    return apiManager.invokeApi('messages.getScheduledHistory', {
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

  public getHistory(peerId: number, maxId = 0, limit: number, backLimit?: number, threadId?: number): Promise<HistoryResult> | HistoryResult {
    if(this.migratedFromTo[peerId]) {
      peerId = this.migratedFromTo[peerId];
    }

    const historyStorage = this.getHistoryStorage(peerId, threadId);

    let offset = 0;
    let offsetNotFound = false;

    let isMigrated = false;
    let reqPeerId = peerId;
    if(this.migratedToFrom[peerId]) {
      isMigrated = true;
    }

    if(maxId) {
      offsetNotFound = true;
      for(; offset < historyStorage.history.length; offset++) {
        if(maxId > historyStorage.history[offset]) {
          offsetNotFound = false;
          break;
        }
      }
    }

    if(!offsetNotFound && (
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

      const history = historyStorage.history.slice(offset, offset + limit);
      return {
        count: historyStorage.count,
        history: history,
        offsetIdOffset: offset
      };
    }

    if(offsetNotFound) {
      offset = 0;
    }
    if((backLimit || maxId) && historyStorage.history.indexOf(maxId) === -1) {
      if(backLimit) {
        offset = -backLimit;
        limit += backLimit;
      }

      return this.requestHistory(reqPeerId, maxId, limit, offset, undefined, threadId).then((historyResult) => {
        historyStorage.count = (historyResult as MessagesMessages.messagesMessagesSlice).count || historyResult.messages.length;
        if(isMigrated) {
          historyStorage.count++;
        }

        const history = (historyResult.messages as MyMessage[]).map(message => message.mid);
        return {
          count: historyStorage.count,
          history,
          offsetIdOffset: (historyResult as MessagesMessages.messagesMessagesSlice).offset_id_offset || 0
        };
      });
    }

    return this.fillHistoryStorage(peerId, maxId, limit, historyStorage, threadId).then(() => {
      let offset = 0;
      if(maxId) {
        for(; offset < historyStorage.history.length; offset++) {
          if(maxId > historyStorage.history[offset]) {
            break;
          }
        }
      }

      const history = historyStorage.history.slice(backLimit ? Math.max(offset - backLimit, 0) : offset, offset + limit);
      return {
        count: historyStorage.count,
        history,
        offsetIdOffset: offset
      };
    });
  }

  public fillHistoryStorage(peerId: number, maxId: number, fullLimit: number, historyStorage: HistoryStorage, threadId?: number): Promise<boolean> {
    // this.log('fill history storage', peerId, maxId, fullLimit, angular.copy(historyStorage))
    const offset = (this.migratedFromTo[peerId] && !maxId) ? 1 : 0;
    return this.requestHistory(peerId, maxId, fullLimit, offset, undefined, threadId).then((historyResult) => {
      historyStorage.count = (historyResult as MessagesMessages.messagesMessagesSlice).count || historyResult.messages.length;

      if(!maxId && historyResult.messages.length) {
        maxId = this.incrementMessageId((historyResult.messages[0] as MyMessage).mid, 1);
      }

      let offset = 0;
      if(maxId) {
        for(; offset < historyStorage.history.length; offset++) {
          if(maxId > historyStorage.history[offset]) {
            break;
          }
        }
      }

      const wasTotalCount = historyStorage.history.length;

      historyStorage.history.splice(offset, historyStorage.history.length - offset);
      historyResult.messages.forEach((message) => {
        if(this.mergeReplyKeyboard(historyStorage, message)) {
          rootScope.broadcast('history_reply_markup', {peerId});
        }

        historyStorage.history.push((message as MyMessage).mid);
      });

      const totalCount = historyStorage.history.length;
      fullLimit -= (totalCount - wasTotalCount);

      const migratedNextPeer = this.migratedFromTo[peerId];
      const migratedPrevPeer = this.migratedToFrom[peerId]
      const isMigrated = migratedNextPeer !== undefined || migratedPrevPeer !== undefined;

      if(isMigrated) {
        historyStorage.count = Math.max(historyStorage.count, totalCount) + 1;
      }

      if(fullLimit > 0) {
        maxId = historyStorage.history[totalCount - 1];
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
          return this.fillHistoryStorage(peerId, maxId, fullLimit, historyStorage, threadId);
        }
      }

      return true;
    });
  }

  public requestHistory(peerId: number, maxId: number, limit = 0, offset = 0, offsetDate = 0, threadId = 0): Promise<Exclude<MessagesMessages, MessagesMessages.messagesMessagesNotModified>> {
    const isChannel = appPeersManager.isChannel(peerId);

    //console.trace('requestHistory', peerId, maxId, limit, offset);

    //rootScope.broadcast('history_request');

    const options = {
      peer: appPeersManager.getInputPeerById(peerId),
      msg_id: this.getServerMessageId(threadId) || 0,
      offset_id: this.getServerMessageId(maxId) || 0,
      offset_date: offsetDate,
      add_offset: offset,
      limit,
      max_id: 0,
      min_id: 0,
      hash: 0
    };

    const promise: ReturnType<AppMessagesManager['requestHistory']> = apiManager.invokeApi(threadId ? 'messages.getReplies' : 'messages.getHistory', options, {
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

      if(isChannel) {
        apiUpdatesManager.addChannelState(-peerId, (historyResult as MessagesMessages.messagesChannelMessages).pts);
      }

      let length = historyResult.messages.length;
      if(length && historyResult.messages[length - 1].deleted) {
        historyResult.messages.splice(length - 1, 1);
        length--;
        (historyResult as MessagesMessages.messagesMessagesSlice).count--;
      }

      // will load more history if last message is album grouped (because it can be not last item)
      const historyStorage = this.getHistoryStorage(peerId, threadId);
      // historyResult.messages: desc sorted
      if(length && (historyResult.messages[length - 1] as Message.message).grouped_id 
        && (historyStorage.history.length + historyResult.messages.length) < (historyResult as MessagesMessages.messagesMessagesSlice).count) {
        return this.requestHistory(peerId, (historyResult.messages[length - 1] as Message.message).mid, 10, 0, offsetDate, threadId).then((_historyResult) => {
          return historyResult;
        });
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
            promise = apiManager.invokeApi('channels.getMessages', {
              channel: appChatsManager.getChannelInput(-+peerId),
              id: msgIds
            });
          } else {
            promise = apiManager.invokeApi('messages.getMessages', {
              id: msgIds
            });
          }
    
          promises.push(promise.then(getMessagesResult => {
            if(getMessagesResult._ !== 'messages.messagesNotModified') {
              appUsersManager.saveApiUsers(getMessagesResult.users);
              appChatsManager.saveApiChats(getMessagesResult.chats);
              this.saveMessages(getMessagesResult.messages);
            }
    
            rootScope.broadcast('messages_downloaded', {peerId: +peerId, mids});
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
      rootScope.broadcast('messages_downloaded', {peerId, mids: [msgId]});
      return Promise.resolve();
    } else if(!this.needSingleMessages[peerId] || this.needSingleMessages[peerId].indexOf(msgId) === -1) {
      (this.needSingleMessages[peerId] ?? (this.needSingleMessages[peerId] = [])).push(msgId);
      return this.fetchSingleMessages();
    } else if(this.fetchSingleMessagesPromise) {
      return this.fetchSingleMessagesPromise;
    }
  }

  public setTyping(peerId: number, _action: any): Promise<boolean> {
    if(!rootScope.myId || !peerId || !this.canWriteToPeer(peerId) || peerId === rootScope.myId) return Promise.resolve(false);
    
    const action: SendMessageAction = typeof(_action) === 'string' ? {_: _action} : _action;
    return apiManager.invokeApi('messages.setTyping', {
      peer: appPeersManager.getInputPeerById(peerId),
      action
    }) as Promise<boolean>;
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

      if((message as Message.message).media) {
        // @ts-ignore
        const c = message.media.webpage || message.media;
        const smth = c.photo || c.document;

        if(smth?.file_reference) {
          referenceDatabase.deleteContext(smth.file_reference, {type: 'message', peerId, messageId: mid});
        }

        // @ts-ignore
        if(message.media.webpage) {
          // @ts-ignore
          appWebPagesManager.deleteWebPageFromPending(message.media.webpage, mid);
        }
      }

      this.updateMessageRepliesIfNeeded(message);

      if(!message.pFlags.out && !message.pFlags.is_outgoing && message.pFlags.unread) {
        history.unread++;
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
      if(peerMessagesToHandle && peerMessagesToHandle.length) {
        const peerMessagesHandlePos = peerMessagesToHandle.indexOf(mid);
        if(peerMessagesHandlePos !== -1) {
          peerMessagesToHandle.splice(peerMessagesHandlePos);
        }
      }
    }

    if(history.albums) {
      for(const groupId in history.albums) {
        rootScope.broadcast('album_edit', {peerId, groupId, deletedMids: [...history.albums[groupId]]});
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
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appMessagesManager = appMessagesManager);
export default appMessagesManager;
