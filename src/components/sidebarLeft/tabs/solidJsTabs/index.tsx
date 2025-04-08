import {Component} from 'solid-js';
import {render} from 'solid-js/web';

import SolidJSHotReloadGuardProvider from '../../../../lib/solidjs/hotReloadGuardProvider';
import {CancellablePromise} from '../../../../helpers/cancellablePromise';
import type {PasscodeActions} from '../../../../lib/passcode/actions';
import {GlobalPrivacySettings} from '../../../../layer';
import {LangPackKey} from '../../../../lib/langPack';
import {InstanceOf} from '../../../../types';

import {SliderSuperTab} from '../../../slider';

import type AppPrivacyAndSecurityTab from '../privacyAndSecurity';
import type AppAddMembersTab from '../addMembers';

import {PromiseCollector} from './promiseCollector';
import {SuperTabProvider} from './superTabProvider';


type ScaffoldSolidJSTabArgs<Payload> = {
  title: LangPackKey;
  getComponentModule: () => Promise<{default: Component}>;
  onOpenAfterTimeout?: (this: InstanceOf<ScaffoledClass<Payload>>) => void;
};

type ScaffoledClass<Payload = void> = new (...args: ConstructorParameters<typeof SliderSuperTab>) => SliderSuperTab & {
  payload: Payload;
  init(payload: Payload, overrideTitle?: LangPackKey): Promise<void>;
};

function scaffoldSolidJSTab<Payload = void>({
  title,
  getComponentModule,
  onOpenAfterTimeout
}: ScaffoldSolidJSTabArgs<Payload>): ScaffoledClass<Payload> {
  return class extends SliderSuperTab {
    public payload: Payload;

    private dispose?: () => void;

    public async init(payload: Payload, overrideTitle?: LangPackKey) {
      this.setTitle(overrideTitle || title);
      this.payload = payload;

      const div = document.createElement('div');

      const {default: Component} = await getComponentModule();

      const promiseCollectorHelper = PromiseCollector.createHelper();

      this.dispose = render(() => (
        <SolidJSHotReloadGuardProvider>
          <PromiseCollector onCollect={promiseCollectorHelper.onCollect}>
            {/* Providing other tabs here to avoid circular imports */}
            <SuperTabProvider self={this} allTabs={providedTabs}>
              <Component />
            </SuperTabProvider>
          </PromiseCollector>
        </SolidJSHotReloadGuardProvider>
      ), div);

      this.scrollable.append(div);

      await promiseCollectorHelper.await();
    }

    protected onCloseAfterTimeout() {
      this.dispose?.();
      super.onCloseAfterTimeout();
    }

    protected onOpenAfterTimeout() {
      onOpenAfterTimeout?.call?.(this);
    }
  } as ScaffoledClass<Payload>;
}


// ---


export const AppPasscodeLockTab =
  scaffoldSolidJSTab({
    title: 'PasscodeLock.Title',
    getComponentModule: () => import('../passcodeLock/mainTab'),
    onOpenAfterTimeout: async function() {
      // Remove the previous enter password tab
      this.slider.sliceTabsUntilTab(
        providedTabs.AppPrivacyAndSecurityTab,
        this
      );
    }
  });

type AppPasscodeEnterPasswordTabPayload = {
  onSubmit: (passcode: string, tab: InstanceOf<typeof AppPasscodeEnterPasswordTab>, passcodeActions: PasscodeActions) => MaybePromise<void>;

  inputLabel: LangPackKey;
  buttonText: LangPackKey;
};

export const AppPasscodeEnterPasswordTab =
  scaffoldSolidJSTab<AppPasscodeEnterPasswordTabPayload>({
    title: 'PasscodeLock.Title',
    getComponentModule: () => import('../passcodeLock/enterPasswordTab')
  });

type AppPrivacyMessagesTabPayload = {
  onSaved: (globalPrivacy: CancellablePromise<GlobalPrivacySettings.globalPrivacySettings>) => void;
};

export const AppPrivacyMessagesTab =
  scaffoldSolidJSTab<AppPrivacyMessagesTabPayload>({
    title: 'PrivacyMessages',
    getComponentModule: () => import('../privacy/messages/tab')
  });


// ---


export type ProvidedTabs = {
  AppPasscodeLockTab: typeof AppPasscodeLockTab;
  AppPasscodeEnterPasswordTab: typeof AppPasscodeEnterPasswordTab;

  // Other tabs
  AppPrivacyAndSecurityTab: typeof AppPrivacyAndSecurityTab;
  AppAddMembersTab: typeof AppAddMembersTab;
};

/**
 * To avoid circular imports, other tabs should be assigned elsewhere in the app (they can be assigned in the module of the tab itself)
 */
// eslint-disable-next-line prefer-const
export let providedTabs = {
  AppPasscodeLockTab,
  AppPasscodeEnterPasswordTab

  // Others to be assigned...
} as ProvidedTabs;
