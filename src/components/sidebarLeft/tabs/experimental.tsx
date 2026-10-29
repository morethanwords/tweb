import {createMemo, createSignal, For, JSX, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import appNavigationController from '@components/appNavigationController';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import confirmationPopup from '@components/confirmationPopup';
import MediaHeader from '@components/mediaHeader';
import {shareToPeers} from '@components/popups/shareUrl';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';
import SaveButton from '@components/saveButton';
import Section from '@components/section';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppExperimentalTab} from '@components/solidJsTabs/tabs';
import {toastNew} from '@components/toast';
import {getAppVersionText} from '@config/app';
import DEBUG from '@config/debug';
import Modes, {getKeptFlags, getURLWithoutFlags, isFlagInURL, isFlagOn, KEPT_FLAGS, KeptFlag, setKeptFlag, setKeptFlags} from '@config/modes';
import IS_SHARED_WORKER_SUPPORTED from '@environment/sharedWorkerSupport';
import {copyTextToClipboard} from '@helpers/clipboard';
import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import {CURRENT_ACCOUNT_QUERY_PARAM} from '@lib/accounts/constants';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import apiManagerProxy from '@lib/apiManagerProxy';
import {clearLogs, createLogsFile, downloadLogsFile, setLogsCollected} from '@lib/debug/exportLogs';
import {isMemoryWatchOn, startMemoryWatch, stopMemoryWatch} from '@lib/debug/memoryWatch';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import {useAppSettings} from '@stores/appSettings';

type AppExperimentalTabType = typeof AppExperimentalTab;

/**
 * What applies as Telegram starts, so a change waits for the restart. `logs`, `rtl` and the memory watch switch at
 * once instead. The test servers are the tab's alone (Modes.test): its URL carries them, never the kept flags.
 */
type RestartFlag = Exclude<KeptFlag, 'logs' | 'rtl'> | 'test';

const RESTART_FLAGS: RestartFlag[] = [
  ...KEPT_FLAGS.filter((flag): flag is Exclude<KeptFlag, 'logs' | 'rtl'> => flag !== 'logs' && flag !== 'rtl'),
  'test'
];

// * what the build has decided, which no switch here changes
const FORCED: Partial<Record<RestartFlag, boolean>> = {
  test: !!import.meta.env.VITE_TEST_DC,
  noWorker: !!import.meta.env.VITE_NO_WORKER
};

const isStartedWith = (flag: RestartFlag) => !!FORCED[flag] || (flag === 'test' ? isFlagInURL(flag) : isFlagOn(flag));

const TRANSPORTS_AVAILABLE = !!(
  import.meta.env.VITE_MTPROTO_AUTO &&
  import.meta.env.VITE_MTPROTO_HAS_HTTP &&
  import.meta.env.VITE_MTPROTO_HAS_WS
);

type Transport = 'auto' | 'websocket' | 'http';

const TRANSPORTS: {value: Transport, title: LangPackKey, subtitle?: LangPackKey}[] = [
  {value: 'auto', title: 'Experimental.Transport.Auto', subtitle: 'Experimental.Transport.Auto.Subtitle'},
  {value: 'websocket', title: 'Experimental.Transport.WebSocket'},
  {value: 'http', title: 'Experimental.Transport.HTTP'}
];

type ToolOpener = 'showPopupSandbox' | 'showBubbleSandbox' | 'showIconLibrary';
type ToolWindow = typeof window & Partial<Record<ToolOpener, () => void>>;

// * the console's openers (src/index.ts): the sandboxes exist in a dev build and in a preview's bundle, never in production
const TOOLS: {title: LangPackKey, icon: Icon, open: ToolOpener}[] = [
  {title: 'Experimental.PopupSandbox', icon: 'tools', open: 'showPopupSandbox'},
  {title: 'Experimental.BubbleSandbox', icon: 'message_filled', open: 'showBubbleSandbox'},
  {title: 'Experimental.IconLibrary', icon: 'smile', open: 'showIconLibrary'}
];

const ExperimentalTab = () => {
  const [tab] = useSuperTab<AppExperimentalTabType>();

  // ── Switches that apply after a restart: held here until the check in the header restarts Telegram.
  const startedWith: ReadonlySet<RestartFlag> = new Set(RESTART_FLAGS.filter(isStartedWith));
  const [flags, setFlags] = createSignal(startedWith);
  const isSet = (flag: RestartFlag) => flags().has(flag);
  const setFlag = (flag: RestartFlag, on: boolean) => {
    const next = new Set(flags());
    if(on) next.add(flag);
    else next.delete(flag);
    setFlags(next);
  };
  const changed = createMemo(() => RESTART_FLAGS.filter((flag) => isSet(flag) !== startedWith.has(flag)));
  const hasChanges = () => changed().length > 0;
  const isEveryTabRestarted = () => changed().some((flag) => flag !== 'test');

  const restart = () => {
    const kept = getKeptFlags();
    // * switched off: out of every tab's URL too, which would turn them on again
    const dropped: KeptFlag[] = [];
    let test: boolean;
    for(const flag of changed()) {
      const on = isSet(flag);
      if(flag === 'test') {
        test = on;
      } else if(on) {
        kept.add(flag);
      } else {
        kept.delete(flag);
        dropped.push(flag);
      }
    }

    const url = getURLWithoutFlags(dropped) ?? new URL(location.href);
    if(test !== undefined) {
      if(test) url.searchParams.set('test', '1');
      else url.searchParams.delete('test');
      // * the other servers have accounts and chats of their own
      url.searchParams.delete(CURRENT_ACCOUNT_QUERY_PARAM);
      url.hash = '';
    }

    setKeptFlags(kept);
    tab.isConfirmationNeededOnClose = undefined;
    if(isEveryTabRestarted()) {
      apiManagerProxy.reloadEveryTab(dropped, url);
    } else {
      appNavigationController.reload(url);
    }
  };

  const confirmRestart = () => {
    confirmationPopup({
      titleLangKey: 'Experimental.Restart.Title',
      descriptionLangKey: isEveryTabRestarted() ? 'Experimental.Restart.EveryTab' : 'Experimental.Restart.ThisTab',
      button: {langKey: 'Experimental.Restart'}
    }).then(restart, noop);
  };

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({
    hasChanges,
    saveAllSettings: async() => restart(),
    descriptionLangKey: 'UnsavedChangesDescription.Experimental'
  });

  const transport = (): Transport => isSet('http') ? 'http' : isSet('noMultipleTransports') ? 'websocket' : 'auto';
  const setTransport = (value: Transport) => {
    const next = new Set(flags());
    next.delete('http');
    next.delete('noMultipleTransports');
    if(value === 'http') next.add('http');
    else if(value === 'websocket') next.add('noMultipleTransports');
    setFlags(next);
  };

  // ── Switches that apply at once, and are kept for the site the same way. One switched off leaves this tab's URL
  //    too, without a reload: the URL would turn it on again at the next start.
  const dropFromURL = (flag: string) => {
    const url = getURLWithoutFlags([flag]);
    if(url) history.replaceState(history.state, '', url);
  };

  // * what is kept, under which debug mode collects anyway: Reset All clears it even then
  const [logs, setLogs] = createSignal(getKeptFlags().has('logs') || isFlagInURL('logs'));
  const onLogsChange = (on: boolean) => {
    setLogs(on);
    setLogsCollected(on);
    if(!on) dropFromURL('logs');
  };

  const [rtl, setRtl] = createSignal(getKeptFlags().has('rtl') || isFlagInURL('rtl'));
  const onRtlChange = (on: boolean) => {
    setRtl(on);
    setKeptFlag('rtl', on);
    I18n.forceRTL(on || undefined);
    if(!on) dropFromURL('rtl');
  };

  const [memoryWatch, setMemoryWatch] = createSignal(isMemoryWatchOn());
  const onMemoryWatchChange = (on: boolean) => {
    setMemoryWatch(on);
    if(on) startMemoryWatch();
    else stopMemoryWatch();
    if(!on) dropFromURL('memoryWatch');
  };

  // * an app setting (state.settings, kept with the rest of them), not one of the site's flags
  const [appSettings, setAppSettings] = useAppSettings();

  const isAllDefault = () => !RESTART_FLAGS.some((flag) => isSet(flag) && !FORCED[flag]) &&
    !logs() &&
    !rtl() &&
    !memoryWatch() &&
    !appSettings.showPeerIds;

  const resetAll = () => {
    setFlags(new Set(RESTART_FLAGS.filter((flag) => FORCED[flag])));
    if(logs()) onLogsChange(false);
    if(rtl()) onRtlChange(false);
    if(memoryWatch()) onMemoryWatchChange(false);
    if(appSettings.showPeerIds) setAppSettings('showPeerIds', false);
  };

  // ── Logs: one export at a time - a second click while the threads are still being asked would make a second file.
  let exporting = false;
  const withLogsFile = async(callback: (file: File) => any) => {
    if(exporting) return;
    // * the threads take a while to answer: an account switched away from meanwhile gets nothing opened over the next
    const session = getManagersSession(tab.managers);
    exporting = true;
    try {
      const {file, count} = await createLogsFile();
      if(isSessionLeaving(session)) return;
      if(!count) {
        toastNew({langPackKey: 'Experimental.Logs.Empty'});
        return;
      }

      await callback(file);
    } finally {
      exporting = false;
    }
  };

  const sendLogs = () => withLogsFile((file) => {
    shareToPeers({
      chatRightsActions: ['send_docs'],
      toastKey: 'Experimental.Logs.SentTo',
      toastKeyForSelf: 'Experimental.Logs.SentToSavedMessages',
      send: (managers, {peerId, threadId, monoforumThreadId}, confirmedPaymentResult) => {
        managers.appMessagesManager.sendFile({
          peerId,
          threadId,
          replyToMonoforumPeerId: monoforumThreadId,
          confirmedPaymentResult,
          file
        });
      }
    });
  });

  // * the system's share sheet takes plain text where it refuses an unknown type (Chrome lets a short list through)
  const toShareFile = (file: File) => new File([file], file.name.replace(/\.ndjson$/, '.txt'), {type: 'text/plain'});
  const canShareFiles = (() => {
    try {
      return !!navigator.canShare?.({files: [toShareFile(new File([''], 'logs.ndjson'))]});
    } catch(err) {
      return false;
    }
  })();

  const shareLogs = () => withLogsFile(async(file) => {
    const share = () => navigator.share({files: [toShareFile(file)]});
    try {
      await share();
    } catch(err) {
      // * the threads took long enough to answer for the click to stop counting: one more, on a button of ours
      if((err as DOMException)?.name !== 'NotAllowedError') return;
      await confirmationPopup({
        descriptionLangKey: 'Experimental.Logs.Ready',
        button: {langKey: 'Experimental.Logs.Share'}
      }).then(share).catch(noop);
    }
  });

  const onClearLogs = () => {
    clearLogs();
    toastNew({langPackKey: 'Experimental.Logs.Cleared'});
  };

  // ── For a bug report: what a developer asks first, in English, as it is pasted to them.
  const copyDebugInfo = () => {
    // * the restart flags as the page started with them, the live ones as they are now
    const flagsOn = [
      ...RESTART_FLAGS.filter((flag) => startedWith.has(flag)),
      ...(logs() ? ['logs'] : []),
      ...(rtl() ? ['rtl'] : []),
      ...(memoryWatch() ? ['memoryWatch'] : [])
    ].map((flag) => isFlagInURL(flag) ? flag + ' (url)' : flag);
    const workers = [
      Modes.noWorker ? 'network in the tab' : IS_SHARED_WORKER_SUPPORTED ? 'shared worker' : 'dedicated worker',
      navigator.serviceWorker?.controller ? 'service worker' : 'no service worker'
    ];
    const lines = [
      `${getAppVersionText()}, ${import.meta.env.MODE}`,
      navigator.userAgent,
      `Language: ${I18n.getLastAppliedLangCode()}, ${I18n.getIsRTL() ? 'RTL' : 'LTR'}`,
      `Screen: ${screen.width}×${screen.height} @${devicePixelRatio}x, window ${innerWidth}×${innerHeight}`,
      `Animations: level ${liteMode.getAnimationLevel()}`,
      `Threads: ${workers.join(', ')}`,
      `Logs: ${DEBUG || logs() ? 'collected' : 'off'}`,
      `Flags: ${flagsOn.join(', ') || 'none'}`
    ];

    copyTextToClipboard(lines.join('\n'));
    toastNew({langPackKey: 'Experimental.DebugInfoCopied'});
  };

  const tools = TOOLS.filter((tool) => typeof((window as ToolWindow)[tool.open]) === 'function');

  const RestartToggle = (props: {
    flag: RestartFlag,
    title: LangPackKey,
    subtitle: LangPackKey,
    // * the switch shows what the flag turns off: on while the flag is not
    inverted?: boolean
  }) => {
    const forced = !!FORCED[props.flag];
    return (
      <Row disabled={forced}>
        <Row.CheckboxFieldToggle>
          <CheckboxFieldTsx
            toggle
            checked={isSet(props.flag) !== !!props.inverted}
            disabled={forced}
            onChange={(checked) => setFlag(props.flag, checked !== !!props.inverted)}
          />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n(props.title)}</Row.Title>
        <Row.Subtitle>{i18n(props.subtitle)}</Row.Subtitle>
      </Row>
    );
  };

  const LiveToggle = (props: {
    checked: boolean,
    onChange: (checked: boolean) => void,
    title: LangPackKey,
    subtitle: LangPackKey,
    icon?: Icon,
    disabled?: boolean
  }) => (
    <Row disabled={props.disabled}>
      {props.icon && <Row.Icon icon={props.icon} />}
      <Row.CheckboxFieldToggle>
        <CheckboxFieldTsx toggle checked={props.checked} disabled={props.disabled} onChange={props.onChange} />
      </Row.CheckboxFieldToggle>
      <Row.Title>{i18n(props.title)}</Row.Title>
      <Row.Subtitle>{i18n(props.subtitle)}</Row.Subtitle>
    </Row>
  );

  const ActionRow = (props: {
    icon: Icon,
    title: LangPackKey,
    subtitle?: LangPackKey,
    onClick: () => void,
    danger?: boolean
  }): JSX.Element => (
    <Row color={props.danger ? 'danger' : undefined} clickable={props.onClick}>
      <Row.Icon icon={props.icon} />
      <Row.Title class={props.danger ? 'danger' : undefined}>{i18n(props.title)}</Row.Title>
      {props.subtitle && <Row.Subtitle>{i18n(props.subtitle)}</Row.Subtitle>}
    </Row>
  );

  return (
    <>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={hasChanges()} onClick={confirmRestart} />
      </Portal>

      <MediaHeader marginBottom>
        <MediaHeader.Sticker animationData={tab.payload.animationData} size={130} />
        <MediaHeader.Subtitle>{i18n('Experimental.Info')}</MediaHeader.Subtitle>
      </MediaHeader>

      <Section name="Experimental.Logs" caption="Experimental.Logs.Info">
        <LiveToggle
          icon="bug"
          title="Experimental.Logs.Collect"
          subtitle={DEBUG ? 'Experimental.Logs.Collect.Debug' : 'Experimental.Logs.Collect.Subtitle'}
          checked={DEBUG || logs()}
          disabled={DEBUG}
          onChange={onLogsChange}
        />
        <ActionRow icon="send_filled" title="Experimental.Logs.Send" onClick={sendLogs} />
        <Show when={canShareFiles}>
          <ActionRow icon="forward_filled" title="Experimental.Logs.Share" onClick={shareLogs} />
        </Show>
        <ActionRow icon="download" title="Experimental.Logs.Download" onClick={() => withLogsFile(downloadLogsFile)} />
        <ActionRow icon="delete_filled" title="Experimental.Logs.Clear" onClick={onClearLogs} danger />
      </Section>

      <Section name="Experimental.Interface">
        <LiveToggle
          title="Experimental.ShowPeerIds"
          subtitle="Experimental.ShowPeerIds.Subtitle"
          checked={appSettings.showPeerIds}
          onChange={(checked) => setAppSettings('showPeerIds', checked)}
        />
        <LiveToggle
          title="Experimental.RTL"
          subtitle="Experimental.RTL.Subtitle"
          checked={rtl()}
          onChange={onRtlChange}
        />
        <RestartToggle flag="a11y" title="Experimental.A11y" subtitle="Experimental.A11y.Subtitle" />
      </Section>

      <Section name="Experimental.Connection">
        <RestartToggle flag="noPfs" title="Experimental.Pfs" subtitle="Experimental.Pfs.Subtitle" inverted />
        <RestartToggle flag="test" title="Experimental.TestServer" subtitle="Experimental.TestServer.Subtitle" />
      </Section>

      <Show when={TRANSPORTS_AVAILABLE}>
        <Section name="Experimental.Transport">
          <For each={TRANSPORTS}>{(item) => (
            <Row>
              <Row.RadioField>
                <RadioFieldTsx
                  name="experimental-transport"
                  value={item.value}
                  checked={transport() === item.value}
                  onChange={(checked) => checked && setTransport(item.value)}
                />
              </Row.RadioField>
              <Row.Title>{i18n(item.title)}</Row.Title>
              {item.subtitle && <Row.Subtitle>{i18n(item.subtitle)}</Row.Subtitle>}
            </Row>
          )}</For>
        </Section>
      </Show>

      <Section name="Experimental.Engine">
        <RestartToggle flag="noSharedWorker" title="Experimental.SharedWorker" subtitle="Experimental.SharedWorker.Subtitle" inverted />
        <RestartToggle flag="noWorker" title="Experimental.Worker" subtitle="Experimental.Worker.Subtitle" inverted />
        <RestartToggle flag="noServiceWorker" title="Experimental.ServiceWorker" subtitle="Experimental.ServiceWorker.Subtitle" inverted />
        <RestartToggle flag="noOffscreenCanvas" title="Experimental.OffscreenCanvas" subtitle="Experimental.OffscreenCanvas.Subtitle" inverted />
        <RestartToggle flag="noObjectUrlRevoke" title="Experimental.ReleaseMedia" subtitle="Experimental.ReleaseMedia.Subtitle" inverted />
      </Section>

      <Section name="Experimental.Debugging">
        <RestartToggle flag="debug" title="Experimental.Debug" subtitle="Experimental.Debug.Subtitle" />
        <LiveToggle
          title="Experimental.MemoryWatch"
          subtitle="Experimental.MemoryWatch.Subtitle"
          checked={memoryWatch()}
          onChange={onMemoryWatchChange}
        />
        <Show when={import.meta.env.VITE_PREVIEW}>
          <RestartToggle
            flag="forceHideNonContactLinks"
            title="Experimental.HideNonContactLinks"
            subtitle="Experimental.HideNonContactLinks.Subtitle"
          />
        </Show>
      </Section>

      <Section name="Experimental.Tools">
        <ActionRow
          icon="copy"
          title="Experimental.CopyDebugInfo"
          subtitle="Experimental.CopyDebugInfo.Subtitle"
          onClick={copyDebugInfo}
        />
        <For each={tools}>{(tool) => (
          <ActionRow icon={tool.icon} title={tool.title} onClick={() => (window as ToolWindow)[tool.open]()} />
        )}</For>
      </Section>

      <Show when={!isAllDefault()}>
        <Section>
          <ActionRow icon="delete_filled" title="Experimental.ResetAll" onClick={resetAll} danger />
        </Section>
      </Show>
    </>
  );
};

export default ExperimentalTab;
