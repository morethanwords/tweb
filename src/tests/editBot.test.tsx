import {render} from 'solid-js/web';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  collected: undefined as Promise<void> | undefined,
  setBotInfo: vi.fn(),
  tab: undefined as any
}));

vi.mock('@components/avatarEdit', () => ({
  default: class {
    public container = document.createElement('div');
    public clear = vi.fn();
  }
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: (): null => null
}));

vi.mock('@components/buttonTsx', () => {
  const makeButton = (props: any) => {
    const button = document.createElement(
      props.as === 'a' ? 'a' : 'button'
    );
    if(props.icon) {
      button.dataset.icon = props.icon;
    }
    if(props.disabled) {
      button.setAttribute('disabled', '');
    }
    props.ref?.(button);
    props.onClick && button.addEventListener('click', props.onClick);
    return button;
  };
  return {
    default: Object.assign(makeButton, {Corner: makeButton})
  };
});

vi.mock('@components/communities/editBotCommunitySection', () => ({
  default: (): null => null
}));

vi.mock('@components/inputFieldTsx', () => ({
  InputFieldTsx: (props: any) => {
    const input = document.createElement('input');
    input.dataset.name = props.name;
    input.value = props.value || '';
    input.addEventListener('input', () => props.onRawInput?.(input.value));
    return input;
  }
}));

vi.mock('@components/sidebarLeft/tabs/purchaseUsernameCaption', () => ({
  purchaseUsernameCaption: () => ({
    element: document.createElement('span'),
    setUsername: vi.fn()
  })
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

vi.mock('@components/toast', () => ({
  toastNew: vi.fn()
}));

vi.mock('@components/usernameInputFieldTsx', () => ({
  default: (props: any) => {
    const field = {
      error: undefined as ApiError | undefined,
      value: props.originalValue,
      isValidToChange: () => false
    };
    props.instanceRef?.(field);
    return document.createElement('input');
  }
}));

vi.mock('@components/usernamesSectionTsx', () => ({
  default: (): null => null
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

vi.mock('@lib/richTextProcessor/wrapUrl', () => ({
  default: (url: string) => ({url, onclick: 'openUrl'})
}));

import EditBot from '@components/sidebarRight/tabs/editBot';

describe('EditBot', () => {
  let container: HTMLDivElement;
  let dispose: VoidFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    const content = document.createElement('div');
    document.body.append(content);
    mocks.setBotInfo.mockResolvedValue(undefined);
    mocks.tab = {
      close: vi.fn(),
      container: document.createElement('div'),
      content,
      listenerSetter: {},
      managers: {
        apiManager: {
          getLimit: vi.fn().mockResolvedValue(70)
        },
        appCommunitiesManager: {
          getJoinedCommunities: vi.fn().mockResolvedValue([])
        },
        appProfileManager: {
          getBotInfo: vi.fn().mockResolvedValue({about: 'About'}),
          setBotInfo: mocks.setBotInfo,
          uploadProfilePhoto: vi.fn()
        },
        appUsersManager: {
          getUser: vi.fn().mockResolvedValue({
            _: 'user',
            id: 10 as UserId,
            pFlags: {bot: true},
            first_name: 'Bot',
            username: 'testbot'
          }),
          updateUsername: vi.fn()
        }
      },
      middlewareHelper: {
        get: () => (() => true)
      },
      payload: (10 as UserId).toPeerId(false),
      slider: {}
    };
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  it('renders reactively and saves changed bot info', async() => {
    dispose = render(() => <EditBot />, container);
    await mocks.collected;

    const firstName = container.querySelector<HTMLInputElement>(
      '[data-name="first-name"]'
    );
    firstName.value = 'Renamed Bot';
    firstName.dispatchEvent(new InputEvent('input', {bubbles: true}));

    await vi.waitFor(() => {
      expect(mocks.tab.content.querySelector('[data-icon="check"]'))
      .not.toBeNull();
    });
    (mocks.tab.content as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-icon="check"]'
    ).click();

    await vi.waitFor(() => {
      expect(mocks.setBotInfo).toHaveBeenCalledWith(
        10,
        'Renamed Bot',
        'About'
      );
      expect(mocks.tab.close).toHaveBeenCalledOnce();
    });
  });
});
