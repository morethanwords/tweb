import {createResource, createSignal, onCleanup, Show} from 'solid-js';

import {IS_MOBILE} from '../../../../environment/userAgent';
import ListenerSetter from '../../../../helpers/listenerSetter';
import {joinDeepPath} from '../../../../helpers/object/setDeepProperty';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {i18n} from '../../../../lib/langPack';
import {usePasscodeActions} from '../../../../lib/passcode/actions';

import Section from '../../../section';
import Space from '../../../space';
import ripple from '../../../ripple'; ripple; // keep
import RowTsx from '../../../rowTsx';

import LottieAnimation from './lottieAnimation';
import {useSuperTab} from './superTabProvider';
import StaticSwitch from './staticSwitch';
import InlineSelect from './inlineSelect';
import ShortcutBuilder, {ShortcutKey} from './shortcutBuilder';
import {usePromiseCollector} from './promiseCollector';

import commonStyles from './common.module.scss';
import styles from './mainTab.module.scss';

const MainTab = () => {
  const {rootScope, apiManagerProxy} = useHotReloadGuard();
  const promiseColletor = usePromiseCollector();

  const [enabled, {mutate: mutateEnabled}] = createResource(() => {
    const promise = apiManagerProxy.getState().then(state =>
      state.settings?.passcode?.enabled || false
    );
    promiseColletor.collect(promise);
    return promise;
  });

  const listenerSetter = new ListenerSetter();

  listenerSetter.add(rootScope)('settings_updated', ({key, value}) => {
    if(key === joinDeepPath('settings', 'passcode', 'enabled')) {
      mutateEnabled(value);
    }
  });
  onCleanup(() => {
    listenerSetter.removeAll();
  })

  return (
    <Show when={enabled.state === 'ready'}>
      {
        enabled() ?
          <PasscodeSetContent /> :
          <NoPasscodeContent />
      }
    </Show>
  );
};

const NoPasscodeContent = () => {
  const [tab, {AppPasscodeEnterPasswordTab, AppPasscodeLockTab}] = useSuperTab();
  const {enablePasscode} = usePasscodeActions();

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


const PasscodeSetContent = () => {
  const [tab, {AppPasscodeEnterPasswordTab, AppPasscodeLockTab}] = useSuperTab();
  const {isMyPasscode, disablePasscode, changePasscode} = usePasscodeActions();

  const [checked, setChecked] = createSignal(false);
  const [value, setValue] = createSignal('disabled');
  const options = [
    {value: 'disabled', label: 'Disabled'},
    {value: 1, label: '1 min'},
    {value: 5, label: '5 min'},
    {value: 10, label: '10 min'},
    {value: 15, label: '15 min'},
    {value: 30, label: '30 min'}
  ];

  const [autoCloseRowEl, setAutoCloseRowEl] = createSignal<HTMLElement>();
  const [isOpen, setIsOpen] = createSignal(false);
  const [keys, setKeys] = createSignal<ShortcutKey[]>(['Alt']);

  const canShowShortcut = !IS_MOBILE;


  const onPasscodeChange = () => {
    tab.slider.createTab(AppPasscodeEnterPasswordTab)
    .open({
      onSubmit: async(passcode) => {
        const isCorrect = await isMyPasscode(passcode);
        passcode = ''; // forget
        if(!isCorrect) throw {};

        onChangeSecondStep();
      },
      buttonText: 'PasscodeLock.Next',
      inputLabel: 'PasscodeLock.EnterYourPasscode'
    }, 'PasscodeLock.EnterYourCurrentPasscode');
  };

  const onChangeSecondStep = () => {
    tab.slider.createTab(AppPasscodeEnterPasswordTab)
    .open({
      onSubmit: (passcode) => {
        onChangeThirdStep(passcode);
        passcode = ''; // forget
      },
      buttonText: 'PasscodeLock.Next',
      inputLabel: 'PasscodeLock.EnterAPasscode'
    }, 'PasscodeLock.EnterANewPasscode');
  };

  const onChangeThirdStep = (firstPasscode: string) => {
    tab.slider.createTab(AppPasscodeEnterPasswordTab)
    .open({
      onSubmit: async(passcode, otherTab) => {
        if(passcode !== firstPasscode) throw {};
        await changePasscode(passcode);
        passcode = ''; // forget
        otherTab.slider.sliceTabsUntilTab(AppPasscodeLockTab, otherTab);
        otherTab.close();
      },
      buttonText: 'PasscodeLock.SetPasscode',
      inputLabel: 'PasscodeLock.ReEnterPasscode'
    }, 'PasscodeLock.ReEnterPasscode');
  };

  const onDisable = () => {
    tab.slider.createTab(AppPasscodeEnterPasswordTab)
    .open({
      onSubmit: async(passcode, otherTab) => {
        const isCorrect = await isMyPasscode(passcode);
        passcode = '';
        if(!isCorrect) throw {};

        await disablePasscode();
        otherTab.slider.sliceTabsUntilTab(AppPasscodeLockTab, otherTab);
        otherTab.close();
      },
      buttonText: 'PasscodeLock.TurnOff',
      inputLabel: 'PasscodeLock.EnterYourPasscode'
    }, 'PasscodeLock.TurnOff');
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
          title={i18n('PasscodeLock.TurnOff')}
          icon="lockoff"
          clickable={onDisable}
        />
        <RowTsx
          title={i18n('PasscodeLock.ChangePasscode')}
          icon="key"
          clickable={onPasscodeChange}
        />
      </Section>

      <Section caption={canShowShortcut ? 'PasscodeLock.LockShortcutDescription' : undefined}>
        <RowTsx
          ref={setAutoCloseRowEl}
          classList={{[styles.Row]: true}}
          title={i18n('PasscodeLock.AutoLock')}
          rightContent={
            <InlineSelect
              value={value()}
              onClose={() => setIsOpen(false)}
              options={options}
              onChange={setValue}
              isOpen={isOpen()}
              parent={autoCloseRowEl()}
            />
          }
          clickable={(e) => {
            setIsOpen(true);
            console.log('setting isOpen to true');
          }}
        />
        <Show when={canShowShortcut}>
          <RowTsx
            title={i18n('PasscodeLock.EnableLockShortcut')}
            classList={{[styles.Row]: true}}
            rightContent={
              <StaticSwitch checked={checked()} />
            }
            clickable={(e) => {
              setChecked(p => !p)
            }}
          />
          <div class={styles.ShortcutBuilderRow} classList={{[styles.collapsed]: !checked()}}>
            <ShortcutBuilder value={keys()} onChange={setKeys} key="L" />
          </div>
        </Show>
      </Section>

    </>
  );
};

export default MainTab;
