import {Component, createSignal, onMount} from 'solid-js';
import PrivacySection from '@components/privacySection';
import {LangPackKey, i18n} from '@lib/langPack';
import Button from '@components/buttonTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import PopupPremium from '@components/popups/premium';
import Row from '@components/rowTsx';
import Section from '@components/section';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import usePremium from '@stores/premium';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppPrivacyLastSeenTab} from '@components/solidJsTabs/tabs';

const PrivacyLastSeen: Component = () => {
  const [tab] = useSuperTab<typeof AppPrivacyLastSeenTab>();
  const globalPrivacy = tab.payload;
  const isPremium = usePremium();
  const hideReadTimeSignal = createSignal(!!globalPrivacy.pFlags.hide_read_marks);
  const [showAdditionalSettings, setShowAdditionalSettings] = createSignal(true);

  let privacySection: PrivacySection;

  const canHideReadTime = () => {
    return privacySection.type !== PrivacyType.Everybody || !!privacySection.peerIds.disallow.length;
  };

  onMount(() => {
    tab.container.classList.add('privacy-tab', 'privacy-last-seen');

    const caption: LangPackKey = 'PrivacySettingsController.LastSeenDescription';
    privacySection = new PrivacySection({
      tab,
      title: 'LastSeenTitle',
      inputKey: 'inputPrivacyKeyStatusTimestamp',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverShare', 'PrivacySettingsController.AlwaysShare'],
      appendTo: tab.scrollable,
      onRadioChange: () => {
        setShowAdditionalSettings(canHideReadTime());
      },
      managers: tab.managers
    });

    tab.eventListener.addEventListener('destroy', () => {
      const hide = hideReadTimeSignal[0]() && canHideReadTime();
      if(!!globalPrivacy.pFlags.hide_read_marks === hide) {
        return;
      }

      const promise = tab.managers.appPrivacyManager.setGlobalPrivacySettings({
        _: 'globalPrivacySettings',
        pFlags: {
          ...globalPrivacy.pFlags,
          hide_read_marks: hide || undefined
        }
      });
      tab.eventListener.dispatchEvent('privacy', promise);
      return promise;
    });
  });

  return (
    <>
      <Section
        classList={{hide: !showAdditionalSettings()}}
        caption="HideReadTimeInfo"
      >
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx signal={hideReadTimeSignal} toggle />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('HideReadTime')}</Row.Title>
        </Row>
      </Section>
      <Section
        classList={{hide: !showAdditionalSettings()}}
        caption={i18n(isPremium() ? 'PrivacyLastSeenPremiumInfoForPremium' : 'PrivacyLastSeenPremiumInfo')}
      >
        <Button
          primaryTransparent
          text={isPremium() ? 'PrivacyLastSeenPremiumForPremium' : 'PrivacyLastSeenPremium'}
          onClick={() => PopupPremium.show()}
        />
      </Section>
    </>
  );
};

export default PrivacyLastSeen;
