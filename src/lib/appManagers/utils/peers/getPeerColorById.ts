import {hexToRgb} from '../../../../helpers/color';
import themeController from '../../../../helpers/themeController';
import {Chat, User} from '../../../../layer';
import type {MTAppConfig} from '../../../mtproto/appConfig';

const DialogColorsFg: Array<string[]> = [['#CC5049'], ['#D67722'], ['#955CDB'], ['#40A920'], ['#309EBA'], ['#368AD1'], ['#C7508B']],
  DialogColors = ['red', 'orange', 'violet', 'green', 'cyan', 'blue', 'pink'] as const;

const _DialogColorsFg = DialogColorsFg,
  _DialogColors = DialogColors;

export function getPeerColorIndexById(peerId: UserId | ChatId) {
  return Math.abs(+peerId) % 7;
}

export default function getPeerColorById(peerId: PeerId, pic = true) {
  if(!peerId) return '';

  const idx = getPeerColorIndexById(peerId);
  const colors = (pic ? DialogColors : DialogColorsFg)[idx];
  return colors[0];
}

export function getPeerColorIndexByPeer(peer: Chat | User) {
  const colorIndex = (peer as User.user).color;
  return colorIndex ?? getPeerColorIndexById(peer.id);
}

export function getPeerColorsByPeer(peer: Chat | User) {
  const colorIndex = getPeerColorIndexByPeer(peer);
  return DialogColorsFg[colorIndex];
}

function replaceColors(writeIn: typeof DialogColorsFg, colors: MTAppConfig['peer_colors']) {
  for(const index in colors) {
    const c = colors[index].map((color) => '#' + color);
    writeIn[+index] = c;
  }

  return writeIn;
}

export function makeColorsGradient(colors: string[]) {
  const str = colors.map((color, idx, arr) => {
    const startPercents = +(idx * 100 / arr.length).toFixed(2);
    const endPercents = +((idx + 1) * 100 / arr.length).toFixed(2);
    return [
      `${color} ${startPercents}%`,
      `${color} ${endPercents}%`
    ].join(', ');
  }).join(', ');
  return `linear-gradient(0deg, ${str})`;
}

export function setPeerColors(appConfig: MTAppConfig, user: User.user) {
  const peerColors = appConfig.peer_colors || {};
  const darkPeerColors = appConfig.dark_peer_colors || {};

  let newColors = replaceColors(_DialogColorsFg.slice(), peerColors);
  if(themeController.isNight()) {
    newColors = replaceColors(newColors, darkPeerColors);
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

  // set my peer color
  const myColors = getPeerColorsByPeer(user);
  const properties: [string, string, number][] = [
    ['--peer-border-background', '--primary-color', myColors.length],
    ['--message-out-peer-border-background', '--message-out-primary-color', myColors.length],
    ['--message-empty-peer-1-border-background', '--message-empty-primary-color', 1],
    ['--message-empty-peer-2-border-background', '--message-empty-primary-color', 2],
    ['--message-empty-peer-3-border-background', '--message-empty-primary-color', 3]
  ];

  properties.forEach(([peerProperty, colorProperty, length]) => {
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

    document.documentElement.style.setProperty(peerProperty, borderBackground);
  });

  console.log('setPeerColors', appConfig, DialogColorsFg);
}
