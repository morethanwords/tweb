import {describe, expect, it} from 'vitest';

// The shim's live collections re-read their matches when `domGeneration()` moved (sandbox/capture.ts). The calls a
// textContent write makes to carry it out count nothing (UPSTREAM.md, item 9), and the write counts its change once,
// before them: widget code that runs after that count — a getter of one of the methods the write calls — and reads a
// collection would keep what the write then removes.
describe('a textContent write and the live collections (sandbox/capture.ts)', () => {
  it('counts the tree as changed after its steps, where widget code ran among them', async() => {
    const globals = globalThis as any;
    globals.__host ??= (): undefined => undefined;
    globals.__hostBinary ??= (): null => null;
    const [{document}, {collectPrototypes, domGeneration, installDirtyTracking}] = await Promise.all([
      import('widget-sandbox/sandbox/dom'),
      import('widget-sandbox/sandbox/capture')
    ]);
    // as the shim does (sandbox/index.ts)
    const samples = [
      document, document.createElement('div'), document.createElement('input'), document.createElement('select'), document.createElement('option'),
      document.createElement('textarea'), document.createElement('canvas'), document.createElement('template'),
      document.createElementNS('http://www.w3.org/2000/svg', 'svg'), document.createTextNode(''), document.createComment(''),
      document.createDocumentFragment(), document.createAttribute('x')
    ];
    installDirtyTracking(collectPrototypes(samples), Object.getPrototypeOf(document.createElement('div').classList));

    // Codex's case: the first of two paragraphs has a getter for `remove`, which removes it and reads a collection
    const parent = document.createElement('div');
    document.body.append(parent);
    parent.append(document.createElement('p'), document.createElement('p'));
    const first = parent.firstElementChild;
    const remove = first.remove;
    let readAt = -1;
    Object.defineProperty(first, 'remove', {
      configurable: true,
      get() {
        if(first.parentNode) {
          remove.call(first);
          // a collection read here is good for this generation
          readAt = domGeneration();
        }
        return remove;
      }
    });
    parent.textContent = 'done';
    expect(parent.children).toHaveLength(0);
    expect(readAt).toBeGreaterThan(-1);
    // the second paragraph went after that read: the collection must read its matches again
    expect(domGeneration()).toBeGreaterThan(readAt);
  });
});
