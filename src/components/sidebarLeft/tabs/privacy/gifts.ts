import {SliderSuperTabEventable} from '@components/sliderTab';
import PrivacySection from '@components/privacySection';
import {LangPackKey} from '@lib/langPack';
import Row from '@components/row';
import CheckboxField from '@components/checkboxField';
import SettingSection from '@components/settingSection';
import {DisallowedGiftsSettings, GlobalPrivacySettings} from '@layer';
import rootScope from '@lib/rootScope';
import PopupPremium from '@components/popups/premium';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {hideToast, toastNew} from '@components/toast';
import anchorCallback from '@helpers/dom/anchorCallback';
import cancelEvent from '@helpers/dom/cancelEvent';

type GiftTypeFlag = keyof DisallowedGiftsSettings.disallowedGiftsSettings['pFlags'];

const GIFT_TYPE_TOGGLES: Array<{flag: GiftTypeFlag, langKey: LangPackKey}> = [
  {flag: 'disallow_limited_stargifts', langKey: 'Privacy.GiftsTypeLimited'},
  {flag: 'disallow_unlimited_stargifts', langKey: 'Privacy.GiftsTypeUnlimited'},
  {flag: 'disallow_unique_stargifts', langKey: 'Privacy.GiftsTypeUnique'},
  {flag: 'disallow_stargifts_from_channels', langKey: 'Privacy.GiftsTypeChannel'},
  {flag: 'disallow_premium_gifts', langKey: 'Privacy.GiftsTypePremium'}
];

export default class AppPrivacyGiftsTab extends SliderSuperTabEventable<{
  privacy: (globalPrivacy: Promise<GlobalPrivacySettings>) => void
}> {
  public init(globalPrivacy: GlobalPrivacySettings) {
    this.container.classList.add('privacy-tab', 'privacy-gifts');
    this.setTitle('PrivacyGifts');

    const caption: LangPackKey = 'Privacy.GiftsCaption';
    new PrivacySection({
      tab: this,
      title: 'Privacy.Gifts',
      inputKey: 'inputPrivacyKeyStarGiftsAutoSave',
      captions: [caption, caption, caption],
      exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
      appendTo: this.scrollable,
      managers: this.managers,
      allowMiniApps: true
    });

    const showPremiumToast = (e?: Event) => {
      if(e) cancelEvent(e);
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

    const gatePremiumToggle = (row: Row) => {
      const input = row.checkboxField.input;
      this.listenerSetter.add(input)('change', () => {
        if(rootScope.premium) return;
        input.checked = !input.checked;
        showPremiumToast();
      });
    };

    const typesSection = new SettingSection({
      name: 'Privacy.GiftsAcceptedTypes',
      caption: 'Privacy.GiftsAcceptedTypesInfo'
    });

    const typeRows = GIFT_TYPE_TOGGLES.map(({flag, langKey}) => {
      const row = new Row({
        titleLangKey: langKey,
        checkboxField: new CheckboxField({
          toggle: true,
          checked: !globalPrivacy.disallowed_gifts?.pFlags[flag]
        }),
        listenerSetter: this.listenerSetter
      });
      gatePremiumToggle(row);
      typesSection.content.append(row.container);
      return {flag, row};
    });

    this.scrollable.append(typesSection.container);

    const showIconSection = new SettingSection({
      caption: 'Privacy.GiftsShowIconInfo'
    });

    const showIconRow = new Row({
      titleLangKey: 'Privacy.GiftsShowIcon',
      checkboxField: new CheckboxField({
        toggle: true,
        checked: !!globalPrivacy.pFlags.display_gifts_button
      }),
      listenerSetter: this.listenerSetter
    });
    gatePremiumToggle(showIconRow);

    showIconSection.content.append(showIconRow.container);
    this.scrollable.append(showIconSection.container);

    this.eventListener.addEventListener('destroy', () => {
      if(!rootScope.premium) return;

      const newDisallowedPFlags: DisallowedGiftsSettings.disallowedGiftsSettings['pFlags'] = {};
      let hasAnyDisallow = false;
      for(const {flag, row} of typeRows) {
        if(!row.checkboxField.checked) {
          newDisallowedPFlags[flag] = true;
          hasAnyDisallow = true;
        }
      }

      const newDisplayGiftsButton = showIconRow.checkboxField.checked;

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

      const promise = this.managers.appPrivacyManager.setGlobalPrivacySettings(settings);
      this.eventListener.dispatchEvent('privacy', promise);
      return promise;
    });
  }
}
