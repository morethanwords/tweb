import { RichTextProcessor } from "../richtextprocessor";

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
};

class AppPollsManager {
  private polls: {[id: string]: Poll} = {};
  private results: {[id: string]: PollResults} = {};

  public savePoll(poll: Poll, results: PollResults) {
    let id = poll.id;
    if(this.polls[id]) {
      this.results[id] = results;
      return;
    }

    this.polls[id] = poll;
    this.results[id] = results;

    poll.rQuestion = RichTextProcessor.wrapEmojiText(poll.question);
    poll.rReply = RichTextProcessor.wrapEmojiText('📊') + ' ' + (poll.rQuestion || 'poll');
  }

  public getPoll(pollID: string): {poll: Poll, results: PollResults} {
    return {
      poll: this.polls[pollID], 
      results: this.results[pollID]
    };
  }
}

export default new AppPollsManager();