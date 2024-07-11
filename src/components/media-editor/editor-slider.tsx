import {RangeSettingSelector} from '../sidebarLeft/tabs/generalSettings';
import {LangPackKey} from '../../lib/langPack';
import {createEffect} from 'solid-js';

// refactor plz
export const MediaEditorSlider = (props: { color?: string, label: LangPackKey, initialValue?: number, min?: number, max: number, symmetric?: boolean, change?: (value: any) => void }) => {
  const range = new RangeSettingSelector(props.label, 1, props.initialValue || 0, props.symmetric ? -props.max : props.min, props.max, true, props.symmetric);
  range.onChange = (value) => props.change(value);
  createEffect(() => {
    props.color && range.container.style.setProperty('--primary-color', props.color);
  });
  return range.container;
}
