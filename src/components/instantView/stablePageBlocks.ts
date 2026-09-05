import {PageBlock} from '@layer';

export type StablePageBlockEntry = {
  key: string,
  block: PageBlock
};

type IndexedEntry = {
  entry: StablePageBlockEntry,
  index: number
};

class IndexedEntryPool {
  private tree: number[];

  constructor(private entries: IndexedEntry[]) {
    this.tree = new Array(entries.length + 1).fill(0);
    entries.forEach((_, index) => this.add(index, 1));
  }

  public takeClosest(targetIndex: number, unmatched: Map<number, IndexedEntry>) {
    const insertionIndex = lowerBound(this.entries, targetIndex);
    const beforeCount = this.getCount(insertionIndex);
    const totalCount = this.getCount(this.entries.length);
    const leftPosition = beforeCount ? this.findByOrder(beforeCount) : -1;
    const rightPosition = beforeCount < totalCount ? this.findByOrder(beforeCount + 1) : -1;

    let position: number;
    if(leftPosition === -1) {
      position = rightPosition;
    } else if(rightPosition === -1) {
      position = leftPosition;
    } else {
      const leftDistance = targetIndex - this.entries[leftPosition].index;
      const rightDistance = this.entries[rightPosition].index - targetIndex;
      position = leftDistance <= rightDistance ? leftPosition : rightPosition;
    }

    if(position === -1) return;

    const match = this.entries[position];
    this.add(position, -1);
    unmatched.delete(match.index);
    return match;
  }

  private add(position: number, value: number) {
    for(let index = position + 1; index < this.tree.length; index += index & -index) {
      this.tree[index] += value;
    }
  }

  private getCount(end: number) {
    let count = 0;
    for(let index = end; index > 0; index -= index & -index) {
      count += this.tree[index];
    }
    return count;
  }

  private findByOrder(order: number) {
    let position = 0;
    let step = 1;
    while(step < this.tree.length) step <<= 1;

    for(step >>= 1; step; step >>= 1) {
      const next = position + step;
      if(next < this.tree.length && this.tree[next] < order) {
        position = next;
        order -= this.tree[next];
      }
    }

    return position;
  }
}

const NESTED_PAGE_BLOCK_KEYS = new Set(['blocks', 'items', 'rows', 'articles', 'cover', 'channel']);

/**
 * Gives a fresh PageBlock snapshot stable view keys without treating the mutable text as identity.
 *
 * The protocol doesn't provide block ids. We therefore match in three passes:
 * 1. render-signature-equivalent blocks (preserves moved/inserted unchanged blocks),
 * 2. blocks with protocol-backed identities such as photo/document/anchor ids,
 * 3. the nearest remaining block of the same kind (preserves state while a text/details block streams).
 *
 * Stateful media/embed blocks never use the last heuristic: changing their protocol identity must
 * remount the corresponding player/webview instead of leaking the previous resource's state.
 */
export function reconcileStablePageBlockEntries(
  previous: readonly StablePageBlockEntry[],
  blocks: readonly PageBlock[],
  createKey: () => string
): StablePageBlockEntry[] {
  // Streaming snapshots normally keep the block structure and only update the
  // contents of one block. In that overwhelmingly common case, matching by
  // position avoids serializing every growing RichText tree on every token.
  // Protocol-backed blocks still have to keep the same identity: reusing a
  // photo/embed owner for another resource would retain the wrong player state.
  if(
    previous.length === blocks.length &&
    blocks.every((block, index) => canReuseAtSamePosition(previous[index].block, block))
  ) {
    return blocks.map((block, index) => ({key: previous[index].key, block}));
  }

  const unmatched = new Map<number, IndexedEntry>();
  previous.forEach((entry, index) => unmatched.set(index, {entry, index}));

  const result = new Array<StablePageBlockEntry>(blocks.length);
  const exactBySignature = groupPrevious(previous, pageBlockFingerprint);

  blocks.forEach((block, index) => {
    const match = exactBySignature.get(pageBlockFingerprint(block))?.takeClosest(index, unmatched);
    if(match) {
      result[index] = {key: match.entry.key, block};
    }
  });

  const identityBySignature = groupUnmatched(unmatched, ({entry}) => pageBlockIdentity(entry.block));
  blocks.forEach((block, index) => {
    if(result[index]) {
      return;
    }

    const identity = pageBlockIdentity(block);
    if(!identity) {
      return;
    }

    const match = identityBySignature.get(identity)?.takeClosest(index, unmatched);
    if(match) {
      result[index] = {key: match.entry.key, block};
    }
  });

  const fallbackByKind = groupUnmatched(unmatched, ({entry}) => entry.block._);

  blocks.forEach((block, index) => {
    if(result[index] || requiresProtocolIdentity(block)) {
      return;
    }

    const match = fallbackByKind.get(block._)?.takeClosest(index, unmatched);
    if(match) {
      result[index] = {key: match.entry.key, block};
    }
  });

  return Array.from(
    {length: blocks.length},
    (_, index) => result[index] || {key: createKey(), block: blocks[index]}
  );
}

function canReuseAtSamePosition(previous: PageBlock, next: PageBlock) {
  if(previous._ !== next._) return false;
  if(!requiresProtocolIdentity(next)) return true;
  return pageBlockIdentity(previous) === pageBlockIdentity(next);
}

function groupPrevious(
  entries: readonly StablePageBlockEntry[],
  getSignature: (block: PageBlock) => string
) {
  const groups = new Map<string, IndexedEntry[]>();
  entries.forEach((entry, index) => {
    const signature = getSignature(entry.block);
    const group = groups.get(signature) || [];
    group.push({entry, index});
    groups.set(signature, group);
  });
  return makePools(groups);
}

function groupUnmatched(
  unmatched: Map<number, IndexedEntry>,
  getSignature: (entry: IndexedEntry) => string | undefined
) {
  const groups = new Map<string, IndexedEntry[]>();
  unmatched.forEach((entry) => {
    const signature = getSignature(entry);
    if(!signature) {
      return;
    }

    const group = groups.get(signature) || [];
    group.push(entry);
    groups.set(signature, group);
  });
  return makePools(groups);
}

function makePools(groups: Map<string, IndexedEntry[]>) {
  const result = new Map<string, IndexedEntryPool>();
  groups.forEach((entries, signature) => {
    result.set(signature, new IndexedEntryPool(entries));
  });
  return result;
}

function lowerBound(entries: IndexedEntry[], targetIndex: number) {
  let low = 0;
  let high = entries.length;
  while(low < high) {
    const middle = (low + high) >> 1;
    if(entries[middle].index < targetIndex) low = middle + 1;
    else high = middle;
  }
  return low;
}

function requiresProtocolIdentity(block: PageBlock) {
  switch(block._) {
    case 'pageBlockAnchor':
    case 'pageBlockPhoto':
    case 'pageBlockVideo':
    case 'pageBlockAudio':
    case 'pageBlockChannel':
    case 'pageBlockEmbed':
    case 'pageBlockEmbedPost':
    case 'pageBlockMap':
    case 'inputPageBlockMap':
      return true;
    default:
      return false;
  }
}

function pageBlockIdentity(block: PageBlock): string | undefined {
  switch(block._) {
    case 'pageBlockAnchor':
      return `${block._}:${block.name}`;
    case 'pageBlockPhoto':
      return `${block._}:${block.photo_id}`;
    case 'pageBlockVideo':
      return `${block._}:${block.video_id}`;
    case 'pageBlockAudio':
      return `${block._}:${block.audio_id}`;
    case 'pageBlockChannel':
      return `${block._}:${block.channel.id}`;
    case 'pageBlockEmbed':
      return `${block._}:${block.url || ''}:${valueFingerprint(block.html || '')}:${block.poster_photo_id || ''}`;
    case 'pageBlockEmbedPost':
      return `${block._}:${block.webpage_id}:${block.url}`;
    case 'pageBlockMap':
    case 'inputPageBlockMap':
      return `${block._}:${valueFingerprint(block.geo)}:${block.zoom}:${block.w}:${block.h}`;
    default:
      return undefined;
  }
}

function pageBlockFingerprint(block: PageBlock) {
  // Nested PageBlock collections reconcile independently. Excluding them here avoids repeatedly
  // hashing an entire subtree at every ancestor on every streaming revision. Stateful channel data
  // contributes only its protocol id below, rather than its full mutable chat snapshot.
  const shallow: Record<string, unknown> = {};
  Object.keys(block).forEach((key) => {
    if(!NESTED_PAGE_BLOCK_KEYS.has(key)) {
      shallow[key] = (block as unknown as Record<string, unknown>)[key];
    }
  });
  // `channel` is deliberately excluded from the shallow value above, but its id (and every other
  // protocol-backed identity) must still participate in the exact pass. Otherwise two channels
  // with identical shallow fingerprints keep the keys at their old positions when reordered,
  // before the identity pass gets a chance to match them correctly.
  return valueFingerprint([pageBlockIdentity(block), shallow]);
}

function valueFingerprint(value: unknown, seen = new WeakSet<object>()): string {
  if(value === null || value === undefined) {
    return String(value);
  }

  const type = typeof(value);
  if(type === 'string') {
    return JSON.stringify(value);
  }
  if(type === 'number' || type === 'boolean' || type === 'bigint') {
    return `${type}:${String(value)}`;
  }
  if(type !== 'object') {
    return type;
  }

  const object = value as object;
  if(seen.has(object)) {
    return '[cycle]';
  }
  seen.add(object);

  if(Array.isArray(value)) {
    const result = `[${value.map((item) => valueFingerprint(item, seen)).join(',')}]`;
    seen.delete(object);
    return result;
  }

  const record = value as Record<string, unknown>;
  const result = `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${valueFingerprint(record[key], seen)}`
  )).join(',')}}`;
  seen.delete(object);
  return result;
}
