import {For} from 'solid-js';
import {HelpPremiumPromo} from '@layer';
import {avatarNew} from '@components/avatarNew';
import {Middleware} from '@helpers/middleware';
import {PremiumPromoFeature} from '@components/premium/featuresConfig';
import RowTsx from '@components/rowTsx';
import {i18n} from '@lib/langPack';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';

export default class UpgradedStoriesFeature {
  public features: HTMLElement;
  public avatar: ReturnType<typeof avatarNew>;

  constructor(options: {features: PremiumPromoFeature['content'], premiumPromo: HelpPremiumPromo, middleware: Middleware}) {
    this.avatar = avatarNew({
      middleware: options.middleware,
      size: 84,
      isBig: true,
      withStories: true,
      peerId: options.premiumPromo.users[0].id.toPeerId(false)
    });

    this.features = wrapSolidComponent(() => (
      <div class="story-features-list">
        <For each={options.features}>{(feature) => (
          <div class="story-feature">
            <RowTsx style={{'--custom-icon-color': feature.iconColor}}>
              <RowTsx.Icon icon={feature.icon} class="row-icon-custom-color" />
              <RowTsx.Title>{i18n(feature.titleLangKey, feature.titleLangArgs)}</RowTsx.Title>
              <RowTsx.Subtitle>{i18n(feature.subtitleLangKey, feature.subtitleLangArgs)}</RowTsx.Subtitle>
            </RowTsx>
          </div>
        )}</For>
      </div>
    ), options.middleware);
  }
}
