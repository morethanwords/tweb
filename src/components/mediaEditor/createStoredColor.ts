import {colorPickerSwatches} from '@components/mediaEditor/colorPicker';
import {SavedBrushColor} from '@config/state';
import {createStoredValue, Optional, StoredValueKey} from './createStoredValue';


export function createStoredColor(key: StoredValueKey, defaultColor: string) {
  const [savedColor, setSavedColor] = createStoredValue<SavedBrushColor>({
    key,
    validate: (value: any) => {
      if(
        !(value instanceof Array) ||
        typeof value[0] !== 'number' ||
        typeof value[1] !== 'string' ||
        typeof value[2] !== 'string'
      ) {
        return Optional.none();
      }

      return Optional.value(value as SavedBrushColor);
    },
    defaultValue: [colorPickerSwatches.includes(defaultColor) ? 1 : 2, defaultColor, defaultColor] as SavedBrushColor
  });

  function setColor(color: string) {
    let value: SavedBrushColor;

    if(colorPickerSwatches.includes(color)) {
      value = [1, color, color];
    } else {
      value = [2, savedColor()[1], color];
    }

    setSavedColor(value);
  }

  return [
    () => ({
      value: savedColor()[savedColor()[0]],
      previous: savedColor()[1]
    }),
    setColor
  ] as const;
}
