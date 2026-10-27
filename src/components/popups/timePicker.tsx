import {untrack, useContext} from 'solid-js';
import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import {createTimeInputs} from '@components/timeInputs';
import ListenerSetter from '@helpers/listenerSetter';
import clamp from '@helpers/number/clamp';
import {i18n, LangPackKey} from '@lib/langPack';
import {ONE_DAY_MINUTES} from '@helpers/date';
import OpeningHours from '@helpers/openingHours';

import styles from '@components/popups/timePicker.module.scss';

export type TimePickerPopupOptions = {
  titleLangKey: LangPackKey,
  /** Minutes since midnight; may run past 24 h for a day that closes after midnight. */
  value: number,
  min: number,
  max: number,
  onPick: (value: number) => void
};

/**
 * A single `HH : MM` field with hard bounds — the web counterpart of Android's
 * `AlertsCreator.createTimePickerDialog` (a two-wheel picker there).
 */
export default function showTimePickerPopup(options: TimePickerPopupOptions): void {
  function Inner() {
    const context = useContext(PopupContext);
    const listenerSetter = new ListenerSetter();
    untrack(() => context.middlewareHelper).get().onDestroy(() => listenerSetter.removeAll());

    const timeInputs = createTimeInputs({
      listenerSetter,
      hours: Math.floor(options.value / 60),
      minutes: options.value % 60,
      maxHours: Math.floor(options.max / 60)
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>{i18n(options.titleLangKey)}</PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Body>
          <div class={styles.inputs}>
            {timeInputs.hoursInputField.container}
            <span class={styles.separator}>:</span>
            {timeInputs.minutesInputField.container}
          </div>
          <div class={styles.hint}>
            {i18n('BusinessHoursDayInfo')}
          </div>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            color="primary"
            callback={async() => {
              options.onPick(clamp(timeInputs.minutesOfDay(), options.min, options.max));
            }}
          >
            {i18n('Save')}
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </>
    );
  }

  createPopup(() => (
    <PopupElement
      class="popup-time-picker"
      closable
    >
      <Inner />
    </PopupElement>
  ));
}

/** `8:00 AM` / `1:30 AM (Next day)` — the value a picker row shows. */
export function formatPeriodTime(value: number) {
  return OpeningHours.Period.timeToString(value, value >= ONE_DAY_MINUTES);
}
