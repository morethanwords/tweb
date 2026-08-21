import {describe, expect, test} from 'vitest';
import {
  getRowIconBackground,
  getRowIconBackgroundColor,
  getRowIconBackgroundImage,
  ROW_ICON_COLOR_BY_NAME,
  ROW_ICON_COLORS
} from '@helpers/rowIconBackground';

describe('getRowIconBackground', () => {
  test('bakes the Figma plus-lighter overlay into a two-stop gradient', () => {
    expect(getRowIconBackground('#7E57C2')).toBe(
      'linear-gradient(180deg, #a27be6 0%, #7e57c2 100%)'
    );
  });

  test('adds a stop when plus-lighter clips an RGB channel', () => {
    expect(getRowIconBackground('#2196F3')).toBe(
      'linear-gradient(180deg, #45baff 0%, #2da2ff 66.3866%, #2196f3 100%)'
    );
  });
});

describe('getRowIconBackgroundColor', () => {
  test('uses the registered color for a known icon name', () => {
    expect(ROW_ICON_COLOR_BY_NAME.phone_filled).toBe('green');
    expect(getRowIconBackgroundColor('phone_filled')).toBe(ROW_ICON_COLORS.green);
  });

  test('uses the colors assigned in the Figma Settings section', () => {
    expect(ROW_ICON_COLOR_BY_NAME.birthday_filled).toBe('purple');
    expect(ROW_ICON_COLOR_BY_NAME.data_filled).toBe('green');
    expect(ROW_ICON_COLOR_BY_NAME.data_transfer_filled).toBe('blue');
    expect(ROW_ICON_COLOR_BY_NAME.devices_filled).toBe('blue');
    expect(ROW_ICON_COLOR_BY_NAME.email_filled).toBe('purple');
    expect(ROW_ICON_COLOR_BY_NAME.general_filled).toBe('grey');
    expect(ROW_ICON_COLOR_BY_NAME.keyboard_filled).toBe('orange');
    expect(ROW_ICON_COLOR_BY_NAME.lamp_filled).toBe('purple');
    expect(ROW_ICON_COLOR_BY_NAME.limit_folders_filled).toBe('blue');
    expect(ROW_ICON_COLOR_BY_NAME.mention_filled).toBe('blue');
    expect(ROW_ICON_COLOR_BY_NAME.policy_filled).toBe('green');
    expect(ROW_ICON_COLOR_BY_NAME.premium_lock_filled).toBe('grey');
    expect(ROW_ICON_COLOR_BY_NAME.speaker_filled).toBe('green');
    expect(ROW_ICON_COLOR_BY_NAME.topics_filled).toBe('purple');
  });

  test('maps an icon name to a stable color from the prepared palette', () => {
    const color = getRowIconBackgroundColor('data');

    expect(color).toBe(getRowIconBackgroundColor('data'));
    expect(Object.values(ROW_ICON_COLORS)).toContain(color);
  });

  test('uses the icon name when choosing a fallback color', () => {
    expect(getRowIconBackgroundColor('data')).not.toBe(
      getRowIconBackgroundColor('edit')
    );
  });
});

describe('getRowIconBackgroundImage', () => {
  test('reuses the global premium gradient for the premium icon', () => {
    expect(ROW_ICON_COLOR_BY_NAME.premium_badge).toBeUndefined();
    expect(getRowIconBackgroundImage('premium_badge')).toBe('var(--premium-gradient)');
  });
});
