import {RangeSettingSelector} from '../sidebarLeft/tabs/generalSettings';
import {LangPackKey} from '../../lib/langPack';
import {createEffect} from 'solid-js';

export const MediaEditorSlider = ({label, initialValue, min, max, symmetric, change, color}:
                                    { color?: () => string, label: LangPackKey, initialValue?: number, min?: number, max: number, symmetric?: boolean, change?: (value: any) => void }) => {
  const range = new RangeSettingSelector(label, 1, initialValue || 0, symmetric ? -max : min, max, true, symmetric);
  range.onChange = (value) => change(value);
  createEffect(() => {
    console.info('huh', color());
    color && range.container.style.setProperty('--primary-color', color());
  });
  return range.container;
}
