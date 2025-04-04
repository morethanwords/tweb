import {Accessor, createMemo} from 'solid-js';

import useAppConfig from './useAppConfig';


const useStarsCommissionAndWithdrawalPrice = (stars: Accessor<number>) => {
  const [appConfig] = useAppConfig();

  const commission = createMemo(() => (+appConfig()?.stars_paid_message_commission_permille || 0) / 1000);
  const centsPerStar = createMemo(() => (+appConfig()?.stars_usd_withdraw_rate_x1000 || 0) / 1000);

  const commissionPercents = createMemo(() => Math.round(commission() * 100));
  const willReceiveDollars = createMemo(() => Math.max(0.01, Math.round(commission() * centsPerStar() * stars()) / 100));

  return {
    commissionPercents,
    willReceiveDollars
  }
};

export default useStarsCommissionAndWithdrawalPrice;
