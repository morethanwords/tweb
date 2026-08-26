import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import {unwrap} from 'solid-js/store';
import copy from '@helpers/object/copy';
import {SETTINGS_INIT} from '@config/state';

const mocks = vi.hoisted(() => ({
  appSettings: undefined as any,
  confirmationPopup: vi.fn(() => Promise.resolve()),
  setAppSettings: undefined as any,
  tab: {
    eventListener: {addEventListener: vi.fn()},
    slider: {createTab: vi.fn(() => ({open: vi.fn()}))}
  }
}));

vi.mock('@stores/appSettings', async() => {
  const {createStore} = await import('solid-js/store');
  const [appSettings, setAppSettings] = createStore({
    autoDownload: {
      photo: {},
      video: {},
      file: {}
    },
    autoDownloadNew: {
      pFlags: {},
      file_size_max: 0
    }
  } as any);
  mocks.appSettings = appSettings;
  mocks.setAppSettings = setAppSettings;

  return {
    useAppSettings: () => [appSettings, setAppSettings]
  };
});

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppAutoDownloadFileTab: class AppAutoDownloadFileTab {},
  AppAutoDownloadPhotoTab: class AppAutoDownloadPhotoTab {},
  AppAutoDownloadVideoTab: class AppAutoDownloadVideoTab {},
  AppDataAndStorageTab: class AppDataAndStorageTab {}
}));

vi.mock('@components/confirmationPopup', () => ({
  default: mocks.confirmationPopup
}));

vi.mock('@environment/webpSupport', () => ({
  default: false
}));

vi.mock('@components/checkboxField', () => ({
  default: class CheckboxField {
    public input = document.createElement('input');
    public label = document.createElement('label');

    constructor(options: {checked?: boolean} = {}) {
      this.input.type = 'checkbox';
      this.input.checked = !!options.checked;
      this.label.append(this.input);
    }

    public setValueSilently(checked: boolean) {
      this.input.checked = checked;
    }

    public setToggleLockIcon() {}

    public toggleDisability(disabled: boolean) {
      this.input.disabled = disabled;
    }
  }
}));

vi.mock('@components/section', async() => {
  const {insert} = await import('solid-js/web');

  return {
    default: (props: any) => {
      const section = document.createElement('section');
      section.dataset.name = props.name || '';
      insert(section, () => props.children);
      return section;
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
    if(props.clickable) {
      element.addEventListener('click', props.clickable);
    }
    insert(element, () => props.children);
    return element;
  }, {
    CheckboxFieldToggle: (props: any) => part(props, 'row-checkbox-field-toggle'),
    Subtitle: (props: any) => part(props, 'row-subtitle'),
    Title: (props: any) => part(props, 'row-title')
  });

  return {default: Row};
});

vi.mock('@components/buttonTsx', async() => {
  const {createEffect} = await import('solid-js');

  return {
    default: (props: any) => {
      const button = document.createElement('button');
      button.dataset.text = props.text;
      createEffect(() => button.disabled = !!props.disabled);
      button.addEventListener('click', () => props.onClick?.());
      return button;
    }
  };
});

vi.mock('@components/sidebarLeft/tabs/dataAndStorage/storageQuota', () => ({
  StorageQuota: (props: any): null => {
    props.controlsRef?.({save: vi.fn()});
    return null;
  }
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key),
  join: (parts: Node[]) => parts
}));

import DataAndStorage from '@components/sidebarLeft/tabs/dataAndStorage';

describe('DataAndStorage automatic download state', () => {
  let container: HTMLDivElement;
  let dispose: VoidFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setAppSettings('autoDownload', copy(SETTINGS_INIT.autoDownload));
    mocks.setAppSettings('autoDownloadNew', copy(SETTINGS_INIT.autoDownloadNew));
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  it('uses appSettings as the single source for the toggle and dependent rows', () => {
    dispose = render(() => <DataAndStorage />, container);

    const input = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const rows = [...container.querySelectorAll('.row')];
    expect(input.checked).toBe(true);
    expect(rows.slice(1, 4).every((row) => !row.classList.contains('is-disabled'))).toBe(true);

    mocks.setAppSettings('autoDownloadNew', 'pFlags', 'disabled', true);
    expect(input.checked).toBe(false);
    expect(rows.slice(1, 4).every((row) => row.classList.contains('is-disabled'))).toBe(true);

    input.checked = true;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    expect(mocks.appSettings.autoDownloadNew.pFlags.disabled).toBeUndefined();
    expect(rows.slice(1, 4).every((row) => !row.classList.contains('is-disabled'))).toBe(true);
  });

  it('reacts to reset without manually synchronizing a local signal', async() => {
    dispose = render(() => <DataAndStorage />, container);
    mocks.setAppSettings('autoDownloadNew', 'pFlags', 'disabled', true);
    mocks.setAppSettings('autoDownload', 'photo', 'contacts', false);

    container.querySelector<HTMLButtonElement>('[data-text="ResetAutomaticMediaDownload"]').click();
    await vi.waitFor(() => expect(mocks.confirmationPopup).toHaveBeenCalledOnce());

    expect(unwrap(mocks.appSettings.autoDownload)).toEqual(SETTINGS_INIT.autoDownload);
    expect(unwrap(mocks.appSettings.autoDownloadNew)).toEqual(SETTINGS_INIT.autoDownloadNew);
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]').checked)
    .toBe(!SETTINGS_INIT.autoDownloadNew.pFlags.disabled);
  });
});
