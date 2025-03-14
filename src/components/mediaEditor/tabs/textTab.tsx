import {onMount, Accessor, JSX, createEffect, untrack} from 'solid-js';

import {i18n} from '../../../lib/langPack';

import ripple from '../../ripple';
import {IconTsx} from '../../iconTsx';
import Space from '../../space';

import {createStoredColor} from '../createStoredColor';
import {useMediaEditorContext} from '../context';
import ColorPicker from '../colorPicker';
import LargeButton from '../largeButton';
import RangeInput from '../rangeInput';
import {fontInfoMap} from '../utils';
import {FontKey} from '../types';

export default function TextTab() {
  const {editorState} = useMediaEditorContext();

  const [savedColor, setSavedColor] = createStoredColor('media-editor-text-color', '#ffffff');

  editorState.currentTextLayerInfo.color = savedColor().value;
  createEffect(() => {
    untrack(() => editorState.currentTextLayerInfo).color = savedColor().value;
  });


  function setSize(value: number) {
    editorState.currentTextLayerInfo.size = value;
  }
  function setAlignment(value: string) {
    editorState.currentTextLayerInfo.alignment = value;
  }
  function setStyle(value: string) {
    editorState.currentTextLayerInfo.style = value;
  }

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
      onClick={() => void (editorState.currentTextLayerInfo.font = textFont)}
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
          {toggleButton('align_left', 'left', () => editorState.currentTextLayerInfo.alignment, setAlignment)}
          {toggleButton('align_center', 'center', () => editorState.currentTextLayerInfo.alignment, setAlignment)}
          {toggleButton('align_right', 'right', () => editorState.currentTextLayerInfo.alignment, setAlignment)}
        </div>

        <div class="media-editor__toggle-group">
          {toggleButton('fontframe', 'normal', () => editorState.currentTextLayerInfo.style, setStyle)}
          {toggleButton('fontframe_outline', 'outline', () => editorState.currentTextLayerInfo.style, setStyle)}
          {toggleButton('fontframe_bg', 'background', () => editorState.currentTextLayerInfo.style, setStyle)}
        </div>
      </div>

      <RangeInput
        label={i18n('MediaEditor.Size')}
        min={16}
        max={64}
        value={editorState.currentTextLayerInfo.size}
        onChange={setSize}
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
