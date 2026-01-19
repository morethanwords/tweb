import {SUGGESTED_POST_DEFAULT_STARS_COMMISSION} from '@appManagers/constants';
import useAppConfig from '@components/sidebarLeft/tabs/privacy/messages/useAppConfig';

export function useFormattedCommission() {
  const [appConfig] = useAppConfig();

  const commission = () => (appConfig()?.stars_suggested_post_commission_permille || SUGGESTED_POST_DEFAULT_STARS_COMMISSION) / 1000;
  const formattedCommission = () => `${Math.round(commission() * 100)}%`;

  return {commission, formattedCommission};
}
