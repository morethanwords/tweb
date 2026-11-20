import {ResizableContainer} from '@components/mediaEditor/canvas/resizableLayers';
import {HistoryItem, useMediaEditorContext} from '@components/mediaEditor/context';
import {ResizableLayer, ResizableLayerProps, TextLayerInfo, TextRenderingInfoLine} from '@components/mediaEditor/types';
import {fontInfoMap} from '@components/mediaEditor/utils';
import getTextAppearance from '@components/mediaEditor/textAppearance';
import {loadEditorFont} from '@components/mediaEditor/fonts';
import getLinesRenderingInfo from '@components/mediaEditor/canvas/textLineMetrics';
import {measureDesktopText} from '@components/mediaEditor/native/desktopTextMeasurement';
import snapshotDesktopText from '@components/mediaEditor/native/desktopTextSnapshot';
import {createDesktopTextSessionEdit, getDesktopTextLayoutSpec, getDesktopTextWidthFloor, getDesktopTextProxyWidth, getNextDesktopTextFontSize} from '@components/mediaEditor/native/desktopTextLayout';
import stageTextDom from '@components/mediaEditor/native/stageTextDom';
import '@components/mediaEditor/canvas/textLine.scss';
import '@components/mediaEditor/fonts.scss';
import selectResizableLayer from '@components/mediaEditor/selectResizableLayer';
import useIsMobile from '@components/mediaEditor/useIsMobile';
import appNavigationController from '@components/appNavigationController';
import createElementFromMarkup from '@helpers/createElementFromMarkup';
import cancelEvent from '@helpers/dom/cancelEvent';
import Modes from '@config/modes';
import track from '@helpers/solid/track';
import I18n from '@lib/langPack';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import {batch, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack} from 'solid-js';
import {modifyMutable, reconcile, unwrap} from 'solid-js/store';


export default function TextLayerContent(props: ResizableLayerProps) {
  const {editorState, mediaState, actions, isEditingForAvatar, textSessions, managers} = useMediaEditorContext();
  const accountSession = getManagersSession(managers);
  const isMobile = useIsMobile();
  const isDesktop = () => !isEditingForAvatar && !isMobile();
  let disposed = false;

  if(!props.layer.textInfo) return;

  let sessionStart: ResizableLayer;
  let renderedText: string;
  const textContents = (layer = props.layer) => layer.textRenderingInfo?.lines.map(line => line.content) || [''];
  const cloneLayer = () => structuredClone(unwrap(props.layer));
  const [desktopLayout, setDesktopLayout] = createSignal<{size: number; width: number}>();
  const [layoutError, setLayoutError] = createSignal<string>();
  type Measurement = Awaited<ReturnType<typeof measureDesktopText>>;
  let desktopSession: {
    before: ResizableLayer; initialText: string; text: string; version: number;
    size: number; explicitSize: number; floor?: number; abort: AbortController;
    measured?: Measurement; pending?: Promise<void>; finishing?: Promise<void>;
    unregister: () => void; cancelled: boolean;
    draft: boolean;
  };
  let composing = false;
  // A saved web layer owns its geometry, including pre-native line boxes/path.
  // Mounting or focusing it is not a migration to this browser's font metrics.
  const initialTextInfo = JSON.stringify(unwrap(props.layer.textInfo));
  let preserveInitialDesktopGeometry = isDesktop() && !!props.layer.textRenderingInfo;
  let keepDesktopGeometry = preserveInitialDesktopGeometry;
  const reportError = (error: unknown) => {
    if((error as Error)?.name !== 'AbortError') setLayoutError(String(error));
  };
  const livePadding = (size: number) => size * (getTextAppearance(props.layer.textInfo).backgroundColor ? .3 : .2);

  function startDesktopSession() {
    if(desktopSession || !isDesktop() || !editorState.mediaSize) return;
    keepDesktopGeometry = true;
    const text = snapshotDesktopText(contentEditable);
    const session: typeof desktopSession = {
      before: cloneLayer(), initialText: text, text, version: 0,
      size: props.layer.textInfo.size, explicitSize: props.layer.textInfo.size,
      abort: new AbortController(), cancelled: false, unregister: () => {},
      draft: editorState.draftTextLayer === props.layer.id
    };
    desktopSession = session;
    session.unregister = textSessions.register({finish: finishDesktopSession, cancel: cancelEditing});
    scheduleDesktopMeasurement();
  }

  function scheduleDesktopMeasurement() {
    const session = desktopSession;
    if(!session || session.cancelled) return;
    session.text = snapshotDesktopText(contentEditable);
    ++session.version;
    session.abort.abort();
    session.abort = new AbortController();
    const signal = session.abort.signal;
    const version = session.version;
    const info = {...unwrap(props.layer.textInfo)};
    if(info.size !== session.explicitSize) {
      session.size = info.size;
      session.explicitSize = info.size;
    }
    const scale = props.layer.scale;
    const imageSize = [...editorState.mediaSize] as [number, number];
    const text = session.text;
    const valid = () => {
      if(session.cancelled || signal.aborted || desktopSession !== session || session.version !== version) {
        throw new DOMException('Text measurement superseded', 'AbortError');
      }
    };
    const measure = (value: string, size: number, width: number, boxWidth?: number) =>
      measureDesktopText({text: value, info: {...info, size}, wrapWidth: width, boxWidth,
        ownerDocument: contentEditable.ownerDocument, signal});
    const work = (async() => {
      // Initial unwrapped ideal width is measured after font readiness, never
      // inferred from a DPR-scaled viewport rectangle or stale serialized box.
      if(session.floor === undefined) {
        const initial = await measure(session.initialText, session.before.textInfo.size, 1e6);
        valid();
        const pad = session.before.textInfo.size * (getTextAppearance(session.before.textInfo).backgroundColor ? .3 : .2);
        session.floor = getDesktopTextWidthFloor(Math.max(0, initial.renderingInfo.width - 2 * pad) * scale,
          session.draft);
      }
      let size = session.size;
      let result: Measurement;
      let spec: ReturnType<typeof getDesktopTextLayoutSpec>;
      // Every iteration awaits a hidden-copy measurement with staged reads and
      // writes. No forced synchronous layout loop, and no pointer-path work.
      for(;;) {
        valid();
        spec = getDesktopTextLayoutSpec(imageSize, size * scale, info.style, session.floor);
        result = await measure(text, size, spec.wrapWidth / scale);
        valid();
        const next = text !== session.initialText ? getNextDesktopTextFontSize(spec, size * scale, result.documentHeight * scale) / scale : size;
        if(next === size) break;
        size = next;
      }
      const pad = size * (getTextAppearance(info).backgroundColor ? .3 : .2);
      let ideal = Math.max(0, result.renderingInfo.width - pad * 2) * scale;
      if(!text) {
        const placeholder = await measure(I18n.format('MediaEditor.TypeSomething', true), size, 1e6);
        valid();
        ideal = Math.max(ideal, Math.max(0, placeholder.renderingInfo.width - pad * 2) * scale);
      }
      const width = getDesktopTextProxyWidth(spec, ideal) / scale;
      result = await measure(text, size, width, width + 2 * pad);
      valid();
      await stageTextDom('mutate', () => {
        valid();
        session.size = size;
        session.measured = result;
        setLayoutError(undefined);
        setDesktopLayout({size, width: width + 2 * pad});
        // Keep the stored document untouched during editing; the preview owns
        // only its background, never the live caret/IME nodes.
        paintDesktopBackground(result);
      });
    })();
    session.pending = work;
    work.catch(reportError);
  }

  function paintDesktopBackground(result: Measurement) {
    container.querySelector('.media-editor__text-layer-background')?.remove();
    const path = createTextBackgroundPath(result.renderingInfo.lines);
    const color = getTextAppearance(props.layer.textInfo).backgroundColor;
    if(color) {
      updateBackgroundStyle(container, path.join(' '), color, result.renderingInfo);
    } else if(props.layer.textInfo.style === 'outline') {
      // Use recovered lines for the outline too, not the unwrapped live blocks.
      const info = props.layer.textInfo;
      const svg = contentEditable.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', String(result.renderingInfo.width));
      svg.setAttribute('height', String(result.renderingInfo.height));
      svg.classList.add('media-editor__text-layer-background');
      let top = 0;
      for(const line of result.renderingInfo.lines) {
        const text = contentEditable.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.textContent = line.content;
        text.setAttribute('x', String(line.left + .2 * result.fontSize));
        text.setAttribute('y', String(top + line.height * fontInfo().baseline));
        text.setAttribute('fill', 'none');
        text.setAttribute('stroke', info.color);
        text.setAttribute('stroke-width', String(result.fontSize * .15));
        text.style.fontFamily = fontInfo().fontFamily;
        text.style.fontWeight = String(fontInfo().fontWeight);
        text.style.fontSize = result.fontSize + 'px';
        text.style.fontStyle = fontInfo().fontStyle || 'normal';
        svg.append(text);
        top += line.height;
      }
      container.prepend(svg);
    }
  }

  function finishDesktopSession(): void | Promise<void> {
    const session = desktopSession;
    if(!session) return;
    if(session.finishing) return session.finishing;
    // Focus-only sessions do not publish fresh geometry or normalized lines.
    if(snapshotDesktopText(contentEditable) !== session.text) scheduleDesktopMeasurement();
    if(session.text === session.initialText && !composing) {
      stopDesktopSession();
      sessionStart = undefined;
      if(props.layer.textRenderingInfo) paintDesktopBackground({renderingInfo: props.layer.textRenderingInfo,
        fontSize: props.layer.textInfo.size} as Measurement);
      if(editorState.draftTextLayer === props.layer.id && !session.text.trim()) discardDraft();
      else if(editorState.editingTextLayer === props.layer.id) editorState.editingTextLayer = undefined;
      return;
    }
    const work = (async() => {
      // Assign finishing before blur re-enters this function. Native composition
      // must end before any stored-line publication is permitted.
      await Promise.resolve();
      if(contentEditable.ownerDocument.activeElement === contentEditable) contentEditable.blur();
      if(composing) throw new Error('Finish text composition before applying the edit');
      if(snapshotDesktopText(contentEditable) !== session.text) scheduleDesktopMeasurement();
      for(;;) {
        const pending = session.pending;
        try { await pending; } catch(error) {
          if(!session.cancelled && pending !== session.pending) continue;
          throw error;
        }
        if(session.cancelled || desktopSession !== session) throw new DOMException('Text session cancelled', 'AbortError');
        if(pending !== session.pending) continue;
        const result = session.measured;
        if(!result) throw new Error('Text measurement did not complete');
        let committed: Measurement;
        try {
          committed = await measureDesktopText({text: result.renderingInfo.lines.map(line => line.content).join('\n'),
            info: {...unwrap(props.layer.textInfo), size: session.size}, wrapWidth: 1e6,
            ownerDocument: contentEditable.ownerDocument, signal: session.abort.signal});
        } catch(error) {
          if(!session.cancelled && pending !== session.pending) continue;
          throw error;
        }
        if(session.cancelled || desktopSession !== session) throw new DOMException('Text session cancelled', 'AbortError');
        if(pending !== session.pending) continue;
        // Selection can reorder layers while the final copy is being measured.
        const index = mediaState.resizableLayers.findIndex(layer => layer.id === props.layer.id);
        if(index < 0) throw new DOMException('Text layer removed', 'AbortError');
        const renderingInfo = {...committed.renderingInfo, path: createTextBackgroundPath(committed.renderingInfo.lines)};
        const current = cloneLayer();
        const draft = session.draft;
        const entry = createDesktopTextSessionEdit({before: session.before, current, index,
          edited: session.text !== session.initialText, renderingInfo, fontSize: session.size});
        const empty = !session.text.trim();
        // End ownership before publishing stored lines; only now may restoreText
        // replace nodes, with the editable no longer being edited/composed.
        stopDesktopSession();
        sessionStart = undefined;
        if(editorState.editingTextLayer === props.layer.id) editorState.editingTextLayer = undefined;
        if(draft && editorState.draftTextLayer === props.layer.id) editorState.draftTextLayer = undefined;
        if(empty) {
          mediaState.resizableLayers.splice(index, 1);
          if(!draft) actions.pushToHistory({path: ['resizableLayers', index], findBy: {id: current.id},
            oldValue: {...current, textRenderingInfo: session.before.textRenderingInfo}, newValue: HistoryItem.RemoveArrayItem});
        } else if(entry) {
          preserveInitialDesktopGeometry = false;
          modifyMutable(props.layer, reconcile(entry.newValue));
          if(editorState.selectedResizableLayer === props.layer.id) {
            modifyMutable(editorState.currentTextLayerInfo, reconcile(props.layer.textInfo));
          }
          actions.pushToHistory(draft ? {...entry, oldValue: HistoryItem.RemoveArrayItem} : entry);
        }
        return;
      }
    })();
    session.finishing = work;
    work.catch(error => { session.finishing = undefined; reportError(error); });
    return work;
  }

  function stopDesktopSession() {
    const session = desktopSession;
    if(!session) return;
    session.cancelled = true;
    session.abort.abort();
    session.unregister();
    desktopSession = undefined;
    setDesktopLayout(undefined);
  }

  function createLines(contents: string[]) {
    return contents.map(content => {
      const line = document.createElement('div');
      line.className = 'media-editor__text-line';
      line.textContent = content;
      return line;
    });
  }

  const onFocus = () => {
    if(desktopSession?.finishing) {
      contentEditable.blur();
      return;
    }
    sessionStart ||= cloneLayer();
    startDesktopSession();
    batch(() => {
      selectResizableLayer(editorState, props.layer);
      editorState.editingTextLayer = props.layer.id;
    });
  };

  // The mobile entity menu and double-click enter the same existing editable.
  // Publication can remove an empty entity or outlive this component/session.
  const editExistingText = () => {
    if(isSessionLeaving(accountSession)) return;
    const work = textSessions.afterFinish(() => {
      if(disposed || isSessionLeaving(accountSession) || !isMobile() || isEditingForAvatar ||
        !mediaState.resizableLayers.some(layer => layer.id === props.layer.id && layer.type === 'text')) return;
      onFocus();
    });
    if(work) work.catch(reportError);
  };

  const fontInfo = () => fontInfoMap[props.layer.textInfo.font];

  function finishEditing() {
    if(desktopSession) {
      const work = finishDesktopSession();
      if(work) work.catch(reportError);
      return;
    }
    const before = sessionStart;
    sessionStart = undefined;
    if(!before) return;
    const layers = mediaState.resizableLayers;
    const idx = layers.findIndex(layer => layer.id === props.layer.id);
    const draft = editorState.draftTextLayer === props.layer.id;
    if(draft) editorState.draftTextLayer = undefined;
    if(idx < 0) return;
    const after = cloneLayer();
    const empty = !contentEditable.innerText.trim();
    if(draft) {
      if(empty) discardDraft();
      else actions.pushToHistory({
        path: ['resizableLayers', idx],
        newValue: after,
        oldValue: HistoryItem.RemoveArrayItem,
        findBy: {id: after.id}
      });
      return;
    }
    if(JSON.stringify(textContents(before)) === renderedText) return;
    // Keep transforms and formatting owned by their own history entries.
    const oldValue = {...after, textRenderingInfo: before.textRenderingInfo};
    if(empty) layers.splice(idx, 1);
    actions.pushToHistory({
      path: ['resizableLayers', idx],
      newValue: empty ? HistoryItem.RemoveArrayItem : after,
      oldValue,
      findBy: {
        id: after.id
      }
    });
  }

  function discardDraft() {
    sessionStart = undefined;
    editorState.draftTextLayer = undefined;
    const idx = mediaState.resizableLayers.findIndex(layer => layer.id === props.layer.id);
    if(idx >= 0) mediaState.resizableLayers.splice(idx, 1);
    if(editorState.editingTextLayer === props.layer.id) editorState.editingTextLayer = undefined;
    if(editorState.selectedResizableLayer === props.layer.id) editorState.selectedResizableLayer = undefined;
  }

  function cancelEditing() {
    const wasDesktop = !!desktopSession;
    stopDesktopSession();
    const before = sessionStart;
    sessionStart = undefined; // Blur must not commit the cancelled session.
    batch(() => {
      editorState.editingTextLayer = undefined;
      if(editorState.draftTextLayer === props.layer.id) {
        discardDraft();
      } else if(before) {
        if(wasDesktop) {
          // Stored lines were deliberately not changed by the live preview, so
          // reconciliation alone would not trigger the text restoration effect.
          contentEditable.blur();
          contentEditable.replaceChildren(...createLines(textContents(before)));
          renderedText = JSON.stringify(textContents(before));
        }
        modifyMutable(props.layer, reconcile(before));
        if(editorState.selectedResizableLayer === props.layer.id) {
          modifyMutable(editorState.currentTextLayerInfo, reconcile(before.textInfo));
        }
        if(wasDesktop && before.textRenderingInfo) paintDesktopBackground({renderingInfo: before.textRenderingInfo,
          fontSize: before.textInfo.size} as Measurement);
      }
    });
    contentEditable.blur();
  }

  function updateBackground() {
    if(desktopSession) {
      if(!composing) scheduleDesktopMeasurement();
      return;
    }
    if(preserveInitialDesktopGeometry && isDesktop()) {
      if(JSON.stringify(unwrap(props.layer.textInfo)) === initialTextInfo && props.layer.textRenderingInfo &&
        snapshotDesktopText(contentEditable) === textContents().join('\n')) {
        renderedText = JSON.stringify(textContents());
        paintDesktopBackground({renderingInfo: props.layer.textRenderingInfo, fontSize: props.layer.textInfo.size} as Measurement);
        return;
      }
      // A real format change owns a fresh measurement; reverting that format
      // later must not mistake its newly measured boxes for the saved originals.
      preserveInitialDesktopGeometry = false;
      keepDesktopGeometry = false;
    }
    // Browsers may leave root text/BR nodes after select-all/delete or paste.
    // Normalize a measuring copy, never the live nodes holding the caret/IME range.
    let layout = contentEditable;
    if(!layout.childNodes.length || Array.from(layout.childNodes).some(node =>
      !(node instanceof HTMLDivElement) || /[\r\n]/.test(node.innerText)
    )) {
      layout = contentEditable.cloneNode(false) as HTMLDivElement;
      layout.removeAttribute('contenteditable');
      layout.removeAttribute('role');
      layout.setAttribute('aria-hidden', 'true');
      Object.assign(layout.style, {position: 'absolute', visibility: 'hidden', pointerEvents: 'none'});
      const text = contentEditable.innerText.replace(/\r\n/g, '\n');
      layout.append(...createLines(text.split('\n')));
      container.append(layout);
    }
    container.querySelector('.media-editor__text-layer-background')?.remove();
    const lines = getLinesRenderingInfo(layout, props.layer.textInfo.alignment, layout !== contentEditable);
    const path = createTextBackgroundPath(lines);

    const {backgroundColor} = getTextAppearance(props.layer.textInfo);
    if(backgroundColor) updateBackgroundStyle(container, path.join(' '), backgroundColor);
    if(props.layer.textInfo.style === 'outline') updateOutlineStyle(container, layout, props.layer.textInfo);

    renderedText = JSON.stringify(lines.map(line => line.content));
    props.layer.textRenderingInfo =  {
      width: container.clientWidth,
      height: container.clientHeight,
      path,
      lines
    };
    if(layout !== contentEditable) layout.remove();
  }

  function selectAll() {
    const range = contentEditable.ownerDocument.createRange();
    range.selectNodeContents(contentEditable);
    const selection = contentEditable.ownerDocument.defaultView.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  createEffect(() => {
    track(() => ({...props.layer.textInfo}));
    untrack(() => {
      restoreText();
      updateBackground();
    });
  });

  createEffect(on(() => [props.layer.textInfo.font, props.layer.textInfo.size], () => {
    let active = true;
    onCleanup(() => active = false);
    const info = props.layer.textInfo;
    const doc = contentEditable.ownerDocument;
    // Loading only changes geometry; never restore content, focus or history.
    loadEditorFont(fontInfo(), info.size, contentEditable.textContent, doc).then(() => {
      if(active && !(isDesktop() && keepDesktopGeometry && !desktopSession)) updateBackground();
    }).catch(() => {}); // A failed font load is retried (and rejected) on export.
  }));

  function restoreText() {
    const contents = textContents();
    if(desktopSession) return false;
    if(JSON.stringify(contents) === renderedText) return false;
    // A history restore is not another editing session. Never rewrite live
    // input on its own measurement updates: that loses the caret and native undo.
    sessionStart = undefined;
    contentEditable.replaceChildren(...createLines(contents));
    return true;
  }

  createEffect(on(() => JSON.stringify(textContents()), () => {
    if(restoreText()) untrack(updateBackground);
  }));

  const isThisLayerSelected = createMemo(() => props.layer.id === editorState.selectedResizableLayer);
  const isEditing = createMemo(() => isThisLayerSelected() && props.layer.id === editorState.editingTextLayer);

  createEffect(on(isEditing, editing => {
    if(editing) {
      contentEditable.focus();
      selectAll();
    } else if(contentEditable.ownerDocument.activeElement === contentEditable) {
      contentEditable.blur();
    }
  }));

  // Finish before the responsive shell changes ownership of the text controls.
  createEffect(on(isMobile, () => {
    if(sessionStart) {
      finishEditing();
      editorState.editingTextLayer = undefined;
    }
  }, {defer: true}));

  createEffect(() => {
    if(!isThisLayerSelected() && editorState.editingTextLayer === props.layer.id) {
      editorState.editingTextLayer = undefined;
    }
  });
  createEffect(
    on(() => ({...editorState.currentTextLayerInfo}), () => {
      if(editorState.selectedResizableLayer !== props.layer.id) return;
      modifyMutable(props.layer.textInfo, reconcile(editorState.currentTextLayerInfo));
    })
  );

  onMount(() => {
    onCleanup(appNavigationController.registerEscapeHandler(() => {
      if(!isDesktop() || contentEditable.ownerDocument.activeElement !== contentEditable || !isEditing()) return true;
      if(composing) return false;
      cancelEditing();
      return false;
    }));
    container.addEventListener('dragstart', (e: Event) => {
      e.preventDefault();
    });
  });

  onCleanup(() => {
    disposed = true;
    stopDesktopSession();
    if(editorState.draftTextLayer !== props.layer.id) return;
    discardDraft();
  });

  let container: HTMLDivElement;
  let contentEditable: HTMLDivElement;

  const appearance = createMemo(() => getTextAppearance(props.layer.textInfo));

  const initialContent = createLines(textContents());

  const children = (
    <div
      ref={container}
      class="media-editor__text-layer"
      onDblClick={() => {
        if(isMobile() && !isEditingForAvatar) editExistingText();
        else onFocus();
      }}
      classList={{
        'media-editor__text-layer--desktop-editing': !!desktopLayout(),
        'media-editor__text-layer--with-bg': !!appearance().backgroundColor
      }}
      style={{
        'color': appearance().textColor,
        'font-size': (desktopLayout()?.size ?? props.layer.textInfo.size) + 'px',
        'width': desktopLayout() ? desktopLayout().width + 'px' : undefined,
        '--desktop-text-padding': livePadding(desktopLayout()?.size ?? props.layer.textInfo.size) + 'px',
        'font-family': fontInfo().fontFamily,
        'font-weight': fontInfo().fontWeight,
        'font-style': fontInfo().fontStyle || 'normal',
        'font-synthesis': props.layer.textInfo.font.startsWith('android-') ? 'none' : undefined,
        'text-align': props.layer.textInfo.alignment === 'left' ? 'left' : props.layer.textInfo.alignment === 'center' ? 'center' : 'right',
        '--text-line-margin-left': props.layer.textInfo.alignment === 'left' ? '0px' : 'auto',
        '--text-line-margin-right': props.layer.textInfo.alignment === 'right' ? '0px' : 'auto'
      }}
    >
      {/* * translate="no": the typed text is read back out of this element and baked into the image */}
      <div
        ref={contentEditable}
        class="media-editor__text-layer-layout"
        contenteditable={isEditing() ? 'plaintext-only' : 'false'}
        tabIndex={Modes.a11y ? 0 : undefined}
        style={{'min-height': '1.33em', 'min-width': '1ch'}}
        role="textbox"
        aria-multiline={true}
        aria-readonly={!isEditing()}
        aria-invalid={!!layoutError()}
        title={layoutError()}
        dir="auto"
        aria-label={I18n.format('MediaEditor.TypeSomething', true)}
        translate="no"
        onInput={() => updateBackground()}
        onCompositionStart={() => { composing = true; }}
        onCompositionEnd={() => { composing = false; if(desktopSession) scheduleDesktopMeasurement(); }}
        onFocus={onFocus}
        onBlur={() => {
          finishEditing();
          if(editorState.editingTextLayer === props.layer.id) editorState.editingTextLayer = undefined;
        }}
        onKeyDown={event => {
          if(event.isComposing || composing) return;
          if(event.key === 'Escape' && (isDesktop() || Modes.a11y)) {
            cancelEvent(event);
            if(isDesktop()) cancelEditing();
            else contentEditable.blur();
          }
        }}
      >
        {initialContent}
      </div>
    </div>
  ); // Needs to be rendered here for hot reload to work properly

  return (
    <ResizableContainer layer={props.layer} onEditText={editExistingText}>
      {children}
    </ResizableContainer>
  );
}

function createTextBackgroundPath(lines: TextRenderingInfoLine[]) {
  const first = lines[0];

  const rounding = first.height * 0.3;

  const arcParams = (r: number, s: number = 1) => [r, r, 0, 0, s];

  const path = [];
  path.push('M', first.left, rounding);

  path.push('A', ...arcParams(rounding), first.left + rounding, 0);
  path.push('L', first.right - rounding, 0);
  path.push('A', ...arcParams(rounding), first.right, rounding);

  let prevPosition = first;
  let prevY = first.height;

  for(let i = 1; i < lines.length; i++) {
    const position = lines[i];

    const diffSign = position.right > prevPosition.right ? 1 : -1;
    const diff = Math.min(Math.abs((position.right - prevPosition.right) / 2), rounding) * diffSign;
    const currentRounding = Math.abs(diff);

    path.push('L', prevPosition.right, prevY - currentRounding);
    path.push('A', ...arcParams(currentRounding, diffSign === 1 ? 0 : 1), prevPosition.right + diff, prevY);
    path.push('L', position.right - diff, prevY);
    path.push('A', ...arcParams(currentRounding, diffSign === 1 ? 1 : 0), position.right, prevY + currentRounding);

    prevY += position.height;
    prevPosition = position;
  }

  path.push('L', prevPosition.right, prevY - rounding);
  path.push('A', ...arcParams(rounding), prevPosition.right - rounding, prevY);
  path.push('L', prevPosition.left + rounding, prevY);
  path.push('A', ...arcParams(rounding), prevPosition.left, prevY - rounding);

  const last = lines[lines.length - 1];
  prevY -= last.height;
  for(let i = lines.length - 2; i >= 0; i--) {
    const position = lines[i];

    const diffSign = position.left > prevPosition.left ? 1 : -1;
    const diff = Math.min(Math.abs((position.left - prevPosition.left) / 2), rounding) * diffSign;
    const currentRounding = Math.abs(diff);

    path.push('L', prevPosition.left, prevY + currentRounding);
    path.push('A', ...arcParams(currentRounding, diffSign !== 1 ? 0 : 1), prevPosition.left + diff, prevY);
    path.push('L', position.left - diff, prevY);
    path.push('A', ...arcParams(currentRounding, diffSign !== 1 ? 1 : 0), position.left, prevY - currentRounding);

    prevY -= position.height;
    prevPosition = position;
  }

  return path;
}

function updateBackgroundStyle(container: HTMLDivElement, path: string, color: string,
  dimensions = {width: container.clientWidth, height: container.clientHeight}) {
  const svg = createElementFromMarkup(`
    <svg width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">
      <path d="${path}" fill="${color}" />
    </svg>
  `);
  svg.classList.add('media-editor__text-layer-background');
  container.prepend(svg);

  return path;
}

function updateOutlineStyle(container: HTMLDivElement, contentEditable: HTMLDivElement, info: TextLayerInfo) {
  const fontInfo = fontInfoMap[info.font];
  function updateSvg(div: HTMLDivElement) {
    div.querySelector('.media-editor__text-layer-svg-outline')?.remove();
    const stretch = info.size * 0.5;
    const w = div.clientWidth + stretch;
    const h = div.clientHeight + stretch;
    const svg = createElementFromMarkup(`
      <div class="media-editor__text-layer-svg-outline" style="width: ${w}px; height: ${h}px;">
        <svg style="width: ${w}px; height: ${h}px;" viewBox="${-stretch / 2} 0 ${div.clientWidth + stretch / 2} ${div.clientHeight + stretch}">
          <text
            x="${info.size * 0.2}"
            y="${info.size * 1.33 * fontInfo.baseline}"
            style="font-size:${info.size}px;stroke:${info.color};stroke-width:${div.clientHeight * 0.15}px;font-family:${fontInfo.fontFamily};font-weight:${fontInfo.fontWeight};font-style:${fontInfo.fontStyle || 'normal'};"
          ></text>
        </svg>
      </div>
    `);
    // the line is text anyone could have typed or pasted: written into the markup, it would be markup
    svg.querySelector('text').textContent = div.innerText;
    div.prepend(svg);
  }

  const bgDiv = document.createElement('div');
  bgDiv.classList.add('media-editor__text-layer-background', 'media-editor__text-layer-background--as-layout');
  bgDiv.innerHTML = contentEditable.innerHTML;
  container.prepend(bgDiv);
  Array.from(bgDiv.children).forEach((line) => {
    if(line instanceof HTMLDivElement) updateSvg(line);
  });
}
