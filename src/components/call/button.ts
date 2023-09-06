/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../helpers/dom/clickEvent';
import ListenerSetter from '../../helpers/listenerSetter';
import {i18n, LangPackKey} from '../../lib/langPack';
import Icon from '../icon';
import ripple from '../ripple';

export default function makeButton(className: string, listenerSetter: ListenerSetter, options: {
  text?: LangPackKey | HTMLElement,
  isDanger?: boolean,
  noRipple?: boolean,
  callback?: () => void,
  icon?: Icon,
  isConfirm?: boolean,
}) {
  const _className = className + '-button';
  const buttonDiv = document.createElement('div');
  buttonDiv.classList.add(_className, 'call-button', 'rp-overflow');

  if(options.icon) {
    buttonDiv.append(Icon(options.icon));
  }

  if(!options.noRipple) {
    ripple(buttonDiv);
  }

  if(options.isDanger) {
    buttonDiv.classList.add(_className + '-red');
  }

  if(options.isConfirm) {
    buttonDiv.classList.add(_className + '-green');
  }

  if(options.callback) {
    attachClickEvent(buttonDiv, options.callback, {listenerSetter});
  }

  let ret = buttonDiv;
  if(options.text) {
    const div = document.createElement('div');
    div.classList.add(_className + '-container', 'call-button-container');

    const textEl = typeof(options.text) === 'string' ? i18n(options.text) : options.text;
    textEl.classList.add(_className + '-text', 'call-button-text');

    div.append(buttonDiv, textEl);

    ret = div;
  }

  return ret;
}
