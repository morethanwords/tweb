import {createEffect, createMemo, createSignal, For, on, onCleanup, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import {unwrap} from 'solid-js/store';
import A11yButton from '@components/a11yButton';
import {CurveChannel, defaultCurveLevels, defaultSelectiveBlur, interpolateNativeCurve, NativeAdjustments} from '@components/mediaEditor/adjustments';
import useNormalizePoint from '@components/mediaEditor/canvas/useNormalizePoint';
import useProcessPoint from '@components/mediaEditor/canvas/useProcessPoint';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import RangeInput from '@components/mediaEditor/rangeInput';
import androidAdjustmentTransaction from '@components/mediaEditor/native/androidAdjustmentTransaction';
import {createNativeCurvePlot} from '@components/mediaEditor/native/curveInterpolation';
import type {AndroidAdjustmentMode} from '@components/mediaEditor/types';
import Modes from '@config/modes';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import styles from '@components/mediaEditor/nativeAdjustmentModes.module.scss';

const key = (name: string): LangPackKey => name === 'BlurOff' ? 'Off' : name === 'Shadows' ? 'MediaEditor.Adjustments.Shadows' : name === 'Highlights' ? 'MediaEditor.Adjustments.Highlights' : ('MediaEditor.Native.' + name) as LangPackKey;
const label = (name: string) => i18n(key(name));
const channels: CurveChannel[] = ['rgb', 'red', 'green', 'blue'];
const tones = ['Blacks', 'Shadows', 'Midtones', 'Highlights', 'Whites'];
// Zero means no tint, not black.
const shadowTintColors = [0, 0xffff4d4d, 0xfff48022, 0xffffcd00, 0xff81d281, 0xff71c5d6, 0xff0072bc, 0xff662d91];
const highlightTintColors = [0, 0xffef9286, 0xffeacea2, 0xfff2e17c, 0xffa4edae, 0xff89dce5, 0xff2e8bc8, 0xffcd98e5];
const channelColors = ['#ffffff', '#e64d4d', '#5abb5f', '#3dadee'];
const curveColors = ['#ffffff', '#ed3d4c', '#10ee9d', '#3377fb'];
// Unmodified drawable-mdpi/msg_blur_*.webp from Telegram Android. Kept here
// because these three tiny native bitmaps are not in the shared asset set.
const blurIcons = {
  off: 'UklGRioAAABXRUJQVlA4TB4AAAAvF8AFEIXatm0Y//+015I6Rsz/BECnLHT9MwtdTQI=',
  radial: 'UklGRqwAAABXRUJQVlA4TKAAAAAvF8AFEFU4bttIklKe/D+a2e27E7Bdcz3caAIgzU7CLItBdtHDHEZYGHJ4caHAbRulPYbxK57PLQKgYECwFQswgQLpCNIQ0JCAgHABLgUS6GEHw+ttCHjQoAL+GV3VngsctdJAkG89ggMBAdoZ5AnTTjAB/uXCly25ysDAtOJqhmplw0IA09im1rG+WX+yLmg9nsvxX87Xcn6X62G9fi7R',
  linear: 'UklGRkwAAABXRUJQVlA4TD8AAAAvF8AFEIXitpGU6b/pZTx4RxBk2wzoRPM83xS5bcJ0Ald+AW4i1eAAU5Jk1xRFAjoduDuN1ke+/P98798vIgAA'
};

export default function NativeAdjustmentModes(props: {mode: AndroidAdjustmentMode}) {
  const context = useMediaEditorContext();
  const {mediaState, editorState, mediaType} = context;
  const adjustmentEdit = androidAdjustmentTransaction(context);
  const [channel, setChannel] = createSignal<CurveChannel>('rgb');
  const [accessControls, setAccessControls] = createSignal(false);
  const native = () => mediaState.adjustments.native || {};
  const blur = () => native().blur || defaultSelectiveBlur;
  const levels = () => native().curves?.[channel()] || defaultCurveLevels;
  function begin() {
    adjustmentEdit.begin();
  }
  function finish() {
    adjustmentEdit.finish();
  }
  function update(value: NativeAdjustments) {
    adjustmentEdit.change(draft => { draft.native = structuredClone(unwrap(value)); });
  }
  function changeBlur(value: Partial<NonNullable<NativeAdjustments['blur']>>) {
    const next = {...blur(), ...value};
    if(value.size !== undefined) next.size = Math.max(next.falloff + 0.02, Math.min(1, next.size));
    if(value.falloff !== undefined) next.falloff = Math.max(0.1, Math.min(next.size - 0.02, next.falloff));
    if(value.angle !== undefined) next.angle = (next.angle % Math.PI + Math.PI) % Math.PI;
    update({...native(), blur: next});
  }
  const nativeBlurRanges = () => mediaState.adjustments.processingVersion === 'android-photo-v1';
  // Native pinch bounds apply to the inner radius (.1) and feather width (.02),
  // not the old controls' feather minimum (.1) / outer maximum (1).
  // Bounds use the same integer display rounding as the range's current value:
  // a fractional pinch endpoint must remain representable without an input event.
  // A versioned document may also contain an older one-finger adjustment with
  // a smaller inner radius. Represent it as-is; opening Settings is not a repair.
  const blurRangeInnerMin = () => Math.min(0.1, blur().size - blur().falloff);
  const blurSizeMin = () => nativeBlurRanges() ? Math.round((blur().falloff + blurRangeInnerMin()) * 100) : Math.ceil((blur().falloff + 0.02) * 100 - 1e-8);
  const blurSizeMax = () => nativeBlurRanges() ? Math.max(100, Math.round(blur().size * 100) + 1, blurSizeMin()) : 100;
  const blurFeatherMin = () => nativeBlurRanges() ? 2 : 10;
  const blurFeatherMax = () => nativeBlurRanges() ? Math.round((blur().size - blurRangeInnerMin()) * 100) : Math.floor((blur().size - 0.02) * 100 + 1e-8);
  function changeBlurRange(field: 'size' | 'falloff', value: number) {
    if(!nativeBlurRanges()) { changeBlur({[field]: value / 100}); return; }
    // Do not quantize a fractional pinch value when its displayed value did not
    // change. Only an actual range edit starts a transaction.
    if(value === Math.round(blur()[field] * 100)) return;
    const next = field === 'size' ? Math.max(blur().falloff + blurRangeInnerMin(), value / 100) :
      Math.max(0.02, Math.min(blur().size - blurRangeInnerMin(), value / 100));
    update({...native(), blur: {...blur(), [field]: next}});
  }
  function changeLevel(index: number, value: number) {
    const values = [...levels()] as typeof defaultCurveLevels;
    values[index] = Math.max(0, Math.min(100, value));
    update({...native(), curves: {...native().curves, [channel()]: values}});
  }

  const graph = createMemo(() => mediaState.adjustments.processingVersion === 'android-photo-v1' ?
    createNativeCurvePlot(levels()).map(([x, y]) => `${x * 100},${100 - y * 100}`).join(' ') :
    Array.from({length: 101}, (_, i) => `${i},${100 - interpolateNativeCurve(levels(), i / 100) * 100}`).join(' '));

  const normalize = useNormalizePoint();
  const process = useProcessPoint(false);
  const centerPosition = createMemo(() => {
    if(!editorState.mediaSize || !editorState.canvasSize) return [0, 0];
    const center = blur().center;
    return process(editorState.mediaSize.map((size, i) => (center[i] - 0.5) * size * editorState.finalTransform.flip[i]) as [number, number]);
  });
  // Android's graph occupies the displayed photograph, not the tools panel.
  // Curves are a physical LTR chart even when the surrounding controls mirror.
  const photoArea = createMemo(() => {
    if(!editorState.mediaSize || !editorState.canvasSize) return {left: 0, top: 0, width: 0, height: 0};
    const [w, h] = editorState.mediaSize;
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(point => process(point as [number, number]));
    const xs = corners.map(point => point[0]), ys = corners.map(point => point[1]);
    const left = Math.max(0, Math.min(...xs)), top = Math.max(0, Math.min(...ys));
    return {left, top, width: Math.max(0, Math.min(editorState.canvasSize[0], Math.max(...xs)) - left), height: Math.max(0, Math.min(editorState.canvasSize[1], Math.max(...ys)) - top),
      clip: `polygon(${corners.map(([x, y]) => `${x - left}px ${y - top}px`).join(',')})`,
      canvasClip: `polygon(${corners.map(([x, y]) => `${x}px ${y}px`).join(',')})`};
  });
  // The shader scales texture Y by height/width: both radii are in image widths.
  const blurSide = () => editorState.mediaSize[0] * editorState.finalTransform.scale / editorState.pixelRatio;
  const guideAngle = () => Math.atan2(Math.sin(blur().angle) * editorState.finalTransform.flip[1], Math.cos(blur().angle) * editorState.finalTransform.flip[0]) + editorState.finalTransform.rotation;
  let dragBounds: DOMRect;
  let dragId: number;
  let dragElement: SVGSVGElement | HTMLDivElement;
  let dragControl: 'center' | 'size' | 'falloff' | 'angle';
  let radiusOffset = 0;
  let angleOffset = 0;
  let centerOffset: [number, number] = [0, 0];
  const blurPointers = new Map<number, [number, number]>();
  let pinchDistance: number;
  function endDrag(event?: PointerEvent) {
    if(event && event.pointerId !== dragId && !blurPointers.has(event.pointerId)) return;
    const element = dragElement, id = dragId;
    const pointerIds = [...blurPointers.keys()];
    blurPointers.clear();
    pinchDistance = undefined;
    dragId = undefined;
    dragElement = undefined;
    if(element) {
      element.onpointermove = element.onpointerup = element.onpointercancel = null;
      if(id !== undefined && element.hasPointerCapture(id)) element.releasePointerCapture(id);
      for(const pointerId of pointerIds) {
        if(element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      }
    }
    finish();
  }
  onCleanup(() => endDrag());
  // Normalize/process intentionally omit flips; the shader applies them before rotation.
  const blurPoint = (event: PointerEvent) => normalize([event.clientX - dragBounds.left, event.clientY - dragBounds.top])
    .map((value, i) => value * editorState.finalTransform.flip[i]) as [number, number];
  const blurDelta = (event: PointerEvent) => blurPoint(event).map((value, i) =>
    value - (blur().center[i] - 0.5) * editorState.mediaSize[i]) as [number, number];
  const blurDistance = ([dx, dy]: [number, number]) => (blur().mode === 'radial' ? Math.hypot(dx, dy) : Math.abs(dx * Math.cos(blur().angle) + dy * Math.sin(blur().angle))) / editorState.mediaSize[0];
  createEffect(on(() => props.mode, () => {
    endDrag();
    setAccessControls(false);
    if(props.mode === 'curves') setChannel('rgb');
  }, {defer: true}));
  const moveCenter = (event: PointerEvent) => {
    if(dragId !== event.pointerId) return;
    if(dragControl !== 'center') {
      const delta = blurDelta(event);
      const distance = blurDistance(delta);
      if(dragControl === 'angle') changeBlur({angle: Math.atan2(delta[1], delta[0]) - angleOffset});
      else if(dragControl === 'falloff') changeBlur({falloff: blur().size - distance + radiusOffset});
      else changeBlur({size: distance - radiusOffset});
      return;
    }
    const point = blurPoint(event);
    const center = point.map((value, i) => Math.max(0, Math.min(1,
      value / editorState.mediaSize[i] + 0.5 - centerOffset[i]))) as [number, number];
    changeBlur({center});
  };

  const blurPointerDistance = () => {
    const [a, b] = [...blurPointers.values()];
    const f = Math.fround;
    const dx = f(a[0] - b[0]), dy = f(a[1] - b[1]);
    return f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
  };
  function moveBlur(event: PointerEvent) {
    if(!blurPointers.has(event.pointerId)) return;
    blurPointers.set(event.pointerId, [event.clientX, event.clientY]);
    if(pinchDistance === undefined) {
      moveCenter(event);
      return;
    }
    // Telegram-Android 21f7d109da6ab3506c9e9577f98c6a38771ab335,
    // PhotoFilterBlurControl.java:99–107,404–427. CSS pixels are dp, not
    // canvas backing pixels: do not divide by the editor's pixelRatio.
    const f = Math.fround;
    const distance = blurPointerDistance();
    const scale = f(1 + f(f(distance - pinchDistance) * f(0.01)));
    pinchDistance = distance;
    if(scale === 1) return;
    // Android falloff is INNER radius; our persisted falloff is feather width.
    // Convert only here. No upper size limit exists in the native pinch.
    const inner = Math.max(f(0.1), f(f(blur().size - blur().falloff) * scale));
    const size = Math.max(f(inner + f(0.02)), f(f(blur().size) * scale));
    update({...native(), blur: {...blur(), size, falloff: size - inner}});
  }

  function range(name: string, value: () => number, min: number | (() => number), max: number | (() => number), change: (value: number) => void) {
    return <RangeInput label={label(name)} ariaLabel={key(name)} value={value()} min={typeof min === 'function' ? min() : min} max={typeof max === 'function' ? max() : max}
      onChange={change} onChangeFinish={finish} />;
  }

  return <div class={styles.controls}>
    <Show when={props.mode === 'settings'}>
      <For each={['tintShadows', 'tintHighlights'] as const}>{field => <div class={styles.tintRow}>
        <div class={styles.tintLabel}>{label(field === 'tintShadows' ? 'TintShadows' : 'TintHighlights')}</div>
        <div class={styles.palette} role="group" aria-label={I18n.format(key(field === 'tintShadows' ? 'TintShadows' : 'TintHighlights'), true)}>
          <For each={field === 'tintShadows' ? shadowTintColors : highlightTintColors}>{color => <A11yButton class={styles.swatch}
            style={{'--tint': color ? '#' + (color & 0xffffff).toString(16).padStart(6, '0') : '#ffffff'}}
            aria-label={color ? '#' + (color & 0xffffff).toString(16).padStart(6, '0') : I18n.format(key('BlurOff'), true)}
            aria-pressed={(native()[field] || 0) === color}
            onClick={() => { update({...native(), [field]: color}); finish(); }}>
            <span class={styles.radio} aria-hidden="true" />
          </A11yButton>}</For>
        </div>
      </div>}</For>
    </Show>
    <Show when={props.mode === 'curves'}>
      <div class={styles.channels} role="group" aria-label={I18n.format(key('Curves'), true)}>
        <For each={channels}>{(value, index) => <A11yButton class={styles.channel} style={{'--tint': channelColors[index()]}} aria-pressed={channel() === value}
          onClick={() => { endDrag(); setChannel(value); }}><span class={styles.radio} aria-hidden="true" /><span>{value === 'rgb' ? label('RGB') : i18n(value === 'red' ? 'ColorRed' : value === 'green' ? 'ColorGreen' : 'ColorBlue')}</span></A11yButton>}</For>
      </div>
      <Show when={editorState.imageCanvas?.parentElement}>
        <Portal mount={editorState.imageCanvas?.parentElement}>
      <svg class={styles.graph} style={{left: photoArea().left + 'px', top: photoArea().top + 'px', width: photoArea().width + 'px', height: photoArea().height + 'px', 'clip-path': photoArea().clip, '--curve': curveColors[channels.indexOf(channel())]}} aria-hidden="true"
        onLostPointerCapture={endDrag}
        onPointerDown={event => {
          if(event.button !== 0) return;
          if(dragId !== undefined) {
            // Android 21f7d109 PhotoFilterCurvesControl.java:117–122:
            // a second pointer ends the original pan, retaining changed levels.
            if(event.pointerId !== dragId) endDrag();
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          const index = Math.min(4, Math.max(0, Math.floor((event.clientX - bounds.left) / bounds.width * 5)));
          let lastY = event.clientY;
          const element = event.currentTarget;
          dragElement = element;
          dragId = event.pointerId;
          begin();
          event.stopPropagation();
          element.setPointerCapture(event.pointerId);
          element.onpointermove = e => {
            if(e.pointerId !== dragId) return;
            // Android caps upward motion only (PhotoFilterCurvesControl:158).
            changeLevel(index, levels()[index] + Math.min(2, (lastY - e.clientY) / 8));
            lastY = e.clientY;
          };
          element.onpointerup = element.onpointercancel = endDrag;
        }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M20 0V100 M40 0V100 M60 0V100 M80 0V100" class={styles.grid} vector-effect="non-scaling-stroke" />
          <path d="M0 100L100 0" class={styles.diagonal} vector-effect="non-scaling-stroke" />
          <polyline points={graph()} class={styles.curve} />
        </svg>
        <For each={tones}>{(_, index) => <text x={(index() * 20 + 10) + '%'} y={photoArea().height - 4} text-anchor="middle" class={styles.graphValue}>{(levels()[index()] / 100).toFixed(2)}</text>}</For>
      </svg>
        </Portal>
      </Show>
    </Show>
    <Show when={props.mode === 'blur'}>
      <div class={styles.blurModes}>
        <For each={['off', 'radial', 'linear'] as const}>{mode => <A11yButton class={styles.option}
          aria-pressed={blur().mode === mode} onClick={() => { endDrag(); changeBlur({mode}); finish(); }}>
          <span class={styles.blurIcon} style={{'mask-image': `url(data:image/webp;base64,${blurIcons[mode]})`}} aria-hidden="true" />
          <span>{label(mode === 'off' ? 'BlurOff' : mode === 'radial' ? 'BlurRadial' : 'BlurLinear')}</span>
        </A11yButton>}</For>
      </div>
      <Show when={blur().mode !== 'off'}>
        <Show when={editorState.imageCanvas?.parentElement}>
          <Portal mount={editorState.imageCanvas?.parentElement}>
             <div class={styles.blurGesture} dir="ltr" style={{bottom: mediaType === 'video' ? '56px' : '0', 'clip-path': photoArea().canvasClip}}
              aria-hidden="true" onPointerDown={event => {
                 if(event.button !== 0 || blurPointers.has(event.pointerId)) return;
                 blurPointers.set(event.pointerId, [event.clientX, event.clientY]);
                 if(blurPointers.size > 1) {
                   // PhotoFilterBlurControl.java:161–193: two pointers replace
                   // the pan with a pinch; any up/cancel ends it (no one-finger
                   // continuation). Keep one transaction across that handoff.
                   if(blurPointers.size !== 2) { endDrag(); return; }
                   dragElement = event.currentTarget;
                   begin();
                   for(const id of blurPointers.keys()) event.currentTarget.setPointerCapture(id);
                   pinchDistance = blurPointerDistance();
                   event.stopPropagation();
                   return;
                 }
                dragBounds = editorState.imageCanvas.getBoundingClientRect();
                 const delta = blurDelta(event);
                 const distance = blurDistance(delta);
                 const side = blurSide();
                  dragControl = Math.hypot(...delta) / editorState.mediaSize[0] * side < 30 ? 'center' : Math.abs(distance - (blur().size - blur().falloff)) * side < 30 ? 'falloff' : Math.abs(distance - blur().size) * side < 30 ? 'size' : blur().mode === 'linear' ? 'angle' : undefined;
                  // Android 21f7d109 PhotoFilterBlurControl.java:147–154: radial
                  // background is not a pan target. Keep existing ring units/hit bands.
                  if(!dragControl) return;
                 radiusOffset = distance - (dragControl === 'falloff' ? blur().size - blur().falloff : blur().size);
                 angleOffset = Math.atan2(delta[1], delta[0]) - blur().angle;
                 const point = blurPoint(event);
                 centerOffset = point.map((value, i) => value / editorState.mediaSize[i] + 0.5 - blur().center[i]) as [number, number];
                 dragId = event.pointerId;
                 dragElement = event.currentTarget;
                begin();
                event.currentTarget.setPointerCapture(event.pointerId);
                event.stopPropagation();
               }} onPointerMove={moveBlur}
               onPointerUp={endDrag}
               onPointerCancel={endDrag}
               onLostPointerCapture={endDrag}>
                <svg class={styles.blurGuides} width="100%" height="100%">
                  <g transform={`translate(${centerPosition()[0]} ${centerPosition()[1]}) rotate(${blur().mode === 'linear' ? guideAngle() * 180 / Math.PI - 90 : 0})`}>
                    <For each={['falloff', 'size'] as const}>{field => {
                      const radius = () => (field === 'falloff' ? blur().size - blur().falloff : blur().size) * blurSide();
                      return <Show when={blur().mode === 'radial'} fallback={<path d={`M-2000 ${radius()}H2000 M-2000 ${-radius()}H2000`} class={styles.blurLine} stroke-dasharray={field === 'falloff' ? '12 6' : '6 6'} />}>
                        <circle r={radius()} class={styles.blurRing} pathLength="360" stroke-dasharray={field === 'falloff' ? '10.2 6.15' : '3.6 2.02'} />
                      </Show>;
                    }}</For>
                    <circle r="8" fill="white" />
                  </g>
                </svg>
            </div>
          </Portal>
        </Show>
      </Show>
    </Show>
    <Show when={Modes.a11y && props.mode !== 'settings'}>
      <A11yButton class={styles.accessToggle} aria-label={I18n.format('Settings', true)} aria-expanded={accessControls()} onClick={() => { finish(); setAccessControls(!accessControls()); }}>{i18n('Settings')}</A11yButton>
      <Show when={accessControls()}>
        <div class={styles.accessControls}>
          <Show when={props.mode === 'curves'} fallback={<Show when={blur().mode !== 'off'}>
              {range('BlurSize', () => Math.round(blur().size * 100), blurSizeMin, blurSizeMax, value => changeBlurRange('size', value))}
              {range('BlurFalloff', () => Math.round(blur().falloff * 100), blurFeatherMin, blurFeatherMax, value => changeBlurRange('falloff', value))}
            {range('BlurCenterX', () => Math.round(blur().center[0] * 100), 0, 100, value => changeBlur({center: [value / 100, blur().center[1]]}))}
            {range('BlurCenterY', () => Math.round(blur().center[1] * 100), 0, 100, value => changeBlur({center: [blur().center[0], value / 100]}))}
            <Show when={blur().mode === 'linear'}>{range('BlurAngle', () => Math.round(blur().angle * 180 / Math.PI), 0, 180, value => changeBlur({angle: value * Math.PI / 180}))}</Show>
          </Show>}>
            <For each={tones}>{(tone, index) => range(tone, () => levels()[index()], 0, 100, value => changeLevel(index(), value))}</For>
          </Show>
        </div>
      </Show>
    </Show>
  </div>;
}

export {NativeAdjustmentModes};
