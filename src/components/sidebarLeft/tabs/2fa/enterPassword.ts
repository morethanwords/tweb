/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AppTwoStepVerificationTab from '.';
import cancelEvent from '@helpers/dom/cancelEvent';
import {canFocus} from '@helpers/dom/canFocus';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import replaceContent from '@helpers/dom/replaceContent';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import {AccountPassword} from '@layer';
import I18n, {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import Button from '@components/button';
import {putPreloader} from '@components/putPreloader';
import PasswordMonkey from '@components/monkeys/password';
import PasswordInputField from '@components/passwordInputField';
import AppTwoStepVerificationReEnterPasswordTab from '@components/sidebarLeft/tabs/2fa/reEnterPassword';
import SettingSection from '@components/settingSection';
import confirmationPopup from '@components/confirmationPopup';
import tsNow from '@helpers/tsNow';
import {toastNew} from '@components/toast';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import AppSettingsTab from '@components/sidebarLeft/tabs/settings';
import anchorCallback from '@helpers/dom/anchorCallback';
import {AppManagers} from '@lib/managers';
import safeAssign from '@helpers/object/safeAssign';
import noop from '@helpers/noop';
import ctx from '@environment/ctx';
import SliderSuperTab from '@components/sliderTab';
import AppTwoStepVerificationEmailConfirmationTab from '@components/sidebarLeft/tabs/2fa/emailConfirmation';
import {wrapEmailPattern} from '@components/popups/emailSetup';
import AppPrivacyAndSecurityTab from '@components/sidebarLeft/tabs/privacyAndSecurity';

export class ForgotPasswordLink {
  private state: AccountPassword;
  private managers: AppManagers;
  private tab: SliderSuperTab;
  private forEmail: boolean;
  private allowReset: boolean;

  private updateTimeout: number;

  public container: HTMLDivElement;

  constructor(options: {
    state: AccountPassword,
    managers: AppManagers,
    tab: SliderSuperTab,
    allowReset: boolean,
    forEmail: boolean
  }) {
    safeAssign(this, options)

    this.container = document.createElement('div')
    this.container.classList.add('two-step-verification-forgot')
    this.update()
  }

  private pending = false
  private handleCancel = () => {
    if(this.pending) return;
    this.pending = true;
    this.managers.passwordManager.declinePasswordReset()
    .then(() => {
      this.state.pending_reset_date = undefined;
      this.update();
    })
    .catch((err) => {
      toastNew({langPackKey: 'Error.AnError'});
    })
    .finally(() => {
      this.pending = false;
    })
  }

  private handleReset = () => {
    const canReset = this.state.pending_reset_date && this.state.pending_reset_date < tsNow(true)

    if(this.state.pFlags.has_recovery && !this.forEmail && !canReset) {
      this.managers.passwordManager.requestRecovery().then((res) => {
        const tab = this.tab.slider.createTab(AppTwoStepVerificationEmailConfirmationTab)
        tab.email = wrapEmailPattern(res.email_pattern);
        tab.length = 6;
        tab.state = this.state;
        tab.open({forPasswordReset: true});
      }).catch((err) => {
        toastNew({langPackKey: 'Error.AnError'});
      });
    } else {
      if(!this.allowReset) return

      confirmationPopup({
        titleLangKey: 'ResetPassword.Title',
        descriptionLangKey: canReset ? 'ResetPassword.Confirm' :
          this.forEmail ? 'ResetPassword.TroubleText' :
          'ResetPassword.NoRecovery',
        className: 'two-step-verification-forgot-popup',
        button: {
          langKey: 'Reset'
        }
      }).then(() => {
        if(this.pending) return;
        this.pending = true;

        this.managers.passwordManager.resetPassword()
        .then((result) => {
          switch(result._) {
            case 'account.resetPasswordFailedWait':
              toastNew({
                langPackKey: 'ResetPassword.Wait',
                langPackArguments: [wrapFormattedDuration(formatDuration(result.retry_date - tsNow(true), 2))]
              });
              break;
            case 'account.resetPasswordRequestedWait':
              this.state.pending_reset_date = result.until_date;
              this.update();
              if(this.forEmail) {
                this.tab.slider.sliceTabsUntilTab(AppPrivacyAndSecurityTab, this.tab);
              }
              break;
            case 'account.resetPasswordOk':
              toastNew({langPackKey: 'ResetPassword.Success'});
              this.tab.slider.sliceTabsUntilTab(AppSettingsTab, this.tab);
              this.tab.close();
              break;
          }
        })
        .catch((err) => {
          toastNew({langPackKey: 'Error.AnError'});
        })
        .finally(() => {
          this.pending = false;
        })
      }, noop)
    }
  }

  update() {
    if(this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = undefined
    }

    const now = tsNow(true)

    if(this.state.pending_reset_date && this.state.pending_reset_date > now) {
      const diff = this.state.pending_reset_date - now
      if(diff > 0) {
        this.container.replaceChildren(i18n('ResetPassword.RequestPending', [
          wrapFormattedDuration(formatDuration(diff, 2)),
          anchorCallback(this.handleCancel)
        ]))
      }

      this.updateTimeout = ctx.setTimeout(() => {
        this.updateTimeout = undefined;
        this.update();
      }, diff * 1000);
    } else {
      const canReset = this.state.pending_reset_date && this.state.pending_reset_date <= now
      this.container.replaceChildren(i18n(
        canReset ? 'ResetPassword.Action' :
        this.forEmail ? 'TroubleEmail' : 'ForgotPassword',
        [anchorCallback(this.handleReset)]
      ));
    }
  }

  cleanup() {
    if(this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = undefined;
    }
  }
}

export default class AppTwoStepVerificationEnterPasswordTab extends SliderSuperTab {
  public state: AccountPassword;
  public passwordInputField: PasswordInputField;
  public forgotLink: ForgotPasswordLink;
  public plainPassword: string;
  public isFirst = true;

  public init() {
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
      labelText: !isNew && this.state.hint ? wrapEmojiText(this.state.hint) : undefined
    });

    const monkey = new PasswordMonkey(passwordInputField, 157);

    if(!isNew) {
      this.forgotLink = new ForgotPasswordLink({
        state: this.state,
        managers: this.managers,
        tab: this,
        allowReset: true,
        forEmail: false
      });
    }

    const btnContinue = Button('btn-primary btn-color-primary');
    const textEl = new I18n.IntlElement({key: 'Continue'});

    btnContinue.append(textEl.element);

    inputWrapper.append(passwordInputField.container);
    if(this.forgotLink) {
      inputWrapper.append(this.forgotLink.container);
    }
    inputWrapper.append(btnContinue);
    section.content.append(monkey.container, inputWrapper);

    this.scrollable.append(section.container);

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

      const getState = () => {
        // * just to check session relevance
        if(!getStateInterval) {
          getStateInterval = window.setInterval(getState, 10e3);
        }

        return this.managers.passwordManager.getState().then((_state) => {
          this.state = _state;

          if(this.state.hint) {
            setInnerHTML(passwordInputField.label, wrapEmojiText(this.state.hint));
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
        this.managers.passwordManager.check(passwordInputField.value, this.state).then((auth) => {
          if(auth._ === 'auth.authorization') {
            clearInterval(getStateInterval);
            if(monkey) monkey.remove();
            const tab = this.slider.createTab(AppTwoStepVerificationTab);
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
              // btnContinue.innerText = err.type;
              textEl.key = 'PASSWORD_HASH_INVALID';
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

        const tab = this.slider.createTab(AppTwoStepVerificationReEnterPasswordTab);
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

  onClose() {
    super.onClose()
    this.forgotLink?.cleanup()
  }
}
