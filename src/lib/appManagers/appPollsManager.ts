/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AppManager} from '@appManagers/manager';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import type {AttachedMedia, CreatePollPayload} from '@components/popups/createPoll/storeContext';
import assumeType from '@helpers/assumeType';
import copy from '@helpers/object/copy';
import {randomLong} from '@helpers/random';
import {InputMedia, Message, MessageEntity, MessageMedia, Poll, PollAnswer, PollResults, TextWithEntities} from '@layer';
import {LogTypes} from '@lib/logger';
import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';
import {MessageSendingParams} from './appMessagesManager';
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


export class AppPollsManager extends AppManager {
  public polls: {[id: PollId]: Poll} = {};
  public results: {[id: PollId]: PollResults} = {};
  public pollToMessages: {[id: PollId]: Set<string>} = {};

  constructor() {
    super();
    this.name = 'POLLS';
    this.logTypes = LogTypes.Error;
  }

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateMessagePoll: (update) => {
        this.log('updateMessagePoll:', update);

        let poll: Poll = update.poll || this.polls[update.poll_id];
        if(!poll) {
          return;
        }

        let results = update.results;
        const ret = this.savePoll(poll, results as any);
        poll = ret.poll;
        results = ret.results;

        this.rootScope.dispatchEvent('poll_update', {poll, results: results as any});
      }
    });
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
      results = this.saveResults(poll, results);
    }

    return {poll, results};
  }

  public saveResults(poll: Poll, results: PollResults) {
    if(this.results[poll.id]) {
      results = Object.assign(this.results[poll.id], results);
    } else {
      this.results[poll.id] = results;
    }

    if(!results.pFlags.min) { // ! https://core.telegram.org/constructor/pollResults - min
      poll.chosenIndexes.length = 0;
      if(results?.results?.length) {
        results.results.forEach((answer, idx) => {
          if(answer.pFlags?.chosen) {
            poll.chosenIndexes.push(idx);
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

  public async addPollAnswer(message: Message.message, text: TextWithEntities) {
    const peerId = message.peerId;
    const inputPeer = this.appPeersManager.getInputPeerById(peerId);

    // TODO: Uploading media too
    const updates = await this.apiManager.invokeApi('messages.addPollAnswer', {
      peer: inputPeer,
      msg_id: getServerMessageId(message.mid),
      answer: {
        _: 'inputPollAnswer',
        text
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

  private uploadPollMedia(peerId: PeerId, media: AttachedMedia) {
    const mediaTempId = this.appMessagesManager.getMediaTempId();

    const {photo, document} = this.appMessagesManager.makeDocumentAndMetaForSendingFile({
      file: media.blob,
      objectURL: media.objectUrl,
      isDocument: false,
      mediaTempId,
      width: media.width,
      height: media.height,
      isMedia: true
    });

    const {deferred, uploadingFileName} = this.appMessagesManager.makeMediaUploadDeferred({file: media.blob});

    const messageMedia: MessageMedia = {
      _: photo ? 'messageMediaPhoto' : 'messageMediaDocument',
      pFlags: {},
      photo,
      document
    };

    const uploadFileDeferred = this.apiFileManager.upload({file: media.blob, fileName: uploadingFileName});
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

    return {
      uploadingFileName,
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

    const question = toTextAndEntities(parseMarkdown(payload.question, payload.questionEntities));
    const description = toTextAndEntities(parseMarkdown(payload.description, payload.descriptionEntities));
    const explanation = toTextAndEntities(parseMarkdown(payload.explanation, payload.explanationEntities));
    const pollOptions = payload.pollOptions.map((option) => toTextAndEntities(parseMarkdown(option.text, option.entities)));

    return {
      question,
      description,
      explanation,
      pollOptions
    };
  }

  private makePollMedia({peerId, payload, parsedPayload, uploadingMedia}: MakePollMediaArgs) {
    const pollId = randomLong();

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
        open_answers: flag(payload.allowAddingOptions)
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
      option: new Uint8Array([index]),
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
    // TODO: Consider lazy load queue

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
}
