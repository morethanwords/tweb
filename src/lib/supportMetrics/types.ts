export const SUPPORT_METRICS_STORAGE_KEY = 'supportMetrics';

export const SUPPORT_METRICS_DEFAULT_SLA_MS = 5 * 60 * 1000;
export const SUPPORT_METRICS_MAX_SAMPLES = 500;
export const SUPPORT_METRICS_MAX_ACTIVITY = 400;

export type SupportMetricsDay = {
  messagesSent: number,
  messagesReceived: number,
  conversationPeerIds: PeerId[],
  responseSamplesMs: number[],
  firstResponseSamplesMs: number[],
  activeMs: number,
  idleMs: number
};

export type SupportMetricsPendingInbound = {
  date: number,
  mid: number,
  isFirstInboundToday?: boolean
};

export type SupportActivityType = 'message_sent' | 'message_received' | 'active' | 'idle';

export type SupportActivityEntry = {
  ts: number,
  type: SupportActivityType,
  peerId?: PeerId
};

export type SupportMetricsData = {
  days: Record<string, SupportMetricsDay>,
  pendingInbound: Record<string, SupportMetricsPendingInbound>,
  activity: SupportActivityEntry[]
};

export type SupportMetricsOverview = {
  messagesSent: number,
  messagesReceived: number,
  conversations: number,
  avgResponseMs: number,
  medianResponseMs: number,
  avgFirstResponseMs: number,
  activeMs: number,
  idleMs: number
};

export type SupportMetricsDashboard = {
  today: SupportMetricsOverview,
  week: SupportMetricsOverview,
  weekAvgDaily: SupportMetricsOverview,
  vsWeekAvg: {
    messagesSent: number,
    conversations: number,
    avgResponseMs: number,
    activeMs: number
  }
};

export type SupportQueueHealth = {
  totalUnread: number,
  unansweredCount: number,
  oldestUnansweredDate: number,
  oldestUnansweredPeerId?: PeerId,
  slaBreachCount: number,
  slaMs: number
};

export type SupportMegagroupLeaderEntry = {
  userId: UserId,
  messages: number,
  avgChars: number
};
