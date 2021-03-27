import { MOUNT_CLASS_TO } from "../../config/debug";
import { copy } from "../../helpers/object";
import { InputMedia, MessageEntity } from "../../layer";
import { logger, LogLevels } from "../logger";
import apiManager from "../mtproto/mtprotoworker";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import apiUpdatesManager from "./apiUpdatesManager";
import appMessagesManager from './appMessagesManager';
import appPeersManager from './appPeersManager';
import appUsersManager from "./appUsersManager";

export type PollAnswer = {
  _: 'pollAnswer',
  text: string,
  option: Uint8Array
};

export type PollAnswerVoters = {
  _: 'pollAnswerVoters',
  flags: number,
  option: Uint8Array,
  voters: number,

  pFlags: Partial<{
    chosen: true,
    correct: true
  }>
};

export type PollResult = {
  _: 'pollAnswerVoters',
  flags: number,
  option: Uint8Array,
  voters: number,

  pFlags?: Partial<{chosen: true, correct: true}>
};

export type PollResults = {
  _: 'pollResults',
  flags: number,
  results?: Array<PollResult>,
  total_voters?: number,
  recent_voters?: number[],
  solution?: string,
  solution_entities?: any[],

  pFlags: Partial<{
    min: true
  }>,
};

export type Poll = {
  _: 'poll',
  question: string,
  id: string,
  answers: Array<PollAnswer>,
  close_period?: number,
  close_date?: number

  pFlags?: Partial<{
    closed: true,
    public_voters: true,
    multiple_choice: true,
    quiz: true
  }>,
  rQuestion?: string,
  rReply?: string,
  chosenIndexes?: number[]
};

export class AppPollsManager {
  public polls: {[id: string]: Poll} = {};
  public results: {[id: string]: PollResults} = {};

  private log = logger('POLLS', LogLevels.error);

  constructor() {
    rootScope.on('apiUpdate', (e) => {
      const update = e;
      
      this.handleUpdate(update);
    });
  }
  
  public handleUpdate(update: any) {
    switch(update._) {
      case 'updateMessagePoll': { // when someone voted, we too
        this.log('updateMessagePoll:', update);

        let poll: Poll = update.poll || this.polls[update.poll_id];
        if(!poll) {
          break;
        }

        poll = this.savePoll(poll, update.results);
        rootScope.broadcast('poll_update', {poll, results: update.results});
        break;
      }

      default:
        break;
    }
  }

  public savePoll(poll: Poll, results: PollResults) {
    const id = poll.id;
    if(this.polls[id]) {
      poll = Object.assign(this.polls[id], poll);
      this.saveResults(poll, results);
      return poll;
    }

    this.polls[id] = poll;

    poll.rQuestion = RichTextProcessor.wrapEmojiText(poll.question);
    poll.rReply = RichTextProcessor.wrapEmojiText('📊') + ' ' + (poll.rQuestion || 'poll');
    poll.chosenIndexes = [];
    this.saveResults(poll, results);
    return poll;
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
  }

  public getPoll(pollId: string): {poll: Poll, results: PollResults} {
    return {
      poll: this.polls[pollId], 
      results: this.results[pollId]
    };
  }

  public getInputMediaPoll(poll: Poll, correctAnswers?: Uint8Array[], solution?: string, solutionEntities?: MessageEntity[]): InputMedia.inputMediaPoll {
    if(solution) {
      if(!solutionEntities) {
        solutionEntities = [];
      }

      solution = RichTextProcessor.parseMarkdown(solution, solutionEntities);
    }

    return {
      _: 'inputMediaPoll',
      poll,
      correct_answers: correctAnswers,
      solution,
      solution_entities: solutionEntities?.length ? solutionEntities : undefined
    };
  }

  public sendVote(message: any, optionIds: number[]): Promise<void> {
    const poll: Poll = message.media.poll;

    const options: Uint8Array[] = optionIds.map(index => {
      return poll.answers[index].option;
    });
    
    const messageId = message.mid;
    const peerId = message.peerId;
    const inputPeer = appPeersManager.getInputPeerById(peerId);

    if(message.pFlags.is_outgoing) {
      return appMessagesManager.invokeAfterMessageIsSent(messageId, 'sendVote', (message) => {
        this.log('invoke sendVote callback');
        return this.sendVote(message, optionIds);
      });
    }

    return apiManager.invokeApi('messages.sendVote', {
      peer: inputPeer,
      msg_id: appMessagesManager.getServerMessageId(message.mid),
      options
    }).then(updates => {
      this.log('sendVote updates:', updates);
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public getResults(message: any) {
    const inputPeer = appPeersManager.getInputPeerById(message.peerId);

    return apiManager.invokeApi('messages.getPollResults', {
      peer: inputPeer,
      msg_id: appMessagesManager.getServerMessageId(message.mid)
    }).then(updates => {
      apiUpdatesManager.processUpdateMessage(updates);
      this.log('getResults updates:', updates);
    });
  }

  public getVotes(message: any, option?: Uint8Array, offset?: string, limit = 20) {
    return apiManager.invokeApi('messages.getPollVotes', {
      peer: appPeersManager.getInputPeerById(message.peerId),
      id: appMessagesManager.getServerMessageId(message.mid),
      option,
      offset,
      limit
    }).then((votesList) => {
      this.log('getPollVotes messages:', votesList);

      appUsersManager.saveApiUsers(votesList.users);

      return votesList;
    });
  }

  public stopPoll(message: any) {
    const poll: Poll = message.media.poll;
    
    if(poll.pFlags.closed) return Promise.resolve();

    const newPoll = copy(poll);
    newPoll.pFlags.closed = true;
    return appMessagesManager.editMessage(message, undefined, {
      newMedia: this.getInputMediaPoll(newPoll)
    }).then(() => {
      //console.log('stopped poll');
    }, err => {
      this.log.error('stopPoll error:', err);
    });
  }
}

const appPollsManager = new AppPollsManager();
MOUNT_CLASS_TO.appPollsManager = appPollsManager;
export default appPollsManager;
