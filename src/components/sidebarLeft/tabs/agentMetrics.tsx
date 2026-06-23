import styles from './agentMetrics.module.scss';
import Section from '@components/section';
import Row from '@components/rowTsx';
import Button from '@components/buttonTsx';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {createEffect, createResource, createSignal, For, onCleanup, Show} from 'solid-js';
import {makeAbsStats, StatisticsOverviewItems} from '@components/sidebarRight/tabs/statistics';
import {
  downloadSupportMetricsCsv,
  formatSupportDurationMs,
  formatSupportDelta
} from '@helpers/supportMetrics/format';
import {SupportMetricsOverview} from '@lib/supportMetrics/types';
import {formatFullSentTime} from '@helpers/date';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import showPickUserPopup from '@components/popups/pickUser';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import classNames from '@helpers/string/classNames';
import appImManager from '@lib/appImManager';
import InputField from '@components/inputField';
import agentIdentity from '@lib/agentIdentity';
import {toast, toastNew} from '@components/toast';


// Prefer the CRM server's own error text (e.g. "Only admin accounts can use the
// mobile app."); fall back to a generic localized message.
const showCrmError = (err: any, fallback: LangPackKey) => {
  const message = typeof err?.message === 'string' && !err.message.startsWith('CRM_') ? err.message : '';
  if(message) toast(message);
  else toastNew({langPackKey: fallback});
};


const CrmSection = () => {
  const [config, {refetch}] = createResource(() => rootScope.managers.appCrmManager.getConfig());
  const [otpSent, setOtpSent] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const connected = () => !!(config()?.enabled && config()?.token);

  const baseUrlField = new InputField({label: 'Crm.BaseUrl', name: 'crm-base-url', plainText: true});
  const mobileField = new InputField({label: 'Crm.Mobile', name: 'crm-mobile', plainText: true});
  const codeField = new InputField({label: 'Crm.Code', name: 'crm-code', plainText: true});

  createEffect(() => {
    const url = config()?.baseUrl;
    if(url && !baseUrlField.value) baseUrlField.setValueSilently(url);
  });

  const sendCode = async() => {
    const baseUrl = baseUrlField.value.trim();
    const mobile = mobileField.value.trim();
    if(!baseUrl || !mobile) {
      toastNew({langPackKey: 'Crm.FillFields'});
      return;
    }
    setBusy(true);
    try {
      await rootScope.managers.appCrmManager.setConfig({baseUrl});
      await rootScope.managers.appCrmManager.sendOtp(mobile);
      setOtpSent(true);
    } catch(err) {
      showCrmError(err, 'Crm.SendFailed');
    } finally {
      setBusy(false);
    }
  };

  const connect = async() => {
    setBusy(true);
    try {
      const user = await rootScope.managers.appCrmManager.verifyOtp(mobileField.value.trim(), codeField.value.trim());
      // Pick up the agent's identity from the logged-in CRM session so their
      // sent messages are tagged with their real name without manual entry.
      const crmName = user?.full_name || user?.display_name;
      if(crmName) agentIdentity.setName(crmName);
      setOtpSent(false);
      refetch();
    } catch(err) {
      showCrmError(err, 'Crm.VerifyFailed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async() => {
    setBusy(true);
    try {
      await rootScope.managers.appCrmManager.disconnect();
      refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section name="Crm.Title" caption="Crm.Caption">
      <Show
        when={connected()}
        fallback={
          <>
            {baseUrlField.container}
            {mobileField.container}
            <Show when={otpSent()}>{codeField.container}</Show>
            <Show
              when={otpSent()}
              fallback={
                <Button class="btn-primary btn-color-primary" disabled={busy()} onClick={sendCode}>
                  {i18n('Crm.SendCode')}
                </Button>
              }
            >
              <Button class="btn-primary btn-color-primary" disabled={busy()} onClick={connect}>
                {i18n('Crm.Connect')}
              </Button>
            </Show>
          </>
        }
      >
        <Row>
          <Row.Title>{i18n('Crm.ConnectedAs')}</Row.Title>
          <Row.Subtitle>{config()?.user?.full_name || config()?.user?.display_name || config()?.user?.mobile}</Row.Subtitle>
        </Row>
        <Button class="btn-primary danger" disabled={busy()} onClick={disconnect}>
          {i18n('Crm.Disconnect')}
        </Button>
      </Show>
    </Section>
  );
};


const AgentIdentitySection = () => {
  const nameField = new InputField({
    label: 'AgentMetrics.AgentName',
    name: 'agent-name',
    maxLength: 32
  });
  nameField.setValueSilently(agentIdentity.getName());
  nameField.input.addEventListener('input', () => agentIdentity.setName(nameField.value));

  // Reflect a name picked up from the CRM session (set on connect) without
  // clobbering what the user is actively typing.
  const onIdentityUpdate = () => {
    const name = agentIdentity.getName();
    if(document.activeElement !== nameField.input && name !== nameField.value) {
      nameField.setValueSilently(name);
    }
  };
  rootScope.addEventListener('agent_identity_update', onIdentityUpdate);
  onCleanup(() => rootScope.removeEventListener('agent_identity_update', onIdentityUpdate));

  return (
    <Section name="AgentMetrics.IdentitySection" caption="AgentMetrics.IdentityCaption">
      {nameField.container}
    </Section>
  );
};


const MetricCard = (props: {value: string, title: LangPackKey}) => (
  <div class="statistics-overview-item">
    <div class="statistics-overview-item-value">{props.value}</div>
    <div class="statistics-overview-item-name">{i18n(props.title)}</div>
  </div>
);

const CountOverview = (props: {overview: SupportMetricsOverview}) => (
  StatisticsOverviewItems({
    items: [
      {value: makeAbsStats(props.overview.messagesSent), title: 'AgentMetrics.MessagesSent'},
      {value: makeAbsStats(props.overview.messagesReceived), title: 'AgentMetrics.MessagesReceived'},
      {value: makeAbsStats(props.overview.conversations), title: 'AgentMetrics.Conversations'}
    ]
  })
);

const TimeOverview = (props: {overview: SupportMetricsOverview}) => (
  <div class="statistics-overview">
    <MetricCard value={formatSupportDurationMs(props.overview.avgResponseMs)} title="AgentMetrics.AvgResponse" />
    <MetricCard value={formatSupportDurationMs(props.overview.medianResponseMs)} title="AgentMetrics.MedianResponse" />
    <MetricCard value={formatSupportDurationMs(props.overview.avgFirstResponseMs)} title="AgentMetrics.FirstResponse" />
    <MetricCard value={formatSupportDurationMs(props.overview.activeMs)} title="AgentMetrics.ActiveTime" />
  </div>
);

const PeerLine = (props: {peerId: PeerId}) => {
  const [title] = createResource(() => props.peerId, (peerId) => getPeerTitle({peerId, plainText: true}));
  return <>{title() ?? ''}</>;
};

const DeltaRow = (props: {label: LangPackKey, value: number, invertGood?: boolean, formatMs?: boolean}) => {
  const delta = () => formatSupportDelta(props.value, props.invertGood);
  const formatted = () => {
    if(!props.value) return '';
    const sign = props.value > 0 ? '+' : '-';
    const abs = props.formatMs ? formatSupportDurationMs(Math.abs(props.value)) : String(Math.abs(props.value));
    return `${sign}${abs}`;
  };
  return (
    <Row>
      <Row.Title>{i18n(props.label)}</Row.Title>
      <Row.Subtitle>
        <Show when={props.value} fallback={i18n('AgentMetrics.NoChange')}>
          <span class={classNames(styles.delta, delta()?.className)}>{formatted()}</span>
        </Show>
      </Row.Subtitle>
    </Row>
  );
};

const ActivityTimeline = () => {
  const [timeline] = createResource(() => rootScope.managers.appSupportMetricsManager.getActivityTimeline(40));

  return (
    <Section name="AgentMetrics.ActivityTimeline">
      <Show when={timeline()?.length} fallback={<div class={styles.empty}>{i18n('AgentMetrics.NoActivity')}</div>}>
        <For each={timeline()}>
          {(entry) => (
            <Row>
              <Row.Title>
                {i18n(`AgentMetrics.Activity.${entry.type}` as LangPackKey)}
                <Show when={entry.peerId}>
                  {' — '}
                  <PeerLine peerId={entry.peerId} />
                </Show>
              </Row.Title>
              <Row.Subtitle>{formatFullSentTime(entry.ts / 1000)}</Row.Subtitle>
            </Row>
          )}
        </For>
      </Show>
    </Section>
  );
};

const MegagroupLeaderboard = () => {
  const [groupPeerId, setGroupPeerId] = createSignal<PeerId>();
  const [leaders] = createResource(groupPeerId, (peerId) => {
    if(!peerId) return Promise.resolve([]);
    return rootScope.managers.appSupportMetricsManager.getMegagroupLeaderboard(peerId);
  });

  const pickGroup = () => {
    showPickUserPopup({
      titleLangKey: 'AgentMetrics.PickMegagroup',
      peerType: ['dialogs'],
      filterPeerTypeBy: (peer) => peer?._ === 'channel' && peer.pFlags?.megagroup,
      onSelect: (chosen) => {
        const peerId = chosen[0]?.peerId;
        if(peerId) setGroupPeerId(peerId);
      }
    });
  };

  return (
    <Section name="AgentMetrics.MegagroupLeaderboard" caption="AgentMetrics.MegagroupLeaderboard.Caption">
      <Row clickable={pickGroup}>
        <Row.Title>
          <Show when={groupPeerId()} fallback={i18n('AgentMetrics.PickMegagroup')}>
            <PeerLine peerId={groupPeerId()!} />
          </Show>
        </Row.Title>
      </Row>
      <Show when={leaders()?.length}>
        <For each={leaders()}>
          {(entry) => (
            <Row>
              <Row.Title><PeerLine peerId={entry.userId.toPeerId()} /></Row.Title>
              <Row.Subtitle>
                {entry.messages} {i18n('AgentMetrics.Messages')} · {entry.avgChars} {i18n('AgentMetrics.AvgChars')}
              </Row.Subtitle>
            </Row>
          )}
        </For>
      </Show>
    </Section>
  );
};

export default function AgentMetrics() {
  const [tab] = useSuperTab();
  const [dashboard, {refetch: refetchDashboard}] = createResource(() => rootScope.managers.appSupportMetricsManager.getDashboard());
  const [queue, {refetch: refetchQueue}] = createResource(() => rootScope.managers.appSupportMetricsManager.getQueueHealth());

  const refresh = () => {
    refetchDashboard();
    refetchQueue();
  };

  createEffect(() => {
    tab.listenerSetter.add(rootScope)('support_metrics_update', refresh);
  });

  const exportCsv = async() => {
    const csv = await rootScope.managers.appSupportMetricsManager.exportCsv();
    downloadSupportMetricsCsv(csv);
  };

  const openOldestChat = () => {
    const peerId = queue()?.oldestUnansweredPeerId;
    if(peerId) appImManager.setPeer({peerId});
  };

  return (
    <>
      <AgentIdentitySection />
      <CrmSection />

      <Section name="AgentMetrics.TodayOverview">
        <Show when={dashboard()?.today}>
          <CountOverview overview={dashboard()!.today} />
          <TimeOverview overview={dashboard()!.today} />
        </Show>
      </Section>

      <Section name="AgentMetrics.WeekOverview">
        <Show when={dashboard()?.week}>
          <CountOverview overview={dashboard()!.week} />
          <TimeOverview overview={dashboard()!.week} />
        </Show>
      </Section>

      <Section name="AgentMetrics.VsWeekAvg" caption="AgentMetrics.VsWeekAvg.Caption">
        <Show when={dashboard()?.vsWeekAvg}>
          <DeltaRow label="AgentMetrics.MessagesSent" value={dashboard()!.vsWeekAvg.messagesSent} />
          <DeltaRow label="AgentMetrics.Conversations" value={dashboard()!.vsWeekAvg.conversations} />
          <DeltaRow label="AgentMetrics.AvgResponse" value={dashboard()!.vsWeekAvg.avgResponseMs} invertGood formatMs />
          <DeltaRow label="AgentMetrics.ActiveTime" value={dashboard()!.vsWeekAvg.activeMs} formatMs />
        </Show>
      </Section>

      <Section name="AgentMetrics.QueueHealth">
        <Row>
          <Row.Title>{i18n('AgentMetrics.TotalUnread')}</Row.Title>
          <Row.Subtitle>{queue()?.totalUnread ?? 0}</Row.Subtitle>
        </Row>
        <Row>
          <Row.Title>{i18n('AgentMetrics.Unanswered')}</Row.Title>
          <Row.Subtitle>{queue()?.unansweredCount ?? 0}</Row.Subtitle>
        </Row>
        <Row>
          <Row.Title>{i18n('AgentMetrics.SlaBreaches')}</Row.Title>
          <Row.Subtitle class={classNames((queue()?.slaBreachCount ?? 0) > 0 && styles.warn)}>
            {queue()?.slaBreachCount ?? 0}
          </Row.Subtitle>
        </Row>
        <Show when={queue()?.oldestUnansweredDate}>
          <Row clickable={openOldestChat}>
            <Row.Title>{i18n('AgentMetrics.OldestUnanswered')}</Row.Title>
            <Row.Subtitle>
              {formatSupportDurationMs(Date.now() - queue()!.oldestUnansweredDate * 1000)}
              <Show when={queue()?.oldestUnansweredPeerId}>
                {' — '}
                <PeerLine peerId={queue()!.oldestUnansweredPeerId!} />
              </Show>
            </Row.Subtitle>
          </Row>
        </Show>
      </Section>

      <ActivityTimeline />
      <MegagroupLeaderboard />

      <Section>
        <Button class="btn-primary btn-color-primary" onClick={exportCsv}>
          {i18n('AgentMetrics.ExportCsv')}
        </Button>
      </Section>
    </>
  );
}
