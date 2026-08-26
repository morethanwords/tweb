import {describe, expect, it, vi} from 'vitest';
import {mountSolidComponent, wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import {getMiddleware} from '@helpers/middleware';
import type {Middleware} from '@helpers/middleware';
import {onCleanup, type JSX} from 'solid-js';

describe('wrapSolidComponent', () => {
  it('unwraps nested accessors to the rendered element', () => {
    const element = document.createElement('div');
    const onClean = vi.fn();
    const middleware = Object.assign(() => true, {
      create: vi.fn(),
      onClean,
      onDestroy: vi.fn()
    }) as Middleware;

    const result = wrapSolidComponent(
      () => (() => () => element) as unknown as JSX.Element,
      middleware
    );

    expect(result).toBe(element);
    expect(onClean).toHaveBeenCalledOnce();
    expect(onClean).toHaveBeenCalledWith(expect.any(Function));
  });

  it('disposes an individually mounted child root exactly once', () => {
    const cleanup = vi.fn();
    const parent = getMiddleware();
    const mounted = mountSolidComponent(() => {
      onCleanup(cleanup);
      return document.createElement('div');
    }, parent.get());

    mounted.dispose();
    mounted.dispose();
    parent.destroy();

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
