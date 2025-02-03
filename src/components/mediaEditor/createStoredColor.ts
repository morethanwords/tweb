import {createSignal} from 'solid-js';

import {colorPickerSwatches} from './colorPicker';

export function createStoredColor(key: string, defaultColor: string) {
  // (1 - use swatch, 2 - use picker color), (color from swatch), (color from picker)
  type SavedColor = [1 | 2, string, string];

  const [savedColor, setSavedColor] = createSignal<SavedColor>(
    (() => {
      const fallback = () => {
        const value = [colorPickerSwatches.includes(defaultColor) ? 1 : 2, defaultColor, defaultColor] as SavedColor;
        localStorage.setItem(key, JSON.stringify(value));
        return value;
      };
      try {
        const value: SavedColor = JSON.parse(localStorage.getItem(key));
        if(
          !(value instanceof Array) ||
          typeof value[0] !== 'number' ||
          typeof value[1] !== 'string' ||
          typeof value[2] !== 'string'
        ) {
          return fallback();
        }
        return value;
      } catch{}
      return fallback();
    })()
  );

  function setColor(color: string) {
    let value: SavedColor;
    if(colorPickerSwatches.includes(color)) {
      value = [1, color, color];
    } else {
      value = [2, savedColor()[1], color];
    }
    setSavedColor(value);
    localStorage.setItem(key, JSON.stringify(value));
  }

  return [
    () => ({
      value: savedColor()[savedColor()[0]],
      previous: savedColor()[1]
    }),
    setColor
  ] as const;
}
