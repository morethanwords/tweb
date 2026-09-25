import {getRenderedAttributes, mergeAttributes} from '@tiptap/core';
import CodeBlock from '@tiptap/extension-code-block';
import {type AutoCodeHighlight, CodeLanguageAliases, highlightCode, highlightCodeAuto} from '@/codeLanguages';
import makeIcon from '@components/icon';
import {instantViewStyles} from '@components/instantViewFormatting';
import {toastNew} from '@components/toast';
import {
  CODE_LANGUAGE_DETECTION_META,
  getDetectedCodeBlockLanguage,
  getDisplayedAutoCodeBlockLanguage,
  withDetectedCodeBlockLanguage
} from '@components/chat/inputEditor/codeLanguage';
import callbackify from '@helpers/callbackify';
import {createCodeHeaderButton} from '@helpers/dom/codeBlockClick';
import copyFromElement from '@helpers/dom/copyFromElement';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import {setElementAttributes} from '@components/chat/inputEditor/extensions/nodeViewHelpers';

const CODE_HIGHLIGHT_CACHE_LIMIT = 64;

const CODE_AUTO_DETECTION_DELAY = 400;

type CodeHighlightResult = AutoCodeHighlight | string;

const codeHighlightCache = new Map<string, MaybePromise<CodeHighlightResult | undefined>>();

export const ChatCodeBlock = CodeBlock.extend({
  // Run code-specific Enter/ArrowDown/Backspace handling before StarterKit's base keymap.
  priority: 101,

  addAttributes() {
    return {
      detectedLanguage: {default: '', rendered: false},
      detectedLanguageCode: {default: '', rendered: false},
      joinAfter: {default: false, rendered: false},
      joinBefore: {default: false, rendered: false},
      language: {default: '', rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: 'pre',
      preserveWhitespace: 'full',
      contentElement: (element) => element.querySelector('code') || element,
      getAttrs: (element) => {
        const languageClass = [...(element.firstElementChild?.classList || [])]
        .find((className) => className.startsWith('language-'));
        return {
          language: element.getAttribute('data-language') || languageClass?.slice('language-'.length) || ''
        };
      }
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    const language = `${node.attrs.language || ''}`;
    return ['pre', mergeAttributes(HTMLAttributes, {
      'class': 'chat-input-code-block code quote-like quote-like-border',
      'data-language': language,
      'data-markup': 'markup-monospace'
    }), ['code', {class: 'code-code'}, 0]];
  },

  addNodeView() {
    return ({editor, getPos, node: initialNode}) => {
      let node = initialNode;
      let renderedAttributeNames = new Set<string>();
      const dom = document.createElement('div');
      const pre = document.createElement('pre');
      const header = document.createElement('div');
      const picker = document.createElement('button');
      const pickerLabel = document.createElement('span');
      const pickerArrow = makeIcon('down', 'inline-icon', 'inline-icon-right');
      const copyButton = createCodeHeaderButton('copy_alt', 'code-header-copy');
      const content = document.createElement('div');
      const highlightedContent = document.createElement('code');
      const contentDOM = document.createElement('code');

      dom.className = classNames(instantViewStyles.Padding, instantViewStyles.PreformattedWrapper);
      pre.className = 'chat-input-code-block code quote-like quote-like-border';
      pre.dataset.markup = 'markup-monospace';
      header.className = 'code-header';
      header.contentEditable = 'false';
      picker.type = 'button';
      picker.className = 'code-header-name chat-input-code-language-picker';
      picker.dataset.codeLanguagePicker = '';
      pickerLabel.className = 'chat-input-code-language-label';
      picker.setAttribute(
        'aria-label',
        I18n.format('Chat.Input.Editor.CodeLanguage.Choose', true)
      );
      picker.append(pickerLabel, pickerArrow);
      copyButton.contentEditable = 'false';
      copyButton.setAttribute('aria-label', I18n.format('Copy', true));
      copyButton.addEventListener('mousedown', (event) => {
        if(event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
      });
      copyButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyFromElement(contentDOM);
        toastNew({langPackKey: 'CodeCopied'});
      });
      content.className = 'code-content';
      highlightedContent.className = 'chat-input-code-highlight';
      highlightedContent.contentEditable = 'false';
      highlightedContent.setAttribute('aria-hidden', 'true');
      contentDOM.className = 'code-code';
      header.append(picker, copyButton);
      content.append(highlightedContent, contentDOM);
      pre.append(header, content);
      dom.append(pre);
      let highlightGeneration = 0;
      let autoHighlightTimeout = 0;
      let destroyed = false;

      const applyDetectedLanguage = (language: string, source: string) => {
        let position: number | undefined;
        try {
          position = getPos();
        } catch{
          return;
        }
        if(typeof(position) !== 'number') return;

        const currentNode = editor.state.doc.nodeAt(position);
        if(
          currentNode?.type.name !== 'codeBlock' ||
          currentNode.attrs.language ||
          currentNode.textContent !== source ||
          getDetectedCodeBlockLanguage(currentNode.attrs, source) === language
        ) {
          return;
        }

        const transaction = editor.state.tr.setNodeMarkup(
          position,
          undefined,
          withDetectedCodeBlockLanguage(currentNode.attrs, language, source)
        );
        transaction.setMeta(CODE_LANGUAGE_DETECTION_META, true);
        transaction.setMeta('addToHistory', false);
        editor.view.dispatch(transaction);
      };

      const renderHighlight = () => {
        const generation = ++highlightGeneration;
        window.clearTimeout(autoHighlightTimeout);
        const language = `${node.attrs.language || ''}`.toLowerCase();
        const languageName = CodeLanguageAliases[language];
        const source = node.textContent;
        const auto = !language;
        const detectedLanguage = auto ?
          getDisplayedAutoCodeBlockLanguage(node.attrs) :
          '';
        const currentDetectedLanguage = auto ?
          getDetectedCodeBlockLanguage(node.attrs, source) :
          '';
        const highlighted = (auto || !!languageName) && import.meta.env.MODE !== 'test';
        contentDOM.classList.toggle('chat-input-code-editable-highlighted', highlighted);
        highlightedContent.hidden = !highlighted;
        if(!highlighted) {
          highlightedContent.replaceChildren();
          return;
        }

        highlightedContent.textContent = source;
        if(!source.trim()) return;

        const applyHighlight = (detect: boolean, knownLanguage?: string) => {
          if(destroyed || generation !== highlightGeneration) return;

          const cacheKey = `${detect ? 'auto' : knownLanguage}\0${source}`;
          let result = codeHighlightCache.get(cacheKey);
          if(!result) {
            result = detect ?
              highlightCodeAuto(source) :
              highlightCode(source, knownLanguage);
            codeHighlightCache.set(cacheKey, result);
            if(codeHighlightCache.size > CODE_HIGHLIGHT_CACHE_LIMIT) {
              codeHighlightCache.delete(codeHighlightCache.keys().next().value);
            }
          }

          if(!result) return;
          callbackify(result, (highlight) => {
            if(destroyed || generation !== highlightGeneration || !highlight) return;
            const html = typeof(highlight) === 'string' ? highlight : highlight.html;
            highlightedContent.innerHTML = html;
            if(detect && typeof(highlight) !== 'string') {
              applyDetectedLanguage(highlight.language, source);
            }
          });
        };

        if(!auto) {
          applyHighlight(false, languageName);
          return;
        }

        if(detectedLanguage) applyHighlight(false, detectedLanguage);
        if(currentDetectedLanguage) return;
        autoHighlightTimeout = window.setTimeout(
          () => applyHighlight(true),
          CODE_AUTO_DETECTION_DELAY
        );
      };

      const update = (updatedNode: typeof node) => {
        if(updatedNode.type !== node.type) return false;
        node = updatedNode;
        const attributes = getRenderedAttributes(node, editor.extensionManager.attributes);
        renderedAttributeNames.forEach((name) => {
          if(!(name in attributes)) pre.removeAttribute(name);
        });
        setElementAttributes(pre, attributes);
        renderedAttributeNames = new Set(Object.keys(attributes));
        pre.className = classNames(
          typeof(attributes.class) === 'string' ? attributes.class : '',
          'chat-input-code-block code quote-like quote-like-border'
        );
        pre.dataset.markup = 'markup-monospace';
        const language = `${node.attrs.language || ''}`;
        const autoLabel = I18n.format('Chat.Input.Editor.CodeLanguage.Auto', true);
        const detectedLanguage = getDisplayedAutoCodeBlockLanguage(node.attrs);
        pre.dataset.language = language;
        pickerLabel.textContent = CodeLanguageAliases[language.toLowerCase()] ||
          language ||
          (detectedLanguage ? `${detectedLanguage} (${autoLabel})` : autoLabel);
        renderHighlight();
        return true;
      };
      update(node);

      return {
        dom,
        contentDOM,
        update,
        ignoreMutation: (mutation) => (
          !contentDOM.contains(mutation.target) ||
          mutation.type === 'attributes'
        ),
        destroy: () => {
          destroyed = true;
          ++highlightGeneration;
          window.clearTimeout(autoHighlightTimeout);
        }
      };
    };
  }
});
