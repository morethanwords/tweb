import {MessageEntity} from '@layer';
import {oneDayInSeconds} from '@lib/constants';
import {Accessor, createComputed, createContext, untrack, useContext} from 'solid-js';
import {createStore, SetStoreFunction, Store} from 'solid-js/store';

export type CreatePollPayload = CreatePollStore;

export type CreatePollStore = {
  question: string;
  questionEntities: MessageEntity[];

  description: string;
  descriptionEntities: MessageEntity[];
  descriptionAttachment?: AttachedMedia;

  pollOptions: StorePollOption[];

  showWhoVoted: boolean;
  allowMultipleAnswers: boolean;
  allowAddingOptions: boolean;
  allowRevoting: boolean;
  shuffleOptions: boolean;
  hasCorrectAnswer: boolean;
  durationLimited: boolean;

  timeLimit?: TimeLimit;

  explanation: string;
  explanationEntities: MessageEntity[];
  explanationAttachment?: AttachedMedia;

  hideResults: boolean;
};

export type TimeLimit = {
  type: 'duration';
  duration: number;
} | {
  type: 'timestamp';
  timestamp: number;
};

export type StorePollOption = {
  text: string;
  entities: MessageEntity[];
  attachment?: AttachedMedia;
  checked?: boolean;
};

export type AttachedMedia = {
  type: 'photo';
  objectUrl: string;
  blob: Blob;
  width: number;
  height: number;
};

export type CreatePollContextExtra = {
  isBroadcast: Accessor<boolean>;
};

export type CreatePollContextValue = CreatePollContextExtra & {
  store: Store<CreatePollStore>;
  setStore: SetStoreFunction<CreatePollStore>;
};

export const CreatePollContext = createContext<CreatePollContextValue>();

export const useCreatePollContext = () => useContext(CreatePollContext);

export const createPollStoreContextValue = (extra: CreatePollContextExtra): CreatePollContextValue => {
  const [store, setStore] = createStore<CreatePollStore>({
    question: '',
    questionEntities: [],
    description: '',
    descriptionEntities: [],
    pollOptions: [{
      text: '',
      entities: []
    }],
    showWhoVoted: true,
    allowMultipleAnswers: true,
    allowAddingOptions: true,
    allowRevoting: true,
    shuffleOptions: true,
    hasCorrectAnswer: false,
    durationLimited: false,
    timeLimit: {type: 'duration', duration: oneDayInSeconds},
    explanation: '',
    explanationEntities: [],
    hideResults: false
  });

  createComputed(() => {
    if(store.allowMultipleAnswers) return;

    const firstChecked = untrack(() => store.pollOptions.findIndex((option) => option.checked));

    setStore('pollOptions', (option) => option.checked, 'checked', false);

    if(firstChecked !== -1) {
      setStore('pollOptions', firstChecked, 'checked', true);
    }
  });

  return {
    store,
    setStore,
    ...extra
  };
};
