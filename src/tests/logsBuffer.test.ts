import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {capture, clearLogBuffer, getLogEntries, setLogBufferEnabled} from '@lib/debug/logsBuffer';
import {LogTypes} from '@lib/logger';
import EventListenerBase from '@helpers/eventListenerBase';

describe('log buffer', () => {
  beforeEach(() => {
    setLogBufferEnabled(true);
    clearLogBuffer();
  });

  afterEach(() => {
    clearLogBuffer();
  });

  it('keeps the app timeline when the networkers flood the buffer', () => {
    capture(LogTypes.Log, '[ACC-1-UPDATES] [processUpdate]', ['before']);
    for(let i = 0; i < 10000; ++i) {
      capture(LogTypes.Debug, '[ACC-1-NET-2-C-0] [scheduleRequest]', ['delay', i]);
    }
    capture(LogTypes.Log, '[ACC-1-MESSAGES]', ['after']);

    const entries = getLogEntries();
    const app = entries.filter((entry) => !entry.prefix.includes('-NET-'));
    expect(app.map((entry) => entry.args[0])).toEqual(['before', 'after']);
    expect(entries.length - app.length).toBe(4000);

    for(let i = 1; i < entries.length; ++i) {
      expect(entries[i].t).toBeGreaterThanOrEqual(entries[i - 1].t);
    }
  });

  it('records a throwing listener and still runs the ones after it', () => {
    const target = new EventListenerBase<{update: (value: number) => void}>();
    const received: number[] = [];
    target.addEventListener('update', () => {
      throw new Error('handler died');
    });
    target.addEventListener('update', (value) => received.push(value));

    target.dispatchEvent('update', 1);

    expect(received).toEqual([1]);
    const error = getLogEntries().find((entry) => entry.prefix === '[EVENTS]');
    expect(error?.level).toBe(LogTypes.Error);
    expect(error?.args[0]).toBe('listener error');
    expect(error?.args[1]).toBe('update');
    expect(error?.args[2]?.message).toBe('handler died');
  });
});
