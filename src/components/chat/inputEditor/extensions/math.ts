import {Node, type NodeViewRendererProps, mergeAttributes} from '@tiptap/core';
import {NodeSelection} from '@tiptap/pm/state';
import type {NodeView} from '@tiptap/pm/view';
import {instantViewStyles} from '@components/instantViewFormatting';
import {renderLatexInto} from '@components/instantViewMath';
import attachChatInputMathTooltip from '@components/chat/inputEditor/mathTooltip';
import classNames from '@helpers/string/classNames';
import {createFullySelectedNodeDecorationPlugin} from '@components/chat/inputEditor/extensions/nodeViewHelpers';

function createMathNodeView(
  {editor, getPos, node: initialNode}: NodeViewRendererProps,
  inline: boolean
): NodeView {
  let node = initialNode;
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
    renderLatexInto(latex, source, !inline);
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
      node = updatedNode;
      render();
      return true;
    },
    destroy: destroyMathTooltip,
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
