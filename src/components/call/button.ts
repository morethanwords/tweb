import ListenerSetter from '@helpers/listenerSetter';
import {i18n, LangPackKey} from '@lib/langPack';
import Icon from '@components/icon';
import ripple from '@components/ripple';

let nextCallButtonLabelId = 0;

type CallButtonOptions = {
  text?: LangPackKey | HTMLElement,
  ariaLabel?: LangPackKey,
  isDanger?: boolean,
  noRipple?: boolean,
  callback?: () => MaybePromise<void>,
  icon?: Icon,
  isConfirm?: boolean,
  disabled?: boolean
};

export function setCallButtonLabel(button: HTMLButtonElement, key: LangPackKey) {
  const label = i18n(key).textContent;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function getCallButton(element: HTMLElement): HTMLButtonElement {
  const button = element.tagName === 'BUTTON' ?
    element as HTMLButtonElement :
    element.querySelector<HTMLButtonElement>('button.call-button');
  if(!button) {
    throw new Error('Call button element is missing');
  }

  return button;
}

function applyCallButtonDisabledState(element: HTMLElement, button: HTMLButtonElement) {
  const disabled = button.dataset.callDisabled === '1' || button.dataset.busy === '1';
  button.disabled = disabled;
  element.classList.toggle('btn-disabled', disabled);
}

export function setCallButtonDisabled(element: HTMLElement, disabled: boolean) {
  const button = getCallButton(element);
  if(disabled) button.dataset.callDisabled = '1';
  else delete button.dataset.callDisabled;
  applyCallButtonDisabledState(element, button);
}

export function setCallButtonBusy(element: HTMLElement, busy: boolean) {
  const button = getCallButton(element);
  const wasBusy = button.dataset.busy === '1';
  if(busy && !wasBusy) {
    if(button.disabled) button.dataset.callDisabled = '1';
    else delete button.dataset.callDisabled;
  }

  if(busy) button.dataset.busy = '1';
  else delete button.dataset.busy;
  if(busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
  applyCallButtonDisabledState(element, button);
}

export default function makeButton(className: string, listenerSetter: ListenerSetter, options: CallButtonOptions) {
  const _className = className + '-button';
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add(_className, 'call-button', 'rp-overflow');
  button.disabled = !!options.disabled;

  if(options.icon) {
    button.append(Icon(options.icon));
  }

  if(!options.noRipple) {
    ripple(button);
  }

  if(options.isDanger) {
    button.classList.add(_className + '-red');
  }

  if(options.isConfirm) {
    button.classList.add(_className + '-green');
  }

  if(options.callback) {
    // A native `click` is intentionally used instead of attachClickEvent.
    // On touch-capable devices that helper listens for `mousedown`, which a
    // keyboard-generated button activation never emits.
    listenerSetter.add(button)('click', options.callback);
  }

  if(options.ariaLabel) {
    setCallButtonLabel(button, options.ariaLabel);
  }

  let ret: HTMLElement = button;
  if(options.text) {
    const div = document.createElement('div');
    div.classList.add(_className + '-container', 'call-button-container');

    const textEl = typeof(options.text) === 'string' ? i18n(options.text) : options.text;
    textEl.classList.add(_className + '-text', 'call-button-text');
    textEl.id ||= `call-button-label-${++nextCallButtonLabelId}`;
    if(!options.ariaLabel) {
      button.setAttribute('aria-labelledby', textEl.id);
    }

    div.append(button, textEl);

    ret = div;
  }

  return ret;
}
