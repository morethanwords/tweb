import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@components/popups/premium', () => ({default: {show: vi.fn()}}));
vi.mock('@components/radioFieldTsx', () => ({
  default: (props: any) => (
    <span>
      <input
        checked={props.checked}
        name={props.name}
        type="radio"
        value={props.value}
        onChange={(event) => props.onChange?.(event.currentTarget.checked, event)}
      />
    </span>
  )
}));
vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => (
    <div class="row" classList={props.classList} onClick={props.clickable}>{props.children}</div>
  );
  Row.Icon = (): null => null;
  Row.RadioField = (props: any) => props.children;
  Row.Subtitle = (props: any) => <div>{props.children}</div>;
  Row.Title = (props: any) => <div>{props.children}</div>;
  return {default: Row};
});
vi.mock('@components/settingSection', () => ({
  default: class SettingSection {
    public caption = document.createElement('div');
    public container = document.createElement('div');
    public content = document.createElement('div');

    constructor() {
      this.container.append(this.content, this.caption);
    }
  }
}));
vi.mock('@components/solidJsTabs', () => ({AppAddMembersTab: class AppAddMembersTab {}}));
vi.mock('@components/toast', () => ({hideToast: vi.fn(), toastNew: vi.fn()}));
vi.mock('@lib/rootScope', () => ({
  default: {
    addEventListener: vi.fn(),
    managers: {
      appPrivacyManager: {setPrivacy: vi.fn()},
      appUsersManager: {getUserInput: vi.fn()}
    },
    premium: false
  }
}));
vi.mock('@lib/langPack', () => {
  const i18n = (key: string) => {
    const element = document.createElement('span');
    element.textContent = key;
    return element;
  };

  return {
    _i18n: (element: HTMLElement, key: string) => element.replaceChildren(i18n(key)),
    i18n,
    i18n_: ({element, key}: {element: HTMLElement, key: string}) => element.replaceChildren(i18n(key)),
    join: (items: HTMLElement[]) => items
  };
});

import PrivacyType from '@appManagers/utils/privacy/privacyType';
import PrivacySection from '@components/privacySection';
import EventListenerBase from '@helpers/eventListenerBase';
import ListenerSetter from '@helpers/listenerSetter';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';

describe('PrivacySection Solid rows', () => {
  let listenerSetter: ListenerSetter;
  let middlewareHelper: MiddlewareHelper;

  afterEach(() => {
    listenerSetter?.removeAll();
    middlewareHelper?.destroy();
  });

  it('renders radio rows and keeps programmatic and user selection in sync', async() => {
    listenerSetter = new ListenerSetter();
    middlewareHelper = getMiddleware();
    const onRadioChange = vi.fn();
    const eventListener = new EventListenerBase<any>();
    const section = new PrivacySection({
      tab: {
        eventListener,
        listenerSetter,
        middlewareHelper
      } as any,
      title: 'PrivacyTitle',
      captions: ['PrivacySettingsController.Everbody', 'PrivacySettingsController.MyContacts', 'PrivacySettingsController.Nobody'],
      noExceptions: true,
      onRadioChange,
      managers: {
        appPrivacyManager: {}
      } as any,
      privacyType: PrivacyType.Contacts
    });

    await Promise.resolve();

    const inputs = [...section.radioSection.content.querySelectorAll('input')] as HTMLInputElement[];
    expect(inputs).toHaveLength(3);
    expect(inputs[1].checked).toBe(true);
    expect(section.type).toBe(PrivacyType.Contacts);

    inputs[2].checked = true;
    inputs[2].dispatchEvent(new Event('change'));
    expect(section.type).toBe(PrivacyType.Nobody);
    expect(onRadioChange).toHaveBeenLastCalledWith(PrivacyType.Nobody);

    section.setRadio(PrivacyType.Everybody);
    expect(inputs[0].checked).toBe(true);
    expect(section.type).toBe(PrivacyType.Everybody);
  });
});
