import {createMemo} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {CreatePollContextValue, CreatePollStore, SupportedMediaType, useCreatePollContext} from './storeContext';
import {useCreatePollLimits} from './useCreatePollLimits';


export const useCanSubmit = () => {
  const {store} = useCreatePollContext();
  const {maxOptions, maxQuestionLength, maxDescriptionLength, maxOptionLength, maxExplanationLength} = useCreatePollLimits();

  return createMemo(() => {
    if(!store.question) return false;
    if(store.question.length > maxQuestionLength()) return false;
    if(store.description.length > maxDescriptionLength()) return false;
    if(store.pollOptions.length < 2) return false;
    if(store.pollOptions.length > maxOptions()) return false;
    if(store.pollOptions.some((option) => !option.text)) return false;
    if(store.pollOptions.some((option) => option.text.length > maxOptionLength())) return false;
    if(new Set(store.pollOptions.map((option) => option.text)).size !== store.pollOptions.length) return false;
    if(store.hasCorrectAnswer && !store.pollOptions.some((option) => option.checked)) return false;
    if(store.hasCorrectAnswer && store.explanation.length > maxExplanationLength()) return false;

    return true;
  });
};

export const getFinalPayload = (context: CreatePollContextValue) => {
  const {store, isBroadcast} = context;

  const cloned = structuredClone(unwrap(store));

  if(isBroadcast()) {
    cloned.allowAddingOptions = false;
    cloned.showWhoVoted = false;
  }

  if(cloned.hasCorrectAnswer) {
    cloned.allowAddingOptions = false;
  }

  if(!cloned.durationLimited) {
    cloned.timeLimit = undefined;
  }

  return cloned;
};

export const hasMeaningfulChanges = (store: CreatePollStore) => {
  return store.question !== '' ||
    store.description !== '' ||
    store.descriptionAttachment ||
    store.pollOptions.some((option) => option.text !== '' || option.attachment) ||
    (store.hasCorrectAnswer && (store.explanation !== '' || store.explanationAttachment));
};

export const useSupportsMedia = () => {
  const {supportedMediaTypes} = useCreatePollContext();
  return (mediaType: SupportedMediaType) => supportedMediaTypes().includes(mediaType);
};
