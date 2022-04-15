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
import { putPreloader } from "../../../misc";
import passwordManager from "../../../../lib/mtproto/passwordManager";
import AppTwoStepVerificationSetTab from "./passwordSet";
import AppTwoStepVerificationEmailConfirmationTab from "./emailConfirmation";
import RichTextProcessor from "../../../../lib/richtextprocessor";
import PopupPeer from "../../../popups/peer";
import cancelEvent from "../../../../helpers/dom/cancelEvent";
import { canFocus } from "../../../../helpers/dom/canFocus";
import { attachClickEvent } from "../../../../helpers/dom/clickEvent";

export default class AppTwoStepVerificationEmailTab extends SliderSuperTab {
  public inputField: InputField;
  public state: AccountPassword;
  public plainPassword: string;
  public newPassword: string;
  public hint: string;
  public isFirst = false;

  protected init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-email');
    this.setTitle('RecoveryEmailTitle');

    const section = new SettingSection({
      caption: true,
      noDelimiter: true
    });

    const emoji = '💌';
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

    const inputContent = section.generateContentElement();

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const inputField = this.inputField = new InputField({
      name: 'recovery-email',
      label: 'RecoveryEmail',
      plainText: true
    });

    inputField.input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter') {
        cancelEvent(e);
        return onContinueClick();
      }
    });

    inputField.input.addEventListener('input', (e) => {
      inputField.input.classList.remove('error');
    });

    const btnContinue = Button('btn-primary btn-color-primary', {text: 'Continue'});
    const btnSkip = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'YourEmailSkip'});

    const goNext = () => {
      new AppTwoStepVerificationSetTab(this.slider).open();
    };

    const onContinueClick = () => {
      const email = inputField.value.trim();
      const match = RichTextProcessor.matchEmail(email);
      if(!match || match[0].length !== email.length) {
        inputField.input.classList.add('error');
        return;
      }

      toggleButtons(true);
      const d = putPreloader(btnContinue);

      passwordManager.updateSettings({
        hint: this.hint,
        currentPassword: this.plainPassword,
        newPassword: this.newPassword,
        email
      }).then((value) => {
        goNext();
      }, (err) => {
        if(err.type.includes('EMAIL_UNCONFIRMED')) {
          const symbols = +err.type.match(/^EMAIL_UNCONFIRMED_(\d+)/)[1];

          const tab = new AppTwoStepVerificationEmailConfirmationTab(this.slider);
          tab.state = this.state;
          tab.email = email;
          tab.length = symbols;
          tab.open();
        } else {
          console.log('password set error', err);
        }

        toggleButtons(false);
        d.remove();
      });
    };
    attachClickEvent(btnContinue, onContinueClick);

    const toggleButtons = (freeze: boolean) => {
      if(freeze) {
        btnContinue.setAttribute('disabled', 'true');
        btnSkip.setAttribute('disabled', 'true');
      } else {
        btnContinue.removeAttribute('disabled');
        btnSkip.removeAttribute('disabled');
      }
    };

    attachClickEvent(btnSkip, (e) => {
      const popup = new PopupPeer('popup-skip-email', {
        buttons: [{
          langKey: 'Cancel',
          isCancel: true
        }, {
          langKey: 'YourEmailSkip',
          callback: () => {
            //inputContent.classList.add('sidebar-left-section-disabled');
            toggleButtons(true);
            putPreloader(btnSkip);
            passwordManager.updateSettings({
              hint: this.hint, 
              currentPassword: this.plainPassword,
              newPassword: this.newPassword,
              email: ''
            }).then(() => {
              goNext();
            }, (err) => {
              toggleButtons(false);
            });
          },
          isDanger: true,
        }], 
        titleLangKey: 'YourEmailSkipWarning',
        descriptionLangKey: 'YourEmailSkipWarningText'
      });

      popup.show();
    });

    inputWrapper.append(inputField.container, btnContinue, btnSkip);

    inputContent.append(inputWrapper);

    this.scrollable.container.append(section.container);
  }

  onOpenAfterTimeout() {
    if(!canFocus(this.isFirst)) return;
    this.inputField.input.focus();
  }
}
