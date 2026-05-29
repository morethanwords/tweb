import lastItem from '@helpers/array/lastItem';
import track from '@helpers/solid/track';
import {MediaSize} from '@helpers/mediaSize';
import {MessageEntity} from '@layer';
import {oneDayInSeconds} from '@lib/constants';
import {Accessor, createComputed, createContext, untrack, useContext} from 'solid-js';
import {createStore, SetStoreFunction, Store} from 'solid-js/store';
import {useCreatePollLimits} from './useCreatePollLimits';
import {checkOptionHasValue} from './utils';

export type CreatePollPayload = Omit<CreatePollStore, 'descriptionAttachment' | 'explanationAttachment' | 'pollOptions'> & {
  descriptionAttachment?: FinalizedAttachedMedia;
  explanationAttachment?: FinalizedAttachedMedia;
  pollOptions: PayloadPollOption[];
};

export type PayloadPollOption = Omit<StorePollOption, 'attachment'> & {
  attachment?: FinalizedAttachedMedia;
};

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
  blob: Blob;
  width: number;
  height: number;
};

export type AttachedVideo = {
  type: 'video';
  objectUrl: string;
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  isAnimated: boolean;
  hasSound: boolean;
  thumb: {
    url: string;
    blob: Blob;
    size: MediaSize;
    isCover: boolean;
  };
};

export type Pending = {
  type: 'pending';
};

export type AttachedSticker = {
  type: 'sticker';
  docId: DocId;
};

/**
 * Finalized attached media — what gets sent to the server. Excludes the
 * transient `Pending` state used while a video is being rendered locally.
 */
export type FinalizedAttachedMedia = AttachedPhoto | AttachedVideo | AttachedSticker;

export type AttachedMedia = FinalizedAttachedMedia | Pending;

export type SupportedMediaType = 'photo' | 'video' | 'gif' | 'sticker';

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
    pollOptions: [
      {
        text: '',
        entities: []
      },
      {
        text: '',
        entities: []
      }
    ],
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

  // Add an option to the end of the list when the last item has a value
  createComputed(() => {
    // track options and their texts
    for(const option of store.pollOptions) {
      track(() => option.text);
    }

    if(store.pollOptions.length && store.pollOptions.length < maxOptions() && checkOptionHasValue(lastItem(store.pollOptions))) {
      setStore('pollOptions', store.pollOptions.length, {
        text: '',
        entities: []
      });
      return;
    }
  });

  return {
    store,
    setStore,
    ...extra
  };
};
