import '@/tests/mocks/chatInputIntegrationUi';
import '@helpers/peerIdPolyfill';
import {afterEach, describe, expect, test, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  datePicker: vi.fn(),
  toastNew: vi.fn()
}));
vi.mock('@components/popups/datePicker', () => ({default: mocks.datePicker}));
vi.mock('@components/toast', async(importOriginal) => ({...await importOriginal<object>(), toastNew: mocks.toastNew}));
vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));

import ChatInput from '@components/chat/input';
import {ChatType} from '@components/chat/chatType';
import showScheduleSendingPopup from '@components/popups/scheduleSendingPopup';
import {SEND_WHEN_ONLINE_TIMESTAMP} from '@appManagers/constants';
import tsNow from '@helpers/tsNow';

afterEach(() => {
  vi.clearAllMocks();
});

describe('scheduling a message for a time already gone', () => {
  test('the picker offers no day before today', () => {
    showScheduleSendingPopup({onPick: vi.fn()});
    const {minDate} = mocks.datePicker.mock.lastCall[0];
    const today = new Date();
    expect(minDate.getFullYear()).toBe(today.getFullYear());
    expect(minDate.getMonth()).toBe(today.getMonth());
    expect(minDate.getDate()).toBe(today.getDate());
  });

  test('a past time keeps the picker open and is told; a future one is taken', () => {
    const onPick = vi.fn();
    showScheduleSendingPopup({onPick});
    const picker = mocks.datePicker.mock.lastCall[0];

    // * an hour ago, and the very minute now: neither is a time to come
    expect(picker.onPick(tsNow(true) - 3600)).toBe(false);
    expect(picker.onPick(tsNow(true))).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Schedule.TimeInPast'});

    const later = tsNow(true) + 3600;
    expect(picker.onPick(later)).not.toBe(false);
    expect(onPick).toHaveBeenCalledWith(later, undefined, false);
  });

  test('a past time sends nothing now, a time to come and "when online" are sent with it', () => {
    const callback = vi.fn();
    const host = Object.assign(Object.create(ChatInput.prototype), {
      chat: {type: ChatType.Scheduled, peerId: 42},
      getMiddleware: () => () => true
    });

    host.setScheduleTimestamp(tsNow(true) - 60, callback);
    expect(callback).not.toHaveBeenCalled();
    expect(host.scheduleDate).toBeUndefined();
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Schedule.TimeInPast'});

    const later = tsNow(true) + 3600;
    host.setScheduleTimestamp(later, callback);
    expect(callback).toHaveBeenCalledOnce();
    expect(host.scheduleDate).toBe(later);

    host.setScheduleTimestamp(SEND_WHEN_ONLINE_TIMESTAMP, callback);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(host.scheduleDate).toBe(SEND_WHEN_ONLINE_TIMESTAMP);
  });
});
