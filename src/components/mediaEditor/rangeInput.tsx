import {createMemo, JSX} from 'solid-js';

import clamp from '../../helpers/number/clamp';
import {hexaToHsla} from '../../helpers/color';
import nMap from '../../helpers/number/nMap';

export default function RangeInput(props: {
  ref?: (el: HTMLDivElement) => void;
  style?: JSX.CSSProperties;
  label: JSX.Element;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onChangeFinish?: (prevValue: number, currentValue: number) => void;
  passiveLabel?: boolean;
  color?: string;
}) {
  const normalizedValue = () => nMap(props.value, props.min, props.max, 0, 1);
  const mappedCenter = createMemo(() => nMap(0, props.min, props.max, 0, 100));

  const brightShadow = () => props.color && hexaToHsla(props.color).l < 32;

  let prevValue: number | null = null;

  return (
    <div
      ref={props.ref}
      class="media-editor__range-input"
      classList={{
        'media-editor__range-input--passive': props.passiveLabel,
        'media-editor__range-input--has-value': !props.passiveLabel && !!props.value,
        'media-editor__range-input--bright-shadow': brightShadow()
      }}
      style={{
        '--color': props.color,
        '--normalized': normalizedValue(),
        '--w': (Math.abs(props.value - Math.max(0, props.min)) / (props.max - props.min)) * 100 + '%',
        '--bar-left': props.value >= 0 ? Math.max(0, mappedCenter()) + '%' : undefined,
        '--bar-right': props.value < 0 ? mappedCenter() + '%' : undefined,
        ...props.style
      }}
    >
      <div class="media-editor__range-input-row">
        <div class="media-editor__range-input-label">{props.label}</div>
        <div class="media-editor__range-input-value">{props.value}</div>
      </div>
      <div class="media-editor__range-input-wrapper">
        <input
          type="range"
          min={props.min}
          max={props.max}
          step="1"
          value={props.value}
          onInput={(e) => {
            if(prevValue === null) prevValue = props.value;
            const newValue = clamp(e.currentTarget.valueAsNumber, props.min, props.max);
            props.onChange(newValue);
          }}
          onChange={() => {
            props.onChangeFinish?.(prevValue, props.value);
            prevValue = null;
          }}
        />
        <div class="media-editor__range-input-thumb media-editor__range-input-thumb--shadow" />
        <div class="media-editor__range-input-progress media-editor__range-input-progress--shadow" />
        <div class="media-editor__range-input-progress-background" />
        <div class="media-editor__range-input-thumb" />
        <div class="media-editor__range-input-progress" />
      </div>
    </div>
  );
}
