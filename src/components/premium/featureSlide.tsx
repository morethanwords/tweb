import {createMemo, Show} from 'solid-js';
import FeaturesCarousel, {isFramedFeature} from '@components/premium/featuresCarousel';
import {ButtonIconTsx} from '@components/buttonIconTsx';
import {PremiumPromoData} from '@components/premium/types';
import {i18n} from '@lib/langPack';
import classNames from '@helpers/string/classNames';

/**
 * The second slide: one feature at a time, with a back button and the dots under it.
 * Its header only appears for features that ask for one (the doubled-limits list).
 */
export default function FeatureSlide(props: {
  data: PremiumPromoData,
  selected: PremiumPromoFeatureType,
  onSelect: (feature: PremiumPromoFeatureType) => void,
  onBack: () => void
}) {
  const feature = createMemo(() => (
    props.data.features.find((f) => f.feature === props.selected) || props.data.features[0]
  ));

  // Over a phone mockup or the sticker stack the back arrow sits on the gradient,
  // so it turns white; over a plain sheet it takes the usual icon colour.
  const backColor = () => isFramedFeature(feature()) ? '#ffffff' : 'var(--secondary-text-color)';

  return (
    <div class="premium-feature-tab tabs-tab premium-tab">
      <div class={classNames('popup-header absolute', feature().headerLangKey && 'is-visible')}>
        <div class="popup-header-background" />
        <ButtonIconTsx
          icon="left"
          class="popup-close back-button"
          noRipple
          style={{color: backColor()}}
          onClick={props.onBack}
        />
        <Show when={feature().headerLangKey}>
          <div class="popup-title" dir="auto">{i18n(feature().headerLangKey)}</div>
        </Show>
      </div>
      <FeaturesCarousel
        features={props.data.features}
        premiumPromo={props.data.premiumPromo}
        managers={props.data.managers}
        middleware={props.data.middleware}
        selected={props.selected}
        onSelect={props.onSelect}
      />
    </div>
  );
}
