/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTabEventable} from '../../../sliderTab';
import PrivacySection from '../../../privacySection';
import {LangPackKey, i18n} from '../../../../lib/langPack';
import Row from '../../../row';
import CheckboxField from '../../../checkboxField';
import SettingSection from '../../../settingSection';
import Button from '../../../button';
import rootScope from '../../../../lib/rootScope';
import {attachClickEvent} from '../../../../helpers/dom/clickEvent';
import PopupPremium from '../../../popups/premium';
import {GlobalPrivacySettings} from '../../../../layer';
import PrivacyType from '../../../../lib/appManagers/utils/privacy/privacyType';

export default class AppPrivacyLastSeenTab extends SliderSuperTabEventable<{
  privacy: (globalPrivacy: Promise<GlobalPrivacySettings>) => void
}> {
  public init(globalPrivacy: GlobalPrivacySettings) {
    this.container.classList.add('privacy-tab', 'privacy-last-seen');
    this.setTitle('PrivacyLastSeen');

    const canHideReadTime = () => {
      return privacySection.type !== PrivacyType.Everybody || !!privacySection.peerIds.disallow.length;
    };

    const caption: LangPackKey = 'PrivacySettingsController.LastSeenDescription';
    const privacySection = new PrivacySection({
      tab: this,
      title: 'LastSeenTitle',
      inputKey: 'inputPrivacyKeyStatusTimestamp',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverShare', 'PrivacySettingsController.AlwaysShare'],
      appendTo: this.scrollable,
      onRadioChange: () => {
        [hideReadTimeSection, premiumSection].forEach((section) => {
          section.container.classList.toggle('hide', !canHideReadTime());
        });
      },
      managers: this.managers
    });

    let hideReadTimeSection: SettingSection;
    {
      const section = hideReadTimeSection = new SettingSection({
        caption: 'HideReadTimeInfo'
      });

      const row = new Row({
        titleLangKey: 'HideReadTime',
        checkboxField: new CheckboxField({toggle: true, checked: !!globalPrivacy.pFlags.hide_read_marks}),
        listenerSetter: this.listenerSetter
      });

      this.eventListener.addEventListener('destroy', () => {
        const hide = row.checkboxField.checked && canHideReadTime();
        if(!!globalPrivacy.pFlags.hide_read_marks === hide) {
          return;
        }

        const promise = this.managers.appPrivacyManager.setGlobalPrivacySettings({
          _: 'globalPrivacySettings',
          pFlags: {
            ...globalPrivacy.pFlags,
            hide_read_marks: hide || undefined
          }
        });
        this.eventListener.dispatchEvent('privacy', promise);
        return promise;
      });

      section.content.append(row.container);
      this.scrollable.append(section.container);
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
        }, {listenerSetter: this.listenerSetter});

        return btn;
      };

      const onPremium = () => {
        section.content.replaceChildren(createButton());
        section.caption.replaceChildren(i18n(rootScope.premium ? 'PrivacyLastSeenPremiumInfoForPremium' : 'PrivacyLastSeenPremiumInfo'));
      };

      onPremium();
      this.listenerSetter.add(rootScope)('premium_toggle', onPremium);

      this.scrollable.append(section.container);
    }
  }
}
