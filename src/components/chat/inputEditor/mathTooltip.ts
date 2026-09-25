import ButtonIcon from '@components/buttonIcon';
import I18n from '@lib/langPack';
import tooltipController from '@helpers/tooltipController';
import {
  CHAT_INPUT_MATH_MODE_REQUEST_EVENT,
  ChatInputMathModeRequestEvent
} from '@components/chat/inputEditor/events';

type MathTooltipOptions = {
  anchor: HTMLElement,
  getSource: () => string,
  inline: boolean,
  onOpen: () => void,
  onSave: (source: string) => boolean
};

type ActiveMathTooltip = {
  anchor: HTMLElement,
  close: () => void
};

let activeMathTooltip: ActiveMathTooltip;

export default function attachChatInputMathTooltip(options: MathTooltipOptions) {
  let closeTooltip: () => void;
  let unregisterTooltip = () => false;
  let tooltip: HTMLElement;
  let input: HTMLInputElement;

  const openTooltip = () => {
    if(tooltip?.isConnected) {
      input.focus();
      return;
    }

    activeMathTooltip?.close();
    options.onOpen();

    const ownerDocument = options.anchor.ownerDocument;
    const ownerWindow = ownerDocument.defaultView || window;
    const requestMathMode = (inline: boolean, source: string, apply: boolean) => {
      const detail: ChatInputMathModeRequestEvent['detail'] = {
        accepted: false,
        apply,
        inline,
        source
      };
      const EventConstructor = ownerWindow.CustomEvent || CustomEvent;
      options.anchor.dispatchEvent(new EventConstructor(
        CHAT_INPUT_MATH_MODE_REQUEST_EVENT,
        {bubbles: true, detail}
      ));
      return detail.accepted;
    };
    tooltip = ownerDocument.createElement('div');
    tooltip.className = [
      'markup-tooltip',
      'markup-tooltip-contextual',
      'chat-input-math-tooltip'
    ].join(' ');
    tooltip.contentEditable = 'false';
    tooltip.setAttribute('aria-label', I18n.format('Chat.Input.Editor.Math.EditTitle', true));
    tooltip.setAttribute('role', 'dialog');

    const wrapper = ownerDocument.createElement('div');
    wrapper.className = 'markup-tooltip-wrapper';
    const tools = ownerDocument.createElement('div');
    tools.className = 'markup-tooltip-tools chat-input-math-tooltip-tools';
    const inputWrapper = ownerDocument.createElement('div');
    inputWrapper.className = 'chat-input-math-tooltip-input-wrapper';
    input = ownerDocument.createElement('input');
    input.className = [
      'input-clear',
      'markup-tooltip-math-input',
      'chat-input-math-tooltip-input'
    ].join(' ');
    input.placeholder = I18n.format('Chat.Input.Editor.Math.Placeholder', true);
    input.setAttribute('aria-label', I18n.format('Chat.Input.Editor.Math.Latex', true));
    input.type = 'text';
    input.value = options.getSource();
    inputWrapper.append(input);

    const targetInline = !options.inline;
    const modeLabel = I18n.format(
      targetInline ?
        'Chat.Input.Editor.Toolbar.InlineMath' :
        'Chat.Input.Editor.Math.SeparateLine',
      true
    );
    const modeButton = ButtonIcon(options.inline ? 'expand' : 'collapse', {noRipple: true});
    modeButton.classList.add('chat-input-math-tooltip-mode');
    modeButton.type = 'button';
    modeButton.disabled = !requestMathMode(targetInline, input.value, false);
    modeButton.setAttribute('aria-label', modeLabel);
    modeButton.title = modeLabel;
    const leadingDelimiter = ownerDocument.createElement('span');
    const trailingDelimiter = ownerDocument.createElement('span');
    leadingDelimiter.className = trailingDelimiter.className = 'markup-tooltip-delimiter';
    const saveButton = ButtonIcon('checkround', {noRipple: true});
    saveButton.classList.add('chat-input-math-tooltip-save');
    saveButton.type = 'button';
    saveButton.setAttribute('aria-label', I18n.format('Save', true));
    saveButton.title = I18n.format('Save', true);
    tools.append(
      modeButton,
      leadingDelimiter,
      inputWrapper,
      trailingDelimiter,
      saveButton
    );
    wrapper.append(tools);
    tooltip.append(wrapper);
    ownerDocument.body.append(tooltip);

    const positionTooltip = () => {
      if(!tooltip?.isConnected) return;
      const anchorRect = options.anchor.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 8;
      const width = tooltipRect.width || 320;
      const height = tooltipRect.height || 48;
      const maxLeft = Math.max(viewportPadding, ownerWindow.innerWidth - width - viewportPadding);
      const left = Math.max(
        viewportPadding,
        Math.min(maxLeft, anchorRect.left + (anchorRect.width - width) / 2)
      );
      const above = anchorRect.top - height - gap;
      const maxTop = Math.max(viewportPadding, ownerWindow.innerHeight - height - viewportPadding);
      const top = above >= viewportPadding ?
        above :
        Math.min(maxTop, anchorRect.bottom + gap);
      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
    };

    const updateInputOverflow = () => {
      const maxScrollLeft = Math.max(0, input.scrollWidth - input.clientWidth);
      inputWrapper.classList.toggle('can-scroll-start', input.scrollLeft > 1);
      inputWrapper.classList.toggle(
        'can-scroll-end',
        maxScrollLeft > 1 && input.scrollLeft < maxScrollLeft - 1
      );
    };
    const onWindowResize = () => {
      positionTooltip();
      updateInputOverflow();
    };

    const validSource = () => {
      const source = input.value.trim();
      if(!source) {
        input.classList.add('error');
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }

      return source;
    };

    const save = () => {
      const source = validSource();
      if(!source) return;

      if(!options.onSave(source)) return;
      closeTooltip();
    };

    const toggleMode = () => {
      const source = validSource();
      if(!source || !requestMathMode(targetInline, source, true)) return;
      closeTooltip();
    };

    const onDocumentPointerDown = (event: Event) => {
      const target = event.target as globalThis.Node;
      if(tooltip.contains(target) || options.anchor.contains(target)) return;
      closeTooltip();
    };
    const onInput = () => {
      input.classList.remove('error');
      input.removeAttribute('aria-invalid');
      updateInputOverflow();
    };
    const onInputKeyDown = (event: KeyboardEvent) => {
      if(event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        save();
      } else if(event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeTooltip();
      }
    };
    const onButtonPointerDown = (event: PointerEvent) => {
      event.preventDefault();
    };
    const onModeClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMode();
    };
    const onSaveClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      save();
    };

    closeTooltip = () => {
      unregisterTooltip();
      ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown, true);
      ownerWindow.removeEventListener('resize', onWindowResize);
      ownerWindow.removeEventListener('scroll', positionTooltip, true);
      input.removeEventListener('input', onInput);
      input.removeEventListener('scroll', updateInputOverflow);
      input.removeEventListener('keydown', onInputKeyDown);
      modeButton.removeEventListener('pointerdown', onButtonPointerDown);
      modeButton.removeEventListener('click', onModeClick);
      saveButton.removeEventListener('pointerdown', onButtonPointerDown);
      saveButton.removeEventListener('click', onSaveClick);
      tooltip?.remove();
      if(activeMathTooltip?.anchor === options.anchor) {
        activeMathTooltip = undefined;
      }
    };

    unregisterTooltip = tooltipController.register(closeTooltip);
    activeMathTooltip = {anchor: options.anchor, close: closeTooltip};
    ownerDocument.addEventListener('pointerdown', onDocumentPointerDown, true);
    ownerWindow.addEventListener('resize', onWindowResize);
    ownerWindow.addEventListener('scroll', positionTooltip, true);
    input.addEventListener('input', onInput);
    input.addEventListener('scroll', updateInputOverflow);
    input.addEventListener('keydown', onInputKeyDown);
    modeButton.addEventListener('pointerdown', onButtonPointerDown);
    modeButton.addEventListener('click', onModeClick);
    saveButton.addEventListener('pointerdown', onButtonPointerDown);
    saveButton.addEventListener('click', onSaveClick);
    positionTooltip();
    void tooltip.offsetLeft;
    tooltip.classList.add('is-visible');
    queueMicrotask(() => {
      if(!input?.isConnected) return;
      positionTooltip();
      input.focus();
      updateInputOverflow();
    });
  };

  const onClick = (event: MouseEvent) => {
    if(
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) return;
    event.preventDefault();
    event.stopPropagation();
    openTooltip();
  };

  options.anchor.addEventListener('click', onClick);
  return () => {
    options.anchor.removeEventListener('click', onClick);
    if(activeMathTooltip?.anchor === options.anchor) {
      activeMathTooltip.close();
    }
  };
}
