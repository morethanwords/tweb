import type {AccountDatabase} from '@config/databases/state';
import {getDatabaseState} from '@config/databases/state';
import {AppManager} from '@appManagers/manager';
import isLegacyMessageId from '@appManagers/utils/messageId/isLegacyMessageId';
import {getFloodWaitTime} from '@appManagers/utils/getFloodWaitTime';
import {WIDGET_POLL_DEFAULT_PERIOD, WIDGET_POLL_MAX_PERIOD, WIDGET_POLL_MIN_PERIOD} from '@appManagers/constants';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {FullMid, makeFullMid, splitFullMid} from '@appManagers/utils/messages/fullMid';
import createSerializedQueue from '@helpers/createSerializedQueue';
import clamp from '@helpers/number/clamp';
import makeError from '@helpers/makeError';
import noop from '@helpers/noop';
import withTimeout from '@helpers/schedulers/withTimeout';
import type {Message, MessageMedia} from '@layer';
import type {BroadcastEvents} from '@lib/rootScope';
import AppStorage from '@lib/storage';
import type {StoredWidgetHeight} from '@lib/widgetSandbox/sizing';

/** What a widget keeps in a Web Storage area. */
export type WidgetValues = Record<string, string>;

/** How long a widget's request waits for the bot's answer: twice the server's wait (WIDGET_RESPONSE_TIMEOUT). */
const WIDGET_REQUEST_TIMEOUT = 30e3;
/**
 * What a part of a chat's history that goes is told by (`doFlushHistory`'s filters: a topic, a saved dialog, a sender,
 * dates), kept with the storage: the message itself may not be loaded by then
 */
type WidgetMessageScope = Pick<Message.message, '_' | 'mid' | 'date' | 'fromId' | 'saved_peer_id' | 'reply_to'>;
type WidgetRecord = {values: WidgetValues, message?: WidgetMessageScope};
/** The heights auto-height widgets had where they last ran (lib/widgetSandbox/sizing.ts), under a key of their own. */
const HEIGHTS_KEY = 'heights';
/**
 * A height as the page keeps it, and on disk what its message is told by too: a message may have a height and nothing
 * in its storage, and a part of the history that goes takes the height as well (one saved before this was kept has
 * none, and goes as its message does, or with the newest kept)
 */
type StoredHeight = [...StoredWidgetHeight, WidgetMessageScope?];
type WidgetStore = Record<FullMid, WidgetRecord> & {[HEIGHTS_KEY]: StoredHeight[]};
/**
 * A part of a chat's history that went (deleteWidgetStorageOf): when, the messages it took, and the records it took by
 * what was kept with them (`taken`: their messages may not be loaded, and the record that told was the one it took)
 */
type ScopedDeletion = {at: number, filter: (message: Message.message) => boolean, taken?: Set<FullMid>};
type SharedStateCarrier = {peerId: PeerId, mid: number};
/**
 * The account's polls of a shared widget, whichever tabs ask (pollWidgetPublicData): the request on its way, with the
 * messages its answer goes to and the shared state each showed as it began or as its poll joined; the messages the
 * next request takes along (told of since the last one, or the carriers of one that failed); when (Date.now()) the next
 * request may go; and the period the last answer gave, within the bounds (the default one before any)
 */
type SharedStatePoll = {
  request?: {promise: Promise<number>, carriers: Map<FullMid, SharedStateCarrier & {state: string}>},
  pending: Map<FullMid, SharedStateCarrier>,
  nextAt: number,
  period: number
};
/** How many of them a chat keeps: a widget that runs on through more deletions of parts of its chat is not expected. */
const MAX_SCOPED_DELETIONS = 20;

/**
 * The `localStorage` of HTML widgets (docs/sdk-v1.md §2.8, §5.4): one area per message — (account, chat, message id),
 * so a forwarded copy starts empty — on disk, never sent anywhere. The framework enforces its 4 KB quota; this keeps
 * what it is given and deletes it with the message, with the chat's history, with the account (the store is one of
 * the account's, so a log-out wipes it) and on "Clear cache". `sessionStorage` lives in the page's memory.
 */
export default class AppWidgetsManager extends AppManager {
  private storage: AppStorage<WidgetStore, AccountDatabase>;
  /** The keys on disk, read once on the first deletion: most deleted messages had no widget. */
  private keys: Promise<Set<FullMid>>;
  /** When the history of a chat was cleared, or the chat deleted (Date.now()), while this session ran. */
  private clearedPeers = new Map<PeerId, number>();
  /** The channels whose history was cleared up to a message (its server id) while this session ran. */
  private clearedUpTo = new Map<PeerId, number>();
  /** The parts of chats' histories that went while this session ran, the newest last. */
  private scopedDeletions = new Map<PeerId, ScopedDeletion[]>();
  /**
   * Messages of private chats and basic groups deleted while this session ran, by their ids, which are the account's: a
   * deletion of several chats' messages is not marked in the chat of each (appMessagesManager.isMessageDeleted)
   */
  private deletedLegacyMids = new Set<number>();
  /** When "Clear cache" last ran (Date.now()). */
  private clearedAt = 0;
  /**
   * Every write of the store — a commit, a deletion, the heights, "Clear cache" — one after another: each reads what the
   * ones before it wrote, and starts once they have gone to the database (AppStorage writes a moment after it is
   * asked), so none lands after a later one
   */
  private writes = createSerializedQueue();
  /** The writes asked for (`write`), and how many of them are not done: a read they may not have reached waits. */
  private writesAsked = 0;
  private writesPending = 0;
  /**
   * The reads of the store on their way outside the writes (`read`): a write waits for them, or one would put over what
   * it wrote, or back what it deleted, what it read before (AppStorage keeps what a read brings in its cache)
   */
  private reads = new Set<Promise<unknown>>();
  /**
   * What the widgets of messages being sent keep, by their temporary ids, with when their writers were made, until the
   * server's ids come (onWidgetMessageSent): here, in the account's own worker, whichever account a tab shows by then
   */
  private sending = new Map<FullMid, {values: WidgetValues, boundAt: number}>();
  /** The ids the server gave the widget messages sent while this session ran, by their temporary ones: a write may come late. */
  private sentAs = new Map<FullMid, number>();
  /**
   * The widget requests past their deadline that are still on their way, by message: nothing cancels one, and offline
   * it goes once the connection is back (getBotWidgetQueryAnswer)
   */
  private expiredQueries = new Map<FullMid, Promise<void>>();
  /** By widget_id. */
  private sharedStatePolls = new Map<string, SharedStatePoll>();

  protected after() {
    this.storage = new AppStorage(getDatabaseState(this.getAccountNumber()), 'widgets');
  }

  /**
   * A widget message being sent got the server's id (appMessagesManager.finalizePendingMessage, also when its chat's
   * history was flushed meanwhile and no bubble is told): what its widget keeps under the temporary id goes under it.
   */
  public onWidgetMessageSent(peerId: PeerId, tempId: number, mid: number) {
    const tempKey = makeFullMid(peerId, tempId);
    this.sentAs.set(tempKey, mid);
    // what the tabs keep of it too, also in a tab that shows another account by now (it does not hear message_sent then);
    // sent ahead of message_sent, so the bubble built again starts from it
    this.rootScope.dispatchEventOfAccount(this.getAccountNumber(), 'widget_storage_remap', {accountNumber: this.getAccountNumber(), peerId, tempId, mid});
    const sending = this.sending.get(tempKey);
    if(!sending) return;
    this.sending.delete(tempKey);
    this.setWidgetStorage(peerId, mid, sending.values, sending.boundAt);
  }

  private getKeys() {
    return this.keys ??= this.storage.getAllKeys().then((keys) => new Set(keys.filter((key) => key !== HEIGHTS_KEY) as FullMid[]));
  }

  /** Runs `operation` after the writes before it (`writes`), and after the reads on their way (`reads`). */
  private write(operation: () => Promise<unknown>) {
    ++this.writesAsked;
    ++this.writesPending;
    return this.writes.enqueue(async() => {
      await Promise.all(this.reads);
      await operation();
    }).then(noop, noop).finally(() => --this.writesPending);
  }

  /**
   * A record as the writes asked for before the read, and while it reads, leave it: a write on its way, or asked for
   * meanwhile, may change what was read (a commit; "Clear cache", after which a widget built again is newer than it and
   * would write it back), so it is read again once that is done. A read that meets none goes straight to the store.
   */
  private async read<K extends keyof WidgetStore>(key: K): Promise<WidgetStore[K]> {
    const asked = this.writesAsked;
    if(!this.writesPending) {
      const reading = this.storage.get(key);
      this.reads.add(reading);
      const value = await reading.finally(() => this.reads.delete(reading));
      if(asked === this.writesAsked) return value;
    }

    return this.writes.enqueue(() => this.storage.get(key)).catch((): WidgetStore[K] => undefined);
  }

  public async getWidgetHeights() {
    return (await this.read(HEIGHTS_KEY))?.map((entry) => entry.slice(0, 3) as StoredWidgetHeight);
  }

  /**
   * A page's heights of this account, the newest last, put over those on disk: every tab of the account keeps its own,
   * and the others' stay (a message's from the page, the newest `limit`: the page's own, sizing.ts) — of the messages
   * the server knows and that are still there (a tab showing another account heard nothing of their deletion). They go
   * with their messages (forgetHeights), "Clear cache" and the account. `takenAt`: when the page took them (Date.now());
   * a message's from before a deletion that took it stay out, as a widget's writes do (canKeepWidgetStorage).
   */
  public setWidgetHeights(heights: StoredWidgetHeight[], limit: number, takenAt = Infinity) {
    return this.write(() => this.changeHeights((stored) => {
      const merged = new Map((stored ?? []).map((entry) => [entry[0], entry]));
      for(const [fullMid, height, layout] of heights) {
        const {peerId, mid} = splitFullMid(fullMid as FullMid);
        const message = this.appMessagesManager.getMessageByPeer(peerId, mid);
        const scope = message?._ === 'message' ? getWidgetMessageScope(message) : merged.get(fullMid)?.[3];
        if(!this.canKeepWidgetStorage(peerId, mid, takenAt, scope)) continue;
        merged.delete(fullMid);
        merged.set(fullMid, [fullMid, height, layout, scope]);
      }

      return [...merged.values()].filter(([fullMid]) => {
        const {peerId, mid} = splitFullMid(fullMid as FullMid);
        return mid > 0 && this.canKeepWidgetStorage(peerId, mid);
      }).slice(-limit);
    }));
  }

  /** Drops the heights of the messages `filter` takes, within a write: they go with the messages, as the storage does. */
  private forgetHeights(filter: (peerId: PeerId, mid: number) => boolean) {
    return this.changeHeights((heights) => heights?.filter(([fullMid]) => {
      const {peerId, mid} = splitFullMid(fullMid as FullMid);
      return !filter(peerId, mid);
    }));
  }

  /** Changes the heights on disk, within a write: from what the writes before it wrote. */
  private async changeHeights(change: (heights: StoredHeight[] | undefined) => StoredHeight[] | undefined) {
    const heights = await this.storage.get(HEIGHTS_KEY);
    const changed = change(heights);
    if(changed && (!heights || changed.length !== heights.length || changed.some((entry, i) => entry !== heights[i]))) {
      await this.storage.set({[HEIGHTS_KEY]: changed});
    }
  }

  public async getWidgetStorage(peerId: PeerId, mid: number): Promise<WidgetValues | undefined> {
    const key = makeFullMid(peerId, mid);
    if(!isSentMid(mid)) return this.sending.get(key)?.values;
    return (await this.read(key))?.values;
  }

  /**
   * `boundAt`: when the writer was made (Date.now()), see canKeepWidgetStorage. A message being sent keeps what its widget
   * writes in memory, and it goes to disk under the server's id once the message has it.
   */
  public async setWidgetStorage(peerId: PeerId, mid: number, values: WidgetValues, boundAt = Infinity): Promise<void> {
    const key = makeFullMid(peerId, mid);
    if(!isSentMid(mid)) {
      const sentAs = this.sentAs.get(key);
      if(sentAs !== undefined) return this.setWidgetStorage(peerId, sentAs, values, boundAt);
      const message = this.appMessagesManager.getMessageByPeer(peerId, mid) as Message.message;
      // as on disk: a writer from before a deletion that took the message neither writes nor clears (a newer one's stays)
      if(
        this.appMessagesManager.isMessageDeleted(peerId, mid) ||
        this.isWriterCleared(peerId, mid, boundAt, message && getWidgetMessageScope(message))
      ) return;
      if(Object.keys(values).length) this.sending.set(key, {values, boundAt});
      else this.sending.delete(key);
      return;
    }

    if(!this.canKeepWidgetStorage(peerId, mid, boundAt)) return;
    return this.write(async() => {
      const message = this.appMessagesManager.getMessageByPeer(peerId, mid) as Message.message;
      const scope = message ? getWidgetMessageScope(message) : (await this.storage.get(key))?.message;
      const known = await this.getKeys();
      // again, with nothing to come between it and the write: "Clear cache" or a deletion may have come meanwhile; a
      // clear of the area (nothing left in it) is a write as much, which would take a newer widget's
      if(!this.canKeepWidgetStorage(peerId, mid, boundAt, scope)) return;
      if(!Object.keys(values).length) return this.deleteKeys([key]);
      known.add(key);
      await this.storage.set({[key]: {values, message: scope}});
    });
  }

  /**
   * Whether the widget of a message may keep anything on disk: not while the message is being sent (a temporary id: what
   * it writes waits in `sending`), nor once it is gone — deleted, cut off by its channel's history, or cleared
   * with it — nor a writer (`boundAt`: when it was made) from before a deletion that took it (isWriterCleared). A
   * widget's last commit comes as its bubble goes, and a deletion is one reason a bubble goes: written then, it would
   * outlive the message. A height has no writer: of a chat whose history went, it stays while its message is loaded
   * here.
   */
  private canKeepWidgetStorage(peerId: PeerId, mid: number, boundAt?: number, message?: WidgetMessageScope) {
    return isSentMid(mid) &&
      !this.appMessagesManager.isMessageDeleted(peerId, mid) &&
      !this.appMessagesManager.isMessageIdUnavailableByChannelCutoff(peerId, mid) &&
      !(this.deletedLegacyMids.has(mid) && !this.appPeersManager.isChannel(peerId)) &&
      !(getServerMessageId(mid) <= (this.clearedUpTo.get(peerId) ?? 0)) &&
      (boundAt === undefined ?
        !(this.clearedPeers.has(peerId) && !this.appMessagesManager.getMessageByPeer(peerId, mid)) :
        !this.isWriterCleared(peerId, mid, boundAt, message));
  }

  /**
   * Whether a writer made at `boundAt` is from before "Clear cache", before its chat's history was cleared or the chat
   * deleted, or before a part of the history that took its message (`message`: what it is told by) went: its widget
   * still holds what went, and its next commit would put it back.
   */
  private isWriterCleared(peerId: PeerId, mid: number, boundAt: number, message?: WidgetMessageScope) {
    const key = makeFullMid(peerId, mid);
    return boundAt <= Math.max(this.clearedAt, this.clearedPeers.get(peerId) ?? 0) ||
      !!this.scopedDeletions.get(peerId)?.some(({at, filter, taken}) => boundAt <= at && (
        taken?.has(key) || (!!message && filter(message as Message.message))
      ));
  }

  /** Forgets what the widgets of messages being sent keep, of the messages `filter` takes. */
  private forgetSending(filter: (peerId: PeerId, mid: number) => boolean) {
    for(const key of this.sending.keys()) {
      const {peerId, mid} = splitFullMid(key);
      if(filter(peerId, mid)) this.sending.delete(key);
    }
  }

  /** Deletes the records of `keys` that are on disk, within a write. */
  private async deleteKeys(keys: FullMid[]) {
    const known = await this.getKeys();
    keys = keys.filter((key) => known.delete(key));
    await Promise.all(keys.map((key) => this.storage.delete(key)));
  }

  /** Deletes the storage and the heights of the messages `filter` takes. */
  private deleteWhere(filter: (peerId: PeerId, mid: number) => boolean) {
    this.forgetSending(filter);
    return this.write(async() => {
      await this.forgetHeights(filter);
      const known = await this.getKeys();
      await this.deleteKeys([...known].filter((key) => {
        const {peerId, mid} = splitFullMid(key);
        return filter(peerId, mid);
      }));
    });
  }

  /** The messages were deleted. */
  public deleteWidgetStorage(peerId: PeerId, mids: number[]) {
    const gone = new Set(mids);
    this.forgetSending((_peerId, mid) => _peerId === peerId && gone.has(mid));
    this.tellTabsOfDeletion({peerId, mids});
    return this.write(async() => {
      await this.forgetHeights((_peerId, mid) => _peerId === peerId && gone.has(mid));
      await this.deleteKeys(mids.map((mid) => makeFullMid(peerId, mid)));
    });
  }

  /**
   * Messages of private chats and basic groups, of chats maybe not known here (none of their messages was loaded): their
   * server ids are unique within the account, so they name the widgets without the chat; a temporary one (a message
   * being sent, called off) only within its chat, `peerId`.
   */
  public deleteWidgetStorageByLegacyMids(mids: number[], peerId?: PeerId) {
    const temporary = new Set(mids.filter((mid) => !isSentMid(mid)));
    if(peerId && temporary.size) {
      this.forgetSending((_peerId, mid) => _peerId === peerId && temporary.has(mid));
      this.tellTabsOfDeletion({peerId, mids: [...temporary]});
    }

    const set = new Set(mids.filter((mid) => isSentMid(mid) && isLegacyMessageId(mid)));
    if(!set.size) return;
    set.forEach((mid) => this.deletedLegacyMids.add(mid));
    // of whichever chats they are
    this.tellTabsOfDeletion({mids: [...set]});
    return this.deleteWhere((peerId, mid) => set.has(mid) && !this.appPeersManager.isChannel(peerId));
  }

  /**
   * A part of the chat's history is gone (a topic, a saved dialog, a sender's messages, a span of dates): the messages
   * `filter` takes, loaded or not; a widget that ran before it writes nothing more for them
   */
  public deleteWidgetStorageOf(peerId: PeerId, filter: (message: Message.message) => boolean) {
    const deletions = this.scopedDeletions.get(peerId) ?? [];
    const scoped: ScopedDeletion = {at: Date.now(), filter};
    deletions.push(scoped);
    if(deletions.length > MAX_SCOPED_DELETIONS) deletions.shift();
    this.scopedDeletions.set(peerId, deletions);
    this.forgetSending((_peerId, mid) => {
      const message = _peerId === peerId && this.appMessagesManager.getMessageByPeer(peerId, mid);
      return !!message && message._ === 'message' && filter(message);
    });
    // the ones loaded here, as they are now: a flush deletes them right after
    const loaded: number[] = [];
    for(const [mid, message] of this.appMessagesManager.getHistoryMessagesStorage(peerId)) {
      if(message._ === 'message' && filter(message)) loaded.push(mid);
    }

    return this.write(async() => {
      const known = await this.getKeys();
      const keys = [...known].filter((key) => splitFullMid(key).peerId === peerId);
      const records = await Promise.all(keys.map((key) => this.storage.get(key)));
      const heights = await this.storage.get(HEIGHTS_KEY);
      // and the others, by what their storage or their height kept of them (a record written with its message not
      // loaded has nothing)
      const mids = new Set([
        ...loaded,
        ...keys.filter((key, i) => records[i]?.message && filter(records[i].message as Message.message)).map((key) => splitFullMid(key).mid),
        ...(heights ?? [])
        .filter(([fullMid, , , scope]) => scope && splitFullMid(fullMid as FullMid).peerId === peerId && filter(scope as Message.message))
        .map(([fullMid]) => splitFullMid(fullMid as FullMid).mid)
      ]);
      const taken = scoped.taken = new Set([...mids].map((mid) => makeFullMid(peerId, mid)));
      if(!taken.size) return;
      // the tabs drop what they keep of them (storage.ts): nothing else tells them of a topic found deleted
      this.tellTabsOfDeletion({peerId, mids: [...mids]});
      await this.forgetHeights((_peerId, mid) => _peerId === peerId && mids.has(mid));
      await this.deleteKeys([...taken]);
    });
  }

  /**
   * The chat's history is gone: cleared, or the chat deleted — or, with `maxId` (a server id), a channel's history up to
   * that message, the newer messages staying. The tabs drop what they keep of it (storage.ts).
   */
  public deletePeerWidgetStorage(peerId: PeerId, maxId?: number) {
    if(maxId === undefined) this.clearedPeers.set(peerId, Date.now());
    else this.clearedUpTo.set(peerId, Math.max(maxId, this.clearedUpTo.get(peerId) ?? 0));
    this.tellTabsOfDeletion({peerId, maxId});
    // up to a message: of sent ones only (a message being sent gets an id after it, though its temporary one, rounded,
    // falls within)
    return this.deleteWhere((_peerId, mid) => _peerId === peerId && (maxId === undefined || (isSentMid(mid) && getServerMessageId(mid) <= maxId)));
  }

  /**
   * A request of the widget in the message (`TelegramWidget.request`, checked by the framework): `data` goes to the bot
   * like a callback button's, and its answer comes back. A flood wait is not waited out: the widget learns it is rate
   * limited. Unanswered for twice the server's wait for the bot (offline, the request waits for the connection), it
   * fails: the widget sends nothing more until its request is done. It goes once: an answer that may hide a request the
   * bot already ran (a 5xx, an unknown error) fails it, as the request carries nothing that would let the bot tell a
   * repeat from a new one — and for the same reason, while one that failed by the deadline is still on its way (it may
   * yet reach the bot), the message's next ones fail at once instead of going.
   */
  public async getBotWidgetQueryAnswer(peerId: PeerId, mid: number, data: string) {
    if(!isSentMid(mid)) throw makeError('MESSAGE_ID_INVALID');
    const key = makeFullMid(peerId, mid);
    if(this.expiredQueries.has(key)) throw makeError('TIMEOUT', 'the request before it is still on its way');
    const request = this.apiManager.invokeApi('messages.getBotWidgetQueryAnswer', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid),
      // no wallet in this client: the bot gets the request without one
      query_type: {_: 'widgetQueryTypeData', pFlags: {}},
      data: new TextEncoder().encode(data)
    }, {floodMaxTimeout: 0, noRetry: true});
    const answer = await withTimeout(request, WIDGET_REQUEST_TIMEOUT);
    if(!answer) {
      const expired = request.then(noop, noop).finally(() => {
        if(this.expiredQueries.get(key) === expired) this.expiredQueries.delete(key);
      });
      this.expiredQueries.set(key, expired);
      throw makeError('TIMEOUT');
    }

    return answer;
  }

  /**
   * A shared widget's public_data, polled through the message `peerId`/`mid` with the hash it has. The current value —
   * the answer's, or on "not modified" the one that message has (none is a value too) — goes into every message of
   * `carriers` (the ones on screen that show the same widget_id) that does not have it: also one that came in after the
   * poll that brought it. A message asked through that changed while the poll was out (an edit) is newer than either
   * answer: nothing is written, and the next poll settles it; another carrier that changed meanwhile (an update of its
   * own) is newer than the answer too, and keeps what it has; a message whose widget was replaced shows another one. A
   * message being sent is not asked through.
   *
   * This keeps the cadence for every tab of the account, which polls when it says: it resolves with when (Date.now(),
   * ms) the next poll should go — the period the server wants after its answer, within the bounds (the default one when
   * it gives none), the end of a flood wait, or after a failure the last answer's period (the default one before any).
   * The server is asked once per that, however many tabs poll; its answer goes once to the carriers of every poll since
   * the last request: a poll while one is out joins it; one before the next may go asks nothing and writes nothing (an
   * earlier answer may be older than what a message has since: a bot's edit), its carriers go with the next request, as
   * do those of one that failed. What a carrier shows is taken as the request it goes with begins, or as its poll joins.
   */
  public async pollWidgetPublicData(peerId: PeerId, mid: number, carriers: SharedStateCarrier[]): Promise<number> {
    const media = this.getWidgetMedia(peerId, mid);
    if(!media || !isSentMid(mid)) return Date.now() + WIDGET_POLL_DEFAULT_PERIOD * 1000;
    const key = media.widget_id === undefined ? undefined : '' + media.widget_id;
    let poll = key === undefined ? undefined : this.sharedStatePolls.get(key);
    if(!poll) {
      poll = {pending: new Map(), nextAt: 0, period: WIDGET_POLL_DEFAULT_PERIOD};
      if(key !== undefined) this.sharedStatePolls.set(key, poll);
    }

    // one on its way: its answer goes to these too, unless they change before it comes
    const {request} = poll;
    if(request) {
      for(const carrier of carriers) {
        const fullMid = makeFullMid(carrier.peerId, carrier.mid);
        if(!request.carriers.has(fullMid)) request.carriers.set(fullMid, {...carrier, state: this.getWidgetSharedState(carrier)});
      }

      return request.promise;
    }

    for(const carrier of carriers) poll.pending.set(makeFullMid(carrier.peerId, carrier.mid), carrier);
    if(Date.now() < poll.nextAt) return poll.nextAt;
    return this.askWidgetPublicData(peerId, mid, media, poll);
  }

  /** The shared state a message shows: its widget's, as of the hash it has. */
  private getWidgetSharedState(carrier: SharedStateCarrier) {
    const carried = this.getWidgetMedia(carrier.peerId, carrier.mid);
    return carried && `${carried.widget_id}_${carried.public_data_hash || 0}`;
  }

  /**
   * A shared widget's shared state, asked of the server through the message with the hash it has; the answer goes, once,
   * to the messages the polls of the widget told of until it came (`poll.pending` as it begins, and those of the polls
   * that join it), each unless what it shows changed while it was out. Resolves with when the next request may go.
   */
  private askWidgetPublicData(peerId: PeerId, mid: number, media: MessageMedia.messageMediaWidget, poll: SharedStatePoll) {
    // what they show as it begins
    const carriers = new Map<FullMid, SharedStateCarrier & {state: string}>();
    for(const [fullMid, carrier] of poll.pending) carriers.set(fullMid, {...carrier, state: this.getWidgetSharedState(carrier)});
    poll.pending.clear();
    const asked = this.getWidgetSharedState({peerId, mid});
    const sent = {data: media.public_data ?? '', hash: media.public_data_hash || 0};
    const promise = this.apiManager.invokeApi('messages.getWidgetPublicData', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid),
      hash: sent.hash
    }, {floodMaxTimeout: 0, noRetry: true}).then((result) => {
      // "not modified": what the message asked through has is the current one
      const latest = result._ === 'messages.widgetPublicData' ? {data: result.data, hash: result.hash || 0} : sent;
      // the message asked through changed while it was out (an edit): newer than either answer, nothing is written
      if(this.getWidgetSharedState({peerId, mid}) === asked) {
        const latestState = `${media.widget_id}_${latest.hash}`;
        const stale = [...carriers.values()].filter((carrier) => {
          const state = this.getWidgetSharedState(carrier);
          return state !== undefined && state === carrier.state && state.startsWith(media.widget_id + '_') && state !== latestState;
        }).map(({peerId, mid}) => ({peerId, mid}));
        if(stale.length) {
          this.appMessagesManager.setMessagesWidgetData(stale, {public_data: latest.data, public_data_hash: latest.hash});
        }
      }

      poll.period = clamp(result.period || WIDGET_POLL_DEFAULT_PERIOD, WIDGET_POLL_MIN_PERIOD, WIDGET_POLL_MAX_PERIOD);
      return poll.nextAt = Date.now() + poll.period * 1000;
    }, (err: ApiError) => {
      // its messages go with the next one, which waits as long as a flood wait says (the period stays the server's), or
      // the last answer's period
      for(const [fullMid, {peerId, mid}] of carriers) if(!poll.pending.has(fullMid)) poll.pending.set(fullMid, {peerId, mid});
      const flood = getFloodWaitTime(err);
      return poll.nextAt = Date.now() + (flood.hasWaitTime ? flood.waitTime : poll.period) * 1000;
    });
    poll.request = {promise, carriers};
    const done = () => {
      if(poll.request?.promise === promise) poll.request = undefined;
    };
    promise.then(done, done);
    return promise;
  }

  private getWidgetMedia(peerId: PeerId, mid: number) {
    const media = (this.appMessagesManager.getMessageByPeer(peerId, mid) as Message.message)?.media;
    return media?._ === 'messageMediaWidget' ? media : undefined;
  }

  /**
   * The messages a channel no longer shows, up to `availableMinId` (the message's id here, as appMessagesManager keeps
   * it): its history was cleared for this user, or hidden from new members.
   */
  public deleteWidgetStorageByChannelCutoff(peerId: PeerId, availableMinId: number) {
    // the tabs take a server id (storage.ts), as with a history cleared up to a message
    this.tellTabsOfDeletion({peerId, maxId: getServerMessageId(availableMinId)});
    return this.deleteWhere((_peerId, mid) => _peerId === peerId && this.appMessagesManager.isMessageIdUnavailableByChannelCutoff(peerId, mid));
  }

  /**
   * The tabs drop what they keep of the messages a deletion took (storage.ts): told of every account, also one a tab
   * does not show now, which hears nothing else of it (history_delete goes to the tabs of the account they show)
   */
  private tellTabsOfDeletion(deletion: Omit<BroadcastEvents['widget_storage_delete'], 'accountNumber'>) {
    this.rootScope.dispatchEvent('widget_storage_delete', {accountNumber: this.getAccountNumber(), ...deletion});
  }

  /** Settings → Data and Storage → Clear cache. */
  public clearWidgetStorage() {
    this.clearedAt = Date.now();
    this.sending.clear();
    this.tellTabsOfDeletion({});
    // after the writes on their way, not under one of them
    return this.write(async() => {
      const known = await this.getKeys();
      // each through the store first: with a passcode it is saved whole a moment after a change, and a save still on its
      // way would put back what a clear alone took; after a deletion it saves once more (encryptedStorageLayer.ts)
      const keys: (keyof WidgetStore)[] = [...known, HEIGHTS_KEY];
      await Promise.all(keys.map((key) => this.storage.delete(key)));
      known.clear();
      await this.storage.clear();
    });
  }
}

/** What a part of a chat's history that goes tells the message by. */
function getWidgetMessageScope(message: Message.message): WidgetMessageScope {
  return {_: 'message', mid: message.mid, date: message.date, fromId: message.fromId, saved_peer_id: message.saved_peer_id, reply_to: message.reply_to};
}

/** A message being sent has a temporary id until the server gives it its own: the server knows nothing by it. */
function isSentMid(mid: number) {
  return Number.isInteger(mid);
}
