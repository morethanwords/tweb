import {describe, expect, it, vi} from 'vitest';
import ListenerSetter from '@helpers/listenerSetter';
import EventListenerBase from '@helpers/eventListenerBase';
import isCollected from '@/tests/helpers/collectGarbage';

describe('listener setter', () => {
  it('removes what it added, from nodes and from everything else', () => {
    const setter = new ListenerSetter();
    const node = document.createElement('div');
    const emitter = new EventListenerBase<{ping: () => void}>();
    const onNode = vi.fn(), onWindow = vi.fn(), onEmitter = vi.fn();
    setter.add(node)('click', onNode);
    setter.add(window)('resize', onWindow);
    setter.add(emitter)('ping', onEmitter);

    node.click();
    window.dispatchEvent(new Event('resize'));
    emitter.dispatchEvent('ping');
    expect([onNode, onWindow, onEmitter].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);

    setter.removeAll();
    node.click();
    window.dispatchEvent(new Event('resize'));
    emitter.dispatchEvent('ping');
    expect([onNode, onWindow, onEmitter].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('removes one listener of a node by hand, and a node\'s `once` listener once it fired', () => {
    const setter = new ListenerSetter();
    const node = document.createElement('div');
    const kept = vi.fn(), removed = vi.fn(), once = vi.fn();
    setter.add(node)('click', kept);
    setter.add(node)('click', removed);
    setter.add(node)('click', once, {once: true});
    setter.removeManual(node, 'click', removed);

    node.click();
    node.click();
    expect([kept, removed, once].map((fn) => fn.mock.calls.length)).toEqual([2, 0, 1]);

    setter.removeAll();
    node.click();
    expect(kept).toHaveBeenCalledTimes(2);
  });

  it('removes the listeners of a node added again after all of it had been removed', () => {
    const setter = new ListenerSetter();
    const node = document.createElement('div');
    const first = vi.fn(), second = vi.fn();
    setter.removeManual(node, 'click', first);
    setter.add(node)('click', first);
    setter.removeManual(node, 'click', first);
    setter.add(node)('click', second);

    setter.removeAll();
    node.click();
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('keeps one reference to a node listened on again and again', () => {
    const setter = new ListenerSetter();
    const node = document.createElement('div');
    const callback = vi.fn();
    for(let i = 0; i < 1000; ++i) {
      setter.add(node)('click', callback);
      setter.removeManual(node, 'click', callback);
    }

    setter.add(node)('click', callback);
    expect((setter as any).nodes.size).toBe(1);
    setter.removeAll();
    node.click();
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not keep alive a node that left the DOM with its listeners', async() => {
    const setter = new ListenerSetter();
    // * the usual shape: an item of a list that outlives the setter's owner, its callback holding it
    const mount = () => {
      const tree = document.createElement('div');
      const item = tree.appendChild(document.createElement('button'));
      setter.add(item)('click', () => item.remove());
      document.body.append(tree);
      return new WeakRef(tree);
    };
    const ref = mount();
    ref.deref().remove();

    expect(await isCollected(ref)).toBe(true);
    // * and goes on working
    const node = document.createElement('div');
    const callback = vi.fn();
    setter.add(node)('click', callback);
    setter.removeAll();
    node.click();
    expect(callback).not.toHaveBeenCalled();
  });

  it('drops its references to the nodes that are gone', async() => {
    const setter = new ListenerSetter();
    const live = Array.from({length: 10}, () => document.createElement('div'));
    live.forEach((node) => setter.add(node)('click', () => {}));
    const addDead = (count: number) => {
      for(let i = 0; i < count; ++i) {
        setter.add(document.createElement('div'))('click', () => {});
      }
    };
    addDead(1000);
    await isCollected(new WeakRef(document.createElement('div')));
    addDead(200);

    expect((setter as any).nodes.size).toBeLessThan(250);
  });
});
