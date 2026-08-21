import {describe, expect, it} from 'vitest';
import getSessionPlatformIcon from '@helpers/sessionPlatformIcon';
import {Authorization} from '@layer';

function makeAuthorization(overrides: Partial<Authorization.authorization> = {}): Authorization.authorization {
  return {
    _: 'authorization',
    pFlags: {},
    hash: 1,
    device_model: '',
    platform: '',
    system_version: '',
    api_id: 0,
    app_name: '',
    app_version: '',
    date_created: 0,
    date_active: 0,
    ip: '127.0.0.1',
    country: 'UAE',
    region: 'Dubai',
    ...overrides
  };
}

describe('session platform icon', () => {
  it('picks the desktop OS by platform, not by the api_id alone', () => {
    const desktop = (platform: string) => getSessionPlatformIcon(makeAuthorization({
      api_id: 2040,
      app_name: 'Telegram Desktop',
      platform
    }));

    expect(desktop('Windows')).toBe('win_key_filled');
    expect(desktop('macOS')).toBe('apple_filled');
    expect(desktop('Ubuntu')).toBe('ubuntu_filled');
    expect(desktop('Linux')).toBe('linux_filled');
    // tdesktop falls back to Linux for its own api_id when nothing matches
    expect(desktop('')).toBe('linux_filled');
  });

  it('tells the two web clients apart by app name', () => {
    const web = (app_name: string, app_version = '') => getSessionPlatformIcon(makeAuthorization({
      api_id: 2496,
      app_name,
      app_version,
      device_model: 'Chrome'
    }));

    expect(web('Telegram WebK', '2.2')).toBe('web_k_filled');
    expect(web('Telegram Web K')).toBe('web_k_filled');
    expect(web('Telegram Web A')).toBe('web_a_filled');
    // the server puts the flavour letter in the version for some sessions
    expect(web('Telegram Web', '2.2 K')).toBe('web_k_filled');
    expect(web('Telegram Web', '1.0')).toBe('web_filled');
    expect(web('Telegram Web')).toBe('web_filled');
  });

  it('recognises a browser session from an unlisted api_id', () => {
    expect(getSessionPlatformIcon(makeAuthorization({
      api_id: 424242,
      app_name: 'Unofficial',
      device_model: 'Firefox 130'
    }))).toBe('web_filled');
  });

  it('recognises mobile clients', () => {
    expect(getSessionPlatformIcon(makeAuthorization({
      api_id: 6,
      app_name: 'Telegram Android',
      device_model: 'Pixel 8',
      platform: 'Android'
    }))).toBe('android_filled');

    expect(getSessionPlatformIcon(makeAuthorization({
      api_id: 1,
      app_name: 'Telegram iOS',
      device_model: 'iPhone 15 Pro',
      platform: 'iOS'
    }))).toBe('apple_filled');

    expect(getSessionPlatformIcon(makeAuthorization({
      api_id: 424242,
      app_name: 'Unofficial',
      device_model: 'iPad Pro'
    }))).toBe('apple_filled');
  });

  it('reads the OS out of system_version when the platform is empty', () => {
    expect(getSessionPlatformIcon(makeAuthorization({
      api_id: 424242,
      app_name: 'Unofficial',
      device_model: 'PC',
      system_version: 'Windows 11'
    }))).toBe('win_key_filled');
  });

  it('falls back to the generic device icon', () => {
    expect(getSessionPlatformIcon(makeAuthorization({
      api_id: 424242,
      app_name: 'Unofficial',
      device_model: 'Chromebook'
    }))).toBe('devices_filled');

    expect(getSessionPlatformIcon(makeAuthorization({api_id: 424242}))).toBe('devices_filled');
  });
});
