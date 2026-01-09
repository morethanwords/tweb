import {getRgbColorFromTelegramColor, rgbIntToHex} from '../helpers/color';
import themeController from '../helpers/themeController';
import {PeerColor} from '../layer';
import {getPeerColorsByPeer, makeColorsGradient, getPeerColorIndexByPeer} from '../lib/appManagers/utils/peers/getPeerColorById';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';

export function setPeerColorToElement({
  peerId,
  element,
  messageHighlighting,
  colorAsOut,
  color
}: {
  peerId: PeerId,
  element: HTMLElement,
  messageHighlighting?: boolean,
  colorAsOut?: boolean,
  color?: PeerColor
}) {
  const colorProperty = '--peer-color-rgb';
  const borderBackgroundProperty = '--peer-border-background';
  // if(!peerId) {
  //   element.style.removeProperty(colorProperty);
  //   element.style.removeProperty(borderBackgroundProperty);
  //   return;
  // }

  const peer = apiManagerProxy.getPeer(peerId);
  if(!color && peer?._ === 'user') color = peer.color

  let peerColorRgbValue: string, peerBorderBackgroundValue: string;
  if(messageHighlighting || colorAsOut) {
    const colors = getPeerColorsByPeer(peer);
    const length = colors.length;
    const property = messageHighlighting ? 'message-empty' : 'message-out';
    peerColorRgbValue = `var(--${property}-primary-color-rgb)`;
    peerBorderBackgroundValue = `var(--${property}-peer-${Math.max(1, length)}-border-background)`;
  } else if(color?._ === 'peerColorCollectible') {
    let colors = color.colors
    let accentColor = color.accent_color
    if(themeController.isNight()) {
      if(color.dark_accent_color) accentColor = color.dark_accent_color
      if(color.dark_colors) colors = color.dark_colors
    }

    peerColorRgbValue = getRgbColorFromTelegramColor(accentColor).join(', ')
    peerBorderBackgroundValue = makeColorsGradient(colors.map(it => rgbIntToHex(it)))
  } else {
    const colorIndex = (color as PeerColor.peerColor)?.color ?? getPeerColorIndexByPeer(peer);
    if(colorIndex === -1) {
      element.style.removeProperty(colorProperty);
      element.style.removeProperty(borderBackgroundProperty);
      return;
    }

    peerColorRgbValue = `var(--peer-${colorIndex}-color-rgb)`;
    peerBorderBackgroundValue = `var(--peer-${colorIndex}-border-background)`;
  }

  element.style.setProperty(colorProperty, peerColorRgbValue);
  element.style.setProperty(borderBackgroundProperty, peerBorderBackgroundValue);
}
