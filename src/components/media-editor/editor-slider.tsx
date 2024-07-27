import {RangeSettingSelector} from '../sidebarLeft/tabs/generalSettings';
import {LangPackKey} from '../../lib/langPack';
import {createEffect, createSignal} from 'solid-js';

export const MediaEditorSlider = (props: { value?: number, color?: string, label: LangPackKey, initialValue?: number, min?: number, max: number, symmetric?: boolean, change?: (value: any) => void }) => {
  const range = new RangeSettingSelector(props.label, 1, props.initialValue || 0, props.symmetric ? -props.max : props.min, props.max, true, props.symmetric);

  const [value, setValue] = createSignal(props.initialValue);

  createEffect(() => {
    props.change(value());
  })
  props.change(props.initialValue);
  range.onChange = (value) => setValue(value);

  createEffect(() => {
    props.color && range.container.style.setProperty('--primary-color', props.color);
  });
  createEffect(() => {
    console.info('val upd', props.value);
    if(!props.value && props.value !== 0) return;
    range.update(props.value);
  });
  return range.container;
}
