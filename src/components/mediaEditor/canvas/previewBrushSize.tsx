import {Show} from 'solid-js';

import {hexToRgb} from '../../../helpers/color';

import {useMediaEditorContext} from '../context';


const PreviewBrushSize = () => {
  const {editorState} = useMediaEditorContext();

  return (
    <Show when={editorState.previewBrushSize}>
      <div
        class="media-editor__preview-brush-size"
        style={{
          '--color': !['blur', 'eraser'].includes(editorState.currentBrush.brush) ?
            hexToRgb(editorState.currentBrush.color).join(',') :
            undefined,
          'width': editorState.previewBrushSize + 'px',
          'height': editorState.previewBrushSize + 'px'
        }}
      />
    </Show>
  );
};

export default PreviewBrushSize;
