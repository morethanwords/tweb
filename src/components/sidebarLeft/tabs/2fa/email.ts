/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AccountPassword} from '../../../../layer';
import Button from '../../../button';
import {SliderSuperTab} from '../../../slider';
import InputField from '../../../inputField';
import {putPreloader} from '../../../putPreloader';
import AppTwoStepVerificationSetTab from './passwordSet';
import AppTwoStepVerificationEmailConfirmationTab from './emailConfirmation';
import PopupPeer from '../../../popups/peer';
import cancelEvent from '../../../../helpers/dom/cancelEvent';
import {canFocus} from '../../../../helpers/dom/canFocus';
import {attachClickEvent} from '../../../../helpers/dom/clickEvent';
import matchEmail from '../../../../lib/richTextProcessor/matchEmail';
import wrapStickerEmoji from '../../../wrappers/stickerEmoji';
import SettingSection from '../../../settingSection';
import PopupElement from '../../../popups';

export default class AppTwoStepVerificationEmailTab extends SliderSuperTab {
  public inputField: InputField;
  public state: AccountPassword;
  public plainPassword: string;
  public newPassword: string;
  public hint: string;
  public isFirst = false;

  public init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-email');
    this.setTitle('RecoveryEmailTitle');

    const section = new SettingSection({
      captionOld: true,
      noDelimiter: true
    });

    const emoji = '💌';
    const stickerContainer = document.createElement('div');

    wrapStickerEmoji({
      div: stickerContainer,
      width: 160,
      height: 160,
      emoji
    });

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
      this.slider.createTab(AppTwoStepVerificationSetTab).open();
    };

    const onContinueClick = () => {
      const email = inputField.value.trim();
      const match = matchEmail(email);
      if(!match || match[0].length !== email.length) {
        inputField.input.classList.add('error');
        return;
      }

      toggleButtons(true);
      const d = putPreloader(btnContinue);

      this.managers.passwordManager.updateSettings({
        hint: this.hint,
        currentPassword: this.plainPassword,
        newPassword: this.newPassword,
        email
      }).then((value) => {
        goNext();
      }, (err) => {
        if(err.type.includes('EMAIL_UNCONFIRMED')) {
          const symbols = +err.type.match(/^EMAIL_UNCONFIRMED_(\d+)/)[1];

          const tab = this.slider.createTab(AppTwoStepVerificationEmailConfirmationTab);
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
      const popup = PopupElement.createPopup(PopupPeer, 'popup-skip-email', {
        buttons: [{
          langKey: 'Cancel',
          isCancel: true
        }, {
          langKey: 'YourEmailSkip',
          callback: () => {
            // inputContent.classList.add('sidebar-left-section-disabled');
            toggleButtons(true);
            putPreloader(btnSkip);
            this.managers.passwordManager.updateSettings({
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
          isDanger: true
        }],
        titleLangKey: 'YourEmailSkipWarning',
        descriptionLangKey: 'YourEmailSkipWarningText'
      });

      popup.show();
    });

    inputWrapper.append(inputField.container, btnContinue, btnSkip);

    inputContent.append(inputWrapper);

    this.scrollable.append(section.container);
  }

  onOpenAfterTimeout() {
    if(!canFocus(this.isFirst)) return;
    this.inputField.input.focus();
  }
}
