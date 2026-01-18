import {i18n} from '@lib/langPack';
import {useAppConfig} from '@stores/appState';
import anchorCallback from '@helpers/dom/anchorCallback';
import {formatDate} from '@helpers/date';
import appImManager from '@lib/appImManager';
import showFeatureDetailsPopup from '@components/popups/featureDetails';

const TEST = false;

export default function showFrozenPopup() {
  const appConfig = useAppConfig();
  const url = TEST ? 'https://t.me/telegram' : appConfig.freeze_appeal_url;
  const untilDate = TEST ? Date.now() + 86400e3 : appConfig.freeze_until_date * 1000;
  const username = url.split('/').pop();

  const onClick = () => {
    appImManager.openUrl(url);
  };

  const anchor = anchorCallback(onClick, true);
  anchor.innerText = '@' + username;

  showFeatureDetailsPopup({
    rows: [
      {icon: 'hand', title: i18n('Frozen.Violation.Title'), subtitle: i18n('Frozen.Violation.Subtitle')},
      {icon: 'lock', title: i18n('Frozen.ReadOnly.Title'), subtitle: i18n('Frozen.ReadOnly.Subtitle')},
      {
        icon: 'hourglass',
        title: i18n('Frozen.Appeal.Title'),
        subtitle: i18n('Frozen.Appeal.Subtitle', [anchor, formatDate(new Date(untilDate), {withTime: true})])
      }
    ],
    sticker: {
      name: 'UtyanRestricted',
      size: 130
    },
    title: i18n('Frozen.Title'),
    buttons: [{
      text: i18n('Frozen.Button'),
      onClick: (close) => {
        close();
        onClick();
      }
    }, {
      text: i18n('Frozen.Ok'),
      onClick: () => {},
      isCancel: true,
      isSecondary: true
    }]
  });
}
