import {useAppConfig} from '@stores/appState';
import usePremium from '@stores/premium';
import {createMemo} from 'solid-js';
import {useCreatePollContext} from './storeContext';

export const useCreatePollLimits = () => {
  const appConfig = useAppConfig();
  const isPremium = usePremium();

  return {
    maxOptions: () => appConfig.poll_answers_max ?? 12,
    closePeriodMax: () => appConfig.poll_close_period_max ?? 2628000, // ~ 1 month
    // Missing from appConfig wtf)
    maxQuestionLength: () => 255,
    maxOptionLength: () => 100,
    maxDescriptionLength: () => isPremium() ? appConfig.caption_length_limit_premium ?? 4096 : appConfig.caption_length_limit_default ?? 1024,
    maxExplanationLength: () => 200
  };
};

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
    if(store.hasCorrectAnswer && !store.pollOptions.some((option) => option.checked)) return false;
    if(store.hasCorrectAnswer && store.explanation.length > maxExplanationLength()) return false;

    return true;
  });
}
