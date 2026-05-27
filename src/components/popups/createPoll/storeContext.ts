import lastItem from '@helpers/array/lastItem';
import track from '@helpers/solid/track';
import {MessageEntity} from '@layer';
import {oneDayInSeconds} from '@lib/constants';
import {Accessor, createComputed, createContext, untrack, useContext} from 'solid-js';
import {createStore, SetStoreFunction, Store} from 'solid-js/store';
import {useCreatePollLimits} from './useCreatePollLimits';
import {checkOptionHasValue} from './utils';

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

export type AttachedPhoto = {
  type: 'photo';
  objectUrl: string;
  originalObjectUrl?: string;
  blob: Blob;
  originalBlob?: Blob;
  width: number;
  height: number;
};

export type AttachedSticker = {
  type: 'sticker';
  docId: DocId;
};

export type AttachedMedia = AttachedPhoto | AttachedSticker;

export type SupportedMediaType = 'photo' | 'sticker';

export type CreatePollContextExtra = {
  isBroadcast: Accessor<boolean>;
  supportedMediaTypes: Accessor<SupportedMediaType[]>;
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

  const {maxOptions} = useCreatePollLimits();

  createComputed(() => {
    if(store.allowMultipleAnswers) return;

    const firstChecked = untrack(() => store.pollOptions.findIndex((option) => option.checked));

    setStore('pollOptions', (option) => option.checked, 'checked', false);

    if(firstChecked !== -1) {
      setStore('pollOptions', firstChecked, 'checked', true);
    }
  });

  // Remove empty options from end of the list or add when the last item has a value
  createComputed(() => {
    // track options and their texts
    for(const option of store.pollOptions) {
      track(() => option.text);
    }

    if(store.pollOptions.length < maxOptions() && lastItem(store.pollOptions)?.text) {
      setStore('pollOptions', store.pollOptions.length, {
        text: '',
        entities: []
      });
      return;
    }

    let keepTo = store.pollOptions.length - 1;
    for(; keepTo >= 0; keepTo--) {
      if(checkOptionHasValue(store.pollOptions[keepTo])) {
        break;
      } else {
        setStore('pollOptions', keepTo, {checked: false}); // we're doing +1 later so unset the last one to not be checked
      }
    }

    keepTo += 1;
    if(keepTo >= store.pollOptions.length - 1) return;

    setStore('pollOptions', (prev) => prev.filter((_, i) => i <= keepTo)) // keep one more empty
  });

  return {
    store,
    setStore,
    ...extra
  };
};
