import {Extension} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';

function directListItems(list: HTMLOListElement | HTMLUListElement) {
  return Array.from(list.children).filter(
    (child): child is HTMLLIElement => child.tagName === 'LI'
  );
}

function directCheckbox(item: HTMLLIElement) {
  return Array.from(item.children).find((child): child is HTMLInputElement => (
    child.tagName === 'INPUT' && (child as HTMLInputElement).type === 'checkbox'
  ));
}

function normalizeChecklist(list: HTMLOListElement | HTMLUListElement) {
  const items = directListItems(list);
  const checkboxes = items.map(directCheckbox);
  if(!checkboxes.some(Boolean)) return;

  const taskList = list.tagName === 'UL' && checkboxes.every(Boolean);
  if(taskList) list.dataset.type = 'taskList';
  items.forEach((item, index) => {
    const checkbox = checkboxes[index];
    if(!checkbox) return;

    const checked = checkbox.checked || checkbox.hasAttribute('checked');
    if(taskList) {
      item.dataset.type = 'taskItem';
    } else {
      item.dataset.checkbox = 'true';
    }
    item.dataset.checked = checked ? 'true' : 'false';
    checkbox.remove();
  });
}

function normalizeDetails(details: HTMLDetailsElement) {
  if(details.hasAttribute('data-rich-message-details')) return;

  const ownerDocument = details.ownerDocument;
  const nativeSummary = Array.from(details.children).find(
    (child): child is HTMLElement => child.tagName === 'SUMMARY'
  );
  const summary = nativeSummary || ownerDocument.createElement('div');
  const body = ownerDocument.createElement('div');
  const bodyNodes = Array.from(details.childNodes).filter((child) => child !== nativeSummary);

  details.setAttribute('data-rich-message-details', '');
  details.setAttribute('data-editor-open', details.open ? 'true' : 'false');
  summary.setAttribute('data-details-summary', '');
  body.setAttribute('data-details-body', '');
  body.append(...bodyNodes);
  if(!body.textContent?.trim() && !body.children.length) {
    body.append(ownerDocument.createElement('p'));
  }
  details.replaceChildren(summary, body);
}

function normalizeBlockquoteCaption(blockquote: HTMLQuoteElement) {
  const caption = Array.from(blockquote.children).find((child) => child.tagName === 'CITE');
  caption?.setAttribute('data-blockquote-caption-content', '');
}

function normalizePullquote(aside: HTMLElement) {
  if(aside.hasAttribute('data-pullquote')) return;

  const ownerDocument = aside.ownerDocument;
  const caption = Array.from(aside.children).find((child) => child.tagName === 'CITE');
  const text = ownerDocument.createElement('div');
  const textNodes = Array.from(aside.childNodes).filter((child) => child !== caption);
  text.setAttribute('data-pullquote-text', '');
  text.append(...textNodes);
  aside.setAttribute('data-pullquote', '');
  if(caption) caption.setAttribute('data-pullquote-caption', '');
  aside.replaceChildren(text, ...(caption ? [caption] : []));
}

function normalizeRenderedMathBlock(container: Element) {
  const source = Array.from(container.children).find(
    (child) => child.tagName === 'TG-MATH-BLOCK'
  );
  if(source) container.replaceWith(source);
}

export function normalizeChatInputRichClipboardHTML(
  html: string,
  ownerDocument: Document = document
) {
  const template = ownerDocument.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('details').forEach(normalizeDetails);
  template.content.querySelectorAll<HTMLQuoteElement>('blockquote').forEach(normalizeBlockquoteCaption);
  template.content.querySelectorAll<HTMLElement>('aside').forEach(normalizePullquote);
  template.content.querySelectorAll('.math').forEach(normalizeRenderedMathBlock);
  template.content.querySelectorAll<HTMLOListElement | HTMLUListElement>('ol, ul')
  .forEach(normalizeChecklist);
  return template.innerHTML;
}

export function createChatInputRichClipboardPlugin(ownerDocument: Document = document) {
  return new Plugin({
    props: {
      transformPastedHTML: (html) => normalizeChatInputRichClipboardHTML(html, ownerDocument)
    }
  });
}

export const ChatInputRichClipboard = Extension.create({
  name: 'chatInputRichClipboard',

  addProseMirrorPlugins() {
    return [createChatInputRichClipboardPlugin()];
  }
});
