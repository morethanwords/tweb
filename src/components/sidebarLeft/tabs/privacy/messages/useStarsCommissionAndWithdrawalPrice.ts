import {Accessor, createMemo} from 'solid-js';
import {MTAppConfig} from '../../../../../lib/mtproto/appConfig';
import useAppConfig from './useAppConfig';


type Options = {
  commissionKey?: keyof MTAppConfig;
  withdrawRateKey?: keyof MTAppConfig;
}

const useStarsCommissionAndWithdrawalPrice = (stars: Accessor<number>, {
  commissionKey = 'stars_paid_message_commission_permille',
  withdrawRateKey = 'stars_usd_withdraw_rate_x1000'
}: Options = {}) => {
  const [appConfig] = useAppConfig();

  const commission = createMemo(() => (+appConfig()?.[commissionKey] || 0) / 1000);
  const centsPerStar = createMemo(() => (+appConfig()?.[withdrawRateKey] || 0) / 1000);

  const commissionPercents = createMemo(() => Math.round(commission() * 100));
  const willReceiveDollars = createMemo(() => Math.max(0.01 * Number(!!stars()), Math.round(commission() * centsPerStar() * stars()) / 100));

  return {
    commissionPercents,
    willReceiveDollars
  }
};

export default useStarsCommissionAndWithdrawalPrice;
