/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {_i18n} from '../../../lib/langPack';
import {EnterCodeStep, EnterEmailStep} from '../../popups/emailSetup';
import {SliderSuperTab} from '../../slider';
import {render} from 'solid-js/web';

import styles from './changeLoginEmail.module.scss';
import {AccountSentEmailCode} from '../../../layer';
import {toastNew} from '../../toast';
import AppSettingsTab from './settings';

class ChangeLoginEmailCodeTab extends SliderSuperTab {
  private dispose: VoidFunction

  public init(args: {
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
          toastNew({langPackKey: 'EmailSetup.ChangeToast'});
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

  public init() {
    this.container.classList.add(styles.container);
    this.setTitle('EmailSetup.ChangeEmail');

    this.dispose = render(() => (
      <EnterEmailStep
        purpose={{_: 'emailVerifyPurposeLoginChange'}}
        footerClass={styles.footer}
        onCodeSent={code => {
          this.slider.createTab(ChangeLoginEmailCodeTab).open({sentCode: code});
        }}
      />
    ), this.content)
  }

  onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.dispose();
  }
}
