/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * The transfer cards a gem may fly into: a card this device is sending (the chat's local draft) is found by the
 * draft's random id, the way iOS ChatWalletTransferAnimation matches a flight to its message. Kept apart from the
 * flight itself, which brings the gem's renderer with it, so that the chat's card stays light.
 */

export type WalletChatCardTarget = {
  /** where the card's gem stands, client px, and how wide the gem is there; nothing while it cannot be seen */
  slot: () => {x: number, y: number, width: number} | undefined,
  /** a gem is on its way: the card's own gem steps aside until it lands, or comes back when the flight is off */
  await: (awaiting: boolean) => void,
  /** the gem landed: it is the card's again, and the card takes the hit */
  land: () => void
};

const targets: Map<string, WalletChatCardTarget> = new Map();

export function registerWalletChatCardTarget(randomId: string, target: WalletChatCardTarget) {
  targets.set(randomId, target);
  return () => {
    if(targets.get(randomId) === target) targets.delete(randomId);
  };
}

export function getWalletChatCardTarget(randomId: string) {
  return targets.get(randomId);
}
