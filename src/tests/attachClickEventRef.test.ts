import {afterEach, describe, expect, it, vi} from 'vitest';
import {createRoot} from 'solid-js';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import cancelEvent from '@helpers/dom/cancelEvent';
import attachClickEventRef from '@helpers/solid/attachClickEventRef';

function makeTree(attach: typeof attachClickEvent = attachClickEvent) {
  const ancestor = document.createElement('div');
  const control = document.createElement('span');
  const plain = document.createElement('span');
  ancestor.append(control, plain);
  document.body.append(ancestor);

  const onAncestorClick = vi.fn();
  attach(ancestor, onAncestorClick);

  return {ancestor, control, plain, onAncestorClick};
}

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.resetModules();
  vi.doUnmock('@environment/touchSupport');
});

describe('attachClickEventRef', () => {
  it('lets a control cancel the very event an ancestor listens to', () => {
    const {control, plain, onAncestorClick} = makeTree();
    const onControlClick = vi.fn((e: MouseEvent) => cancelEvent(e));

    createRoot(() => {
      attachClickEventRef(onControlClick)(control);
    });

    // the ancestor binds with attachClickEvent too, so both sit on the same
    // event name — the control's cancelEvent is what keeps the ancestor out
    simulateClickEvent(control);
    expect(onControlClick).toHaveBeenCalledTimes(1);
    expect(onAncestorClick).not.toHaveBeenCalled();

    // an unbound sibling still reaches the ancestor
    simulateClickEvent(plain);
    expect(onAncestorClick).toHaveBeenCalledTimes(1);
  });

  it('detaches the listener when its owner is disposed', () => {
    const {control, onAncestorClick} = makeTree();
    const onControlClick = vi.fn((e: MouseEvent) => cancelEvent(e));

    const dispose = createRoot((dispose) => {
      attachClickEventRef(onControlClick)(control);
      return dispose;
    });

    dispose();

    simulateClickEvent(control);
    expect(onControlClick).not.toHaveBeenCalled();
    expect(onAncestorClick).toHaveBeenCalledTimes(1);
  });

  // The whole point of the helper is that it follows attachClickEvent onto
  // mousedown where touch is supported. jsdom is never touch-capable, so force
  // it and re-import — otherwise a regression to a plain click listener would
  // sail through the cases above.
  it('handles mousedown, not click, where touch is supported', async() => {
    vi.resetModules();
    vi.doMock('@environment/touchSupport', () => ({default: true}));

    const {attachClickEvent: attachTouch} = await import('@helpers/dom/clickEvent');
    const {default: attachTouchRef} = await import('@helpers/solid/attachClickEventRef');

    const {control, onAncestorClick} = makeTree(attachTouch);
    const onControlClick = vi.fn((e: MouseEvent) => cancelEvent(e));

    createRoot(() => {
      attachTouchRef(onControlClick)(control);
    });

    control.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    expect(onControlClick).not.toHaveBeenCalled();

    control.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}));
    expect(onControlClick).toHaveBeenCalledTimes(1);
    expect(onAncestorClick).not.toHaveBeenCalled();
  });
});
