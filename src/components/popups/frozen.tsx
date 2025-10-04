import {createSignal, For} from 'solid-js';
import PopupElement from './indexTsx';
import {i18n} from '../../lib/langPack';
import Row from '../rowTsx';
import {createPopup} from './indexTsx';
import styles from './frozen.module.scss';
import classNames from '../../helpers/string/classNames';
import LottieAnimation from '../lottieAnimation';
import lottieLoader from '../../lib/rlottie/lottieLoader';
import {useAppConfig} from '../../stores/appState';
import anchorCallback from '../../helpers/dom/anchorCallback';
import {formatDate} from '../../helpers/date';
import appImManager from '../../lib/appManagers/appImManager';

export default function showFrozenPopup() {
  const [show, setShow] = createSignal(false);
  const appConfig = useAppConfig();
  const username = appConfig.freeze_appeal_url.split('/').pop();

  const onClick = () => {
    setShow(false);
    appImManager.openUrl(appConfig.freeze_appeal_url);
  };

  const anchor = anchorCallback(onClick, true);
  anchor.innerText = '@' + username;

  const rows: [Icon, HTMLElement, HTMLElement][] = [
    ['hand', i18n('Frozen.Violation.Title'), i18n('Frozen.Violation.Subtitle')],
    ['lock', i18n('Frozen.ReadOnly.Title'), i18n('Frozen.ReadOnly.Subtitle')],
    ['hourglass', i18n('Frozen.Appeal.Title'), i18n('Frozen.Appeal.Subtitle', [anchor, formatDate(new Date(appConfig.freeze_until_date * 1000), undefined, true)])]
  ];

  createPopup(() => (
    <PopupElement class={styles.popup} containerClass={styles.popupContainer} show={show()}>
      <PopupElement.Header class={styles.popupHeader}>
        <PopupElement.CloseButton class={styles.popupCloseButton} />
      </PopupElement.Header>
      <PopupElement.Body>
        <LottieAnimation
          class={styles.lottieAnimation}
          size={130}
          lottieLoader={lottieLoader}
          restartOnClick
          name="UtyanRestricted"
          onPromise={(promise) => {
            promise.then(() => {
              setShow(true);
            });
          }}
        />
        <div class={classNames(styles.title, 'text-center text-overflow-wrap')}>
          {i18n('Frozen.Title')}
        </div>
        <For each={rows}>{([icon, title, subtitle]) => (
          <Row class={styles.row}>
            <Row.Icon class={classNames('primary', styles.rowIcon)} icon={icon} />
            <Row.Title class="text-bold">{title}</Row.Title>
            <Row.Subtitle class={styles.rowSubtitle}>{subtitle}</Row.Subtitle>
          </Row>
        )}</For>
      </PopupElement.Body>
      <PopupElement.Footer class={styles.popupFooter}>
        <PopupElement.FooterButton langKey="Frozen.Button" callback={onClick} />
        <PopupElement.FooterButton langKey="Frozen.Ok" cancel secondary />
      </PopupElement.Footer>
    </PopupElement>
  ));
}
