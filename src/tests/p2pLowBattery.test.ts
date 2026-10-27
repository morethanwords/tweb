/*
 * The low-battery flag a 1-on-1 call sends in its MediaState (p2P/lowBattery):
 * below 10% and not charging, as Telegram iOS reports it.
 */
import {describe, expect, it, vi} from 'vitest';
import watchLowBattery, {isBatteryLevelLow} from '@lib/calls/p2P/lowBattery';

function makeBattery(level: number, charging: boolean) {
  return Object.assign(new EventTarget(), {level, charging});
}

describe('P2P low battery', () => {
  it('is below 10% and not charging', () => {
    expect(isBatteryLevelLow({level: 0.09, charging: false})).toBe(true);
    expect(isBatteryLevelLow({level: 0.1, charging: false})).toBe(false);
    expect(isBatteryLevelLow({level: 0.05, charging: true})).toBe(false);
  });

  it('reports changes until unsubscribed', async() => {
    const battery = makeBattery(0.5, false);
    const onChange = vi.fn();
    const stop = watchLowBattery(onChange, async() => battery);
    await Promise.resolve();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();

    battery.level = 0.05;
    battery.dispatchEvent(new Event('levelchange'));
    expect(onChange).toHaveBeenLastCalledWith(true);

    battery.charging = true;
    battery.dispatchEvent(new Event('chargingchange'));
    expect(onChange).toHaveBeenLastCalledWith(false);

    stop();
    battery.charging = false;
    battery.dispatchEvent(new Event('chargingchange'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('reports a battery that is already low', async() => {
    const onChange = vi.fn();
    watchLowBattery(onChange, async() => makeBattery(0.03, false));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
  });

  it('stays quiet where the Battery Status API is missing or late', async() => {
    const onChange = vi.fn();
    watchLowBattery(onChange, undefined)();

    const stop = watchLowBattery(onChange, async() => makeBattery(0.03, false));
    stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
  });
});
