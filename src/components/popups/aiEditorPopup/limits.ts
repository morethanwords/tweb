import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

export const useMaxSavedTones = () => {
  const {usePremium, useAppConfig} = useHotReloadGuard();
  const isPremium = usePremium();
  const appConfig = useAppConfig();

  return () => isPremium() ?
    (appConfig.aicompose_tone_saved_limit_premium || 20) :
    (appConfig.aicompose_tone_saved_limit_default || 5);
}
