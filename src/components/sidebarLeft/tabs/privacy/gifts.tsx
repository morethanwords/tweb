import {Component, createSignal, onMount, type Signal} from 'solid-js';
import PrivacySection from '@components/privacySection';
import {i18n, LangPackKey} from '@lib/langPack';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {DisallowedGiftsSettings, GlobalPrivacySettings} from '@layer';
import rootScope from '@lib/rootScope';
import PopupPremium from '@components/popups/premium';
import {hideToast, toastNew} from '@components/toast';
import anchorCallback from '@helpers/dom/anchorCallback';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppPrivacyGiftsTab} from '@components/solidJsTabs/tabs';

type GiftTypeFlag = keyof DisallowedGiftsSettings.disallowedGiftsSettings['pFlags'];

const GIFT_TYPE_TOGGLES: Array<{flag: GiftTypeFlag, langKey: LangPackKey}> = [
  {flag: 'disallow_limited_stargifts', langKey: 'Privacy.GiftsTypeLimited'},
  {flag: 'disallow_unlimited_stargifts', langKey: 'Privacy.GiftsTypeUnlimited'},
  {flag: 'disallow_unique_stargifts', langKey: 'Privacy.GiftsTypeUnique'},
  {flag: 'disallow_stargifts_from_channels', langKey: 'Privacy.GiftsTypeChannel'},
  {flag: 'disallow_premium_gifts', langKey: 'Privacy.GiftsTypePremium'}
];

const PrivacyGifts: Component = () => {
  const [tab] = useSuperTab<typeof AppPrivacyGiftsTab>();
  const globalPrivacy = tab.payload;
  const typeToggles = GIFT_TYPE_TOGGLES.map((item) => ({
    ...item,
    signal: createSignal(!globalPrivacy.disallowed_gifts?.pFlags[item.flag])
  }));
  const showIconSignal = createSignal(!!globalPrivacy.pFlags.display_gifts_button);

  const showPremiumToast = () => {
    toastNew({
      langPackKey: 'Privacy.GiftsPremiumError',
      langPackArguments: [
        anchorCallback(() => {
          hideToast();
          PopupPremium.show();
        })
      ]
    });
  };

  const gatePremiumToggle = (signal: Signal<boolean>) => (checked: boolean) => {
    if(rootScope.premium) return;
    signal[1](!checked);
    showPremiumToast();
  };

  onMount(() => {
    tab.container.classList.add('privacy-tab', 'privacy-gifts');

    const caption: LangPackKey = 'Privacy.GiftsCaption';
    new PrivacySection({
      tab,
      title: 'Privacy.Gifts',
      inputKey: 'inputPrivacyKeyStarGiftsAutoSave',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
      appendTo: tab.scrollable,
      managers: tab.managers,
      allowMiniApps: true
    });

    tab.eventListener.addEventListener('destroy', () => {
      if(!rootScope.premium) return;

      const newDisallowedPFlags: DisallowedGiftsSettings.disallowedGiftsSettings['pFlags'] = {};
      let hasAnyDisallow = false;
      for(const {flag, signal: [checked]} of typeToggles) {
        if(!checked()) {
          newDisallowedPFlags[flag] = true;
          hasAnyDisallow = true;
        }
      }

      const newDisplayGiftsButton = showIconSignal[0]();

      const currentDisallowedPFlags = globalPrivacy.disallowed_gifts?.pFlags || {};
      const sameDisallowed = GIFT_TYPE_TOGGLES.every(({flag}) =>
        !!currentDisallowedPFlags[flag] === !!newDisallowedPFlags[flag]
      );
      const sameShowIcon = !!globalPrivacy.pFlags.display_gifts_button === newDisplayGiftsButton;

      if(sameDisallowed && sameShowIcon) {
        return;
      }

      const settings: GlobalPrivacySettings = {
        ...globalPrivacy,
        pFlags: {
          ...globalPrivacy.pFlags,
          display_gifts_button: newDisplayGiftsButton || undefined
        },
        disallowed_gifts: hasAnyDisallow ? {
          _: 'disallowedGiftsSettings',
          pFlags: newDisallowedPFlags
        } : undefined
      };

      const promise = tab.managers.appPrivacyManager.setGlobalPrivacySettings(settings);
      tab.eventListener.dispatchEvent('privacy', promise);
      return promise;
    });
  });

  return (
    <>
      <Section name="Privacy.GiftsAcceptedTypes" caption="Privacy.GiftsAcceptedTypesInfo">
        {typeToggles.map(({langKey, signal}) => (
          <Row>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                signal={signal}
                toggle
                onChange={gatePremiumToggle(signal)}
              />
            </Row.CheckboxFieldToggle>
            <Row.Title>{i18n(langKey)}</Row.Title>
          </Row>
        ))}
      </Section>
      <Section caption="Privacy.GiftsShowIconInfo">
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              signal={showIconSignal}
              toggle
              onChange={gatePremiumToggle(showIconSignal)}
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('Privacy.GiftsShowIcon')}</Row.Title>
        </Row>
      </Section>
    </>
  );
};

export default PrivacyGifts;
