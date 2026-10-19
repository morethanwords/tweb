import {EnterCodeStep, EnterEmailStep} from '@components/emailVerification';
import SidebarSlider, {SliderSuperTab} from '@components/slider';
import {render} from 'solid-js/web';
import {AccountPassword, AccountSentEmailCode} from '@layer';
import {toastNew} from '@components/toast';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

class ChangeLoginEmailCodeTab extends SliderSuperTab {
  private dispose: VoidFunction

  public init(args: {
    isInitialSetup?: boolean
    sentCode: AccountSentEmailCode.accountSentEmailCode
  }) {
    this.setTitle('EmailSetup.ChangeEmail');

    this.dispose = render(() => (
      <EnterCodeStep
        purpose={{_: 'emailVerifyPurposeLoginChange'}}
        variant="tab"
        sentCode={args.sentCode}
        onExpired={() => {
          this.close()
        }}
        onSuccess={() => {
          toastNew({langPackKey: args.isInitialSetup ? 'EmailSetup.SetupToast' : 'EmailSetup.ChangeToast'});
          this.slider.sliceTabsUntilTab(hotReloadGuard.tabs.AppSettingsTab, this);
          this.close()
        }}
      />
    ), this.scrollable.container)
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.dispose();
  }
}

export default class ChangeLoginEmailTab extends SliderSuperTab {
  // `tg://settings/login_email` opened again must not stack a second form
  public static noSame = true;

  private dispose: VoidFunction

  public init(options: {isInitialSetup?: boolean}) {
    this.setTitle('EmailSetup.ChangeEmail');

    this.dispose = render(() => (
      <EnterEmailStep
        purpose={{_: 'emailVerifyPurposeLoginChange'}}
        variant="tab"
        isInitialSetup={options.isInitialSetup}
        onCodeSent={code => {
          this.slider.createTab(ChangeLoginEmailCodeTab).open({
            sentCode: code,
            isInitialSetup: options.isInitialSetup
          });
        }}
      />
    ), this.scrollable.container)
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.dispose();
  }
}

/** What the Login Email row and `tg://settings/login_email` open. */
export function openChangeLoginEmailTab(slider: SidebarSlider, passwordState: AccountPassword) {
  const pattern = passwordState.login_email_pattern;
  return slider.createTab(ChangeLoginEmailTab).open({
    // no email yet, or a placeholder for one: a pattern with a space in it ("REQUIRED *")
    isInitialSetup: !pattern || pattern.includes(' ')
  });
}
