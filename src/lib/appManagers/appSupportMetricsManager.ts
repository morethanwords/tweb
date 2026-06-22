import type {Dialog, MyMessage} from '@appManagers/appMessagesManager';
import {FOLDER_ID_ALL} from '@appManagers/constants';
import {AppManager} from '@appManagers/manager';
import {getDatabaseState} from '@config/databases/state';
import debounce from '@helpers/schedulers/debounce';
import tsNow from '@helpers/tsNow';
import AppStorage from '@lib/storage';
import {
  SUPPORT_METRICS_DEFAULT_SLA_MS,
  SUPPORT_METRICS_MAX_ACTIVITY,
  SUPPORT_METRICS_MAX_SAMPLES,
  SUPPORT_METRICS_STORAGE_KEY,
  SupportActivityEntry,
  SupportActivityType,
  SupportMegagroupLeaderEntry,
  SupportMetricsDashboard,
  SupportMetricsData,
  SupportMetricsDay,
  SupportMetricsOverview,
  SupportQueueHealth
} from '@lib/supportMetrics/types';


const EMPTY_OVERVIEW: SupportMetricsOverview = {
  messagesSent: 0,
  messagesReceived: 0,
  conversations: 0,
  avgResponseMs: 0,
  medianResponseMs: 0,
  avgFirstResponseMs: 0,
  activeMs: 0,
  idleMs: 0
};

export default class AppSupportMetricsManager extends AppManager {
  private storage: AppStorage<Record<string, SupportMetricsData>, ReturnType<typeof getDatabaseState>>;
  private data: SupportMetricsData;
  private loaded: boolean;
  private lastIdleState: boolean;
  private lastIdleChangeTs: number;
  private saveDebounced: () => void;

  protected after() {
    this.name = 'SM';
    this.storage = new AppStorage(getDatabaseState(this.getAccountNumber()), 'session');
    this.data = this.createEmptyData();
    this.lastIdleState = true;
    this.lastIdleChangeTs = Date.now();
    this.saveDebounced = debounce(() => this.save(), 2000, false);

    return this.load().then(() => {
      this.rootScope.addEventListener('history_multiappend', this.onHistoryMessage);
      this.rootScope.addEventListener('message_sent', this.onMessageSent);
    });
  }

  private createEmptyData(): SupportMetricsData {
    return {
      days: {},
      pendingInbound: {},
      activity: []
    };
  }

  private async load() {
    const stored = await this.storage.get(SUPPORT_METRICS_STORAGE_KEY);
    if(stored) {
      this.data = stored;
    }
    this.loaded = true;
  }

  private async save() {
    if(!this.loaded) return;
    await this.storage.set({[SUPPORT_METRICS_STORAGE_KEY]: this.data});
  }

  private getDateKey(tsMs = Date.now()) {
    const d = new Date(tsMs);
    const y = d.getFullYear();
    const m = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${y}-${m}-${day}`;
  }

  private getDay(dateKey: string): SupportMetricsDay {
    let day = this.data.days[dateKey];
    if(!day) {
      day = this.data.days[dateKey] = {
        messagesSent: 0,
        messagesReceived: 0,
        conversationPeerIds: [],
        responseSamplesMs: [],
        firstResponseSamplesMs: [],
        activeMs: 0,
        idleMs: 0
      };
    }
    return day;
  }

  private pushSample(samples: number[], value: number) {
    samples.push(value);
    if(samples.length > SUPPORT_METRICS_MAX_SAMPLES) {
      samples.splice(0, samples.length - SUPPORT_METRICS_MAX_SAMPLES);
    }
  }

  private touchConversation(day: SupportMetricsDay, peerId: PeerId) {
    if(!day.conversationPeerIds.includes(peerId)) {
      day.conversationPeerIds.push(peerId);
    }
  }

  private pushActivity(type: SupportActivityType, peerId?: PeerId) {
    const entry: SupportActivityEntry = {ts: Date.now(), type};
    if(peerId) entry.peerId = peerId;
    this.data.activity.push(entry);
    if(this.data.activity.length > SUPPORT_METRICS_MAX_ACTIVITY) {
      this.data.activity.splice(0, this.data.activity.length - SUPPORT_METRICS_MAX_ACTIVITY);
    }
  }

  private shouldTrackPeer(peerId: PeerId) {
    if(!peerId?.isUser()) return false;
    if(peerId === this.rootScope.myId) return false;
    const userId = peerId.toUserId();
    if(this.appUsersManager.isBot(userId)) return false;
    if(this.appUsersManager.getUser(userId)?.pFlags?.support) return false;
    return true;
  }

  private isTrackableMessage(message: MyMessage) {
    return message._ === 'message';
  }

  private onHistoryMessage = (message: MyMessage) => {
    if(!this.isTrackableMessage(message) || message.pFlags.out) return;
    this.onInboundMessage(message.peerId, message.mid, message.date);
  };

  private onMessageSent = ({message}: {message: MyMessage}) => {
    if(message._ !== 'message' || !message.pFlags.out) return;
    this.onOutboundMessage(message.peerId, message.date);
  };

  private onInboundMessage(peerId: PeerId, mid: number, date: number) {
    if(!this.shouldTrackPeer(peerId)) return;

    const dateKey = this.getDateKey(date * 1000);
    const day = this.getDay(dateKey);
    const isFirstInboundToday = !day.conversationPeerIds.includes(peerId);
    day.messagesReceived++;
    this.touchConversation(day, peerId);

    const peerKey = '' + peerId;
    this.data.pendingInbound[peerKey] = {date, mid, isFirstInboundToday};

    this.pushActivity('message_received', peerId);
    this.saveDebounced();
    this.rootScope.dispatchEvent('support_metrics_update');
  }

  private onOutboundMessage(peerId: PeerId, date: number) {
    if(!this.shouldTrackPeer(peerId)) return;

    const dateKey = this.getDateKey(date * 1000);
    const day = this.getDay(dateKey);
    day.messagesSent++;
    this.touchConversation(day, peerId);

    const peerKey = '' + peerId;
    const pending = this.data.pendingInbound[peerKey];
    if(pending) {
      const responseMs = Math.max(0, date * 1000 - pending.date * 1000);
      this.pushSample(day.responseSamplesMs, responseMs);
      if(pending.isFirstInboundToday) {
        this.pushSample(day.firstResponseSamplesMs, responseMs);
      }
      delete this.data.pendingInbound[peerKey];
    }

    this.pushActivity('message_sent', peerId);
    this.saveDebounced();
    this.rootScope.dispatchEvent('support_metrics_update');
  }

  public recordIdleChange(isIdle: boolean, tsMs = Date.now()) {
    if(!this.loaded) return;
    if(isIdle === this.lastIdleState) return;

    const elapsed = Math.max(0, tsMs - this.lastIdleChangeTs);
    const dateKey = this.getDateKey(tsMs);
    const day = this.getDay(dateKey);

    if(this.lastIdleState) {
      day.idleMs += elapsed;
      this.pushActivity('idle');
    } else {
      day.activeMs += elapsed;
      this.pushActivity('active');
    }

    this.lastIdleState = isIdle;
    this.lastIdleChangeTs = tsMs;
    this.saveDebounced();
    this.rootScope.dispatchEvent('support_metrics_update');
  }

  private aggregateDays(dateKeys: string[]): SupportMetricsOverview {
    if(!dateKeys.length) return {...EMPTY_OVERVIEW};

    let messagesSent = 0;
    let messagesReceived = 0;
    let conversations = 0;
    const responseSamples: number[] = [];
    const firstResponseSamples: number[] = [];
    let activeMs = 0;
    let idleMs = 0;
    const conversationSet = new Set<PeerId>();

    for(const dateKey of dateKeys) {
      const day = this.data.days[dateKey];
      if(!day) continue;
      messagesSent += day.messagesSent;
      messagesReceived += day.messagesReceived;
      activeMs += day.activeMs;
      idleMs += day.idleMs;
      day.conversationPeerIds.forEach((peerId) => conversationSet.add(peerId));
      responseSamples.push(...day.responseSamplesMs);
      firstResponseSamples.push(...day.firstResponseSamplesMs);
    }

    conversations = conversationSet.size;

    return {
      messagesSent,
      messagesReceived,
      conversations,
      avgResponseMs: average(responseSamples),
      medianResponseMs: median(responseSamples),
      avgFirstResponseMs: average(firstResponseSamples),
      activeMs,
      idleMs
    };
  }

  private getRecentDateKeys(days: number) {
    const keys: string[] = [];
    const now = new Date();
    for(let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      keys.push(this.getDateKey(d.getTime()));
    }
    return keys;
  }

  public getDashboard(): SupportMetricsDashboard {
    const todayKey = this.getDateKey();
    const weekKeys = this.getRecentDateKeys(7);
    const today = this.aggregateDays([todayKey]);
    const week = this.aggregateDays(weekKeys);
    const weekAvgDaily: SupportMetricsOverview = {
      messagesSent: Math.round(week.messagesSent / 7),
      messagesReceived: Math.round(week.messagesReceived / 7),
      conversations: Math.round(week.conversations / 7),
      avgResponseMs: week.avgResponseMs,
      medianResponseMs: week.medianResponseMs,
      avgFirstResponseMs: week.avgFirstResponseMs,
      activeMs: Math.round(week.activeMs / 7),
      idleMs: Math.round(week.idleMs / 7)
    };

    return {
      today,
      week,
      weekAvgDaily,
      vsWeekAvg: {
        messagesSent: today.messagesSent - weekAvgDaily.messagesSent,
        conversations: today.conversations - weekAvgDaily.conversations,
        avgResponseMs: today.avgResponseMs - weekAvgDaily.avgResponseMs,
        activeMs: today.activeMs - weekAvgDaily.activeMs
      }
    };
  }

  public getQueueHealth(slaMs = SUPPORT_METRICS_DEFAULT_SLA_MS): SupportQueueHealth {
    const dialogs = this.dialogsStorage.getFolderDialogs(FOLDER_ID_ALL, true);
    let totalUnread = 0;
    let unansweredCount = 0;
    let oldestUnansweredDate = 0;
    let oldestUnansweredPeerId: PeerId;
    const nowSec = tsNow(true);

    for(const dialog of dialogs) {
      const peerId = this.dialogsStorage.getDialogPeerId(dialog);
      if(!this.shouldTrackPeer(peerId)) continue;

      const unread = (dialog as Dialog).unread_count || 0;
      totalUnread += unread;

      const topMessage = this.appMessagesManager.getMessageByPeer(peerId, dialog.top_message);
      if(!topMessage || topMessage._ !== 'message' || topMessage.pFlags.out) continue;

      unansweredCount++;
      if(!oldestUnansweredDate || topMessage.date < oldestUnansweredDate) {
        oldestUnansweredDate = topMessage.date;
        oldestUnansweredPeerId = peerId;
      }
    }

    let slaBreachCount = 0;
    for(const peerKey in this.data.pendingInbound) {
      const pending = this.data.pendingInbound[peerKey];
      const ageMs = nowSec * 1000 - pending.date * 1000;
      if(ageMs > slaMs) slaBreachCount++;
    }

    return {
      totalUnread,
      unansweredCount,
      oldestUnansweredDate,
      oldestUnansweredPeerId,
      slaBreachCount,
      slaMs
    };
  }

  public getActivityTimeline(limit = 50) {
    return this.data.activity.slice(-limit).reverse();
  }

  public async getMegagroupLeaderboard(peerId: PeerId): Promise<SupportMegagroupLeaderEntry[]> {
    if(peerId.isUser()) return [];

    const chat = this.appChatsManager.getChat(peerId.toChatId());
    if(chat._ !== 'channel' || !chat.pFlags.megagroup) return [];

    const {stats} = await this.appStatisticsManager.getMegagroupStats({peerId});
    return (stats.top_posters || []).map((poster) => ({
      userId: poster.user_id.toUserId(),
      messages: poster.messages,
      avgChars: poster.avg_chars
    }));
  }

  public exportCsv(): string {
    const lines: string[] = [];
    lines.push('date,messages_sent,messages_received,conversations,avg_response_ms,median_response_ms,avg_first_response_ms,active_ms,idle_ms');

    const dateKeys = Object.keys(this.data.days).sort();
    for(const dateKey of dateKeys) {
      const overview = this.aggregateDays([dateKey]);
      lines.push([
        dateKey,
        overview.messagesSent,
        overview.messagesReceived,
        overview.conversations,
        overview.avgResponseMs,
        overview.medianResponseMs,
        overview.avgFirstResponseMs,
        overview.activeMs,
        overview.idleMs
      ].join(','));
    }

    lines.push('');
    lines.push('activity_timestamp,type,peer_id');
    for(const entry of this.data.activity) {
      lines.push([entry.ts, entry.type, entry.peerId ?? ''].join(','));
    }

    return lines.join('\n');
  }
}

function average(values: number[]) {
  if(!values.length) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function median(values: number[]) {
  if(!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if(sorted.length % 2) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
