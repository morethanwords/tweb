import type {AppManagers} from '@lib/managers';
import {getManagersSession} from '@lib/accounts/getCurrentAccount';
import {WIDGET_POLL_DEFAULT_PERIOD} from '@appManagers/constants';

/**
 * A shared widget's shared state, polled (docs/integration.md, "Polling a shared widget's shared state"): the messenger,
 * never the sandbox, asks the server for the widgets that watch it (`TelegramWidget.watchPublicData`), are on screen
 * and have a `widget_id` — through one of them per `widget_id` and account — and a new value goes into every message of
 * the account here that shows the same widget, whose bubble hands it to its widget (appMessagesManager
 * .setMessagesWidgetData). When to poll is the account's worker's to say, for every tab (appWidgetsManager
 * .pollWidgetPublicData answers each poll with when the next one goes: the server's period, a flood wait, a failure's
 * hold); this keeps what is the tab's — its carriers, its timer, its poll on its way — and polls then. The first poll
 * waits the default period after a carrier first became active: the message came with the shared state current when it
 * was read. Each account's polls are their own, after a switch in place too.
 */

export type WidgetCarrier = {
  peerId: PeerId,
  mid: number,
  managers: AppManagers,
  /** It watches and is on screen. */
  active: boolean
};

type Poll = {
  carriers: Set<WidgetCarrier>,
  timer?: number,
  /** When this tab polls next (Date.now()), as the account's worker said; 0: no carrier was active yet. */
  nextAt: number,
  inFlight: boolean
};

/** By account and `widget_id`. */
const polls = new Map<string, Poll>();

/** A carrier the poll can go through: active, and of a message the server knows (not one being sent). */
const canPollThrough = (carrier: WidgetCarrier) => carrier.active && Number.isInteger(carrier.mid);

const getDelay = (poll: Poll) => Math.max(0, poll.nextAt - Date.now());

/**
 * The next poll of a widget, when one of its carriers is active. With none left at all, its record outlives them while
 * a poll is out or until the next one would go, so a chat reopened meanwhile neither asks again early nor asks twice.
 */
function schedule(key: string, poll: Poll) {
  clearTimeout(poll.timer);
  poll.timer = undefined;
  if(!poll.carriers.size) {
    if(!poll.inFlight) poll.timer = window.setTimeout(() => polls.get(key) === poll && polls.delete(key), getDelay(poll));
    return;
  }

  const carrier = [...poll.carriers].find(canPollThrough);
  if(!carrier || poll.inFlight) return;
  // the first active carrier starts the default period
  poll.nextAt ||= Date.now() + WIDGET_POLL_DEFAULT_PERIOD * 1000;
  poll.timer = window.setTimeout(() => run(key, poll), getDelay(poll));
}

function run(key: string, poll: Poll) {
  poll.timer = undefined;
  const carrier = [...poll.carriers].find(canPollThrough);
  if(!carrier || polls.get(key) !== poll) return;
  poll.inFlight = true;
  // the account's messages that show the widget: on screen or not, they keep the new value
  const carriers = [...poll.carriers].map(({peerId, mid}) => ({peerId, mid}));
  carrier.managers.appWidgetsManager.pollWidgetPublicData(carrier.peerId, carrier.mid, carriers).then((nextAt) => {
    poll.nextAt = nextAt;
  }, () => {
    // the worker did not answer (its session over): it is asked again the default period later
    poll.nextAt = Date.now() + WIDGET_POLL_DEFAULT_PERIOD * 1000;
  }).finally(() => {
    poll.inFlight = false;
    if(polls.get(key) === poll) schedule(key, poll);
  });
}

/**
 * Counts the widget of a message among the carriers of `widgetId`; `setActive` says whether it watches and is on screen
 * now. A widget is first polled the default period after its first carrier became active.
 */
export function trackWidgetCarrier(widgetId: string, carrier: Omit<WidgetCarrier, 'active'>) {
  // whose message it is: each chat has managers of its own
  const key = `${getManagersSession(carrier.managers).accountNumber}_${widgetId}`;
  let poll = polls.get(key);
  if(!poll) polls.set(key, poll = {carriers: new Set(), nextAt: 0, inFlight: false});
  const tracked: WidgetCarrier = {...carrier, active: false};
  poll.carriers.add(tracked);
  // a record that outlived its carriers is taken again: it is not dropped
  schedule(key, poll);
  return {
    setActive(active: boolean) {
      if(tracked.active === active) return;
      tracked.active = active;
      schedule(key, poll);
    },
    dispose() {
      poll.carriers.delete(tracked);
      schedule(key, poll);
    }
  };
}
