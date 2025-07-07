import {useMediaEditorContext} from '../context';

export function useCropOffset() {
  const {editorState} = useMediaEditorContext();

  return () => {
    const {canvasSize} = editorState;
    if(!canvasSize) return {left: 0, top: 0, width: 0, height: 0};

    const w = canvasSize[0],
      h = canvasSize[1];

    return {
      left: 60,
      top: 60,
      width: w - 120,
      height: h - 180
    };
  };
}
