import {For, JSX, Show, batch, createEffect, createMemo, createSignal, onCleanup, onMount, untrack} from 'solid-js';
import {unwrap} from 'solid-js/store';
import A11yButton from '@components/a11yButton';
import Icon from '@components/icon';
import {adjustmentsConfig} from '@components/mediaEditor/adjustments';
import {androidAdjustmentLabelKey, formatAndroidAdjustmentValue, fromAndroidAdjustmentDisplay, isAndroidAdjustmentVisible, toAndroidAdjustmentDisplay} from '@components/mediaEditor/native/androidAdjustmentDisplay';
import androidAdjustmentTransaction from '@components/mediaEditor/native/androidAdjustmentTransaction';
import {getAndroidBrushBank} from '@components/mediaEditor/native/androidBrushState';
import {androidBrushParameters} from '@components/mediaEditor/webgl/androidStampsContract';
import useCropCommands from '@components/mediaEditor/native/cropCommands';
import AndroidColorPicker from '@components/mediaEditor/native/androidColorPicker';
import {androidPaletteColors, canonicalAndroidColor} from '@components/mediaEditor/native/androidPalette';
import {nativeBrushAssets} from '@components/mediaEditor/native/brushAssets';
import NativeBrushIcon from '@components/mediaEditor/native/nativeBrushIcon';
import NativeStickerSurface from '@components/mediaEditor/native/stickerSurface';
import useNestedNavigation from '@components/mediaEditor/native/useNestedNavigation';
import NativeAdjustmentModes from '@components/mediaEditor/nativeAdjustmentModes';
import getConvenientPositioning from '@components/mediaEditor/canvas/getConvenientPositioning';
import getCropCoverageScale from '@components/mediaEditor/canvas/getCropCoverageScale';
import {useCropOffset} from '@components/mediaEditor/canvas/useCropOffset';
import {BrushType, useMediaEditorContext} from '@components/mediaEditor/context';
import getResultSize from '@components/mediaEditor/finalRender/getResultSize';
import RangeInput from '@components/mediaEditor/rangeInput';
import {AndroidAdjustmentMode, AndroidEditorStage, EditorShape} from '@components/mediaEditor/types';
import {brushSizeMin, brushSizeMax, editorFonts, nativeTextStyles, textAlignments, textSizeMin, textSizeMax} from '@components/mediaEditor/controlConfig';
import {editorShapes} from '@components/mediaEditor/shapes';
import {androidEditorFonts, desktopEditorFonts} from '@components/mediaEditor/fonts';
import useAddText from '@components/mediaEditor/useAddText';
import selectResizableLayer from '@components/mediaEditor/selectResizableLayer';
import type {AndroidTextPreferences} from '@components/mediaEditor/native/androidTextPreferences';
import {availableQualityHeights, fontInfoMap, snapToAvailableQuality} from '@components/mediaEditor/utils';
import NativeVideoQualityControl from '@components/mediaEditor/native/nativeVideoQualityControl';
import Modes from '@config/modes';
import {animateValue} from '@helpers/animateValue';
import onRangeInlineArrowKey from '@helpers/dom/onRangeInlineArrowKey';
import createFocusTrap from '@helpers/dom/focusTrap';
import {easeOutCircApply} from '@helpers/easing/easeOutCirc';
import liteMode from '@helpers/liteMode';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import undoIcon from '@/assets/mediaEditor/android/photo_undo2.svg?url';
import '@components/mediaEditor/native/android.scss';

export type AndroidShape = EditorShape;

export type AndroidControlsProps = {
  stage: AndroidEditorStage;
  onStage: (stage: AndroidEditorStage) => void;
  onCancel: () => void;
  onDone: () => void;
  caption?: HTMLElement;
  title?: HTMLElement;
  onShape?: (shape: AndroidShape, filled: boolean, draw?: boolean) => void;
  /** Optional notification; NativeAdjustmentModes owns the working controls and engine state. */
  onAdjustmentMode?: (mode: AndroidAdjustmentMode) => void;
};

const bitmaps = import.meta.glob('/src/assets/mediaEditor/android/*.webp', {eager: true, query: '?url', import: 'default'}) as Record<string, string>;
const vectors = import.meta.glob('/src/assets/mediaEditor/android/*.svg', {eager: true, query: '?url', import: 'default'}) as Record<string, string>;
const shapeResources = {circle: 'photo_circle', rectangle: 'photo_rectangle', star: 'photo_star', bubble: 'msg_msgbubble', arrow: 'photo_arrowshape'};
const brushes: {type: BrushType; resource: string; label: LangPackKey}[] = [
  {type: 'pen', resource: 'photo_pen', label: 'MediaEditor.Brushes.Pen'},
  {type: 'arrow', resource: 'photo_arrow', label: 'MediaEditor.Brushes.Arrow'},
  {type: 'brush', resource: 'photo_marker', label: 'MediaEditor.Brushes.Brush'},
  {type: 'neon', resource: 'photo_neon', label: 'MediaEditor.Brushes.Neon'},
  {type: 'blur', resource: 'photo_blur', label: 'MediaEditor.Brushes.Blur'},
  {type: 'eraser', resource: 'photo_eraser', label: 'MediaEditor.Brushes.Eraser'}
];

function fontPreviewStyle(info: typeof fontInfoMap[keyof typeof fontInfoMap]): JSX.CSSProperties {
  return {'font-family': info.fontFamily, 'font-weight': info.fontWeight, 'font-style': info.fontStyle || 'normal'};
}

type CropSnapshot = {
  ratioKey?: string;
  imageRatio: number;
  rotation: number;
  scale: number;
  translation: readonly [number, number];
  flip: readonly [number, number];
};

function Bitmap(props: {name: string}) {
  return <img class="android-editor__bitmap" src={bitmaps[`/src/assets/mediaEditor/android/${props.name}.webp`]} alt="" draggable={false} />;
}

/** Native brush Lotties: first frame at rest, one selection animation, never looping. */
function BrushIcon(props: {resource: string; selected?: boolean; frame?: number}) {
  return <NativeBrushIcon
    url={nativeBrushAssets[props.resource]}
    size={28}
    class="android-editor__brush-icon"
    selected={props.selected}
    frame={props.frame}
  />;
}

function OptionsPanel(props: {label: LangPackKey; kind: string; children: JSX.Element}) {
  let container: HTMLDivElement;
  onMount(() => {
    const trap = createFocusTrap(container);
    trap.activate();
    onCleanup(() => trap.deactivate());
  });
  return <div ref={container} class={`android-editor__options android-editor__options--${props.kind}`} role="dialog" aria-modal="true" aria-label={I18n.format(props.label, true)}>{props.children}</div>;
}

function PaintMark(props: {done?: boolean}) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d={props.done ? 'M5.3 12.71L9.55 16.79L18.59 7.73' : 'M6.67 17.33L17.33 6.67M17.33 17.33L6.67 6.67'} />
  </svg>;
}

export default function AndroidControls(props: AndroidControlsProps) {
  const context = useMediaEditorContext();
  const {editorState, mediaState, actions, mediaType, isEditingForAvatar, isVideoAvatarMode} = context;
  const brushBank = getAndroidBrushBank(context);
  onCleanup(brushBank.save);
  const adjustmentEdit = androidAdjustmentTransaction(context);
  onCleanup(() => adjustmentEdit.finish());
  const cropOffset = useCropOffset();
  const crop = useCropCommands();
  // A restored document's current crop is the clean baseline for each crop-stage visit.
  const [cropBaseline, setCropBaseline] = createSignal<CropSnapshot>();
  const [cropResetPending, setCropResetPending] = createSignal(false);
  const getCropSnapshot = (): CropSnapshot => ({
    ratioKey: editorState.fixedImageRatioKey,
    imageRatio: mediaState.currentImageRatio,
    rotation: mediaState.rotation,
    scale: mediaState.scale,
    translation: [mediaState.translation[0], mediaState.translation[1]],
    flip: [mediaState.flip[0], mediaState.flip[1]]
  });
  const hasCropChanges = createMemo(() => {
    const baseline = cropBaseline();
    if(!baseline) return false;
    const current = getCropSnapshot();
    return baseline.ratioKey !== current.ratioKey || baseline.imageRatio !== current.imageRatio ||
      baseline.rotation !== current.rotation || baseline.scale !== current.scale ||
      baseline.translation[0] !== current.translation[0] || baseline.translation[1] !== current.translation[1] ||
      baseline.flip[0] !== current.flip[0] || baseline.flip[1] !== current.flip[1];
  });
  const addText = useAddText();
  const [rotationBase, setRotationBase] = createSignal(0);
  const [panel, setPanel] = createSignal<'colors' | 'shapes' | 'fonts' | 'ratios' | 'quality'>();
  const [adjustmentMode, setAdjustmentMode] = createSignal<AndroidAdjustmentMode>('settings');
  context.androidShapePreference.initialize();
  const filledShapes = () => editorState.androidFilledShapes;
  const setFilledShapes = context.androidShapePreference.set;
  const [weightDragging, setWeightDragging] = createSignal(false);
  const [weightExpansion, setWeightExpansion] = createSignal(0);
  createEffect(() => {
    const target = weightDragging() ? 1 : 0;
    const from = untrack(weightExpansion);
    if(!liteMode.isAvailable('motion') || from === target) {
      setWeightExpansion(target);
      return;
    }
    const cancel = animateValue(from, target, 200 * Math.abs(target - from), setWeightExpansion, {
      easing: (progress) => easeOutCircApply(progress, 1)
    });
    onCleanup(cancel);
  });
  const weightRailPath = () => {
    const top = 3 + 13 * weightExpansion();
    return `M0 0 A${top} ${top} 0 0 1 ${top} ${top} L3 197 A3 3 0 0 1 -3 197 L${-top} ${top} A${top} ${top} 0 0 1 0 0`;
  };
  const isText = () => editorState.currentTab === 'text';
  const currentFontInfo = () => fontInfoMap[editorState.currentTextLayerInfo.font] ?? fontInfoMap[androidEditorFonts[0].font];
  const currentFontLabel = () => [...androidEditorFonts, ...desktopEditorFonts, ...editorFonts].find(item => item.font === editorState.currentTextLayerInfo.font)?.label ?? androidEditorFonts[0].label;
  const color = () => isText() ? editorState.currentTextLayerInfo.color : editorState.currentBrush.color;
  const [pickerColor, setPickerColor] = createSignal<string>();
  const changeText = (patch: Partial<AndroidTextPreferences>) => {
    Object.assign(editorState.currentTextLayerInfo, patch);
    if(!isEditingForAvatar) context.androidShapePreference.setText(patch);
  };
  const setColor = (value: string) => {
    if(isText()) changeText({color: value});
    else brushBank.change({color: value});
  };
  const selectColor = (value: string) => {
    if(context.androidShapePreference.selectColor(value)) setColor(value);
    setPanel(undefined);
  };
  const closePanel = () => {
    // The native sheet returns its final color on every dismissal, not every
    // slider step. A document restoration or shell disposal is not a dismissal.
    if(panel() === 'colors') selectColor(pickerColor());
    else setPanel(undefined);
  };
  const togglePanel = (value: ReturnType<typeof panel>) => {
    if(panel() === value) closePanel();
    else {
      if(value === 'colors') setPickerColor(color());
      setPanel(value);
    }
  };
  useNestedNavigation(
    () => !!panel() || props.stage === 'paint' && editorState.currentTab === 'stickers',
    () => panel() ? closePanel() : editorState.currentTab = 'brush'
  );
  createEffect(() => {
    const stage = props.stage;
    setCropBaseline(stage === 'crop' ? untrack(getCropSnapshot) : undefined);
    if(stage !== 'crop') setCropResetPending(false);
    setRotationBase(untrack(() => Math.round(mediaState.rotation / Math.PI * 2) * Math.PI / 2));
    setPanel(undefined);
    setAdjustmentMode('settings');
  });
  createEffect(() => {
    if(!cropResetPending() || editorState.isMoving) return;
    setCropBaseline(untrack(getCropSnapshot));
    setCropResetPending(false);
  });
  onCleanup(() => {
    editorState.isAdjusting = false;
    editorState.previewBrushSize = undefined;
  });

  const button = (label: LangPackKey, content: JSX.Element, onClick: () => void, selected?: () => boolean, extraClass?: string) => (
    <A11yButton class={`android-editor__button${extraClass ? ' ' + extraClass : ''}`} aria-label={I18n.format(label, true)} aria-pressed={selected?.()}
      data-editor-cancel={label === 'Cancel' || label === 'Close' ? '' : undefined} onClick={onClick}>
      {content}
    </A11yButton>
  );

  const changeRatio = (ratio?: string) => {
    setRotationBase(Math.round(mediaState.rotation / Math.PI * 2) * Math.PI / 2);
    crop.setAspectRatio(ratio);
    setPanel(undefined);
  };
  const rotate = () => {
    if(editorState.isMoving) return;
    setRotationBase(Math.round(mediaState.rotation / Math.PI * 2) * Math.PI / 2 - Math.PI / 2);
    crop.rotate(-Math.PI / 2);
  };
  const resetCrop = () => {
    if(editorState.isMoving) return;
    setRotationBase(0);
    crop.reset();
    setCropResetPending(true);
  };
  const fineDegrees = () => (mediaState.rotation - rotationBase()) * 180 / Math.PI;
  let wheelPointer: number;
  let wheelX = 0;
  let fineScale: number;
  // Read the shared crop geometry, so a tilted crop never exposes empty corners.
  const fineRotate = withCurrentOwner((degrees: number) => {
    if(!editorState.mediaSize || !mediaState.currentImageRatio) return;
    const rotation = rotationBase() + degrees * Math.PI / 180;
    fineScale ??= mediaState.scale;
    const bounds = getConvenientPositioning({rotation, scale: fineScale, translation: [0, 0]});
    const scale = getCropCoverageScale(bounds);
    batch(() => {
      mediaState.rotation = rotation;
      mediaState.scale = fineScale * scale;
      mediaState.translation = [0, 0];
    });
  });

  let holdTimer: ReturnType<typeof setTimeout>;
  let held = false;
  const stopHold = () => clearTimeout(holdTimer);
  onCleanup(stopHold);

  const paint = context.nativePaint;
  const nativeWeightTool = () => paint?.activeShape() ? 'pen' : paint?.tool();
  const weightMin = () => isText() ? textSizeMin : paint ? androidBrushParameters[nativeWeightTool()].min : brushSizeMin;
  const weightMax = () => isText() ? textSizeMax : paint ? androidBrushParameters[nativeWeightTool()].max : brushSizeMax;
  const weight = () => isText() ? editorState.currentTextLayerInfo.size : paint ? paint.weights[nativeWeightTool() as keyof typeof paint.weights] : editorState.currentBrush.size;
  const weightProgress = () => (weight() - weightMin()) / (weightMax() - weightMin());
  const setWeight = (value: number) => {
    value = Math.max(weightMin(), Math.min(weightMax(), value));
    if(isText()) editorState.currentTextLayerInfo.size = value;
    else if(paint) paint.weights[nativeWeightTool() as keyof typeof paint.weights] = value;
    else {
      brushBank.change({size: value});
      editorState.previewBrushSize = value;
    }
  };
  let weightPointer: number;
  let weightY = 0;
  let weightStart = 0;
  let weightHeight = 1;
  const finishWeight = () => {
    weightPointer = undefined;
    setWeightDragging(false);
    editorState.previewBrushSize = undefined;
  };

  const clearPaint = () => {
    if(paint) { paint.clearAll(); return; }
    batch(() => {
      for(const key of ['brushDrawnLines', 'resizableLayers'] as const) {
        if(!mediaState[key].length) continue;
        actions.pushToHistory({path: [key], oldValue: structuredClone(unwrap(mediaState[key])), newValue: []});
        mediaState[key] = [];
      }
      editorState.selectedResizableLayer = undefined;
    });
    actions.redrawBrushes();
  };

  const qualitySteps = () => {
    if(!editorState.mediaSize || !cropOffset().width) return [];
    const size = getResultSize({
      imageWidth: editorState.mediaSize[0],
      scale: mediaState.scale,
      newRatio: mediaState.currentImageRatio || editorState.mediaRatio,
      videoType: 'video',
      imageRatio: editorState.mediaRatio,
      cropOffset: cropOffset()
    });
    return availableQualityHeights.filter(height => height <= snapToAvailableQuality(size[1]));
  };
  const chooseMode = (mode: AndroidAdjustmentMode) => {
    setAdjustmentMode(mode);
    props.onAdjustmentMode?.(mode);
  };

  return <div class="android-editor" classList={{'android-editor--paint': props.stage === 'paint'}}>
    <Show when={props.stage === 'preview'}>
      <Show when={props.caption || props.title}>
        <div class="android-editor__attachment-header">
          <Show when={props.caption}>{button('Cancel', Icon('back'), props.onCancel, undefined, 'android-editor__attachment-back')}</Show>
          <Show when={props.title}><div class="android-editor__attachment-title" dir="auto">{props.title}</div></Show>
        </div>
      </Show>
      <Show when={props.caption}>
        <div class="android-editor__caption">{props.caption}</div>
      </Show>
      <div class="android-editor__preview-actions">
        <Show when={!props.caption}>{button('Cancel', i18n('Cancel'), props.onCancel)}</Show>
        <div class="android-editor__capsule">
          {button('MediaEditor.Tab.Crop', <Bitmap name="media_crop" />, () => props.onStage('crop'))}
          {button('MediaEditor.Tab.Draw', <Bitmap name="media_draw" />, () => props.onStage('paint'))}
          <Show when={context.nativeVideo}><NativeVideoQualityControl /></Show>
          <Show when={!context.nativeVideo && mediaType === 'video' && !isVideoAvatarMode && qualitySteps().length > 1}>
            {button('Quality', <span class="android-editor__quality">{mediaState.videoQuality || qualitySteps()[qualitySteps().length - 1]}p</span>, () => togglePanel('quality'))}
          </Show>
          {button('MediaEditor.Tab.Adjustments', <Bitmap name="media_settings" />, () => props.onStage('adjustments'))}
        </div>
        <Show when={props.caption} fallback={button('Done', i18n('Done'), props.onDone)}>
          <A11yButton class="android-editor__send" aria-label={I18n.format('Send', true)} onClick={props.onDone}>{Icon('logo', 'icon-mirror')}</A11yButton>
        </Show>
      </div>
    </Show>

    <Show when={props.stage === 'crop'}>
      <div class="android-editor__crop-wheel">
        <A11yButton class="android-editor__mirror" aria-label={I18n.format('MediaEditor.FlipHorizontal', true)}
          onPointerDown={() => {
            held = false;
            stopHold();
            holdTimer = setTimeout(() => { held = true; togglePanel('ratios'); }, 500);
          }}
          onPointerUp={stopHold} onPointerCancel={stopHold} onPointerLeave={stopHold}
          onContextMenu={(event) => { event.preventDefault(); if(!held) togglePanel('ratios'); held = true; }}
          onClick={(event) => {
            if(held && event.detail !== 0) { held = false; return; }
            held = false;
            crop.flip();
          }}>
          <Bitmap name="msg_photo_flip" />
        </A11yButton>
        <div class="android-editor__wheel-track">
          <output class="android-editor__degrees" dir="ltr">{(Math.abs(fineDegrees()) < .05 ? 0 : fineDegrees()).toFixed(1)}º</output>
          <svg class="android-editor__wheel-ticks" viewBox="-100 0 200 64" preserveAspectRatio="none" aria-hidden="true">
            <For each={Array.from({length: 31}, (_, index) => index - 15)}>{(index) => {
              const delta = () => (-fineDegrees() * 2) % 5;
              const segment = () => Math.floor(-fineDegrees() * 2 / 5);
              const x = () => 100 * Math.sin((index * 5 + delta()) * Math.PI / 180);
              const center = () => index >= 0 ? index === segment() || (index === 0 && segment() === -1) : index === segment() + 1;
              const blue = () => center() || (index >= 0 ? index < segment() || (index === 0 && delta() < 0) : index > segment());
              return <rect x={x() - (center() ? 2 : 1)} y={center() ? 24 : 26} width={center() ? 4 : 2} height={center() ? 16 : 12}
                fill={blue() ? 'var(--android-editor-accent)' : '#fff'} opacity={1 - (x() / 100) ** 2} />;
            }}</For>
            <rect x="-1.25" y="21" width="2.5" height="22" rx="2" fill="var(--android-editor-accent)" />
          </svg>
          <input class="android-editor__wheel-input" type="range" min="-45" max="45" step="0.1" value={fineDegrees()}
            aria-label={I18n.format('MediaEditor.FineRotation', true)} onKeyDown={onRangeInlineArrowKey}
            onPointerDown={(event) => {
              event.preventDefault();
              if(Modes.a11y) event.currentTarget.focus();
              wheelPointer = event.pointerId;
              wheelX = event.clientX;
              fineScale = mediaState.scale;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if(wheelPointer !== event.pointerId) return;
              const degrees = Math.max(-45, Math.min(45, fineDegrees() + (wheelX - event.clientX) * (I18n.isRTL() ? -1 : 1) / Math.PI / 1.65));
              wheelX = event.clientX;
              fineRotate(Math.abs(degrees) < .05 ? 0 : degrees);
            }}
            onLostPointerCapture={() => { wheelPointer = undefined; fineScale = undefined; }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onChange={() => { fineScale = undefined; }}
            onInput={(event) => fineRotate(event.currentTarget.valueAsNumber)} />
        </div>
        {button('MediaEditor.RotateLeft', <Bitmap name="msg_photo_rotate" />, rotate)}
      </div>
      <Show when={Modes.a11y}>
        <div class="android-editor__ratio-access">{button('MediaEditor.AspectRatio', <Bitmap name="msg_photo_cropfix" />, () => togglePanel('ratios'))}</div>
      </Show>
      <div class="android-editor__footer">
        {button('Cancel', i18n('Cancel'), props.onCancel)}
        <Show when={hasCropChanges()}>{button('Reset', i18n('Reset'), resetCrop)}</Show>
        {button('MediaEditor.Tab.Crop', i18n('MediaEditor.Tab.Crop'), props.onDone)}
      </div>
    </Show>

    <Show when={props.stage === 'adjustments'}>
      <div class="android-editor__adjustments">
        <div class="android-editor__adjustment-list">
          <Show when={adjustmentMode() === 'settings'}>
            <For each={adjustmentsConfig.filter(item => isAndroidAdjustmentVisible(item, mediaType))}>{(item) => <div class="android-editor__adjustment-row">
              <RangeInput label={i18n(androidAdjustmentLabelKey(item))} ariaLabel={androidAdjustmentLabelKey(item)} min={item.to100 ? 0 : -100} max={100}
                value={toAndroidAdjustmentDisplay(item, mediaState.adjustments[item.key])}
                valueLabel={formatAndroidAdjustmentValue(toAndroidAdjustmentDisplay(item, mediaState.adjustments[item.key]))}
                onChange={(value) => adjustmentEdit.change(draft => { draft[item.key] = fromAndroidAdjustmentDisplay(item, value); })}
                onChangeFinish={() => adjustmentEdit.finish()} />
            </div>}</For>
          </Show>
          <NativeAdjustmentModes mode={adjustmentMode()} />
        </div>
        <div class="android-editor__footer">
          {button('Cancel', i18n('Cancel'), props.onCancel)}
          <div class="android-editor__modes">
            {button('Settings', <Bitmap name="msg_photo_settings" />, () => chooseMode('settings'), () => adjustmentMode() === 'settings')}
            <Show when={mediaType !== 'video'}>{button('MediaEditor.Brushes.Blur', <Bitmap name="msg_photo_blur" />, () => chooseMode('blur'), () => adjustmentMode() === 'blur')}</Show>
            {button('MediaEditor.Native.Curves' as LangPackKey, <Bitmap name="msg_photo_curve" />, () => chooseMode('curves'), () => adjustmentMode() === 'curves')}
          </div>
          {button('Done', i18n('Done'), props.onDone)}
        </div>
      </div>
    </Show>

    <Show when={props.stage === 'paint'}>
      <Show when={paint}><output>{paint?.error() || i18n('MediaEditor.Paint.Capabilities')}</output></Show>
      <Show when={editorState.currentTab === 'stickers'}><NativeStickerSurface class="android-editor__stickers" scrollClass="android-editor__stickers-scroll" /></Show>
      <div class="android-editor__paint-top">
        <A11yButton class="android-editor__button" aria-label={I18n.format('Undo', true)} aria-disabled={!mediaState.history.length && !paint?.activeShape() && !paint?.pendingTerminal()}
          onClick={() => actions.undo()}><img class="android-editor__bitmap icon-mirror" src={undoIcon} alt="" /></A11yButton>
        {button('Clear', i18n('Clear'), clearPaint)}
      </div>
      <Show when={editorState.currentTab === 'brush' || isText()}>
        <div class="android-editor__weight" classList={{'android-editor__weight--dragging': weightDragging()}}
          style={{'--weight-offset': `${32 * weightExpansion()}px`}}>
          <svg class="android-editor__weight-art" viewBox="-16 0 64 200" preserveAspectRatio="none" aria-hidden="true">
            <path d={weightRailPath()} fill="#ffffff40" />
          </svg>
          <div class="android-editor__weight-thumb" aria-hidden="true" style={{
            '--weight-position': `${100 * (1 - weightProgress())}%`,
            '--weight-radius': `${12 + (4.5 + 11.5 * weightProgress() - 12) * weightExpansion()}px`
          }} />
          <input class="android-editor__weight-input" type="range" min={weightMin()} max={weightMax()} step={paint && !isText() ? '0.01' : '0.1'}
            aria-label={I18n.format('MediaEditor.Size', true)} value={weight()}
            onPointerDown={(event) => {
              event.preventDefault();
              if(Modes.a11y) event.currentTarget.focus();
              weightPointer = event.pointerId;
              weightY = event.clientY;
              weightStart = weight();
              weightHeight = event.currentTarget.getBoundingClientRect().height;
              setWeightDragging(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if(event.pointerId === weightPointer) setWeight(weightStart + (weightY - event.clientY) / weightHeight * (weightMax() - weightMin()));
            }}
            onLostPointerCapture={finishWeight}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onInput={(event) => setWeight(event.currentTarget.valueAsNumber)} onChange={finishWeight} onBlur={finishWeight} />
        </div>
      </Show>
      <div class="android-editor__paint-bottom">
        <div class="android-editor__tools" classList={{'android-editor__tools--text': isText()}}>
          {button('MediaEditor.CustomColor', <span class="android-editor__color" style={{'background-color': color()}} />, () => togglePanel('colors'))}
          <Show when={isText()} fallback={<>
            <For each={brushes.filter(brush => mediaType === 'image' || brush.type !== 'blur')}>{(brush) => button(brush.label,
              <BrushIcon resource={brush.resource} selected={editorState.currentBrush.brush === brush.type} />,
               () => {
                 if(paint && !paint.selectTool(brush.type)) return;
                 editorState.currentTab = 'brush';
                 if(!paint) brushBank.select(brush.type);
               }, () => editorState.currentBrush.brush === brush.type)}</For>
            <Show when={props.onShape}>{button('MediaEditor.Tool', <Bitmap name="msg_add" />, () => togglePanel('shapes'))}</Show>
          </>}>
            {button('MediaEditor.TextAlignment', <BrushIcon resource="photo_text_allign" frame={textAlignments.find(item => item.value === editorState.currentTextLayerInfo.alignment)?.frame ?? 20} />, () => {
              changeText({alignment: textAlignments[(textAlignments.findIndex(item => item.value === editorState.currentTextLayerInfo.alignment) + 1) % textAlignments.length].value});
            })}
            <A11yButton class="android-editor__button" aria-label={I18n.format('MediaEditor.TextStyle', true)}
              aria-description={nativeTextStyles.find(item => item.value === editorState.currentTextLayerInfo.style) ? I18n.format(nativeTextStyles.find(item => item.value === editorState.currentTextLayerInfo.style).label, true) : undefined}
              data-text-style={editorState.currentTextLayerInfo.style}
              onClick={() => {
                changeText({style: nativeTextStyles[(nativeTextStyles.findIndex(item => item.value === editorState.currentTextLayerInfo.style) + 1) % nativeTextStyles.length].value});
              }}><Bitmap name="msg_text_outlined" /></A11yButton>
            {button('MediaEditor.AddTextLayer', <Bitmap name="msg_add" />, () => addText())}
            {button('MediaEditor.Font', <span class="android-editor__font" style={fontPreviewStyle(currentFontInfo())}>{i18n(currentFontLabel())}</span>, () => togglePanel('fonts'))}
          </Show>
        </div>
        <div class="android-editor__paint-navigation">
          {button('Cancel', <PaintMark />, props.onCancel)}
          <For each={[
            {tab: 'brush', label: 'MediaEditor.Tab.Draw'},
            {tab: 'stickers', label: 'MediaEditor.Tab.Stickers'},
            {tab: 'text', label: 'MediaEditor.Tab.Text'}
          ] as const}>{(item) => button(item.label, i18n(item.label), () => {
            const alreadyText = isText();
            const selectedText = mediaState.resizableLayers.find(layer => layer.id === editorState.selectedResizableLayer && layer.type === 'text');
            editorState.currentTab = item.tab;
            if(item.tab === 'text' && !alreadyText) {
              // Changing tabs clears selection in the canvas. Restore the text
              // chosen before that cleanup, rather than creating a third layer.
              if(selectedText) selectResizableLayer(editorState, selectedText);
              else addText();
            }
            setPanel(undefined);
          }, () => editorState.currentTab === item.tab)}</For>
          {button('Done', <PaintMark done />, props.onDone)}
        </div>
      </div>
    </Show>

    <Show when={panel()}>
      <div class="android-editor__scrim" onClick={closePanel} />
      <OptionsPanel kind={panel()} label={panel() === 'colors' ? 'MediaEditor.CustomColor' : panel() === 'fonts' ? 'MediaEditor.Font' : panel() === 'ratios' ? 'MediaEditor.AspectRatio' : panel() === 'quality' ? 'Quality' : 'MediaEditor.Tool'}>
        <Show when={panel() === 'colors'}>
          <div class="android-editor__palette"><For each={[...androidPaletteColors, ...context.androidShapePreference.customColors()]}>{(value) => <A11yButton class="android-editor__swatch"
            aria-label={`${I18n.format('MediaEditor.CustomColor', true)} ${value}`} aria-pressed={canonicalAndroidColor(pickerColor()) === value}
            style={{'background-color': value}} onClick={() => selectColor(value)} />}</For></div>
          <AndroidColorPicker value={pickerColor()} onChange={setPickerColor} onDone={closePanel} />
        </Show>
        <Show when={panel() === 'fonts'}><For each={androidEditorFonts}>{(item) => <A11yButton class="android-editor__option"
          style={fontPreviewStyle(fontInfoMap[item.font])}
          aria-pressed={editorState.currentTextLayerInfo.font === item.font} onClick={() => { changeText({font: item.font}); setPanel(undefined); }}>{i18n(item.label)}</A11yButton>}</For></Show>
        <Show when={panel() === 'ratios'}>
          <For each={[
            {ratio: undefined, label: 'MediaEditor.Free'},
            {ratio: 'original', label: 'MediaEditor.Original'},
            {ratio: '1x1', label: 'MediaEditor.Square'}
          ] as const}>{(item) => <Show when={!isEditingForAvatar || item.ratio === '1x1'}><A11yButton class="android-editor__option" onClick={() => changeRatio(item.ratio)}>{i18n(item.label)}</A11yButton></Show>}</For>
          <Show when={!isEditingForAvatar}><For each={['3x2', '2x3', '5x3', '3x5', '4x3', '3x4', '5x4', '4x5', '7x5', '5x7', '16x9', '9x16']}>{(ratio) => <A11yButton class="android-editor__option" onClick={() => changeRatio(ratio)}><bdi dir="ltr">{ratio.replace('x', ':')}</bdi></A11yButton>}</For></Show>
        </Show>
        <Show when={panel() === 'quality'}><For each={qualitySteps()}>{(height) => <A11yButton class="android-editor__option" aria-pressed={mediaState.videoQuality === height} onClick={() => { mediaState.videoQuality = height; setPanel(undefined); }}>{height}p</A11yButton>}</For></Show>
        <Show when={panel() === 'shapes'}>
          <For each={editorShapes}>{(shape) => <A11yButton class="android-editor__option android-editor__shape-option"
              aria-label={I18n.format(shape === 'arrow' ? 'MediaEditor.Brushes.Arrow' : ('MediaEditor.Shape.' + shape) as LangPackKey, true) + (filledShapes() && shape !== 'arrow' ? ' ' + I18n.format('MediaEditor.Shape.Filled' as LangPackKey, true) : '')}
              onPointerDown={() => {
                held = false;
                stopHold();
                holdTimer = setTimeout(() => { held = true; setFilledShapes(!filledShapes()); }, 500);
              }} onPointerUp={stopHold} onPointerCancel={stopHold} onPointerLeave={stopHold}
              onContextMenu={(event) => { event.preventDefault(); if(!held) setFilledShapes(!filledShapes()); held = true; }}
              onClick={(event) => {
                if(held && event.detail !== 0) { held = false; return; }
                 editorState.currentTab = 'brush';
                 if(paint) paint.selectShape(shape, shape !== 'arrow' && filledShapes());
                 else props.onShape?.(shape, shape !== 'arrow' && filledShapes(), false);
                 setPanel(undefined);
              }}>
              <img class="android-editor__bitmap" alt="" src={shape === 'bubble' ? bitmaps[`/src/assets/mediaEditor/android/msg_msgbubble${filledShapes() ? '2' : ''}.webp`] : vectors[`/src/assets/mediaEditor/android/${shapeResources[shape]}${filledShapes() && shape !== 'arrow' ? '_fill' : ''}.svg`]} />
              {i18n(shape === 'arrow' ? 'MediaEditor.Brushes.Arrow' : ('MediaEditor.Shape.' + shape) as LangPackKey)}
            </A11yButton>}</For>
          <Show when={Modes.a11y}><A11yButton class="android-editor__option" aria-pressed={filledShapes()} onClick={() => setFilledShapes(!filledShapes())}>{i18n('MediaEditor.Shape.Filled' as LangPackKey)}</A11yButton></Show>
        </Show>
        <Show when={panel() !== 'colors'}>{button('Close', <PaintMark />, () => setPanel(undefined))}</Show>
      </OptionsPanel>
    </Show>
  </div>;
}
