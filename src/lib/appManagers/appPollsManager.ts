/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import copy from '../../helpers/object/copy';
import {InputMedia, Message, MessageEntity, MessageMedia, Poll, PollResults} from '../../layer';
import {logger, LogTypes} from '../logger';
import parseMarkdown from '../richTextProcessor/parseMarkdown';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';

type PollId = Poll['id'];

export class AppPollsManager extends AppManager {
  public polls: {[id: PollId]: Poll} = {};
  public results: {[id: PollId]: PollResults} = {};
  public pollToMessages: {[id: PollId]: Set<string>} = {};

  private log = logger('POLLS', LogTypes.Error);

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

  public getInputMediaPoll(poll: Poll, correctAnswers?: Uint8Array[], solution?: string, solutionEntities?: MessageEntity[]): InputMedia.inputMediaPoll {
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

  public sendVote(message: Message.message, optionIds: number[]): Promise<void> {
    const poll: Poll = (message.media as MessageMedia.messageMediaPoll).poll;

    const options: Uint8Array[] = optionIds.map((index) => {
      return poll.answers[index].option;
    });

    const messageId = message.mid;
    const peerId = message.peerId;
    const inputPeer = this.appPeersManager.getInputPeerById(peerId);

    if(message.pFlags.is_outgoing) {
      return this.appMessagesManager.invokeAfterMessageIsSent(messageId, 'sendVote', (message) => {
        this.log('invoke sendVote callback');
        return this.sendVote(message as Message.message, optionIds);
      });
    }

    return this.apiManager.invokeApi('messages.sendVote', {
      peer: inputPeer,
      msg_id: getServerMessageId(message.mid),
      options
    }).then((updates) => {
      this.log('sendVote updates:', updates);
      this.apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public getResults(message: Message.message) {
    const inputPeer = this.appPeersManager.getInputPeerById(message.peerId);

    return this.apiManager.invokeApi('messages.getPollResults', {
      peer: inputPeer,
      msg_id: getServerMessageId(message.mid)
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
}
