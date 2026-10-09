/*
 * The "battery is low" flag of the MediaState a 1-on-1 call sends, so the
 * peer can show it (and keep its own video demands modest).
 *
 * Telegram iOS calls the battery low below 10% while not charging
 * (TelegramCallsUI PresentationCall.swift batteryLevelIsLowSignal). The
 * browser counterpart is the Battery Status API — Chromium only; elsewhere the
 * flag simply stays false.
 */

import noop from '@helpers/noop';

export const LOW_BATTERY_LEVEL = 0.1;

type BatteryLike = EventTarget & {level: number, charging: boolean};

export function isBatteryLevelLow(battery: Pick<BatteryLike, 'level' | 'charging'>) {
  return battery.level >= 0 && battery.level < LOW_BATTERY_LEVEL && !battery.charging;
}

/**
 * Calls `onChange` with the current flag once it is known (only when it is
 * low) and on every change after that. Returns the unsubscribe.
 */
export default function watchLowBattery(
  onChange: (isLow: boolean) => void,
  getBattery: (() => Promise<BatteryLike>) | undefined = typeof(navigator) !== 'undefined' &&
    typeof((navigator as Navigator & {getBattery?: unknown}).getBattery) === 'function' ?
    () => (navigator as Navigator & {getBattery: () => Promise<BatteryLike>}).getBattery() :
    undefined
): () => void {
  if(!getBattery) {
    return noop;
  }

  let battery: BatteryLike | undefined;
  let isDisposed = false;
  let isLow = false;
  const update = () => {
    const value = isBatteryLevelLow(battery);
    if(value !== isLow) {
      isLow = value;
      onChange(value);
    }
  };

  getBattery().then((result) => {
    if(isDisposed || !result) return;
    battery = result;
    battery.addEventListener('levelchange', update);
    battery.addEventListener('chargingchange', update);
    update();
  }).catch(noop);

  return () => {
    isDisposed = true;
    battery?.removeEventListener('levelchange', update);
    battery?.removeEventListener('chargingchange', update);
  };
}
