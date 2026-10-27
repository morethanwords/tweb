import {describe, expect, it} from 'vitest';
import {hasMouseMovedSinceDown} from '@helpers/dom/clickEvent';
import isCollected from '@/tests/helpers/collectGarbage';

const press = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
// * a trusted click cannot be dispatched from a test; the check reads only these fields
const click = (target: HTMLElement) => ({isTrusted: true, type: 'click', target, detail: 1}) as any as MouseEvent;

describe('the last pressed element', () => {
  it('tells a click on the pressed element from one that moved away', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    press(a);
    expect(hasMouseMovedSinceDown(click(a))).toBeFalsy();
    expect(hasMouseMovedSinceDown(click(b))).toBe(true);
    a.remove();
    b.remove();
  });

  it('is not kept alive once it leaves the DOM, nor the tree it was removed with', async() => {
    let tree = document.createElement('div');
    document.body.append(tree);
    // * pressed deep inside: the element keeps its ancestors, so the whole tree goes with it
    press(tree.appendChild(document.createElement('span')));
    const ref = new WeakRef(tree);
    tree.remove();
    tree = undefined;
    // * jsdom's selector engine keeps the last mouse event it saw on the window, and with it the
    // * element pressed: a browser has no such cache
    document.body.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));

    expect(await isCollected(ref)).toBe(true);
  });
});
