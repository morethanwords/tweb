import {For, Show, createMemo, createSignal, createUniqueId, onCleanup, onMount} from 'solid-js';
import A11yButton from '@components/a11yButton';
import RangeInput from '@components/mediaEditor/rangeInput';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import {generateVideoPreview} from '@components/mediaEditor/finalRender/generateVideoPreview';
import PhotoEyedropper from '@components/mediaEditor/native/photoEyedropper';
import getAndroidGridColor from '@components/mediaEditor/native/androidGridColors';
import Modes from '@config/modes';
import {ColorRgb, computePerceivedBrightness, hexaToRgba, hexToRgb, hsvToRgb, rgbToHsv, rgbaToHexa} from '@helpers/color';
import {attachPickerGrid} from '@helpers/dom/attachListNavigation';
import attachTabList from '@helpers/dom/tabList';
import clamp from '@helpers/number/clamp';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import styles from '@components/mediaEditor/native/androidColorPicker.module.scss';

const gridColors = Array.from({length: 120}, (_, index) => getAndroidGridColor(index));
const tabs = [
  'MediaEditor.Native.PaletteGrid',
  'MediaEditor.Native.PaletteSpectrum',
  'MediaEditor.Native.PaletteSliders'
] as const;
const channels = ['ColorRed', 'ColorGreen', 'ColorBlue'] as const;

/** Android hex input is RGB (opaque) or AARRGGBB, not CSS RRGGBBAA (lines 670–679). */
export function getAndroidHexColor(value: string) {
  const hex = value.replace(/^#/, '');
  if(!/^(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(hex)) return;
  if(hex.length === 8) return '#' + (hex.slice(2) + hex.slice(0, 2)).toLowerCase();
  return rgbaToHexa(hexaToRgba('#' + hex));
}

function Opacity(props: {value: string; onChange: (value: string) => void}) {
  const alpha = () => hexaToRgba(props.value)[3] ?? 255;
  return <div class={styles.opacity}>
    <RangeInput label={i18n('MediaEditor.Opacity' as LangPackKey)} ariaLabel={'MediaEditor.Opacity' as LangPackKey}
      min={0} max={255} value={alpha()}
      style={{'--channel-gradient': `linear-gradient(calc(90deg * var(--reflect)), transparent, ${props.value.slice(0, 7)})`}}
      onChange={(value) => props.onChange(rgbaToHexa([...hexToRgb(props.value), value]))} />
  </div>;
}

function ColorGrid(props: {value: string; onChange: (value: string) => void}) {
  let grid: HTMLDivElement;
  onMount(() => onCleanup(attachPickerGrid(grid, `.${styles.cell}`)));
  return <div ref={grid} class={styles.grid} role="group" aria-label={I18n.format(tabs[0], true)}>
    <For each={gridColors}>{(value) => <A11yButton class={styles.cell}
      aria-label={value} aria-pressed={props.value.toLowerCase() === value}
      style={{'background-color': value, '--selection-color': computePerceivedBrightness(hexToRgb(value)) > .721 ? '#111' : '#fff'}}
      onClick={() => props.onChange(value)} />}</For>
  </div>;
}

/** Literal GradientPickerView hit-test mapping (Android 21f7d109, lines 568–575).
 * Its HSV calculation intentionally differs from its painted .06/.22/.78/.94 stops.
 */
export function getAndroidSpectrumColor(hue: number, tone: number) {
  const saturation = tone <= .22 ? tone / .22 : tone >= .78 ? (1 - tone) / .22 : 1;
  const brightness = tone >= .78 ? (1 - tone) / .22 : 1;
  return rgbaToHexa(hsvToRgb(hue, saturation, brightness));
}

/** Literal native setColor position (lines 580–586), not an inverse of the hit-test mapping.
 * It may lie outside [0, 1]; native clamps only the drawn marker to a 16dp inset.
 */
export function getAndroidSpectrumInitialTone(saturation: number, brightness: number) {
  return 1 + saturation * .5 - (brightness <= .5 ? 1 - (.78 + (1 - brightness) * .22) : 1 - (1 - brightness) * .22);
}

function Spectrum(props: {value: string; onChange: (value: string) => void}) {
  const initialHsv = rgbToHsv(...hexToRgb(props.value));
  const [hue, setHue] = createSignal(initialHsv[0]);
  const [tone, setTone] = createSignal(getAndroidSpectrumInitialTone(initialHsv[1], initialHsv[2]));
  const choose = (x: number, y: number) => {
    setTone(clamp(x, 0, 1));
    setHue(clamp(y, 0, 1) * 360);
    props.onChange(getAndroidSpectrumColor(hue(), tone()));
  };
  let pointer: number;
  let bounds: DOMRect;
  const move = (event: PointerEvent) => {
    if(event.pointerId !== pointer) return;
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    choose(I18n.getIsRTL() ? 1 - x : x, (event.clientY - bounds.top) / bounds.height);
  };
  return <>
    <div class={styles.spectrum} aria-hidden="true"
      onPointerDown={(event) => {
        bounds = event.currentTarget.getBoundingClientRect();
        pointer = event.pointerId;
        event.currentTarget.setPointerCapture(pointer);
        move(event);
      }} onPointerMove={move}
      onPointerUp={(event) => {
        if(event.pointerId !== pointer || !event.currentTarget.hasPointerCapture(pointer)) return;
        move(event);
        event.currentTarget.releasePointerCapture(pointer);
        pointer = undefined;
      }}
      onPointerCancel={(event) => {
        if(event.pointerId !== pointer) return;
        if(event.currentTarget.hasPointerCapture(pointer)) event.currentTarget.releasePointerCapture(pointer);
        pointer = undefined;
      }}
      onLostPointerCapture={() => { pointer = undefined; }}>
      <span class={styles.knob} style={{'inset-inline-start': `clamp(16px, ${tone() * 100}%, calc(100% - 16px))`, top: `clamp(16px, ${hue() / 3.6}%, calc(100% - 16px))`, 'background-color': props.value}} />
    </div>
    <Show when={Modes.a11y}>
      <div class={styles.spectrumRanges}>
        <RangeInput label={i18n('MediaEditor.Native.PaletteHue' as LangPackKey)} ariaLabel={'MediaEditor.Native.PaletteHue' as LangPackKey}
          min={0} max={360} value={Math.round(hue())} onChange={(value) => choose(tone(), value / 360)} />
        <RangeInput label={i18n('MediaEditor.Native.PaletteTone' as LangPackKey)} ariaLabel={'MediaEditor.Native.PaletteTone' as LangPackKey}
          min={0} max={100} value={Math.round(tone() * 100)} onChange={(value) => choose(value / 100, hue() / 360)} />
      </div>
    </Show>
  </>;
}

function ColorSliders(props: {value: string; onChange: (value: string) => void}) {
  const rgb = createMemo(() => hexToRgb(props.value));
  const [hexDraft, setHexDraft] = createSignal<string>();
  const setChannel = (index: number, value: number) => {
    const next = hexaToRgba(props.value);
    next[index] = clamp(Math.round(value), 0, 255);
    props.onChange(rgbaToHexa(next));
  };
  return <div class={styles.sliders}>
    <For each={channels}>{(label, index) => <div class={styles.channel}>
      <RangeInput label={i18n(label)} ariaLabel={label} min={0} max={255} value={rgb()[index()]}
        style={{'--channel-gradient': `linear-gradient(calc(90deg * var(--reflect)), ${rgbaToHexa(rgb().map((v, i) => i === index() ? 0 : v) as ColorRgb)}, ${rgbaToHexa(rgb().map((v, i) => i === index() ? 255 : v) as ColorRgb)})`}}
        onChange={(value) => setChannel(index(), value)} />
      <input class={styles.number} type="number" min="0" max="255" step="1" dir="ltr" aria-label={`${I18n.format(label, true)} ${I18n.format('Appearance.Color.RGB', true)}`}
        value={rgb()[index()]} onInput={(event) => {
          if(Number.isFinite(event.currentTarget.valueAsNumber)) setChannel(index(), event.currentTarget.valueAsNumber);
        }} onBlur={(event) => {
          const input = event.currentTarget;
          // Native :798–801 commits an empty draft as 0 only on focus loss.
          // A browser's incomplete number (e.g. "1e") is not an empty draft.
          if(!input.value && !input.validity.badInput) setChannel(index(), 0);
          input.value = String(rgb()[index()]);
        }} />
    </div>}</For>
    <label class={styles.hex}>
      {i18n('Appearance.Color.Hex')}
      <input class={styles.hexInput} type="text" dir="ltr" spellcheck={false} autocapitalize="characters" maxlength="9"
        value={hexDraft() ?? props.value.slice(1, 7).toUpperCase()}
        aria-invalid={hexDraft() !== undefined && !getAndroidHexColor(hexDraft())}
        onInput={(event) => {
          const value = event.currentTarget.value;
          setHexDraft(value);
          const color = getAndroidHexColor(value);
          if(color) props.onChange(color);
        }} onBlur={() => setHexDraft(undefined)} />
    </label>
  </div>;
}

/** Android Paint's three-page bottom sheet. Color changes are kept on dismissal, including Escape. */
export default function AndroidColorPicker(props: {value: string; onChange: (value: string) => void; onDone: () => void}) {
  const context = useMediaEditorContext();
  const session = context && getManagersSession(context.managers);
  const [sampling, setSampling] = createSignal(false);
  const snapshot = withCurrentOwner(() => generateVideoPreview({scaledWidth: context.mediaState.currentImageRatio, scaledHeight: 1}));
  const canSample = () => context?.mediaType === 'image' && context.editorState.isReady && !context.editorState.isMoving;
  const [tab, setTab] = createSignal(0);
  const id = createUniqueId();
  let tabList: HTMLDivElement;
  onMount(() => onCleanup(attachTabList(tabList)));
  return <Show when={!sampling()} fallback={<PhotoEyedropper snapshot={snapshot}
    isValid={() => !isSessionLeaving(session)} onCancel={props.onDone}
    onSelect={color => { props.onChange(color); props.onDone(); }} />}><div class={styles.picker}>
    <div id={`${id}-panel`} class={styles.page} role="tabpanel" aria-labelledby={`${id}-tab-${tab()}`}>
      <Show when={tab() === 0}><ColorGrid value={props.value} onChange={props.onChange} /></Show>
      <Show when={tab() === 1}><Spectrum value={props.value} onChange={props.onChange} /></Show>
      <Show when={tab() === 2}><ColorSliders value={props.value} onChange={props.onChange} /></Show>
    </div>
    <Opacity value={props.value} onChange={props.onChange} />
    <div class={styles.footer}>
      <Show when={context?.mediaType === 'image'} fallback={<span class={styles.selected} style={{'background-color': props.value}} title={props.value} aria-hidden="true" />}>
        <A11yButton class={styles.pipette} disabled={!canSample()} aria-label={I18n.format('MediaEditor.Eyedropper' as LangPackKey, true)}
          onClick={() => { if(canSample() && !isSessionLeaving(session)) setSampling(true); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="m14 5 5 5M4 20l1-5L16 4a2.8 2.8 0 0 1 4 4L9 19l-5 1Z" />
          </svg>
        </A11yButton>
      </Show>
      <div ref={tabList} class={styles.tabs} role="tablist" aria-label={I18n.format('MediaEditor.CustomColor', true)}>
        <For each={tabs}>{(label, index) => <A11yButton id={`${id}-tab-${index()}`} class={styles.tab} classList={{active: tab() === index()}}
          role="tab" aria-controls={`${id}-panel`} aria-selected={tab() === index()} onClick={() => setTab(index())}>{i18n(label)}</A11yButton>}</For>
      </div>
      <A11yButton class={styles.done} aria-label={I18n.format('Done', true)} onClick={props.onDone}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      </A11yButton>
    </div>
  </div></Show>;
}
