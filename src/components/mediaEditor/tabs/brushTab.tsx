import {createEffect, JSX} from 'solid-js';

import {i18n} from '../../../lib/langPack';

import Space from '../../space';

import {ArrowBrush, BlurBrush, EraserBrush, MarkerBrush, NeonBrush, PenBrush} from '../brushesSvg';
import {createStoredColor} from '../createStoredColor';
import {useMediaEditorContext} from '../context';
import ColorPicker from '../colorPicker';
import LargeButton from '../largeButton';
import RangeInput from '../rangeInput';

export default function BrushTab() {
  const {editorState, mediaType} = useMediaEditorContext();

  const savedBrushColors = {
    pen: createStoredColor('media-editor-pen-color', '#fe4438'),
    arrow: createStoredColor('media-editor-arrow-color', '#ffd60a'),
    brush: createStoredColor('media-editor-brush-color', '#ff8901'),
    neon: createStoredColor('media-editor-neon-color', '#62e5e0')
  };

  function savedBrushSignal(brush: string) {
    return savedBrushColors[brush as keyof typeof savedBrushColors];
  }

  function updateCurrentBrush() {
    const [savedColor] = savedBrushSignal(editorState.currentBrush.brush) || [];
    if(!savedColor || editorState.currentBrush.color === savedColor().value) return;

    editorState.currentBrush.color = savedColor().value;
  }

  updateCurrentBrush(); // Change the brush before the ColorPicker is rendered
  createEffect(() => {
    updateCurrentBrush();
  });

  function setColor(color: string) {
    const brush = editorState.currentBrush.brush;
    const [, setSavedColor] = savedBrushSignal(brush) || [];
    setSavedColor?.(color);
  }

  const brushButton = (text: JSX.Element, brushSvg: JSX.Element, brush: string) => (
    <LargeButton
      active={editorState.currentBrush.brush === brush}
      onClick={() => void (editorState.currentBrush.brush = brush)}
      class={`media-editor__brush-button`}
    >
      <div
        class="media-editor__brush-button-svg-wrapper"
        style={{
          color: savedBrushSignal(brush)?.[0]().value
        }}
      >
        {brushSvg}
      </div>
      {text}
    </LargeButton>
  );

  const hasColor = () => editorState.currentBrush.brush in savedBrushColors;

  let timeoutId = 0;
  function removeSizePreview() {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      editorState.previewBrushSize = undefined;
    }, 1000);
  }

  return (
    <>
      <div
        style={{
          transition: 'opacity .2s',
          ...(!hasColor() ?
            {
              'opacity': 0.25,
              'pointer-events': 'none'
            } :
            undefined
          )
        }
        }
      >
        <ColorPicker
          value={editorState.currentBrush.color}
          onChange={setColor}
          colorKey={editorState.currentBrush.brush}
          previousColor={savedBrushSignal(editorState.currentBrush.brush)?.[0]().previous}
        />
      </div>
      <Space amount="16px" />
      <RangeInput
        label={i18n('MediaEditor.Size')}
        min={2}
        max={32}
        value={editorState.currentBrush.size}
        onChange={(size) => {
          editorState.currentBrush.size = size;
          editorState.previewBrushSize = size;
          removeSizePreview();
        }}
        onChangeFinish={() => {
          editorState.previewBrushSize = undefined;
        }}
        passiveLabel
        color={hasColor() ? editorState.currentBrush.color : undefined}
      />
      <Space amount="16px" />
      <div class="media-editor__label">{i18n('MediaEditor.Tool')}</div>
      {brushButton(i18n('MediaEditor.Brushes.Pen'), <PenBrush />, 'pen')}
      {brushButton(i18n('MediaEditor.Brushes.Arrow'), <ArrowBrush />, 'arrow')}
      {brushButton(i18n('MediaEditor.Brushes.Brush'), <MarkerBrush />, 'brush')}
      {brushButton(i18n('MediaEditor.Brushes.Neon'), <NeonBrush />, 'neon')}
      {mediaType === 'image' && brushButton(i18n('MediaEditor.Brushes.Blur'), <BlurBrush />, 'blur')}
      {brushButton(i18n('MediaEditor.Brushes.Eraser'), <EraserBrush />, 'eraser')}
    </>
  );
}
