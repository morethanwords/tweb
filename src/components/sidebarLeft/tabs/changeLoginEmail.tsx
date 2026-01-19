/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {EnterCodeStep, EnterEmailStep} from '@components/popups/emailSetup';
import {SliderSuperTab} from '@components/slider';
import {render} from 'solid-js/web';

import styles from '@components/sidebarLeft/tabs/changeLoginEmail.module.scss';
import {AccountSentEmailCode} from '@layer';
import {toastNew} from '@components/toast';
import AppSettingsTab from '@components/sidebarLeft/tabs/settings';

class ChangeLoginEmailCodeTab extends SliderSuperTab {
  private dispose: VoidFunction

  public init(args: {
    isInitialSetup?: boolean
    sentCode: AccountSentEmailCode.accountSentEmailCode
  }) {
    this.container.classList.add(styles.container);
    this.setTitle('EmailSetup.ChangeEmail');

    this.dispose = render(() => (
      <EnterCodeStep
        purpose={{_: 'emailVerifyPurposeLoginChange'}}
        footerClass={styles.footer}
        sentCode={args.sentCode}
        onExpired={() => {
          this.close()
        }}
        onSuccess={() => {
          toastNew({langPackKey: args.isInitialSetup ? 'EmailSetup.SetupToast' : 'EmailSetup.ChangeToast'});
          this.slider.sliceTabsUntilTab(AppSettingsTab, this);
          this.close()
        }}
      />
    ), this.content)
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.dispose();
  }
}

export default class ChangeLoginEmailTab extends SliderSuperTab {
  private dispose: VoidFunction

  public init(options: { isInitialSetup?: boolean }) {
    this.container.classList.add(styles.container);
    this.setTitle('EmailSetup.ChangeEmail');

    this.dispose = render(() => (
      <EnterEmailStep
        purpose={{_: 'emailVerifyPurposeLoginChange'}}
        footerClass={styles.footer}
        isInitialSetup={options.isInitialSetup}
        onCodeSent={code => {
          this.slider.createTab(ChangeLoginEmailCodeTab).open({
            sentCode: code,
            isInitialSetup: options.isInitialSetup
          });
        }}
      />
    ), this.content)
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.dispose();
  }
}
