import {Component, createResource, createSignal, onCleanup, Show} from 'solid-js';

import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {joinDeepPath} from '../../../../helpers/object/setDeepProperty';
import {usePasscodeActions} from '../../../../lib/passcode/actions';
import ListenerSetter from '../../../../helpers/listenerSetter';
import {IS_MOBILE} from '../../../../environment/userAgent';
import {i18n, LangPackKey} from '../../../../lib/langPack';

import confirmationPopup from '../../../confirmationPopup';
import type SliderSuperTab from '../../../sliderTab';
import ripple from '../../../ripple'; ripple; // keep
import StaticSwitch from '../../../staticSwitch';
import Section from '../../../section';
import RowTsx from '../../../rowTsx';
import Space from '../../../space';

import {usePromiseCollector} from '../solidJsTabs/promiseCollector';
import {useSuperTab} from '../solidJsTabs/superTabProvider';
import type {AppPasscodeLockTab} from '../solidJsTabs';

import ShortcutBuilder, {ShortcutKey} from './shortcutBuilder';
import LottieAnimation from './lottieAnimation';
import InlineSelect from './inlineSelect';

import commonStyles from './common.module.scss';
import styles from './mainTab.module.scss';


type AppPasscodeLockTabType = typeof AppPasscodeLockTab;

const getHintParams = (tab: SliderSuperTab, title: LangPackKey) => ({
  appendTo: tab.scrollable.container,
  duration: 2500,
  from: 'bottom',
  textElement: i18n(title),
  icon: 'premium_lock',
  class: styles.Hint,
  canCloseOnPeerChange: false
} as const);

const MainTab = () => {
  const {rootScope} = useHotReloadGuard();
  const promiseCollector = usePromiseCollector();

  const [enabled, {mutate: mutateEnabled}] = createResource(() => {
    const promise = rootScope.managers.appStateManager.getState().then(state =>
      state.settings?.passcode?.enabled || false
    );
    promiseCollector.collect(promise);
    return promise;
  });

  const [isDisabling, setIsDisabling] = createSignal(false);

  const listenerSetter = new ListenerSetter();

  listenerSetter.add(rootScope)('settings_updated', ({key, value}) => {
    if(key === joinDeepPath('settings', 'passcode', 'enabled')) {
      mutateEnabled(value);
    }
  });
  onCleanup(() => {
    listenerSetter.removeAll();
  });

  return (
    <Show when={enabled.state === 'ready'}>
      {
        enabled() || isDisabling() ?
          <PasscodeSetContent onDisable={() => setIsDisabling(true)} /> :
          <NoPasscodeContent />
      }
    </Show>
  );
};

const NoPasscodeContent = () => {
  const [tab, {AppPasscodeEnterPasswordTab, AppPasscodeLockTab}] = useSuperTab();
  const {enablePasscode} = usePasscodeActions();
  const {setQuizHint} = useHotReloadGuard();

  const onEnable = () => {
    tab.slider.createTab(AppPasscodeEnterPasswordTab)
    .open({
      onSubmit: (passcode) => {
        onSecondStep(passcode);
        passcode = '';
      },
      buttonText: 'PasscodeLock.Next',
      inputLabel: 'PasscodeLock.EnterAPasscode'
    });
  };

  const onSecondStep = (firstPasscode: string) => {
    tab.slider.createTab(AppPasscodeEnterPasswordTab)
    .open({
      onSubmit: async(passcode, otherTab) => {
        if(passcode !== firstPasscode) throw {};
        await enablePasscode(passcode);
        passcode = '';
        otherTab.slider.sliceTabsUntilTab(AppPasscodeLockTab, otherTab);
        otherTab.close();

        setQuizHint(getHintParams(tab, 'PasscodeLock.PasscodeHasBeenSet'));
      },
      buttonText: 'PasscodeLock.SetPasscode',
      inputLabel: 'PasscodeLock.ReEnterPasscode'
    });
  };

  return (
    <Section caption="PasscodeLock.Notice">
      <LottieAnimation name="UtyanPasscode" />

      <div class={styles.MainDescription}>{i18n('PasscodeLock.Description')}</div>

      <Space amount="0.5rem" />

      <div class={commonStyles.AdditionalPadding}>
        <button
          use:ripple
          class="btn-primary btn-color-primary btn-large"
          onClick={onEnable}
        >
          {i18n('PasscodeLock.TurnOn')}
        </button>
      </div>

      <Space amount="1rem" />
    </Section>
  );
};


const PasscodeSetContent: Component<{
  onDisable: () => void;
}> = (props) => {
  const [tab, {AppPasscodeEnterPasswordTab, AppPasscodeLockTab, AppPrivacyAndSecurityTab}] = useSuperTab<AppPasscodeLockTabType>();
  const {disablePasscode, changePasscode} = usePasscodeActions();
  const {rootScope, setQuizHint} = useHotReloadGuard();

  const options = [
    {value: 0, label: () => i18n('PasscodeLock.Disabled')},
    {value: 1, label: () => i18n('MinutesShort', [1])},
    {value: 5, label: () => i18n('MinutesShort', [5])},
    {value: 10, label: () => i18n('MinutesShort', [10])},
    {value: 15, label: () => i18n('MinutesShort', [15])},
    {value: 30, label: () => i18n('MinutesShort', [30])}
  ];

  const [autoCloseRowEl, setAutoCloseRowEl] = createSignal<HTMLElement>();
  const [isOpen, setIsOpen] = createSignal(false);

  const [lockTimeout, {mutate: mutateLockTimeout}] = createResource(() => rootScope.managers.appStateManager.getState().then(state =>
    state?.settings?.passcode?.autoLockTimeoutMins || 0
  ));

  const [shortcutEnabled, {mutate: mutateShortcutEnabled}] = createResource(() =>
    rootScope.managers.appStateManager.getState().then(state =>
      state?.settings?.passcode?.lockShortcutEnabled || false
    )
  );

  const [shortcutKeys, {mutate: mutateShortcutKeys}] = createResource(() =>
    rootScope.managers.appStateManager.getState().then(state =>
      state?.settings?.passcode?.lockShortcut || []
    )
  );

  const listenerSetter = new ListenerSetter();

  listenerSetter.add(rootScope)('settings_updated', ({key, value}) => {
    if(key === joinDeepPath('settings', 'passcode', 'lockShortcut')) {
      mutateShortcutKeys(value);
    } else if(key === joinDeepPath('settings', 'passcode', 'lockShortcutEnabled')) {
      mutateShortcutEnabled(value);
    } else if(key === joinDeepPath('settings', 'passcode', 'autoLockTimeoutMins')) {
      mutateLockTimeout(value);
    }
  });

  function setShortcutKeys(value: ShortcutKey[]) {
    mutateShortcutKeys(value);
    rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'lockShortcut'), value);
  }

  function setShortcutEnabled(value: boolean) {
    mutateShortcutEnabled(value);
    rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'lockShortcutEnabled'), value);
  }

  function setLockTimeout(value: number | null) {
    mutateLockTimeout(value);
    rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'autoLockTimeoutMins'), value);
  }

  onCleanup(() => {
    listenerSetter.removeAll();
  });

  const canShowShortcut = () => !IS_MOBILE && shortcutKeys.state === 'ready' && shortcutEnabled.state === 'ready';


  const onPasscodeChange = () => {
    tab.slider.createTab(AppPasscodeEnterPasswordTab)
    .open({
      onSubmit: (passcode) => {
        onChangeSecondStep(passcode);
        passcode = ''; // forget
      },
      buttonText: 'PasscodeLock.Next',
      inputLabel: 'PasscodeLock.EnterAPasscode'
    }, 'PasscodeLock.EnterANewPasscode');
  };

  const onChangeSecondStep = (firstPasscode: string) => {
    tab.slider.createTab(AppPasscodeEnterPasswordTab)
    .open({
      onSubmit: async(passcode, otherTab) => {
        if(passcode !== firstPasscode) throw {};
        await changePasscode(passcode);
        passcode = ''; // forget
        otherTab.slider.sliceTabsUntilTab(AppPasscodeLockTab, otherTab);
        otherTab.close();

        setQuizHint(getHintParams(tab, 'PasscodeLock.PasscodeHasBeenChanged'));
      },
      buttonText: 'PasscodeLock.SetPasscode',
      inputLabel: 'PasscodeLock.ReEnterPasscode'
    }, 'PasscodeLock.ReEnterPasscode');
  };

  const onDisable = () => {
    confirmationPopup({
      title: i18n('PasscodeLock.TurnOff.Title'),
      description: i18n('PasscodeLock.TurnOff.Description'),
      button: {
        text: i18n('PasscodeLock.TurnOff'),
        isDanger: true
      }
    })
    .then(async() => {
      props.onDisable();
      await disablePasscode();
      tab.close();
      setQuizHint(getHintParams(
        tab.slider.getTab(AppPrivacyAndSecurityTab), 'PasscodeLock.PasscodeHasBeenDisabled'
      ));
    })
    .catch(() => {});
  };

  const caption = (
    <>
      {i18n('PasscodeLock.Description')}
      <Space amount="1rem" />
      {i18n('PasscodeLock.Notice')}
    </>
  );

  return (
    <>
      <Section class={styles.FirstSection} caption={caption as any}>
        <LottieAnimation name="UtyanPasscode" />

        <Space amount="1.125rem" />

        <RowTsx
          title={i18n('PasscodeLock.TurnOff.Title')}
          icon="lockoff"
          clickable={onDisable}
        />
        <RowTsx
          title={i18n('PasscodeLock.ChangePasscode')}
          icon="key"
          clickable={onPasscodeChange}
        />
      </Section>

      <Section caption={canShowShortcut() ? 'PasscodeLock.LockShortcutDescription' : undefined}>
        <Show when={lockTimeout.state === 'ready'}>
          <RowTsx
            ref={setAutoCloseRowEl}
            classList={{[styles.Row]: true}}
            title={i18n('PasscodeLock.AutoLock')}
            rightContent={
              <InlineSelect
                value={lockTimeout()}
                onClose={() => setIsOpen(false)}
                options={options}
                onChange={setLockTimeout}
                isOpen={isOpen()}
                parent={autoCloseRowEl()}
              />
            }
            clickable={() => {
              setIsOpen(true);
            }}
          />
        </Show>
        <Show when={canShowShortcut()}>
          <RowTsx
            title={i18n('PasscodeLock.EnableLockShortcut')}
            classList={{[styles.Row]: true}}
            rightContent={
              <StaticSwitch checked={shortcutEnabled()} />
            }
            clickable={(e) => {
              setShortcutEnabled(!shortcutEnabled());
            }}
          />
          <div class={styles.ShortcutBuilderRow} classList={{[styles.collapsed]: !shortcutEnabled()}}>
            <ShortcutBuilder class={styles.ShortcutBuilderRowChild} value={shortcutKeys() || []} onChange={setShortcutKeys} key="L" />
          </div>
        </Show>
      </Section>

    </>
  );
};

export default MainTab;
