/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AppTwoStepVerificationTab from ".";
import { SettingSection } from "../..";
import cancelEvent from "../../../../helpers/dom/cancelEvent";
import { canFocus } from "../../../../helpers/dom/canFocus";
import { attachClickEvent } from "../../../../helpers/dom/clickEvent";
import replaceContent from "../../../../helpers/dom/replaceContent";
import setInnerHTML from "../../../../helpers/dom/setInnerHTML";
import { AccountPassword } from "../../../../layer";
import I18n, { i18n } from "../../../../lib/langPack";
import passwordManager from "../../../../lib/mtproto/passwordManager";
import RichTextProcessor from "../../../../lib/richtextprocessor";
import Button from "../../../button";
import { putPreloader } from "../../../misc";
import PasswordMonkey from "../../../monkeys/password";
import PasswordInputField from "../../../passwordInputField";
import { SliderSuperTab } from "../../../slider";
import AppTwoStepVerificationReEnterPasswordTab from "./reEnterPassword";

export default class AppTwoStepVerificationEnterPasswordTab extends SliderSuperTab {
  public state: AccountPassword;
  public passwordInputField: PasswordInputField;
  public plainPassword: string;
  public isFirst = true;
  
  protected init() {
    const isNew = !this.state.pFlags.has_password || this.plainPassword;
    this.container.classList.add('two-step-verification', 'two-step-verification-enter-password');
    this.setTitle(isNew ? 'PleaseEnterFirstPassword' : 'PleaseEnterCurrentPassword');

    const section = new SettingSection({
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const passwordInputField = this.passwordInputField = new PasswordInputField({
      name: 'enter-password',
      label: isNew ? 'PleaseEnterFirstPassword' : (this.state.hint ? undefined : 'LoginPassword'),
      labelText: !isNew && this.state.hint ? RichTextProcessor.wrapEmojiText(this.state.hint) : undefined
    });

    const monkey = new PasswordMonkey(passwordInputField, 157);

    const btnContinue = Button('btn-primary btn-color-primary');
    const textEl = new I18n.IntlElement({key: 'Continue'});

    btnContinue.append(textEl.element);

    inputWrapper.append(passwordInputField.container, btnContinue);
    section.content.append(monkey.container, inputWrapper);

    this.scrollable.container.append(section.container);

    passwordInputField.input.addEventListener('keypress', (e) => {
      if(passwordInputField.input.classList.contains('error')) {
        passwordInputField.input.classList.remove('error');
        textEl.key = 'Continue';
        textEl.update();
      }
  
      if(e.key === 'Enter') {
        return onContinueClick();
      }
    });

    const verifyInput = () => {
      if(!passwordInputField.value.length) {
        passwordInputField.input.classList.add('error');
        return false;
      }

      return true;
    };

    let onContinueClick: (e?: Event) => void;
    if(!isNew) {
      let getStateInterval: number;

      let getState = () => {
        // * just to check session relevance
        if(!getStateInterval) {
          getStateInterval = window.setInterval(getState, 10e3);
        }
  
        return passwordManager.getState().then(_state => {
          this.state = _state;
  
          if(this.state.hint) {
            setInnerHTML(passwordInputField.label, RichTextProcessor.wrapEmojiText(this.state.hint));
          } else {
            replaceContent(passwordInputField.label, i18n('LoginPassword'));
          }
        });
      };
  
      const submit = (e?: Event) => {
        if(!verifyInput()) {
          cancelEvent(e);
          return;
        }

        btnContinue.setAttribute('disabled', 'true');
        textEl.key = 'PleaseWait';
        textEl.update();
        const preloader = putPreloader(btnContinue);
  
        const plainPassword = passwordInputField.value;
        passwordManager.check(passwordInputField.value, this.state).then(auth => {
          console.log(auth);
  
          if(auth._ === 'auth.authorization') {
            clearInterval(getStateInterval);
            if(monkey) monkey.remove();
            const tab = new AppTwoStepVerificationTab(this.slider);
            tab.state = this.state;
            tab.plainPassword = plainPassword;
            tab.open();
            this.slider.removeTabFromHistory(this);
          }
        }, (err) => {
          btnContinue.removeAttribute('disabled');
          passwordInputField.input.classList.add('error');
          
          switch(err.type) {
            default:
              //btnContinue.innerText = err.type;
              textEl.key = 'TwoStepAuth.InvalidPassword';
              textEl.update();
              preloader.remove();
              passwordInputField.select();
              break;
          }
  
          getState();
        });
      };
  
      onContinueClick = submit;

      getState();
    } else {
      onContinueClick = (e) => {
        if(e) {
          cancelEvent(e);
        }

        if(!verifyInput()) return;

        const tab = new AppTwoStepVerificationReEnterPasswordTab(this.slider);
        tab.state = this.state;
        tab.newPassword = passwordInputField.value;
        tab.plainPassword = this.plainPassword;
        tab.open();
      };
    }

    attachClickEvent(btnContinue, onContinueClick);

    return monkey.load();
  }

  onOpenAfterTimeout() {
    if(!canFocus(this.isFirst)) return;
    this.passwordInputField.input.focus();
  }
}
