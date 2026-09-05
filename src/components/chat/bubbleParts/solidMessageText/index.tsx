import {getMiddleware, Middleware, MiddlewareHelper} from '@helpers/middleware';
import deepEqual from '@helpers/object/deepEqual';
import {MessageEntity, TextWithEntities} from '@layer';
import {
  getCommonGraphemePrefixLength,
  getGraphemeOffsets,
  snapGraphemeOffsetDown,
  updateGraphemeOffsets,
  updateGraphemes
} from '@lib/richTextProcessor/graphemes';
import {
  isAtomicTextEntity,
  sliceTextWithEntitiesAtGraphemeBoundaries
} from '@lib/richTextProcessor/sliceTextWithEntities';
import wrapRichText, {WrapRichTextOptions} from '@lib/richTextProcessor/wrapRichText';
import {Accessor, batch, createEffect, createMemo, createSignal, JSX, onCleanup, onMount, Show, untrack} from 'solid-js';
import {Dynamic, render} from 'solid-js/web';
import {MessageTextPhase, TextRevealModel, TextRevealState} from './textRevealModel';
import createMessageTextRevealLeafBinding from './revealLeafBinding';
import styles from './solidMessageText.module.scss';

export {
  getCommonGraphemePrefixLength,
  getGraphemeOffsets,
  splitGraphemes,
  splitGraphemesFallback
} from '@lib/richTextProcessor/graphemes';
export {TextRevealModel} from './textRevealModel';
export {createMessageTextRevealLeafBinding};
export type {MessageTextRevealLeafBinding} from './revealLeafBinding';
export type {MessageTextPhase, TextRevealSnapshot, TextRevealState} from './textRevealModel';

export type MessageTextDisplaySnapshot = {
  sourceRevision: number,
  value: TextWithEntities
};

export type MessageTextBodySnapshot = {
  sourceRevision: number,
  source: TextWithEntities,
  phase: MessageTextPhase,
  /**
   * Already-selected display data (for example a translation). It is accepted
   * only for the matching finalized source revision. This component never
   * calls translation managers.
   */
  display?: MessageTextDisplaySnapshot
};

export type MessageTextLayoutEvent = {
  element: HTMLElement,
  sourceRevision: number,
  phase: MessageTextPhase,
  reason: 'render' | 'resources-ready' | 'decoration',
  renderMode: 'replace' | 'append' | 'none'
};

export type MessageTextRevealEvent = TextRevealState & {
  element?: HTMLElement
};

export type TextRevealFrameScheduler = {
  request: (callback: FrameRequestCallback) => number,
  cancel: (id: number) => void
};

export type SolidInlineTextProps = {
  value: Accessor<TextWithEntities>,
  sourceRevision: Accessor<number>,
  phase?: Accessor<MessageTextPhase>,
  /** Undefined means that the complete value is visible. */
  visibleGraphemes?: Accessor<number | undefined>,
  /** Optional body-level reveal budget shared by all rich-text leaves. */
  revealCoordinator?: MessageTextRevealCoordinator,
  richTextOptions?: Accessor<WrapRichTextOptions | undefined>,
  inline?: boolean,
  class?: string,
  /** Synchronous leaf-specific hydration before the fragment is committed. */
  processFragment?: (fragment: DocumentFragment, middleware: Middleware) => Promise<unknown> | void,
  /** Chunk-safe processors keep already-committed prefix nodes untouched. */
  processFragmentMode?: 'full' | 'chunk',
  onLayout?: (event: MessageTextLayoutEvent) => void,
  onElement?: (element: HTMLElement) => void
};

export type SolidMessageTextBodyProps = {
  snapshot: Accessor<MessageTextBodySnapshot>,
  richTextOptions?: Accessor<WrapRichTextOptions | undefined>,
  reducedMotion?: Accessor<boolean>,
  graphemesPerSecond?: number,
  finalizingGraphemesPerSecond?: number,
  /** Bounds imperative leaf updates while wrapRichText is being migrated. */
  maxRevealFramesPerSecond?: number,
  frameScheduler?: TextRevealFrameScheduler,
  inline?: boolean,
  class?: string,
  onLayout?: (event: MessageTextLayoutEvent) => void,
  onReveal?: (event: MessageTextRevealEvent) => void,
  onFinalized?: (event: MessageTextRevealEvent) => void,
  onElement?: (element: HTMLElement) => void
};

export type CreateSolidMessageTextOptions = Omit<SolidMessageTextBodyProps, 'snapshot' | 'richTextOptions'> & {
  richTextOptions?: WrapRichTextOptions,
  /** Optional owner middleware. Destroying it disposes the Solid root. */
  middleware?: Middleware
};

export type SolidMessageTextController = {
  element: HTMLElement,
  update: (snapshot: MessageTextBodySnapshot) => boolean,
  finalize: (source?: TextWithEntities, sourceRevision?: number) => void,
  setDisplay: (display?: MessageTextDisplaySnapshot) => void,
  setPolicy: (richTextOptions?: WrapRichTextOptions) => void,
  dispose: () => void
};

export type MessageTextRevealLeaf = {
  visibleGraphemes: Accessor<number | undefined>,
  appliedGeneration: Accessor<number>,
  update: (value: TextWithEntities, element?: HTMLElement) => number,
  setElement: (element?: HTMLElement) => void,
  dispose: () => void
};

export type MessageTextRevealCoordinator = {
  registerLeaf: () => MessageTextRevealLeaf,
  state: Accessor<TextRevealState>,
  phase: Accessor<MessageTextPhase>,
  showTail: Accessor<boolean>
};

export type CreateMessageTextRevealCoordinatorOptions = {
  sourceRevision: Accessor<number>,
  phase: Accessor<MessageTextPhase>,
  active?: Accessor<boolean>,
  reducedMotion?: Accessor<boolean>,
  graphemesPerSecond?: number,
  finalizingGraphemesPerSecond?: number,
  maxRevealFramesPerSecond?: number,
  frameScheduler?: TextRevealFrameScheduler,
  onReveal?: (event: MessageTextRevealEvent) => void,
  onFinalized?: (event: MessageTextRevealEvent) => void
};

/**
 * Default reveal speed for the backlog accepted at a source update. Keeping
 * this value stable between updates makes the target duration linear instead
 * of slowing down as the remaining backlog shrinks.
 */
export function getAdaptiveMessageTextRevealSpeed(phase: MessageTextPhase, backlog: number) {
  const finalizing = phase === 'finalizing';
  const targetSeconds = finalizing ? 1.5 : 5;
  const minimum = finalizing ? 160 : 60;
  const maximum = finalizing ? 800 : 240;
  return Math.max(minimum, Math.min(maximum, Math.ceil(Math.max(0, backlog) / targetSeconds)));
}

export function sliceTextWithEntitiesAtGrapheme(
  value: TextWithEntities,
  visibleGraphemes?: number,
  graphemeOffsets?: readonly number[]
): TextWithEntities {
  if(visibleGraphemes === undefined) return value;

  const offsets = graphemeOffsets ?? getGraphemeOffsets(value.text);
  const index = Math.max(0, Math.min(Math.floor(visibleGraphemes), offsets.length - 1));
  const end = offsets[index];
  if(end === value.text.length) return value;

  const sliced = sliceTextWithEntitiesAtGraphemeBoundaries(value.text, value.entities || [], 0, end);

  return {
    _: 'textWithEntities',
    text: sliced.text,
    entities: sliced.entities
  };
}

const makeDefaultFrameScheduler = (): TextRevealFrameScheduler => ({
  request: (callback) => {
    if(typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
    return self.setTimeout(() => callback(performance.now()), 16);
  },
  cancel: (id) => {
    if(typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else self.clearTimeout(id);
  }
});

/**
 * One reveal timeline for a rich message whose text is split across multiple
 * stable Instant View leaves. Leaves keep their own Solid owners, while this
 * coordinator sorts them by current DOM order and distributes one grapheme
 * cursor over the complete body.
 */
export function createMessageTextRevealCoordinator(
  options: CreateMessageTextRevealCoordinatorOptions
): MessageTextRevealCoordinator {
  type Leaf = {
    sequence: number,
    value: TextWithEntities,
    graphemes: string[],
    graphemeLength: number,
    changedFrom: number,
    element?: HTMLElement,
    setVisibleGraphemes: (value?: number) => void,
    visibleGraphemes: Accessor<number | undefined>,
    updateGeneration: number,
    setAppliedGeneration: (generation: number) => void,
    appliedGeneration: Accessor<number>
  };

  const scheduler = options.frameScheduler ?? makeDefaultFrameScheduler();
  const model = new TextRevealModel();
  const leaves = new Set<Leaf>();
  const [state, setState] = createSignal(model.getState());
  const [phase, setPhase] = createSignal(untrack(options.phase));
  const [showTail, setShowTail] = createSignal(false);
  let nextSequence = 0;
  let flushPending = false;
  let disposed = false;
  let frameId: number;
  let previousFrameTime: number;
  let lastRevealTime: number;
  let carry = 0;
  let adaptiveRevealSpeed = getAdaptiveMessageTextRevealSpeed('streaming', 0);
  let finalizedRevision = -1;
  let previousOrderedLeaves: Leaf[] = [];
  let previousTotalGraphemes = 0;

  const cancelFrame = () => {
    if(frameId !== undefined) scheduler.cancel(frameId);
    frameId = undefined;
    previousFrameTime = undefined;
    lastRevealTime = undefined;
    carry = 0;
  };

  const getOrderedLeaves = () => Array.from(leaves)
  .sort((left, right) => {
    if(left.element && right.element && left.element !== right.element) {
      const position = left.element.compareDocumentPosition(right.element);
      if(position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if(position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    }
    return left.sequence - right.sequence;
  });

  const publishState = (
    nextState: TextRevealState,
    orderedLeaves = getOrderedLeaves(),
    active = options.active ? !!options.active() : true
  ) => {
    const element = orderedLeaves[orderedLeaves.length - 1]?.element;
    const previousState = state();
    const changed = previousState.sourceRevision !== nextState.sourceRevision ||
      previousState.phase !== nextState.phase ||
      previousState.visibleGraphemes !== nextState.visibleGraphemes ||
      previousState.totalGraphemes !== nextState.totalGraphemes ||
      previousState.caughtUp !== nextState.caughtUp;
    let remaining = nextState.visibleGraphemes;
    batch(() => {
      if(changed) setState(nextState);
      setPhase(nextState.phase);
      for(const leaf of orderedLeaves) {
        const length = leaf.graphemeLength;
        const visible = Math.max(0, Math.min(length, remaining));
        leaf.setVisibleGraphemes(visible);
        remaining -= visible;
      }
      orderedLeaves.forEach((leaf) => leaf.setAppliedGeneration(leaf.updateGeneration));
      setShowTail(active && nextState.phase === 'streaming' && nextState.caughtUp);
    });
    if(changed) options.onReveal?.({...nextState, element});

    if(
      nextState.phase === 'finalizing' &&
      nextState.caughtUp &&
      nextState.sourceRevision !== finalizedRevision
    ) {
      finalizedRevision = nextState.sourceRevision;
      const finalState = model.updateCounts({
        sourceRevision: nextState.sourceRevision,
        totalGraphemes: previousTotalGraphemes,
        commonPrefixGraphemes: previousTotalGraphemes,
        phase: 'final'
      });
      publishState(finalState, orderedLeaves, active);
      options.onFinalized?.({...finalState, element});
    }
  };

  const scheduleFrame = () => {
    if(frameId !== undefined || model.getState().caughtUp || disposed) return;
    frameId = scheduler.request(onFrame);
  };

  const onFrame: FrameRequestCallback = (time) => {
    frameId = undefined;
    const current = model.getState();
    if(current.caughtUp || disposed) return;

    if(previousFrameTime === undefined) previousFrameTime = time;
    const elapsed = Math.max(0, time - previousFrameTime);
    previousFrameTime = time;
    const speed = current.phase === 'finalizing' ?
      (options.finalizingGraphemesPerSecond ?? adaptiveRevealSpeed) :
      (options.graphemesPerSecond ?? adaptiveRevealSpeed);
    carry += elapsed * Math.max(1, speed) / 1000;
    const minInterval = 1000 / Math.max(1, options.maxRevealFramesPerSecond ?? 20);
    const canPublish = lastRevealTime === undefined || time - lastRevealTime >= minInterval;
    const amount = canPublish ? Math.floor(carry) : 0;
    if(amount) {
      carry -= amount;
      lastRevealTime = time;
      publishState(model.advance(amount));
    }
    scheduleFrame();
  };

  const flush = () => {
    flushPending = false;
    if(disposed) return;

    const sourceRevision = options.sourceRevision();
    const active = options.active ? !!options.active() : true;
    const orderedLeaves = getOrderedLeaves();
    if(!active && !orderedLeaves.length) {
      cancelFrame();
      batch(() => {
        setPhase(options.phase());
        setShowTail(false);
      });
      return;
    }
    let commonPrefixGraphemes = 0;
    const sharedLength = Math.min(previousOrderedLeaves.length, orderedLeaves.length);
    for(let index = 0; index < sharedLength; ++index) {
      const leaf = orderedLeaves[index];
      if(leaf !== previousOrderedLeaves[index]) break;
      if(leaf.changedFrom !== Infinity) {
        commonPrefixGraphemes += leaf.changedFrom;
        break;
      }
      commonPrefixGraphemes += leaf.graphemeLength;
    }
    const totalGraphemes = orderedLeaves.reduce((total, leaf) => total + leaf.graphemeLength, 0);
    if(commonPrefixGraphemes < previousTotalGraphemes) cancelFrame();
    const nextState = model.updateCounts({
      sourceRevision,
      totalGraphemes,
      commonPrefixGraphemes,
      phase: options.phase(),
      reducedMotion: !active || options.reducedMotion?.()
    });
    if(nextState.sourceRevision !== sourceRevision) return;
    previousOrderedLeaves = orderedLeaves;
    previousTotalGraphemes = totalGraphemes;
    orderedLeaves.forEach((leaf) => leaf.changedFrom = Infinity);
    adaptiveRevealSpeed = getAdaptiveMessageTextRevealSpeed(
      nextState.phase,
      nextState.totalGraphemes - nextState.visibleGraphemes
    );

    publishState(nextState, orderedLeaves, active);
    if(nextState.caughtUp || !active) cancelFrame();
    else scheduleFrame();
  };

  const scheduleFlush = () => {
    if(flushPending || disposed) return;
    flushPending = true;
    queueMicrotask(flush);
  };

  createEffect(() => {
    options.sourceRevision();
    options.phase();
    options.active?.();
    options.reducedMotion?.();
    scheduleFlush();
  });

  onCleanup(() => {
    disposed = true;
    cancelFrame();
    leaves.clear();
  });

  return {
    registerLeaf: () => {
      const [visibleGraphemes, setVisibleGraphemes] = createSignal<number | undefined>(0);
      const [appliedGeneration, setAppliedGeneration] = createSignal(0);
      const leaf: Leaf = {
        sequence: ++nextSequence,
        value: {_: 'textWithEntities', text: '', entities: []},
        graphemes: [],
        graphemeLength: 0,
        changedFrom: 0,
        setVisibleGraphemes,
        visibleGraphemes,
        updateGeneration: 0,
        setAppliedGeneration,
        appliedGeneration
      };
      leaves.add(leaf);
      scheduleFlush();

      let leafDisposed = false;
      const setElement = (element?: HTMLElement) => {
        if(leafDisposed || disposed || leaf.element === element) return;
        leaf.element = element;
        scheduleFlush();
      };
      return {
        visibleGraphemes,
        appliedGeneration,
        update: (value, element) => {
          if(leafDisposed || disposed) return leaf.updateGeneration;
          if(element !== undefined) setElement(element);
          const generation = ++leaf.updateGeneration;
          if(value.text !== leaf.value.text) {
            const append = value.text.startsWith(leaf.value.text);
            const previousGraphemes = leaf.graphemes;
            const details = {changedFrom: 0};
            const graphemes = updateGraphemes(leaf.value.text, previousGraphemes, value.text, append, details);
            leaf.changedFrom = Math.min(leaf.changedFrom, details.changedFrom);
            leaf.graphemes = graphemes;
          }
          leaf.value = value;
          leaf.graphemeLength = leaf.graphemes.length;
          scheduleFlush();
          return generation;
        },
        setElement,
        dispose: () => {
          if(leafDisposed) return;
          leafDisposed = true;
          leaves.delete(leaf);
          scheduleFlush();
        }
      };
    },
    state,
    phase,
    showTail
  };
}

function createRevisionMiddleware(options?: WrapRichTextOptions) {
  const parent = options?.middleware;
  if(parent?.()) return parent.create();
  return getMiddleware();
}

function getFreshRichTextOptions(
  options: WrapRichTextOptions | undefined,
  value: TextWithEntities,
  middleware: Middleware,
  loadPromises: Promise<unknown>[]
): WrapRichTextOptions {
  return {
    ...(options || {}),
    entities: value.entities,
    middleware,
    loadPromises,
    // wrapRichText mutates these bookkeeping collections. Never carry DOM
    // nodes from an older source revision into the current one.
    customEmojis: new Map(),
    customWraps: new Set(),
    nasty: undefined,
    ignoreNextIndex: undefined
  };
}

function areEntityAttributesEqual(left: MessageEntity, right: MessageEntity, ignoreLength = false) {
  return deepEqual(left, right, ignoreLength ? ['length'] : undefined);
}

const isSplittableTextEntity = (entity: MessageEntity) => !isAtomicTextEntity(entity) &&
  entity._ !== 'messageEntityBlockquote' &&
  entity._ !== 'messageEntitySpoiler';

function getCommonTextPrefixLength(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while(index < length && left.charCodeAt(index) === right.charCodeAt(index)) ++index;
  return index;
}

/** Earliest grapheme boundary whose text or entity semantics changed. */
function getIncrementalRenderStart(
  previous: TextWithEntities,
  current: TextWithEntities,
  previousOffsets: readonly number[],
  currentOffsets: readonly number[],
  knownAppend = false
): number {
  let dirtyStart: number;
  if(knownAppend || current.text.startsWith(previous.text)) {
    dirtyStart = previous.text.length;
  } else {
    const commonPrefix = getCommonTextPrefixLength(previous.text, current.text);
    dirtyStart = Math.min(
      snapGraphemeOffsetDown(previousOffsets, commonPrefix),
      snapGraphemeOffsetDown(currentOffsets, commonPrefix)
    );
  }

  const previousEntities = previous.entities || [];
  const currentEntities = current.entities || [];
  const entityLength = Math.max(previousEntities.length, currentEntities.length);

  for(let index = 0; index < entityLength; ++index) {
    const previousEntity = previousEntities[index];
    const currentEntity = currentEntities[index];
    if(previousEntity && currentEntity && areEntityAttributesEqual(previousEntity, currentEntity, true)) {
      if(previousEntity.length !== currentEntity.length) {
        const safelyExtendedFormatting = isSplittableTextEntity(currentEntity) &&
          currentEntity.length >= previousEntity.length &&
          (previousEntity.offset || 0) + (previousEntity.length || 0) === previous.text.length;
        if(!safelyExtendedFormatting) {
          dirtyStart = Math.min(dirtyStart, previousEntity.offset || 0, currentEntity.offset || 0);
        }
      }
    } else {
      if(previousEntity) dirtyStart = Math.min(dirtyStart, previousEntity.offset || 0);
      if(currentEntity) dirtyStart = Math.min(dirtyStart, currentEntity.offset || 0);
    }
  }

  for(const entity of [...previousEntities, ...currentEntities]) {
    const start = entity.offset || 0;
    const end = start + (entity.length || 0);
    if(!isSplittableTextEntity(entity) && start < dirtyStart && end > dirtyStart) {
      dirtyStart = start;
    }
  }

  return dirtyStart;
}

function preserveVisiblePreEntity(source: TextWithEntities, visible: TextWithEntities): TextWithEntities {
  let entities = visible.entities || [];
  let changed = false;
  for(const sourceEntity of source.entities || []) {
    if(
      sourceEntity._ !== 'messageEntityPre' ||
      (sourceEntity.offset || 0) >= visible.text.length ||
      (sourceEntity.offset || 0) + (sourceEntity.length || 0) <= visible.text.length ||
      entities.some((entity) => areEntityAttributesEqual(entity, sourceEntity, true))
    ) {
      continue;
    }

    const clipped = {
      ...sourceEntity,
      length: visible.text.length - (sourceEntity.offset || 0)
    };
    const index = entities.findIndex((entity) => (entity.offset || 0) >= (sourceEntity.offset || 0));
    entities = entities.slice();
    entities.splice(index === -1 ? entities.length : index, 0, clipped);
    changed = true;
  }

  return changed ? {...visible, entities} : visible;
}

type RenderedTextChunk = {
  from: number,
  to: number,
  nodes: ChildNode[],
  middlewares: MiddlewareHelper[]
};

const STATIC_TEXT_WRAPPERS = new Set(['STRONG', 'EM', 'DEL', 'U', 'CODE', 'I', 'SUB', 'SUP']);

function getStaticTextLeaf(node: ChildNode): Text | undefined {
  let current = node;
  while(current.nodeType === Node.ELEMENT_NODE) {
    const element = current as HTMLElement;
    if(!STATIC_TEXT_WRAPPERS.has(element.tagName) || element.childNodes.length !== 1) return;
    current = element.firstChild;
  }
  return current.nodeType === Node.TEXT_NODE ? current as Text : undefined;
}

function haveSameStaticTextShell(left: ChildNode, right: ChildNode): boolean {
  if(left.nodeType === Node.TEXT_NODE || right.nodeType === Node.TEXT_NODE) {
    return left.nodeType === right.nodeType;
  }
  if(left.nodeType !== Node.ELEMENT_NODE || right.nodeType !== Node.ELEMENT_NODE) return false;

  const leftElement = left as HTMLElement;
  const rightElement = right as HTMLElement;
  if(
    leftElement.tagName !== rightElement.tagName ||
    !STATIC_TEXT_WRAPPERS.has(leftElement.tagName) ||
    leftElement.attributes.length !== rightElement.attributes.length ||
    leftElement.childNodes.length !== 1 ||
    rightElement.childNodes.length !== 1
  ) {
    return false;
  }

  for(const attribute of leftElement.attributes) {
    if(rightElement.getAttribute(attribute.name) !== attribute.value) return false;
  }
  return haveSameStaticTextShell(leftElement.firstChild, rightElement.firstChild);
}

/**
 * Stable Solid owner for one inline-rich-text leaf. The legacy wrapRichText
 * call is intentionally contained here: revisions replace only this leaf's
 * children, never the bubble or this Solid owner. Async resources mutate the
 * committed leaf in place and are generation-gated; they never add a deferred
 * to the bubble render batch.
 */
export function SolidInlineText(props: SolidInlineTextProps): JSX.Element {
  let element: HTMLElement;
  let latestSourceRevision = -1;
  let latestPhase: MessageTextPhase = 'final';
  let previousPhase: MessageTextPhase;
  let previousValue: TextWithEntities;
  let previousOptions: WrapRichTextOptions;
  let previousProcessFragment: SolidInlineTextProps['processFragment'];
  let previousProcessFragmentMode: SolidInlineTextProps['processFragmentMode'];
  let graphemeOffsetsText: string;
  let graphemeOffsets: number[] = [0];
  let previousSourceOffsets: number[] = [0];
  let renderedChunks: RenderedTextChunk[] = [];
  const revealBinding = createMessageTextRevealLeafBinding({
    coordinator: props.revealCoordinator,
    value: props.value,
    element: () => element
  });
  const revealLeaf = revealBinding?.leaf;
  const coordinatedPhase = revealLeaf ? props.revealCoordinator.phase : undefined;
  const [renderedSourceRevision, setRenderedSourceRevision] = createSignal(untrack(props.sourceRevision));

  const destroyChunk = (chunk: RenderedTextChunk, removeNodes: boolean) => {
    chunk.middlewares.forEach((middleware) => middleware.destroy());
    if(removeNodes) {
      chunk.nodes.forEach((node) => {
        if(node.parentNode) node.remove();
      });
    }
  };

  const destroyChunks = (removeNodes: boolean) => {
    renderedChunks.forEach((chunk) => destroyChunk(chunk, removeNodes));
    renderedChunks = [];
  };

  const compactChunkRecords = (final = false) => {
    const maximum = final ? 1 : 24;
    if(renderedChunks.length <= maximum) return;

    const keepTail = final ? 0 : 12;
    const mergeCount = renderedChunks.length - keepTail;
    const mergedChunks = renderedChunks.splice(0, mergeCount);
    const merged: RenderedTextChunk = {
      from: mergedChunks[0].from,
      to: mergedChunks[mergedChunks.length - 1].to,
      nodes: mergedChunks.flatMap((chunk) => chunk.nodes),
      middlewares: mergedChunks.flatMap((chunk) => chunk.middlewares)
    };
    renderedChunks.unshift(merged);
  };

  const tryTruncateChunk = (chunk: RenderedTextChunk, to: number, sourceText: string) => {
    if(chunk.middlewares.length || to <= chunk.from || to >= chunk.to) return false;

    let offset = chunk.from;
    for(let index = 0; index < chunk.nodes.length; ++index) {
      const node = chunk.nodes[index];
      const nodeText = node.textContent || '';
      if(sourceText.slice(offset, offset + nodeText.length) !== nodeText) return false;
      const nodeEnd = offset + nodeText.length;
      if(to <= nodeEnd) {
        const keepNodes = index + 1;
        if(to < nodeEnd) {
          const text = getStaticTextLeaf(node);
          if(!text) return false;
          text.deleteData(to - offset, text.length);
        }
        chunk.nodes.splice(keepNodes).forEach((tail) => tail.remove());
        chunk.to = to;
        return true;
      }
      offset = nodeEnd;
    }
    return false;
  };

  const truncateContainerText = (container: HTMLElement, keepLength: number) => {
    let offset = 0;
    const nodes = Array.from(container.childNodes);
    for(let index = 0; index < nodes.length; ++index) {
      const node = nodes[index];
      const nodeEnd = offset + (node.textContent?.length || 0);
      if(keepLength <= nodeEnd) {
        if(keepLength < nodeEnd) {
          const text = getStaticTextLeaf(node);
          if(!text) return false;
          text.deleteData(keepLength - offset, text.length);
        }
        nodes.slice(index + 1).forEach((tail) => tail.remove());
        return true;
      }
      offset = nodeEnd;
    }
    return keepLength === offset;
  };

  const tryMergeStaticAppend = (chunk: RenderedTextChunk) => {
    const previousChunk = renderedChunks[renderedChunks.length - 1];
    if(
      !previousChunk ||
      previousChunk.middlewares.length ||
      chunk.middlewares.length ||
      previousChunk.to !== chunk.from ||
      previousChunk.nodes.length !== 1 ||
      chunk.nodes.length !== 1 ||
      !haveSameStaticTextShell(previousChunk.nodes[0], chunk.nodes[0])
    ) {
      return false;
    }

    const previousText = getStaticTextLeaf(previousChunk.nodes[0]);
    const nextText = getStaticTextLeaf(chunk.nodes[0]);
    if(!previousText || !nextText) return false;
    previousText.appendData(nextText.data);
    previousChunk.to = chunk.to;
    return true;
  };

  const tryExtendStableStructuralEntity = (
    previous: TextWithEntities,
    current: TextWithEntities,
    knownAppend: boolean,
    prepareNestedSuffix: (
      value: TextWithEntities,
      from: number,
      to: number,
      outerIndex: number
    ) => {chunk: RenderedTextChunk, fragment: DocumentFragment}
  ): number | undefined => {
    if(!knownAppend) return;
    const previousEntities = previous.entities || [];
    const currentEntities = current.entities || [];
    for(let index = 0; index < previousEntities.length; ++index) {
      const previousEntity = previousEntities[index];
      const currentEntity = currentEntities[index];
      const previousEnd = (previousEntity?.offset || 0) + (previousEntity?.length || 0);
      const currentEnd = (currentEntity?.offset || 0) + (currentEntity?.length || 0);
      const crossesCompletedBlockquote = currentEntity?._ === 'messageEntityBlockquote' &&
        currentEntity.length === previousEntity?.length &&
        previousEnd === previous.text.length &&
        currentEnd < current.text.length;
      if(
        !currentEntity ||
        currentEntity._ !== 'messageEntityPre' &&
        currentEntity._ !== 'messageEntitySpoiler' &&
        currentEntity._ !== 'messageEntityBlockquote' ||
        currentEntity._ !== previousEntity._ ||
        !areEntityAttributesEqual(previousEntity, currentEntity, true) ||
        currentEntity.length <= previousEntity.length && !crossesCompletedBlockquote ||
        previousEnd !== previous.text.length ||
        currentEnd > current.text.length
      ) {
        continue;
      }

      const selector = currentEntity._ === 'messageEntityPre' ?
        'pre' :
        currentEntity._ === 'messageEntitySpoiler' ? '.spoiler' : 'blockquote.quote-block';
      const ordinal = previousEntities.slice(0, index + 1).filter((entity) => entity._ === currentEntity._).length - 1;
      const wrapper = element.querySelectorAll<HTMLElement>(selector)[ordinal];
      const target = currentEntity._ === 'messageEntityPre' ?
        wrapper?.querySelector('code') :
        currentEntity._ === 'messageEntitySpoiler' ? wrapper?.querySelector('.spoiler-text') : wrapper;
      if(!wrapper || !target) return;

      let chunk: RenderedTextChunk;
      for(let chunkIndex = renderedChunks.length - 1; chunkIndex >= 0; --chunkIndex) {
        const candidate = renderedChunks[chunkIndex];
        if(
          candidate.to === previous.text.length &&
          candidate.nodes.some((node) => node === wrapper || node.contains(wrapper))
        ) {
          chunk = candidate;
          break;
        }
      }
      if(!chunk) return;

      if(currentEntity._ === 'messageEntityPre') {
        const suffix = current.text.slice(previousEnd, currentEnd);
        if(target.lastChild?.nodeType === Node.TEXT_NODE) (target.lastChild as Text).appendData(suffix);
        else target.append(suffix);
      } else {
        const previousNested = {
          ...previous,
          entities: previousEntities.filter((_entity, entityIndex) => entityIndex !== index)
        };
        const currentNested = {
          ...current,
          entities: currentEntities.filter((_entity, entityIndex) => entityIndex !== index)
        };
        const nestedDirtyStart = getIncrementalRenderStart(
          previousNested,
          currentNested,
          previousSourceOffsets,
          graphemeOffsets,
          knownAppend
        );
        const outerStart = currentEntity.offset || 0;
        const renderFrom = Math.max(outerStart, Math.min(previousEnd, nestedDirtyStart));
        if(!truncateContainerText(target as HTMLElement, renderFrom - outerStart)) return;
        const prepared = prepareNestedSuffix(current, renderFrom, currentEnd, index);
        target.append(prepared.fragment);
        chunk.middlewares.push(...prepared.chunk.middlewares);
      }
      if(
        currentEntity._ === 'messageEntityBlockquote' &&
        currentEnd < current.text.length &&
        wrapper.parentNode === element
      ) {
        const container = document.createElement('div');
        wrapper.replaceWith(container);
        container.append(wrapper);
        const wrapperIndex = chunk.nodes.indexOf(wrapper);
        if(wrapperIndex !== -1) chunk.nodes[wrapperIndex] = container;
      }
      chunk.to = currentEnd;
      return currentEnd;
    }
    return;
  };

  const prepareChunk = (
    value: TextWithEntities,
    from: number,
    to: number,
    options: WrapRichTextOptions | undefined
  ) => {
    const sliced = sliceTextWithEntitiesAtGraphemeBoundaries(
      value.text,
      value.entities || [],
      from,
      to
    );
    const revisionMiddleware = createRevisionMiddleware(options);
    const middleware = revisionMiddleware.get();
    const loadPromises: Promise<unknown>[] = [];
    const richTextOptions = getFreshRichTextOptions(options, {
      _: 'textWithEntities',
      text: sliced.text,
      entities: sliced.entities
    }, middleware, loadPromises);
    if(latestPhase !== 'final') richTextOptions.noCodeHighlight = true;
    const fragment = wrapRichText(
      sliced.text,
      richTextOptions
    );
    const processorWork = props.processFragment?.(fragment, middleware);
    if(processorWork) loadPromises.push(processorWork);

    const needsLiveMiddleware = !!loadPromises.length || sliced.entities.some((entity) =>
      entity._ === 'messageEntityBlockquote' ||
      entity._ === 'messageEntityFormattedDate' ||
      entity._ === 'messageEntityCustomEmoji' ||
      (entity._ === 'messageEntityPre' && latestPhase === 'final' && !richTextOptions.noCodeHighlight)
    );
    if(!needsLiveMiddleware) revisionMiddleware.destroy();

    const chunk: RenderedTextChunk = {
      from: sliced.from,
      to: sliced.to,
      nodes: Array.from(fragment.childNodes),
      middlewares: needsLiveMiddleware ? [revisionMiddleware] : []
    };

    if(loadPromises.length) {
      Promise.allSettled(loadPromises).then(() => {
        if(!middleware()) return;
        props.onLayout?.({
          element,
          sourceRevision: untrack(props.sourceRevision),
          phase: coordinatedPhase ? untrack(coordinatedPhase) :
            (props.phase ? untrack(props.phase) : latestPhase),
          reason: 'resources-ready',
          renderMode: 'replace'
        });
      });
    }

    return {chunk, fragment};
  };

  const finalizePreRanges = (value: TextWithEntities, options: WrapRichTextOptions | undefined) => {
    const preEntities = (value.entities || []).filter((entity) => entity._ === 'messageEntityPre');
    const currentPres = Array.from(element.querySelectorAll('pre'));
    let replaced = false;
    preEntities.forEach((entity, index) => {
      const currentPre = currentPres[index];
      if(!currentPre) return;
      const from = entity.offset || 0;
      const prepared = prepareChunk(value, from, from + (entity.length || 0), options);
      const nextPre = prepared.chunk.nodes.find((node) =>
        node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'PRE'
      );
      if(!nextPre) {
        destroyChunk(prepared.chunk, false);
        return;
      }

      let owner: RenderedTextChunk;
      let ownerNodeIndex = -1;
      for(const chunk of renderedChunks) {
        const nodeIndex = chunk.nodes.findIndex((node) => node === currentPre || node.contains(currentPre));
        if(nodeIndex !== -1) {
          owner = chunk;
          ownerNodeIndex = nodeIndex;
          break;
        }
      }
      if(!owner) {
        destroyChunk(prepared.chunk, false);
        return;
      }

      currentPre.replaceWith(prepared.fragment);
      if(owner.nodes[ownerNodeIndex] === currentPre) {
        owner.nodes.splice(ownerNodeIndex, 1, ...prepared.chunk.nodes);
      }
      owner.middlewares.push(...prepared.chunk.middlewares);
      replaced = true;
    });
    return replaced;
  };

  onCleanup(() => {
    destroyChunks(false);
  });

  createEffect(() => {
    const sourceRevision = revealLeaf ? untrack(props.sourceRevision) : props.sourceRevision();
    if(sourceRevision < latestSourceRevision) return;
    if(revealBinding && !revealBinding.ready()) return;
    latestSourceRevision = sourceRevision;
    setRenderedSourceRevision(sourceRevision);

    const phase = coordinatedPhase?.() ?? props.phase?.() ?? 'final';
    latestPhase = phase;
    const visibleGraphemes = props.visibleGraphemes?.() ?? revealLeaf?.visibleGraphemes();
    const sourceValue = props.value();
    const previousSourceText = graphemeOffsetsText || '';
    const sourceAppend = sourceValue.text === previousSourceText ||
      (sourceValue.text.length >= previousSourceText.length && sourceValue.text.startsWith(previousSourceText));
    if(sourceValue.text !== graphemeOffsetsText) {
      graphemeOffsets = updateGraphemeOffsets(previousSourceText, graphemeOffsets, sourceValue.text, sourceAppend);
      graphemeOffsetsText = sourceValue.text;
    }
    let value = sliceTextWithEntitiesAtGrapheme(sourceValue, visibleGraphemes, graphemeOffsets);
    value = preserveVisiblePreEntity(sourceValue, value);
    const options = props.richTextOptions?.();
    const processFragment = props.processFragment;
    const processFragmentMode = props.processFragmentMode;

    const sameRenderPipeline = options === previousOptions &&
      processFragment === previousProcessFragment &&
      processFragmentMode === previousProcessFragmentMode;
    const sameEntities = previousValue && areEntitiesEqual(previousValue.entities, value.entities);
    const completingPre = phase === 'final' && previousPhase !== 'final' &&
      value.entities?.some((entity) => entity._ === 'messageEntityPre');
    if(sameRenderPipeline && sameEntities && previousValue.text === value.text) {
      const renderMode = completingPre && finalizePreRanges(value, options) ? 'replace' : 'none';
      previousValue = value;
      previousOptions = options;
      previousProcessFragment = processFragment;
      previousProcessFragmentMode = processFragmentMode;
      previousSourceOffsets = graphemeOffsets;
      previousPhase = phase;
      if(phase === 'final') compactChunkRecords(true);
      if(renderMode !== 'none') {
        props.onLayout?.({element, sourceRevision, phase, reason: 'render', renderMode});
      }
      return;
    }

    const canIncrementallyProcess = !processFragment || processFragmentMode === 'chunk';
    let incrementalStart = sameRenderPipeline && previousValue && canIncrementallyProcess ?
      getIncrementalRenderStart(
        previousValue,
        value,
        previousSourceOffsets,
        graphemeOffsets,
        sourceAppend && value.text.length >= previousValue.text.length
      ) :
      undefined;
    let renderMode: MessageTextLayoutEvent['renderMode'] = 'replace';

    const stableStructuralEnd = phase !== 'final' && sameRenderPipeline && previousValue && canIncrementallyProcess ?
      tryExtendStableStructuralEntity(
        previousValue,
        value,
        sourceAppend && value.text.length >= previousValue.text.length,
        (current, from, to, outerIndex) => prepareChunk({
          ...current,
          entities: current.entities?.filter((_entity, index) => index !== outerIndex)
        }, from, to, options)
      ) :
      undefined;
    if(stableStructuralEnd !== undefined) incrementalStart = stableStructuralEnd;

    if(
      phase !== 'final' &&
      sameRenderPipeline &&
      previousValue &&
      canIncrementallyProcess &&
      stableStructuralEnd === value.text.length
    ) {
      renderMode = 'append';
      previousValue = value;
      previousOptions = options;
      previousProcessFragment = processFragment;
      previousProcessFragmentMode = processFragmentMode;
      previousSourceOffsets = graphemeOffsets;
      previousPhase = phase;
      props.onLayout?.({element, sourceRevision, phase, reason: 'render', renderMode});
      return;
    }

    if(
      incrementalStart === previousValue?.text.length &&
      sameEntities &&
      !value.entities?.length &&
      !processFragment &&
      element.lastChild?.nodeType === Node.TEXT_NODE
    ) {
      (element.lastChild as Text).appendData(value.text.slice(incrementalStart));
      const lastChunk = renderedChunks[renderedChunks.length - 1];
      if(lastChunk?.nodes.includes(element.lastChild)) lastChunk.to = value.text.length;
      previousValue = value;
      previousOptions = options;
      previousProcessFragment = processFragment;
      previousProcessFragmentMode = processFragmentMode;
      previousSourceOffsets = graphemeOffsets;
      previousPhase = phase;
      if(phase === 'final') compactChunkRecords(true);
      props.onLayout?.({element, sourceRevision, phase, reason: 'render', renderMode: 'append'});
      return;
    }

    if(incrementalStart === undefined) {
      const prepared = prepareChunk(value, 0, value.text.length, options);
      destroyChunks(false);
      element.replaceChildren(prepared.fragment);
      renderedChunks = prepared.chunk.nodes.length || prepared.chunk.middlewares.length ? [prepared.chunk] : [];
    } else {
      let renderStart = incrementalStart;
      let dirtyChunkIndex: number;
      if(incrementalStart === previousValue.text.length) {
        dirtyChunkIndex = renderedChunks.length;
        while(
          dirtyChunkIndex &&
          renderedChunks[dirtyChunkIndex - 1].from >= incrementalStart
        ) {
          --dirtyChunkIndex;
        }
        if(dirtyChunkIndex === renderedChunks.length) dirtyChunkIndex = -1;
      } else {
        dirtyChunkIndex = renderedChunks.findIndex((chunk) =>
          chunk.to > incrementalStart || chunk.from >= incrementalStart
        );
      }

      if(dirtyChunkIndex !== -1) {
        const dirtyChunk = renderedChunks[dirtyChunkIndex];
        if(tryTruncateChunk(dirtyChunk, incrementalStart, previousValue.text)) {
          ++dirtyChunkIndex;
        } else {
          renderStart = Math.min(renderStart, dirtyChunk.from);
        }
        renderedChunks.splice(dirtyChunkIndex).forEach((chunk) => destroyChunk(chunk, true));
      } else if(renderStart < previousValue.text.length) {
        const prepared = prepareChunk(value, 0, value.text.length, options);
        destroyChunks(false);
        element.replaceChildren(prepared.fragment);
        renderedChunks = prepared.chunk.nodes.length || prepared.chunk.middlewares.length ? [prepared.chunk] : [];
        previousValue = value;
        previousOptions = options;
        previousProcessFragment = processFragment;
        previousProcessFragmentMode = processFragmentMode;
        previousSourceOffsets = graphemeOffsets;
        previousPhase = phase;
        if(phase === 'final') compactChunkRecords(true);
        props.onLayout?.({element, sourceRevision, phase, reason: 'render', renderMode});
        return;
      }

      const prepared = prepareChunk(value, renderStart, value.text.length, options);
      if(!tryMergeStaticAppend(prepared.chunk)) {
        element.append(prepared.fragment);
        if(prepared.chunk.nodes.length || prepared.chunk.middlewares.length) renderedChunks.push(prepared.chunk);
      }
      renderMode = dirtyChunkIndex === -1 ? 'append' : 'replace';
    }

    previousValue = value;
    previousOptions = options;
    previousProcessFragment = processFragment;
    previousProcessFragmentMode = processFragmentMode;
    previousSourceOffsets = graphemeOffsets;
    previousPhase = phase;
    compactChunkRecords(phase === 'final');
    props.onLayout?.({element, sourceRevision, phase, reason: 'render', renderMode});
  });

  onMount(() => {
    props.onElement?.(element);
  });

  return (
    <Dynamic
      component={props.inline === false ? 'div' : 'span'}
      class={props.class}
      data-source-revision={renderedSourceRevision()}
      ref={element}
    />
  );
}

function areEntitiesEqual(left: MessageEntity[], right: MessageEntity[]) {
  if(left === right) return true;
  if((left?.length || 0) !== (right?.length || 0)) return false;
  return !left?.some((entity, index) => !areEntityAttributesEqual(entity, right[index]));
}

export function MessageTextStreamingTail() {
  return (
    <span class={styles.Dots} aria-hidden="true">
      {' '}
      <span class={`${styles.Dot} ${styles.Dot1}`}>.</span>
      <span class={`${styles.Dot} ${styles.Dot2}`}>.</span>
      <span class={`${styles.Dot} ${styles.Dot3}`}>.</span>
    </span>
  );
}

/** Stable message-text surface with a grapheme-safe streaming reveal model. */
export function SolidMessageTextBody(props: SolidMessageTextBodyProps): JSX.Element {
  const model = new TextRevealModel();
  const scheduler = props.frameScheduler ?? makeDefaultFrameScheduler();
  const [revealState, setRevealState] = createSignal(model.getState());
  let currentAcceptedSnapshot = props.snapshot();
  const [acceptedSnapshot, setAcceptedSnapshot] = createSignal(currentAcceptedSnapshot);
  let element: HTMLElement;
  let frameId: number;
  let previousFrameTime: number;
  let lastRevealTime: number;
  let carry = 0;
  let adaptiveRevealSpeed = getAdaptiveMessageTextRevealSpeed('streaming', 0);
  let finalizedRevision = -1;
  let lastRevealSource: string;

  const cancelFrame = () => {
    if(frameId !== undefined) scheduler.cancel(frameId);
    frameId = undefined;
    previousFrameTime = undefined;
    lastRevealTime = undefined;
    carry = 0;
  };

  const publishState = (state: TextRevealState) => {
    setRevealState(state);
    props.onReveal?.({...state, element});

    if(state.phase === 'finalizing' && state.caughtUp && state.sourceRevision !== finalizedRevision) {
      finalizedRevision = state.sourceRevision;
      const snapshot = currentAcceptedSnapshot;
      if(snapshot.sourceRevision !== state.sourceRevision) return;

      const finalSnapshot = {...snapshot, phase: 'final' as const};
      currentAcceptedSnapshot = finalSnapshot;
      setAcceptedSnapshot(finalSnapshot);
      const finalState = model.update({
        sourceRevision: state.sourceRevision,
        text: finalSnapshot.source.text,
        phase: 'final'
      });
      setRevealState(finalState);
      props.onReveal?.({...finalState, element});
      props.onFinalized?.({...finalState, element});
    }
  };

  const scheduleFrame = () => {
    if(frameId !== undefined || model.getState().caughtUp) return;
    frameId = scheduler.request(onFrame);
  };

  const onFrame: FrameRequestCallback = (time) => {
    frameId = undefined;
    const state = model.getState();
    if(state.caughtUp) return;

    if(previousFrameTime === undefined) previousFrameTime = time;
    const elapsed = Math.max(0, time - previousFrameTime);
    previousFrameTime = time;
    const speed = state.phase === 'finalizing' ?
      (props.finalizingGraphemesPerSecond ?? adaptiveRevealSpeed) :
      (props.graphemesPerSecond ?? adaptiveRevealSpeed);
    carry += elapsed * Math.max(1, speed) / 1000;
    const minInterval = 1000 / Math.max(1, props.maxRevealFramesPerSecond ?? 20);
    const canPublish = lastRevealTime === undefined || time - lastRevealTime >= minInterval;
    const amount = canPublish ? Math.floor(carry) : 0;
    if(amount) {
      carry -= amount;
      lastRevealTime = time;
      publishState(model.advance(amount));
    }
    scheduleFrame();
  };

  onCleanup(cancelFrame);

  createEffect(() => {
    const incoming = props.snapshot();
    if(incoming.sourceRevision < currentAcceptedSnapshot.sourceRevision) return;
    if(
      incoming.sourceRevision === finalizedRevision &&
      incoming.phase === 'final' &&
      currentAcceptedSnapshot.phase === 'final' &&
      incoming.source === currentAcceptedSnapshot.source &&
      incoming.display === currentAcceptedSnapshot.display
    ) {
      return;
    }
    const snapshot = incoming.phase === 'finalizing' && incoming.sourceRevision === finalizedRevision ?
      {...incoming, phase: 'final' as const} :
      incoming;
    if(lastRevealSource !== undefined && !snapshot.source.text.startsWith(lastRevealSource)) {
      cancelFrame();
    }
    lastRevealSource = snapshot.source.text;
    currentAcceptedSnapshot = snapshot;
    setAcceptedSnapshot(snapshot);

    const state = model.update({
      sourceRevision: snapshot.sourceRevision,
      text: snapshot.source.text,
      phase: snapshot.phase,
      reducedMotion: props.reducedMotion?.()
    });

    if(state.sourceRevision !== snapshot.sourceRevision) return;
    adaptiveRevealSpeed = getAdaptiveMessageTextRevealSpeed(
      state.phase,
      state.totalGraphemes - state.visibleGraphemes
    );
    publishState(state);
    if(state.caughtUp) cancelFrame();
    else scheduleFrame();
  });

  const displayValue = createMemo(() => {
    const snapshot = acceptedSnapshot();
    const display = snapshot.display;
    return snapshot.phase === 'final' && display?.sourceRevision === snapshot.sourceRevision ?
      display.value :
      snapshot.source;
  });

  const visibleGraphemes = createMemo<number | undefined>(() => {
    const snapshot = acceptedSnapshot();
    if(snapshot.phase === 'final' && snapshot.display?.sourceRevision === snapshot.sourceRevision) {
      return undefined;
    }

    return revealState().visibleGraphemes;
  });

  const showDots = createMemo(() => {
    const snapshot = acceptedSnapshot();
    return snapshot.phase === 'streaming' && revealState().caughtUp;
  });

  let decorationGeneration = 0;
  onCleanup(() => ++decorationGeneration);
  createEffect(() => {
    showDots();
    const snapshot = acceptedSnapshot();
    const generation = ++decorationGeneration;
    queueMicrotask(() => {
      if(generation !== decorationGeneration || !element) return;
      props.onLayout?.({
        element,
        sourceRevision: snapshot.sourceRevision,
        phase: snapshot.phase,
        reason: 'decoration',
        renderMode: 'none'
      });
    });
  });

  onMount(() => props.onElement?.(element));

  return (
    <Dynamic
      component={props.inline ? 'span' : 'div'}
      class={`${styles.Root}${props.class ? ` ${props.class}` : ''}`}
      data-source-revision={acceptedSnapshot().sourceRevision}
      ref={element}
    >
      <SolidInlineText
        value={displayValue}
        sourceRevision={() => acceptedSnapshot().sourceRevision}
        phase={() => acceptedSnapshot().phase}
        visibleGraphemes={visibleGraphemes}
        richTextOptions={props.richTextOptions}
        class={styles.Content}
        onLayout={props.onLayout}
      />
      <Show when={showDots()}>
        <MessageTextStreamingTail />
      </Show>
    </Dynamic>
  );
}

/**
 * Imperative adapter for the current non-Solid bubble shell. The mount element
 * and Solid owner stay stable; callers only push immutable snapshots/policy.
 */
export function createSolidMessageText(
  element: HTMLElement,
  initialSnapshot: MessageTextBodySnapshot,
  options: CreateSolidMessageTextOptions = {}
): SolidMessageTextController {
  const [snapshot, setSnapshot] = createSignal(initialSnapshot);
  const [richTextOptions, setRichTextOptions] = createSignal(options.richTextOptions);
  let currentSnapshot = initialSnapshot;
  let disposed = false;

  const disposeRender = render(() => (
    <SolidMessageTextBody
      {...options}
      snapshot={snapshot}
      richTextOptions={richTextOptions}
      onFinalized={(event) => {
        currentSnapshot = {...currentSnapshot, phase: 'final'};
        setSnapshot(currentSnapshot);
        options.onFinalized?.(event);
      }}
    />
  ), element);

  const dispose = () => {
    if(disposed) return;
    disposed = true;
    disposeRender();
  };
  options.middleware?.onDestroy(dispose);

  const update = (next: MessageTextBodySnapshot) => {
    if(disposed || next.sourceRevision < currentSnapshot.sourceRevision) return false;
    currentSnapshot = next;
    setSnapshot(next);
    return true;
  };

  return {
    element,
    update,
    finalize: (source = currentSnapshot.source, sourceRevision = currentSnapshot.sourceRevision) => {
      update({...currentSnapshot, source, sourceRevision, phase: 'finalizing'});
    },
    setDisplay: (display) => {
      update({...currentSnapshot, display});
    },
    setPolicy: (nextRichTextOptions) => {
      if(disposed) return;
      setRichTextOptions(() => nextRichTextOptions);
    },
    dispose
  };
}
