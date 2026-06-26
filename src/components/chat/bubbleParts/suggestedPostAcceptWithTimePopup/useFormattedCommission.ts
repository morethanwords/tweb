import {SUGGESTED_POST_DEFAULT_STARS_COMMISSION} from '@appManagers/constants';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

export function useFormattedCommission() {
  const {useAppConfig} = useHotReloadGuard();
  const appConfig = useAppConfig();

  const commission = () => (appConfig.stars_suggested_post_commission_permille || SUGGESTED_POST_DEFAULT_STARS_COMMISSION) / 1000;
  const formattedCommission = () => `${Math.round(commission() * 100)}%`;

  return {commission, formattedCommission};
}
