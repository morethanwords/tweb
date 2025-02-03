import {useContext} from 'solid-js';

import MediaEditorContext from '../context';

export function useCropOffset() {
  const [canvasSize] = useContext(MediaEditorContext).canvasSize;

  return () => {
    if(!canvasSize()) return {left: 0, top: 0, width: 0, height: 0};

    const w = canvasSize()[0],
      h = canvasSize()[1];

    return {
      left: 60,
      top: 60,
      width: w - 120,
      height: h - 180
    };
  };
}
