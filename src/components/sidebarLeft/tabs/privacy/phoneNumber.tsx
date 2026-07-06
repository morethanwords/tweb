import {Component, onMount} from 'solid-js';
import PrivacySection from '@components/privacySection';
import {i18n, LangPackKey} from '@lib/langPack';
import anchorCopy from '@helpers/dom/anchorCopy';
import useIsCrmSuperAdmin from '@stores/crmRole';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppPrivacyPhoneNumberTab} from '@components/solidJsTabs/tabs';

const PrivacyPhoneNumber: Component = () => {
  const [tab] = useSuperTab<typeof AppPrivacyPhoneNumberTab>();
  const promiseCollector = usePromiseCollector();

  onMount(() => {
    tab.container.classList.add('privacy-tab', 'privacy-phone-number');
  });

  promiseCollector.collect((async() => {
    const formatted = '+' + (await tab.managers.appUsersManager.getSelf()).phone;
    const captionEl = document.createElement('div');
    captionEl.append(i18n('PrivacyPhoneInfo'));
    // The t.me/+phone link exposes the support account's number — CRM-superadmin-only.
    if(useIsCrmSuperAdmin()()) {
      captionEl.append(
        document.createElement('br'),
        document.createElement('br'),
        i18n('PrivacyPhoneInfo4'),
        document.createElement('br'),
        anchorCopy({
          mePath: formatted
        })
      );
    }

    const phoneSection = new PrivacySection({
      tab,
      title: 'PrivacyPhoneTitle',
      inputKey: 'inputPrivacyKeyPhoneNumber',
      captions: [captionEl, captionEl, ''],
      exceptionTexts: ['PrivacySettingsController.NeverShare', 'PrivacySettingsController.AlwaysShare'],
      appendTo: tab.scrollable,
      onRadioChange: (type) => {
        s.setRadio(PrivacyType.Everybody);
        s.radioSection.container.classList.toggle('hide', type !== PrivacyType.Nobody);
      },
      managers: tab.managers
    });

    const sCaption: LangPackKey = 'PrivacyPhoneInfo3';
    const s = new PrivacySection({
      tab,
      title: 'PrivacyPhoneTitle2',
      inputKey: 'inputPrivacyKeyAddedByPhone',
      captions: [sCaption, sCaption, ''],
      noExceptions: true,
      skipTypes: [PrivacyType.Nobody],
      managers: tab.managers
    });

    tab.scrollable.container.insertBefore(s.radioSection.container, phoneSection.radioSection.container.nextSibling);
  })());

  return null;
};

export default PrivacyPhoneNumber;
