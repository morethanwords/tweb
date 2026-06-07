import {AccountPassword} from '@layer';
import {i18n} from '@lib/langPack';
import confirmationPopup from '@components/confirmationPopup';
import tsNow from '@helpers/tsNow';
import {toastNew} from '@components/toast';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {AppSettingsTab} from '@components/solidJsTabs';
import anchorCallback from '@helpers/dom/anchorCallback';
import {AppManagers} from '@lib/managers';
import safeAssign from '@helpers/object/safeAssign';
import noop from '@helpers/noop';
import ctx from '@environment/ctx';
import SliderSuperTab from '@components/sliderTab';
import {wrapEmailPattern} from '@components/popups/emailSetup';
import {AppPrivacyAndSecurityTab, AppTwoStepVerificationEmailConfirmationTab} from '@components/solidJsTabs/tabs';

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
        this.tab.slider.createTab(AppTwoStepVerificationEmailConfirmationTab).open({
          email: wrapEmailPattern(res.email_pattern),
          length: 6,
          state: this.state,
          forPasswordReset: true
        });
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
