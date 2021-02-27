import { SettingSection } from "../..";
import { AccountPassword } from "../../../../layer";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
import Button from "../../../button";
import SidebarSlider, { SliderSuperTab } from "../../../slider";
import { wrapSticker } from "../../../wrappers";
import InputField from "../../../inputField";
import AppTwoStepVerificationEmailTab from "./email";
import { attachClickEvent, cancelEvent } from "../../../../helpers/dom";
import { toast } from "../../../toast";

export default class AppTwoStepVerificationHintTab extends SliderSuperTab {
  public inputField: InputField;
  public state: AccountPassword;
  public plainPassword: string;
  public newPassword: string;

  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  protected init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-hint');
    this.title.innerHTML = 'Password Hint';

    const section = new SettingSection({
      noDelimiter: true
    });

    const emoji = '💡';
    const doc = appStickersManager.getAnimatedEmojiSticker(emoji);
    const stickerContainer = document.createElement('div');

    if(doc) {
      wrapSticker({
        doc,
        div: stickerContainer,
        loop: false,
        play: true,
        width: 160,
        height: 160,
        emoji
      }).then(() => {
        // this.animation = player;
      });
    } else {
      stickerContainer.classList.add('media-sticker-wrapper');
    }

    section.content.append(stickerContainer);

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const inputField = this.inputField = new InputField({
      name: 'hint',
      label: 'Hint'
    });

    inputField.input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter') {
        cancelEvent(e);
        return inputField.value ? onContinueClick() : onSkipClick();
      }
    });

    const goNext = (e?: Event, saveHint?: boolean) => {
      if(e) {
        cancelEvent(e);
      }
      
      const hint = saveHint ? inputField.value : undefined;
      if(hint && this.newPassword === hint) {
        toast('Hint must be different from your password');
        return;
      }

      const tab = new AppTwoStepVerificationEmailTab(this.slider);
      tab.state = this.state;
      tab.plainPassword = this.plainPassword;
      tab.newPassword = this.newPassword;
      tab.hint = hint;

      tab.open();
    };

    const btnContinue = Button('btn-primary btn-color-primary', {text: 'CONTINUE'});
    const btnSkip = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'SKIP'});

    const onContinueClick = (e?: Event) => goNext(e, true);
    const onSkipClick = (e?: Event) => goNext(e, false);
    attachClickEvent(btnContinue, onContinueClick);
    attachClickEvent(btnSkip, onSkipClick);

    inputWrapper.append(inputField.container, btnContinue, btnSkip);

    section.content.append(inputWrapper);

    this.scrollable.container.append(section.container);
  }

  onOpenAfterTimeout() {
    this.inputField.input.focus();
  }
}
