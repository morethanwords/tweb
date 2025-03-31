import {SEND_PAID_WITH_STARS_DELAY} from '../../../mtproto/mtproto_config';


type PaidMessagesQueueItem = {
  send?: () => void;
  cancel?: () => void;
};

const FALLBACK_TIMEOUT = SEND_PAID_WITH_STARS_DELAY + 2e3;

export default class PaidMessagesQueue {
  private queued = new Map<PeerId, PaidMessagesQueueItem[]>();
  /**
   * In case the client doesn't handle the sending properly
   */
  private fallbackTimeouts = new Map<PeerId, number>();

  add(peerId: PeerId, item: PaidMessagesQueueItem) {
    const queuedForThisPeer = this.queued.get(peerId) || [];
    const timeout = this.fallbackTimeouts.get(peerId);

    self.clearTimeout(timeout);

    queuedForThisPeer.push(item);

    this.queued.set(peerId, queuedForThisPeer);
    this.fallbackTimeouts.set(
      peerId,
      self.setTimeout(() => {
        this.cancelFor(peerId);
      }, FALLBACK_TIMEOUT)
    );
  }

  remove(peerId: PeerId) {
    const timeout = this.fallbackTimeouts.get(peerId);
    self.clearTimeout(timeout);

    this.queued.delete(peerId);
    this.fallbackTimeouts.delete(peerId);
  }

  sendFor(peerId: PeerId) {
    const queuedForThisPeer = this.queued.get(peerId) || [];

    queuedForThisPeer.forEach((item) => {
      item.send?.();
    });

    this.remove(peerId);
  }

  cancelFor(peerId: PeerId) {
    const queuedForThisPeer = this.queued.get(peerId) || [];

    queuedForThisPeer.forEach((item) => {
      item.cancel?.();
    });

    this.remove(peerId);
  }
}
