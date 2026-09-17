import {i18n} from '@lib/langPack';
import {useAppConfig} from '@stores/appState';
import anchorCallback from '@helpers/dom/anchorCallback';
import {formatDate} from '@helpers/date';
import appImManager from '@lib/appImManager';
import showFeatureDetailsPopup, {FeatureDetailsButton} from '@components/popups/featureDetails';
import {FeatureRow} from '@components/featureRows';

const TEST = false;

export default function showFrozenPopup() {
  const appConfig = useAppConfig();
  const url = TEST ? 'https://t.me/telegram' : appConfig.freeze_appeal_url;
  const untilDate = TEST ? Date.now() + 86400e3 : appConfig.freeze_until_date * 1000;

  const onClick = () => {
    appImManager.openUrl(url);
  };

  const rows: FeatureRow[] = [
    {icon: 'hand', title: i18n('Frozen.Violation.Title'), subtitle: i18n('Frozen.Violation.Subtitle')},
    {icon: 'lock', title: i18n('Frozen.ReadOnly.Title'), subtitle: i18n('Frozen.ReadOnly.Subtitle')}
  ];

  // The appeal line names the support account and the deadline; both come with the freeze, but both
  // are optional in the app config. Without them there is nothing to point the user at — and reading
  // them unguarded used to throw before the popup was even built, leaving a frozen account with no
  // explanation at all.
  const canAppeal = !!url && !!untilDate;
  if(canAppeal) {
    const anchor = anchorCallback(onClick, true);
    anchor.innerText = '@' + url.split('/').pop();

    rows.push({
      icon: 'hourglass',
      title: i18n('Frozen.Appeal.Title'),
      subtitle: i18n('Frozen.Appeal.Subtitle', [anchor, formatDate(new Date(untilDate), {withTime: true})])
    });
  }

  const buttons: FeatureDetailsButton[] = [];
  if(url) {
    buttons.push({
      text: i18n('Frozen.Button'),
      onClick: (close) => {
        close();
        onClick();
      }
    });
  }

  buttons.push({
    text: i18n('Frozen.Ok'),
    onClick: () => {},
    isCancel: true,
    isSecondary: true
  });

  showFeatureDetailsPopup({
    rows,
    sticker: {
      name: 'UtyanRestricted',
      size: 130
    },
    title: i18n('Frozen.Title'),
    buttons
  });
}
