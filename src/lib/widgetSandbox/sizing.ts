import type {MessageMedia} from '@layer';
import clamp from '@helpers/number/clamp';
import mapDeleteWhere from '@helpers/mapDeleteWhere';

/** The bubble sizing constants of widgets v0.1.0, the same on every client (docs/integration.md, "Bubble sizing"). */
export const WIDGET_MIN_WIDTH = 200;
export const WIDGET_MIN_HEIGHT = 50;
export const WIDGET_MAX_HEIGHT = 600;

/**
 * What a chat knows of a widget's height before the widget runs. The bot's height is the widget's (docs/integration.md,
 * "Bubble sizing"); an auto height is the content's, which the chat remembers per message once the widget has reported
 * it, so that its bubble takes that place the next time — and with it the layout it was laid out at (the chat's width
 * and text size), which the content wraps to. Kept on disk with the account's widget storage (heights.ts), the newest
 * MAX_REMEMBERED_HEIGHTS.
 */
const heights = new Map<string, {height: number, layout?: string}>();
export const MAX_REMEMBERED_HEIGHTS = 1000;

/** A remembered height as the disk keeps it, for one account: the message, its height, the layout it had. */
export type StoredWidgetHeight = [fullMid: string, height: number, layout?: string];

/** What marks the key of a message out of the chat's history (`getWidgetKey`'s `store`). */
const STORE_SEPARATOR = '@';

/**
 * A widget message's key: its remembered height and crash count go by it, for that account's message only. `store`: a
 * message that is not of the chat's history (a scheduled one, an admin log's entry...), whose ids are that store's own —
 * its height is remembered for the page only.
 */
export function getWidgetKey(accountNumber: number, peerId: PeerId, mid: number, store?: string) {
  return `${accountNumber}_${peerId}_${mid}` + (store ? STORE_SEPARATOR + store : '');
}

/** The bot's height, within the bounds every client keeps it in; none: the content's. */
export function getWidgetFixedHeight(height?: number) {
  return height ? clamp(height, WIDGET_MIN_HEIGHT, WIDGET_MAX_HEIGHT) : undefined;
}

const listeners = new Set<(key?: string) => void>();

/** Calls `listener` whenever a widget's height is remembered (its key; none: several, from the disk); returns what stops it. */
export function onWidgetHeightRemembered(listener: (key?: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const trimHeights = () => {
  while(heights.size > MAX_REMEMBERED_HEIGHTS) heights.delete(heights.keys().next().value);
};

export function rememberWidgetHeight(key: string, height: number, layout?: string) {
  heights.delete(key);
  heights.set(key, {height, layout});
  trimHeights();
  listeners.forEach((listener) => listener(key));
}

const accountPrefix = (accountNumber: number) => accountNumber + '_';

/** An account's heights from the disk, older than any this page remembered meanwhile. */
export function restoreWidgetHeights(accountNumber: number, stored: StoredWidgetHeight[]) {
  const remembered = [...heights];
  heights.clear();
  for(const [fullMid, height, layout] of stored) heights.set(accountPrefix(accountNumber) + fullMid, {height, layout});
  for(const [key, entry] of remembered) {
    heights.delete(key);
    heights.set(key, entry);
  }

  trimHeights();
  listeners.forEach((listener) => listener());
}

/** An account's heights as the disk keeps them, oldest first: of its chats' histories. */
export function getStoredWidgetHeights(accountNumber: number): StoredWidgetHeight[] {
  const prefix = accountPrefix(accountNumber);
  const stored: StoredWidgetHeight[] = [];
  for(const [key, {height, layout}] of heights) {
    if(key.startsWith(prefix) && !key.includes(STORE_SEPARATOR)) stored.push([key.slice(prefix.length), height, layout]);
  }

  return stored;
}

/** Forgets the heights of the messages `filter` takes (by key); its listeners hear of it as of a height remembered. */
export function forgetWidgetHeights(filter: (key: string) => boolean) {
  let forgotten: string;
  mapDeleteWhere(heights, (key) => filter(key) && !!(forgotten = key));
  if(forgotten) listeners.forEach((listener) => listener(forgotten));
}

/** The height the widget had when it last ran; with `layout`, only if it was laid out at that one. */
export function getRememberedWidgetHeight(key: string, layout?: string) {
  const entry = heights.get(key);
  return entry && (layout === undefined || entry.layout === layout) ? entry.height : undefined;
}

/**
 * The height a widget's block has at least before the widget runs, at `layout`: the bot's, else the one it had there
 * when it last ran, else the lowest a widget is.
 */
export function getWidgetHeightAtLeast(media: MessageMedia.messageMediaWidget, key: string, layout: string) {
  return getWidgetFixedHeight(media.height) ?? getRememberedWidgetHeight(key, layout) ?? WIDGET_MIN_HEIGHT;
}
