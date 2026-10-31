import {createEffect, createSignal, Match, onCleanup, onMount, Show, Switch} from 'solid-js';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {i18n} from '@lib/langPack';
import classNames from '@helpers/string/classNames';
import liteMode from '@helpers/liteMode';
import createFeeCode, {FREE_SECONDS} from './feeCode';
import {formatCountdown} from './link';
import styles from './feePill.module.scss';

type FeeCode = ReturnType<typeof createFeeCode>;

/**
 * The time left to a temporary code: a text node of its own, the only thing that changes each second. An element, not a
 * component, as an argument of `i18n` takes nodes, and a component may come back as something else (a hot one does).
 */
function time(left: () => number | undefined) {
  return (<span class={styles.time} dir="ltr">{formatCountdown(left() ?? 0)}</span>) as HTMLElement;
}

/** The time left to a contact link, where the fee pill would stand (no fee): information only, no tap */
export function ExpiryPill(props: {left: () => number | undefined, top: number, away?: boolean}) {
  return (
    <div class={classNames(styles.place, props.away && styles.away)} style={{top: props.top + 'px'}}>
      <span class={styles.pill}>
        {props.left() === undefined ? i18n('QRCode.CreatingLink') : i18n('QRCode.NoPaid.ExpiresIn', [time(props.left)])}
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

/** What the free pill says: the time left on the timer, or that there is none */
function freeLabel(fee: FeeCode) {
  return (
    <span class={styles.label}>
      <Switch>
        <Match when={fee.mode() === 'temporary'}>
          {i18n('QRCode.NoPaid.Free')} · {i18n('QRCode.NoPaid.ExpiresIn', [time(fee.left)])}
        </Match>
        <Match when={true}>
          {i18n('QRCode.NoPaid.Free')} · {i18n('QRCode.NoPaid.NoTimeLimit')}
        </Match>
      </Switch>
    </span>
  );
}

// `QrShareView`: the white fill sweeps in over 340 ms, then burns down with the minute
const FILL_SWEEP_MS = 340;

/**
 * The pill of a free code, as on Android: a white fill under the words in the code's ink sweeps in from the inline
 * start, and on the timer burns back toward it as the minute runs out; what it has left is glass again.
 */
function FreePill(props: {fee: FeeCode, ref: (button: HTMLButtonElement) => void}) {
  const {fee} = props;
  const [swept, setSwept] = createSignal(!liteMode.isAvailable('animations'));
  const [burning, setBurning] = createSignal(swept());
  onMount(() => {
    if(swept()) return;
    const frame = requestAnimationFrame(() => setSwept(true));
    const timer = window.setTimeout(() => setBurning(true), FILL_SWEEP_MS);
    onCleanup(() => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    });
  });

  const fraction = () => !swept() ? 0 : fee.mode() === 'temporary' ? (fee.left() ?? FREE_SECONDS) / FREE_SECONDS : 1;

  return (
    // the toggle's class is in the markup: the menu opens only from a trigger that has it, and Solid sets the class after the ref
    <button ref={props.ref} class={classNames(styles.pill, styles.freePill, 'btn-menu-toggle')} type="button">
      {freeLabel(fee)}
      <span class={classNames(styles.fill, burning() && styles.fillBurning)} style={{'--fill': fraction()}} aria-hidden="true">
        {freeLabel(fee)}
      </span>
    </button>
  );
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
            onClick={() => fee.removeFee()}
          >
            {i18n('QRCode.NoPaid.RemoveStarsFee', [fee.fee()])}
          </button>
        }
      >
        <FreePill fee={fee} ref={attachMenu} />
      </Show>
    </div>
  );
}
