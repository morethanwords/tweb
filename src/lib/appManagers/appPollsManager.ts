import {AppManager} from '@appManagers/manager';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import type {AttachedPhoto, AttachedSticker, AttachedVideo, CreatePollPayload, FinalizedAttachedMedia} from '@components/popups/createPoll/storeContext';
import assumeType from '@helpers/assumeType';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import copy from '@helpers/object/copy';
import {randomLong} from '@helpers/random';
import {InputFile, InputMedia, Message, MessageEntity, MessageMedia, Poll, PollAnswer, PollResults, TextWithEntities} from '@layer';
import {oneHourInSeconds} from '@lib/constants';
import {LogTypes} from '@lib/logger';
import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';
import {MessageSendingParams, MyMessage} from './appMessagesManager';
import getDocumentInput from './utils/docs/getDocumentInput';
import getMessageThreadId from './utils/messages/getMessageThreadId';
import getPhotoInput from './utils/photos/getPhotoInput';

type PollId = Poll['id'];


type MakePollMediaArgs = {
  peerId: PeerId;
  payload: CreatePollPayload;
  parsedPayload: ReturnType<AppPollsManager['parseAllPollMarkdown']>;
  uploadingMedia: ReturnType<AppPollsManager['startUploadingAllPollMedia']>;
};

type InvokeSendPollArgs = Pick<ReturnType<AppPollsManager['makePollMedia']>, 'pollWithoutAnswers'> & {
  peerId: PeerId; // migrated
  params: Omit<MessageSendingParams, 'peerId'>;
  randomId: string;
  payload: CreatePollPayload;
  parsedPayload: ReturnType<AppPollsManager['parseAllPollMarkdown']>;
  uploadingMedia: ReturnType<AppPollsManager['startUploadingAllPollMedia']>;
};

type RefetchTimeoutPayload = {
  timerId: number;
  closeTimestamp: number;
};

type UploadPollMediaResult = {
  uploadingFileName?: string;
  deferred: CancellablePromise<InputMedia>;
  messageMedia: MessageMedia;
  cancel?: () => void;
};

export type PollUploadingFileNames = {
  description?: string;
  answers?: (string | undefined)[];
  explanation?: string;
};

export class AppPollsManager extends AppManager {
  public polls: {[id: PollId]: Poll} = {};
  public results: {[id: PollId]: PollResults} = {};
  public pollToMessages: {[id: PollId]: Set<string>} = {};

  private refetchResultsTimeouts: {[id: PollId]: RefetchTimeoutPayload} = {};
  private createdPollIds: Set<string> = new Set();
  private uploadingFileNamesByPollId: Map<PollId, PollUploadingFileNames> = new Map();
  private uploadingCancelCallbacks: Map<PollId, Array<() => void>> = new Map();
  private tempMessageByPollId: Map<PollId, Message.message> = new Map();

  constructor() {
    super();
    this.name = 'POLLS';
    this.logTypes = LogTypes.Error;
  }

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateMessagePoll: (update) => {
        this.log('updateMessagePoll:', update);

        const poll: Poll = update.poll || this.polls[update.poll_id];
        if(!poll) {
          return;
        }

        const results = update.results;
        if(!results) return;

        const prev = this.getPoll(poll.id);
        const wasUnread = prev?.results?.pFlags?.has_unread_votes;

        this.saveAndDispatchPoll(poll, results as any);

        // When the server signals that the poll has unread votes, bump the
        // dialog's `unread_poll_votes_count` so the badge appears. This is
        // the poll-vote analogue of the unread-reactions tracking on
        // `updateMessageReactions` in AppMessagesManager.
        if(!results?.pFlags?.min && results.pFlags?.has_unread_votes && !wasUnread) {
          this.bumpUnreadPollVotes(update, true);
        }
        if(!results?.pFlags?.min && !results.pFlags?.has_unread_votes && wasUnread) {
          this.bumpUnreadPollVotes(update, false);
        }
      }
    });
  }

  private bumpUnreadPollVotes(update: {poll_id: Poll['id'], peer?: Message.message['peer_id'], msg_id?: number, top_msg_id?: number}, add: boolean) {
    // Resolve which message(s) the unread vote applies to. The update may
    // carry the message context directly (peer + msg_id); otherwise we fall
    // back to the local poll→messages map populated by `updatePollToMessage`.
    const messageRefs: Array<{peerId: PeerId, mid: number}> = [];
    if(update.peer && update.msg_id) {
      const peerId = this.appPeersManager.getPeerId(update.peer);
      const channelId = peerId.isAnyChat() ? peerId.toChatId() : 0;
      const mid = this.appMessagesIdsManager.generateMessageId(update.msg_id, channelId);
      messageRefs.push({peerId, mid});
    } else {
      const pollMessageKeys = this.pollToMessages[update.poll_id];
      if(!pollMessageKeys?.size) return;
      for(const key of pollMessageKeys) {
        const [peerIdStr, midStr] = key.split('_');
        messageRefs.push({peerId: peerIdStr.toPeerId(), mid: +midStr});
      }
    }

    for(const {peerId, mid} of messageRefs) {
      const message = this.appMessagesManager.getMessageByPeer(peerId, mid) as MyMessage;
      // `has_unread_votes` is only meaningful on polls we own.
      if(!message || !message.pFlags.out) {
        continue;
      }

      const threadId = getMessageThreadId(message, {
        isForum: this.appPeersManager.isForum(peerId),
        isBotforum: this.appPeersManager.isBotforum(peerId)
      });

      this.appMessagesManager.modifyCachedMentionsAndSave({
        peerId,
        mid: message.mid,
        threadId,
        addPollVote: add
      });
    }
  }

  public clear = (init?: boolean) => {
    if(init) return;

    this.polls = {};
    this.results = {};
    this.pollToMessages = {};

    Object.values(this.refetchResultsTimeouts).forEach(({timerId}) => {
      self.clearTimeout(timerId);
    });

    this.refetchResultsTimeouts = {};
    this.createdPollIds.clear();
  };

  public savePoll(poll: Poll, results: PollResults, message?: Message.message) {
    if(message) {
      this.updatePollToMessage(message, true);
    }

    const id = poll.id;
    if(this.polls[id]) {
      poll = Object.assign(this.polls[id], poll);
      results = this.saveResults(poll, results);
    } else {
      this.polls[id] = poll;

      poll.chosenIndexes = [];
      poll.correctIndexes = [];
      results = this.saveResults(poll, results);
    }

    poll.answers.forEach(answer => {
      if(answer._ !== 'pollAnswer' || !answer.media) return;
      this.appMessagesManager.saveMessageMedia({media: answer.media});
    });
    if(results?.solution_media) {
      this.appMessagesManager.saveMessageMedia({media: results.solution_media});
    }

    this.checkRefetchPollTimeout(poll);

    return {poll, results};
  }

  private checkRefetchPollTimeout(poll: Poll) {
    const id = poll.id;
    if(this.createdPollIds.has(id.toString())) return;

    const refetchResultTimeout = this.refetchResultsTimeouts[id];

    if(refetchResultTimeout && refetchResultTimeout.closeTimestamp !== poll.close_date) {
      self.clearTimeout(refetchResultTimeout.timerId);
      delete this.refetchResultsTimeouts[id];
    }

    const nowInSeconds = Date.now() / 1000;
    const closeDate = poll.close_date ? poll.close_date - this.timeManager.getServerTimeOffset() : 0;

    if(!closeDate || closeDate <= nowInSeconds || this.refetchResultsTimeouts[id]) return;

    const diffInSeconds = closeDate - nowInSeconds;
    if(diffInSeconds >= oneHourInSeconds) return;

    this.refetchResultsTimeouts[id] = {
      timerId: self.setTimeout(() => {
        this.refetchResultsForPoll(id);
      }, diffInSeconds * 1000),
      closeTimestamp: poll.close_date
    };
  }

  public saveAndDispatchPoll(poll: Poll, results: PollResults, message?: Message.message) {
    const ret = this.savePoll(poll, results, message);
    this.rootScope.dispatchEvent('poll_update', {poll: ret.poll, results: ret.results});
  }

  public saveResults(poll: Poll, results: PollResults) {
    if(this.results[poll.id]) {
      const existingResults = this.results[poll.id];

      // in some cases, results are returned without results or pFlags.min, so we need to clear chosen indexes
      // for example when retracting vote from a poll with close_date and hide_results_until_close
      if(!results.pFlags.min && !results.results) {
        existingResults.results?.forEach(result => {
          delete result.pFlags.chosen;
        });
      }

      results = Object.assign(existingResults, results);
    } else {
      this.results[poll.id] = results;
    }

    if(!results.pFlags.min) { // ! https://core.telegram.org/constructor/pollResults - min
      poll.chosenIndexes.length = 0;
      poll.correctIndexes.length = 0;

      if(results?.results?.length) {
        results.results.forEach((answer, idx) => {
          if(answer.pFlags?.chosen) {
            poll.chosenIndexes.push(idx);
          }
          if(answer.pFlags?.correct) {
            poll.correctIndexes.push(idx);
          }
        });
      }
    }

    return results;
  }

  public getPoll(pollId: PollId): {poll: Poll, results: PollResults} {
    return {
      poll: this.polls[pollId],
      results: this.results[pollId]
    };
  }

  public getInputMediaPoll(poll: Poll, correctAnswers?: number[], solution?: string, solutionEntities?: MessageEntity[]): InputMedia.inputMediaPoll {
    if(solution) {
      [solution, solutionEntities] = parseMarkdown(solution, solutionEntities);
    } else {
      solution = undefined; // can be string here
    }

    return {
      _: 'inputMediaPoll',
      poll,
      correct_answers: correctAnswers,
      solution,
      solution_entities: solution ? solutionEntities : undefined
    };
  }

  public updatePollToMessage(message: Message.message, add: boolean) {
    const {id} = (message.media as MessageMedia.messageMediaPoll).poll;
    let set = this.pollToMessages[id];

    if(!add && !set) {
      return;
    }

    if(!set) {
      set = this.pollToMessages[id] = new Set();
    }

    const key = message.peerId + '_' + message.mid;
    if(add) set.add(key);
    else set.delete(key);

    if(!add && !set.size) {
      delete this.polls[id];
      delete this.results[id];
      delete this.pollToMessages[id];
    }
  }

  public async sendVote(message: Message.message, optionIndexes: number[]): Promise<void> {
    const messageId = message.mid;

    if(message.pFlags.is_outgoing) {
      return this.appMessagesManager.invokeAfterMessageIsSent(messageId, 'sendVote', (message) => {
        this.log('invoke sendVote callback');
        return this.sendVote(message as Message.message, optionIndexes);
      });
    }

    const poll: Poll = (message.media as MessageMedia.messageMediaPoll).poll;

    const peerId = message.peerId;
    const inputPeer = this.appPeersManager.getInputPeerById(peerId);

    const options: Uint8Array[] = optionIndexes.map((index) => {
      const answer = poll.answers[index];
      if(answer?._ !== 'pollAnswer') return;
      return answer.option;
    }).filter(Boolean);

    const updates = await this.apiManager.invokeApi('messages.sendVote', {
      peer: inputPeer,
      msg_id: getServerMessageId(message.mid),
      options
    });

    this.log('sendVote updates:', updates);
    this.apiUpdatesManager.processUpdateMessage(updates);
  }

  public async addPollAnswer(message: Message.message, text: TextWithEntities, media?: FinalizedAttachedMedia) {
    if(message.media?._ !== 'messageMediaPoll') return;

    const peerId = this.appPeersManager.getPeerMigratedTo(message.peerId) || message.peerId;

    const uploadingMedia = media ? this.uploadPollMedia(peerId, media) : undefined;

    const inputPeer = this.appPeersManager.getInputPeerById(peerId);

    const updates = await this.apiManager.invokeApi('messages.addPollAnswer', {
      peer: inputPeer,
      msg_id: getServerMessageId(message.mid),
      answer: {
        _: 'inputPollAnswer',
        text,
        media: await uploadingMedia?.deferred
      }
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }

  public getResults(message: Message.message) {
    const inputPeer = this.appPeersManager.getInputPeerById(message.peerId);

    assumeType<MessageMedia.messageMediaPoll>(message.media);

    return this.apiManager.invokeApi('messages.getPollResults', {
      peer: inputPeer,
      msg_id: getServerMessageId(message.mid),
      poll_hash: message.media?.poll?.hash ?? 0
    }).then((updates) => {
      this.apiUpdatesManager.processUpdateMessage(updates);
      this.log('getResults updates:', updates);
    });
  }

  public refetchResultsForPoll(pollId: PollId) {
    const messages = this.pollToMessages[pollId];
    if(!messages) return;

    for(const key of messages) {
      const [peerId, mid] = key.split('_');

      const message = this.appMessagesManager.getMessageByPeer(peerId.toPeerId(), +mid);
      if(message?._ === 'message') {
        this.getResults(message);
      }
    }
  }

  public getVotes(message: Message.message, option?: Uint8Array, offset?: string, limit = 20) {
    return this.apiManager.invokeApi('messages.getPollVotes', {
      peer: this.appPeersManager.getInputPeerById(message.peerId),
      id: getServerMessageId(message.mid),
      option,
      offset,
      limit
    }).then((votesList) => {
      this.log('getPollVotes messages:', votesList);

      this.appUsersManager.saveApiUsers(votesList.users);
      this.appChatsManager.saveApiChats(votesList.chats);

      return votesList;
    });
  }

  public stopPoll(message: Message.message) {
    const poll: Poll = (message.media as MessageMedia.messageMediaPoll).poll;

    if(poll.pFlags.closed) return Promise.resolve();

    const newPoll = copy(poll);
    newPoll.pFlags.closed = true;
    return this.appMessagesManager.editMessage(message, undefined, {
      newMedia: this.getInputMediaPoll(newPoll)
    }).then(() => {
      // console.log('stopped poll');
    }, (err) => {
      this.log.error('stopPoll error:', err);
    });
  }

  private uploadPollMedia(peerId: PeerId, media: FinalizedAttachedMedia): UploadPollMediaResult {
    if(media.type === 'sticker') {
      return this.makeStickerPollMedia(media);
    }

    if(media.type === 'video') {
      return this.uploadVideoPollMedia(peerId, media);
    }

    return this.uploadPhotoPollMedia(peerId, media);
  }

  private uploadVideoPollMedia(peerId: PeerId, media: AttachedVideo): UploadPollMediaResult {
    const mediaTempId = this.appMessagesManager.getMediaTempId();

    const {document, fileType, apiFileName, attachType, attributes, actionName} =
      this.appMessagesManager.makeDocumentAndMetaForSendingFile({
        file: media.blob,
        objectURL: media.objectUrl,
        isDocument: false,
        mediaTempId,
        width: media.width,
        height: media.height,
        duration: media.duration,
        isAnimated: media.isAnimated,
        thumb: media.thumb,
        isMedia: true
      });

    if(!document) throw new Error('Expected a document for poll video media');

    const {deferred, uploadingFileName} = this.appMessagesManager.makeMediaUploadDeferred({file: media.blob});

    const messageMedia: MessageMedia = {
      _: 'messageMediaDocument',
      pFlags: {},
      document
    };

    let uploadFileDeferred: CancellablePromise<InputFile>,
      uploadThumbnailDeferred: CancellablePromise<InputFile>;

    this.appMessagesManager.sendSmthLazyLoadQueue.push({
      load: () => {
        const inputMediaPromise = this.appMessagesManager.uploadMediaFile({
          peerId,
          file: media.blob,
          uploadingFileName,
          fileType,
          apiFileName,
          attachType,
          attributes,
          actionName,
          objectURL: media.objectUrl,
          thumb: media.thumb,
          onUploadDeferred: (promise) => {
            uploadFileDeferred = promise;
            this.appMessagesManager.syncSentAndUploadPromises({
              sentDeferred: deferred,
              uploadFileDeferred: promise,
              file: media.blob
            });
          },
          onThumbnailUploadDeferred: (promise) => {
            uploadThumbnailDeferred = promise;
          }
        });

        inputMediaPromise.then(async(inputMedia) => {
          const uploaded = await this.apiManager.invokeApi('messages.uploadMedia', {
            media: inputMedia,
            peer: this.appPeersManager.getInputPeerById(peerId)
          });

          if(uploaded._ !== 'messageMediaDocument') throw new Error('Unexpected media type');
          if(uploaded.document._ !== 'document') throw new Error('Unexpected document type');

          const doc = this.appDocsManager.saveDoc(uploaded.document);

          deferred.resolve({
            _: 'inputMediaDocument',
            id: getDocumentInput(doc),
            pFlags: {}
          });
        }).catch((e) => deferred.reject(e));

        return uploadFileDeferred;
      }
    });

    return {
      uploadingFileName,
      deferred,
      messageMedia,
      cancel: () => {
        uploadFileDeferred?.cancel();
        uploadThumbnailDeferred?.cancel();
      }
    };
  }

  private uploadPhotoPollMedia(peerId: PeerId, media: AttachedPhoto): UploadPollMediaResult {
    const mediaTempId = this.appMessagesManager.getMediaTempId();

    const {photo} = this.appMessagesManager.makeDocumentAndMetaForSendingFile({
      file: media.blob,
      objectURL: media.objectUrl,
      isDocument: false,
      mediaTempId,
      width: media.width,
      height: media.height,
      isMedia: true
    });

    if(!photo) throw new Error('Expected a photo for poll media');

    const {deferred, uploadingFileName} = this.appMessagesManager.makeMediaUploadDeferred({file: media.blob});

    const messageMedia: MessageMedia = {
      _: 'messageMediaPhoto',
      pFlags: {},
      photo
    };

    let uploadFileDeferred: CancellablePromise<InputFile>;

    this.appMessagesManager.sendSmthLazyLoadQueue.push({
      load: () => {
        uploadFileDeferred = this.apiFileManager.upload({file: media.blob, fileName: uploadingFileName});

        this.appMessagesManager.syncSentAndUploadPromises({sentDeferred: deferred, uploadFileDeferred, file: media.blob});

        uploadFileDeferred.then(async(inputFile) => {
          const media = await this.apiManager.invokeApi('messages.uploadMedia', {
            media: {
              _: 'inputMediaUploadedPhoto',
              file: inputFile,
              pFlags: {}
            },
            peer: this.appPeersManager.getInputPeerById(peerId)
          });
          if(media._ !== 'messageMediaPhoto') throw new Error('Unexpected media type');

          const photo = this.appPhotosManager.savePhoto(media.photo);

          deferred.resolve({
            _: 'inputMediaPhoto',
            id: getPhotoInput(photo),
            pFlags: {}
          });
        }, (e) => deferred.reject(e));

        return uploadFileDeferred;
      }
    });

    return {
      uploadingFileName,
      deferred,
      messageMedia,
      cancel: () => uploadFileDeferred.cancel()
    };
  }

  private makeStickerPollMedia(media: AttachedSticker): UploadPollMediaResult {
    // Stickers are referenced by an existing server document, so there's nothing
    // to upload. We resolve the deferred immediately with an inputMediaDocument.
    const doc = this.appDocsManager.getDoc(media.docId);

    const deferred = deferredPromise<InputMedia>();
    deferred.resolve({
      _: 'inputMediaDocument',
      id: getDocumentInput(doc),
      pFlags: {}
    });

    const messageMedia: MessageMedia = {
      _: 'messageMediaDocument',
      pFlags: {},
      document: doc
    };

    return {
      uploadingFileName: undefined as string | undefined,
      deferred,
      messageMedia
    };
  }

  private startUploadingAllPollMedia(peerId: PeerId, payload: CreatePollPayload) {
    const description = payload.descriptionAttachment ? this.uploadPollMedia(peerId, payload.descriptionAttachment) : undefined;
    const explanation = payload.explanationAttachment ? this.uploadPollMedia(peerId, payload.explanationAttachment) : undefined;

    const pollOptions = new Map<number, ReturnType<AppPollsManager['uploadPollMedia']>>;

    for(const [index, option] of payload.pollOptions.entries()) {
      if(option.attachment) {
        pollOptions.set(index, this.uploadPollMedia(peerId, option.attachment));
      }
    }

    return {
      description,
      explanation,
      pollOptions
    };
  }

  private parseAllPollMarkdown(payload: CreatePollPayload) {
    const toTextAndEntities = (ret: ReturnType<typeof parseMarkdown>) => ({text: ret[0], entities: ret[1]});

    // Note: question and poll options do not support formatting entities
    const question = toTextAndEntities([payload.question, payload.questionEntities]);
    const description = toTextAndEntities(parseMarkdown(payload.description, structuredClone(payload.descriptionEntities)));
    const explanation = toTextAndEntities(parseMarkdown(payload.explanation, structuredClone(payload.explanationEntities)));
    const pollOptions = payload.pollOptions.map((option) => toTextAndEntities([option.text, option.entities]));

    return {
      question,
      description,
      explanation,
      pollOptions
    };
  }

  private makePollMedia({peerId, payload, parsedPayload, uploadingMedia}: MakePollMediaArgs) {
    const pollId = randomLong();
    this.createdPollIds.add(pollId);

    const flag = (value: boolean) => value ? true as const : undefined;

    const pollWithoutAnswers: Omit<Poll.poll, 'answers'> = {
      _: 'poll',
      question: {
        _: 'textWithEntities',
        ...parsedPayload.question
      },
      id: pollId,
      hash: undefined,
      pFlags: {
        hide_results_until_close: flag(payload.hideResults),
        multiple_choice: flag(payload.allowMultipleAnswers),
        public_voters: flag(payload.showWhoVoted),
        revoting_disabled: flag(!payload.allowRevoting),
        shuffle_answers: flag(payload.shuffleOptions),
        quiz: flag(payload.hasCorrectAnswer),
        open_answers: flag(payload.allowAddingOptions),
        creator: true
      },
      close_date: payload.timeLimit?.type === 'timestamp' ? payload.timeLimit.timestamp : undefined,
      close_period: payload.timeLimit?.type === 'duration' ? payload.timeLimit.duration : undefined
    };

    const answersForMedia = payload.pollOptions.map((_, index): PollAnswer.pollAnswer => ({
      _: 'pollAnswer',
      text: {
        _: 'textWithEntities',
        ...parsedPayload.pollOptions[index]
      },
      option: new Uint8Array(Array.from(index.toString()).map((c) => c.charCodeAt(0))),
      added_by: this.appPeersManager.getOutputPeer(peerId),
      media: uploadingMedia.pollOptions.get(index)?.messageMedia
    }));

    const pollForMedia: Poll.poll = {
      ...pollWithoutAnswers,
      answers: answersForMedia
    };

    const savePollResult = this.appPollsManager.savePoll(pollForMedia, {
      _: 'pollResults',
      total_voters: 0,
      pFlags: {},
      recent_voters: [],
      solution: parsedPayload.explanation.text,
      solution_entities: parsedPayload.explanation.entities,
      solution_media: uploadingMedia.explanation?.messageMedia
    });

    const messageMedia: MessageMedia.messageMediaPoll = {
      _: 'messageMediaPoll',
      poll: savePollResult.poll,
      results: savePollResult.results,
      attached_media: uploadingMedia.description?.messageMedia
    };

    return {
      pollWithoutAnswers,
      messageMedia
    };
  }

  private async invokeSendPoll({peerId, params, randomId, pollWithoutAnswers, payload, parsedPayload, uploadingMedia}: InvokeSendPollArgs) {
    const getCorrectAnswers = () => {
      const result = payload.pollOptions
      .map((option, index) => ({option, index}))
      .filter(({option}) => option.checked)
      .map(({index}) => index)

      if(!result.length) return;

      return result;
    };

    const inputMediaPoll: InputMedia.inputMediaPoll = {
      _: 'inputMediaPoll',
      poll: {
        ...pollWithoutAnswers,
        hash: 0,
        question: {
          _: 'textWithEntities',
          text: parsedPayload.question.text,
          entities: this.appMessagesManager.getInputEntities(parsedPayload.question.entities) || []
        },
        answers: await Promise.all(parsedPayload.pollOptions.map(async(option, index): Promise<PollAnswer.inputPollAnswer> => ({
          _: 'inputPollAnswer',
          text: {
            _: 'textWithEntities',
            text: option.text,
            entities: this.appMessagesManager.getInputEntities(option.entities) || []
          },
          media: await uploadingMedia.pollOptions.get(index)?.deferred
        })))
      },
      correct_answers: getCorrectAnswers(),
      attached_media: await uploadingMedia.description?.deferred,
      solution: parsedPayload.explanation.text || undefined,
      solution_entities: parsedPayload.explanation.text ? this.appMessagesManager.getInputEntities(parsedPayload.explanation.entities) || [] : undefined,
      solution_media: await uploadingMedia.explanation?.deferred
    };

    const paidStars = params.confirmedPaymentResult?.starsAmount || undefined;

    const updates = await this.apiManager.invokeApi('messages.sendMedia', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      media: inputMediaPoll,
      message: parsedPayload.description.text,
      entities: this.appMessagesManager.getInputEntities(parsedPayload.description.entities) || [],
      random_id: randomId,
      reply_to: params.replyTo,
      schedule_date: params.scheduleDate,
      schedule_repeat_period: params.scheduleRepeatPeriod || undefined,
      silent: params.silent,
      send_as: params.sendAsPeerId ? this.appPeersManager.getInputPeerById(params.sendAsPeerId) : undefined,
      update_stickersets_order: params.updateStickersetOrder,
      invert_media: params.invertMedia,
      effect: params.effect,
      allow_paid_stars: paidStars
    });

    this.apiUpdatesManager.processUpdateMessage(updates)
    this.apiUpdatesManager.processPaidMessageUpdate({
      paidStars,
      wereStarsReserved: params.confirmedPaymentResult?.canUndo
    });
  }

  public async sendPollMessage(params: MessageSendingParams, payload: CreatePollPayload) {
    const peerId = this.appPeersManager.getPeerMigratedTo(params.peerId) || params.peerId;

    await this.appMessagesManager.checkSendOptions(params);

    const message = this.appMessagesManager.generateOutgoingMessage(peerId, params);

    const uploadingMedia = this.startUploadingAllPollMedia(peerId, payload);
    const parsedPayload = this.parseAllPollMarkdown(payload);

    const {pollWithoutAnswers, messageMedia} = this.makePollMedia({peerId, payload, parsedPayload, uploadingMedia});

    const pollId = messageMedia.poll.id;

    this.tempMessageByPollId.set(pollId, message);

    this.uploadingFileNamesByPollId.set(pollId, {
      description: uploadingMedia.description?.uploadingFileName,
      explanation: uploadingMedia.explanation?.uploadingFileName,
      answers: payload.pollOptions.map((_, i) => uploadingMedia.pollOptions.get(i)?.uploadingFileName)
    });

    const cancelCallbacks: Array<() => void> = [
      uploadingMedia.description?.cancel,
      uploadingMedia.explanation?.cancel,
      ...Array.from(uploadingMedia.pollOptions.values()).map(option => option.cancel)
    ].filter(Boolean);

    this.uploadingCancelCallbacks.set(pollId, cancelCallbacks);

    Promise.all([
      uploadingMedia.description?.deferred,
      uploadingMedia.explanation?.deferred,
      ...Array.from(uploadingMedia.pollOptions.values()).map(option => option.deferred)
    ]).catch(() => {
      // Run canceling for others in case one fails
      this.runUploadingCancelCallbacksForPoll(pollId);
    }).finally(() => {
      this.uploadingCancelCallbacks.delete(pollId);
      this.uploadingFileNamesByPollId.delete(pollId);

      // Was needed for canceling the uploads, get rid of it now
      this.tempMessageByPollId.delete(pollId);
    });

    message.media = messageMedia;
    message.message = parsedPayload.description.text;
    message.entities = parsedPayload.description.entities;
    message.uploadingFileName = [
      uploadingMedia.description?.uploadingFileName,
      uploadingMedia.explanation?.uploadingFileName,
      ...Array.from(uploadingMedia.pollOptions.values()).map((attachment) => attachment.uploadingFileName)
    ].filter(Boolean);

    message.send = async() => {
      try {
        await this.invokeSendPoll({
          peerId,
          params,
          randomId: message.random_id,
          pollWithoutAnswers,
          payload,
          parsedPayload,
          uploadingMedia
        });
      } catch(err) {
        const error = err as ApiError;

        const repayRequest = this.appMessagesManager.repayRequestHandler.tryRegisterRequest({
          error,
          messageCount: 1,
          paidStars: params.confirmedPaymentResult?.starsAmount || undefined,
          repayCallback: (override) => {
            this.sendPollMessage({...params, ...override}, payload);
          },
          wereStarsReserved: params.confirmedPaymentResult?.canUndo
        });

        this.appMessagesManager.toggleError(message, error, repayRequest);
      }
    };

    this.appMessagesManager.beforeMessageSending(message, {
      isScheduled: !!params.scheduleDate || undefined,
      threadId: params.threadId
    });
  }

  public getUploadingFileNamesForPoll(pollId: PollId): PollUploadingFileNames {
    return this.uploadingFileNamesByPollId.get(pollId);
  }

  public runUploadingCancelCallbacksForPoll(pollId: PollId) {
    const callbacks = this.uploadingCancelCallbacks.get(pollId);
    callbacks?.forEach(callback => {
      try { callback?.(); } catch{}
    });

    this.uploadingCancelCallbacks.delete(pollId);
  }

  public getRandomIdByUploadingFileName(filename: string) {
    let pollId: PollId | undefined;

    for(const [id, uploadingFileNames] of this.uploadingFileNamesByPollId.entries()) {
      if(uploadingFileNames.description === filename) pollId = id;
      if(uploadingFileNames.answers?.includes(filename)) pollId = id;
      if(uploadingFileNames.explanation === filename) pollId = id;
    }

    return pollId ? this.tempMessageByPollId.get(pollId)?.random_id : undefined;
  }
}
