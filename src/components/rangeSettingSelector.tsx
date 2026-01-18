import {createEffect, createSignal, JSX} from 'solid-js';
import RangeSelector from '@components/rangeSelectorTsx';

export default function RangeSettingSelector(props: {
  textLeft: JSX.Element,
  textRight: (value: number) => JSX.Element,
  step: number
  value: number
  minValue: number
  maxValue: number
  onChange?: (value: number) => void,
  onMouseUp?: () => void
}) {
  const [value, setValue] = createSignal(props.value);

  createEffect(() => {
    setValue(props.value);
  });

  return (
    <div class="range-setting-selector">
      <div class="range-setting-selector-details">
        <div class="range-setting-selector-name">{props.textLeft}</div>
        <div class="range-setting-selector-value">{props.textRight(value())}</div>
      </div>
      <RangeSelector
        step={props.step}
        min={props.minValue}
        max={props.maxValue}
        value={props.value}
        onScrub={(value) => {
          props.onChange?.(value);
          setValue(value);
        }}
        onMouseUp={props.onMouseUp}
      />
    </div>
  );
}
