import {createEffect, Match, Show, Switch} from 'solid-js';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {i18n} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import createFeeCode from './feeCode';
import {formatCountdown} from './link';
import styles from './feePill.module.scss';

type FeeCode = ReturnType<typeof createFeeCode>;

/** The time left to a temporary code: a text node of its own, the only thing that changes each second */
function Time(props: {left: () => number | undefined}) {
  return <span class={styles.time} dir="ltr">{formatCountdown(props.left() ?? 0)}</span>;
}

/** The time left to a contact link, where the fee pill would stand (no fee): information only, no tap */
export function ExpiryPill(props: {left: () => number | undefined, top: number, away?: boolean}) {
  return (
    <div class={classNames(styles.place, props.away && styles.away)} style={{top: props.top + 'px'}}>
      <span class={styles.pill}>
        {props.left() === undefined ? i18n('QRCode.CreatingLink') : i18n('QRCode.NoPaid.ExpiresIn', [<Time left={props.left} /> as Node])}
      </span>
    </div>
  );
}

/** The pill's menu row: a title, and under it a line saying what it does */
function menuRow(title: () => ReturnType<typeof i18n>, info: () => ReturnType<typeof i18n>) {
  const element = document.createElement('span');
  createEffect(() => {
    const subtitle = document.createElement('span');
    subtitle.className = styles.subtitle;
    subtitle.append(info());
    element.replaceChildren(title(), subtitle);
  });
  return element;
}

/**
 * The pill under the card that removes the message fee. While the fee stands it is one tap away from a temporary free
 * code; once there is a code, a tap opens the menu that resets it, changes its timer or brings the fee back.
 */
export function FeePill(props: {fee: FeeCode, top: number, /** A panel stands where it is */ away?: boolean}) {
  const {fee} = props;
  // the free pill is a menu toggle; it is made when the pill turns from the fee one
  const attachMenu = (freeButton: HTMLButtonElement) => {
    const timerRow = menuRow(
      () => fee.mode() === 'temporary' ? i18n('QRCode.NoPaid.Menu.DisableTimer') : i18n('QRCode.NoPaid.Menu.EnableTimer'),
      () => fee.mode() === 'temporary' ? i18n('QRCode.NoPaid.Menu.DisableTimerInfo') : i18n('QRCode.NoPaid.Menu.EnableTimerInfo')
    );

    const buttons: ButtonMenuItemOptionsVerifiable[] = [{
      icon: 'rotate_right',
      text: 'QRCode.NoPaid.Menu.Reset',
      onClick: () => fee.resetCode()
    }, {
      icon: 'schedule',
      textElement: timerRow,
      multiline: true,
      verify: () => fee.canDisableTimer(),
      onClick: () => fee.toggleTimer()
    }, {
      icon: 'star',
      text: 'QRCode.NoPaid.Menu.RestoreFee',
      onClick: () => fee.restoreFee()
    }];

    ButtonMenuToggle({
      container: freeButton,
      direction: 'top-left',
      buttons
    });
  };

  return (
    <div class={classNames(styles.place, props.away && styles.away)} style={{top: props.top + 'px'}}>
      <Show
        when={fee.mode() !== 'fee'}
        fallback={
          <button
            class={styles.pill}
            type="button"
            disabled={fee.busy()}
            onClick={() => fee.removeFee()}
          >
            {i18n('QRCode.NoPaid.RemoveStarsFee', [fee.fee()])}
          </button>
        }
      >
        {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the label is the Switch below, text in both states */}
        <button ref={attachMenu} class={styles.pill} type="button">
          <Switch>
            <Match when={fee.mode() === 'temporary'}>
              {i18n('QRCode.NoPaid.Free')} · {i18n('QRCode.NoPaid.ExpiresIn', [<Time left={fee.left} /> as Node])}
            </Match>
            <Match when={true}>
              {i18n('QRCode.NoPaid.Free')} · {i18n('QRCode.NoPaid.NoTimeLimit')}
            </Match>
          </Switch>
        </button>
      </Show>
    </div>
  );
}
