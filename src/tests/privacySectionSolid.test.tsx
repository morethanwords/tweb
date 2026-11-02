import {afterEach, beforeEach, describe, expect, it, Mock, vi} from 'vitest';

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
vi.mock('@components/solidJsTabs', () => ({AppAddMembersTab: class AppAddMembersTab {}}));
vi.mock('@components/toast', () => ({hideToast: vi.fn(), toastNew: vi.fn()}));
const phoneScreen = vi.hoisted(() => ({tab: undefined as any}));
vi.mock('@components/solidJsTabs/superTabProvider', () => ({useSuperTab: () => [phoneScreen.tab]}));
vi.mock('@components/solidJsTabs/promiseCollector', () => ({usePromiseCollector: () => ({collect: () => {}})}));
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

import {InputPrivacyRule, PrivacyRule} from '@layer';
import PrivacyType from '@appManagers/utils/privacy/privacyType';
import PrivacySection from '@components/privacySection';
import EventListenerBase from '@helpers/eventListenerBase';
import ListenerSetter from '@helpers/listenerSetter';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import pause from '@helpers/schedulers/pause';
import rootScope from '@lib/rootScope';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import type {AppAddMembersExtraCategory} from '@components/solidJsTabs/tabs';
import '@helpers/peerIdPolyfill';
import {createRoot} from 'solid-js';
import PrivacyPhoneNumber from '@components/sidebarLeft/tabs/privacy/phoneNumber';
import deferred from '@/tests/helpers/deferred';

registerHotReloadGuard({tabs: {AppAddMembersTab: class {}} as any});

// * what a section asks of its tab, let go after each test
const tabs: Array<{listenerSetter: ListenerSetter, middlewareHelper: MiddlewareHelper}> = [];
const fakeTab = () => {
  const tab = {eventListener: new EventListenerBase<any>(), listenerSetter: new ListenerSetter(), middlewareHelper: getMiddleware()};
  tabs.push(tab);
  return tab;
};

afterEach(() => {
  for(const {listenerSetter, middlewareHelper} of tabs.splice(0)) {
    listenerSetter.removeAll();
    middlewareHelper.destroy();
  }
  document.body.replaceChildren();
});

// * a type chosen the way a click on its radio chooses it
const chooseRadio = (container: HTMLElement, type: PrivacyType) => {
  const input = [...container.querySelectorAll('input')].find((input) => +input.value === type);
  input.checked = true;
  input.dispatchEvent(new Event('change'));
};

describe('PrivacySection Solid rows', () => {
  it('renders radio rows and keeps programmatic and user selection in sync', async() => {
    const onRadioChange = vi.fn();
    const section = new PrivacySection({
      tab: fakeTab() as any,
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

// * A privacy screen saved on its way out what it rebuilt from what it shows, changed or not - and so dropped what it
// * did not show: "Premium users" (which the other clients offer in the group invites' "Always allow"), mini apps where
// * the screen has no such exception, the exceptions of a screen without them
describe('PrivacySection saving', () => {
  const setPrivacy = rootScope.managers.appPrivacyManager.setPrivacy as Mock;

  const inputUser = (userId: number) => ({_: 'inputUser', user_id: userId, access_hash: '0'});
  const sorted = (rules: InputPrivacyRule[]) => rules.map((rule) => JSON.stringify(rule)).sort();

  type Picker = {
    takeOut: (peerIds: PeerId[], extras?: Set<string>) => void,
    selectedExtras: Set<string>,
    extraCategories: AppAddMembersExtraCategory[],
    extraCategoriesSectionLangKey?: string,
    peersSectionLangKey?: string
  };

  beforeEach(() => {
    setPrivacy.mockReset();
    (rootScope.managers.appUsersManager.getUserInput as Mock).mockImplementation(inputUser);
  });

  const open = async(
    rules: PrivacyRule[],
    options: {allowMiniApps?: boolean, allowPremium?: boolean, noExceptions?: boolean} = {}
  ) => {
    const tab = fakeTab();
    let picked: [PeerId[], Set<string>?];
    let picker: Picker;
    const section = new PrivacySection({
      tab: {
        ...tab,
        // * the picker, answering at once with what the test picks, if it picks
        slider: {createTab: () => ({open: (payload: Picker) => {
          picker = payload;
          if(picked) payload.takeOut(...picked);
        }})}
      } as any,
      title: 'WhoCanAddMe',
      inputKey: 'inputPrivacyKeyChatInvite',
      captions: ['PrivacySettingsController.Everbody', 'PrivacySettingsController.MyContacts', 'PrivacySettingsController.Nobody'],
      exceptionTexts: ['PrivacySettingsController.NeverAllow', 'PrivacySettingsController.AlwaysAllow'],
      managers: {appPrivacyManager: {getPrivacy: () => Promise.resolve(rules)}} as any,
      ...options
    });
    // * in the document, for the clicks Solid delegates to it
    document.body.append(section.radioSection.container, section.exceptionsSection?.container ?? '');
    await pause(0);

    const row = (key: 'allow' | 'disallow') => section.exceptionsSection.content.querySelectorAll<HTMLElement>('.row')[key === 'disallow' ? 0 : 1];
    return {
      // * what the picker offers besides peers, and what of it comes chosen
      offered: async(key: 'allow' | 'disallow') => {
        picked = undefined;
        row(key).click();
        await pause(0);
        return {
          categories: picker.extraCategories.map((category) => category.key),
          chosen: [...picker.selectedExtras],
          titles: [picker.extraCategoriesSectionLangKey, picker.peersSectionLangKey].filter(Boolean)
        };
      },
      subtitle: (key: 'allow' | 'disallow') => row(key).lastElementChild.textContent,
      choose: (type: PrivacyType) => chooseRadio(section.radioSection.content, type),
      pick: async(key: 'allow' | 'disallow', peerIds: PeerId[], extras?: string[]) => {
        picked = [peerIds, extras && new Set(extras)];
        row(key).click();
        await pause(0);
      },
      close: async() => {
        tab.eventListener.dispatchEvent('destroy');
        await pause(0);
        expect(setPrivacy.mock.calls.length).toBeLessThan(2);
        return setPrivacy.mock.calls[0] && sorted(setPrivacy.mock.calls[0][1]);
      }
    };
  };

  const rules: PrivacyRule[] = [
    {_: 'privacyValueAllowContacts'},
    {_: 'privacyValueAllowUsers', users: [1, 2]},
    {_: 'privacyValueDisallowChatParticipants', chats: [5]},
    {_: 'privacyValueAllowPremium'}
  ];

  it('sends nothing for a visit that changes nothing', async() => {
    expect(await (await open(rules)).close()).toBeUndefined();

    const screen = await open(rules);
    screen.choose(PrivacyType.Nobody);
    screen.choose(PrivacyType.Contacts);
    await screen.pick('allow', [2, 1] as PeerId[], ['premium']);
    expect(await screen.close()).toBeUndefined();
  });

  it('keeps "Premium users" with a change, on a screen that does not offer them', async() => {
    const screen = await open(rules);
    screen.choose(PrivacyType.Nobody);
    expect(await screen.close()).toEqual(sorted([
      {_: 'inputPrivacyValueDisallowAll'},
      {_: 'inputPrivacyValueAllowUsers', users: [inputUser(1), inputUser(2)] as any},
      {_: 'inputPrivacyValueAllowPremium'}
    ]));
  });

  it('lets "Everybody" cover "Premium users"', async() => {
    const screen = await open(rules);
    screen.choose(PrivacyType.Everybody);
    expect(await screen.close()).toEqual(sorted([
      {_: 'inputPrivacyValueAllowAll'},
      {_: 'inputPrivacyValueDisallowChatParticipants', chats: [5]}
    ]));
  });

  it('offers "Premium users" in "Always allow" where the screen allows them, elsewhere only while chosen', async() => {
    // * under titles of their own, apart from the peers
    const titles = ['PrivacyUserTypes', 'PrivacyUsersAndGroups'];
    let screen = await open([{_: 'privacyValueAllowContacts'}], {allowPremium: true});
    expect(await screen.offered('allow')).toEqual({categories: ['premium'], chosen: [], titles});
    expect(await screen.offered('disallow')).toEqual({categories: [], chosen: [], titles: []});

    screen = await open(rules);
    // * the labels as the mocked i18n gives them: "Premium users" ahead of the users' count
    expect(screen.subtitle('allow')).toBe('PrivacyPremium' + 'Users');
    expect(await screen.offered('allow')).toEqual({categories: ['premium'], chosen: ['premium'], titles});

    screen = await open([{_: 'privacyValueAllowContacts'}]);
    expect(await screen.offered('allow')).toEqual({categories: [], chosen: [], titles: []});
  });

  it('takes "Premium users" off as the picker leaves them', async() => {
    const screen = await open(rules);
    await screen.pick('allow', [1, 2] as PeerId[], []);
    expect(await screen.close()).toEqual(sorted([
      {_: 'inputPrivacyValueAllowContacts'},
      {_: 'inputPrivacyValueAllowUsers', users: [inputUser(1), inputUser(2)] as any},
      {_: 'inputPrivacyValueDisallowChatParticipants', chats: [5]}
    ]));
  });

  it('chooses "Premium users" ahead at "Everybody" where the screen offers them, for a switch away to take', async() => {
    const everybody: PrivacyRule[] = [{_: 'privacyValueAllowAll'}];
    expect(await (await open(everybody, {allowPremium: true})).close()).toBeUndefined();

    const screen = await open(everybody, {allowPremium: true});
    screen.choose(PrivacyType.Contacts);
    expect(screen.subtitle('allow')).toBe('PrivacyPremium');
    expect(await screen.close()).toEqual(sorted([{_: 'inputPrivacyValueAllowContacts'}, {_: 'inputPrivacyValueAllowPremium'}]));
  });

  it('sends back mini apps where the screen has no such exception, and edits them where it has', async() => {
    const miniApps: PrivacyRule[] = [{_: 'privacyValueAllowContacts'}, {_: 'privacyValueAllowBots'}];

    let screen = await open(miniApps);
    screen.choose(PrivacyType.Nobody);
    expect(await screen.close()).toEqual(sorted([{_: 'inputPrivacyValueDisallowAll'}, {_: 'inputPrivacyValueAllowBots'}]));

    setPrivacy.mockReset();
    screen = await open(miniApps, {allowMiniApps: true});
    screen.choose(PrivacyType.Nobody);
    expect(await screen.close()).toEqual(sorted([{_: 'inputPrivacyValueDisallowAll'}, {_: 'inputPrivacyValueAllowBots'}]));

    setPrivacy.mockReset();
    screen = await open(miniApps, {allowMiniApps: true});
    await screen.pick('allow', []);
    expect(await screen.close()).toEqual(sorted([{_: 'inputPrivacyValueAllowContacts'}]));
  });

  it('sends back the exceptions of a screen without them', async() => {
    const screen = await open([{_: 'privacyValueAllowContacts'}, {_: 'privacyValueDisallowUsers', users: [1]}], {noExceptions: true});
    screen.choose(PrivacyType.Everybody);
    expect(await screen.close()).toEqual(sorted([
      {_: 'inputPrivacyValueAllowAll'},
      {_: 'inputPrivacyValueDisallowUsers', users: [inputUser(1)] as any}
    ]));
  });
});

// * The phone number screen put "added by phone" back to "Everybody" whenever the phone number's section set its type -
// * as it loaded too: with the two sections' rules in the other order, "added by phone" showed and saved "Everybody"
describe('PrivacyPhoneNumber', () => {
  const setPrivacy = rootScope.managers.appPrivacyManager.setPrivacy as Mock;
  let dispose: () => void;

  afterEach(() => {
    dispose?.();
  });

  const open = async(phoneNumber: PrivacyRule[], addedByPhone: PrivacyRule[]) => {
    setPrivacy.mockReset();
    const tab = fakeTab();
    const rules = {
      inputPrivacyKeyPhoneNumber: deferred<PrivacyRule[]>(),
      inputPrivacyKeyAddedByPhone: deferred<PrivacyRule[]>()
    };
    const scrollable = document.createElement('div');
    document.body.append(scrollable);
    phoneScreen.tab = {
      container: document.createElement('div'),
      scrollable: {container: scrollable, append: (...elements: Node[]) => scrollable.append(...elements)},
      managers: {
        appUsersManager: {getSelf: () => Promise.resolve({phone: '0'})},
        appPrivacyManager: {getPrivacy: (key: keyof typeof rules) => rules[key].promise}
      },
      ...tab
    };
    createRoot((_dispose) => {
      dispose = _dispose;
      PrivacyPhoneNumber({});
    });
    await pause(0);

    // * "added by phone" first, the phone number after it
    rules.inputPrivacyKeyAddedByPhone.resolve(addedByPhone);
    await pause(0);
    rules.inputPrivacyKeyPhoneNumber.resolve(phoneNumber);
    await pause(0);

    const sections = ([...scrollable.children] as HTMLElement[]).slice(0, 2);
    return {
      // * the phone number's type, then "added by phone" (its exceptions follow)
      checked: () => sections.map((section) => section.querySelector<HTMLInputElement>('input:checked')?.value),
      choose: (type: PrivacyType) => chooseRadio(sections[0], type),
      close: async() => {
        tab.eventListener.dispatchEvent('destroy');
        await pause(0);
        // * by key: each section saves on its own
        return setPrivacy.mock.calls.map(([key, rules]) => [key, rules.map((rule: InputPrivacyRule) => rule._)]).sort();
      }
    };
  };

  it('keeps "added by phone" as the account has it when the phone number\'s rules come second', async() => {
    const screen = await open([{_: 'privacyValueDisallowAll'}], [{_: 'privacyValueAllowContacts'}]);
    expect(screen.checked()).toEqual([String(PrivacyType.Nobody), String(PrivacyType.Contacts)]);
    expect(await screen.close()).toEqual([]);
  });

  it('puts "added by phone" back to "Everybody" as the phone number\'s type changes', async() => {
    const screen = await open([{_: 'privacyValueDisallowAll'}], [{_: 'privacyValueAllowContacts'}]);
    screen.choose(PrivacyType.Contacts);
    expect(await screen.close()).toEqual([
      ['inputPrivacyKeyAddedByPhone', ['inputPrivacyValueAllowAll']],
      ['inputPrivacyKeyPhoneNumber', ['inputPrivacyValueAllowContacts']]
    ]);
  });
});
