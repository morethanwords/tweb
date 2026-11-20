import {createSignal, For, onCleanup, onMount} from 'solid-js';
import A11yButton from '@components/a11yButton';
import Modes from '@config/modes';
import {ColorHsla, hexaToHsla, hexToRgb, hslaToRgba, rgbaToHexa} from '@helpers/color';
import createFocusTrap from '@helpers/dom/focusTrap';
import onRangeInlineArrowKey from '@helpers/dom/onRangeInlineArrowKey';
import clamp from '@helpers/number/clamp';
import I18n, {i18n} from '@lib/langPack';

/** ColorEditor::Mode::HSL, not ColorPicker's HSV square. The editor owns no committed colour. */
export default function DesktopColorPicker(props: {
  color: string;
  restoreTo: HTMLElement;
  onDone: (color: string) => void;
  onCancel: () => void;
}) {
  const original = props.color;
  const [color, setColor] = createSignal(original);
  const [hsl, setHsl] = createSignal(hexaToHsla(original));
  const [hexText, setHexText] = createSignal(original.slice(1));
  const rgb = () => hexToRgb(color());
  let dialog: HTMLDivElement;
  let hexInput: HTMLInputElement;
  let plane: HTMLDivElement;
  let dragRect: DOMRect;
  let pointerId: number;
  const fields: HTMLInputElement[] = [];

  const updateColor = (value: string) => {
    setColor(value);
    setHsl(hexaToHsla(value));
    setHexText(value.slice(1));
  };
  const updateHsl = (value: ColorHsla) => {
    // Preserve hue/saturation at black and white, where RGB cannot encode them.
    setHsl(value);
    const hex = rgbaToHexa(hslaToRgba(value.h, value.s, value.l, 1).slice(0, 3) as [number, number, number]);
    setColor(hex);
    setHexText(hex.slice(1));
  };
  const selectPoint = (event: PointerEvent) => {
    const x = clamp((event.clientX - dragRect.left) / dragRect.width, 0, 1);
    const y = clamp((event.clientY - dragRect.top) / dragRect.height, 0, 1);
    updateHsl({...hsl(), h: (I18n.getIsRTL() ? 1 - x : x) * 360, s: (1 - y) * 100});
  };
  const releasePointer = () => {
    if(pointerId !== undefined && plane.hasPointerCapture(pointerId)) plane.releasePointerCapture(pointerId);
    pointerId = undefined;
  };

  onMount(() => {
    const trap = createFocusTrap(dialog);
    trap.activate(props.restoreTo, hexInput);
    if(Modes.a11y) hexInput.select();
    onCleanup(() => trap.deactivate());
  });
  onCleanup(releasePointer);

  const channels = [
    {label: 'H', max: 360, unit: '°', value: () => hsl().h, set: (v: number) => updateHsl({...hsl(), h: v})},
    {label: 'S', max: 100, unit: '%', value: () => hsl().s, set: (v: number) => updateHsl({...hsl(), s: v})},
    {label: 'L', max: 100, unit: '%', value: () => hsl().l, set: (v: number) => updateHsl({...hsl(), l: v})},
    ...['R', 'G', 'B'].map((label, index) => ({
      label, max: 255, unit: '', value: () => rgb()[index],
      set: (v: number) => {
        const values = [...rgb()] as [number, number, number];
        values[index] = v;
        // RGB edits intentionally derive fresh HSL, as in ColorEditor::setRGB.
        updateColor(rgbaToHexa(values));
      }
    }))
  ];

  return <div class="media-editor-desktop__color-overlay" onPointerDown={(event) => {
    if(event.target === event.currentTarget) props.onCancel();
    event.stopPropagation();
  }} onKeyDown={(event) => {
    if(!Modes.a11y) return;
    event.stopPropagation();
    if(event.key === 'Escape') {
      event.preventDefault();
      props.onCancel();
    } else if(event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
      event.preventDefault();
      const index = fields.indexOf(event.target as HTMLInputElement);
      if(index !== -1) {
        (fields[index + 1] || hexInput).focus();
        (fields[index + 1] || hexInput).select();
      }
    }
  }}>
    <div ref={dialog} class="media-editor-desktop__color-dialog" role="dialog" aria-modal="true" aria-label={I18n.format('MediaEditor.CustomColor', true)}>
      <div class="media-editor-desktop__color-editor">
        <div ref={plane} class="media-editor-desktop__color-plane" role="img" aria-label={I18n.format('MediaEditor.CustomColor', true)}
          style={{'--picker-lightness': hsl().l + '%'}}
          onPointerDown={(event) => {
            if(event.button !== 0) return;
            // One read per drag; pointer movement changes colour without layout reads.
            dragRect = plane.getBoundingClientRect();
            pointerId = event.pointerId;
            plane.setPointerCapture(pointerId);
            selectPoint(event);
            event.preventDefault();
          }}
          onPointerMove={(event) => { if(event.pointerId === pointerId) selectPoint(event); }}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
          onLostPointerCapture={() => pointerId = undefined}
        >
          <span class="media-editor-desktop__color-mark" style={{
            'inset-inline-start': hsl().h / 360 * 100 + '%',
            top: 100 - hsl().s + '%',
            'border-color': rgb()[0] * 0.2989 + rgb()[1] * 0.587 + rgb()[2] * 0.114 > 153 ? '#000' : '#fff'
          }} />
        </div>
        <div class="media-editor-desktop__color-values">
          <div class="media-editor-desktop__color-samples">
            <span class="media-editor-desktop__color-sample" style={{'background-color': color()}} aria-hidden="true" />
            <A11yButton class="media-editor-desktop__color-sample" style={{'background-color': original}} aria-label={I18n.format('MediaEditor.Original', true)} onClick={() => updateColor(original)} />
          </div>
          <For each={channels}>{(channel, index) => <label class="media-editor-desktop__color-field" classList={{'media-editor-desktop__color-field--rgb': index() === 3}}>
            <span aria-hidden="true">{channel.label}</span>
            <input ref={(el) => fields[index()] = el} type="number" dir="ltr" min={0} max={channel.max} step={1}
              aria-label={channel.label} tabIndex={Modes.a11y ? undefined : -1} value={Math.round(channel.value())}
              onInput={(event) => {
                const value = clamp(Math.round(event.currentTarget.valueAsNumber || 0), 0, channel.max);
                channel.set(value);
                if(event.currentTarget.value) event.currentTarget.value = String(value);
              }} />
            <span aria-hidden="true">{channel.unit}</span>
          </label>}</For>
          <label class="media-editor-desktop__color-field media-editor-desktop__color-field--hex">
            <span aria-hidden="true">#</span>
            <input ref={hexInput} type="text" dir="ltr" spellcheck={false} maxLength={6} value={hexText()}
              aria-label={I18n.format('Appearance.Color.Hex', true)} tabIndex={Modes.a11y ? undefined : -1}
              aria-invalid={!/^[\da-f]{6}$/i.test(hexText())}
              onInput={(event) => {
                const value = event.currentTarget.value.replace(/[^\da-f]/gi, '').slice(0, 6);
                event.currentTarget.value = value;
                setHexText(value);
                if(value.length === 6) {
                  setColor('#' + value);
                  setHsl(hexaToHsla('#' + value));
                }
              }} />
          </label>
        </div>
        <div class="media-editor-desktop__lightness" style={{background: `linear-gradient(calc(90deg * var(--reflect)), #000, hsl(${hsl().h}, ${hsl().s}%, 50%), #fff)`}}>
          <span class="media-editor-desktop__lightness-mark" style={{'inset-inline-start': hsl().l + '%'}} aria-hidden="true" />
          <input type="range" min={0} max={100} step={100 / 255} value={hsl().l} aria-label="L"
            tabIndex={Modes.a11y ? undefined : -1}
            onKeyDown={(event) => { if(Modes.a11y) onRangeInlineArrowKey(event); }}
            onInput={(event) => updateHsl({...hsl(), l: event.currentTarget.valueAsNumber})} />
        </div>
      </div>
      <div class="media-editor-desktop__color-actions">
        <A11yButton class="media-editor-desktop__color-action" onClick={props.onCancel}>{i18n('Cancel')}</A11yButton>
        <A11yButton class="media-editor-desktop__color-action" onClick={() => props.onDone(color())}>{i18n('Done')}</A11yButton>
      </div>
    </div>
  </div>;
}
