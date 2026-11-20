import {onMount, Accessor, JSX, createEffect, untrack} from 'solid-js';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
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
import {createStoredValue, Optional} from '@components/mediaEditor/createStoredValue';
import {editorFonts, textAlignments, textStyles, textSizeMin, textSizeMax} from '@components/mediaEditor/controlConfig';
import A11yButton from '@components/a11yButton';


export default function TextTab() {
  const {editorState} = useMediaEditorContext();

  const [savedColor, setSavedColor] = createStoredColor('textColor', textLayerInfoDefaults.color);

  const [savedFont, setSavedFont] = createStoredValue<FontKey>({
    key: 'textFont',
    defaultValue: textLayerInfoDefaults.font,
    validate: (value) => value in fontInfoMap ? Optional.value(value as FontKey) : Optional.none()
  });

  const [savedAlignment, setSavedAlignment] = createStoredValue<string>({
    key: 'textAlignment',
    defaultValue: textLayerInfoDefaults.alignment,
    validate: (value) => textAlignments.some(item => item.value === value) ? Optional.value(value) : Optional.none()
  });

  const [savedStyle, setSavedStyle] = createStoredValue<string>({
    key: 'textStyle',
    defaultValue: textLayerInfoDefaults.style,
    validate: (value) => textStyles.some(item => item.value === value) ? Optional.value(value) : Optional.none()
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
    label: LangPackKey,
    currentValue: Accessor<string>,
    setValue: (value: string) => void
  ) => (
    <A11yButton
      class="media-editor__toggle-button"
      classList={{'media-editor__toggle-button--active': value === currentValue()}}
      aria-pressed={value === currentValue()}
      aria-label={I18n.format(label, true)}
      onClick={() => setValue(value)}
    >
      <IconTsx icon={icon} aria-hidden={true} />
    </A11yButton>
  );

  let toggleGroupRow: HTMLDivElement;

  onMount(() => {
    toggleGroupRow.querySelectorAll('.media-editor__toggle-button').forEach((element) => {
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

      <div ref={toggleGroupRow} class="media-editor__toggle-group-row">
        <div
          class="media-editor__toggle-group"
          role="group"
          aria-label={I18n.format('MediaEditor.TextAlignment', true)}
        >
          {textAlignments.map(item => toggleButton(item.icon, item.value, item.label, () => editorState.currentTextLayerInfo.alignment, setSavedAlignment))}
        </div>

        <div
          class="media-editor__toggle-group"
          role="group"
          aria-label={I18n.format('MediaEditor.TextStyle', true)}
        >
          {textStyles.map(item => toggleButton(item.icon, item.value, item.label, () => editorState.currentTextLayerInfo.style, setSavedStyle))}
        </div>
      </div>

      <RangeInput
        label={i18n('MediaEditor.Size')}
        ariaLabel="MediaEditor.Size"
        min={textSizeMin}
        max={textSizeMax}
        value={editorState.currentTextLayerInfo.size}
        onChange={setSavedSize}
        passiveLabel
        color={editorState.currentTextLayerInfo.color}
      />

      <Space amount="16px" />

      <div class="media-editor__label">{i18n('MediaEditor.Font')}</div>

      {editorFonts.map(item => fontButton(i18n(item.label), item.font))}
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
