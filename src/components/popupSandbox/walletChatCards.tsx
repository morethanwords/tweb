/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, For} from 'solid-js';
import {render} from 'solid-js/web';
import type {Message, MessageAction} from '@layer';
import rootScope from '@lib/rootScope';
import WalletChatCard from '@components/wallet/chatCard';
import styles from '@components/popupSandbox/sandbox.module.scss';

/**
 * Gram transfer cards the way a chat shows them, over a plain wallpaper: one of every kind, and two that this
 * device "sends" — one is delivered and one fails a few seconds after the story opens, so their settle plays. The
 * delivered one sends the whole balance: its served message says a little more than the draft's estimate.
 *
 * `scene: 'arrival'`: one incoming transfer comes in while the "chat" is open — it rises in when read and its
 * glyphs lift under the glare. `scene: 'flight'`: a transfer this device sends from the chat — a gem is thrown
 * from the top left into its card (chatCard/flight), as the wallet's amount screen throws it.
 */

const SETTLE_AFTER = 2500;
const ARRIVE_AFTER = 700;
const FLY_AFTER = 600;
const FLIGHT_RANDOM_ID = 'sandbox-flight';

export function mountWalletChatCards(options: {
  peerId: PeerId,
  selfId: PeerId,
  address: string,
  scene?: 'arrival' | 'flight'
}) {
  const {peerId, selfId, address, scene} = options;
  const now = Math.floor(Date.now() / 1000);
  let mid = 1000;
  const transfer = (amount: string, extra: Partial<MessageAction.messageActionGramTransfer> = {}) => ({
    _: 'messageActionGramTransfer',
    pFlags: {},
    amount,
    peer_address: address,
    transaction_id: 'sandbox:' + mid,
    ...extra
  } as MessageAction.messageActionGramTransfer);
  const make = (
    out: boolean,
    action: MessageAction.messageActionGramTransfer,
    flags: Message.messageService['pFlags'] = {},
    pending?: boolean
  ) => ({
    _: 'messageService',
    id: ++mid,
    mid,
    peerId,
    fromId: out ? selfId : peerId,
    peer_id: {_: 'peerUser', user_id: peerId.toUserId()},
    date: now,
    pFlags: {out: out || undefined, ...flags},
    action,
    pending
  } as Message.messageService);

  // * an encrypted comment comes as its bare payload: 96 bytes cover with 32 letters
  const payload = btoa(String.fromCharCode(...new Uint8Array(96)));
  // * the whole balance less the quoted fee: the served message says what arrived, the fee the chain took was smaller
  const delivered = make(true, transfer('24996000000', {transaction_id: ''}), {is_outgoing: true}, true);
  const failing = make(true, transfer('7500000000', {transaction_id: '', comment: 'For the tickets'}), {is_outgoing: true}, true);
  const all: Message.messageService[] = [
    make(false, transfer('1500000000', {comment: 'For the coffee ☕️'}), {unread: true}),
    make(true, transfer('-120000000000')),
    make(false, transfer('3000000000', {comment: payload, pFlags: {comment_encrypted: true}})),
    make(true, transfer('410500000', {transaction_id: ''}), {is_outgoing: true}, true),
    delivered,
    failing
  ];
  const flying = {...make(true, transfer('12500000000', {transaction_id: ''}), {is_outgoing: true}, true), random_id: FLIGHT_RANDOM_ID};
  const [messages, setMessages] = createSignal(scene ? (scene === 'flight' ? [flying] : []) : all);

  const container = document.createElement('div');
  container.className = styles.WalletChatCards;
  container.dataset.walletChatCards = '';
  document.body.append(container);
  const dispose = render(() => (
    <For each={messages()}>{(message) => (
      <div class={styles.WalletChatCard}>
        <WalletChatCard message={message} />
      </div>
    )}</For>
  ), container);

  const timeouts: number[] = [];
  if(scene === 'arrival') {
    // * as the chat gets it: announced first (the card learns it is fresh), rendered after
    timeouts.push(window.setTimeout(() => {
      const arriving = make(false, transfer('2750000000', {comment: 'Lunch'}), {unread: true});
      rootScope.dispatchEvent('history_multiappend', arriving);
      setMessages([arriving]);
    }, ARRIVE_AFTER));
  } else if(scene === 'flight') {
    timeouts.push(window.setTimeout(async() => {
      const [{GemView, Appearance}, {flyWalletGemIntoChat}] = await Promise.all([
        import('@components/wallet/visual/gem/stage'),
        import('@components/wallet/chatCard/flight')
      ]);
      let gem: InstanceType<typeof GemView>;
      try {
        gem = new GemView(document.createElement('canvas'), {appearance: Appearance.blue, rotationSpeed: 2 * Math.PI / 26});
      } catch(err) {
        return;
      }

      flyWalletGemIntoChat({gem, from: [140, 160], width: 32, spin: 2 * Math.PI / 26}, FLIGHT_RANDOM_ID);
      gem.destroy();
    }, FLY_AFTER));
  }

  const timeout = scene ? undefined : window.setTimeout(() => {
    const served = {...delivered, id: delivered.mid + 1e6, mid: delivered.mid + 1e6, pFlags: {out: true as const}, pending: undefined as boolean};
    rootScope.dispatchEvent('message_sent', {
      storageKey: `${peerId}_history`,
      tempId: delivered.mid,
      tempMessage: delivered,
      mid: served.mid,
      message: {...served, action: {...delivered.action, amount: '24997500000', transaction_id: 'sandbox:served'}} as Message.messageService
    });
    rootScope.dispatchEvent('message_error', {
      storageKey: `${peerId}_history`,
      peerId,
      tempId: failing.mid,
      error: {type: 'WALLET_TRANSFER_SEND_FAILED'} as ApiError
    });
  }, SETTLE_AFTER);

  return () => {
    clearTimeout(timeout);
    timeouts.forEach((item) => clearTimeout(item));
    dispose();
    container.remove();
  };
}

/**
 * A message with a TON address in it, the way a chat writes it (wrapRichText marks the address): a click opens the
 * address's menu. The app wires the link's handler in internalLinkProcessor; the sandbox, which never loads it,
 * hands the click straight to the menu.
 */
export async function mountWalletAddressMessage(options: {address: string}) {
  const [{default: wrapRichText}, {default: openTonAddressMenu}] = await Promise.all([
    import('@lib/richTextProcessor/wrapRichText'),
    import('@components/wallet/addressMenu')
  ]);

  const prefix = 'My wallet: ';
  const text = prefix + options.address + '\nSend whenever you can.';
  const handler = 'openTonAddress';
  const ownHandler = !(window as any)[handler];
  if(ownHandler) {
    (window as any)[handler] = (element: HTMLAnchorElement) => {
      window.event?.preventDefault();
      openTonAddressMenu({address: element.textContent, element, event: window.event});
    };
  }

  const container = document.createElement('div');
  container.className = styles.WalletChatCards;
  container.dataset.walletAddressMessage = '';
  const bubble = document.createElement('div');
  bubble.className = styles.WalletAddressMessage;
  bubble.append(wrapRichText(text, {
    entities: [{_: 'messageEntityTonAddress', offset: prefix.length, length: options.address.length}]
  }));
  container.append(bubble);
  document.body.append(container);

  return () => {
    if(ownHandler) delete (window as any)[handler];
    container.remove();
  };
}

/**
 * What a Gram transfer reads like where its card is not, for every kind of transfer: the chat's service line (its
 * fiat in `currency`, the wallet's), the chat list's line with its icon, a notification, and a reaction to one's own
 */
export async function mountWalletChatTexts(options: {
  peerId: PeerId,
  selfId: PeerId,
  address: string,
  currency?: string
}) {
  const [
    {default: wrapMessageActionTextNew},
    {default: wrapMessageForReply},
    {wrapGramTransferReactionText},
    {readWalletCurrency, writeWalletCurrency},
    {SERVICE_PEER_ID}
  ] = await Promise.all([
    import('@components/wrappers/messageActionTextNew'),
    import('@components/wrappers/messageForReply'),
    import('@components/wallet/transferText'),
    import('@components/wallet/fiat'),
    import('@appManagers/constants')
  ]);

  const previousCurrency = readWalletCurrency();
  if(options.currency) writeWalletCurrency(options.currency);

  const {peerId, selfId, address} = options;
  let mid = 2000;
  const make = (out: boolean, amount: string, extra: Partial<MessageAction.messageActionGramTransfer> = {}, chatId = peerId) => ({
    _: 'messageService',
    id: ++mid,
    mid,
    peerId: chatId,
    fromId: out ? selfId : chatId,
    peer_id: {_: 'peerUser', user_id: chatId.toUserId()},
    date: Math.floor(Date.now() / 1000),
    pFlags: {out: out || undefined},
    action: {_: 'messageActionGramTransfer', pFlags: {}, amount, peer_address: address, transaction_id: 'sandbox:' + mid, ...extra}
  } as Message.messageService);

  const payload = btoa(String.fromCharCode(...new Uint8Array(96)));
  const messages = [
    make(false, '1500000000', {comment: 'For the coffee ☕️'}),
    make(true, '-120000000000', {comment: 'Rent\nfor May'}),
    make(false, '3000000000', {comment: payload, pFlags: {comment_encrypted: true}}),
    make(true, '-1234567890000'),
    make(false, '400000', {comment: 'Dust'}, SERVICE_PEER_ID)
  ];

  const container = document.createElement('div');
  container.className = styles.WalletChatCards;
  container.dataset.walletChatTexts = '';
  document.body.append(container);
  for(const message of messages) {
    const action = message.action as MessageAction.messageActionGramTransfer;
    const bubble = document.createElement('div');
    bubble.className = styles.WalletAddressMessage;
    const line = (label: string, content: Node | string) => {
      const row = document.createElement('div');
      const b = document.createElement('b');
      b.append(label + ': ');
      row.append(b, content);
      bubble.append(row);
    };

    line('Chat', await wrapMessageActionTextNew({message}));
    line('List', await wrapMessageForReply({message, compact: 'list'}));
    line('Notification', await wrapMessageForReply({message, plain: true, compact: 'notification'}));
    if(message.pFlags.out) line('Reaction', wrapGramTransferReactionText('❤', action));
    container.append(bubble);
  }

  return () => {
    writeWalletCurrency(previousCurrency);
    container.remove();
  };
}
