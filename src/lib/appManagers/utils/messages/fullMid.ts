import type {Message} from '@layer';

/** A message's identity across peers: its peer id and its mid in one key. */
export type FullMid = `${PeerId}_${number}`;

export function makeFullMid(peerId: PeerId | Message.message | Message.messageService, mid?: number): FullMid {
  if(typeof(peerId) === 'object') {
    mid = peerId.mid;
    peerId = peerId.peerId;
  }

  return `${peerId}_${mid}`;
}

export function splitFullMid(fullMid: FullMid) {
  const [peerId, mid] = fullMid.split('_');
  return {peerId: peerId.toPeerId(), mid: +mid};
}
