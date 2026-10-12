import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import {JSX, Show} from 'solid-js';
import {BusinessWorkHours} from '@layer';

const mocks = vi.hoisted(() => ({
  tab: undefined as any,
  confirmationPopup: vi.fn()
}));

vi.mock('@lib/apiManagerProxy', () => ({default: {getState: vi.fn()}}));
vi.mock('@lib/rootScope', () => ({default: {managers: {}}}));
vi.mock('@components/icon', () => ({default: () => document.createElement('span')}));
vi.mock('@components/ripple', () => ({
  default: () => ({dispose: vi.fn(), element: document.createElement('div')})
}));
vi.mock('@helpers/dom/createContextMenu', () => ({default: () => ({open: vi.fn()})}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({useSuperTab: () => [mocks.tab]}));
vi.mock('@components/solidJsTabs/promiseCollector', () => ({usePromiseCollector: () => ({collect: () => {}})}));
vi.mock('@components/solidJsTabs/tabs', () => ({
  AppBusinessHoursDayTab: class AppBusinessHoursDayTab {},
  AppTimezoneTab: class AppTimezoneTab {}
}));
vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({confirmationPopup: mocks.confirmationPopup})
}));

vi.mock('@components/mediaHeader', () => {
  const MediaHeader = (props: {children: JSX.Element}) => <div>{props.children}</div>;
  MediaHeader.Sticker = () => <div />;
  MediaHeader.Title = (props: {children: JSX.Element}) => <div>{props.children}</div>;
  MediaHeader.Subtitle = (props: {children: JSX.Element}) => <div>{props.children}</div>;
  return {default: MediaHeader};
});
vi.mock('@components/section', () => ({
  default: (props: {children: JSX.Element}) => <div class="section">{props.children}</div>
}));
vi.mock('@components/saveButton', () => ({
  default: (props: {hasChanges: boolean, onClick: () => void}) => (
    <Show when={props.hasChanges}>
      <button class="save-button" onClick={props.onClick} />
    </Show>
  )
}));
vi.mock('@helpers/solid/animations', () => ({
  GrowHeightReveal: (props: {when: any, children: JSX.Element}) => <Show when={props.when}>{props.children}</Show>
}));

vi.mock('@lib/langPack', () => {
  const format = (key: string) => key;
  return {
    default: {format, getDateTimeFormat: (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en', options)},
    i18n: (key: string) => document.createTextNode(key)
  };
});

import BusinessHoursTab from '@components/sidebarLeft/tabs/businessHours';
import '@/tests/helpers/a11yLayer';

const DAY = 24 * 60;

// Monday to Friday, open all day
const workHours: BusinessWorkHours.businessWorkHours = {
  _: 'businessWorkHours',
  pFlags: {},
  timezone_id: 'Asia/Dubai',
  weekly_open: Array.from({length: 5}, (_, day) => ({
    _: 'businessWeeklyOpen',
    start_minute: day * DAY,
    end_minute: (day + 1) * DAY - 1
  }))
};

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('Business Hours tab', () => {
  let dispose: VoidFunction;
  let header: HTMLElement;
  let updateBusinessWorkHours: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateBusinessWorkHours = vi.fn(async() => {});
    mocks.confirmationPopup.mockReset();
    header = document.createElement('div');
    mocks.tab = {
      payload: {
        userFull: {business_work_hours: workHours},
        timezones: [{_: 'timezone', id: 'Asia/Dubai', name: 'Dubai', utc_offset: 4 * 3600}]
      },
      header,
      slider: {createTab: vi.fn()},
      managers: {appBusinessManager: {updateBusinessWorkHours}},
      close: vi.fn()
    };
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  const mount = async() => {
    document.body.append(header); // Solid's delegated clicks are heard on the document
    dispose = render(() => <BusinessHoursTab />, document.body);
    await flush();
  };

  const dayToggle = (name: string) => {
    const row = Array.from(document.querySelectorAll('.row')).find((element) => element.textContent.startsWith(name));
    return row.querySelector<HTMLInputElement>('input');
  };

  it('can be saved once a day is switched on from its row, and sends that day', async() => {
    await mount();
    expect(header.querySelector('.save-button')).toBeNull();

    dayToggle('Saturday').click();
    await flush();

    const save = header.querySelector<HTMLButtonElement>('.save-button');
    expect(save).not.toBeNull();
    save.click();
    await flush();

    expect(updateBusinessWorkHours).toHaveBeenCalledOnce();
    const sent = updateBusinessWorkHours.mock.calls[0][0] as BusinessWorkHours.businessWorkHours;
    expect(sent.weekly_open[sent.weekly_open.length - 1]).toMatchObject({start_minute: 5 * DAY, end_minute: 6 * DAY - 1});
    expect(mocks.tab.close).toHaveBeenCalledOnce();
  });

  it('asks before leaving with a day changed', async() => {
    await mount();
    mocks.confirmationPopup.mockRejectedValue('canceled'); // "Discard"

    expect(await mocks.tab.isConfirmationNeededOnClose()).toBeUndefined();
    expect(mocks.confirmationPopup).not.toHaveBeenCalled();

    dayToggle('Monday').click();
    await flush();
    await mocks.tab.isConfirmationNeededOnClose();
    expect(mocks.confirmationPopup).toHaveBeenCalledOnce();
    expect(updateBusinessWorkHours).not.toHaveBeenCalled();
  });
});
