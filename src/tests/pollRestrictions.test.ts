import {AppPollsManager} from '@appManagers/appPollsManager';
import {CreatePollContextValue, CreatePollStore} from '@components/popups/createPoll/storeContext';
import {canSubmitPoll, getFinalPayload, validateCountryRestriction} from '@components/popups/createPoll/utils';
import {MessageEntity, Poll, PollAnswer, PollAnswerVoters, PollResults} from '@layer';


const makeStore = (overrides: Partial<CreatePollStore> = {}): CreatePollStore => ({
  question: 'Question',
  questionEntities: [],
  description: '',
  descriptionEntities: [],
  pollOptions: [{text: 'One', entities: []}, {text: 'Two', entities: []}],
  showWhoVoted: true,
  allowMultipleAnswers: false,
  allowAddingOptions: false,
  allowRevoting: true,
  shuffleOptions: false,
  hasCorrectAnswer: false,
  restrictToSubscribers: false,
  limitByCountry: false,
  countriesIso2: [],
  durationLimited: false,
  explanation: '',
  explanationEntities: [],
  hideResults: false,
  ...overrides
});

const makeContext = (store: CreatePollStore, isBroadcast: boolean): CreatePollContextValue => ({
  store: store as any,
  setStore: vi.fn() as any,
  isBroadcast: () => isBroadcast,
  supportedMediaTypes: () => [],
  canEncodeVideo: () => false
});

const makePoll = (): Poll.poll => ({
  _: 'poll',
  id: 1,
  pFlags: {},
  question: {_: 'textWithEntities', text: 'Question', entities: []},
  answers: [1, 2, 3].map((value) => ({
    _: 'pollAnswer',
    text: {_: 'textWithEntities', text: `Option ${value}`, entities: [] as MessageEntity[]},
    option: new Uint8Array([value])
  })),
  chosenIndexes: [0],
  correctIndexes: [1],
  hash: 1
});

const makeResults = (pFlags: PollResults.pollResults['pFlags']): PollResults.pollResults => ({
  _: 'pollResults',
  pFlags
});

const makeAnswerResult = (
  option: Uint8Array,
  voters: number,
  pFlags: PollAnswerVoters.pollAnswerVoters['pFlags'] = {}
): PollAnswerVoters.pollAnswerVoters => ({
  _: 'pollAnswerVoters',
  pFlags,
  option,
  voters
});

describe('poll restrictions', () => {
  test('keeps Create enabled, then reports and scrolls to an empty country restriction', () => {
    const store = makeStore({limitByCountry: true});
    const onError = vi.fn();
    const scrollIntoView = vi.fn();

    expect(canSubmitPoll(store, {
      maxDescriptionLength: 2048,
      maxExplanationLength: 200,
      maxOptionLength: 100,
      maxOptions: 12,
      maxQuestionLength: 255
    })).toBe(true);
    expect(validateCountryRestriction(
      store,
      true,
      onError,
      {scrollIntoView} as unknown as HTMLElement
    )).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'center'});
  });

  test('serializes broadcast restrictions only while they are enabled and applicable', () => {
    const enabled = getFinalPayload(makeContext(makeStore({
      restrictToSubscribers: true,
      limitByCountry: true,
      countriesIso2: ['US', 'FT']
    }), true));
    const disabled = getFinalPayload(makeContext(makeStore({
      countriesIso2: ['US']
    }), true));
    const nonBroadcast = getFinalPayload(makeContext(makeStore({
      restrictToSubscribers: true,
      limitByCountry: true,
      countriesIso2: ['US']
    }), false));

    expect(enabled).toMatchObject({
      restrictToSubscribers: true,
      limitByCountry: true,
      countriesIso2: ['US', 'FT']
    });
    expect(disabled.countriesIso2).toEqual([]);
    expect(nonBroadcast).toMatchObject({
      restrictToSubscribers: false,
      limitByCountry: false,
      countriesIso2: []
    });
  });

  test('merges sparse min results by option without losing full-result state', () => {
    const manager = new AppPollsManager();
    const poll = makePoll();
    const options = poll.answers.map((answer) => (answer as PollAnswer.pollAnswer).option);
    manager.results[poll.id] = {
      ...makeResults({can_view_stats: true, has_unread_votes: true}),
      results: [
        makeAnswerResult(options[0], 1, {chosen: true}),
        makeAnswerResult(options[1], 2, {correct: true}),
        makeAnswerResult(options[2], 3)
      ]
    };

    const results = manager.saveResults(poll, {
      ...makeResults({min: true}),
      results: [
        makeAnswerResult(options[2], 30, {chosen: true, correct: true}),
        makeAnswerResult(options[0], 10)
      ]
    });

    expect(results.results.map(({voters}) => voters)).toEqual([10, 2, 30]);
    expect(results.results[0].pFlags.chosen).toBe(true);
    expect(results.results[1].pFlags.correct).toBe(true);
    expect(results.results[2].pFlags).toMatchObject({correct: true});
    expect(results.results[2].pFlags.chosen).toBeUndefined();
    expect(results.pFlags).toMatchObject({
      min: true,
      can_view_stats: true,
      has_unread_votes: true
    });
    expect(poll.chosenIndexes).toEqual([0]);
    expect(poll.correctIndexes).toEqual([1]);
  });

  test('does not retain permission flags from an older full result', () => {
    const manager = new AppPollsManager();
    const poll = makePoll();
    manager.results[poll.id] = makeResults({can_view_stats: true, has_unread_votes: true});

    const results = manager.saveResults(poll, makeResults({}));

    expect(results.pFlags.can_view_stats).toBeUndefined();
    expect(results.pFlags.has_unread_votes).toBeUndefined();
  });
});
