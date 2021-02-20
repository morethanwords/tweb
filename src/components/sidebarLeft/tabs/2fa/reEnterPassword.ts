import { SettingSection } from "../..";
import { attachClickEvent, cancelEvent } from "../../../../helpers/dom";
import { AccountPassword } from "../../../../layer";
import Button from "../../../button";
import PasswordInputField from "../../../passwordInputField";
import { ripple } from "../../../ripple";
import SidebarSlider, { SliderSuperTab } from "../../../slider";
import TrackingMonkey from "../../../monkeys/tracking";
import AppTwoStepVerificationHintTab from "./hint";

export default class AppTwoStepVerificationReEnterPasswordTab extends SliderSuperTab {
  public state: AccountPassword;
  public passwordInputField: PasswordInputField;
  public plainPassword: string;
  public newPassword: string;
  
  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  protected init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-enter-password', 'two-step-verification-re-enter-password');
    this.title.innerHTML = 'Re-Enter your Password';

    const section = new SettingSection({
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const passwordInputField = this.passwordInputField = new PasswordInputField({
      name: 're-enter-password',
      label: 'Re-Enter your Password'
    });

    const monkey = new TrackingMonkey(passwordInputField, 157);
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
        return btnContinue.click();
      }
    });

    const verifyInput = () => {
      if(this.newPassword !== passwordInputField.value) {
        passwordInputField.input.classList.add('error');
        return false;
      }

      return true;
    };

    attachClickEvent(btnContinue, (e) => {
      cancelEvent(e);
      if(!verifyInput()) return;

      const tab = new AppTwoStepVerificationHintTab(this.slider);
      tab.state = this.state;
      tab.plainPassword = this.plainPassword;
      tab.newPassword = this.newPassword;
      tab.open();
    });
  }
  
  onOpenAfterTimeout() {
    this.passwordInputField.input.focus();
  }
}
