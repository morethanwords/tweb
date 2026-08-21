import {
  ColorRgb,
  hexToRgb,
  mixColorsPlusLighter,
  rgbaToHexa
} from '@helpers/color';

const OVERLAY_COLOR: ColorRgb = [255, 255, 255];
const OVERLAY_OPACITY = 0.14;

export const ROW_ICON_COLORS = {
  blue: '#2196F3',
  green: '#4CAF50',
  grey: '#78909C',
  orange: '#FB8C00',
  pink: '#E91E63',
  purple: '#7E57C2',
  red: '#F44336'
} as const;

type RowIconColorName = keyof typeof ROW_ICON_COLORS;

export const ROW_ICON_COLOR_BY_NAME: Partial<Record<Icon, RowIconColorName>> = {
  account_filled: 'blue',
  addmember_filled: 'orange',
  admin_filled: 'green',
  affiliate_filled: 'purple',
  ai_filled: 'purple',
  android_filled: 'green',
  appearance_filled: 'orange',
  apple_filled: 'blue',
  bell_filled: 'red',
  bin_filled: 'red',
  birthday_filled: 'purple',
  bot_filled: 'green',
  business_filled: 'green',
  channel_filled: 'orange',
  checkboxblock: 'red',
  checkboxon: 'blue',
  commentssticker_filled: 'red',
  darkmode_filled: 'purple',
  data_filled: 'green',
  data_transfer_filled: 'blue',
  delete_filled: 'red',
  devices_filled: 'blue',
  email_filled: 'purple',
  eye1_filled: 'orange',
  faq_filled: 'blue',
  gift_filled: 'orange',
  general_filled: 'grey',
  gram_filled: 'blue',
  group_circle_filled: 'blue',
  group_filled: 'green',
  key_filled: 'grey',
  keyboard_filled: 'orange',
  lamp_filled: 'purple',
  limit_file_filled: 'blue',
  limit_folders_filled: 'blue',
  link_filled: 'orange',
  linux_filled: 'orange',
  location: 'red',
  mention_filled: 'blue',
  newchannel_filled: 'orange',
  newprivate_filled: 'blue',
  person_filled: 'blue',
  phone_filled: 'green',
  photo_filled: 'orange',
  pie_chart_filled: 'green',
  plus_circle_filled: 'green',
  policy_filled: 'green',
  premium_avatars_filled: 'pink',
  premium_filesize_filled: 'blue',
  premium_lock_filled: 'grey',
  reactions_filled: 'pink',
  round_chats_filled: 'green',
  saved_filled: 'blue',
  sending: 'orange',
  speaker_filled: 'green',
  star_circle_filled: 'orange',
  statistics_filled: 'purple',
  stories_filled: 'purple',
  tag_alt_filled: 'blue',
  timer_filled: 'orange',
  topics_filled: 'purple',
  two_factor_auth_filled: 'green',
  ubuntu_filled: 'red',
  web_a_filled: 'purple',
  web_filled: 'purple',
  web_k_filled: 'purple',
  win_key_filled: 'blue'
};

const ROW_ICON_COLOR_VALUES = Object.values(ROW_ICON_COLORS);

const hashIconName = (icon: string) => {
  let hash = 0x811c9dc5;

  for(let i = 0; i < icon.length; ++i) {
    hash ^= icon.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
};

const formatOffset = (offset: number) => {
  return `${+(offset * 100).toFixed(4)}%`;
};

export function getRowIconBackgroundColor(icon: Icon) {
  const registeredColor = ROW_ICON_COLOR_BY_NAME[icon];
  return (registeredColor && ROW_ICON_COLORS[registeredColor]) ||
    ROW_ICON_COLOR_VALUES[hashIconName(icon) % ROW_ICON_COLOR_VALUES.length];
}

/**
 * Reproduces the Figma Row icon backdrop without mix-blend-mode.
 *
 * Figma draws a white 100% -> 0% alpha gradient at 14% fill opacity over an
 * opaque base color using plus-lighter. The blend can clip individual RGB
 * channels before the gradient reaches its top edge, so those clipping points
 * are emitted as extra CSS stops instead of approximating the result with two
 * colors.
 */
export function getRowIconBackground(color: string) {
  const backdrop = hexToRgb(color);
  const offsets = new Set([0, 1]);

  backdrop.forEach((value, index) => {
    const maximumAddition = OVERLAY_COLOR[index] * OVERLAY_OPACITY;
    if(!maximumAddition || value + maximumAddition <= 255) {
      return;
    }

    offsets.add(1 - (255 - value) / maximumAddition);
  });

  const stops = [...offsets]
  .sort((a, b) => a - b)
  .map((offset) => {
    const stopColor = mixColorsPlusLighter(
      backdrop,
      OVERLAY_COLOR,
      OVERLAY_OPACITY * (1 - offset)
    );

    return `${rgbaToHexa(stopColor)} ${formatOffset(offset)}`;
  });

  return `linear-gradient(180deg, ${stops.join(', ')})`;
}

export function getRowIconBackgroundImage(icon: Icon) {
  if(icon === 'premium_badge') {
    return 'var(--premium-gradient)';
  }

  return getRowIconBackground(getRowIconBackgroundColor(icon));
}

export function setRowIconBackground(element: HTMLElement, icon: Icon) {
  element.classList.add('row-icon-colored');
  element.style.backgroundImage = getRowIconBackgroundImage(icon);
}
