import {createResource, createSignal, Show} from 'solid-js';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import {i18n} from '@lib/langPack';
import type {AppManagers} from '@lib/managers';
import rootScope from '@lib/rootScope';

/**
 * "Do Not Hide Ads": a Premium account sees no ads unless it asks to (its own, launched on the ad
 * platform). Android keeps the switch at the end of the Business screen it opens for a subscriber,
 * tdesktop on its Business settings — the web's Business screen is the promo, so it goes there.
 * The switch is held, disabled, while the server takes the choice, and goes back if it refuses.
 */
export default function SponsoredToggle(props: {managers: AppManagers}) {
  const managers = props.managers;
  // * no full user, no switch: there is nothing it could start from
  const [saved, {mutate}] = createResource(() => managers.appProfileManager.getProfile(rootScope.myId.toUserId())
  .then((userFull) => userFull ? !!userFull.pFlags?.sponsored_enabled : undefined, (): boolean => undefined));
  const [pending, setPending] = createSignal<boolean>();

  const enabled = () => pending() ?? saved();

  const toggle = async(value: boolean) => {
    setPending(value);
    try {
      await managers.appMessagesManager.toggleSponsoredMessages(value);
      mutate(value);
    } catch(err) {
      console.error('toggleSponsoredMessages error:', err);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setPending(undefined);
    }
  };

  return (
    <Show when={saved() !== undefined}>
      <Section name="ShowAdsTitle" caption="ShowAdsInfo">
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              checked={enabled()}
              toggle
              disabled={pending() !== undefined}
              onChange={toggle}
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('ShowAds')}</Row.Title>
        </Row>
      </Section>
    </Show>
  );
}
