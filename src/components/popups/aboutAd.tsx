import showFeatureDetailsPopup from '@components/popups/featureDetails';
import createFeatureDetailsIconSticker from '@components/featureDetailsIconSticker';
import {i18n} from '@lib/langPack';

export default function showAboutAdPopup() {
  showFeatureDetailsPopup({
    sticker: {
      element: createFeatureDetailsIconSticker('ads')
    },
    title: i18n('AboutRevenueSharingAds'),
    subtitle: i18n('RevenueSharingAdsAlertSubtitle'),
    subtitleSecondary: true,
    rows: [{
      icon: 'lock',
      title: i18n('RevenueSharingAdsInfo1Title'),
      subtitle: i18n('RevenueSharingAdsInfo1Subtitle')
    }, {
      icon: 'revenue',
      title: i18n('RevenueSharingAdsInfo2Title'),
      subtitle: i18n('RevenueSharingAdsInfo2Subtitle')
    }, {
      icon: 'nochannel',
      title: i18n('RevenueSharingAdsInfo3Title'),
      subtitle: i18n('RevenueSharingAdsInfo3Subtitle')
    }],
    caption: {
      title: i18n('RevenueSharingAdsInfo4Title'),
      subtitle: i18n('RevenueSharingAdsInfo4Subtitle2', [i18n('RevenueSharingAdsInfo4SubtitleLearnMore1')])
    },
    buttons: [{
      text: i18n('RevenueSharingAdsAlertButton')
    }]
  });
}
