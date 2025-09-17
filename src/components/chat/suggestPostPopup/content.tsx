import {createSignal} from 'solid-js';
import {attachHotClassName} from '../../../helpers/solid/classname';
import {I18nTsx} from '../../../helpers/solid/i18n';
import I18n from '../../../lib/langPack';
import defineSolidElement, {PassedProps} from '../../../lib/solidjs/defineSolidElement';
import currencyStarIcon from '../../currencyStarIcon';
import SimpleFormField from '../../simpleFormField';
import Space from '../../space';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Props = {
  popupContainer: HTMLElement;
  popupHeader: HTMLElement;
  onFinish: () => void;
};

const SuggestPostPopupContent = defineSolidElement({
  name: 'suggested-post-popup-content',
  component: (props: PassedProps<Props>) => {
    attachHotClassName(props.popupContainer, styles.Popup);
    attachHotClassName(props.popupHeader, styles.PopupHeader);
    attachHotClassName(props.element, styles.Container);

    const [stars, setStars] = createSignal('');

    return <>
      <SimpleFormField
        value={stars()}
        onChange={setStars}
      >
        <SimpleFormField.SideContent first>
          {currencyStarIcon({class: styles.Icon})}
        </SimpleFormField.SideContent>
        <SimpleFormField.LabelAndInput
          forceOffset={44}
          placeholderLabel={<I18nTsx key='SuggestedPosts.EnterPrice.Label' />}
        />
      </SimpleFormField>

      <div class={styles.Caption}>
        <I18nTsx key='SuggestedPosts.EnterPrice.Description' />
      </div>

      <Space amount='2rem' />

      <SimpleFormField
        value={I18n.format('SuggestedPosts.PublishingTime.Anytime', true)}
        onChange={setStars}
      >
        <SimpleFormField.LabelAndInput
          inputProps={{disabled: true}}
          placeholderLabel={<I18nTsx key='SuggestedPosts.PublishingTime.Label' />}
        />
      </SimpleFormField>

      <div class={styles.Caption}>
        <I18nTsx key='SuggestedPosts.PublishingTime.Description' />
      </div>
    </>;
  }
});

export default SuggestPostPopupContent;
