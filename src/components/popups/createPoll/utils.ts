import lastItem from '@helpers/array/lastItem';
import {createMemo} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {AttachedMedia, CreatePollContextValue, CreatePollPayload, CreatePollStore, FinalizedAttachedMedia, StorePollOption, SupportedMediaType, useCreatePollContext} from './storeContext';
import {useCreatePollLimits} from './useCreatePollLimits';


export const useCanSubmit = () => {
  const {store} = useCreatePollContext();
  const {maxOptions, maxQuestionLength, maxDescriptionLength, maxOptionLength, maxExplanationLength} = useCreatePollLimits();

  return createMemo(() => {
    if(!store.question) return false;
    if(store.question.length > maxQuestionLength()) return false;
    if(store.description.length > maxDescriptionLength()) return false;

    const trimmedOptions = [...store.pollOptions];
    if(!checkOptionHasValue(lastItem(trimmedOptions))) trimmedOptions.pop();

    if(trimmedOptions.length < 2) return false;
    if(trimmedOptions.some((option) => !option.text)) return false;
    if(store.pollOptions.some((option) => option.attachment?.type === 'pending')) return false;
    if(store.descriptionAttachment?.type === 'pending') return false;
    if(store.explanationAttachment?.type === 'pending') return false;

    if(store.pollOptions.length > maxOptions()) return false;
    if(store.pollOptions.some((option) => option.text.length > maxOptionLength())) return false;
    if(new Set(store.pollOptions.map((option) => option.text)).size !== store.pollOptions.length) return false;
    if(store.hasCorrectAnswer && !store.pollOptions.some((option) => option.checked)) return false;
    if(store.hasCorrectAnswer && store.explanation.length > maxExplanationLength()) return false;

    return true;
  });
};

const finalizeAttachment = (attachment: AttachedMedia | undefined): FinalizedAttachedMedia | undefined => {
  if(!attachment || attachment.type === 'pending') return undefined;
  return attachment;
};
export const getFinalPayload = (context: CreatePollContextValue): CreatePollPayload => {
  const {store, isBroadcast} = context;

  const cloned = structuredClone(unwrap(store));

  if(isBroadcast()) {
    cloned.allowAddingOptions = false;
    cloned.showWhoVoted = false;
  }

  if(cloned.hasCorrectAnswer || !cloned.showWhoVoted) {
    cloned.allowAddingOptions = false;
  }

  if(!cloned.durationLimited) {
    cloned.timeLimit = undefined;
  }

  if(cloned.pollOptions.length && !checkOptionHasValue(lastItem(cloned.pollOptions))) {
    cloned.pollOptions.pop();
  }

  const {descriptionAttachment, explanationAttachment, pollOptions, ...rest} = cloned;

  return {
    ...rest,
    descriptionAttachment: finalizeAttachment(descriptionAttachment),
    explanationAttachment: finalizeAttachment(explanationAttachment),
    pollOptions: pollOptions.map(({attachment, ...option}) => ({
      ...option,
      attachment: finalizeAttachment(attachment)
    }))
  };
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

export const checkOptionHasValue = (option: StorePollOption) => {
  return !!option.text || !!option.attachment;
};
