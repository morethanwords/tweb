import showFeatureDetailsPopup from '@components/popups/featureDetails';
import {i18n} from '@lib/langPack';

export default function showNoForwardsPopup(onConfirm: () => void) {
  showFeatureDetailsPopup({
    title: i18n('DisableSharing'),
    rows: [{
      icon: 'sharingoff',
      title: i18n('DisableSharing.Row1.Title'),
      subtitle: i18n('DisableSharing.Row1.Subtitle')
    }, {
      icon: 'down_crossed',
      title: i18n('DisableSharing.Row2.Title'),
      subtitle: i18n('DisableSharing.Row2.Subtitle')
    }],
    buttons: [{
      text: i18n('DisableSharing'),
      onClick: onConfirm
    }],
    sticker: {
      name: 'hand_stop'
    }
  });
}
