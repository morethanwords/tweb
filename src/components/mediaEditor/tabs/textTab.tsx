import {onMount, Accessor, JSX, useContext, createEffect} from 'solid-js';

import {i18n} from '../../../lib/langPack';

import ripple from '../../ripple';
import {IconTsx} from '../../iconTsx';
import Space from '../../space';

import ColorPicker from '../colorPicker';
import RangeInput from '../rangeInput';
import LargeButton from '../largeButton';
import MediaEditorContext from '../context';
import {createStoredColor} from '../createStoredColor';
import {fontInfoMap} from '../utils';
import {FontKey} from '../types';

export default function TextTab() {
  const context = useContext(MediaEditorContext);
  const [layerInfo, setLayerInfo] = context.currentTextLayerInfo;

  const [savedColor, setSavedColor] = createStoredColor('media-editor-text-color', '#ffffff');

  setLayerInfo((prev) => ({...prev, color: savedColor().value}));
  createEffect(() => {
    setLayerInfo((prev) => ({...prev, color: savedColor().value}));
  });

  function setSize(value: number) {
    setLayerInfo((prev) => ({...prev, size: value}));
  }
  function setAlignment(value: string) {
    setLayerInfo((prev) => ({...prev, alignment: value}));
  }
  function setStyle(value: string) {
    setLayerInfo((prev) => ({...prev, style: value}));
  }
  function setFont(value: FontKey) {
    setLayerInfo((prev) => ({...prev, font: value}));
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
      active={layerInfo()?.font === textFont}
      onClick={() => setFont(textFont)}
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
        value={layerInfo()?.color}
        onChange={setSavedColor}
        previousColor={savedColor().previous}
        colorKey={context.selectedResizableLayer[0]() + ''}
      />

      <div class="media-editor__toggle-group-row">
        <div class="media-editor__toggle-group">
          {toggleButton('align_left', 'left', () => layerInfo()?.alignment, setAlignment)}
          {toggleButton('align_center', 'center', () => layerInfo()?.alignment, setAlignment)}
          {toggleButton('align_right', 'right', () => layerInfo()?.alignment, setAlignment)}
        </div>

        <div class="media-editor__toggle-group">
          {toggleButton('fontframe', 'normal', () => layerInfo()?.style, setStyle)}
          {toggleButton('fontframe_outline', 'outline', () => layerInfo()?.style, setStyle)}
          {toggleButton('fontframe_bg', 'background', () => layerInfo()?.style, setStyle)}
        </div>
      </div>

      <RangeInput
        label={i18n('MediaEditor.Size')}
        min={16}
        max={64}
        value={layerInfo()?.size}
        onChange={setSize}
        passiveLabel
        color={layerInfo()?.color}
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
