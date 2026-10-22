import {beforeAll, describe, expect, it, vi} from 'vitest';
import isCollected from '@/tests/helpers/collectGarbage';

// * the blur itself is a canvas filter; the queue runs it at once
vi.mock('@environment/canvasFilterSupport', () => ({default: true}));
vi.mock('@helpers/heavyQueue', () => ({
  default: ({items, process, context}: any) => Promise.resolve(items.map((args: any[]) => process.apply(context, args)))
}));

import blur from '@helpers/blur';

// * jsdom draws nothing: a context that remembers where each canvas was drawn from
const drawnFrom = new WeakMap<HTMLCanvasElement, CanvasImageSource>();
beforeAll(() => {
  HTMLImageElement.prototype.decode = () => Promise.resolve();
  HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement) {
    const canvas = this;
    return {filter: '', drawImage: (source: CanvasImageSource) => drawnFrom.set(canvas, source)} as any;
  } as any;
});

describe('blurred thumbnails', () => {
  it('draws every caller a canvas of its own from the one it keeps', async() => {
    const first = blur('data:image/png;base64,first');
    const second = blur('data:image/png;base64,first');
    await first.promise;
    await second.promise;

    expect(first.canvas).not.toBe(second.canvas);
    expect(drawnFrom.get(first.canvas)).toBeInstanceOf(HTMLCanvasElement);
    expect(drawnFrom.get(first.canvas)).toBe(drawnFrom.get(second.canvas));
    expect(drawnFrom.get(first.canvas)).not.toBe(first.canvas);

    // * from the cache, once it is ready
    const third = blur('data:image/png;base64,first');
    expect(drawnFrom.get(third.canvas)).toBe(drawnFrom.get(first.canvas));
  });

  it('does not keep the canvas a caller put into the DOM', async() => {
    let tree = document.createElement('div');
    const result = blur('data:image/png;base64,second');
    tree.append(result.canvas);
    document.body.append(tree);
    await result.promise;
    const ref = new WeakRef(tree);
    tree.remove();
    tree = undefined;
    result.canvas = undefined;

    expect(await isCollected(ref)).toBe(true);
  });
});
