import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';
import ChatAutomationTab from '@components/sidebarLeft/tabs/chatAutomation';
import confirmationPopup from '@components/confirmationPopup';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import getTextWidth from '@helpers/canvas/getTextWidth';
import {ConnectedBot, User} from '@layer';

const mocks = vi.hoisted(() => ({
  tab: undefined as any,
  setInnerPeer: vi.fn(),
  saveButtonProps: undefined as any
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppAddMembersTab: class AppAddMembersTab {},
  AppChatAutomationTab: class AppChatAutomationTab {}
}));

vi.mock('@environment/webpSupport', () => ({
  default: false
}));

vi.mock('@components/checkboxField', () => ({
  default: class CheckboxField {
    public input: HTMLInputElement;
    public label: HTMLLabelElement;

    constructor(options: {
      text?: string,
      checked?: boolean,
      toggle?: boolean
    }) {
      this.label = document.createElement('label');
      this.label.classList.add('checkbox-field');
      this.input = document.createElement('input');
      this.input.type = 'checkbox';
      this.input.checked = !!options.checked;
      this.label.append(this.input);
      if(options.toggle) {
        const toggle = document.createElement('div');
        toggle.classList.add('checkbox-toggle');
        this.label.append(toggle);
      }
      if(options.text) {
        const caption = document.createElement('span');
        caption.textContent = options.text;
        this.label.append(caption);
      }
    }

    public get checked() {
      return this.input.checked;
    }

    public set checked(value: boolean) {
      this.setValueSilently(value);
      this.input.dispatchEvent(new Event('change', {bubbles: true}));
    }

    public setValueSilently(value: boolean) {
      this.input.checked = value;
    }
  }
}));

vi.mock('@components/row', () => ({
  default: class Row {
    public container = document.createElement('div');
    public titleRow: HTMLDivElement;
    public title: HTMLDivElement;
    public checkboxField: any;

    constructor(options: {
      titleLangKey?: string,
      checkboxField: any,
      clickable?: (event: MouseEvent) => void,
      rightContent?: HTMLElement
    }) {
      this.checkboxField = options.checkboxField;
      this.container.classList.add('row');
      if(options.titleLangKey) {
        this.titleRow = document.createElement('div');
        this.title = document.createElement('div');
        this.titleRow.classList.add('row-title-row');
        this.title.classList.add('row-title');
        this.title.textContent = options.titleLangKey;
        this.titleRow.append(this.title);
        this.container.append(this.titleRow);
      }
      this.container.append(this.checkboxField.label);
      if(options.rightContent) this.container.append(options.rightContent);
      if(options.clickable) this.container.addEventListener('click', options.clickable);
    }
  }
}));

vi.mock('@components/icon', () => ({
  default: (_icon: string, ...classNames: string[]) => {
    const element = document.createElement('span');
    element.classList.add(...classNames.filter(Boolean));
    return element;
  }
}));

vi.mock('@components/inputFieldTsx', async() => {
  const {createEffect} = await import('solid-js');

  return {
    InputFieldTsx: (props: {
      value?: string,
      onRawInput?: (value: string) => void,
      instanceRef?: (field: {input: HTMLInputElement}) => void
    }) => {
      const input = document.createElement('input');
      input.addEventListener('input', () => props.onRawInput?.(input.value));
      props.instanceRef?.({input});
      createEffect(() => {
        const value = props.value;
        if(value !== undefined && value !== input.value) {
          input.value = value;
          input.dispatchEvent(new InputEvent('input', {bubbles: true}));
        }
      });
      return input;
    }
  };
});

vi.mock('@components/rowTsx', async() => {
  const {insert} = await import('solid-js/web');
  const Container = (props: any) => {
    const element = document.createElement('div');
    if(props.class) element.className = props.class;
    if(props.role) element.setAttribute('role', props.role);
    if(props.tabIndex !== undefined) element.tabIndex = props.tabIndex;
    if(props.clickable) element.addEventListener('click', props.clickable);
    insert(element, () => props.children);
    return element;
  };
  const Row = Object.assign(Container, {
    CheckboxField: Container,
    Media: Container,
    RightContent: Container,
    Subtitle: Container,
    Title: Container
  });

  return {default: Row};
});

vi.mock('@lib/appDialogsManager', () => ({
  default: {
    createChatList: () => {
      const list = document.createElement('ul');
      list.classList.add('chatlist');
      return list;
    },
    addDialogNew: ({peerId}: {peerId: PeerId}) => {
      const container = document.createElement('a');
      container.classList.add('chatlist-chat');
      container.dataset.peerId = String(peerId);
      const lastMessageSpan = document.createElement('span');
      const titleRight = document.createElement('div');
      container.append(lastMessageSpan, titleRight);
      return {
        container,
        titleRight,
        dom: {lastMessageSpan},
        remove: () => container.remove()
      };
    }
  }
}));

vi.mock('@lib/appImManager', () => ({
  default: {
    setInnerPeer: mocks.setInnerPeer
  }
}));

vi.mock('@components/section', async() => {
  const {insert} = await import('solid-js/web');

  return {
    default: (props: any) => {
      const section = document.createElement('section');
      const marker = props['data-chat-automation-section'];
      if(marker) section.dataset.chatAutomationSection = marker;
      insert(section, () => props.children);
      return section;
    }
  };
});

vi.mock('@components/buttonTsx', () => {
  const makeButton = (props: any) => {
    const button = document.createElement('button');
    if(props.class) button.className = props.class;
    if(props.text) button.dataset.langKey = props.text;
    if(props.onClick) button.addEventListener('click', props.onClick);
    return button;
  };

  return {default: Object.assign(makeButton, {Icon: makeButton})};
});

vi.mock('@helpers/canvas/getTextWidth', () => ({
  default: vi.fn((text: string) => text.length * 10)
}));

vi.mock('@components/button', () => ({
  default: (className: string, options: {text?: string}) => {
    const button = document.createElement('button');
    button.className = className;
    if(options.text) {
      button.dataset.langKey = options.text;
      button.textContent = options.text;
    }
    return button;
  }
}));

vi.mock('@components/iconTsx', () => ({
  IconTsx: () => document.createElement('span')
}));

vi.mock('@components/staticRadio', () => ({
  default: () => document.createElement('span')
}));

vi.mock('@components/staticSwitch', () => ({
  default: () => document.createElement('span')
}));

vi.mock('@components/staticCheckbox', () => ({
  StaticCheckbox: () => document.createElement('span')
}));

vi.mock('@components/toast', () => ({
  toastNew: vi.fn()
}));

vi.mock('@components/confirmationPopup', () => ({
  default: vi.fn()
}));

vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({confirmationPopup: vi.fn()})
}));

vi.mock('@components/mediaHeader', () => {
  const Container = (props: {children?: any}) => props.children;
  const MediaHeader = Object.assign(Container, {
    Sticker: (): null => null,
    Title: Container,
    Subtitle: Container
  });

  return {default: MediaHeader};
});

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => document.createElement('span')
}));

vi.mock('@components/peerTitleTsx', () => ({
  PeerTitleTsx: () => document.createTextNode('automation_bot')
}));

vi.mock('@components/peerTitle', () => ({
  default: class PeerTitle {
    public element = document.createElement('span');
  }
}));

vi.mock('@components/saveButton', () => ({
  default: (props: any): null => {
    mocks.saveButtonProps = props;
    return null;
  }
}));

vi.mock('@components/putPreloader', () => ({
  PreloaderTsx: (): null => null
}));

function makeConnectedBot(
  recipients: ConnectedBot.connectedBot['recipients'] = {
    _: 'businessBotRecipients',
    pFlags: {exclude_selected: true}
  }
): ConnectedBot.connectedBot {
  return {
    _: 'connectedBot',
    bot_id: 42,
    recipients,
    rights: {
      _: 'businessBotRights',
      pFlags: {reply: true, read_messages: true}
    },
    date: 1_000,
    device: 'Chrome',
    location: 'Dubai'
  };
}

let dispose: () => void;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  mocks.saveButtonProps = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ChatAutomationTab bot input', () => {
  it('hides the input for a connected bot and restores search after removal', async() => {
    let resolveUser: (user: User.user) => void;
    const userPromise = new Promise<User.user>((resolve) => resolveUser = resolve);
    const getUser = vi.fn(() => userPromise);
    const searchBusinessBots = vi.fn().mockResolvedValue({
      userIds: [77],
      unsupportedUserId: undefined
    });
    const header = document.createElement('div');
    const container = document.createElement('div');
    document.body.append(header, container);
    mocks.tab = {
      payload: {connectedBot: makeConnectedBot()},
      header,
      listenerSetter: {
        add: (target: EventTarget) => (type: string, listener: EventListener) => {
          target.addEventListener(type, listener);
        }
      },
      middlewareHelper: {get: vi.fn()},
      managers: {
        appUsersManager: {getUser},
        appBusinessManager: {
          searchBusinessBots,
          updateConnectedBot: vi.fn()
        }
      },
      slider: {createTab: vi.fn()},
      close: vi.fn()
    };

    dispose = render(() => <ChatAutomationTab />, container);
    expect(container.querySelector('[data-chat-automation-section="bot"] input')).toBeFalsy();

    resolveUser({
      _: 'user',
      pFlags: {},
      id: 42,
      access_hash: 'hash',
      first_name: 'Automation',
      username: 'automation_bot',
      status: {_: 'userStatusEmpty'}
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    expect(searchBusinessBots).not.toHaveBeenCalled();
    expect(container.querySelector('[data-chat-automation-section="permissions"]')).toBeTruthy();
    expect(container.querySelector('[data-chat-automation-section="permissions"] .accordion')).toBeTruthy();
    const permissionTitles = [
      ...container.querySelectorAll('[data-chat-automation-section="permissions"] .accordion-row .row-title')
    ];
    expect(permissionTitles.length).toBeGreaterThan(0);
    expect(permissionTitles.every((title) => title.classList.contains('pre-wrap'))).toBe(true);
    const connectedDialog = container.querySelector<HTMLElement>(
      '[data-chat-automation-section="bot"] .chatlist-chat'
    );
    expect(connectedDialog).toBeTruthy();
    simulateClickEvent(connectedDialog);
    expect(mocks.setInnerPeer).toHaveBeenCalledWith({peerId: (42).toPeerId(false)});
    mocks.setInnerPeer.mockClear();
    const removeButton = container.querySelector<HTMLButtonElement>('[data-lang-key="ChatAutomation.RemoveBot"]');
    const sections = container.querySelectorAll('section');
    expect(removeButton).toBeTruthy();
    expect(sections[sections.length - 1].contains(removeButton)).toBe(true);

    removeButton.click();
    const input = container.querySelector<HTMLInputElement>('[data-chat-automation-section="bot"] input');
    expect(input).toBeTruthy();
    expect(input.value).toBe('');
    expect(container.querySelector('[data-chat-automation-section="bot"] .chatlist-chat')).toBeFalsy();
    expect(container.querySelector('[data-chat-automation-section="permissions"]')).toBeFalsy();

    input.value = 'other_bot';
    input.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText'}));
    expect(container.querySelector('[data-chat-automation-section="permissions"]')).toBeFalsy();

    await vi.advanceTimersByTimeAsync(400);
    expect(searchBusinessBots).toHaveBeenCalledWith('other_bot');
    const addButton = container.querySelector<HTMLButtonElement>('[data-lang-key="Add"]');
    expect(addButton).toBeTruthy();
    expect(addButton.classList).toContain('btn-primary');
    expect(addButton.classList).toContain('btn-color-primary');
    expect(addButton.classList).toContain('btn-control-small');
    expect(addButton.parentElement.classList).toContain('chatlist-chat');
    expect(getTextWidth).toHaveBeenCalledWith('Add', expect.any(String));
    expect(addButton.parentElement.style.paddingInlineEnd).toBe('78px');
    expect(addButton.style.pointerEvents).toBe('all');

    simulateClickEvent(addButton);
    expect(mocks.setInnerPeer).not.toHaveBeenCalled();
    expect(container.querySelector('[data-chat-automation-section="bot"] input')).toBeFalsy();
    expect(container.querySelector('[data-chat-automation-section="bot"] .chatlist-chat')).toBeTruthy();
    expect(container.querySelector('[data-chat-automation-section="permissions"]')).toBeTruthy();
  });

  it('uses localized recipient kinds instead of generic item counts', () => {
    const header = document.createElement('div');
    const container = document.createElement('div');
    document.body.append(header, container);
    mocks.tab = {
      payload: {
        connectedBot: makeConnectedBot({
          _: 'businessBotRecipients',
          pFlags: {},
          users: [11, 12],
          exclude_users: [13]
        })
      },
      header,
      listenerSetter: {
        add: (target: EventTarget) => (type: string, listener: EventListener) => {
          target.addEventListener(type, listener);
        }
      },
      middlewareHelper: {get: vi.fn()},
      managers: {
        appUsersManager: {
          getUser: vi.fn().mockResolvedValue({
            _: 'user',
            pFlags: {},
            id: 42,
            access_hash: 'hash',
            first_name: 'Automation',
            username: 'automation_bot'
          })
        },
        appBusinessManager: {
          searchBusinessBots: vi.fn(),
          updateConnectedBot: vi.fn()
        }
      },
      slider: {createTab: vi.fn()},
      close: vi.fn()
    };

    dispose = render(() => <ChatAutomationTab />, container);

    const included = container.querySelector<HTMLElement>('[data-chat-automation-section="included-chats"]');
    const excluded = container.querySelector<HTMLElement>('[data-chat-automation-section="excluded-chats"]');
    expect(included.textContent).toContain('Users');
    expect(excluded.textContent).toContain('Users');
    expect(container.textContent).not.toContain('ChatAutomation.SelectedCount');
  });

  it('applies grouped permissions atomically and keeps fixed permissions enabled', async() => {
    const connectedBot = makeConnectedBot();
    Object.assign(connectedBot.rights.pFlags, {
      delete_sent_messages: true,
      delete_received_messages: true
    });
    const header = document.createElement('div');
    const container = document.createElement('div');
    document.body.append(header, container);
    mocks.tab = {
      payload: {connectedBot},
      header,
      listenerSetter: {
        add: (target: EventTarget) => (type: string, listener: EventListener) => {
          target.addEventListener(type, listener);
        }
      },
      middlewareHelper: {get: vi.fn()},
      managers: {
        appUsersManager: {
          getUser: vi.fn().mockResolvedValue({
            _: 'user',
            pFlags: {},
            id: 42,
            access_hash: 'hash',
            first_name: 'Automation',
            username: 'automation_bot'
          })
        },
        appBusinessManager: {
          searchBusinessBots: vi.fn(),
          updateConnectedBot: vi.fn()
        }
      },
      slider: {createTab: vi.fn()},
      close: vi.fn()
    };
    vi.mocked(confirmationPopup).mockRejectedValue(new Error('cancelled'));

    dispose = render(() => <ChatAutomationTab />, container);

    const groups = container.querySelectorAll<HTMLElement>('.accordion-toggler');
    const messagesGroup = [...groups].find((element) => element.textContent.includes('ManageMessages'));
    const messagesAccordion = messagesGroup.nextElementSibling as HTMLElement;
    expect(messagesGroup.querySelector<HTMLInputElement>('input').checked).toBe(true);
    messagesGroup.querySelector('label').lastElementChild.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    await vi.advanceTimersByTimeAsync(0);

    expect([...messagesAccordion.querySelectorAll<HTMLInputElement>('input')].map((input) => input.checked)).toEqual([
      true,
      false,
      false,
      false,
      false
    ]);
    expect(messagesGroup.textContent).toContain('1/5');

    const giftsGroup = [...groups].find((element) => element.textContent.includes('ManageGifts'));
    const giftsAccordion = giftsGroup.nextElementSibling as HTMLElement;
    giftsGroup.querySelector('label').lastElementChild.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    await vi.advanceTimersByTimeAsync(0);

    expect(confirmationPopup).toHaveBeenCalledTimes(1);
    expect(confirmationPopup).toHaveBeenCalledWith(expect.objectContaining({
      descriptionLangKey: 'ChatAutomation.GiftsAndStarsWarning'
    }));
    expect([...giftsAccordion.querySelectorAll<HTMLInputElement>('input')].every((input) => !input.checked)).toBe(true);
    expect(giftsGroup.textContent).toContain('0/5');

    vi.mocked(confirmationPopup).mockResolvedValue(undefined);
    giftsGroup.querySelector('label').lastElementChild.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    await vi.advanceTimersByTimeAsync(0);

    expect(confirmationPopup).toHaveBeenCalledTimes(2);
    expect([...giftsAccordion.querySelectorAll<HTMLInputElement>('input')].every((input) => input.checked)).toBe(true);
    expect(giftsGroup.textContent).toContain('5/5');
  });

  it('keeps edits made during a save dirty and saves them in a follow-up request', async() => {
    let resolveFirstSave: () => void;
    const firstSave = new Promise<void>((resolve) => resolveFirstSave = resolve);
    const updateConnectedBot = vi.fn()
    .mockImplementationOnce(() => firstSave)
    .mockResolvedValue(undefined);
    const header = document.createElement('div');
    const container = document.createElement('div');
    document.body.append(header, container);
    mocks.tab = {
      payload: {connectedBot: makeConnectedBot()},
      header,
      listenerSetter: {
        add: (target: EventTarget) => (type: string, listener: EventListener) => {
          target.addEventListener(type, listener);
        }
      },
      middlewareHelper: {get: vi.fn()},
      managers: {
        appUsersManager: {
          getUser: vi.fn().mockResolvedValue({
            _: 'user',
            pFlags: {},
            id: 42,
            access_hash: 'hash',
            first_name: 'Automation',
            username: 'automation_bot'
          })
        },
        appBusinessManager: {
          searchBusinessBots: vi.fn(),
          updateConnectedBot
        }
      },
      slider: {createTab: vi.fn()},
      close: vi.fn()
    };

    dispose = render(() => <ChatAutomationTab />, container);

    const groups = container.querySelectorAll<HTMLElement>('.accordion-toggler');
    const messagesGroup = [...groups].find((element) => element.textContent.includes('ManageMessages'));
    const messagesAccordion = messagesGroup.nextElementSibling as HTMLElement;
    const inputs = messagesAccordion.querySelectorAll<HTMLInputElement>('input');

    inputs[3].click();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.saveButtonProps.hasChanges).toBe(true);

    mocks.saveButtonProps.onClick();
    expect(updateConnectedBot).toHaveBeenCalledTimes(1);
    expect(updateConnectedBot).toHaveBeenNthCalledWith(1, expect.objectContaining({
      previousBotId: 42,
      rights: expect.objectContaining({
        pFlags: expect.objectContaining({delete_sent_messages: true})
      })
    }));

    inputs[4].click();
    await vi.advanceTimersByTimeAsync(0);
    const closeWhileSaving = mocks.tab.isConfirmationNeededOnClose();
    resolveFirstSave();
    await expect(closeWhileSaving).rejects.toThrow('CHAT_AUTOMATION_CHANGED_DURING_SAVE');
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.tab.close).not.toHaveBeenCalled();
    expect(mocks.saveButtonProps.hasChanges).toBe(true);
    expect(mocks.tab.isConfirmationNeededOnClose).toEqual(expect.any(Function));

    mocks.saveButtonProps.onClick();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(updateConnectedBot).toHaveBeenCalledTimes(2);
    expect(updateConnectedBot).toHaveBeenNthCalledWith(2, expect.objectContaining({
      previousBotId: 42,
      rights: expect.objectContaining({
        pFlags: expect.objectContaining({
          delete_sent_messages: true,
          delete_received_messages: true
        })
      })
    }));
    expect(mocks.tab.close).toHaveBeenCalledTimes(1);
  });
});
