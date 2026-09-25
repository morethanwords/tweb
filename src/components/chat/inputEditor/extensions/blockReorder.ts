import {Extension} from '@tiptap/core';
import {TOUCH_HOLD_DURATION} from '@helpers/dom/touchHold';
import {Plugin} from '@tiptap/pm/state';
import {Decoration, DecorationSet, type EditorView} from '@tiptap/pm/view';
import {
  moveSelectedStructuralBlock,
  ChatBlockReorderPluginMeta,
  chatBlockReorderPluginKey,
  normalizedStructuralRange,
  structuralContentCount,
  moveStructuralRange,
  ChatBlockReorderPluginState,
  selectedStructuralBlockRange,
  structuralContainerNode,
  structuralBoundaryPosition
} from '@components/chat/inputEditor/extensions/blockStructure';
import {
  blockFrameIsVisible,
  pointerElementAtPoint,
  structuralBlockTargetForParent,
  pointIsOnBlockFrame,
  structuralDropTargetAtPoint,
  structuralBlockTargetAtTarget,
  structuralBlockElement,
  hasReorderableStructuralContainer
} from '@components/chat/inputEditor/extensions/blockTargets';

const BLOCK_FRAME_MOUSE_HIT_SIZE = 6;

const BLOCK_FRAME_TOUCH_HIT_SIZE = 12;

export const ChatBlockReorder = Extension.create({
  name: 'chatBlockReorder',

  addKeyboardShortcuts() {
    return {
      'Alt-Shift-ArrowUp': () => moveSelectedStructuralBlock(this.editor.view, -1),
      'Alt-Shift-ArrowDown': () => moveSelectedStructuralBlock(this.editor.view, 1)
    };
  },

  addProseMirrorPlugins() {
    type PointerDrag = {
      captureTarget: HTMLElement,
      clientX: number,
      clientY: number,
      pointerId: number,
      pointerType: string,
      sourceParentPosition?: number,
      sourceFrom: number,
      sourceTo: number,
      started: boolean,
      startX: number,
      startY: number,
      timer?: number
    };

    let frameHover: HTMLElement;
    let pointerDrag: PointerDrag;
    let autoScrollFrame: number;

    const dispatchMeta = (
      view: EditorView,
      meta: ChatBlockReorderPluginMeta
    ) => {
      view.dispatch(
        view.state.tr
        .setMeta(chatBlockReorderPluginKey, meta)
        .setMeta('addToHistory', false)
      );
    };

    const resetDrag = (view: EditorView) => {
      view.dom.classList.remove('chat-input-block-dragging');
      dispatchMeta(view, {reset: true});
    };

    const stopAutoScroll = (view: EditorView) => {
      if(autoScrollFrame === undefined) return;
      view.dom.ownerDocument.defaultView.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = undefined;
    };

    const scrollableParent = (view: EditorView) => {
      const appWindow = view.dom.ownerDocument.defaultView;
      let element = view.dom.parentElement;
      while(element && element !== view.dom.ownerDocument.body) {
        const overflowY = appWindow.getComputedStyle(element).overflowY;
        if(
          /auto|scroll/.test(overflowY) &&
          element.scrollHeight > element.clientHeight
        ) return element;
        element = element.parentElement;
      }
      return view.dom.ownerDocument.scrollingElement as HTMLElement;
    };

    const scheduleAutoScroll = (view: EditorView) => {
      if(autoScrollFrame !== undefined || !pointerDrag?.started) return;
      const appWindow = view.dom.ownerDocument.defaultView;
      autoScrollFrame = appWindow.requestAnimationFrame(() => {
        autoScrollFrame = undefined;
        if(!pointerDrag?.started) return;
        const scroller = scrollableParent(view);
        if(!scroller) return;
        const bounds = scroller === view.dom.ownerDocument.scrollingElement ? {
          bottom: appWindow.innerHeight,
          top: 0
        } : scroller.getBoundingClientRect();
        const threshold = Math.min(48, (bounds.bottom - bounds.top) / 4);
        const {clientX, clientY} = pointerDrag;
        const speed = clientY < bounds.top + threshold ?
          -Math.ceil((bounds.top + threshold - clientY) / 4) :
          clientY > bounds.bottom - threshold ?
            Math.ceil((clientY - bounds.bottom + threshold) / 4) :
            0;
        if(!speed) return;
        const previousScrollTop = scroller.scrollTop;
        scroller.scrollTop += Math.max(-18, Math.min(18, speed));
        if(scroller.scrollTop !== previousScrollTop) {
          updateDropIndex(
            view,
            clientX,
            clientY,
            pointerDrag.captureTarget
          );
          scheduleAutoScroll(view);
        }
      });
    };

    const clearFrameHover = () => {
      frameHover?.classList.remove('chat-input-block-frame-hover');
      frameHover = undefined;
    };

    const updateFrameHover = (view: EditorView, event: PointerEvent) => {
      if(!blockFrameIsVisible(view)) {
        clearFrameHover();
        return;
      }
      const pluginState = chatBlockReorderPluginKey.getState(view.state);
      const hitTarget = pointerElementAtPoint(
        view,
        event.clientX,
        event.clientY,
        event.target
      );
      const hovered = structuralBlockTargetForParent(
        view,
        hitTarget,
        pluginState?.selectedParentPosition
      );
      const block = (
        pluginState?.selectedFrom !== undefined &&
        pluginState.selectedTo !== undefined &&
        hovered &&
        hovered.index >= pluginState.selectedFrom &&
        hovered.index < pluginState.selectedTo
      ) ? hovered.element : undefined;
      const hitSize = event.pointerType === 'touch' ?
        BLOCK_FRAME_TOUCH_HIT_SIZE :
        BLOCK_FRAME_MOUSE_HIT_SIZE;
      const next = block && pointIsOnBlockFrame(
        block,
        event.clientX,
        event.clientY,
        hitSize
      ) ? block : undefined;
      if(frameHover === next) return;
      clearFrameHover();
      frameHover = next;
      frameHover?.classList.add('chat-input-block-frame-hover');
    };

    const startDrag = (
      view: EditorView,
      drag: PointerDrag,
      clientX: number,
      clientY: number
    ) => {
      if(pointerDrag !== drag || drag.started) return;
      drag.started = true;
      clearFrameHover();
      view.dom.classList.add('chat-input-block-dragging');
      dispatchMeta(view, {
        selectedParentPosition: drag.sourceParentPosition,
        selectedFrom: drag.sourceFrom,
        selectedTo: drag.sourceTo,
        selectionAnchor: drag.sourceFrom,
        sourceParentPosition: drag.sourceParentPosition,
        sourceFrom: drag.sourceFrom,
        sourceTo: drag.sourceTo
      });
      drag.clientX = clientX;
      drag.clientY = clientY;
      updateDropIndex(view, clientX, clientY, drag.captureTarget);
      scheduleAutoScroll(view);
    };

    const clearPointerDrag = (view: EditorView, reset: boolean) => {
      if(!pointerDrag) return;
      if(pointerDrag.timer !== undefined) {
        view.dom.ownerDocument.defaultView.clearTimeout(pointerDrag.timer);
      }
      if(pointerDrag.captureTarget.hasPointerCapture?.(pointerDrag.pointerId)) {
        pointerDrag.captureTarget.releasePointerCapture(pointerDrag.pointerId);
      }
      const started = pointerDrag.started;
      pointerDrag = undefined;
      stopAutoScroll(view);
      if(reset && started) resetDrag(view);
    };

    const updateDropIndex = (
      view: EditorView,
      clientX: number,
      clientY: number,
      fallbackTarget?: EventTarget | null
    ) => {
      const pluginState = chatBlockReorderPluginKey.getState(view.state);
      const sourceFrom = pluginState?.sourceFrom;
      const sourceTo = pluginState?.sourceTo;
      if(sourceFrom === undefined || sourceTo === undefined) return;
      const source = normalizedStructuralRange(
        view.state.doc,
        pluginState.sourceParentPosition,
        sourceFrom,
        sourceTo
      );
      if(!source) return;
      const target = structuralDropTargetAtPoint(
        view,
        source,
        clientX,
        clientY,
        fallbackTarget
      );
      if(
        pluginState.dropIndex === target?.index &&
        pluginState.dropParentPosition === target?.parentPosition
      ) return;
      dispatchMeta(view, {
        dropIndex: target?.index,
        dropParentPosition: target?.parentPosition
      });
    };

    const preventFrameTouchStart = (view: EditorView, event: TouchEvent) => {
      if(
        event.touches.length !== 1 ||
        !blockFrameIsVisible(view)
      ) return;

      const pluginState = chatBlockReorderPluginKey.getState(view.state);
      const selected = structuralBlockTargetForParent(
        view,
        event.target,
        pluginState?.selectedParentPosition
      );
      const block = (
        pluginState?.selectedFrom !== undefined &&
        pluginState.selectedTo !== undefined &&
        selected &&
        selected.index >= pluginState.selectedFrom &&
        selected.index < pluginState.selectedTo &&
        structuralContentCount(
          view.state.doc,
          pluginState.selectedParentPosition
        ) > 1
      ) ? selected.element : undefined;
      const touch = event.touches[0];
      if(
        !block ||
        !pointIsOnBlockFrame(
          block,
          touch.clientX,
          touch.clientY,
          BLOCK_FRAME_TOUCH_HIT_SIZE
        )
      ) return;

      event.preventDefault();
    };

    const finishDrop = (
      view: EditorView,
      fallbackClientX?: number,
      fallbackClientY?: number,
      fallbackTarget?: EventTarget | null
    ) => {
      const pluginState = chatBlockReorderPluginKey.getState(view.state);
      if(
        pluginState?.sourceFrom === undefined ||
        pluginState.sourceTo === undefined
      ) {
        resetDrag(view);
        return false;
      }

      const source = normalizedStructuralRange(
        view.state.doc,
        pluginState.sourceParentPosition,
        pluginState.sourceFrom,
        pluginState.sourceTo
      );
      const target = pluginState.dropIndex === undefined &&
        source &&
        fallbackClientX !== undefined &&
        fallbackClientY !== undefined ?
        structuralDropTargetAtPoint(
          view,
          source,
          fallbackClientX,
          fallbackClientY,
          fallbackTarget
        ) :
        pluginState.dropIndex === undefined ? undefined : {
          index: pluginState.dropIndex,
          parentPosition: pluginState.dropParentPosition
        };
      const moved = !source || !target ?
        undefined :
        moveStructuralRange(
          view.state,
          source,
          target.index,
          true,
          target.parentPosition
        );
      view.dom.classList.remove('chat-input-block-dragging');
      stopAutoScroll(view);
      if(!moved) {
        dispatchMeta(view, {reset: true});
        return false;
      }

      view.dispatch(moved.transaction.setMeta(chatBlockReorderPluginKey, {
        reset: true,
        selectedParentPosition: moved.parentPosition,
        selectedFrom: moved.selectedFrom,
        selectedTo: moved.selectedTo,
        selectionAnchor: moved.selectedFrom
      }));
      return true;
    };

    return [new Plugin<ChatBlockReorderPluginState>({
      key: chatBlockReorderPluginKey,

      state: {
        init: () => ({}),
        apply: (transaction, pluginState, oldState, newState) => {
          const meta = transaction.getMeta(chatBlockReorderPluginKey) as
            ChatBlockReorderPluginMeta | undefined;
          let selectedParentPosition = pluginState.selectedParentPosition;
          let selectedFrom = pluginState.selectedFrom;
          let selectedTo = pluginState.selectedTo;
          let selectionAnchor = pluginState.selectionAnchor;
          const selectionChanged = !newState.selection.eq(oldState.selection);

          if(meta?.clearSelection) {
            selectedFrom = selectedTo = selectionAnchor = undefined;
            selectedParentPosition = undefined;
          } else if(
            meta?.selectedFrom !== undefined &&
            meta.selectedTo !== undefined
          ) {
            const explicit = normalizedStructuralRange(
              newState.doc,
              meta.selectedParentPosition,
              meta.selectedFrom,
              meta.selectedTo
            );
            selectedParentPosition = explicit?.parentPosition;
            selectedFrom = explicit?.from;
            selectedTo = explicit?.to;
            selectionAnchor = meta.selectionAnchor ?? explicit?.from;
          } else if(selectionChanged) {
            const selected = selectedStructuralBlockRange(newState);
            selectedParentPosition = selected?.parentPosition;
            selectedFrom = selected?.from;
            selectedTo = selected?.to;
            selectionAnchor = selected?.from;
          } else if(transaction.docChanged && selectedFrom !== undefined) {
            const parentPosition = selectedParentPosition === undefined ?
              undefined :
              transaction.mapping.map(selectedParentPosition, -1);
            const selected = normalizedStructuralRange(
              newState.doc,
              parentPosition,
              selectedFrom,
              selectedTo
            );
            selectedParentPosition = selected?.parentPosition;
            selectedFrom = selected?.from;
            selectedTo = selected?.to;
            selectionAnchor = selected ?
              Math.max(selected.from, Math.min(selectionAnchor ?? selected.from, selected.to - 1)) :
              undefined;
          }

          const selectedState = selectedFrom === undefined ? {} : {
            selectedParentPosition,
            selectedFrom,
            selectedTo,
            selectionAnchor
          };
          if(meta?.reset || transaction.docChanged || selectionChanged) return selectedState;
          if(!meta) return pluginState;
          if(meta.sourceFrom !== undefined && meta.sourceTo !== undefined) {
            return {
              ...selectedState,
              sourceParentPosition: meta.sourceParentPosition,
              sourceFrom: meta.sourceFrom,
              sourceTo: meta.sourceTo,
              dropParentPosition: meta.dropParentPosition,
              dropIndex: meta.dropIndex
            };
          }
          if(Object.prototype.hasOwnProperty.call(meta, 'dropIndex')) {
            return {
              ...pluginState,
              ...selectedState,
              dropIndex: meta.dropIndex,
              dropParentPosition: meta.dropParentPosition
            };
          }
          return {...pluginState, ...selectedState};
        }
      },

      props: {
        decorations: (state) => {
          const pluginState = chatBlockReorderPluginKey.getState(state);
          const decorations: Decoration[] = [];
          const selected = normalizedStructuralRange(
            state.doc,
            pluginState?.selectedParentPosition,
            pluginState?.selectedFrom ?? -1,
            pluginState?.selectedTo ?? -1
          );

          if(selected) {
            const parent = structuralContainerNode(
              state.doc,
              selected.parentPosition
            );
            for(let index = selected.from; index < selected.to; ++index) {
              const position = structuralBoundaryPosition(
                state.doc,
                selected.parentPosition,
                index
              );
              const node = parent?.child(index);
              if(position < 0 || !node) continue;
              decorations.push(Decoration.node(
                position,
                position + node.nodeSize,
                {
                  class: 'chat-input-block-selected',
                  'data-chat-input-block-index': `${index}`
                }
              ));
            }
          }

          if(pluginState?.dropIndex !== undefined) {
            const indicatorPosition = structuralBoundaryPosition(
              state.doc,
              pluginState.dropParentPosition,
              pluginState.dropIndex
            );
            if(indicatorPosition < 0) {
              return decorations.length ?
                DecorationSet.create(state.doc, decorations) :
                null;
            }
            decorations.push(Decoration.widget(indicatorPosition, (view) => {
              const indicator = view.dom.ownerDocument.createElement('span');
              indicator.className = 'chat-input-block-drop-indicator';
              indicator.contentEditable = 'false';
              return indicator;
            }, {
              key: `chat-input-block-drop-indicator-${
                pluginState.dropParentPosition ?? 'root'
              }`,
              side: -2
            }));
          }

          return decorations.length ?
            DecorationSet.create(state.doc, decorations) :
            null;
        },

        handleClick: (view, _position, event) => {
          if(
            event.button !== 0 ||
            !blockFrameIsVisible(view)
          ) return false;
          const clicked = structuralBlockTargetAtTarget(view, event.target, {
            clientX: event.clientX,
            clientY: event.clientY,
            hitSize: BLOCK_FRAME_MOUSE_HIT_SIZE
          });
          if(!clicked) return false;
          const pluginState = chatBlockReorderPluginKey.getState(view.state);
          const sameParent = pluginState?.selectedFrom !== undefined &&
            pluginState.selectedParentPosition === clicked.parentPosition;
          const anchor = event.shiftKey && sameParent ?
            pluginState.selectionAnchor ?? pluginState.selectedFrom :
            clicked.index;
          clearFrameHover();
          dispatchMeta(view, {
            selectedParentPosition: clicked.parentPosition,
            selectedFrom: Math.min(anchor, clicked.index),
            selectedTo: Math.max(anchor, clicked.index) + 1,
            selectionAnchor: anchor
          });
          return event.shiftKey;
        },

        handleDOMEvents: {
          pointerdown: (view, event) => {
            if(
              !event.isPrimary ||
              event.button !== 0 ||
              !blockFrameIsVisible(view)
            ) {
              return false;
            }

            const pluginState = chatBlockReorderPluginKey.getState(view.state);
            const hitSize = event.pointerType === 'touch' ?
              BLOCK_FRAME_TOUCH_HIT_SIZE :
              BLOCK_FRAME_MOUSE_HIT_SIZE;
            const hitTarget = pointerElementAtPoint(
              view,
              event.clientX,
              event.clientY,
              event.target
            );
            const clicked = structuralBlockTargetAtTarget(view, hitTarget, {
              clientX: event.clientX,
              clientY: event.clientY,
              hitSize
            });
            if(event.shiftKey && clicked) {
              const sameParent = pluginState?.selectedFrom !== undefined &&
                pluginState.selectedParentPosition === clicked.parentPosition;
              const anchor = sameParent ?
                pluginState.selectionAnchor ?? pluginState.selectedFrom :
                clicked.index;
              clearFrameHover();
              dispatchMeta(view, {
                selectedParentPosition: clicked.parentPosition,
                selectedFrom: Math.min(anchor, clicked.index),
                selectedTo: Math.max(anchor, clicked.index) + 1,
                selectionAnchor: anchor
              });
              event.preventDefault();
              return true;
            }
            if(
              clicked &&
              (
                pluginState?.selectedFrom === undefined ||
                pluginState.selectedTo === undefined ||
                pluginState.selectedParentPosition !== clicked.parentPosition ||
                clicked.index < pluginState.selectedFrom ||
                clicked.index >= pluginState.selectedTo
              )
            ) {
              clearFrameHover();
              dispatchMeta(view, {
                selectedParentPosition: clicked.parentPosition,
                selectedFrom: clicked.index,
                selectedTo: clicked.index + 1,
                selectionAnchor: clicked.index
              });
              return false;
            }

            const sourceParentPosition = pluginState?.selectedParentPosition;
            const sourceFrom = pluginState?.selectedFrom;
            const sourceTo = pluginState?.selectedTo;
            if(
              structuralContentCount(
                view.state.doc,
                sourceParentPosition
              ) < 2
            ) return false;
            const frameTarget = structuralBlockTargetForParent(
              view,
              hitTarget,
              sourceParentPosition
            );
            const frameIndex = frameTarget ?
              frameTarget.index :
              sourceFrom;
            const block = (
              sourceFrom === undefined ||
              sourceTo === undefined ||
              frameIndex === undefined ||
              frameIndex < sourceFrom ||
              frameIndex >= sourceTo
            ) ?
              undefined :
              structuralBlockElement(view, sourceParentPosition, frameIndex);
            if(
              !block ||
              !pointIsOnBlockFrame(block, event.clientX, event.clientY, hitSize)
            ) return false;

            clearPointerDrag(view, true);
            block.setPointerCapture?.(event.pointerId);
            const appWindow = view.dom.ownerDocument.defaultView;
            const drag: PointerDrag = {
              captureTarget: block,
              clientX: event.clientX,
              clientY: event.clientY,
              pointerId: event.pointerId,
              pointerType: event.pointerType,
              sourceParentPosition,
              sourceFrom,
              sourceTo,
              started: false,
              startX: event.clientX,
              startY: event.clientY
            };
            pointerDrag = drag;
            if(event.pointerType !== 'mouse') {
              // Hold for as long as the rest of the app asks for a long press —
              // a touch that moves before that is scrolling, not dragging.
              drag.timer = appWindow.setTimeout(() => {
                startDrag(view, drag, drag.startX, drag.startY);
              }, TOUCH_HOLD_DURATION);
            }

            event.preventDefault();
            return true;
          },
          pointermove: (view, event) => {
            if(!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
              updateFrameHover(view, event);
              return false;
            }

            if(!pointerDrag.started) {
              if(pointerDrag.pointerType === 'mouse') {
                // The press landed on the block frame, where it can only mean a
                // grab, so there is nothing left to disambiguate: start on the
                // first move. A distance threshold here reads as the drag
                // standing still and then catching up.
                startDrag(
                  view,
                  pointerDrag,
                  event.clientX,
                  event.clientY
                );
              } else {
                const movedX = Math.abs(event.clientX - pointerDrag.startX);
                const movedY = Math.abs(event.clientY - pointerDrag.startY);
                if(movedX > 8 || movedY > 8) clearPointerDrag(view, false);
                return false;
              }
            }

            event.preventDefault();
            pointerDrag.clientX = event.clientX;
            pointerDrag.clientY = event.clientY;
            updateDropIndex(
              view,
              event.clientX,
              event.clientY,
              event.target
            );
            scheduleAutoScroll(view);
            return true;
          },
          pointerup: (view, event) => {
            if(!pointerDrag || pointerDrag.pointerId !== event.pointerId) return false;
            const {pointerType, started} = pointerDrag;
            clearPointerDrag(view, false);
            updateFrameHover(view, event);
            if(!started) return pointerType === 'mouse';
            event.preventDefault();
            finishDrop(
              view,
              event.clientX,
              event.clientY,
              event.target
            );
            return true;
          },
          pointercancel: (view, event) => {
            if(!pointerDrag || pointerDrag.pointerId !== event.pointerId) return false;
            const started = pointerDrag.started;
            clearPointerDrag(view, started);
            return started;
          },
          pointerleave: (_view, event) => {
            if(pointerDrag?.pointerId === event.pointerId) return false;
            clearFrameHover();
            return false;
          },
          contextmenu: (view, event) => {
            if(!pointerDrag?.started) return false;
            event.preventDefault();
            return true;
          }
        }
      },

      view: (view) => {
        const onTouchStart = (event: TouchEvent) => preventFrameTouchStart(view, event);
        const previousKeyshortcuts = view.dom.getAttribute('aria-keyshortcuts');
        view.dom.addEventListener('touchstart', onTouchStart, {
          capture: true,
          passive: false
        });
        const updateReorderable = () => {
          clearFrameHover();
          const reorderable = hasReorderableStructuralContainer(view.state.doc);
          view.dom.classList.toggle('chat-input-block-reorderable', reorderable);
          if(reorderable) {
            view.dom.setAttribute(
              'aria-keyshortcuts',
              'Alt+Shift+ArrowUp Alt+Shift+ArrowDown'
            );
          } else if(previousKeyshortcuts === null) {
            view.dom.removeAttribute('aria-keyshortcuts');
          } else {
            view.dom.setAttribute('aria-keyshortcuts', previousKeyshortcuts);
          }
        };
        updateReorderable();
        return {
          update: updateReorderable,
          destroy: () => {
            view.dom.removeEventListener('touchstart', onTouchStart, true);
            clearPointerDrag(view, false);
            stopAutoScroll(view);
            clearFrameHover();
            view.dom.classList.remove(
              'chat-input-block-dragging',
              'chat-input-block-reorderable'
            );
            if(previousKeyshortcuts === null) {
              view.dom.removeAttribute('aria-keyshortcuts');
            } else {
              view.dom.setAttribute('aria-keyshortcuts', previousKeyshortcuts);
            }
          }
        };
      }
    })];
  }
});
