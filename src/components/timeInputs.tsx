import {Accessor, createSignal} from 'solid-js';
import InputField from '@components/inputField';
import ListenerSetter from '@helpers/listenerSetter';
import I18n from '@lib/langPack';

/**
 * The `HH : MM` pair of number fields shared by the schedule date picker and the
 * business-hours time picker: digits only, auto-advance from hours to minutes,
 * and an over-max first pair spills its second digit into the minutes field
 * (typing `9` `3` `0` into hours gives `09:30`).
 */

export const padTime = (value: number) => ('0' + value).slice(-2);

export type TimeInputsOptions = {
  listenerSetter: ListenerSetter,
  hours: number,
  minutes: number,
  /** Highest hour the field accepts — 23 for a clock, 47 for a business day that runs past midnight. */
  maxHours?: number,
  onChange?: (minutesOfDay: number) => void
};

export type TimeInputs = {
  hours: Accessor<string>,
  minutes: Accessor<string>,
  hoursInputField: InputField,
  minutesInputField: InputField,
  /** Minutes since midnight, i.e. what the API and the business-hours periods speak in. */
  minutesOfDay: Accessor<number>,
  setTime: (minutesOfDay: number) => void
};

export function createTimeInputs(options: TimeInputsOptions): TimeInputs {
  const maxHours = options.maxHours ?? 23;
  const [hours, setHours] = createSignal(padTime(options.hours));
  const [minutes, setMinutes] = createSignal(padTime(options.minutes));

  const hoursInputField = new InputField({plainText: true});
  const minutesInputField = new InputField({plainText: true});
  hoursInputField.input.setAttribute('aria-label', I18n.format('AccDescr.Hours', true));
  minutesInputField.input.setAttribute('aria-label', I18n.format('AccDescr.Minutes', true));
  hoursInputField.setValueSilently(hours());
  minutesInputField.setValueSilently(minutes());

  const minutesOfDay = () => (+hours() || 0) * 60 + (+minutes() || 0);

  const handle = (
    max: number,
    inputField: InputField,
    setStateValue: (value: string) => void,
    onInput: (length: number) => void,
    onOverflow?: (digit: number) => void
  ) => {
    const maxString = '' + max;
    options.listenerSetter.add(inputField.input)('input', () => {
      let value = inputField.value.replace(/\D/g, '');
      if(value.length > maxString.length) {
        value = value.slice(0, maxString.length);
      } else if(
        (value.length === 1 && maxString.length === 2 && +value[0] > +maxString[0]) ||
        (value.length === 2 && +value > max)
      ) {
        if(value.length === 2 && onOverflow) {
          onOverflow(+value[1]);
        }
        value = '0' + value[0];
      }

      inputField.setValueSilently(value);
      setStateValue(value);
      onInput(value.length);
      options.onChange?.(minutesOfDay());
    });
  };

  handle(maxHours, hoursInputField, setHours, (length) => {
    if(length === 2) minutesInputField.input.focus();
  }, (digit) => {
    const next = (digit + minutesInputField.value).slice(0, 2);
    minutesInputField.setValueSilently(next);
    setMinutes(next);
  });

  handle(59, minutesInputField, setMinutes, (length) => {
    if(!length) hoursInputField.input.focus();
  });

  const setTime = (value: number) => {
    const h = padTime(Math.floor(value / 60));
    const m = padTime(value % 60);
    hoursInputField.setValueSilently(h);
    minutesInputField.setValueSilently(m);
    setHours(h);
    setMinutes(m);
  };

  return {hours, minutes, hoursInputField, minutesInputField, minutesOfDay, setTime};
}
