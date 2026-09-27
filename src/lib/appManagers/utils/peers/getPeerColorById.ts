import {getHexColorFromTelegramColor, hexToRgb, hexaToHsla} from '@helpers/color';
import clamp from '@helpers/number/clamp';
import themeController from '@helpers/themeController';
import {Chat, HelpPeerColorOption, HelpPeerColorSet, PeerColor, User} from '@layer';

const DialogColorsFg: Array<string[]> = [['#CC5049'], ['#D67722'], ['#955CDB'], ['#40A920'], ['#309EBA'], ['#368AD1'], ['#C7508B']],
  DialogColors = ['red', 'orange', 'violet', 'green', 'cyan', 'blue', 'pink'] as const;

const _DialogColorsFg = DialogColorsFg;

export function getPeerColorIndexById(peerId: UserId | ChatId) {
  return Math.abs(+peerId) % 7;
}

export function getPeerAvatarColorByPeer(peer: Chat | User) {
  let idx = getPeerColorIndexByPeer(peer);
  if(idx === -1) {
    return;
  }

  let color = DialogColors[idx];
  if(!color) {
    const fgColor = DialogColorsFg[idx];
    if(!fgColor) {
      return DialogColors[getPeerColorIndexById(peer.id)];
    }

    const hsla = hexaToHsla(fgColor[0]);
    const hue = hsla.h;

    if(hue >= 345 || hue < 29) idx = 0; // red
    else if(hue < 67) idx = 1; // orange
    else if(hue < 140) idx = 3; // green
    else if(hue < 199) idx = 4; // cyan
    else if(hue < 234) idx = 5; // blue
    else if(hue < 301) idx = 2; // violet
    else idx = 6; // pink

    color = DialogColors[idx];
  }

  return color;
}

export function getPeerColorIndexByPeer(peer: Chat | User) {
  if(!peer) return -1;
  const peerColor = (peer as User.user).color;
  return (peerColor as PeerColor.peerColor)?.color ?? getPeerColorIndexById(peer.id);
}

// * a collectible colour's accent and strip for the current theme
export function getCollectibleColors(color: PeerColor.peerColorCollectible) {
  const isNight = themeController.isNight();
  return {
    accentColor: isNight && color.dark_accent_color || color.accent_color,
    colors: isNight && color.dark_colors?.length ? color.dark_colors : color.colors
  };
}

// * How many stripes (1–3) the peer's reply bar has. An outgoing bubble keeps the count and paints
// * it in its own colour; a collectible colour brings its own strip (tdesktop's collectiblePatternIndex)
export function getPeerColorStripesCount(peer: Chat | User, color?: PeerColor) {
  color ??= (peer as User.user)?.color;
  if(color?._ === 'peerColorCollectible') {
    return clamp(getCollectibleColors(color).colors.length, 1, 3);
  }

  const colorIndex = (color as PeerColor.peerColor)?.color ?? getPeerColorIndexByPeer(peer);
  return clamp(DialogColorsFg[colorIndex]?.length ?? 1, 1, 3);
}

function replaceColors(writeIn: typeof DialogColorsFg, peerColorOptions: HelpPeerColorOption[], dark?: boolean) {
  for(const peerColorOption of peerColorOptions) {
    const colorSet = (dark ? peerColorOption.dark_colors : peerColorOption.colors) as HelpPeerColorSet.helpPeerColorSet;
    const colors = colorSet?.colors;
    if(!colors?.length) {
      continue;
    }

    const c = colors.map((color) => getHexColorFromTelegramColor(color));
    writeIn[peerColorOption.color_id] = c;
  }

  return writeIn;
}

export function makeColorsGradient(colors: string[], partSize?: number) {
  const length = colors.length;
  partSize ||= 5;
  if(length !== 3) {
    colors = colors.slice().reverse();
  }

  const str = colors.map((color, idx, arr) => {
    // const startPercents = +(idx * 100 / arr.length).toFixed(2);
    // const endPercents = +((idx + 1) * 100 / arr.length).toFixed(2);
    const startValue = idx * partSize + 'px';
    const endValue = (idx + 1) * partSize + 'px';
    return [
      `${color} ${startValue}`,
      `${color} ${endValue}`
    ].join(', ');
  }).join(', ');
  return `repeating-linear-gradient(-45deg, ${str})`;
}

let themeScopedStyle: HTMLStyleElement;

export function setPeerColors(peerColorOptions: HelpPeerColorOption[], user: User.user) {
  let newColors = replaceColors(_DialogColorsFg.slice(), peerColorOptions);
  if(themeController.isNight()) {
    newColors = replaceColors(newColors, peerColorOptions, true);
  }
  DialogColorsFg.splice(0, DialogColorsFg.length, ...newColors);

  newColors.forEach((colors, index) => {
    const peerProperty = `--peer-${index}`;
    const borderBackgroundProperty = `${peerProperty}-border-background`;
    const colorRgbProperty = `${peerProperty}-color-rgb`;
    document.documentElement.style.setProperty(colorRgbProperty, hexToRgb(colors[0]).join(','));
    if(colors.length > 1) {
      const gradient = makeColorsGradient(colors);
      document.documentElement.style.setProperty(
        borderBackgroundProperty,
        gradient
      );
    } else {
      document.documentElement.style.removeProperty(borderBackgroundProperty);
    }
  });

  setMyPeerColor(user);
}

// * My own colour's stripes on everything I write: outgoing bubbles and the composer's quotes.
// * Called again whenever my user changes, so a newly set (e.g. collectible) colour applies at once
export function setMyPeerColor(user: User.user) {
  const myStripesCount = getPeerColorStripesCount(user);
  const properties: [string, string, number][] = [
    ['--peer-border-background', '--primary-color', myStripesCount],
    ['--message-out-peer-border-background', '--message-out-primary-color', myStripesCount],
    ['--message-out-peer-1-border-background', '--message-out-primary-color', 1],
    ['--message-out-peer-2-border-background', '--message-out-primary-color', 2],
    ['--message-out-peer-3-border-background', '--message-out-primary-color', 3],
    ['--message-empty-peer-1-border-background', '--message-empty-primary-color', 1],
    ['--message-empty-peer-2-border-background', '--message-empty-primary-color', 2],
    ['--message-empty-peer-3-border-background', '--message-empty-primary-color', 3]
  ];

  const declarations = properties.map(([peerProperty, colorProperty, length]) => {
    let borderBackground: string;
    if(length > 1) {
      const colors = [
        `rgba(var(${colorProperty}-rgb), .4)`,
        `rgba(var(${colorProperty}-rgb), .2)`,
        `var(${colorProperty})`
      ];

      if(length === 2) {
        colors.shift();
      }

      borderBackground = makeColorsGradient(colors);
    } else {
      borderBackground = `var(${colorProperty})`;
    }

    return `${peerProperty}: ${borderBackground};`;
  });

  // * These are built from theme variables, and a var() is substituted on the element that
  // * declares the property: children inherit the resolved colour. Declared on the root only,
  // * a chat with its own theme would get the app theme's outgoing colour in its reply bars.
  // * So they go on every element that re-declares the theme (see `.night` / `.chat` in base.scss)
  const textContent = `:root, .night, .chat {${declarations.join('')}}`;
  themeScopedStyle ??= document.head.appendChild(document.createElement('style'));
  if(themeScopedStyle.textContent !== textContent) {
    themeScopedStyle.textContent = textContent;
  }
}
