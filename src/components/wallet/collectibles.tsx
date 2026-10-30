/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {For, JSX, onCleanup, onMount, Show} from 'solid-js';
import type {WalletNftItem, WebDocument} from '@layer';
import wrapPhoto from '@components/wrappers/photo';
import {IconTsx} from '@components/iconTsx';
import {getMiddleware} from '@helpers/middleware';
import Modes from '@config/modes';
import classNames from '@helpers/string/classNames';
import {i18n} from '@lib/langPack';
import {classifyWalletNft, getWalletNftCollection, getWalletNftGiftLook, splitWalletNftNumber} from '@lib/wallet/nftKind';
import {walletNftName} from '@components/wallet/format';
import styles from '@components/wallet/collectibles.module.scss';
import giftStyles from '@components/stargifts/stargiftsGrid.module.scss';

/**
 * A collectible's picture from its web document, or a placeholder when it has none the client may show: a
 * no-proxy document is none (lib/wallet/nftKind.ts).
 */
export function WalletNftImage(props: {
  document?: WebDocument,
  size: number,
  class?: string,
  /** what stands for a missing picture: a gift by default */
  placeholder?: JSX.Element
}) {
  let container: HTMLDivElement;
  const document = () => props.document?._ === 'webDocument' ? props.document : undefined;
  onMount(() => {
    const photo = document();
    if(!photo) return;
    const middleware = getMiddleware();
    onCleanup(() => middleware.destroy());
    // * a picture not in the cache yet fades in over the placeholder (iOS: the image node's first update)
    wrapPhoto({
      container,
      photo: photo as any,
      boxWidth: props.size,
      boxHeight: props.size,
      middleware: middleware.get(),
      withoutPreloader: true,
      size: {_: 'photoSizeEmpty', type: ''}
    });
  });

  return (
    <div ref={container} class={classNames(styles.image, props.class)}>
      <Show when={!document()}>
        {props.placeholder ?? <IconTsx icon="gift" class={styles.placeholder} />}
      </Show>
    </div>
  );
}

/** The picture to show: the big one or the small one first, whichever of them the client may fetch */
export function walletNftPicture(item: Pick<WalletNftItem, 'image' | 'image_small'>, small?: boolean) {
  const documents = small ? [item.image_small, item.image] : [item.image, item.image_small];
  return documents.find((document) => document?._ === 'webDocument');
}

/** A collectible's name, its trailing `#N` in the secondary colour (iOS); it reads in its own direction */
export function WalletNftName(props: {item: {name?: string, address: string}}) {
  const parts = () => splitWalletNftNumber(walletNftName(props.item));
  return (
    <span dir="auto">
      {parts()[0]}
      <Show when={parts()[1]}>
        <span class={styles.number}>{parts()[1]}</span>
      </Show>
    </span>
  );
}

/**
 * What the collectible is, under its name (tdesktop's `CollectibleSubtitleText`): a username or a number by its
 * collection, a gift by its model and backdrop, anything else by the collection its metadata names (iOS), or as
 * a collectible.
 */
export function walletNftKindText(item: WalletNftItem): JSX.Element {
  const {kind} = classifyWalletNft(item);
  if(kind === 'username') return i18n('Wallet.Collectible.Kind.Username');
  if(kind === 'number') return i18n('Wallet.Collectible.Kind.Number');
  const look = kind === 'gift' && getWalletNftGiftLook(item);
  if(look) return i18n('Wallet.Collectible.GiftAttributes', [look.model, look.backdrop]);
  return getWalletNftCollection(item).name || i18n('Wallet.Collectible.Title');
}

export function WalletCollectibles(props: {items: WalletNftItem[], onOpen: (item: WalletNftItem) => void}) {
  return (
    <div class={classNames(giftStyles.grid, styles.grid)}>
      <For each={props.items}>{(item) => (
        <button
          type="button"
          class={classNames(giftStyles.gridItem, styles.item)}
          tabIndex={Modes.a11y ? undefined : -1}
          onClick={() => props.onOpen(item)}
        >
          <WalletNftImage document={walletNftPicture(item, true)} size={90} class={giftStyles.itemSticker} />
          <span class={styles.text}>
            <span class={styles.name}><WalletNftName item={item} /></span>
            <span class={styles.kind}>{walletNftKindText(item)}</span>
          </span>
        </button>
      )}</For>
    </div>
  );
}
