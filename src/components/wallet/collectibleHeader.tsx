/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, JSX, onCleanup, onMount, Show} from 'solid-js';
import type {WalletNftItem, WebDocument} from '@layer';
import type LottiePlayer from '@lib/lottie/lottiePlayer';
import MediaHeader from '@components/mediaHeader';
import A11yButton from '@components/a11yButton';
import {IconTsx} from '@components/iconTsx';
import appDownloadManager from '@lib/appDownloadManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import lottieLoader from '@lib/lottie/lottieLoader';
import I18n from '@lib/langPack';
import Modes from '@config/modes';
import liteMode from '@helpers/liteMode';
import blobConstruct from '@helpers/blob/blobConstruct';
import {getMiddleware, Middleware} from '@helpers/middleware';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';
import classNames from '@helpers/string/classNames';
import {getWalletNftCollection, getWalletNftLottie, WALLET_NFT_LOTTIE_MAX_SIZE} from '@lib/wallet/nftKind';
import {WalletNftImage, WalletNftName, walletNftPicture} from '@components/wallet/collectibles';
import styles from '@components/wallet/collectibleHeader.module.scss';

/** The picture's side, as in iOS's collectible header */
export const WALLET_COLLECTIBLE_MEDIA_SIZE = 164;

const isGzip = (bytes: Uint8Array) => bytes[0] === 0x1f && bytes[1] === 0x8b;

/** `{` past a byte order mark and whitespace: a JSON object, the only thing a lottie can be */
function isJsonObject(bytes: Uint8Array) {
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while(bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d) {
    ++i;
  }

  return bytes[i] === 0x7b;
}

/**
 * The collectible's animation through the server's proxy, unpacked when it came gzipped, no bigger than the
 * client shows either way (iOS `walletCollectibleLottieData`); played once over the picture.
 */
async function loadWalletNftLottie(document: WebDocument, container: HTMLElement, size: number, middleware: Middleware) {
  const blob = await appDownloadManager.downloadMedia({media: document});
  if(!middleware() || !blob || blob.size > WALLET_NFT_LOTTIE_MAX_SIZE) {
    return;
  }

  const buffer = await blob.arrayBuffer();
  let bytes: Uint8Array = new Uint8Array(buffer);
  if(isGzip(bytes)) {
    bytes = await apiManagerProxy.invokeCrypto('gzipUncompress', buffer, false, WALLET_NFT_LOTTIE_MAX_SIZE) as Uint8Array;
  }

  if(!middleware() || !isJsonObject(bytes)) {
    return;
  }

  return lottieLoader.loadAnimationWorker({
    container,
    animationData: blobConstruct(bytes, 'application/json'),
    width: size,
    height: size,
    loop: false,
    autoplay: true,
    name: 'wallet_nft_' + document.url,
    group: 'none',
    needUpscale: true,
    liteModeKey: 'animations',
    middleware
  });
}

/**
 * The collectible's picture, its animation over it when it has one: played once as it shows, a click plays it
 * again (iOS `WalletCollectibleHeaderComponent`).
 */
export function WalletCollectibleMedia(props: {item: WalletNftItem, size?: number, class?: string}) {
  const size = props.size ?? WALLET_COLLECTIBLE_MEDIA_SIZE;
  const lottie = getWalletNftLottie(props.item);
  let lottieContainer: HTMLElement;
  const [player, setPlayer] = createSignal<LottiePlayer>();

  onMount(() => {
    if(!lottie) return;
    const middleware = getMiddleware();
    onCleanup(() => middleware.destroy());
    // * nothing to show for a failed animation: the picture under it stays
    loadWalletNftLottie(lottie, lottieContainer, size, middleware.get()).then((value) => {
      setPlayer(value || undefined);
    }, () => {});
  });

  // * once there is an animation to play and the interface animates
  const playable = () => !!player() && liteMode.isAvailable('animations');
  const replay = () => {
    if(playable()) {
      player().playOrRestart();
    }
  };

  return (
    <div class={classNames(styles.media, props.class)} style={{'--wallet-collectible-size': size + 'px'}}>
      <WalletNftImage document={walletNftPicture(props.item)} size={size} class={styles.image} />
      <Show when={lottie}>
        {/* * the animation over the picture is a button that plays it again — to the keyboard and assistive
          * technology too, once it can play; its canvas is decoration */}
        <A11yButton
          as="div"
          ref={lottieContainer}
          class={styles.lottie}
          role="button"
          aria-label={I18n.format('Wallet.Collectible.PlayAnimation', true)}
          aria-hidden={!playable() || undefined}
          disabled={!playable()}
          onClick={replay}
        />
      </Show>
    </div>
  );
}

/** The collectible's name, two lines at most, its `#N` in the secondary colour */
export function WalletCollectibleTitle(props: {item: WalletNftItem}) {
  return (
    <MediaHeader.Title size={20} class={styles.title}>
      <WalletNftName item={props.item} />
    </MediaHeader.Title>
  );
}

/**
 * The collection the metadata names, under the title: a link with a chevron when it has a page on Fragment.
 * `fallback` takes its place for an item that names none.
 */
export function WalletCollectibleCollection(props: {item: WalletNftItem, fallback?: JSX.Element}) {
  const collection = getWalletNftCollection(props.item);
  return (
    <Show when={collection.name} fallback={props.fallback && <MediaHeader.Subtitle color="secondary">{props.fallback}</MediaHeader.Subtitle>}>
      <MediaHeader.Subtitle color="secondary" class={styles.collection}>
        <Show when={collection.url} fallback={<span dir="auto">{collection.name}</span>}>
          <a
            class={styles.collectionLink}
            href={collection.url}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={Modes.a11y ? undefined : -1}
            onClick={(e) => {
              e.preventDefault();
              safeWindowOpen(collection.url);
            }}
          >
            <span class={styles.collectionName} dir="auto">{collection.name}</span>
            <IconTsx icon="next" class={styles.chevron} aria-hidden="true" />
          </a>
        </Show>
      </MediaHeader.Subtitle>
    </Show>
  );
}

/**
 * A collectible at the top of a screen (iOS `WalletCollectibleHeaderComponent`): its picture or animation,
 * 164 px with rounded corners, its name, and the collection it belongs to. Usernames and numbers leave the
 * collection out (`collection={false}`): theirs is said by what they are.
 */
export default function WalletCollectibleHeader(props: {
  item: WalletNftItem,
  collection?: boolean,
  class?: string,
  children?: JSX.Element
}) {
  return (
    <MediaHeader class={classNames(styles.header, props.class)}>
      <MediaHeader.Sticker
        size={WALLET_COLLECTIBLE_MEDIA_SIZE}
        class={styles.sticker}
        element={() => <WalletCollectibleMedia item={props.item} />}
      />
      <WalletCollectibleTitle item={props.item} />
      <Show when={props.collection ?? true}>
        <WalletCollectibleCollection item={props.item} />
      </Show>
      {props.children}
    </MediaHeader>
  );
}
