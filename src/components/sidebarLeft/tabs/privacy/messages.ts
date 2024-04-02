/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTabEventable} from '../../../sliderTab';
import PrivacySection from '../../../privacySection';
import {LangPackKey, i18n} from '../../../../lib/langPack';
import anchorCallback from '../../../../helpers/dom/anchorCallback';
import PopupPremium from '../../../popups/premium';
import {GlobalPrivacySettings} from '../../../../layer';
import PrivacyType from '../../../../lib/appManagers/utils/privacy/privacyType';

export default class AppPrivacyMessagesTab extends SliderSuperTabEventable<{
  privacy: (globalPrivacy: Promise<GlobalPrivacySettings>) => void
}> {
  public async init(globalPrivacy: GlobalPrivacySettings) {
    this.container.classList.add('privacy-tab', 'privacy-messages');
    this.setTitle('PrivacyMessages');

    const caption = i18n('Privacy.MessagesInfo', [anchorCallback(() => {
      PopupPremium.show();
    })]);

    const appConfig = await this.managers.apiManager.getAppConfig();
    const premiumOnly = !appConfig.new_noncontact_peers_require_premium_without_ownpremium;

    const privacySection = new PrivacySection({
      tab: this,
      title: 'PrivacyMessagesTitle',
      captions: [caption, caption, caption],
      noExceptions: true,
      appendTo: this.scrollable,
      managers: this.managers,
      skipTypes: [PrivacyType.Nobody],
      myContactsAndPremium: true,
      premiumOnly,
      premiumCaption: caption,
      premiumError: 'PrivacySettings.Messages.PremiumError',
      privacyType: globalPrivacy.pFlags.new_noncontact_peers_require_premium ? PrivacyType.Contacts : PrivacyType.Everybody
    });

    this.eventListener.addEventListener('destroy', () => {
      const hide = privacySection.type === PrivacyType.Contacts;
      if(!!globalPrivacy.pFlags.new_noncontact_peers_require_premium === hide) {
        return;
      }

      const promise = this.managers.appPrivacyManager.setGlobalPrivacySettings({
        _: 'globalPrivacySettings',
        pFlags: {
          ...globalPrivacy.pFlags,
          new_noncontact_peers_require_premium: hide || undefined
        }
      });
      this.eventListener.dispatchEvent('privacy', promise);
      return promise;
    });
  }
}
