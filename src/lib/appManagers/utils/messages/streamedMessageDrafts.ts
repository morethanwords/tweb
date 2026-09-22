import {RichMessage, TextWithEntities} from '@layer';
import copy from '@helpers/object/copy';
import deepEqual from '@helpers/object/deepEqual';
import {flattenRichMessageSummaryText} from '@lib/richMessage';

export type StreamedMessageDraftContent =
  | {kind: 'text', text: TextWithEntities}
  | {kind: 'rich', richMessage: RichMessage};

export type StreamedMessageDraft = Readonly<{
  key: string,
  peerId: PeerId,
  threadId: number,
  authorId: PeerId,
  randomId: string,
  tempId: number,
  revision: number,
  date: number,
  updatedAt: number,
  expiresAt: number,
  content: StreamedMessageDraftContent,
  /** layer 229: the bot lets the reader stop this stream */
  canStop: boolean,
  /** layer 229: what has been streamed so far survives the stop */
  keepOnStop: boolean
}>;

export type StreamedMessageDraftScope = Pick<StreamedMessageDraft, 'peerId' | 'threadId' | 'authorId'>;

/** Stopping is offered per chat/topic, not per author — whatever is streaming there is stopped. */
export type StreamedMessageStopScope = Pick<StreamedMessageDraft, 'peerId' | 'threadId'>;

export type StreamedMessageDraftRemovalReason = 'superseded' | 'cancelled' | 'expired' | 'clear';

export type StreamedMessageFinalCandidate = StreamedMessageDraftScope & {
  kind: StreamedMessageDraftContent['kind'],
  matchText: string
};

type UpsertOptions = StreamedMessageDraftScope & {
  randomId: string,
  createTempId: () => number,
  date: number,
  now: number,
  ttl: number,
  content: StreamedMessageDraftContent,
  canStop?: boolean,
  keepOnStop?: boolean
};

export function getStreamedMessageDraftKey({
  peerId,
  threadId,
  authorId,
  randomId
}: Pick<StreamedMessageDraft, 'peerId' | 'threadId' | 'authorId' | 'randomId'>) {
  return `${peerId}:${threadId || 0}:${authorId}:${randomId}`;
}

export function getStreamedMessageContentMatchText(content: StreamedMessageDraftContent) {
  return content.kind === 'text' ?
    content.text.text :
    flattenRichMessageSummaryText(content.richMessage, 0);
}

export default class StreamedMessageDrafts {
  private drafts = new Map<string, StreamedMessageDraft>();
  private finalized = new Map<string, number>();
  private stopped = new Map<string, number>();

  public upsert(options: UpsertOptions) {
    const key = getStreamedMessageDraftKey(options);
    const previous = this.drafts.get(key);
    const removed = previous ? [] : this.removeScope(options);
    const changed = !previous || !deepEqual(previous.content, options.content);
    const draft: StreamedMessageDraft = {
      key,
      peerId: options.peerId,
      threadId: options.threadId,
      authorId: options.authorId,
      randomId: options.randomId,
      tempId: previous?.tempId ?? options.createTempId(),
      revision: (previous?.revision ?? 0) + (changed ? 1 : 0),
      date: previous?.date ?? options.date,
      updatedAt: options.now,
      expiresAt: options.now + options.ttl,
      content: copy(options.content),
      canStop: !!options.canStop,
      keepOnStop: !!options.keepOnStop
    };

    this.drafts.set(key, draft);
    return {draft, previous, removed, changed};
  }

  public removeByKey(key: string) {
    const draft = this.drafts.get(key);
    if(draft) {
      this.drafts.delete(key);
    }

    return draft;
  }

  public removeExact(
    options: StreamedMessageDraftScope & {randomId: string},
    expectedContent?: StreamedMessageDraftContent
  ) {
    const key = getStreamedMessageDraftKey(options);
    const draft = this.drafts.get(key);
    if(expectedContent && draft && !deepEqual(draft.content, expectedContent)) return;
    return this.removeByKey(key);
  }

  public removeScope(scope: StreamedMessageDraftScope) {
    const removed: StreamedMessageDraft[] = [];
    for(const [key, draft] of this.drafts) {
      if(isSameScope(draft, scope)) {
        this.drafts.delete(key);
        removed.push(draft);
      }
    }

    return removed;
  }

  public removePeer(peerId: PeerId) {
    const removed: StreamedMessageDraft[] = [];
    for(const [key, draft] of this.drafts) {
      if(draft.peerId === peerId) {
        this.drafts.delete(key);
        removed.push(draft);
      }
    }

    const keyPrefix = `${peerId}:`;
    for(const key of this.finalized.keys()) {
      if(key.startsWith(keyPrefix)) {
        this.finalized.delete(key);
      }
    }
    for(const key of this.stopped.keys()) {
      if(key.startsWith(keyPrefix)) {
        this.stopped.delete(key);
      }
    }

    return removed;
  }

  public expire(now: number) {
    const removed: StreamedMessageDraft[] = [];
    for(const [key, draft] of this.drafts) {
      if(draft.expiresAt <= now) {
        this.drafts.delete(key);
        removed.push(draft);
      }
    }
    for(const [key, expiresAt] of this.finalized) {
      if(expiresAt <= now) {
        this.finalized.delete(key);
      }
    }
    for(const [key, expiresAt] of this.stopped) {
      if(expiresAt <= now) {
        this.stopped.delete(key);
      }
    }

    return removed;
  }

  public clear() {
    const removed = [...this.drafts.values()];
    this.drafts.clear();
    this.finalized.clear();
    this.stopped.clear();
    return removed;
  }

  public getNextExpiration() {
    let result: number;
    for(const draft of this.drafts.values()) {
      if(result === undefined || draft.expiresAt < result) {
        result = draft.expiresAt;
      }
    }
    for(const expiresAt of this.finalized.values()) {
      if(result === undefined || expiresAt < result) {
        result = expiresAt;
      }
    }
    for(const expiresAt of this.stopped.values()) {
      if(result === undefined || expiresAt < result) {
        result = expiresAt;
      }
    }

    return result;
  }

  public isFinalized(
    options: Pick<StreamedMessageDraft, 'peerId' | 'threadId' | 'authorId' | 'randomId'>,
    now: number
  ) {
    const key = getStreamedMessageDraftKey(options);
    const expiresAt = this.finalized.get(key);
    if(expiresAt === undefined) return false;
    if(expiresAt <= now) {
      this.finalized.delete(key);
      return false;
    }

    return true;
  }

  public markFinalized(draft: StreamedMessageDraft, expiresAt: number) {
    this.finalized.set(draft.key, expiresAt);
  }

  /**
   * A stream the reader already stopped must not be revived by an update that was in flight —
   * desktop keeps the same guard in `_stoppedRandomIds`.
   */
  public isStopped(
    options: Pick<StreamedMessageDraft, 'peerId' | 'threadId' | 'authorId' | 'randomId'>,
    now: number
  ) {
    const key = getStreamedMessageDraftKey(options);
    const expiresAt = this.stopped.get(key);
    if(expiresAt === undefined) return false;
    if(expiresAt <= now) {
      this.stopped.delete(key);
      return false;
    }

    return true;
  }

  /** The most recently updated stoppable draft of a chat/topic, the one a Stop press targets. */
  public findStoppable(scope: StreamedMessageStopScope) {
    let result: StreamedMessageDraft;
    for(const draft of this.drafts.values()) {
      if(!draft.canStop || draft.peerId !== scope.peerId || (draft.threadId || 0) !== (scope.threadId || 0)) {
        continue;
      }

      if(!result || draft.updatedAt > result.updatedAt) {
        result = draft;
      }
    }

    return result;
  }

  /**
   * Applies the stop the bot acknowledged (or the one we just asked for). A draft that does not
   * keep what it streamed is dropped; one that does stays, only no longer stoppable.
   */
  public applyStop(
    options: Pick<StreamedMessageDraft, 'peerId' | 'threadId' | 'authorId' | 'randomId'>,
    expiresAt: number
  ) {
    const key = getStreamedMessageDraftKey(options);
    this.stopped.set(key, expiresAt);

    const draft = this.drafts.get(key);
    if(!draft) return;

    if(!draft.keepOnStop) {
      this.drafts.delete(key);
      return {draft, removed: true};
    }

    if(!draft.canStop) {
      return {draft, removed: false};
    }

    const updated: StreamedMessageDraft = {...draft, canStop: false};
    this.drafts.set(key, updated);
    return {draft: updated, removed: false};
  }

  public adopt(candidate: StreamedMessageFinalCandidate) {
    const best = chooseStreamedMessageDraftForFinal(this.drafts.values(), candidate);
    if(!best) return;

    this.drafts.delete(best.key);
    return best;
  }

  public get size() {
    return this.drafts.size;
  }
}

export function chooseStreamedMessageDraftForFinal(
  drafts: Iterable<StreamedMessageDraft>,
  candidate: StreamedMessageFinalCandidate
) {
  let bestSameKind: StreamedMessageDraft;
  let bestSameKindPrefix = 0;
  let bestOtherKind: StreamedMessageDraft;
  let bestOtherKindPrefix = 0;
  let newestRich: StreamedMessageDraft;

  for(const draft of drafts) {
    if(!isSameScope(draft, candidate)) {
      continue;
    }

    if(
      draft.content.kind === 'rich' &&
      (!newestRich || draft.updatedAt > newestRich.updatedAt)
    ) {
      newestRich = draft;
    }

    const prefix = getCommonPrefixLength(
      getStreamedMessageContentMatchText(draft.content),
      candidate.matchText
    );
    if(!prefix) {
      continue;
    }

    if(draft.content.kind === candidate.kind) {
      if(
        prefix > bestSameKindPrefix ||
        prefix === bestSameKindPrefix && draft.updatedAt > bestSameKind?.updatedAt
      ) {
        bestSameKind = draft;
        bestSameKindPrefix = prefix;
      }
    } else if(
      prefix > bestOtherKindPrefix ||
      prefix === bestOtherKindPrefix && draft.updatedAt > bestOtherKind?.updatedAt
    ) {
      bestOtherKind = draft;
      bestOtherKindPrefix = prefix;
    }
  }

  // A rich message can contain only media and therefore have no flattened text.
  // Desktop adopts the newest rich draft in that case, and also uses it as the
  // final fallback when a rich stream rewrites all visible text at once.
  return bestSameKind || bestOtherKind || (candidate.kind === 'rich' ? newestRich : undefined);
}

function isSameScope(a: StreamedMessageDraftScope, b: StreamedMessageDraftScope) {
  return a.peerId === b.peerId &&
    a.threadId === b.threadId &&
    a.authorId === b.authorId;
}

function getCommonPrefixLength(draftText: string, finalText: string) {
  const length = Math.min(draftText.length, finalText.length);
  let prefix = 0;
  while(prefix < length && draftText[prefix] === finalText[prefix]) {
    ++prefix;
  }
  return prefix;
}
