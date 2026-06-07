import {Component, onMount} from 'solid-js';
import PrivacySection from '@components/privacySection';
import {LangPackKey, i18n} from '@lib/langPack';
import Row from '@components/row';
import CheckboxField from '@components/checkboxField';
import SettingSection from '@components/settingSection';
import Button from '@components/button';
import rootScope from '@lib/rootScope';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import PopupPremium from '@components/popups/premium';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppPrivacyLastSeenTab} from '@components/solidJsTabs/tabs';

const PrivacyLastSeen: Component = () => {
  const [tab] = useSuperTab<typeof AppPrivacyLastSeenTab>();
  const globalPrivacy = tab.payload;

  onMount(() => {
    tab.container.classList.add('privacy-tab', 'privacy-last-seen');

    const canHideReadTime = () => {
      return privacySection.type !== PrivacyType.Everybody || !!privacySection.peerIds.disallow.length;
    };

    const caption: LangPackKey = 'PrivacySettingsController.LastSeenDescription';
    const privacySection = new PrivacySection({
      tab,
      title: 'LastSeenTitle',
      inputKey: 'inputPrivacyKeyStatusTimestamp',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverShare', 'PrivacySettingsController.AlwaysShare'],
      appendTo: tab.scrollable,
      onRadioChange: () => {
        [hideReadTimeSection, premiumSection].forEach((section) => {
          section.container.classList.toggle('hide', !canHideReadTime());
        });
      },
      managers: tab.managers
    });

    let hideReadTimeSection: SettingSection;
    {
      const section = hideReadTimeSection = new SettingSection({
        caption: 'HideReadTimeInfo'
      });

      const row = new Row({
        titleLangKey: 'HideReadTime',
        checkboxField: new CheckboxField({toggle: true, checked: !!globalPrivacy.pFlags.hide_read_marks}),
        listenerSetter: tab.listenerSetter
      });

      tab.eventListener.addEventListener('destroy', () => {
        const hide = row.checkboxField.checked && canHideReadTime();
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

      section.content.append(row.container);
      tab.scrollable.append(section.container);
    }

    let premiumSection: SettingSection;
    {
      const section = premiumSection = new SettingSection({
        caption: true
      });

      const createButton = () => {
        const btn = Button('btn-primary btn-transparent primary', {
          text: rootScope.premium ? 'PrivacyLastSeenPremiumForPremium' : 'PrivacyLastSeenPremium'
        });

        attachClickEvent(btn, () => {
          PopupPremium.show();
        }, {listenerSetter: tab.listenerSetter});

        return btn;
      };

      const onPremium = () => {
        section.content.replaceChildren(createButton());
        section.caption.replaceChildren(i18n(rootScope.premium ? 'PrivacyLastSeenPremiumInfoForPremium' : 'PrivacyLastSeenPremiumInfo'));
      };

      onPremium();
      tab.listenerSetter.add(rootScope)('premium_toggle', onPremium);

      tab.scrollable.append(section.container);
    }
  });

  return null;
};

export default PrivacyLastSeen;
