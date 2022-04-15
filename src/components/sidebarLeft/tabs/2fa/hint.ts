/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SettingSection } from "../..";
import { AccountPassword } from "../../../../layer";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
import Button from "../../../button";
import { SliderSuperTab } from "../../../slider";
import { wrapSticker } from "../../../wrappers";
import InputField from "../../../inputField";
import AppTwoStepVerificationEmailTab from "./email";
import { toast } from "../../../toast";
import I18n from "../../../../lib/langPack";
import cancelEvent from "../../../../helpers/dom/cancelEvent";
import { attachClickEvent } from "../../../../helpers/dom/clickEvent";

export default class AppTwoStepVerificationHintTab extends SliderSuperTab {
  public inputField: InputField;
  public state: AccountPassword;
  public plainPassword: string;
  public newPassword: string;

  protected init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-hint');
    this.setTitle('TwoStepAuth.SetupHintTitle');

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
      label: 'TwoStepAuth.SetupHintPlaceholder'
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
        toast(I18n.format('PasswordAsHintError', true));
        return;
      }

      const tab = new AppTwoStepVerificationEmailTab(this.slider);
      tab.state = this.state;
      tab.plainPassword = this.plainPassword;
      tab.newPassword = this.newPassword;
      tab.hint = hint;

      tab.open();
    };

    const btnContinue = Button('btn-primary btn-color-primary', {text: 'Continue'});
    const btnSkip = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'YourEmailSkip'});

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
