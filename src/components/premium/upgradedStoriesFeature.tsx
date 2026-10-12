import {For} from 'solid-js';
import {HelpPremiumPromo} from '@layer';
import {avatarNew} from '@components/avatarNew';
import {Middleware} from '@helpers/middleware';
import {PremiumPromoFeature} from '@components/premium/featuresConfig';
import RowTsx from '@components/rowTsx';
import {i18n, LangPackKey} from '@lib/langPack';

/** The avatar with a story ring + the slide's title, above the scrolling list. */
export function UpgradedStoriesHeader(props: {
  premiumPromo: HelpPremiumPromo,
  middleware: Middleware,
  titleLangKey: LangPackKey
}) {
  const avatar = avatarNew({
    middleware: props.middleware,
    size: 84,
    isBig: true,
    withStories: true,
    peerId: props.premiumPromo.users[0].id.toPeerId(false)
  });

  return (
    <div class="above-top-section">
      {avatar.node}
      <div class="above-top-section-title">{i18n(props.titleLangKey)}</div>
    </div>
  );
}

/** What upgraded stories give you, one icon-title-subtitle row each. */
export default function UpgradedStoriesList(props: {
  features: PremiumPromoFeature['content']
}) {
  return (
    <div class="story-features-list">
      <For each={props.features}>{(feature) => (
        <div class="story-feature">
          <RowTsx style={{'--custom-icon-color': feature.iconColor}}>
            <RowTsx.Icon icon={feature.icon} class="row-icon-custom-color" noBackground />
            <RowTsx.Title>{i18n(feature.titleLangKey, feature.titleLangArgs)}</RowTsx.Title>
            <RowTsx.Subtitle>{i18n(feature.subtitleLangKey, feature.subtitleLangArgs)}</RowTsx.Subtitle>
          </RowTsx>
        </div>
      )}</For>
    </div>
  );
}
