import {createEffect} from 'solid-js';
import {render} from 'solid-js/web';
import {afterEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  copyText: vi.fn(),
  observeResize: vi.fn((element: Element, callback: (value: {size: {height: number, width: number}}) => void) => {
    callback({size: {height: 54, width: 100}});
  })
}));

vi.mock('@helpers/openingHours', () => ({
  default: {
    adaptWeeklyOpen: (weeklyOpen: unknown) => weeklyOpen,
    getDaysHours: () => Array.from({length: 7}, (_, day) => [{toString: () => `${day}:00`}, {toString: () => `${day}:30`}]),
    is24x7: () => false,
    isFull: () => false,
    isOpenNow: () => ({openNow: true, nowPeriodTime: 0, nowWeekday: 0})
  }
}));

vi.mock('@helpers/date', () => ({
  getWeekDays: () => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ONE_DAY_MINUTES: 1440,
  ONE_WEEK_MINUTES: 10080
}));

vi.mock('@hooks/useResizeObserver', () => ({
  useResizeObserver: () => mocks.observeResize
}));

vi.mock('@helpers/clipboard', () => ({
  copyTextToClipboard: mocks.copyText
}));

vi.mock('@components/toast', () => ({
  toastNew: vi.fn()
}));

vi.mock('@lib/langPack', () => ({
  default: {format: (key: string) => key},
  i18n: (key: string) => key
}));

vi.mock('@helpers/solid/animations', () => ({
  default: (props: {children: unknown}) => props.children
}));

vi.mock('@components/rowTsx', async() => {
  const {insert} = await import('solid-js/web');
  const part = (props: any, className: string) => {
    const element = document.createElement('div');
    element.classList.add(className);
    createEffect(() => {
      const classValue = props.class;
      element.classList.toggle('green', classValue === 'green');
      element.classList.toggle('danger', classValue === 'danger');
    });
    insert(element, () => props.children);
    if(props.titleRight !== undefined) insert(element, () => props.titleRight);
    if(props.subtitleRight !== undefined) {
      const right = document.createElement('span');
      right.classList.add('row-subtitle-right');
      insert(right, () => props.subtitleRight);
      element.append(right);
    }
    return element;
  };
  const Row = Object.assign((props: any) => {
    const element = document.createElement('div');
    element.classList.add('row', props.class);
    createEffect(() => {
      element.classList.toggle('is-expanded', !!props.classList?.['is-expanded']);
      element.style.paddingBottom = props.style?.['padding-bottom'] || '';
    });
    element.addEventListener('click', () => props.clickable?.());
    insert(element, () => props.children);
    return element;
  }, {
    Icon: (): null => null,
    Subtitle: (props: any) => part(props, 'row-subtitle'),
    Title: (props: any) => part(props, 'row-title')
  });

  return {default: Row};
});

import BusinessHours from '@components/businessHours';

describe('BusinessHours Solid row', () => {
  let dispose: VoidFunction;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('renders row state declaratively and expands without DOM content mutations', () => {
    const timezoneOffset = -new Date().getTimezoneOffset() * 60;
    dispose = render(() => (
      <BusinessHours
        hours={() => ({timezone_id: 'local', weekly_open: []}) as any}
        timezones={() => [{id: 'local', utc_offset: timezoneOffset}] as any}
      />
    ), document.body);

    const row = document.querySelector<HTMLElement>('.business-hours-container');
    const title = row.querySelector<HTMLElement>('.row-title');

    expect(title.textContent).toContain('BusinessHoursProfileNowOpen');
    expect(title.classList.contains('green')).toBe(true);
    expect(row.textContent).not.toContain('[object Object]');
    expect(row.textContent).not.toContain('true');

    row.click();

    expect(row.classList.contains('is-expanded')).toBe(true);
    expect(row.style.paddingBottom).toBe('64px');
    expect(mocks.observeResize).toHaveBeenCalled();
  });
});
