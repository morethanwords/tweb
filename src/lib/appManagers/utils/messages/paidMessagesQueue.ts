import {Message} from '../../../../layer';

import {SEND_PAID_WITH_STARS_DELAY} from '../../../mtproto/mtproto_config';


const FALLBACK_TIMEOUT = SEND_PAID_WITH_STARS_DELAY + 2e3;

export default class PaidMessagesQueue {
  queued = new Map<PeerId, Message.message[]>();
  /**
   * In case the client doesn't handle the sending properly
   */
  fallbackTimeouts = new Map<PeerId, number>();

  add(peerId: PeerId, message: Message.message) {
    const queuedForThisPeer = this.queued.get(peerId) || [];
    const timeout = this.fallbackTimeouts.get(peerId);

    self.clearTimeout(timeout);

    queuedForThisPeer.push(message);

    this.queued.set(peerId, queuedForThisPeer);
    this.fallbackTimeouts.set(
      peerId,
      self.setTimeout(() => {
        this.remove(peerId);
      }, FALLBACK_TIMEOUT)
    );
  }

  remove(peerId: PeerId) {
    const timeout = this.fallbackTimeouts.get(peerId);
    self.clearTimeout(timeout);

    this.queued.delete(peerId);
    this.fallbackTimeouts.delete(peerId);
  }

  send(peerId: PeerId) {
    const queuedForThisPeer = this.queued.get(peerId) || [];

    queuedForThisPeer.forEach((message) => {
      message.send?.();
    });

    this.remove(peerId);
  }

  forEachOf(peerId: PeerId, callback: (message: Message.message) => void) {
    (this.queued.get(peerId) || []).forEach(callback);
  }
}
