import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

export const useCreateToneLimits = () => {
  const {useAppConfig} = useHotReloadGuard();
  const appConfig = useAppConfig();

  return {
    maxTitleLength: () => appConfig.aicompose_tone_title_length_max || 12,
    maxInstructionsLength: () => appConfig.aicompose_tone_prompt_length_max || 1024
  };
};
