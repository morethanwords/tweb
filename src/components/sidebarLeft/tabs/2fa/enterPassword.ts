import AppTwoStepVerificationTab from ".";
import { SettingSection } from "../..";
import { attachClickEvent, cancelEvent } from "../../../../helpers/dom";
import { AccountPassword } from "../../../../layer";
import passwordManager from "../../../../lib/mtproto/passwordManager";
import Button from "../../../button";
import { putPreloader } from "../../../misc";
import PasswordMonkey from "../../../monkeys/password";
import PasswordInputField from "../../../passwordInputField";
import { ripple } from "../../../ripple";
import SidebarSlider, { SliderSuperTab } from "../../../slider";
import AppTwoStepVerificationReEnterPasswordTab from "./reEnterPassword";

export default class AppTwoStepVerificationEnterPasswordTab extends SliderSuperTab {
  public state: AccountPassword;
  
  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  protected init() {
    this.container.classList.add('two-step-verification-enter-password');
    this.title.innerHTML = this.state.pFlags.has_password ? 'Enter Your Password' : 'Enter a Password';

    const section = new SettingSection({
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const passwordInputField = new PasswordInputField({
      name: 'first-password',
      label: this.state.pFlags.has_password ? this.state.hint ?? 'Password' : 'Enter a Password'
    });

    const monkey = new PasswordMonkey(passwordInputField, 157);
    monkey.load();

    const btnContinue = Button('btn-primary', {text: 'CONTINUE'});

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
        return btnContinue.click();
      }
    });

    const verifyInput = () => {
      if(!passwordInputField.value.length) {
        passwordInputField.input.classList.add('error');
        return false;
      }

      return true;
    };

    if(this.state.pFlags.has_password) {
      let getStateInterval: number;

      let getState = () => {
        // * just to check session relevance
        if(!getStateInterval) {
          getStateInterval = window.setInterval(getState, 10e3);
        }
  
        return passwordManager.getState().then(_state => {
          this.state = _state;
  
          passwordInputField.label.innerText = this.state.hint ?? 'Password';
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
  
      attachClickEvent(btnContinue, submit);
  
      getState();
    } else {
      attachClickEvent(btnContinue, (e) => {
        cancelEvent(e);
        if(!verifyInput()) return;

        const tab = new AppTwoStepVerificationReEnterPasswordTab(this.slider);
        tab.state = this.state;
        tab.open();
      });
    }
  }
}
