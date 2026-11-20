import {useMediaEditorContext} from '@components/mediaEditor/context';
import {getAppWindow} from '@helpers/appWindow';

export function useCropOffset() {
  const {editorState, isEditingForAvatar} = useMediaEditorContext();

  return () => {
    const {canvasSize} = editorState;
    if(!canvasSize) return {left: 0, top: 0, width: 0, height: 0};

    const w = canvasSize[0],
      h = canvasSize[1];

    const margin = isEditingForAvatar ? 60 : getAppWindow().innerWidth <= 800 ? 16 : 5;
    const left = Math.min(margin, Math.max(0, (w - 1) / 2));
    const top = Math.min(margin, Math.max(0, (h - 1) / 2));
    return {
      left,
      top,
      width: Math.max(1, w - left * 2),
      height: Math.max(1, h - top - (isEditingForAvatar ? Math.min(120, Math.max(0, h - top - 1)) : top))
    };
  };
}
