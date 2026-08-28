import {describe, expect, it, vi} from 'vitest';
import {createRoot} from 'solid-js';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import cancelEvent from '@helpers/dom/cancelEvent';
import attachClickEventRef from '@helpers/solid/attachClickEventRef';

function makeTree() {
  const ancestor = document.createElement('div');
  const control = document.createElement('span');
  const plain = document.createElement('span');
  ancestor.append(control, plain);
  document.body.append(ancestor);

  const onAncestorClick = vi.fn();
  attachClickEvent(ancestor, onAncestorClick);

  return {ancestor, control, plain, onAncestorClick};
}

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
});
