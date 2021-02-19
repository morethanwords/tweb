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

export default class AppTwoStepVerificationReEnterPasswordTab extends SliderSuperTab {
  public state: AccountPassword;
  
  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  protected init() {
    this.container.classList.add('two-step-verification-enter-password');
    this.title.innerHTML = 'Re-Enter your Password';

    const section = new SettingSection({
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const passwordInputField = new PasswordInputField({
      name: 're-enter-password',
      label: 'Re-Enter your Password'
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

    attachClickEvent(btnContinue, (e) => {
      cancelEvent(e);
      if(!verifyInput()) return;

      
    });
  }
}
