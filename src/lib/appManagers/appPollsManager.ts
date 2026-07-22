import {AppManager} from '@appManagers/manager';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import type {AttachedLink, AttachedPhoto, AttachedSticker, AttachedVideo, CreatePollPayload, FinalizedAttachedMedia} from '@components/popups/createPoll/storeContext';
import assumeType from '@helpers/assumeType';
import compareUint8Arrays from '@helpers/bytes/compareUint8Arrays';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import copy from '@helpers/object/copy';
import {randomLong} from '@helpers/random';
import {InputFile, InputMedia, Message, MessageEntity, MessageMedia, Poll, PollAnswer, PollAnswerVoters, PollResults, TextWithEntities, WebPage} from '@layer';
import {oneHourInSeconds} from '@lib/constants';
import {LogTypes} from '@lib/logger';
import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';
import {MessageSendingParams, MyMessage} from './appMessagesManager';
import {
  isPollVoteRestrictionActive,
  parsePollVoteRestrictionError,
  PollVoteRestriction,
  PollVoteRestrictionState
} from '@appManagers/utils/polls/pollVoteRestriction';
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
  private pollIdsByWebPageId: Map<string | number, Set<PollId>> = new Map();
  private webPageIdsByPollId: Map<PollId, Set<string | number>> = new Map();
  private voteRestrictionsByPollId: Map<PollId, PollVoteRestrictionState> = new Map();

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

    this.rootScope.addEventListener('webpage_updated', ({id}) => {
      const pollIds = this.pollIdsByWebPageId.get(id);
      if(!pollIds) return;

      const webpage = this.appWebPagesManager.getCachedWebPage(id);
      if(!webpage || webpage._ === 'webPageNotModified') return;

      for(const pollId of [...pollIds]) {
        const poll = this.polls[pollId];
        if(!poll) continue;

        let hasWebPage = false;
        for(const answer of poll.answers) {
          if(answer._ !== 'pollAnswer' || answer.media?._ !== 'messageMediaWebPage') continue;
          hasWebPage = this.replacePollWebPage(answer.media, id, webpage) || hasWebPage;
        }

        const results = this.results[poll.id];
        if(results?.solution_media?._ === 'messageMediaWebPage') {
          hasWebPage = this.replacePollWebPage(results.solution_media, id, webpage) || hasWebPage;
        }

        for(const message of this.getPollMessages(poll.id)) {
          if(message.media?._ !== 'messageMediaPoll' || message.media.attached_media?._ !== 'messageMediaWebPage') continue;
          if(!this.replacePollWebPage(message.media.attached_media, id, webpage)) continue;

          hasWebPage = true;
          this.rootScope.dispatchEvent('message_edit', {
            storageKey: message.storageKey,
            peerId: message.peerId,
            mid: message.mid,
            message
          });
        }

        if(hasWebPage) {
          this.indexPollWebPages(poll, results);
          if(results) this.rootScope.dispatchEvent('poll_update', {poll, results});
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
        const {peerId, mid, isScheduled} = this.getPollMessageByKey(key);
        if(!isScheduled) messageRefs.push({peerId, mid});
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
    this.pollIdsByWebPageId.clear();
    this.webPageIdsByPollId.clear();
    this.voteRestrictionsByPollId.clear();
  };

  private unindexPollWebPages(pollId: PollId) {
    const webPageIds = this.webPageIdsByPollId.get(pollId);
    if(!webPageIds) return;

    for(const id of webPageIds) {
      const pollIds = this.pollIdsByWebPageId.get(id);
      if(!pollIds) continue;

      pollIds.delete(pollId);
      if(!pollIds.size) this.pollIdsByWebPageId.delete(id);
    }

    this.webPageIdsByPollId.delete(pollId);
  }

  private getPollMessageKey(message: Message.message) {
    return `${message.peerId}_${message.mid}${message.pFlags.is_scheduled ? '_s' : ''}`;
  }

  public getPollMessageByKey(key: string) {
    const [peerIdString, midString, scheduledMarker] = key.split('_');
    const peerId = +peerIdString as PeerId;
    const mid = +midString;
    const isScheduled = scheduledMarker === 's';
    const message = isScheduled ?
      this.appMessagesManager.getScheduledMessageByPeer(peerId, mid) :
      this.appMessagesManager.getMessageByPeer(peerId, mid);

    return {
      peerId,
      mid,
      isScheduled,
      message: message?._ === 'message' ? message : undefined
    };
  }

  private replacePollWebPage(
    media: MessageMedia.messageMediaWebPage,
    id: WebPage.webPage['id'],
    webpage: Exclude<WebPage, WebPage.webPageNotModified>
  ) {
    const current = media.webpage;
    if(!current || current._ === 'webPageNotModified' || current.id !== id) return false;

    const currentUrl = current.url;
    media.webpage = webpage._ === 'webPage' && !webpage.url && currentUrl ?
      {...webpage, url: currentUrl} :
      webpage;
    return true;
  }

  private getPollMessages(pollId: PollId, currentMessage?: Message.message) {
    const messages: Message.message[] = [];
    const currentKey = currentMessage && this.getPollMessageKey(currentMessage);
    if(currentMessage) messages.push(currentMessage);

    for(const key of this.pollToMessages[pollId] || []) {
      if(key === currentKey) continue;

      const {message} = this.getPollMessageByKey(key);
      if(message) messages.push(message);
    }

    return messages;
  }

  private indexPollWebPages(poll: Poll, results: PollResults, currentMessage?: Message.message) {
    this.unindexPollWebPages(poll.id);

    const webPageIds = new Set<string | number>();

    const addMedia = (media?: MessageMedia) => {
      if(media?._ !== 'messageMediaWebPage') return;
      const webpage = media.webpage;
      if(!webpage || webpage._ === 'webPageNotModified' || webpage._ === 'webPageEmpty' || !webpage.id) return;

      webPageIds.add(webpage.id);
    };

    for(const answer of poll.answers) {
      if(answer._ === 'pollAnswer') addMedia(answer.media);
    }

    addMedia(results?.solution_media);
    for(const message of this.getPollMessages(poll.id, currentMessage)) {
      if(message.media?._ === 'messageMediaPoll') addMedia(message.media.attached_media);
    }

    for(const webPageId of webPageIds) {
      let pollIds = this.pollIdsByWebPageId.get(webPageId);
      if(!pollIds) this.pollIdsByWebPageId.set(webPageId, pollIds = new Set());
      pollIds.add(poll.id);
    }

    if(webPageIds.size) this.webPageIdsByPollId.set(poll.id, webPageIds);
  }

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

    poll.answers.forEach((answer) => {
      if(answer._ !== 'pollAnswer') return;
      this.appMessagesManager.saveMessageMedia(answer, 'media');
    });
    this.indexPollWebPages(poll, results, message);
    this.appMessagesManager.saveMessageMedia(results, 'solution_media');

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

  private mergeMinAnswerResults(
    poll: Poll,
    existingResults: PollAnswerVoters[] = [],
    minResults: PollAnswerVoters[]
  ) {
    const mergedResults: PollAnswerVoters[] = [];

    for(const answer of poll.answers) {
      if(answer._ !== 'pollAnswer') continue;

      const existingResult = existingResults.find((result) => compareUint8Arrays(result.option, answer.option));
      const minResult = minResults.find((result) => compareUint8Arrays(result.option, answer.option));

      if(!minResult) {
        mergedResults.push(existingResult || {
          _: 'pollAnswerVoters',
          pFlags: {},
          option: answer.option
        });
        continue;
      }

      const pFlags = {...existingResult?.pFlags, ...minResult.pFlags};

      // A min result can update counts and mark an answer as correct, but it
      // must not change which answers the current user has chosen.
      if(existingResult?.pFlags.chosen) pFlags.chosen = true;
      else delete pFlags.chosen;

      if(existingResult?.pFlags.correct || minResult.pFlags.correct) pFlags.correct = true;
      else delete pFlags.correct;

      mergedResults.push(existingResult ?
        Object.assign(existingResult, minResult, {pFlags}) :
        {...minResult, pFlags}
      );
    }

    return mergedResults.length ? mergedResults : existingResults;
  }

  public saveResults(poll: Poll, results: PollResults) {
    if(this.results[poll.id]) {
      const existingResults = this.results[poll.id];
      const isMin = !!results.pFlags.min;
      const pFlags = isMin ? {...existingResults.pFlags, ...results.pFlags} : results.pFlags;
      const answerResults = isMin && results.results ?
        this.mergeMinAnswerResults(poll, existingResults.results, results.results) :
        results.results;

      // in some cases, results are returned without results or pFlags.min, so we need to clear chosen indexes
      // for example when retracting vote from a poll with close_date and hide_results_until_close
      if(!results.pFlags.min && !results.results) {
        existingResults.results?.forEach(result => {
          delete result.pFlags.chosen;
        });
      }

      results = Object.assign(
        existingResults,
        results,
        {pFlags},
        answerResults ? {results: answerResults} : undefined
      );
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

  public getPollVoteRestriction(pollId: PollId): PollVoteRestrictionState | undefined {
    const state = this.voteRestrictionsByPollId.get(pollId);
    if(isPollVoteRestrictionActive(state)) return state;

    if(state) this.voteRestrictionsByPollId.delete(pollId);
  }

  public setPollVoteRestriction(pollId: PollId, restriction?: PollVoteRestriction) {
    const previous = this.voteRestrictionsByPollId.get(pollId);
    const state = restriction ? {restriction, updatedAt: Date.now()} : undefined;

    if(state) this.voteRestrictionsByPollId.set(pollId, state);
    else this.voteRestrictionsByPollId.delete(pollId);

    if(!previous && !state) return;
    this.rootScope.dispatchEvent('poll_vote_restriction', {pollId, state});
  }

  private getInputPollMedia(media: MessageMedia): InputMedia {
    if(media._ === 'messageMediaPhoto' && media.photo?._ === 'photo') {
      return {
        _: 'inputMediaPhoto',
        pFlags: {},
        id: getPhotoInput(media.photo)
      };
    }

    if(media._ === 'messageMediaDocument' && media.document?._ === 'document') {
      return {
        _: 'inputMediaDocument',
        pFlags: {},
        id: getDocumentInput(media.document)
      };
    }

    if(media._ === 'messageMediaGeo' && media.geo._ === 'geoPoint') {
      return {
        _: 'inputMediaGeoPoint',
        geo_point: {
          _: 'inputGeoPoint',
          lat: media.geo.lat,
          long: media.geo.long,
          accuracy_radius: media.geo.accuracy_radius
        }
      };
    }

    if(media._ === 'messageMediaWebPage' && media.webpage._ !== 'webPageNotModified' && media.webpage.url) {
      return {
        _: 'inputMediaWebPage',
        pFlags: {optional: true},
        url: media.webpage.url
      };
    }

    throw new Error(`Unsupported poll media: ${media._}`);
  }

  public getInputMediaPoll(
    poll: Poll,
    correctAnswers?: number[],
    solution?: string,
    solutionEntities?: MessageEntity[],
    attachedMedia?: MessageMedia,
    solutionMedia?: MessageMedia
  ): InputMedia.inputMediaPoll {
    const pollForInput = {...poll};
    delete pollForInput.chosenIndexes;
    delete pollForInput.correctIndexes;

    const answers = poll.answers.map((answer): PollAnswer => {
      if(answer._ !== 'pollAnswer') {
        return {
          _: 'inputPollAnswer',
          text: answer.text,
          media: answer.media
        };
      }

      if(!answer.media) {
        return {
          _: 'pollAnswer',
          text: answer.text,
          option: answer.option
        };
      }

      return {
        _: 'inputPollAnswer',
        text: answer.text,
        media: this.getInputPollMedia(answer.media)
      };
    });

    return {
      _: 'inputMediaPoll',
      poll: {
        ...pollForInput,
        hash: 0,
        answers
      },
      correct_answers: correctAnswers,
      attached_media: attachedMedia ? this.getInputPollMedia(attachedMedia) : undefined,
      solution,
      solution_entities: solution ? solutionEntities : undefined,
      solution_media: solutionMedia ? this.getInputPollMedia(solutionMedia) : undefined
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

    const key = this.getPollMessageKey(message);
    if(add) set.add(key);
    else set.delete(key);

    if(!add && !set.size) {
      delete this.polls[id];
      delete this.results[id];
      delete this.pollToMessages[id];
      this.voteRestrictionsByPollId.delete(id);
      this.unindexPollWebPages(id);
    } else if(!add && this.polls[id]) {
      this.indexPollWebPages(this.polls[id], this.results[id]);
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

    let updates;
    try {
      updates = await this.apiManager.invokeApi('messages.sendVote', {
        peer: inputPeer,
        msg_id: getServerMessageId(message.mid),
        options
      });
    } catch(error) {
      const restriction = parsePollVoteRestrictionError((error as ApiError)?.type);
      if(restriction) this.setPollVoteRestriction(poll.id, restriction);
      throw error;
    }

    this.log('sendVote updates:', updates);
    this.setPollVoteRestriction(poll.id);
    this.apiUpdatesManager.processUpdateMessage(updates);
  }

  public async addPollAnswer(message: Message.message, text: TextWithEntities, media?: FinalizedAttachedMedia) {
    if(message.media?._ !== 'messageMediaPoll') return;

    const peerId = this.appPeersManager.getPeerMigratedTo(message.peerId) || message.peerId;
    const messageId = message.mid;

    const uploadingMedia = media ? this.uploadPollMedia(peerId, media) : undefined;

    if(message.pFlags.is_outgoing) {
      return this.appMessagesManager.invokeAfterMessageIsSent(messageId, 'addPollAnswer', (message) => {
        if(message?._ !== 'message') return;
        return this.finalizeAddingPollAnswer(message, text, uploadingMedia);
      });
    }

    return this.finalizeAddingPollAnswer(message, text, uploadingMedia);
  }

  private async finalizeAddingPollAnswer(message: Message.message, text: TextWithEntities, uploadingMedia?: UploadPollMediaResult) {
    const peerId = this.appPeersManager.getPeerMigratedTo(message.peerId) || message.peerId;

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
      const {message, isScheduled} = this.getPollMessageByKey(key);
      if(message && !isScheduled) {
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
    const media = message.media as MessageMedia.messageMediaPoll;
    const poll = media.poll;

    if(poll.pFlags.closed) return Promise.resolve();

    const newPoll = copy(poll);
    newPoll.pFlags.closed = true;
    const results = this.results[poll.id] || media.results;
    return this.appMessagesManager.editMessage(message, undefined, {
      newMedia: this.getInputMediaPoll(
        newPoll,
        poll.correctIndexes?.length ? poll.correctIndexes : undefined,
        results.solution,
        results.solution_entities,
        media.attached_media,
        results.solution_media
      )
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

    if(media.type === 'link') {
      return this.makeLinkPollMedia(media);
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

  private makeLinkPollMedia(media: AttachedLink): UploadPollMediaResult {
    const deferred = deferredPromise<InputMedia>();
    deferred.resolve({
      _: 'inputMediaWebPage',
      pFlags: {optional: true},
      url: media.url
    });

    let preview = media.preview;
    const previewWebPage = preview?.webpage;
    if(previewWebPage && previewWebPage._ !== 'webPageNotModified' && previewWebPage.id) {
      const cachedWebPage = this.appWebPagesManager.getCachedWebPage(previewWebPage.id);
      if(cachedWebPage) preview = {...preview, webpage: cachedWebPage};
    }

    const messageMedia: MessageMedia.messageMediaWebPage = preview || {
      _: 'messageMediaWebPage',
      pFlags: {},
      webpage: {
        _: 'webPageEmpty',
        id: 0,
        url: media.url
      }
    };

    return {
      deferred,
      messageMedia
    };
  }

  private startUploadingAllPollMedia(peerId: PeerId, payload: CreatePollPayload) {
    const uploadBodyMedia = (media: FinalizedAttachedMedia | undefined) =>
      media && media.type !== 'link' ? this.uploadPollMedia(peerId, media) : undefined;

    const description = uploadBodyMedia(payload.descriptionAttachment);
    const explanation = uploadBodyMedia(payload.explanationAttachment);

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
        subscribers_only: flag(payload.restrictToSubscribers),
        creator: true
      },
      countries_iso2: payload.limitByCountry && payload.countriesIso2.length ? payload.countriesIso2 : undefined,
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
        answers: await Promise.all(parsedPayload.pollOptions.map(async(option, index): Promise<PollAnswer> => {
          const text: TextWithEntities = {
            _: 'textWithEntities',
            text: option.text,
            entities: this.appMessagesManager.getInputEntities(option.entities) || []
          };
          const media = await uploadingMedia.pollOptions.get(index)?.deferred;

          return media ? {
            _: 'inputPollAnswer',
            text,
            media
          } : {
            _: 'pollAnswer',
            text,
            option: new Uint8Array(Array.from(index.toString()).map((c) => c.charCodeAt(0)))
          };
        }))
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
      // await pause(12_000);
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
