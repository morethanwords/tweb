import { RichTextProcessor } from "../richtextprocessor";
import appMessagesManager from './appMessagesManager';
import appPeersManager from './appPeersManager';
import apiManager from "../mtproto/mtprotoworker";
import apiUpdatesManager from "./apiUpdatesManager";
import { $rootScope } from "../utils";

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

  pFlags?: Partial<{chosen: true}>
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
  flags: number,
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
  chosenIndex?: number
};

class AppPollsManager {
  private polls: {[id: string]: Poll} = {};
  private results: {[id: string]: PollResults} = {};

  constructor() {
    $rootScope.$on('apiUpdate', (e: CustomEvent) => {
      let update = e.detail;
      
      this.handleUpdate(update);
    });
  }
  
  public handleUpdate(update: any) {
    switch(update._) {
      case 'updateMessagePoll': { // when someone voted, we too
        console.log('updateMessagePoll:', update);

        let poll: Poll = this.polls[update.poll_id] || update.poll;
        if(!poll) {
          break;
        }

        poll = this.savePoll(poll, update.results);
        $rootScope.$broadcast('poll_update', {poll, results: update.results});
        break;
      }

      default:
        break;
    }
  }

  public savePoll(poll: Poll, results: PollResults) {
    let id = poll.id;
    if(this.polls[id]) {
      poll = this.polls[id];
      this.saveResults(poll, results);
      return poll;
    }

    this.polls[id] = poll;

    poll.rQuestion = RichTextProcessor.wrapEmojiText(poll.question);
    poll.rReply = RichTextProcessor.wrapEmojiText('📊') + ' ' + (poll.rQuestion || 'poll');
    this.saveResults(poll, results);
    return poll;
  }

  public saveResults(poll: Poll, results: PollResults) {
    this.results[poll.id] = results;
    poll.chosenIndex = (results && results.results && results.results.findIndex(answer => answer.pFlags?.chosen)) ?? -1;
  }

  public getPoll(pollID: string): {poll: Poll, results: PollResults} {
    return {
      poll: this.polls[pollID], 
      results: this.results[pollID]
    };
  }

  public sendVote(mid: number, optionIDs: number[]) {
    let message = appMessagesManager.getMessage(mid);
    let poll: Poll = message.media.poll;

    let options: Uint8Array[] = optionIDs.map(index => {
      return poll.answers[index].option;
    });
    
    let inputPeer = appPeersManager.getInputPeerByID(message.peerID);
    let messageID = message.id;

    return apiManager.invokeApi('messages.sendVote', {
      peer: inputPeer,
      msg_id: messageID,
      options
    }).then(updates => {
      console.log('appPollsManager sendVote updates:', updates);
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }
}

export default new AppPollsManager();