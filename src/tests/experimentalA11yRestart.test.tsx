import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import type {PopupConfirmationOptions} from '@components/confirmationPopup';
import pause from '@helpers/schedulers/pause';

// * the switch of the keyboard and screen-reader layer in Settings → Experimental asks about the restart itself,
// * instead of waiting for the check in the header (#746)

const STORAGE_KEY = 'experimental_flags';

const mocks = vi.hoisted(() => ({
  tab: undefined as any,
  save: undefined as {hasChanges: boolean, onClick: () => void},
  popups: [] as Array<{options: any, confirm: () => void, cancel: () => void}>,
  reloadEveryTab: vi.fn(),
  reload: vi.fn()
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

// * as the popup does it: the button is in the page by the time it shows, and the promise settles with the answer
vi.mock('@components/confirmationPopup', () => ({
  default: (options: PopupConfirmationOptions) => new Promise<void>((resolve, reject) => {
    const element = document.createElement('button');
    document.body.append(element);
    options.button.element = element;
    const cancelElement = document.createElement('button');
    document.body.append(cancelElement);
    if(options.cancelButton) options.cancelButton.element = cancelElement;
    options.onShow?.();
    const close = (settle: () => void) => () => {
      element.remove();
      cancelElement.remove();
      settle();
    };
    mocks.popups.push({options, confirm: close(resolve), cancel: close(reject)});
  })
}));

vi.mock('@components/mediaHeader', () => {
  const MediaHeader = (props: {children: JSX.Element}) => <div>{props.children}</div>;
  MediaHeader.Sticker = () => <div />;
  MediaHeader.Subtitle = (props: {children: JSX.Element}) => <div>{props.children}</div>;
  return {default: MediaHeader};
});

vi.mock('@components/section', () => ({
  default: (props: {name?: string, children: JSX.Element}) => <div class="section" data-name={props.name}>{props.children}</div>
}));

vi.mock('@components/rowTsx', () => {
  const Row = (props: {children: JSX.Element, clickable?: () => void}) => (
    <div class="row" onClick={() => props.clickable?.()}>{props.children}</div>
  );
  Row.Icon = () => <i />;
  Row.CheckboxFieldToggle = (props: {children: JSX.Element}) => <>{props.children}</>;
  Row.RadioField = (props: {children: JSX.Element}) => <>{props.children}</>;
  Row.Title = (props: {children: JSX.Element}) => <span class="row-title">{props.children}</span>;
  Row.Subtitle = (props: {children: JSX.Element}) => <span class="row-subtitle">{props.children}</span>;
  return {default: Row};
});

// * its props are read as they are asked for: every mount takes the modules anew (the flags are read as they load),
// * and what this file renders is of another copy of Solid than the tab's signals
vi.mock('@components/saveButton', () => ({
  default: (props: {hasChanges: boolean, onClick: () => void}) => {
    mocks.save = props;
    return <button class="save" />;
  }
}));

vi.mock('@components/popups/shareUrl', () => ({shareToPeers: vi.fn()}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@components/appNavigationController', () => ({default: {reload: mocks.reload}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {reloadEveryTab: mocks.reloadEveryTab}}));
vi.mock('@hooks/useIsConfirmationNeededOnClose', () => ({default: () => () => {}}));
vi.mock('@lib/debug/exportLogs', () => ({
  clearLogs: vi.fn(),
  createLogsFile: vi.fn(),
  downloadLogsFile: vi.fn(),
  setLogsCollected: vi.fn()
}));
vi.mock('@lib/debug/memoryWatch', () => ({
  isMemoryWatchOn: () => false,
  startMemoryWatch: vi.fn(),
  stopMemoryWatch: vi.fn()
}));
vi.mock('@lib/langPack', () => ({
  default: {forceRTL: vi.fn(), getLastAppliedLangCode: () => 'en', getIsRTL: () => false},
  i18n: (key: string) => key
}));
vi.mock('@stores/appSettings', () => ({
  useAppSettings: () => [{showPeerIds: false}, vi.fn()]
}));

async function mount(options: {kept?: string[], a11y?: boolean} = {}) {
  if(options.kept) localStorage.setItem(STORAGE_KEY, JSON.stringify(options.kept));
  vi.resetModules();
  const modes = await import('@config/modes');
  // * the layer of the running page, which the stored flag only becomes after a restart
  modes.default.a11y = !!options.a11y;
  const {default: ExperimentalTab} = await import('@components/sidebarLeft/tabs/experimental');

  mocks.tab = {header: document.createElement('div'), payload: {}, managers: {}};
  const root = document.createElement('div');
  document.body.append(mocks.tab.header, root);
  const dispose = render(() => <ExperimentalTab />, root);

  const rows = Array.from(root.querySelectorAll<HTMLElement>('.row'));
  const row = rows.find((row) => row.querySelector('.row-title')?.textContent === 'Experimental.A11y');
  const input = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const other = rows.find((row) => row.querySelector('.row-title')?.textContent === 'Experimental.Debug')
  .querySelector<HTMLInputElement>('input[type="checkbox"]');

  return {
    input,
    other,
    kept: () => [...modes.getKeptFlags()],
    hasChanges: () => mocks.save.hasChanges,
    dispose: () => {
      dispose();
      root.remove();
      mocks.tab.header.remove();
    }
  };
}

describe('Settings → Experimental: the keyboard and screen-reader switch', () => {
  let mounted: Awaited<ReturnType<typeof mount>>;

  beforeEach(() => {
    mocks.popups.length = 0;
    mocks.reloadEveryTab.mockClear();
    mocks.reload.mockClear();
  });

  afterEach(() => {
    mounted?.dispose();
    mounted = undefined;
    localStorage.removeItem(STORAGE_KEY);
  });

  it('asks about the restart as it is switched on, and the answer saves it and restarts every tab', async() => {
    mounted = await mount();
    expect(mounted.input.checked).toBe(false);

    mounted.input.click();
    expect(mocks.popups.length).toBe(1);
    expect(mocks.popups[0].options.titleLangKey).toBe('Experimental.Restart.Title');
    expect(mocks.popups[0].options.descriptionLangKey).toBe('Experimental.A11y.RestartOn');
    // * nothing is kept before the answer
    expect(mounted.kept()).toEqual([]);
    expect(mocks.reloadEveryTab).not.toHaveBeenCalled();

    mocks.popups[0].confirm();
    await pause(0);
    expect(mounted.kept()).toEqual(['a11y']);
    expect(mocks.reloadEveryTab).toHaveBeenCalledTimes(1);
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('a cancel puts the switch back, keeps nothing and leaves nothing to save', async() => {
    mounted = await mount();
    mounted.input.click();
    expect(mounted.input.checked).toBe(true);
    expect(mounted.hasChanges()).toBe(true);

    mocks.popups[0].cancel();
    await pause(0);
    expect(mounted.input.checked).toBe(false);
    expect(mounted.hasChanges()).toBe(false);
    expect(mounted.kept()).toEqual([]);
    expect(mocks.reloadEveryTab).not.toHaveBeenCalled();

    // * and asks again the next time
    mounted.input.click();
    expect(mocks.popups.length).toBe(2);
  });

  it('without the layer the dialog takes the focus, and a cancel hands it back to the switch', async() => {
    mounted = await mount();
    mounted.input.focus();
    mounted.input.click();
    await pause(0);
    expect(document.activeElement).toBe(mocks.popups[0].options.button.element);

    mocks.popups[0].cancel();
    await pause(0);
    expect(document.activeElement).toBe(mounted.input);
  });

  it('without the layer Enter on Cancel stays with Cancel: the shortcut of the popup, which confirms, never hears it', async() => {
    mounted = await mount();
    mounted.input.click();
    const {button, cancelButton} = mocks.popups[0].options;
    const heard: string[] = [];
    const onKeyDown = (e: KeyboardEvent) => heard.push(e.target === cancelButton.element ? 'cancel ' + e.key : 'restart ' + e.key);
    const press = (element: HTMLElement, key: string) =>
      element.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
    document.body.addEventListener('keydown', onKeyDown);
    try {
      press(cancelButton.element, 'Enter');
      press(cancelButton.element, 'Tab');
      press(button.element, 'Enter');
    } finally {
      document.body.removeEventListener('keydown', onKeyDown);
    }

    // * Tab on Cancel and Enter on Restart go on as they did
    expect(heard).toEqual(['cancel Tab', 'restart Enter']);
  });

  it('with the layer the focus is the popup\'s own to move', async() => {
    mounted = await mount({kept: ['a11y'], a11y: true});
    expect(mounted.input.checked).toBe(true);
    const focus = vi.spyOn(mounted.input, 'focus');

    mounted.input.click();
    await pause(0);
    expect(mocks.popups[0].options.descriptionLangKey).toBe('Experimental.A11y.RestartOff');
    expect(document.activeElement).not.toBe(mocks.popups[0].options.button.element);

    mocks.popups[0].cancel();
    await pause(0);
    expect(mounted.input.checked).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    expect(mounted.kept()).toEqual(['a11y']);
  });

  it('switched off, the answer drops the flag and restarts', async() => {
    mounted = await mount({kept: ['a11y'], a11y: true});
    mounted.input.click();
    mocks.popups[0].confirm();
    await pause(0);
    expect(mounted.kept()).toEqual([]);
    expect(mocks.reloadEveryTab).toHaveBeenCalledTimes(1);
    expect(mocks.reloadEveryTab.mock.calls[0][0]).toEqual(['a11y']);
  });

  it('with another switch held for the check in the header, the dialog speaks of every change it restarts with', async() => {
    mounted = await mount();
    mounted.other.click();
    mounted.input.click();
    expect(mocks.popups[0].options.descriptionLangKey).toBe('Experimental.Restart.EveryTab');

    mocks.popups[0].confirm();
    await pause(0);
    expect(mounted.kept().sort()).toEqual(['a11y', 'debug']);
  });

  it('the other restart switches still wait for the check in the header', async() => {
    mounted = await mount();
    mounted.other.click();
    expect(mocks.popups.length).toBe(0);
    expect(mounted.hasChanges()).toBe(true);
    expect(mounted.kept()).toEqual([]);
  });
});
