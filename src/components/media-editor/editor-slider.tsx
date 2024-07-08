import {RangeSettingSelector} from '../sidebarLeft/tabs/generalSettings';
import {LangPackKey} from '../../lib/langPack';

export const MediaEditorSlider = ({label, initialValue, min, max, symmetric, change}:
                                    { label:LangPackKey, initialValue?: number, min?: number, max: number, symmetric?: boolean, change?: (value: any) => void }) => {
  const range = new RangeSettingSelector(label, 1, initialValue || 0, symmetric ? -max : min, max, true, symmetric);
  range.onChange = (value) => change(value);
  return range.container;
}
