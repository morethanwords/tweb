import {Node, type NodeViewRendererProps, mergeAttributes} from '@tiptap/core';
import {NodeSelection} from '@tiptap/pm/state';
import type {EditorView, NodeView} from '@tiptap/pm/view';
import {instantViewStyles} from '@components/instantViewFormatting';
import {renderLatexInto} from '@components/instantViewMath';
import attachChatInputMathTooltip from '@components/chat/inputEditor/mathTooltip';
import classNames from '@helpers/string/classNames';
import {createFullySelectedNodeDecorationPlugin} from '@components/chat/inputEditor/extensions/nodeViewHelpers';

// WebKit cannot hold a selection beside an uneditable block: ProseMirror makes the block after each end
// editable for the moment it sets a node selection. A block formula typeset afterwards (the first one
// on a page waits for Temml to load) makes WebKit move such a selection, there and then, to the next
// editable place, whether it is on the formula or on an uneditable block beside it, and the editor
// would follow it. Put it back the same way, before the editor's mutation observer reads it, so it
// runs synchronously after the typeset.
function keepNodeSelectionInDOM(view: EditorView) {
  const {selection} = view.state;
  if(!(selection instanceof NodeSelection) || selection.$from.parent.inlineContent || !view.hasFocus()) return;
  // where ProseMirror puts the ends of a node selection
  const anchor = view.domAtPos(selection.from, selection.from ? -1 : 1);
  const head = view.domAtPos(selection.to, -1);
  const domSelection = view.dom.ownerDocument.getSelection();
  if(
    !domSelection || (
      domSelection.anchorNode === anchor.node &&
      domSelection.anchorOffset === anchor.offset &&
      domSelection.focusNode === head.node &&
      domSelection.focusOffset === head.offset
    )
  ) return;
  const uneditable = [selection.from, selection.to].map((position) => {
    const {node, offset} = view.domAtPos(position);
    const after = node.childNodes[offset];
    return after instanceof HTMLElement && after.contentEditable === 'false' ? after : undefined;
  }).filter(Boolean);
  uneditable.forEach((element) => element.contentEditable = 'true');
  domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
  uneditable.forEach((element) => element.contentEditable = 'false');
}

function createMathNodeView(
  {editor, getPos, node: initialNode}: NodeViewRendererProps,
  inline: boolean
): NodeView {
  let node = initialNode;
  let destroyed = false;
  const dom = document.createElement(inline ? 'span' : 'div');
  const latex = inline ? dom : document.createElement('div');
  dom.className = inline ? classNames(
    'chat-input-inline-math',
    instantViewStyles.Latex,
    instantViewStyles.LatexInline
  ) : classNames(
    instantViewStyles.Padding,
    'chat-input-block-math',
    instantViewStyles.MathBlockWrapper
  );
  dom.contentEditable = 'false';
  dom.setAttribute(inline ? 'data-inline-math' : 'data-block-math', '');
  if(!inline) {
    latex.className = classNames(
      'chat-input-math-content',
      instantViewStyles.Latex,
      instantViewStyles.LatexBlock
    );
    dom.append(latex);
  }

  const render = () => {
    const source = `${node.attrs.source || ''}`;
    dom.dataset.source = source;
    dom.setAttribute('aria-label', source ? `Formula: ${source}` : 'Empty formula');
    renderLatexInto(latex, source, !inline, undefined, true, inline ? undefined : () => {
      if(!destroyed) keepNodeSelectionInDOM(editor.view);
    });
  };
  render();
  const destroyMathTooltip = attachChatInputMathTooltip({
    anchor: dom,
    getSource: () => `${node.attrs.source || ''}`,
    inline,
    onOpen: () => {
      const position = getPos();
      if(typeof(position) !== 'number') return;
      const selection = NodeSelection.create(editor.state.doc, position);
      if(editor.state.selection.eq(selection)) return;
      editor.view.dispatch(
        editor.state.tr
        .setSelection(selection)
        .setMeta('addToHistory', false)
      );
    },
    onSave: (source) => {
      const position = getPos();
      if(typeof(position) !== 'number') return false;
      const currentNode = editor.state.doc.nodeAt(position);
      if(!currentNode || currentNode.type !== node.type) return false;
      const selection = NodeSelection.create(editor.state.doc, position);
      if(`${currentNode.attrs.source || ''}` === source) {
        if(!editor.state.selection.eq(selection)) {
          editor.view.dispatch(
            editor.state.tr
            .setSelection(selection)
            .setMeta('addToHistory', false)
          );
        }
        editor.view.focus();
        return true;
      }

      const transaction = editor.state.tr.setNodeMarkup(position, undefined, {
        ...currentNode.attrs,
        source
      });
      transaction.setSelection(NodeSelection.create(transaction.doc, position));
      editor.view.dispatch(transaction.scrollIntoView());
      editor.view.focus();
      return true;
    }
  });

  return {
    dom,
    update: (updatedNode) => {
      if(updatedNode.type !== node.type) return false;
      // an update can be the selection's decoration alone: typesetting again would replace the
      // formula under the selection for nothing (see keepNodeSelectionInDOM)
      const sourceChanged = updatedNode.attrs.source !== node.attrs.source;
      node = updatedNode;
      if(sourceChanged) render();
      return true;
    },
    destroy: () => {
      destroyed = true;
      destroyMathTooltip();
    },
    ignoreMutation: () => true
  };
}

export const ChatInlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      source: {default: '', rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: '[data-inline-math]',
      getAttrs: (element) => ({source: element.getAttribute('data-source') || element.textContent || ''})
    }, {
      tag: 'tg-math',
      getAttrs: (element) => ({source: element.textContent || ''})
    }, {
      tag: 'img[data-tg-math]',
      getAttrs: (element) => ({
        source: element.getAttribute('data-tg-math') || element.getAttribute('alt') || ''
      })
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    const source = `${node.attrs.source || ''}`;
    return ['span', mergeAttributes(HTMLAttributes, {
      'aria-label': source ? `Formula: ${source}` : 'Empty formula',
      'class': classNames(
        'chat-input-inline-math',
        instantViewStyles.Latex,
        instantViewStyles.LatexInline
      ),
      'contenteditable': 'false',
      'data-inline-math': '',
      'data-source': source
    }), source];
  },

  renderText({node}) {
    return `${node.attrs.source || ''}`;
  },

  addProseMirrorPlugins() {
    return [createFullySelectedNodeDecorationPlugin(
      this.type,
      'chat-input-math-selected',
      false
    )];
  },

  addNodeView() {
    return (props) => createMathNodeView(props, true);
  }
});

export const ChatBlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      source: {default: '', rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: '[data-block-math]',
      getAttrs: (element) => ({source: element.getAttribute('data-source') || element.textContent || ''})
    }, {
      tag: 'tg-math-block',
      getAttrs: (element) => ({source: element.textContent || ''})
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    const source = `${node.attrs.source || ''}`;
    return ['div', mergeAttributes(HTMLAttributes, {
      'aria-label': source ? `Formula: ${source}` : 'Empty formula',
      'class': classNames(
        instantViewStyles.Padding,
        'chat-input-block-math',
        instantViewStyles.MathBlockWrapper
      ),
      'contenteditable': 'false',
      'data-block-math': '',
      'data-source': source
    }), ['div', {
      'class': classNames(
        'chat-input-math-content',
        instantViewStyles.Latex,
        instantViewStyles.LatexBlock
      )
    }, source]];
  },

  renderText({node}) {
    return `${node.attrs.source || ''}`;
  },

  addProseMirrorPlugins() {
    return [createFullySelectedNodeDecorationPlugin(
      this.type,
      'chat-input-math-selected',
      false
    )];
  },

  addNodeView() {
    return (props) => createMathNodeView(props, false);
  }
});
