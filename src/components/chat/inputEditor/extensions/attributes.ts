import {Extension} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import {orderedListCounterStyle, orderedListItemStyle, orderedListTypeStyle} from '@components/instantViewList';
import {getOrderedListTypePresentation} from '@lib/richTextProcessor/orderedList';
import {preserveInputRuleThroughNormalization} from '@components/chat/inputEditor/inputRules';
import {TABLE_CLIPBOARD_TITLE_HTML_ATTRIBUTE} from '@components/chat/inputEditor/tableClipboard';

function orderedListTypeFromElement(element: HTMLElement, item = false) {
  return element.getAttribute(item ? 'data-list-item-type' : 'data-list-type') ||
    element.getAttribute('type') ||
    element.style.listStyleType ||
    null;
}

function renderedOrderedListType(value: unknown, item = false) {
  const type = typeof(value) === 'string' ? value : '';
  if(!type) return {};
  const presentation = getOrderedListTypePresentation(type);
  return {
    [item ? 'data-list-item-type' : 'data-list-type']: type,
    ...(item || !presentation ? {} : {type: presentation.htmlType}),
    ...(presentation ? {style: orderedListTypeStyle(type)} : {})
  };
}

export const ChatRichMessageAttributes = Extension.create({
  name: 'chatRichMessageAttributes',

  addGlobalAttributes() {
    return [
      {
        types: ['blockquote'],
        attributes: {
          caption: {default: '', rendered: false},
          captionRichText: {default: null, rendered: false}
        }
      },
      {
        types: ['link'],
        attributes: {
          richAnchorName: {default: null, rendered: false}
        }
      },
      {
        types: ['table'],
        attributes: {
          title: {
            default: '',
            parseHTML: (element) => element.getAttribute('data-table-title') || '',
            renderHTML: (attributes) => attributes.title ? {'data-table-title': attributes.title} : {}
          },
          titleRichText: {
            default: null,
            rendered: false
          },
          titleRichHTML: {
            default: null,
            parseHTML: (element) => (
              element.getAttribute(TABLE_CLIPBOARD_TITLE_HTML_ATTRIBUTE)
            ),
            rendered: false
          },
          bordered: {
            default: true,
            parseHTML: (element) => element.getAttribute('data-bordered') !== 'false',
            renderHTML: (attributes) => ({'data-bordered': attributes.bordered ? 'true' : 'false'})
          },
          striped: {
            default: false,
            parseHTML: (element) => element.getAttribute('data-striped') === 'true',
            renderHTML: (attributes) => attributes.striped ? {'data-striped': 'true'} : {}
          },
          // layer 229: the same table with tighter cells
          compact: {
            default: false,
            parseHTML: (element) => element.getAttribute('data-compact') === 'true',
            renderHTML: (attributes) => attributes.compact ? {'data-compact': 'true'} : {}
          }
        }
      },
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          verticalAlign: {
            default: null,
            parseHTML: (element) => {
              const value = element.style.verticalAlign || element.getAttribute('valign');
              return value === 'middle' || value === 'bottom' ? value : null;
            },
            renderHTML: (attributes) => attributes.verticalAlign ? {
              style: `vertical-align: ${attributes.verticalAlign}`
            } : {}
          }
        }
      },
      {
        types: ['orderedList'],
        attributes: {
          startExplicit: {
            default: null,
            parseHTML: (element) => {
              const marker = element.getAttribute('data-list-start-explicit');
              if(marker === 'true') return true;
              if(marker === 'false') return false;
              return element.hasAttribute('start');
            },
            renderHTML: (attributes) => {
              return {
                'data-list-start-explicit': attributes.startExplicit ? 'true' : 'false',
                style: orderedListCounterStyle(attributes.start, attributes.reversed)
              };
            }
          },
          type: {
            default: null,
            parseHTML: (element) => orderedListTypeFromElement(element),
            renderHTML: (attributes) => renderedOrderedListType(attributes.type)
          },
          reversed: {
            default: false,
            parseHTML: (element) => element.hasAttribute('reversed'),
            renderHTML: (attributes) => attributes.reversed ? {reversed: ''} : {}
          }
        }
      },
      {
        types: ['listItem'],
        attributes: {
          checkbox: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-checkbox') === 'true' || null,
            renderHTML: (attributes) => attributes.checkbox ? {'data-checkbox': 'true'} : {}
          },
          checked: {
            default: null,
            parseHTML: (element) => {
              const value = element.getAttribute('data-checked');
              return value === null ? null : value === 'true';
            },
            renderHTML: (attributes) => attributes.checkbox ? {
              'data-checked': attributes.checked ? 'true' : 'false'
            } : {}
          },
          num: {default: null, rendered: false},
          value: {
            default: null,
            parseHTML: (element) => {
              const attribute = element.getAttribute('value');
              if(attribute === null) return null;
              const value = Number(attribute);
              return Number.isInteger(value) ? value : null;
            },
            renderHTML: (attributes) => Number.isInteger(attributes.value) ? {
              value: attributes.value,
              style: orderedListItemStyle(attributes.value)
            } : {}
          },
          type: {
            default: null,
            parseHTML: (element) => orderedListTypeFromElement(element, true),
            renderHTML: (attributes) => renderedOrderedListType(
              attributes.type,
              true
            )
          }
        }
      }
    ];
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        if(!transactions.some((transaction) => transaction.docChanged)) return;
        const transaction = newState.tr;
        newState.doc.descendants((node, position) => {
          if(node.type.name !== 'orderedList') return;
          const startExplicit = node.attrs.startExplicit ??
            node.attrs.start !== 1;
          const start = startExplicit ?
            node.attrs.start :
            node.attrs.reversed ? node.childCount : 1;
          if(
            node.attrs.start === start &&
            node.attrs.startExplicit === startExplicit
          ) return;
          transaction.setNodeMarkup(position, undefined, {
            ...node.attrs,
            startExplicit,
            start
          });
        });
        return transaction.docChanged ?
          preserveInputRuleThroughNormalization(newState, transaction).setMeta('addToHistory', false) :
          undefined;
      }
    })];
  }
});
