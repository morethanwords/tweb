import {DOMSerializer} from '@tiptap/pm/model';
import type {NodeType} from '@tiptap/pm/model';
import type {EditorState} from '@tiptap/pm/state';
import {NodeSelection, Plugin} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import {richTextPlainText, richTextToTiptapInlineContent} from '@components/chat/inputEditor/richMessage';
import type {RichText} from '@layer';

export function setElementAttributes(element: HTMLElement, attributes: Record<string, unknown>) {
  Object.entries(attributes).forEach(([name, value]) => {
    if(value === undefined || value === null || value === false) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value === true ? '' : `${value}`);
    }
  });
}

export function renderReadonlyRichText(
  element: HTMLElement,
  text: RichText | undefined,
  editor: {schema: EditorState['schema']}
) {
  const plainText = text ? richTextPlainText(text) : '';
  element.hidden = !plainText;
  if(!plainText || !text) {
    element.replaceChildren();
    return;
  }

  try {
    const inlineContent = richTextToTiptapInlineContent(text);
    const paragraph = editor.schema.nodeFromJSON({
      type: 'paragraph',
      content: inlineContent.length ? inlineContent : undefined
    });
    const fragment = DOMSerializer
    .fromSchema(editor.schema)
    .serializeFragment(paragraph.content, {document: element.ownerDocument});
    element.replaceChildren(fragment);
  } catch{
    element.textContent = plainText;
  }
}

export function createFullySelectedNodeDecorationPlugin(
  nodeType: NodeType,
  className: string,
  decorateNodeSelection = true
) {
  return new Plugin({
    props: {
      decorations(state) {
        const {doc, selection} = state;
        if(
          selection.empty ||
          (!decorateNodeSelection && selection instanceof NodeSelection)
        ) {
          return DecorationSet.empty;
        }

        const decorations: Decoration[] = [];
        doc.nodesBetween(selection.from, selection.to, (node, position) => {
          if(
            node.type === nodeType &&
            selection.from <= position &&
            position + node.nodeSize <= selection.to
          ) {
            decorations.push(Decoration.node(position, position + node.nodeSize, {class: className}));
          }
        });

        return decorations.length ?
          DecorationSet.create(doc, decorations) :
          DecorationSet.empty;
      }
    }
  });
}
