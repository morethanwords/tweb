import {beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';

const sortableMock = vi.hoisted(() => ({args: undefined as any}));
const reorderUsernames = vi.hoisted(() => vi.fn());

vi.mock('@helpers/solid/createSortableList', () => ({
  createSortableList: (args: any) => {
    sortableMock.args = args;
    return {
      draggingId: (): string => null,
      dragHandleProps: () => ({onPointerDown: vi.fn()}),
      itemRef: () => () => {},
      itemStyle: () => ({})
    };
  }
}));

vi.mock('@helpers/listenerSetter', () => ({
  default: class ListenerSetter {
    public add() {
      return () => {};
    }

    public removeAll() {}
  }
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      appPeersManager: {getPeer: vi.fn()},
      appUsernamesManager: {reorderUsernames}
    }
  }
}));

vi.mock('@components/section', () => ({
  default: (props: any) => <section>{props.children}</section>
}));

vi.mock('@components/usernameRow', () => ({
  default: (props: any) => (
    <div
      ref={(element) => props.ref?.(element)}
      data-sortable={!!props.sortHandlePointerDown}
      data-username={props.title.slice(1)}
      style={props.style}
    />
  )
}));

vi.mock('@helpers/dom/placeCaretAtEnd', () => ({default: vi.fn()}));
vi.mock('@components/confirmationPopup', () => ({default: vi.fn()}));
vi.mock('@lib/langPack', () => ({i18n: (key: string) => key}));

import UsernamesSection from '@components/usernamesSection';

const username = (value: string, active: boolean) => ({
  _: 'username',
  pFlags: {active},
  username: value
} as any);

describe('UsernamesSection', () => {
  beforeEach(() => {
    sortableMock.args = undefined;
    reorderUsernames.mockClear();
  });

  it('reorders Solid-owned rows without moving inactive usernames', () => {
    const peerId = {
      isUser: () => true,
      toUserId: () => 1
    } as PeerId;
    const usernames = [
      username('alpha', true),
      username('beta', true),
      username('gamma', true),
      username('inactive', false)
    ];
    const container = document.createElement('div');
    const dispose = render(() => (
      <UsernamesSection
        peerId={peerId}
        peer={{pFlags: {}, usernames} as any}
        usernameInputField={{input: document.createElement('div')} as any}
      />
    ), container);
    const renderedUsernames = () => Array.from(
      container.querySelectorAll<HTMLElement>('[data-username]'),
      (element) => element.dataset.username
    );

    expect(sortableMock.args.items().map((item: any) => item.username)).toEqual([
      'alpha',
      'beta',
      'gamma'
    ]);
    expect(container.querySelector('[data-username="inactive"]')?.getAttribute('data-sortable')).toBe('false');

    const active = sortableMock.args.items();
    sortableMock.args.onReorder([active[2], active[0], active[1]]);

    expect(renderedUsernames()).toEqual(['gamma', 'alpha', 'beta', 'inactive']);
    expect(reorderUsernames).toHaveBeenLastCalledWith({
      peerId,
      order: ['gamma', 'alpha', 'beta']
    });

    const reordered = sortableMock.args.items();
    sortableMock.args.onReorder([reordered[1], reordered[2], reordered[0]]);

    expect(renderedUsernames()).toEqual(['alpha', 'beta', 'gamma', 'inactive']);
    expect(reorderUsernames).toHaveBeenLastCalledWith({
      peerId,
      order: ['alpha', 'beta', 'gamma']
    });

    dispose();
  });
});
