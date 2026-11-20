import {createEffect, createSignal, For, onCleanup, onMount, ParentProps, Show, untrack} from 'solid-js';
import A11yButton from '@components/a11yButton';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {ButtonMenuItemOptions, setButtonMenuItemDisabled} from '@components/buttonMenu';
import useCropCommands from '@components/mediaEditor/native/cropCommands';
import NativeBrushIcon from '@components/mediaEditor/native/nativeBrushIcon';
import CheckboxField from '@components/checkboxField';
import Icon from '@components/icon';
import DesktopColorPicker from '@components/mediaEditor/native/desktopColorPicker';
import {createDesktopShapeBrushEdit, getDesktopBrushBank, shouldDrawDesktopShape} from '@components/mediaEditor/native/desktopBrushState';
import {nativeBrushAssets} from '@components/mediaEditor/native/brushAssets';
import NativeStickerSurface from '@components/mediaEditor/native/stickerSurface';
import useNestedNavigation from '@components/mediaEditor/native/useNestedNavigation';
import useAddText from '@components/mediaEditor/useAddText';
import {cancelPendingEditorShape, editorShapes} from '@components/mediaEditor/shapes';
import type {EditorShape} from '@components/mediaEditor/types';
import {BrushType, useMediaEditorContext} from '@components/mediaEditor/context';
import {observeResize} from '@components/resizeObserver';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {easeOutCircApply} from '@helpers/easing/easeOutCirc';
import clamp from '@helpers/number/clamp';
import nMap from '@helpers/number/nMap';
import contextMenuController from '@helpers/contextMenuController';
import {withCurrentOwner} from '@helpers/solid/withCurrentOwner';
import sequentialDom from '@helpers/sequentialDom';
import {animateValue} from '@helpers/animateValue';
import liteMode from '@helpers/liteMode';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import Modes from '@config/modes';
import NativeVideoQualityControl from '@components/mediaEditor/native/nativeVideoQualityControl';
import DesktopShortcutHelp from '@components/mediaEditor/native/desktopShortcutHelp';
import type useHistoryShortcuts from '@components/mediaEditor/useHistoryShortcuts';
import '@components/mediaEditor/native/desktop.scss';

const assetUrls = import.meta.glob('/src/assets/mediaEditor/desktop/*', {eager: true, query: '?url', import: 'default'}) as Record<string, string>;
const asset = (name: string) => assetUrls['/src/assets/mediaEditor/desktop/' + name];
const palette = ['#000000', '#ffffff', '#ea2739', '#fc964d', '#fcde65', '#80c864', '#49c5ed', '#3051e3', '#db3ad2', '#ff72a9'];
const brushes: {brush: BrushType; asset: string; label: LangPackKey}[] = [
  {brush: 'pen', asset: 'pen', label: 'MediaEditor.Brushes.Pen'},
  {brush: 'arrow', asset: 'arrow', label: 'MediaEditor.Brushes.Arrow'},
  {brush: 'brush', asset: 'marker', label: 'MediaEditor.Brushes.Brush'},
  {brush: 'blur', asset: 'blur', label: 'MediaEditor.Brushes.Blur'},
  {brush: 'eraser', asset: 'eraser', label: 'MediaEditor.Brushes.Eraser'}
];

export type DesktopShape = EditorShape;
export type DesktopControlsProps = {
  stage: 'transform' | 'paint';
  onCancel: () => void;
  onDone: () => void;
  onPaint: () => void;
  onShape?: (shape: DesktopShape, filled: boolean, draw?: boolean) => void;
  shortcuts?: ReturnType<typeof useHistoryShortcuts>;
};

function AssetIcon(props: {name: string; size?: number; rotate?: boolean}) {
  return <span
    class="media-editor-desktop__icon"
    classList={{
      'media-editor-desktop__icon--rotate': props.rotate,
      'media-editor-desktop__icon--ratio': props.name === 'ratio.svg',
      'icon-mirror': props.name === 'undo.svg' || props.name === 'redo.svg'
    }}
    style={{
      'mask-image': `url("${asset(props.name)}")`,
      width: (props.size || 32) + 'px',
      height: (props.size || 32) + 'px'
    }}
    aria-hidden="true"
  />;
}

/** The ordinary menu lifecycle supplies Escape, outside click, keyboard routing and focus restoration. */
export function MenuButton(props: {label: LangPackKey; icon: string; size?: number; items: () => ButtonMenuItemOptions[]; active?: boolean; onToggle?: () => boolean}) {
  let button: HTMLElement;
  let opened = false;
  let disposed = false;
  const listeners = createListenerSetter();
  const items = props.items();
  onMount(() => {
    if(props.onToggle) listeners.add(button)('click', (event) => {
      if(!props.onToggle()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, {capture: true});
    ButtonMenuToggle({
      container: button,
      listenerSetter: listeners,
      direction: 'top-left',
      floatingDirection: 'top-end',
      buttons: items,
      canOpen: () => !disposed && button.isConnected,
      onOpen: (_, menu) => {
        opened = true;
        menu.classList.add('media-editor-desktop__menu');
        items.forEach((item) => item.onOpen?.());
      },
      onClose: () => opened = false
    });
  });
  onCleanup(() => {
    disposed = true;
    if(opened) contextMenuController.close();
  });
  return <A11yButton
    ref={(el) => button = el}
    class="media-editor-desktop__button"
    classList={{'media-editor-desktop__button--active': props.active}}
    aria-label={I18n.format(props.label, true)}
  ><AssetIcon name={props.icon} size={props.size} /></A11yButton>;
}

function BrushIcon(props: {name: string}) {
  return <NativeBrushIcon url={nativeBrushAssets['photo_' + props.name]} size={20} class="media-editor-desktop__brush-icon" animateOnHover />;
}

function MenuCheck(props: {selected: boolean}) {
  return <span class="media-editor-desktop__menu-check" classList={{'media-editor-desktop__menu-check--selected': props.selected}} aria-hidden="true">{Icon('check')}</span>;
}

export function CropRatioMenuCheck(props: {selected: boolean; item: ButtonMenuItemOptions}) {
  // A quick reopen reuses ButtonMenuToggle's closing menu without onOpen.
  // Keep its radio state in sync with the same signal as the visible check.
  createEffect(() => {
    const selected = props.selected;
    props.item.element?.setAttribute('aria-checked', String(selected));
  });
  return <MenuCheck selected={props.selected} />;
}

/** Geometry from ColorPicker::sizeControlShapePath; the collapsed rail is not a triangle. */
function BrushSizeControl(props: {value: number; onInput: (size: number) => void; onFinish: () => void}) {
  const {editorState} = useMediaEditorContext();
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const expanded = () => hovered() || focused() || dragging();
  const [expansion, setExpansion] = createSignal(0);
  createEffect(() => {
    const target = expanded() ? 1 : 0;
    const motion = liteMode.isAvailable('motion');
    const from = untrack(expansion);
    if(!motion || from === target) {
      setExpansion(target);
      return;
    }
    // Like Desktop, reverse from the current shape instead of restarting the reveal.
    const cancel = animateValue(from, target, 200 * Math.abs(target - from), setExpansion, {
      easing: (progress) => easeOutCircApply(progress, 1)
    });
    onCleanup(cancel);
  });
  const ratio = () => clamp(nMap(props.value, 1, 25, 0, 1), 0, 1);
  const center = () => 27 + 23.5 * expansion();
  const path = () => {
    const x = center();
    const top = 2 + 9.5 * expansion();
    const bottom = 3 - expansion();
    return `M${x - top},${25 + top} A${top},${top} 0 0 1 ${x + top},${25 + top} L${x + bottom},${256 - bottom} A${bottom},${bottom} 0 0 1 ${x - bottom},${256 - bottom} Z`;
  };
  const clearPreview = () => {
    props.onFinish();
    setDragging(false);
    editorState.previewBrushSize = undefined;
  };
  onCleanup(clearPreview);
  return <label
    class="media-editor-desktop__size"
    classList={{'media-editor-desktop__size--expanded': expanded(), 'media-editor-desktop__size--dragging': dragging()}}
    aria-label={I18n.format('MediaEditor.Size', true)}
    onPointerEnter={() => setHovered(true)}
    onPointerLeave={() => setHovered(false)}
  >
    <svg class="media-editor-desktop__size-drawing" viewBox="0 0 87 280" aria-hidden="true">
      <path class="media-editor-desktop__size-rail" d={path()} />
      <circle cx={center()} cy={254 - 218 * ratio()} r={Math.max(4, props.value) / 2} fill="#fffffff4" />
    </svg>
    <input
      class="media-editor-desktop__size-input"
      type="range"
      min={1}
      max={25}
      step={0.1}
      value={props.value}
      aria-label={I18n.format('MediaEditor.Size', true)}
      onPointerDown={(e) => {
        if(e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        editorState.previewBrushSize = props.value;
      }}
      onPointerUp={clearPreview}
      onPointerCancel={clearPreview}
      onLostPointerCapture={clearPreview}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); clearPreview(); }}
      onInput={(e) => {
        props.onInput(e.currentTarget.valueAsNumber);
        editorState.previewBrushSize = e.currentTarget.valueAsNumber;
      }}
      onChange={clearPreview}
    />
  </label>;
}

function BottomBar(props: ParentProps<{stage: DesktopControlsProps['stage']}>) {
  let bar: HTMLDivElement;
  let disposed = false;
  let scheduled = false;
  const observed = new Map<HTMLElement, () => void>();

  const scheduleLayout = () => {
    if(disposed || scheduled) return;
    scheduled = true;
    sequentialDom.measure(() => {
      scheduled = false;
      if(disposed) return;
      const widgets = Array.from(bar.children) as HTMLElement[];
      const actualWidths = widgets.map((widget) => widget.offsetWidth);
      const widths = [...actualWidths];
      const middle = Math.floor(widths.length / 2);
      for(let i = 0; i < middle; ++i) {
        const j = widths.length - i - 1;
        widths[i] = widths[j] = Math.max(widths[i], widths[j]);
      }
      const available = bar.clientWidth;
      // Desktop retries with the widgets' own widths when the symmetric slots do not fit.
      if(widths.reduce((sum, width) => sum + width, 0) > available) {
        widths.splice(0, widths.length, ...actualWidths);
      }
      const step = (available - widths.reduce((sum, width) => sum + width, 0)) / (widths.length - 1);
      let start = 0;
      const positions = widths.map((width, index) => {
        const position = Math.trunc(index >= middle ? start + width - actualWidths[index] : start);
        start += width + step;
        return position;
      });
      sequentialDom.mutate(() => {
        if(disposed) return;
        widgets.forEach((widget, index) => {
          // Logical placement mirrors geometry while preserving the source/keyboard order.
          widget.style.insetInlineStart = positions[index] + 'px';
        });
      });
    });
  };

  const observeWidgets = () => {
    const widgets = new Set(Array.from(bar.children) as HTMLElement[]);
    observed.forEach((stop, widget) => {
      if(!widgets.has(widget)) {
        stop();
        observed.delete(widget);
      }
    });
    widgets.forEach((widget) => {
      if(!observed.has(widget)) observed.set(widget, observeResize(widget, scheduleLayout));
    });
    scheduleLayout();
  };

  onMount(() => {
    const stop = observeResize(bar, scheduleLayout);
    const observer = new MutationObserver(observeWidgets);
    observer.observe(bar, {childList: true});
    observeWidgets();
    // Label/font changes resize the natural-width edge widgets; font completion is a
    // separate signal for engines that do not send a resize for the initial font swap.
    bar.ownerDocument.fonts?.ready.then(scheduleLayout);
    onCleanup(() => {
      observer.disconnect();
      stop();
    });
  });
  createEffect(() => {
    props.stage;
    I18n.langCodeNormalized();
    if(bar) scheduleLayout();
  });
  onCleanup(() => {
    disposed = true;
    observed.forEach((stop) => stop());
  });
  return <div ref={bar} class="media-editor-desktop__bar media-editor-desktop__bar--bottom">{props.children}</div>;
}

export function ToolButton(props: ParentProps<{label: LangPackKey; onClick: () => void; active?: boolean; disabled?: boolean}>) {
  return <A11yButton
    class="media-editor-desktop__button"
    classList={{'media-editor-desktop__button--active': props.active, 'media-editor-desktop__button--disabled': props.disabled, 'media-editor-desktop__button--text': props.label === 'MediaEditor.Tab.Text'}}
    aria-label={I18n.format(props.label, true)}
    aria-pressed={props.active ?? false}
    aria-disabled={props.disabled ?? false}
    disabled={props.disabled}
    onClick={() => !props.disabled && props.onClick()}
  >{props.children}</A11yButton>;
}

export default function DesktopControls(props: DesktopControlsProps) {
  const context = useMediaEditorContext();
  const {editorState, mediaState, actions, mediaType} = context;
  const brushBank = getDesktopBrushBank(context);
  onCleanup(brushBank.save);
  const shapeBrush = createDesktopShapeBrushEdit(context);
  const crop = useCropCommands();
  const addText = useAddText();
  const [colorsShown, setColorsShown] = createSignal(false);
  const [customColorShown, setCustomColorShown] = createSignal(false);
  let customColorOpener: HTMLElement;
  const [filled, setFilled] = createSignal(false);
  const pendingShape = () => props.stage === 'paint' && editorState.currentTab === 'shapes' && !!editorState.drawingShape;
  const cancelShape = () => cancelPendingEditorShape(context);
  // Closing the picker removes every `menu` entry. The armed canvas tool must
  // survive that close so Escape disarms it before reaching the Paint popup.
  useNestedNavigation(pendingShape, cancelShape, 'input-helper');
  createEffect(() => {
    const surface = editorState.resizeHandlesContainer?.closest<HTMLElement>('.media-editor__main-canvas');
    if(!surface) return;
    const cancelOnRightClick = (event: MouseEvent) => {
      if(event.button !== 2 || event.buttons & 1 || !pendingShape()) return;
      cancelShape();
      event.preventDefault();
      event.stopPropagation();
    };
    surface.addEventListener('contextmenu', cancelOnRightClick, true);
    onCleanup(() => surface.removeEventListener('contextmenu', cancelOnRightClick, true));
  });
  const selectBrush = (tool: typeof brushes[number]) => {
    shapeBrush.finish();
    editorState.selectedResizableLayer = undefined;
    editorState.drawingShape = undefined;
    editorState.currentTab = 'brush';
    brushBank.select(tool.brush);
  };
  const isText = () => editorState.currentTab === 'text';
  const color = () => shapeBrush.selected()?.shapeInfo.color ?? (isText() ? editorState.currentTextLayerInfo.color : editorState.currentBrush.color);
  const setColor = (value: string) => {
    if(!shapeBrush.setColor(value)) {
      brushBank.change({color: value});
      if(isText()) editorState.currentTextLayerInfo.color = value;
    }
    setColorsShown(false);
  };
  const colors = () => palette.includes(color().toLowerCase()) ? palette : [...palette, color()];
  onCleanup(() => editorState.previewBrushSize = undefined);

  createEffect(() => {
    if(props.stage === 'transform') {
      editorState.currentTab = 'crop';
      setColorsShown(false);
      setCustomColorShown(false);
    } else if(editorState.currentTab === 'crop') {
      editorState.currentTab = 'brush';
    }
  });

  const ratioItems = () => [
    {key: 'original', label: i18n('MediaEditor.Original')},
    {key: '1x1', label: i18n('MediaEditor.Square')},
    {key: '3x2', label: '3:2'},
    {key: '16x9', label: '16:9'},
    {key: '3x4', label: '3:4'},
    {key: '9x16', label: '9:16'},
    {key: undefined as string, label: i18n('MediaEditor.Free')}
  ].map(({key, label}) => {
    const value = (ratioKey?: string) => {
      if(!ratioKey) return 0;
      if(ratioKey === 'original') return editorState.mediaRatio;
      const [w, h] = ratioKey.split('x').map(Number);
      return w / h;
    };
    const selected = () => Math.abs(value(editorState.fixedImageRatioKey) - value(key)) < 0.01;
    const item: ButtonMenuItemOptions = {
      className: 'media-editor-desktop__menu-item',
      textElement: <span dir={key?.includes('x') ? 'ltr' : undefined}>{label}</span> as HTMLSpanElement,
      onOpen: () => {
        item.element?.setAttribute('role', 'menuitemradio');
        item.element?.setAttribute('aria-checked', String(selected()));
      },
      onClick: withCurrentOwner(() => { if(!selected()) crop.setAspectRatio(key); })
    };
    item.iconElement = <span><CropRatioMenuCheck selected={selected()} item={item} /></span> as HTMLSpanElement;
    return item;
  });

  const shapeItems = () => {
    const filledCheckbox = new CheckboxField({checked: filled()});
    const items: ButtonMenuItemOptions[] = editorShapes.map((shape) => {
      const item: ButtonMenuItemOptions = {
        className: 'media-editor-desktop__menu-item',
        text: shape === 'arrow' ? 'MediaEditor.Brushes.Arrow' : ('MediaEditor.Shape.' + shape) as LangPackKey,
        iconElement: <span><AssetIcon name={`shape_${shape}${filled() && shape !== 'arrow' ? '_fill' : ''}.svg`} size={24} /></span> as HTMLElement,
        onClick: (event) => {
          if(!props.onShape) return;
          editorState.currentTab = 'brush';
          props.onShape(shape, filled(), shouldDrawDesktopShape(event, Modes.a11y));
        },
        onOpen: () => setButtonMenuItemDisabled(item, !props.onShape)
      };
      return item;
    });
    items.push({
      className: 'media-editor-desktop__menu-item',
      text: 'MediaEditor.Shape.Filled' as LangPackKey,
      separator: true,
      checkboxField: filledCheckbox,
      onOpen: () => {
        filledCheckbox.checked = filled();
      },
      onClick: () => {
        setFilled(!filled());
      }
    });
    return items;
  };

  useNestedNavigation(() => props.stage === 'paint' && (colorsShown() || editorState.currentTab === 'stickers'), () => {
    if(colorsShown()) {
      setColorsShown(false);
    } else {
      editorState.currentTab = 'brush';
    }
  });
  useNestedNavigation(customColorShown, () => setCustomColorShown(false));

  return <div class="media-editor-desktop" role="group" aria-label={I18n.format('MediaEditor.Tabs', true)}>
    <div inert={Modes.a11y && (customColorShown() || props.shortcuts?.helpOpen()) ? true : undefined}>
    <Show when={Modes.a11y && props.shortcuts}>
      <A11yButton class="media-editor-desktop__button media-editor-desktop__help-button"
        aria-label={I18n.format('KeyboardShortcuts.Title', true)} aria-haspopup="dialog"
        aria-expanded={props.shortcuts.helpOpen()} onClick={props.shortcuts.toggleHelp}>
        {Icon('help', 'media-editor-desktop__help-icon')}
      </A11yButton>
    </Show>
    <Show when={props.stage === 'paint'}>
      <Show when={editorState.currentTab === 'stickers'}><NativeStickerSurface class="media-editor-desktop__stickers" scrollClass="media-editor-desktop__stickers-scroll" /></Show>
      <div class="media-editor-desktop__bar media-editor-desktop__bar--top">
        <ToolButton label="KeyboardShortcuts.Action.Undo" onClick={actions.undo} disabled={!mediaState.history.length}><AssetIcon name="undo.svg" size={24} /></ToolButton>
        <div class="media-editor-desktop__tools">
          <Show when={!colorsShown()} fallback={<>
            <For each={colors()}>{(value) => <A11yButton
              class="media-editor-desktop__swatch"
              style={{'background-color': value}}
              aria-label={value}
              aria-pressed={color().toLowerCase() === value.toLowerCase()}
              onClick={() => setColor(value)}
            />}</For>
            <A11yButton class="media-editor-desktop__custom-color" aria-label={I18n.format('MediaEditor.CustomColor', true)} aria-haspopup="dialog" onClick={(event) => {
              customColorOpener = event.currentTarget;
              setCustomColorShown(true);
            }} />
          </>}>
            <div class="media-editor-desktop__tool-line">
            <A11yButton class="media-editor-desktop__color" aria-label={I18n.format('MediaEditor.CustomColor', true)} aria-expanded={colorsShown()} onClick={() => setColorsShown(true)}>
              <span class="media-editor-desktop__color-inner" style={{'background-color': color()}} />
            </A11yButton>
            <For each={brushes.filter((tool) => mediaType === 'image' || tool.brush !== 'blur')}>{(tool, index) => <A11yButton
              class="media-editor-desktop__brush"
              style={{'inset-inline-start': 34 + index() * 38 + 'px'}}
              aria-label={I18n.format(tool.label, true)}
              aria-pressed={!isText() && editorState.currentBrush.brush === tool.brush}
              onClick={() => selectBrush(tool)}
            ><BrushIcon name={tool.asset} /></A11yButton>}</For>
             </div>
           </Show>
        </div>
        <ToolButton label="KeyboardShortcuts.Action.Redo" onClick={actions.redo} disabled={!mediaState.redoHistory.length}><AssetIcon name="redo.svg" size={24} /></ToolButton>
      </div>
      <BrushSizeControl value={shapeBrush.size()} onFinish={shapeBrush.finish} onInput={(size) => {
        if(!shapeBrush.setSize(size)) brushBank.change({size});
      }} />
    </Show>
    <BottomBar stage={props.stage}>
      <A11yButton data-editor-cancel class="media-editor-desktop__edge" onClick={props.onCancel}>{i18n('Cancel')}</A11yButton>
      <Show when={props.stage === 'transform'} fallback={<>
        <ToolButton label="MediaEditor.Tab.Draw" onClick={() => editorState.currentTab = 'brush'} active={editorState.currentTab === 'brush'}><AssetIcon name="paint.png" /></ToolButton>
        <ToolButton label="MediaEditor.Tab.Stickers" onClick={() => editorState.currentTab = editorState.currentTab === 'stickers' ? 'brush' : 'stickers'} active={editorState.currentTab === 'stickers'}><AssetIcon name="stickers.png" size={28} /></ToolButton>
        <ToolButton label="MediaEditor.Tab.Text" onClick={() => {
          editorState.currentTab = 'text';
          editorState.selectedResizableLayer = undefined;
          addText();
        }} active={isText()}><span class="media-editor-desktop__text" aria-hidden="true">A</span></ToolButton>
        <MenuButton label={'MediaEditor.Shapes' as LangPackKey} icon="shapes.svg" size={28} items={shapeItems} active={pendingShape()} onToggle={cancelShape} />
      </>}>
        <ToolButton label="MediaEditor.FlipHorizontal" onClick={crop.flip} active={mediaState.flip[0] < 0 || mediaState.flip[1] < 0}><AssetIcon name="flip.png" /></ToolButton>
        <ToolButton label="MediaEditor.RotateRight" onClick={() => crop.rotate(Math.PI / 2)}><AssetIcon name="rotate.png" rotate /></ToolButton>
        <ToolButton label="MediaEditor.Tab.Draw" onClick={props.onPaint}><AssetIcon name="paint.png" /></ToolButton>
        <MenuButton label="MediaEditor.AspectRatio" icon="ratio.svg" size={23} items={ratioItems} active={!!editorState.fixedImageRatioKey} />
        <Show when={context.nativeVideo}><NativeVideoQualityControl /></Show>
      </Show>
      <A11yButton class="media-editor-desktop__edge media-editor-desktop__edge--done" onClick={props.onDone}>{i18n('Done')}</A11yButton>
    </BottomBar>
    </div>
    <Show when={Modes.a11y && props.shortcuts?.helpOpen()}><DesktopShortcutHelp onClose={props.shortcuts.closeHelp} /></Show>
    <Show when={customColorShown()}>
      <DesktopColorPicker color={color()} restoreTo={customColorOpener} onCancel={() => setCustomColorShown(false)} onDone={(value) => {
        setColor(value);
        setCustomColorShown(false);
      }} />
    </Show>
  </div>;
}
