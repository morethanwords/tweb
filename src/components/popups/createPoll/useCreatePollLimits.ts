import {useAppConfig} from '@stores/appState';
import usePremium from '@stores/premium';


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
