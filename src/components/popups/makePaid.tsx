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
import {subscribeOn} from '../../helpers/solid/subscribeOn';
import Button from '../button';
import InputField from '../inputField';
import Section from '../section';
import PopupStars, {StarsStar} from './stars';

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
      const inputField = this.inputField = new InputField({
        inputMode: 'numeric',
        label: 'PaidMedia.Enter',
        plainText: true,
        withLinebreaks: false
      });

      const star = StarsStar({}) as HTMLElement;
      star.classList.add('popup-make-paid-star');
      inputField.container.append(star);

      subscribeOn(inputField.input)('input', () => {
        const value = '' + +inputField.value;
        let newValue = value.replace(/[^0-9]/g, '');
        if(+newValue > appConfig.stars_paid_post_amount_max) {
          newValue = '' + appConfig.stars_paid_post_amount_max;
        }
        inputField.setValueSilently(newValue);
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
