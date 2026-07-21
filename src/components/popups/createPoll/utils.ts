import type InputField from '@components/inputField';
import lastItem from '@helpers/array/lastItem';
import {createMemo} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {AttachedMedia, CreatePollContextValue, CreatePollPayload, CreatePollStore, FinalizedAttachedMedia, StorePollOption, SupportedMediaType, useCreatePollContext} from './storeContext';
import {useCreatePollLimits} from './useCreatePollLimits';


type CreatePollValidationLimits = {
  maxDescriptionLength: number;
  maxExplanationLength: number;
  maxOptionLength: number;
  maxOptions: number;
  maxQuestionLength: number;
};

export const canSubmitPoll = (store: CreatePollStore, limits: CreatePollValidationLimits) => {
  if(!store.question) return false;
  if(store.question.length > limits.maxQuestionLength) return false;
  if(store.description.length > limits.maxDescriptionLength) return false;

  const trimmedOptions = [...store.pollOptions];
  if(!checkOptionHasValue(lastItem(trimmedOptions))) trimmedOptions.pop();

  if(trimmedOptions.length < 2) return false;
  if(trimmedOptions.some((option) => !option.text)) return false;
  if(store.pollOptions.some((option) => option.attachment?.type === 'pending')) return false;
  if(store.descriptionAttachment?.type === 'pending') return false;
  if(store.explanationAttachment?.type === 'pending') return false;

  if(store.pollOptions.length > limits.maxOptions) return false;
  if(store.pollOptions.some((option) => option.text.length > limits.maxOptionLength)) return false;
  if(new Set(store.pollOptions.map((option) => option.text)).size !== store.pollOptions.length) return false;
  if(store.hasCorrectAnswer && !store.pollOptions.some((option) => option.checked)) return false;
  if(store.hasCorrectAnswer && store.explanation.length > limits.maxExplanationLength) return false;

  return true;
};

export const useCanSubmit = () => {
  const {store} = useCreatePollContext();
  const {maxOptions, maxQuestionLength, maxDescriptionLength, maxOptionLength, maxExplanationLength} = useCreatePollLimits();

  return createMemo(() => canSubmitPoll(store, {
    maxDescriptionLength: maxDescriptionLength(),
    maxExplanationLength: maxExplanationLength(),
    maxOptionLength: maxOptionLength(),
    maxOptions: maxOptions(),
    maxQuestionLength: maxQuestionLength()
  }));
};

export const validateCountryRestriction = (
  store: CreatePollStore,
  isBroadcast: boolean,
  onError: () => void,
  countriesElement?: HTMLElement
) => {
  if(!isBroadcast || !store.limitByCountry || store.countriesIso2.length) return true;

  onError();
  countriesElement?.scrollIntoView({behavior: 'smooth', block: 'center'});
  return false;
};

const finalizeAttachment = (attachment: AttachedMedia | undefined): FinalizedAttachedMedia | undefined => {
  if(!attachment || attachment.type === 'pending') return undefined;
  return attachment;
};

const finalizeBodyAttachment = (attachment: AttachedMedia | undefined): FinalizedAttachedMedia | undefined => {
  const finalized = finalizeAttachment(attachment);
  return finalized?.type === 'link' ? undefined : finalized;
};

export const getFinalPayload = (context: CreatePollContextValue): CreatePollPayload => {
  const {store, isBroadcast} = context;

  const cloned = structuredClone(unwrap(store));

  if(isBroadcast()) {
    cloned.allowAddingOptions = false;
    cloned.showWhoVoted = false;
  } else {
    cloned.restrictToSubscribers = false;
    cloned.limitByCountry = false;
    cloned.countriesIso2 = [];
  }

  if(!cloned.limitByCountry) cloned.countriesIso2 = [];

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
    descriptionAttachment: finalizeBodyAttachment(descriptionAttachment),
    explanationAttachment: finalizeBodyAttachment(explanationAttachment),
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
    store.restrictToSubscribers ||
    store.limitByCountry ||
    (store.hasCorrectAnswer && (store.explanation !== '' || store.explanationAttachment));
};

export const useSupportsMedia = () => {
  const {supportedMediaTypes, canEncodeVideo} = useCreatePollContext();
  return (mediaType: SupportedMediaType) => {
    if(!supportedMediaTypes().includes(mediaType)) return false;
    // GIFs and videos also requires the editor's encoder to be supported by the browser.
    if(mediaType === 'video' || mediaType === 'gif') return canEncodeVideo();
    return true;
  };
};

export const checkOptionHasValue = (option: StorePollOption) => {
  return !!option.text || !!option.attachment;
};

export const interactableClass = 'form-field-clickable';

export const createFormFieldClickHandler = (inputField: InputField) => (e: MouseEvent) => {
  const target = e.target;

  if(target instanceof HTMLElement && !target.closest(`.${interactableClass}`)) {
    inputField.input.focus();
  }
};
