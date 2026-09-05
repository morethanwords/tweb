import {TextWithEntities} from '@layer';
import {
  createMessageTextRevealCoordinator,
  createSolidMessageText,
  getAdaptiveMessageTextRevealSpeed,
  MessageTextStreamingTail,
  sliceTextWithEntitiesAtGrapheme,
  SolidInlineText,
  splitGraphemes,
  splitGraphemesFallback,
  TextRevealFrameScheduler,
  TextRevealModel
} from '@components/chat/bubbleParts/solidMessageText';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {
  getGraphemeOffsets,
  updateGraphemeOffsets,
  updateGraphemes
} from '@lib/richTextProcessor/graphemes';
import {decodeInlineMath, encodeInlineMath} from '@helpers/math/mathMarker';
import {batch, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {render} from 'solid-js/web';

vi.mock('@lib/richTextProcessor/wrapRichText', () => ({
  default: vi.fn((text: string, options: {
    entities?: TextWithEntities['entities'],
    noCodeHighlight?: boolean
  } = {}) => {
    const fragment = document.createDocumentFragment();
    const entities = options.entities || [];
    const appendRange = (
      parent: DocumentFragment | HTMLElement,
      from: number,
      to: number,
      ignored = new Set<number>()
    ) => {
      let offset = from;
      while(offset < to) {
        let selectedIndex = -1;
        for(let index = 0; index < entities.length; ++index) {
          if(ignored.has(index)) continue;
          const candidate = entities[index];
          const candidateEnd = candidate.offset + candidate.length;
          if(candidate.offset < offset || candidateEnd > to || !candidate.length) continue;
          const selected = entities[selectedIndex];
          if(
            selectedIndex === -1 ||
            candidate.offset < selected.offset ||
            candidate.offset === selected.offset && candidate.length > selected.length
          ) {
            selectedIndex = index;
          }
        }
        if(selectedIndex === -1) {
          parent.append(text.slice(offset, to));
          break;
        }

        const entity = entities[selectedIndex];
        if(entity.offset > offset) parent.append(text.slice(offset, entity.offset));
        const end = entity.offset + entity.length;
        const content = text.slice(entity.offset, end);
        let wrapper: HTMLElement;
      if(entity._ === 'messageEntityTextUrl') {
          wrapper = document.createElement('a');
          (wrapper as HTMLAnchorElement).href = entity.url;
      } else if(entity._ === 'messageEntityBold') {
          wrapper = document.createElement('strong');
      } else if(entity._ === 'messageEntityPre') {
          wrapper = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = content;
          wrapper.append(code);
      } else if(entity._ === 'messageEntitySpoiler') {
          wrapper = document.createElement('span');
          wrapper.className = 'spoiler';
        const spoilerText = document.createElement('span');
        spoilerText.className = 'spoiler-text';
          wrapper.append(spoilerText);
          const nestedIgnored = new Set(ignored);
          nestedIgnored.add(selectedIndex);
          appendRange(spoilerText, entity.offset, end, nestedIgnored);
        } else if(entity._ === 'messageEntityBlockquote') {
          wrapper = document.createElement('blockquote');
          wrapper.className = 'quote quote-block';
          const nestedIgnored = new Set(ignored);
          nestedIgnored.add(selectedIndex);
          appendRange(wrapper, entity.offset, end, nestedIgnored);
      } else {
          parent.append(content);
          offset = end;
          continue;
      }

        if(
          entity._ !== 'messageEntityPre' &&
          entity._ !== 'messageEntitySpoiler' &&
          entity._ !== 'messageEntityBlockquote'
        ) {
          wrapper.textContent = content;
        }
        if(entity._ === 'messageEntityBlockquote' && end < text.length) {
          const container = document.createElement('div');
          container.append(wrapper);
          parent.append(container);
        } else {
          parent.append(wrapper);
        }
        offset = end;
      }
    };
    appendRange(fragment, 0, text.length);
    return fragment;
  })
}));

const textWithEntities = (text: string, entities: TextWithEntities['entities'] = []): TextWithEntities => ({
  _: 'textWithEntities',
  text,
  entities
});

class ManualFrameScheduler implements TextRevealFrameScheduler {
  private callbacks = new Map<number, FrameRequestCallback>();
  private nextId = 0;

  public request = (callback: FrameRequestCallback) => {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    return id;
  };

  public cancel = (id: number) => {
    this.callbacks.delete(id);
  };

  public step(time: number) {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(time));
  }

  public get size() {
    return this.callbacks.size;
  }
}

describe('Solid message text graphemes', () => {
  test('keeps complex Unicode clusters intact', () => {
    const value = 'A👨‍👩‍👧‍👦e\u0301🇺🇦👍🏽Z';
    expect(splitGraphemes(value)).toEqual(['A', '👨‍👩‍👧‍👦', 'e\u0301', '🇺🇦', '👍🏽', 'Z']);
    expect(splitGraphemesFallback(value)).toEqual(['A', '👨‍👩‍👧‍👦', 'e\u0301', '🇺🇦', '👍🏽', 'Z']);
    expect(splitGraphemesFallback('🇺')).toEqual(['🇺']);
  });

  test('reveals inline math markers atomically and hides an unfinished marker', () => {
    const marker = '\x02YV4yK2JeMg==\x02';
    expect(splitGraphemes(`A${marker}B`)).toEqual(['A', marker, 'B']);
    expect(splitGraphemesFallback(`A${marker}B`)).toEqual(['A', marker, 'B']);
    const value = textWithEntities(`A${marker}B`);
    expect(sliceTextWithEntitiesAtGrapheme(value, 1).text).toBe('A');
    expect(sliceTextWithEntitiesAtGrapheme(value, 2).text).toBe(`A${marker}`);
    expect(splitGraphemes('\x02\x02')).toEqual(['\x02\x02']);
  });

  test('coalesces a math marker completed by an append, like a full re-split', () => {
    // Streaming only ever appends, and `splitMathMarkers` groups COMPLETE markers only — so
    // until the closing sentinel lands the marker sits in the cache as loose base64 chars.
    // Rescanning just the last cluster cannot reach its opening sentinel.
    const marker = '\x02YV4yK2JeMg==\x02';
    const partial = `A${marker.slice(0, -1)}`;
    const full = `A${marker}`;

    expect(updateGraphemes(partial, splitGraphemes(partial), full)).toEqual(splitGraphemes(full));
    expect(updateGraphemeOffsets(partial, getGraphemeOffsets(partial), full))
    .toEqual(getGraphemeOffsets(full));

    // An append that adds no sentinel must keep taking the cheap last-cluster path.
    const grown = `${partial}Z`;
    expect(updateGraphemes(partial, splitGraphemes(partial), grown)).toEqual(splitGraphemes(grown));
    expect(updateGraphemeOffsets(partial, getGraphemeOffsets(partial), grown))
    .toEqual(getGraphemeOffsets(grown));

    // A marker that is already complete must not be re-opened by a later append.
    const after = `${full}B`;
    expect(updateGraphemes(full, splitGraphemes(full), after)).toEqual(splitGraphemes(after));
    expect(updateGraphemeOffsets(full, getGraphemeOffsets(full), after))
    .toEqual(getGraphemeOffsets(after));
  });

  test('updates owned append caches by segmenting only the mutable tail', () => {
    const text = 'a'.repeat(10_000);
    let graphemeReads = 0;
    let offsetReads = 0;
    const graphemes = new Proxy(splitGraphemes(text), {
      get(target, property, receiver) {
        if(typeof(property) === 'string' && /^\d+$/.test(property)) ++graphemeReads;
        return Reflect.get(target, property, receiver);
      }
    });
    const offsets = new Proxy(getGraphemeOffsets(text), {
      get(target, property, receiver) {
        if(typeof(property) === 'string' && /^\d+$/.test(property)) ++offsetReads;
        return Reflect.get(target, property, receiver);
      }
    });
    const segment = vi.spyOn(Intl.Segmenter.prototype, 'segment');

    const updatedGraphemes = updateGraphemes(text, graphemes, text + 'b');
    const updatedOffsets = updateGraphemeOffsets(text, offsets, text + 'b');

    expect(updatedGraphemes).toBe(graphemes);
    expect(updatedOffsets).toBe(offsets);
    expect(segment.mock.calls.map(([value]) => value)).toEqual(['ab', 'ab']);
    expect(graphemeReads).toBeLessThan(10);
    expect(offsetReads).toBeLessThan(10);
    expect(updatedGraphemes).toHaveLength(10_001);
    expect(updatedOffsets[updatedOffsets.length - 1]).toBe(10_001);
    segment.mockRestore();
  });

  test('never exposes a partial atomic entity as interactive', () => {
    const value = textWithEntities('open link', [{
      _: 'messageEntityTextUrl',
      offset: 5,
      length: 4,
      url: 'https://example.com'
    }]);

    expect(sliceTextWithEntitiesAtGrapheme(value, 7)).toEqual(textWithEntities('open li'));
    expect(sliceTextWithEntitiesAtGrapheme(value, 9)).toEqual(value);

    const pre = textWithEntities('const x', [{
      _: 'messageEntityPre',
      offset: 0,
      length: 7,
      language: 'ts'
    }]);
    expect(sliceTextWithEntitiesAtGrapheme(pre, 4)).toEqual(textWithEntities('cons'));
    expect(sliceTextWithEntitiesAtGrapheme(pre, 7)).toEqual(pre);

    const customEmoji = textWithEntities('👍🏽', [{
      _: 'messageEntityCustomEmoji',
      offset: 0,
      length: '👍🏽'.length,
      document_id: 1
    }]);
    expect(sliceTextWithEntitiesAtGrapheme(customEmoji, 0)).toEqual(textWithEntities(''));
    expect(sliceTextWithEntitiesAtGrapheme(customEmoji, 1)).toEqual(customEmoji);
  });

  test('adapts default speed to a long backlog within bounded targets', () => {
    expect(getAdaptiveMessageTextRevealSpeed('streaming', 4_000)).toBe(240);
    expect(getAdaptiveMessageTextRevealSpeed('finalizing', 4_000)).toBe(800);
    expect(getAdaptiveMessageTextRevealSpeed('streaming', 600)).toBe(120);
    expect(getAdaptiveMessageTextRevealSpeed('finalizing', 600)).toBe(400);
    expect(getAdaptiveMessageTextRevealSpeed('streaming', 10)).toBe(60);
    expect(getAdaptiveMessageTextRevealSpeed('finalizing', 10)).toBe(160);
  });
});

describe('TextRevealModel', () => {
  test('preserves append progress and rewinds a rewritten suffix to its LCP', () => {
    const model = new TextRevealModel();
    expect(model.update({sourceRevision: 1, text: 'A👨‍👩‍👧‍👦B', phase: 'streaming'})).toMatchObject({
      visibleGraphemes: 0,
      totalGraphemes: 3
    });
    expect(model.advance(2).visibleGraphemes).toBe(2);

    expect(model.update({sourceRevision: 2, text: 'A👨‍👩‍👧‍👦BC', phase: 'streaming'})).toMatchObject({
      visibleGraphemes: 2,
      totalGraphemes: 4
    });
    expect(model.update({sourceRevision: 3, text: 'AX', phase: 'streaming'})).toMatchObject({
      visibleGraphemes: 1,
      totalGraphemes: 2
    });
  });

  test('handles shrink, late revisions, final and reduced motion', () => {
    const model = new TextRevealModel();
    model.update({sourceRevision: 4, text: 'abcdef', phase: 'streaming'});
    model.advance(5);

    expect(model.update({sourceRevision: 5, text: 'abc', phase: 'streaming'})).toMatchObject({
      visibleGraphemes: 3,
      totalGraphemes: 3,
      caughtUp: true
    });
    expect(model.update({sourceRevision: 3, text: 'late', phase: 'streaming'}).sourceRevision).toBe(5);
    expect(model.update({sourceRevision: 6, text: 'final text', phase: 'final'})).toMatchObject({
      visibleGraphemes: 10,
      caughtUp: true
    });

    const reduced = new TextRevealModel();
    expect(reduced.update({
      sourceRevision: 1,
      text: 'no animation',
      phase: 'streaming',
      reducedMotion: true
    })).toMatchObject({visibleGraphemes: 12, caughtUp: true});
  });
});

describe('rich message reveal coordinator', () => {
  test('waits for the coordinator clamp before processing a changed atomic leaf', async() => {
    type Snapshot = {revision: number, value: TextWithEntities};
    const scheduler = new ManualFrameScheduler();
    const processor = vi.fn((fragment: DocumentFragment) => {
      const marker = fragment.textContent.match(/\x02([A-Za-z0-9+/=]*)\x02/);
      if(marker) fragment.replaceChildren(decodeInlineMath(marker[1]));
    });
    const host = document.createElement('div');
    let update: (snapshot: Snapshot) => void;
    const dispose = render(() => {
      const [snapshot, setSnapshot] = createSignal<Snapshot>({
        revision: 1,
        value: textWithEntities(encodeInlineMath('x'))
      });
      update = setSnapshot;
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => snapshot().revision,
        phase: () => 'streaming',
        frameScheduler: scheduler,
        graphemesPerSecond: 1000,
        maxRevealFramesPerSecond: 1000
      });
      return (
        <SolidInlineText
          value={() => snapshot().value}
          sourceRevision={() => snapshot().revision}
          phase={() => 'streaming'}
          revealCoordinator={coordinator}
          processFragment={processor}
          processFragmentMode="chunk"
        />
      );
    }, host);

    await Promise.resolve();
    scheduler.step(0);
    scheduler.step(2);
    await Promise.resolve();
    const leaf = host.firstElementChild as HTMLElement;
    expect(leaf.textContent).toBe('x');
    processor.mockClear();

    update({revision: 1, value: textWithEntities(encodeInlineMath('xy'))});
    // No await: the new value is already reactive, but its old visibility is
    // not allowed to reach the processor before the coordinator clamps it.
    expect(processor).not.toHaveBeenCalled();
    expect(leaf.textContent).toBe('x');

    await Promise.resolve();
    expect(leaf.textContent).toBe('');
    expect(processor).toHaveBeenCalledOnce();
    scheduler.step(10);
    scheduler.step(12);
    await Promise.resolve();
    expect(leaf.textContent).toBe('xy');
    expect(processor).toHaveBeenCalledTimes(2);
    dispose();
  });

  test('acknowledges new revisions while inactive and renders their full text', async() => {
    const host = document.createElement('div');
    const scheduler = new ManualFrameScheduler();
    let update: (snapshot: {revision: number, value: TextWithEntities}) => void;
    let setActive: (active: boolean) => void;
    const dispose = render(() => {
      const [snapshot, setSnapshot] = createSignal({
        revision: 1,
        value: textWithEntities('one')
      });
      const [active, updateActive] = createSignal(false);
      update = setSnapshot;
      setActive = updateActive;
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => snapshot().revision,
        phase: () => 'streaming',
        active,
        frameScheduler: scheduler
      });
      return (
        <SolidInlineText
          value={() => snapshot().value}
          sourceRevision={() => snapshot().revision}
          phase={() => 'streaming'}
          revealCoordinator={coordinator}
        />
      );
    }, host);

    await Promise.resolve();
    const leaf = host.firstElementChild as HTMLElement;
    expect(leaf.textContent).toBe('one');

    update({revision: 2, value: textWithEntities('two')});
    expect(leaf.textContent).toBe('one');
    await Promise.resolve();
    expect(leaf.textContent).toBe('two');
    expect(leaf.dataset.sourceRevision).toBe('2');

    setActive(true);
    await Promise.resolve();
    expect(leaf.textContent).toBe('two');
    expect(scheduler.size).toBe(0);
    dispose();
  });

  test('does not finalize an inactive coordinator that has no rich leaves', async() => {
    const finalized = vi.fn();
    const host = document.createElement('div');
    const dispose = render(() => {
      createMessageTextRevealCoordinator({
        sourceRevision: () => 1,
        phase: () => 'finalizing',
        active: () => false,
        onFinalized: finalized
      });
      return <span />;
    }, host);

    await Promise.resolve();
    expect(finalized).not.toHaveBeenCalled();
    dispose();
  });

  test('registers a mounted leaf element without opening another content generation', async() => {
    const host = document.createElement('div');
    let appliedGeneration: () => number;
    let element: HTMLElement;
    let initialGeneration = 0;
    let revealElement: HTMLElement;
    const dispose = render(() => {
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => 1,
        phase: () => 'final',
        onReveal: (event) => revealElement = event.element
      });
      const leaf = coordinator.registerLeaf();
      initialGeneration = leaf.update(textWithEntities('x'));
      appliedGeneration = leaf.appliedGeneration;
      onMount(() => leaf.setElement(element));
      onCleanup(leaf.dispose);
      return <span ref={element} />;
    }, host);

    await Promise.resolve();
    expect(initialGeneration).toBe(1);
    expect(appliedGeneration()).toBe(1);
    expect(revealElement).toBe(element);
    dispose();
  });

  test('redistributes the cursor by current DOM order after stable leaves move', async() => {
    const first = {key: 'first', value: textWithEntities('AA')};
    const second = {key: 'second', value: textWithEntities('BB')};
    const scheduler = new ManualFrameScheduler();
    const revealElements: HTMLElement[] = [];
    const host = document.createElement('div');
    let setRevision: (revision: number) => void;
    let setOrder: (order: (typeof first)[]) => void;
    const dispose = render(() => {
      const [revision, updateRevision] = createSignal(1);
      const [order, updateOrder] = createSignal([first, second]);
      setRevision = updateRevision;
      setOrder = updateOrder;
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: revision,
        phase: () => 'streaming',
        frameScheduler: scheduler,
        graphemesPerSecond: 500,
        maxRevealFramesPerSecond: 1000,
        onReveal: (event) => revealElements.push(event.element)
      });
      return (
        <For each={order()}>{(entry) => (
          <SolidInlineText
            class={entry.key}
            value={() => entry.value}
            sourceRevision={revision}
            phase={() => 'streaming'}
            revealCoordinator={coordinator}
          />
        )}</For>
      );
    }, host);

    await Promise.resolve();
    const firstElement = host.querySelector<HTMLElement>('.first');
    const secondElement = host.querySelector<HTMLElement>('.second');
    expect(revealElements[revealElements.length - 1]).toBe(secondElement);
    scheduler.step(0);
    scheduler.step(2);
    await Promise.resolve();
    expect(firstElement.textContent).toBe('A');
    expect(secondElement.textContent).toBe('');

    batch(() => {
      setOrder([second, first]);
      setRevision(2);
    });
    await Promise.resolve();
    expect(host.firstElementChild).toBe(secondElement);
    expect(secondElement.textContent).toBe('');
    expect(firstElement.textContent).toBe('');
    expect(revealElements[revealElements.length - 1]).toBe(firstElement);

    scheduler.step(10);
    scheduler.step(12);
    await Promise.resolve();
    expect(secondElement.textContent).toBe('B');
    expect(firstElement.textContent).toBe('');
    dispose();
  });

  test('does not invalidate a completed prefix leaf on tail cursor frames', async() => {
    const scheduler = new ManualFrameScheduler();
    const host = document.createElement('div');
    let setRevision: (revision: number) => void;
    let setTail: (value: TextWithEntities) => void;
    let prefixStateReads = 0;
    let prefixPhaseReads = 0;
    let coordinator: ReturnType<typeof createMessageTextRevealCoordinator>;
    const dispose = render(() => {
      const [revision, updateRevision] = createSignal(1);
      const [tail, updateTail] = createSignal(textWithEntities(''));
      setRevision = updateRevision;
      setTail = updateTail;
      coordinator = createMessageTextRevealCoordinator({
        sourceRevision: revision,
        phase: () => 'streaming',
        frameScheduler: scheduler,
        graphemesPerSecond: 500,
        maxRevealFramesPerSecond: 1000
      });
      const prefixCoordinator = {
        ...coordinator,
        state: () => {
          ++prefixStateReads;
          return coordinator.state();
        },
        phase: () => {
          ++prefixPhaseReads;
          return coordinator.phase();
        }
      };
      return (
        <>
          <SolidInlineText
            class="prefix"
            value={() => textWithEntities('A')}
            sourceRevision={revision}
            phase={() => 'streaming'}
            revealCoordinator={prefixCoordinator}
          />
          <SolidInlineText
            class="tail"
            value={tail}
            sourceRevision={revision}
            phase={() => 'streaming'}
            revealCoordinator={coordinator}
          />
        </>
      );
    }, host);

    await Promise.resolve();
    scheduler.step(0);
    scheduler.step(2);
    await Promise.resolve();
    expect(host.querySelector('.prefix').textContent).toBe('A');
    prefixStateReads = 0;
    prefixPhaseReads = 0;

    batch(() => {
      setTail(textWithEntities('BBB'));
      setRevision(2);
    });
    await Promise.resolve();
    expect(coordinator.state()).toMatchObject({visibleGraphemes: 1, totalGraphemes: 4});
    scheduler.step(2);
    scheduler.step(4);
    await Promise.resolve();
    expect(coordinator.state()).toMatchObject({visibleGraphemes: 2, totalGraphemes: 4});
    expect(host.querySelector('.prefix').textContent).toBe('A');
    expect(host.querySelector('.tail').textContent).toBe('B');
    expect(prefixStateReads).toBe(0);
    expect(prefixPhaseReads).toBe(0);
    dispose();
  });

  test('acknowledges a changed leaf across a newer revision that changes another leaf', async() => {
    const host = document.createElement('div');
    let setRevision: (revision: number) => void;
    let setFirst: (value: TextWithEntities) => void;
    let setSecond: (value: TextWithEntities) => void;
    const dispose = render(() => {
      const [revision, updateRevision] = createSignal(1);
      const [first, updateFirst] = createSignal(textWithEntities('a'));
      const [second, updateSecond] = createSignal(textWithEntities('b'));
      setRevision = updateRevision;
      setFirst = updateFirst;
      setSecond = updateSecond;
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: revision,
        phase: () => 'final'
      });
      return (
        <div>
          <SolidInlineText
            value={first}
            sourceRevision={revision}
            phase={() => 'final'}
            revealCoordinator={coordinator}
          />
          <SolidInlineText
            value={second}
            sourceRevision={revision}
            phase={() => 'final'}
            revealCoordinator={coordinator}
          />
        </div>
      );
    }, host);

    await Promise.resolve();
    const leaves = host.querySelectorAll<HTMLElement>('[data-source-revision]');
    batch(() => {
      setRevision(2);
      setFirst(textWithEntities('aa'));
    });
    batch(() => {
      setRevision(3);
      setSecond(textWithEntities('bb'));
    });
    expect(leaves[0].textContent).toBe('a');
    expect(leaves[1].textContent).toBe('b');

    await Promise.resolve();
    expect(leaves[0].textContent).toBe('aa');
    expect(leaves[1].textContent).toBe('bb');
    expect(leaves[0].dataset.sourceRevision).toBe('3');
    expect(leaves[1].dataset.sourceRevision).toBe('3');
    dispose();
  });

  test.each([
    ['regional indicators', '🇺', '🇦'],
    ['combining marks', 'e', '\u0301'],
    ['CRLF', '\r', '\n']
  ])('keeps %s in separate leaf budgets through finalization', async(_name, first, second) => {
    const host = document.createElement('div');
    const scheduler = new ManualFrameScheduler();
    const finalized: string[] = [];

    const dispose = render(() => {
      const [phase, setPhase] = createSignal<'finalizing' | 'final'>('finalizing');
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => 1,
        phase,
        frameScheduler: scheduler,
        finalizingGraphemesPerSecond: 1000,
        maxRevealFramesPerSecond: 1000,
        onFinalized: ({phase}) => {
          finalized.push(phase);
          setPhase('final');
        }
      });

      return (
        <div>
          <SolidInlineText
            value={() => textWithEntities(first)}
            sourceRevision={() => 1}
            phase={phase}
            revealCoordinator={coordinator}
          />
          <SolidInlineText
            value={() => textWithEntities(second)}
            sourceRevision={() => 1}
            phase={phase}
            revealCoordinator={coordinator}
          />
        </div>
      );
    }, host);

    await Promise.resolve();
    const leaves = host.querySelectorAll<HTMLElement>('[data-source-revision]');
    scheduler.step(0);
    scheduler.step(2);
    await Promise.resolve();

    expect(leaves[0].textContent).toBe(first);
    expect(leaves[1].textContent).toBe(second);
    expect(finalized).toEqual(['final']);
    dispose();
  });

  test('shares one cursor across stable leaves and finalizes only after the whole body catches up', async() => {
    type RichRevealSnapshot = {
      revision: number,
      phase: 'streaming' | 'finalizing' | 'final',
      first: TextWithEntities,
      second: TextWithEntities
    };
    const host = document.createElement('div');
    const scheduler = new ManualFrameScheduler();
    const finalized: string[] = [];
    const revealed: string[] = [];
    let update: (value: RichRevealSnapshot) => void;

    const dispose = render(() => {
      const [snapshot, setSnapshot] = createSignal<RichRevealSnapshot>({
        revision: 1,
        phase: 'streaming',
        first: textWithEntities('ab'),
        second: textWithEntities('cd')
      }, {equals: false});
      update = setSnapshot;
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => snapshot().revision,
        phase: () => snapshot().phase,
        frameScheduler: scheduler,
        graphemesPerSecond: 1000,
        finalizingGraphemesPerSecond: 1000,
        maxRevealFramesPerSecond: 1000,
        onReveal: ({phase}) => revealed.push(phase),
        onFinalized: ({phase}) => {
          finalized.push(phase);
          setSnapshot({...snapshot(), phase: 'final'});
        }
      });

      return (
        <div>
          <SolidInlineText
            value={() => snapshot().first}
            sourceRevision={() => snapshot().revision}
            phase={() => snapshot().phase}
            revealCoordinator={coordinator}
          />
          <SolidInlineText
            value={() => snapshot().second}
            sourceRevision={() => snapshot().revision}
            phase={() => snapshot().phase}
            revealCoordinator={coordinator}
          />
          <Show when={coordinator.showTail()}>
            <MessageTextStreamingTail />
          </Show>
        </div>
      );
    }, host);

    await Promise.resolve();
    const root = host.firstElementChild;
    const leaves = root.querySelectorAll<HTMLElement>('[data-source-revision]');
    const firstLeaf = leaves[0];
    const secondLeaf = leaves[1];
    expect(firstLeaf.textContent).toBe('');
    expect(secondLeaf.textContent).toBe('');

    scheduler.step(0);
    scheduler.step(2);
    expect(firstLeaf.textContent).toBe('ab');
    expect(secondLeaf.textContent).toBe('');

    scheduler.step(4);
    expect(firstLeaf.textContent).toBe('ab');
    expect(secondLeaf.textContent).toBe('cd');
    expect(root.lastElementChild.getAttribute('aria-hidden')).toBe('true');

    update({
      revision: 2,
      phase: 'streaming',
      first: textWithEntities('ab'),
      second: textWithEntities('cdef')
    });
    await Promise.resolve();
    expect(root.lastElementChild.getAttribute('aria-hidden')).not.toBe('true');
    scheduler.step(10);
    scheduler.step(12);
    expect(secondLeaf.textContent).toBe('cdef');
    expect(root.lastElementChild.getAttribute('aria-hidden')).toBe('true');

    update({
      revision: 3,
      phase: 'finalizing',
      first: textWithEntities('ab'),
      second: textWithEntities('cdefgh')
    });
    await Promise.resolve();
    expect(finalized).toEqual([]);
    scheduler.step(20);
    scheduler.step(22);
    await Promise.resolve();

    expect(root.contains(firstLeaf)).toBe(true);
    expect(root.contains(secondLeaf)).toBe(true);
    expect(host.firstElementChild).toBe(root);
    expect(secondLeaf.textContent).toBe('cdefgh');
    expect(finalized).toEqual(['final']);
    expect(revealed.filter((phase) => phase === 'final')).toEqual(['final']);
    expect(root.querySelector('[aria-hidden="true"]')).toBeNull();

    dispose();
  });
});

describe('createSolidMessageText', () => {
  test('keeps a growing pre formatted while reveal catches up', () => {
    const host = document.createElement('div');
    let setValue: (value: TextWithEntities) => void;
    let setRevision: (revision: number) => void;
    let setVisible: (visible: number) => void;
    let setPhase: (phase: 'streaming' | 'final') => void;
    const makePre = (text: string) => textWithEntities(text, [{
      _: 'messageEntityPre',
      offset: 0,
      length: text.length,
      language: 'ts'
    }]);

    const dispose = render(() => {
      const [value, updateValue] = createSignal(makePre('abc'));
      const [revision, updateRevision] = createSignal(1);
      const [visible, updateVisible] = createSignal(1);
      const [phase, updatePhase] = createSignal<'streaming' | 'final'>('streaming');
      setValue = updateValue;
      setRevision = updateRevision;
      setVisible = updateVisible;
      setPhase = updatePhase;
      return (
        <SolidInlineText
          value={value}
          sourceRevision={revision}
          phase={phase}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    expect(root.querySelector('pre')?.textContent).toBe('a');
    const initialWrapCalls = vi.mocked(wrapRichText).mock.calls;
    expect(initialWrapCalls[initialWrapCalls.length - 1][1]).toMatchObject({noCodeHighlight: true});
    setVisible(3);
    const initialPre = root.querySelector('pre');
    expect(initialPre?.textContent).toBe('abc');
    vi.mocked(wrapRichText).mockClear();

    batch(() => {
      setValue(makePre('abcdef'));
      setRevision(2);
    });
    expect(root.querySelector('pre')).toBe(initialPre);
    expect(root.textContent).toBe('abc');
    expect(vi.mocked(wrapRichText)).not.toHaveBeenCalled();

    setVisible(4);
    expect(root.querySelectorAll('pre')).toHaveLength(1);
    expect(root.querySelector('pre')?.textContent).toBe('abcd');
    setVisible(6);
    expect(root.querySelectorAll('pre')).toHaveLength(1);
    expect(root.textContent).toBe('abcdef');
    expect(vi.mocked(wrapRichText)).not.toHaveBeenCalled();

    setPhase('final');
    expect(vi.mocked(wrapRichText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(wrapRichText).mock.calls[0][1].noCodeHighlight).not.toBe(true);
    expect(root.querySelectorAll('pre')).toHaveLength(1);
    dispose();
  });

  test('keeps a streamed spoiler as one semantic wrapper', () => {
    const host = document.createElement('div');
    const source = textWithEntities('secret', [{
      _: 'messageEntitySpoiler',
      offset: 0,
      length: 6
    }]);
    let setVisible: (visible: number) => void;

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(2);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    expect(root.querySelectorAll('.spoiler')).toHaveLength(1);
    const spoiler = root.querySelector('.spoiler');
    spoiler.classList.add('is-revealed');
    setVisible(4);
    expect(root.querySelectorAll('.spoiler')).toHaveLength(1);
    expect(root.querySelector('.spoiler')).toBe(spoiler);
    expect(spoiler.classList.contains('is-revealed')).toBe(true);
    expect(root.querySelector('.spoiler')?.textContent).toBe('secr');
    setVisible(6);
    expect(root.querySelectorAll('.spoiler')).toHaveLength(1);
    expect(root.querySelector('.spoiler')).toBe(spoiler);
    expect(root.querySelector('.spoiler')?.textContent).toBe('secret');
    dispose();
  });

  test('keeps spoiler state while formatting appears in its streamed suffix', () => {
    const host = document.createElement('div');
    const source = textWithEntities('secret', [
      {_: 'messageEntitySpoiler', offset: 0, length: 6},
      {_: 'messageEntityBold', offset: 2, length: 4}
    ]);
    let setVisible: (visible: number) => void;

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(2);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const spoiler = root.querySelector('.spoiler');
    spoiler.classList.add('is-revealed');
    setVisible(4);
    setVisible(6);
    expect(root.querySelector('.spoiler')).toBe(spoiler);
    expect(spoiler.classList.contains('is-revealed')).toBe(true);
    expect(spoiler.textContent).toBe('secret');
    expect(Array.from(spoiler.querySelectorAll('strong')).map((node) => node.textContent).join('')).toBe('cret');
    dispose();
  });

  test('activates a nested atomic link without replacing its spoiler', () => {
    const host = document.createElement('div');
    const source = textWithEntities('abcdefghij', [
      {_: 'messageEntitySpoiler', offset: 0, length: 10},
      {_: 'messageEntityTextUrl', offset: 6, length: 4, url: 'https://example.com'}
    ]);
    let setVisible: (visible: number) => void;

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(8);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const spoiler = root.querySelector('.spoiler');
    spoiler.classList.add('is-revealed');
    expect(root.querySelector('a')).toBeNull();
    setVisible(10);
    expect(root.querySelector('.spoiler')).toBe(spoiler);
    expect(spoiler.classList.contains('is-revealed')).toBe(true);
    expect(spoiler.textContent).toBe('abcdefghij');
    expect(spoiler.querySelector('a')?.textContent).toBe('ghij');
    dispose();
  });

  test('keeps a streamed collapsed blockquote wrapper and its state', () => {
    const host = document.createElement('div');
    const source = textWithEntities('quote', [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 5,
      pFlags: {collapsed: true}
    } as TextWithEntities['entities'][number]]);
    let setVisible: (visible: number) => void;

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(2);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const quote = root.querySelector('blockquote');
    quote.classList.add('is-expanded');
    setVisible(5);
    expect(root.querySelector('blockquote')).toBe(quote);
    expect(quote.classList.contains('is-expanded')).toBe(true);
    expect(quote.textContent).toBe('quote');
    dispose();
  });

  test('promotes a tail blockquote to its canonical block container when prose follows', () => {
    const host = document.createElement('div');
    const source = textWithEntities('quote tail', [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 5,
      pFlags: {collapsed: true}
    } as TextWithEntities['entities'][number]]);
    let setVisible: (visible: number) => void;

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(2);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const quote = root.querySelector('blockquote');
    quote.classList.add('is-expanded');
    expect(quote.parentElement).toBe(root);
    setVisible(5);
    expect(quote.parentElement).toBe(root);
    setVisible(10);
    expect(root.querySelector('blockquote')).toBe(quote);
    expect(quote.classList.contains('is-expanded')).toBe(true);
    expect(quote.parentElement.tagName).toBe('DIV');
    expect(quote.parentElement.parentElement).toBe(root);
    expect(root.textContent).toBe('quote tail');
    dispose();
  });

  test('extends a pre range after prose without rebuilding either prefix', () => {
    const host = document.createElement('div');
    const source = textWithEntities('lead code tail', [{
      _: 'messageEntityPre',
      offset: 5,
      length: 4,
      language: 'ts'
    }]);
    let setVisible: (visible: number) => void;

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(6);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const prose = root.firstChild;
    const pre = root.querySelector('pre');
    vi.mocked(wrapRichText).mockClear();
    setVisible(8);
    expect(root.firstChild).toBe(prose);
    expect(root.querySelector('pre')).toBe(pre);
    expect(pre.textContent).toBe('cod');
    setVisible(14);
    expect(root.querySelector('pre')).toBe(pre);
    expect(root.textContent).toBe('lead code tail');
    expect(vi.mocked(wrapRichText).mock.calls.map(([text]) => text)).toEqual([' tail']);
    dispose();
  });

  test('keeps an earlier pre stable when one reveal step crosses multiple ranges', () => {
    const host = document.createElement('div');
    const source = textWithEntities('aonebtwo', [
      {_: 'messageEntityPre', offset: 1, length: 3, language: ''},
      {_: 'messageEntityPre', offset: 5, length: 3, language: ''}
    ]);
    let setVisible: (visible: number) => void;

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(2);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const firstPre = root.querySelector('pre');
    setVisible(8);
    expect(root.querySelector('pre')).toBe(firstPre);
    expect(root.querySelectorAll('pre')).toHaveLength(2);
    expect(root.textContent).toBe('aonebtwo');
    dispose();
  });

  test('finalizes only pre ranges without replacing adjacent interactive DOM', () => {
    const host = document.createElement('div');
    const source = textWithEntities('link secret code', [
      {_: 'messageEntityTextUrl', offset: 0, length: 4, url: 'https://example.com'},
      {_: 'messageEntitySpoiler', offset: 5, length: 6},
      {_: 'messageEntityPre', offset: 12, length: 4, language: 'ts'}
    ]);
    let setPhase: (phase: 'streaming' | 'final') => void;

    const dispose = render(() => {
      const [phase, updatePhase] = createSignal<'streaming' | 'final'>('streaming');
      setPhase = updatePhase;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={phase}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const anchor = root.querySelector('a');
    const spoiler = root.querySelector('.spoiler');
    const pre = root.querySelector('pre');
    spoiler.classList.add('is-revealed');
    vi.mocked(wrapRichText).mockClear();
    setPhase('final');

    expect(root.querySelector('a')).toBe(anchor);
    expect(root.querySelector('.spoiler')).toBe(spoiler);
    expect(spoiler.classList.contains('is-revealed')).toBe(true);
    expect(root.querySelector('pre')).not.toBe(pre);
    expect(root.textContent).toBe('link secret code');
    expect(vi.mocked(wrapRichText).mock.calls.map(([text]) => text)).toEqual(['code']);
    dispose();
  });

  test('preserves formatted prefix DOM on a suffix rewrite', () => {
    const host = document.createElement('div');
    let setValue: (value: TextWithEntities) => void;
    let setRevision: (revision: number) => void;

    const dispose = render(() => {
      const [value, updateValue] = createSignal(textWithEntities('abcdef', [{
        _: 'messageEntityBold',
        offset: 0,
        length: 6
      }]));
      const [revision, updateRevision] = createSignal(1);
      setValue = updateValue;
      setRevision = updateRevision;
      return (
        <SolidInlineText
          value={value}
          sourceRevision={revision}
          phase={() => 'streaming'}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const stableStrong = root.firstElementChild;
    batch(() => {
      setValue(textWithEntities('abcXYZ', [{_: 'messageEntityBold', offset: 0, length: 6}]));
      setRevision(2);
    });

    expect(root.firstElementChild).toBe(stableStrong);
    expect(root.textContent).toBe('abcXYZ');
    expect(root.querySelectorAll('strong')).toHaveLength(1);
    dispose();
  });

  test('preserves mixed plain, formatted and link nodes on a suffix rewrite', () => {
    const host = document.createElement('div');
    let setValue: (value: TextWithEntities) => void;
    let setRevision: (revision: number) => void;
    const entities: TextWithEntities['entities'] = [
      {_: 'messageEntityBold', offset: 6, length: 4},
      {_: 'messageEntityTextUrl', offset: 11, length: 4, url: 'https://example.com'}
    ];

    const dispose = render(() => {
      const [value, updateValue] = createSignal(textWithEntities('plain bold link tail', entities));
      const [revision, updateRevision] = createSignal(1);
      setValue = updateValue;
      setRevision = updateRevision;
      return <SolidInlineText value={value} sourceRevision={revision} phase={() => 'streaming'} />;
    }, host);

    const root = host.firstElementChild;
    const plain = root.firstChild;
    const strong = root.querySelector('strong');
    const anchor = root.querySelector('a');
    batch(() => {
      setValue(textWithEntities('plain bold link next', entities.map((entity) => ({...entity}))));
      setRevision(2);
    });

    expect(root.firstChild).toBe(plain);
    expect(root.querySelector('strong')).toBe(strong);
    expect(root.querySelector('a')).toBe(anchor);
    expect(root.textContent).toBe('plain bold link next');
    dispose();
  });

  test('treats fresh nested entity flags as the same semantic entity', () => {
    const host = document.createElement('div');
    let setValue: (value: TextWithEntities) => void;
    let setRevision: (revision: number) => void;
    const makeValue = () => textWithEntities('quote', [{
      _: 'messageEntityBlockquote',
      offset: 0,
      length: 5,
      pFlags: {collapsed: true}
    } as TextWithEntities['entities'][number]]);

    const dispose = render(() => {
      const [value, updateValue] = createSignal(makeValue());
      const [revision, updateRevision] = createSignal(1);
      setValue = updateValue;
      setRevision = updateRevision;
      return <SolidInlineText value={value} sourceRevision={revision} phase={() => 'streaming'} />;
    }, host);

    const root = host.firstElementChild;
    const node = root.firstChild;
    vi.mocked(wrapRichText).mockClear();
    batch(() => {
      setValue(makeValue());
      setRevision(2);
    });
    expect(root.firstChild).toBe(node);
    expect(vi.mocked(wrapRichText)).not.toHaveBeenCalled();
    dispose();
  });

  test('postprocesses only appended rich chunks and preserves an early link', () => {
    const host = document.createElement('div');
    const source = textWithEntities('link tail', [{
      _: 'messageEntityTextUrl',
      offset: 0,
      length: 4,
      url: 'https://example.com'
    }]);
    let setVisible: (visible: number) => void;
    const processFragment = vi.fn((fragment: DocumentFragment) => {
      fragment.querySelectorAll('a').forEach((anchor) => anchor.classList.add('processed'));
    });

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(4);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
          processFragment={processFragment}
          processFragmentMode="chunk"
        />
      );
    }, host);

    const root = host.firstElementChild;
    const anchor = root.querySelector('a');
    expect(anchor.classList.contains('processed')).toBe(true);
    vi.mocked(wrapRichText).mockClear();
    processFragment.mockClear();
    setVisible(9);
    expect(root.querySelector('a')).toBe(anchor);
    expect(vi.mocked(wrapRichText).mock.calls.map(([text]) => text)).toEqual([' tail']);
    expect(processFragment).toHaveBeenCalledTimes(1);
    dispose();
  });

  test('hydrates a complete math token once and preserves it while the tail grows', () => {
    const host = document.createElement('div');
    const marker = '\x02YQ==\x02';
    const source = textWithEntities(`A${marker}BC`);
    let setVisible: (visible: number) => void;
    const processFragment = vi.fn((fragment: DocumentFragment) => {
      const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
      let node: Text;
      while((node = walker.nextNode() as Text)) {
        const index = node.data.indexOf(marker);
        if(index === -1) continue;
        const span = document.createElement('span');
        span.className = 'inline-math';
        span.textContent = 'a';
        node.replaceWith(node.data.slice(0, index), span, node.data.slice(index + marker.length));
        break;
      }
    });

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(1);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
          processFragment={processFragment}
          processFragmentMode="chunk"
        />
      );
    }, host);

    const root = host.firstElementChild;
    expect(root.textContent).toBe('A');
    setVisible(2);
    const math = root.querySelector('.inline-math');
    expect(math?.textContent).toBe('a');
    expect(root.textContent).not.toContain('\x02');
    processFragment.mockClear();
    setVisible(4);
    expect(root.querySelector('.inline-math')).toBe(math);
    expect(root.textContent).toBe('AaBC');
    expect(processFragment).toHaveBeenCalledTimes(1);
    dispose();
  });

  test('coalesces a long formatted append stream and rebuilds unsafe entity shrink', () => {
    const host = document.createElement('div');
    let setValue: (value: TextWithEntities) => void;
    let setRevision: (revision: number) => void;

    const dispose = render(() => {
      const [value, updateValue] = createSignal(textWithEntities('a', [{
        _: 'messageEntityBold',
        offset: 0,
        length: 1
      }]));
      const [revision, updateRevision] = createSignal(1);
      setValue = updateValue;
      setRevision = updateRevision;
      return <SolidInlineText value={value} sourceRevision={revision} phase={() => 'streaming'} />;
    }, host);

    const root = host.firstElementChild;
    const stableStrong = root.firstElementChild;
    for(let length = 2; length <= 100; ++length) {
      batch(() => {
        setValue(textWithEntities('a'.repeat(length), [{
          _: 'messageEntityBold',
          offset: 0,
          length
        }]));
        setRevision(length);
      });
    }

    expect(root.childNodes).toHaveLength(1);
    expect(root.firstElementChild).toBe(stableStrong);
    expect(root.textContent).toBe('a'.repeat(100));

    batch(() => {
      setValue(textWithEntities('a'.repeat(100), [{_: 'messageEntityBold', offset: 0, length: 50}]));
      setRevision(101);
    });
    expect(root.querySelector('strong')?.textContent).toBe('a'.repeat(50));
    expect(root.textContent).toBe('a'.repeat(100));
    dispose();
  });

  test('wraps only an appended formatted suffix and preserves prior DOM nodes through finalization', () => {
    const host = document.createElement('div');
    const source = textWithEntities('abcdefghi', [{
      _: 'messageEntityBold',
      offset: 0,
      length: 9
    }]);
    let setValue: (value: TextWithEntities) => void;
    let setRevision: (revision: number) => void;
    let setPhase: (phase: 'streaming' | 'final') => void;
    let setVisible: (visible?: number) => void;

    const dispose = render(() => {
      const [value, updateValue] = createSignal(source);
      const [revision, updateRevision] = createSignal(1);
      const [phase, updatePhase] = createSignal<'streaming' | 'final'>('streaming');
      const [visible, updateVisible] = createSignal<number | undefined>(3);
      setValue = updateValue;
      setRevision = updateRevision;
      setPhase = updatePhase;
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={value}
          sourceRevision={revision}
          phase={phase}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const stableStrong = root.firstElementChild;
    expect(stableStrong?.textContent).toBe('abc');
    vi.mocked(wrapRichText).mockClear();

    setVisible(6);
    expect(vi.mocked(wrapRichText).mock.calls.map(([text]) => text)).toEqual(['def']);
    expect(root.firstElementChild).toBe(stableStrong);
    expect(root.textContent).toBe('abcdef');

    vi.mocked(wrapRichText).mockClear();
    batch(() => {
      setVisible(undefined);
      setPhase('final');
    });
    expect(vi.mocked(wrapRichText).mock.calls.map(([text]) => text)).toEqual(['ghi']);
    expect(root.firstElementChild).toBe(stableStrong);
    expect(root.textContent).toBe('abcdefghi');

    batch(() => {
      setValue(textWithEntities('abXY', [{_: 'messageEntityBold', offset: 0, length: 4}]));
      setRevision(2);
    });
    expect(root.textContent).toBe('abXY');
    expect(root.contains(stableStrong)).toBe(false);
    dispose();
  });

  test('replaces only the atomic token when it becomes complete, then preserves its identity', () => {
    const host = document.createElement('div');
    const source = textWithEntities('link tail', [{
      _: 'messageEntityTextUrl',
      offset: 0,
      length: 4,
      url: 'https://example.com'
    }]);
    let setVisible: (visible: number) => void;

    const dispose = render(() => {
      const [visible, updateVisible] = createSignal(2);
      setVisible = updateVisible;
      return (
        <SolidInlineText
          value={() => source}
          sourceRevision={() => 1}
          phase={() => 'streaming'}
          visibleGraphemes={visible}
        />
      );
    }, host);

    const root = host.firstElementChild;
    const partialText = root.firstChild;
    expect(root.textContent).toBe('li');
    expect(root.querySelector('a')).toBeNull();

    setVisible(4);
    const anchor = root.querySelector('a');
    expect(anchor?.textContent).toBe('link');
    expect(root.contains(partialText)).toBe(false);

    vi.mocked(wrapRichText).mockClear();
    setVisible(5);
    expect(vi.mocked(wrapRichText).mock.calls.map(([text]) => text)).toEqual([' ']);
    expect(root.querySelector('a')).toBe(anchor);
    dispose();
  });

  test('keeps one owner/root through chunks, policy updates and finalization', async() => {
    const host = document.createElement('div');
    const scheduler = new ManualFrameScheduler();
    const layouts: string[] = [];
    const finalizedPhases: string[] = [];
    const initial = textWithEntities('go', [{
      _: 'messageEntityTextUrl',
      offset: 0,
      length: 2,
      url: 'https://example.com'
    }]);
    const controller = createSolidMessageText(host, {
      sourceRevision: 1,
      source: initial,
      phase: 'streaming'
    }, {
      frameScheduler: scheduler,
      graphemesPerSecond: 1000,
      maxRevealFramesPerSecond: 1000,
      onLayout: ({reason}) => layouts.push(reason),
      onFinalized: ({phase}) => finalizedPhases.push(phase)
    });
    const root = host.firstElementChild;

    expect(root).toBeTruthy();
    expect(scheduler.size).toBe(1);
    scheduler.step(0);
    scheduler.step(1);
    expect(root.textContent).toBe('g');
    expect(root.querySelector('a')).toBeNull();

    scheduler.step(2);
    expect(root.textContent).toBe('go ...');
    const anchor = root.querySelector('a');
    const dots = root.querySelector('[aria-hidden="true"]');
    expect(anchor?.textContent).toBe('go');
    expect(anchor?.contains(dots)).toBe(false);

    expect(controller.update({
      sourceRevision: 2,
      source: textWithEntities('go now'),
      phase: 'streaming'
    })).toBe(true);
    expect(host.firstElementChild).toBe(root);

    expect(controller.update({
      sourceRevision: 1,
      source: textWithEntities('late'),
      phase: 'streaming'
    })).toBe(false);
    expect(root.getAttribute('data-source-revision')).toBe('2');

    controller.setPolicy({noLinks: true});
    controller.finalize();
    expect(root.textContent).not.toBe('go now');
    scheduler.step(3);
    scheduler.step(103);
    expect(host.firstElementChild).toBe(root);
    expect(root.textContent).toBe('go now');
    expect(root.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(layouts.length).toBeGreaterThan(0);
    expect(finalizedPhases).toEqual(['final']);

    controller.setDisplay({sourceRevision: 2, value: textWithEntities('готово')});
    expect(root.textContent).toBe('готово');
    controller.setDisplay({sourceRevision: 1, value: textWithEntities('устарело')});
    expect(root.textContent).toBe('go now');

    controller.dispose();
    expect(host.childNodes.length).toBe(0);
    await Promise.resolve();
  });

  test('uses the append fast path and bounds full rich-text wrapping', () => {
    const host = document.createElement('div');
    const scheduler = new ManualFrameScheduler();
    const renderModes: string[] = [];
    const controller = createSolidMessageText(host, {
      sourceRevision: 1,
      source: textWithEntities(''),
      phase: 'streaming'
    }, {
      frameScheduler: scheduler,
      graphemesPerSecond: 1000,
      onLayout: ({renderMode}) => renderModes.push(renderMode)
    });

    controller.update({
      sourceRevision: 2,
      source: textWithEntities('a'.repeat(200)),
      phase: 'streaming'
    });
    scheduler.step(0);
    scheduler.step(50);
    scheduler.step(100);
    scheduler.step(150);
    scheduler.step(200);

    expect(host.firstElementChild.textContent).toBe(`${'a'.repeat(200)} ...`);
    expect(renderModes.filter((mode) => mode === 'replace')).toHaveLength(1);
    expect(renderModes.filter((mode) => mode === 'append').length).toBeLessThanOrEqual(4);
    controller.dispose();
  });
});
