import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  collected: undefined as Promise<void> | undefined,
  disposes: [] as VoidFunction[],
  tab: undefined as any,
  toggleParticipantsHidden: vi.fn()
}));

vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({
    collect: (promise: Promise<void>) => {
      mocks.collected = promise;
    }
  })
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppChatMembersTab: class AppChatMembersTab {}
}));

vi.mock('@helpers/solid/renderComponent', async() => {
  const {createComponent} = await import('solid-js');
  const {render} = await import('solid-js/web');

  return {
    renderComponent: ({element, Component}: any) => {
      mocks.disposes.push(render(() => createComponent(Component, {}), element));
    }
  };
});

vi.mock('@components/rowTsx', async() => {
  const {createEffect} = await import('solid-js');
  const {insert} = await import('solid-js/web');
  const part = (props: any, className: string) => {
    const element = document.createElement('div');
    element.classList.add(className);
    insert(element, () => props.children);
    return element;
  };
  const Row = Object.assign((props: any) => {
    const element = document.createElement('div');
    element.classList.add('row');
    createEffect(() => element.classList.toggle('is-disabled', !!props.disabled));
    insert(element, () => props.children);
    return element;
  }, {
    CheckboxFieldToggle: (props: any) => part(props, 'row-checkbox-field-toggle'),
    Icon: (props: any) => part(props, `row-icon-${props.icon}`),
    Title: (props: any) => part(props, 'row-title')
  });

  return {default: Row};
});

vi.mock('@components/checkboxFieldTsx', async() => {
  const {createEffect, untrack} = await import('solid-js');

  return {
    default: (props: any) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      label.append(input);
      createEffect(() => {
        input.checked = props.signal?.[0]() ?? !!props.checked;
        input.disabled = !!props.disabled;
      });
      input.addEventListener('change', () => {
        props.signal?.[1](input.checked);
        untrack(() => props.onChange?.(input.checked));
      });
      return label;
    }
  };
});

vi.mock('@components/settingSection', () => ({
  default: class SettingSection {
    public container = document.createElement('section');
    public content = document.createElement('div');

    constructor() {
      this.container.append(this.content);
    }
  }
}));

vi.mock('@components/sidebarRight/tabs/participantsSelector', () => ({
  createSelectorForParticipants: () => {
    const container = document.createElement('div');
    container.append(document.createElement('div'));
    const selector = {
      participants: new Map(),
      scrollable: {
        append: (...elements: Node[]) => container.append(...elements),
        container
      }
    };
    mocks.tab.content.append(container);
    return {selector, loadPromise: Promise.resolve()};
  }
}));

vi.mock('@components/popups/channelsTooMuch', () => ({
  handleChannelsTooMuch: (callback: () => Promise<any>) => callback()
}));

vi.mock('@components/appSelectPeers', () => ({
  default: class AppSelectPeers {}
}));

vi.mock('@components/addChatUsers', () => ({
  default: vi.fn()
}));

vi.mock('@helpers/dom/clickEvent', () => ({
  attachClickEvent: (element: HTMLElement, callback: EventListener) => {
    element.addEventListener('click', callback);
  }
}));

vi.mock('@components/buttonCorner', () => ({
  default: () => document.createElement('button')
}));

vi.mock('@helpers/dom/createParticipantContextMenu', () => ({
  default: vi.fn()
}));

vi.mock('@appManagers/utils/chats/hasRights', () => ({
  default: () => true
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

import ChatMembers from '@components/sidebarRight/tabs/chatMembers';

describe('ChatMembers Hide Members', () => {
  let container: HTMLDivElement;
  let dispose: VoidFunction;
  let participantsHidden: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.disposes = [];
    mocks.collected = undefined;
    participantsHidden = false;
    container = document.createElement('div');
    const content = document.createElement('div');
    document.body.append(container, content);
    mocks.toggleParticipantsHidden.mockResolvedValue(undefined);
    mocks.tab = {
      container: document.createElement('div'),
      content,
      title: document.createElement('div'),
      listenerSetter: {},
      managers: {
        apiManager: {
          getAppConfig: vi.fn().mockResolvedValue({hidden_members_group_size_min: 100})
        },
        appChatsManager: {
          getChat: vi.fn().mockResolvedValue({
            _: 'channel',
            id: 42 as ChatId,
            participants_count: 500,
            pFlags: {}
          }),
          isBroadcast: vi.fn().mockResolvedValue(false),
          toggleParticipantsHidden: mocks.toggleParticipantsHidden
        },
        appProfileManager: {
          getChannelFull: vi.fn(() => Promise.resolve({
            _: 'channelFull',
            pFlags: {participants_hidden: participantsHidden || undefined}
          }))
        }
      },
      middlewareHelper: {
        get: () => Object.assign(() => true, {onDestroy: vi.fn()})
      },
      payload: 42 as ChatId,
      slider: {}
    };
  });

  afterEach(() => {
    dispose?.();
    mocks.disposes.forEach((dispose) => dispose());
    document.body.replaceChildren();
  });

  const renderTab = async() => {
    dispose = render(() => <ChatMembers />, container);
    await mocks.collected;
    return (mocks.tab.content as HTMLElement).querySelector<HTMLInputElement>('input[type="checkbox"]');
  };

  it('sends both directions after each value is confirmed', async() => {
    const input = await renderTab();

    input.checked = true;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(input.disabled).toBe(false));

    input.checked = false;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(mocks.toggleParticipantsHidden).toHaveBeenCalledTimes(2));

    expect(mocks.toggleParticipantsHidden.mock.calls).toEqual([
      [42, true],
      [42, false]
    ]);
  });

  it('rolls back to the last confirmed value when saving fails', async() => {
    participantsHidden = true;
    mocks.toggleParticipantsHidden.mockRejectedValueOnce(new Error('failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = await renderTab();

    input.checked = false;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(input.checked).toBe(true));

    expect(mocks.toggleParticipantsHidden).toHaveBeenCalledWith(42, false);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
