import {Accessor, For} from 'solid-js';
import createArray from '@helpers/array/createArray';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import styles from '@components/call/callQuality.module.scss';
import {CALL_SIGNAL_BARS_COUNT} from '@lib/calls/constants';

const BARS = createArray(CALL_SIGNAL_BARS_COUNT, 0, (_: number, index: number) => index + 1);

/**
 * The call's reception as four rising bars, lit up to the count — tdesktop `Calls::SignalBars`,
 * Android `VoIPTimerView`. Height and brightness tell the lit from the unlit, never colour alone,
 * and a screen reader gets the count in words. Hidden while there is no count.
 *
 * A node rather than a component: the call panel is put together imperatively. Call it inside a
 * reactive owner.
 */
export default function createCallSignalBars(bars: Accessor<number | undefined>) {
  return (
    <span
      class={styles.bars}
      role="img"
      aria-label={I18n.format('AccDescr.CallSignalStrength', true, [bars() ?? 0, CALL_SIGNAL_BARS_COUNT])}
      hidden={bars() === undefined}
    >
      <For each={BARS}>{(index) => (
        <span class={classNames(styles.bar, index <= (bars() ?? 0) && styles.isActive)} />
      )}</For>
    </span>
  ) as HTMLElement;
}
