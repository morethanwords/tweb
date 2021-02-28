import AppTwoStepVerificationTab from ".";
import { SettingSection } from "../..";
import { attachClickEvent, cancelEvent, canFocus } from "../../../../helpers/dom";
import { AccountPassword } from "../../../../layer";
import passwordManager from "../../../../lib/mtproto/passwordManager";
import RichTextProcessor from "../../../../lib/richtextprocessor";
import Button from "../../../button";
import { putPreloader } from "../../../misc";
import PasswordMonkey from "../../../monkeys/password";
import PasswordInputField from "../../../passwordInputField";
import { ripple } from "../../../ripple";
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
    this.title.innerHTML = isNew ? 'Enter a Password' : 'Enter your Password';

    const section = new SettingSection({
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const passwordInputField = this.passwordInputField = new PasswordInputField({
      name: 'enter-password',
      label: isNew ? 'Enter a Password' : (this.state.hint ?? 'Password')
    });

    const monkey = new PasswordMonkey(passwordInputField, 157);
    monkey.load();

    const btnContinue = Button('btn-primary btn-color-primary', {text: 'CONTINUE'});

    inputWrapper.append(passwordInputField.container, btnContinue);
    section.content.append(monkey.container, inputWrapper);

    this.scrollable.container.append(section.container);

    passwordInputField.input.addEventListener('keypress', (e) => {
      if(passwordInputField.input.classList.contains('error')) {
        passwordInputField.input.classList.remove('error');
        btnContinue.innerText = 'CONTINUE';
        ripple(btnContinue);
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
  
          passwordInputField.label.innerHTML = this.state.hint ? RichTextProcessor.wrapEmojiText(this.state.hint) : 'Password';
        });
      };
  
      const submit = (e?: Event) => {
        if(!verifyInput()) {
          cancelEvent(e);
          return;
        }

        btnContinue.setAttribute('disabled', 'true');
        btnContinue.textContent = 'PLEASE WAIT...';
        putPreloader(btnContinue);
  
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
              btnContinue.innerText = 'INVALID PASSWORD';
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
  }

  onOpenAfterTimeout() {
    if(!canFocus(this.isFirst)) return;
    this.passwordInputField.input.focus();
  }
}
