import {getRgbColorFromTelegramColor, rgbIntToHex} from '@helpers/color';
import {PeerColor} from '@layer';
import {getCollectibleColors, getPeerColorStripesCount, makeColorsGradient, getPeerColorIndexByPeer} from '@appManagers/utils/peers/getPeerColorById';
import apiManagerProxy from '@lib/apiManagerProxy';

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
    const property = messageHighlighting ? 'message-empty' : 'message-out';
    peerColorRgbValue = `var(--${property}-primary-color-rgb)`;
    peerBorderBackgroundValue = `var(--${property}-peer-${getPeerColorStripesCount(peer, color)}-border-background)`;
  } else if(color?._ === 'peerColorCollectible') {
    const {accentColor, colors} = getCollectibleColors(color)
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
