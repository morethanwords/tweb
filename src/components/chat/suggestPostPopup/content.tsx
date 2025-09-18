import {createSignal, Show} from 'solid-js';
import {formatFullSentTime} from '../../../helpers/date';
import numberThousandSplitter from '../../../helpers/number/numberThousandSplitter';
import {attachHotClassName} from '../../../helpers/solid/classname';
import {I18nTsx} from '../../../helpers/solid/i18n';
import I18n from '../../../lib/langPack';
import defineSolidElement, {PassedProps} from '../../../lib/solidjs/defineSolidElement';
import currencyStarIcon from '../../currencyStarIcon';
import {IconTsx} from '../../iconTsx';
import useAppConfig from '../../sidebarLeft/tabs/privacy/messages/useAppConfig';
import useStarsCommissionAndWithdrawalPrice from '../../sidebarLeft/tabs/privacy/messages/useStarsCommissionAndWithdrawalPrice';
import SimpleFormField from '../../simpleFormField';
import Space from '../../space';
import styles from './styles.module.scss';
import PopupSchedulePost from './popupSchedulePost';
import ripple from '../../ripple'; ripple;

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  onFinish: (payload: FinishPayload) => void;
};

export type FinishPayload = {
  stars: number;
  timestamp: number;
};

const MIN_STARS = 5;
const MAX_STARS = 100_000;

const SuggestPostPopupContent = defineSolidElement({
  name: 'suggested-post-popup-content',
  component: (props: PassedProps<Props>) => {
    attachHotClassName(props.element, styles.Container);

    const [stars, setStars] = createSignal('');
    const [publishingTimestamp, setPublishingTimestamp] = createSignal<number>();

    const [appConfig] = useAppConfig();

    const {willReceiveDollars} = useStarsCommissionAndWithdrawalPrice(() => +stars() || 0, {
      commissionKey: 'stars_suggested_post_commission_permille'
    });

    const minStars = () => appConfig()?.stars_suggested_post_amount_min || MIN_STARS;
    const maxStars = () => appConfig()?.stars_suggested_post_amount_max || MAX_STARS;

    const isBadPrice = () => +stars() && +stars() < minStars();

    const hasErrors = () => isBadPrice();

    const onChange = (value: string) => {
      setStars(!value ? value : '' + Math.min(maxStars(), +(value.replace(/\D/g, '')) || 0));
    };

    const onFinish = () => {
      if(hasErrors()) return;

      props.onFinish({
        stars: +stars() || undefined,
        timestamp: publishingTimestamp() || undefined
      });
    };

    return <>
      <SimpleFormField
        value={stars()}
        onChange={onChange}
        isError={isBadPrice()}
      >
        <SimpleFormField.SideContent first>
          {currencyStarIcon({class: styles.Icon})}
        </SimpleFormField.SideContent>
        <SimpleFormField.Input type='number' forceFieldValue />
        <SimpleFormField.Label forceOffset={44}>
          <I18nTsx
            key={!isBadPrice() ? 'SuggestedPosts.EnterPrice.Label' : 'SuggestedPosts.EnterPrice.MinOffer'}
            args={isBadPrice() ? [minStars() + ''] : undefined}
          />
        </SimpleFormField.Label>
        <SimpleFormField.SideContent last>
          <Show when={willReceiveDollars()}>
            ~{numberThousandSplitter(willReceiveDollars(), ',')}$
          </Show>
        </SimpleFormField.SideContent>
      </SimpleFormField>

      <div class={styles.Caption}>
        <I18nTsx key='SuggestedPosts.EnterPrice.Description' />
      </div>

      <Space amount='2rem' />

      <SimpleFormField
        clickable
        onClick={() => {
          // TODO: Need proper minimum and maximum time
          new PopupSchedulePost({
            initDate: new Date,
            onPick: (timestamp) => {
              console.log(timestamp);
              setPublishingTimestamp(timestamp);
            }
          }).show();
        }}
      >
        <SimpleFormField.InputStub>
          {publishingTimestamp() ?
            <span>{formatFullSentTime(publishingTimestamp())}</span> :
            I18n.format('SuggestedPosts.PublishingTime.Anytime', true)
          }
        </SimpleFormField.InputStub>
        <SimpleFormField.Label active>
          <I18nTsx key='SuggestedPosts.PublishingTime.Label' />
        </SimpleFormField.Label>
        <SimpleFormField.SideContent last>
          <IconTsx class={styles.Icon} icon='down' />
        </SimpleFormField.SideContent>
      </SimpleFormField>

      <div class={styles.Caption}>
        <I18nTsx key='SuggestedPosts.PublishingTime.Description' />
      </div>

      <Space amount='2rem' />

      <button
        use:ripple
        class="btn-primary btn-color-primary btn-large"
        disabled={hasErrors()}
        onClick={onFinish}
      >
        <I18nTsx key='SuggestedPosts.MakeAnOffer' />
      </button>
    </>;
  }
});

export default SuggestPostPopupContent;
