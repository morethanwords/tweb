/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '.';
import anchorCallback from '../../helpers/dom/anchorCallback';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import placeCaretAtEnd from '../../helpers/dom/placeCaretAtEnd';
import shake from '../../helpers/dom/shake';
import {Middleware} from '../../helpers/middleware';
import {LangPackKey} from '../../lib/langPack';
import Button from '../button';
import currencyStarIcon from '../currencyStarIcon';
import InputField from '../inputField';
import Section from '../section';
import PopupStars from './stars';

export function InputStarsField(options: {
  middleware: Middleware,
  placeholder?: LangPackKey,
  label?: LangPackKey,
  max: number,
  onValue?: (stars: number) => void,
}) {
  const inputField = new InputField({
    inputMode: 'numeric',
    label: options.label,
    placeholder: options.placeholder,
    plainText: true,
    withLinebreaks: false
  });

  inputField.container.classList.add('popup-make-paid-input');

  const star = currencyStarIcon() as HTMLElement;
  star.classList.add('popup-make-paid-star');
  inputField.container.append(star);

  const onInput = () => {
    const value = '' + +inputField.value;
    let newValue = value.replace(/[^0-9]/g, '');
    if(+newValue > options.max) {
      newValue = '' + options.max;
    }
    inputField.setValueSilently(newValue);
    options.onValue?.(+newValue);
  };

  inputField.input.addEventListener('input', onInput);
  options.middleware.onDestroy(() => {
    inputField.input.removeEventListener('input', onInput);
  });

  return inputField;
}

export default class PopupMakePaid extends PopupElement {
  private inputField: InputField;

  constructor(onSave: (value: number) => void, private editingFrom?: number) {
    super('popup-make-paid', {
      closable: true,
      overlayClosable: true,
      body: true,
      title: 'PaidMedia.Title',
      withConfirm: 'PaidMedia.Button',
      footer: true,
      withFooterConfirm: true
    });

    this.footer.classList.add('abitlarger');

    attachClickEvent(this.btnConfirm, () => {
      const value = parseInt(this.inputField.value || '0');
      if(value > 0) {
        onSave(value);
        this.hide();
      } else {
        shake(this.inputField.container);
      }
    }, {listenerSetter: this.listenerSetter});

    if(editingFrom) {
      const button = Button('btn-primary btn-primary-transparent primary', {text: 'PaidMedia.KeepFree'});
      attachClickEvent(button, () => {
        onSave(0);
        this.hide();
      }, {listenerSetter: this.listenerSetter});
      this.btnConfirm.after(button);
    }

    this.d();
  }

  private async d() {
    const appConfig = await this.managers.apiManager.getAppConfig();
    this.appendSolid(() => {
      const inputField = this.inputField = InputStarsField({
        middleware: this.middlewareHelper.get(),
        label: 'PaidMedia.Enter',
        max: appConfig.stars_paid_post_amount_max
      });

      if(this.editingFrom) {
        inputField.value = '' + this.editingFrom;
      }

      setTimeout(() => {
        this.show();
        placeCaretAtEnd(inputField.input);
      }, 0);

      return (
        <Section
          caption="PaidMedia.Caption"
          captionArgs={[
            anchorCallback(() => {
              PopupElement.createPopup(PopupStars);
            })
          ]}
          noShadow
          noDelimiter
        >
          {inputField.container}
        </Section>
      );
    });
  }
}
