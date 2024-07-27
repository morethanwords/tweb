import {RangeSettingSelector} from '../sidebarLeft/tabs/generalSettings';
import {LangPackKey} from '../../lib/langPack';
import {createEffect} from 'solid-js';

export const MediaEditorSlider = (props: { value?: number, color?: string, label: LangPackKey, initialValue?: number, min?: number, max: number, symmetric?: boolean, change?: (value: any) => void }) => {
  const range = new RangeSettingSelector(props.label, 1, props.initialValue || 0, props.symmetric ? -props.max : props.min, props.max, true, props.symmetric);
  range.onChange = (value) => props.change(value);
  createEffect(() => {
    props.color && range.container.style.setProperty('--primary-color', props.color);
  });
  createEffect(() => {
    console.info('val upd', props.value);
    if(!props.value && props.value !== 0) return;
    range.update(props.value);
    range.updateFakeProgress(props.value);
  });
  return range.container;
}
