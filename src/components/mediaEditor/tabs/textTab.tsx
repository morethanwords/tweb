import {onMount, Accessor, JSX, createEffect, untrack} from 'solid-js';
import {i18n} from '@lib/langPack';
import ripple from '@components/ripple';
import {IconTsx} from '@components/iconTsx';
import Space from '@components/space';
import {createStoredColor} from '@components/mediaEditor/createStoredColor';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import ColorPicker from '@components/mediaEditor/colorPicker';
import LargeButton from '@components/mediaEditor/largeButton';
import RangeInput from '@components/mediaEditor/rangeInput';
import {fontInfoMap, textLayerInfoDefaults} from '@components/mediaEditor/utils';
import {FontKey, TextLayerInfo} from '@components/mediaEditor/types';
import {createStoredValue, Optional} from '../createStoredValue';


const textSizeMin = 16;
const textSizeMax = 64;

export default function TextTab() {
  const {editorState} = useMediaEditorContext();

  const [savedColor, setSavedColor] = createStoredColor('textColor', textLayerInfoDefaults.color);

  const [savedFont, setSavedFont] = createStoredValue<FontKey>({
    key: 'textFont',
    defaultValue: textLayerInfoDefaults.font,
    validate: (value) => value in fontInfoMap ? Optional.value(value as FontKey) : Optional.none()
  });

  const availableAlignments = ['left', 'center', 'right'];
  const [savedAlignment, setSavedAlignment] = createStoredValue<string>({
    key: 'textAlignment',
    defaultValue: textLayerInfoDefaults.alignment,
    validate: (value) => availableAlignments.includes(value) ? Optional.value(value) : Optional.none()
  });

  const availableStyles = ['normal', 'outline', 'background'];
  const [savedStyle, setSavedStyle] = createStoredValue<string>({
    key: 'textStyle',
    defaultValue: textLayerInfoDefaults.style,
    validate: (value) => availableStyles.includes(value) ? Optional.value(value) : Optional.none()
  });

  const [savedSize, setSavedSize] = createStoredValue<number>({
    key: 'textSize',
    defaultValue: textLayerInfoDefaults.size,
    validate: (value) => {
      const parsed = Number(value);

      if(isNaN(parsed) || parsed < textSizeMin || parsed > textSizeMax) {
        return Optional.none();
      }

      return Optional.value(parsed | 0);
    }
  });

  createSyncedLayerInfoProp('color', () => savedColor().value);
  createSyncedLayerInfoProp('font', savedFont);
  createSyncedLayerInfoProp('alignment', savedAlignment);
  createSyncedLayerInfoProp('style', savedStyle);
  createSyncedLayerInfoProp('size', savedSize);

  const toggleButton = (
    icon: Icon,
    value: string,
    currentValue: Accessor<string>,
    setValue: (value: string) => void
  ) => (
    <div
      class="media-editor__toggle-button"
      classList={{'media-editor__toggle-button--active': value === currentValue()}}
      onClick={() => setValue(value)}
    >
      <IconTsx icon={icon} />
    </div>
  );

  onMount(() => {
    document.querySelectorAll('.media-editor__toggle-button').forEach((element) => {
      ripple(element as HTMLElement);
    });
  });

  const fontButton = (text: JSX.Element, textFont: FontKey) => (
    <LargeButton
      active={editorState.currentTextLayerInfo.font === textFont}
      onClick={() => void setSavedFont(textFont)}
      style={{
        'font-family': fontInfoMap[textFont].fontFamily,
        'font-weight': fontInfoMap[textFont].fontWeight
      }}
    >
      {text}
    </LargeButton>
  );

  return (
    <>
      <ColorPicker
        value={editorState.currentTextLayerInfo.color}
        onChange={setSavedColor}
        previousColor={savedColor().previous}
        colorKey={(editorState.selectedResizableLayer ?? '') + ''}
      />

      <div class="media-editor__toggle-group-row">
        <div class="media-editor__toggle-group">
          {toggleButton('align_left', 'left', () => editorState.currentTextLayerInfo.alignment, setSavedAlignment)}
          {toggleButton('align_center', 'center', () => editorState.currentTextLayerInfo.alignment, setSavedAlignment)}
          {toggleButton('align_right', 'right', () => editorState.currentTextLayerInfo.alignment, setSavedAlignment)}
        </div>

        <div class="media-editor__toggle-group">
          {toggleButton('fontframe', 'normal', () => editorState.currentTextLayerInfo.style, setSavedStyle)}
          {toggleButton('fontframe_outline', 'outline', () => editorState.currentTextLayerInfo.style, setSavedStyle)}
          {toggleButton('fontframe_bg', 'background', () => editorState.currentTextLayerInfo.style, setSavedStyle)}
        </div>
      </div>

      <RangeInput
        label={i18n('MediaEditor.Size')}
        min={textSizeMin}
        max={textSizeMax}
        value={editorState.currentTextLayerInfo.size}
        onChange={setSavedSize}
        passiveLabel
        color={editorState.currentTextLayerInfo.color}
      />

      <Space amount="16px" />

      <div class="media-editor__label">{i18n('MediaEditor.Font')}</div>

      {fontButton(i18n('MediaEditor.Fonts.Roboto'), 'roboto')}
      {fontButton(i18n('MediaEditor.Fonts.SuezOne'), 'suez')}
      {fontButton(i18n('MediaEditor.Fonts.FugazOne'), 'fugaz')}
      {fontButton(i18n('MediaEditor.Fonts.CourierPrime'), 'courier')}
      {fontButton(i18n('MediaEditor.Fonts.Chewy'), 'chewy')}
      {fontButton(i18n('MediaEditor.Fonts.Sedan'), 'sedan')}
      {fontButton(i18n('MediaEditor.Fonts.RubikBubbles'), 'bubbles')}
      {fontButton(i18n('MediaEditor.Fonts.Playwrite'), 'playwrite')}
    </>
  );
}

function createSyncedLayerInfoProp<T extends keyof TextLayerInfo>(key: T, getter: () => TextLayerInfo[T]) {
  const {editorState} = useMediaEditorContext();

  editorState.currentTextLayerInfo[key] = getter();

  createEffect(() => {
    untrack(() => editorState.currentTextLayerInfo)[key] = getter();
  });
}
