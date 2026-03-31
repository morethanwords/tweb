import {ArrowBrush, BlurBrush, EraserBrush, MarkerBrush, NeonBrush, PenBrush} from '@components/mediaEditor/brushesSvg';
import ColorPicker from '@components/mediaEditor/colorPicker';
import {BrushType, MediaEditorState, useMediaEditorContext} from '@components/mediaEditor/context';
import {createStoredColor} from '@components/mediaEditor/createStoredColor';
import LargeButton from '@components/mediaEditor/largeButton';
import RangeInput from '@components/mediaEditor/rangeInput';
import Space from '@components/space';
import {i18n} from '@lib/langPack';
import {createEffect, JSX, untrack} from 'solid-js';
import {createStoredValue, Optional} from '../createStoredValue';
import {brushDefaults} from '../utils';

const brushSizeMin = 2;
const brushSizeMax = 32;

export default function BrushTab() {
  const {editorState, mediaType} = useMediaEditorContext();

  const savedBrushColors = {
    pen: createStoredColor(['colorByBrush', 'pen'], '#fe4438'),
    arrow: createStoredColor(['colorByBrush', 'arrow'], '#ffd60a'),
    brush: createStoredColor(['colorByBrush', 'brush'], '#ff8901'),
    neon: createStoredColor(['colorByBrush', 'neon'], '#62e5e0')
  };

  const [savedSize, setSavedSize] = createStoredValue<number>({
    key: 'brushSize',
    defaultValue: brushDefaults.size,
    validate: (value) => {
      const parsed = Number(value);

      if(isNaN(parsed) || parsed < brushSizeMin || parsed > brushSizeMax) {
        return Optional.none();
      }

      return Optional.value(parsed | 0);
    }
  });

  const availableBrushes = ['pen', 'arrow', 'brush', 'neon', 'blur']; // we don't want eraser saved
  const [savedBrush, setSavedBrush] = createStoredValue<BrushType>({
    key: 'brushType',
    defaultValue: brushDefaults.brush,
    validate: (value) => availableBrushes.includes(value) ? Optional.value(value) : Optional.none(),
    skipSaving: (value) => !availableBrushes.includes(value)
  });

  createSyncedBrushProp('size', savedSize);
  createSyncedBrushProp('brush', savedBrush);

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

  const brushButton = (text: JSX.Element, brushSvg: JSX.Element, brush: BrushType) => (
    <LargeButton
      active={editorState.currentBrush.brush === brush}
      onClick={() => void setSavedBrush(brush)}
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
          colorKey={savedBrush()}
          previousColor={savedBrushSignal(editorState.currentBrush.brush)?.[0]().previous}
        />
      </div>
      <Space amount="16px" />
      <RangeInput
        label={i18n('MediaEditor.Size')}
        min={brushSizeMin}
        max={brushSizeMax}
        value={savedSize()}
        onChange={(size) => {
          setSavedSize(size);
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

function createSyncedBrushProp<T extends keyof MediaEditorState['currentBrush']>(key: T, getter: () => MediaEditorState['currentBrush'][T]) {
  const {editorState} = useMediaEditorContext();

  editorState.currentBrush[key] = getter();

  createEffect(() => {
    untrack(() => editorState.currentBrush)[key] = getter();
  });
}
