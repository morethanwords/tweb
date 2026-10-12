import {createResource, For, Show} from 'solid-js';
import LimitLine from '@components/limit';
import {i18n} from '@lib/langPack';
import {PremiumPromoFeature} from '@components/premium/featuresConfig';
import {AppManagers} from '@lib/managers';
import classNames from '@helpers/string/classNames';

type Limit = PremiumPromoFeature['content'][number];

/** The "Doubled Limits" slide: one free-vs-premium bar per limit. */
export default function LimitsList(props: {
  limits: Limit[],
  managers: AppManagers
}) {
  const [limits] = createResource(() => Promise.all(props.limits.map(async(limit) => {
    const [free, premium] = limit.limitType ? await Promise.all([
      props.managers.apiManager.getLimit(limit.limitType, false),
      props.managers.apiManager.getLimit(limit.limitType, true)
    ]) : [];

    return {limit, free: free ?? limit.free, premium: premium ?? limit.premium};
  })));

  return (
    <Show when={limits()}>
      <div class="limits-list">
        <For each={limits()}>{({limit, free, premium}, index) => (
          <div class="limit">
            <div class={classNames('limit-text-container', !index() && 'no-margin')}>
              <div class="limit-title">{i18n(limit.titleLangKey, limit.titleLangArgs)}</div>
              <div class="limit-subtitle">{i18n(limit.subtitleLangKey, limit.subtitleLangArgs)}</div>
            </div>
            {new LimitLine({
              limitFree: free,
              limitPremium: premium,
              color: limit.backgroundColor
            }).container}
          </div>
        )}</For>
      </div>
    </Show>
  );
}
