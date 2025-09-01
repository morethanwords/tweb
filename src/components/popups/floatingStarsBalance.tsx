import classNames from '../../helpers/string/classNames';
import useStars from '../../stores/stars';
import PopupStars, {StarsStar} from './stars';
import styles from './floatingStarsBalance.module.scss';
import {I18nTsx} from '../../helpers/solid/i18n';
import PopupElement from '.';
import {i18n} from '../../lib/langPack';
import {IconTsx} from '../iconTsx';
import {createResource} from 'solid-js';
import rootScope from '../../lib/rootScope';
import paymentsWrapCurrencyAmount, {formatNanoton, nanotonToJsNumber} from '../../helpers/paymentsWrapCurrencyAmount';

export function FloatingStarsBalance(props: {
  class?: string;
  ton?: boolean;
}) {
  const balance = useStars();
  const balanceTon = useStars(true);
  const [appConfig] = createResource(() => rootScope.managers.apiManager.getAppConfig());

  const converted = () => {
    const rate = appConfig.latest?.ton_usd_rate;
    if(!rate) return '...';

    return paymentsWrapCurrencyAmount(nanotonToJsNumber(balanceTon()) * rate * 100, 'USD');
  }

  return (
    <div class={classNames(styles.container, props.class)}>
      <I18nTsx
        key="StarsBalanceLong"
        args={props.ton ? [
          <IconTsx icon="ton" />,
          <b>{formatNanoton(balanceTon())}</b>
        ] : [
          <StarsStar />,
          <b>{balance()}</b>
        ]}
      />
      {props.ton ? (
        <div class={styles.tonUsd}>
          ~{converted()}
        </div>
      ) : (
        <a
          class={styles.getMore}
          onClick={() => PopupElement.createPopup(PopupStars)}
        >
          {i18n('GetMoreStars')}
        </a>
      )}
    </div>
  );
}
