import {FontFamily} from '../config/font';
import type {AppManagers} from '../lib/appManagers/managers';
import {getPeerAvatarColorByPeer} from '../lib/appManagers/utils/peers/getPeerColorById';
import getAbbreviation from '../lib/richTextProcessor/getAbbreviation';
import drawCircle from './canvas/drawCircle';
import customProperties from './dom/customProperties';

let avatarCanvas: HTMLCanvasElement;
let avatarContext: CanvasRenderingContext2D;
let avatarGradients: Record<string, CanvasGradient>;

export default async function createNotificationImage(
  managers: AppManagers,
  peerId: PeerId,
  peerTitle: string
) {
  const peerPhoto = await managers.appPeersManager.getPeerPhoto(peerId);
  if(peerPhoto) {
    const url = await managers.appAvatarsManager.loadAvatar(peerId, peerPhoto, 'photo_small');
    return url;
  }

  if(!avatarCanvas) {
    avatarCanvas = document.createElement('canvas');
    avatarContext = avatarCanvas.getContext('2d');

    const SIZE = 54;
    const dpr = 1;
    avatarCanvas.dpr = dpr;
    avatarCanvas.width = avatarCanvas.height = SIZE * dpr;

    avatarGradients = {};
  } else {
    avatarContext.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height);
  }

  const peer = await managers.appPeersManager.getPeer(peerId);
  const color = getPeerAvatarColorByPeer(peer);
  let gradient = avatarGradients[color];
  if(!gradient) {
    gradient = avatarGradients[color] = avatarContext.createLinearGradient(avatarCanvas.width / 2, 0, avatarCanvas.width / 2, avatarCanvas.height);

    const colorTop = customProperties.getProperty(`peer-avatar-${color}-top`);
    const colorBottom = customProperties.getProperty(`peer-avatar-${color}-bottom`);
    gradient.addColorStop(0, colorTop);
    gradient.addColorStop(1, colorBottom);
  }

  avatarContext.fillStyle = gradient;

  drawCircle(avatarContext, avatarCanvas.width / 2, avatarCanvas.height / 2, avatarCanvas.width / 2);
  avatarContext.fill();

  const fontSize = 20 * avatarCanvas.dpr;
  const abbreviation = getAbbreviation(peerTitle);

  avatarContext.font = `700 ${fontSize}px ${FontFamily}`;
  avatarContext.textBaseline = 'middle';
  avatarContext.textAlign = 'center';
  avatarContext.fillStyle = 'white';
  avatarContext.fillText(abbreviation.text, avatarCanvas.width / 2, avatarCanvas.height * (window.devicePixelRatio > 1 || true ? .5625 : .5));

  return avatarCanvas.toDataURL();
}
